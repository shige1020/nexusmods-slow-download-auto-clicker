// NexusMods Slow Download Auto Clicker
// ------------------------------------
// 目的:
//   - NexusMods のダウンロード画面で「Slow download」を自動的に実行する。
//   - 画面上に通常の <button> がある場合と、Web Components (mod-file-download) 経由の場合の両方をサポートする。
//   - デバッグしやすいように詳細な console.log を出力する。
//
// 前提:
//   - manifest.json 側で少なくとも以下のような matches が設定されていること:
//       "*://www.nexusmods.com/*",
//       "*://next.nexusmods.com/*",
//       "*://downloads.nexusmods.com/*"
//     ＋ "all_frames": true を付けておくと、iframe 内でも動作しやすい。
//   - コンテンツスクリプトは isolated world で動作するが、DOM の要素に対する
//     click()/dispatchEvent() はページ側のリスナーにも届く。

(() => {
  // ==============================
  // 設定値（必要に応じて調整）
  // ==============================

  // デバッグログのオン/オフ
  const DEBUG = true;

  // ダウンロード開始後にタブを自動で閉じるかどうか（将来的にオプションから切り替える想定）
  const AUTO_CLOSE_TAB = true;

  // 自動クローズまでの待ち時間 (ms)
  // NexusMods のカウントダウン(5秒) + 少し余裕 → 10秒をデフォルトにしています。
  const AUTO_CLOSE_DELAY_MS = 10000;

  // ポーリング間隔 (ms)
  const POLL_INTERVAL_MS = 500;

  // 最大試行回数
  const MAX_ATTEMPTS = 40;

  // 1 ページで 1 回だけトリガーしたいのでフラグを持つ
  let alreadyTriggered = false;

  // 今までの試行回数
  let attempts = 0;

  // ==============================
  // 共通ユーティリティ
  // ==============================

  function debugLog(...args) {
    if (!DEBUG) return;
    console.log("[NexusMods SlowDL]", ...args);
  }

  function markElement(el) {
    if (!el) return;
    try {
      el.dataset.nexusSlowdlMarked = "1";
      el.style.outline = "2px solid red";
      el.style.outlineOffset = "2px";
    } catch (e) {
      debugLog("Failed to mark element:", e);
    }
  }

  // ==============================
  // パターン1: 通常 DOM にボタンがあるケース
  // ==============================

  function findVisibleSlowDownloadButton() {
    const candidates = document.querySelectorAll("button, a[role='button']");

    debugLog(
      "Scanning for visible Slow download button. candidate count:",
      candidates.length
    );

    for (const el of candidates) {
      const rawText = el.textContent || "";
      const text = rawText.trim().toLowerCase();

      if (!text) continue;
      if (!text.includes("slow download")) continue;

      if (el.disabled) {
        debugLog("Found Slow download button but it is disabled:", el);
        continue;
      }

      debugLog(
        "Found visible Slow download button with text:",
        rawText.trim(),
        el
      );
      markElement(el);
      return el;
    }

    debugLog("Visible Slow download button not found in regular DOM.");
    return null;
  }

  function triggerViaVisibleButton() {
    const btn = findVisibleSlowDownloadButton();
    if (!btn) return false;

    debugLog("Clicking visible Slow download button.");
    btn.click();
    return true;
  }

  // ==============================
  // パターン2: Web Components 経由の slowDownload イベント
  // ==============================

  function triggerViaModFileDownloadComponent() {
    const modComponent = document.querySelector("mod-file-download");
    if (!modComponent) {
      debugLog("mod-file-download component not found in this frame.");
      return false;
    }

    debugLog(
      "mod-file-download component found. Dispatching slowDownload event.",
      modComponent
    );

    const event = new CustomEvent("slowDownload", {
      bubbles: true,
      cancelable: true,
      composed: true
    });

    const dispatchResult = modComponent.dispatchEvent(event);
    debugLog(
      "slowDownload event dispatched. defaultPrevented:",
      !dispatchResult
    );

    return true;
  }

  // ==============================
  // 自動タブクローズ関連
  // ==============================

  /**
   * 現在のタブを閉じる。
   *
   * 優先順位:
   *   1. ページコンテキストで window.close() を実行する <script> を注入（Chrome/Firefox 共通）
   *   2. 任意で background + tabs.remove を使ったフォールバック（browser/chrome 両対応）
   */
  function requestCloseCurrentTab() {
    debugLog("[AutoClose] Trying to close tab via injected window.close().");

    // 1) ページコンテキストで window.close() を実行する <script> を注入
    try {
      const script = document.createElement("script");
      script.textContent =
        "try { window.close(); } catch (e) { console && console.log('[NexusMods SlowDL][page] window.close() failed:', e); }";
      (document.documentElement || document.head || document.body).appendChild(
        script
      );
      script.remove();
      debugLog(
        "[AutoClose] Injected window.close() script into page context (Chrome/Firefox)."
      );
    } catch (e) {
      debugLog("[AutoClose] Failed to inject window.close() script:", e);
    }

    // 2) background + tabs.remove を使ったフォールバック（任意）
    const runtime =
      (typeof browser !== "undefined" && browser.runtime) ||
      (typeof chrome !== "undefined" && chrome.runtime)
        ? (typeof browser !== "undefined" ? browser.runtime : chrome.runtime)
        : null;

    if (!runtime) {
      debugLog(
        "[AutoClose] No runtime API available (browser/chrome). Skipping message-based close."
      );
      return;
    }

    try {
      const message = { type: "NEXUS_SLOWDL_CLOSE_TAB" };
      debugLog(
        "[AutoClose] Also sending close-tab request via runtime.sendMessage."
      );

      const send = runtime.sendMessage.bind(runtime);
      const maybePromise = send(message, (response) => {
        debugLog(
          "[AutoClose] runtime.sendMessage callback response:",
          response
        );
      });

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise
          .then((response) => {
            debugLog(
              "[AutoClose] runtime.sendMessage promise response:",
              response
            );
          })
          .catch((err) => {
            debugLog(
              "[AutoClose] runtime.sendMessage promise error:",
              err
            );
          });
      }
    } catch (e) {
      debugLog("[AutoClose] Error while sending runtime message:", e);
    }
  }

  /**
   * Slow download を起動したあと、必要ならタブの自動クローズをスケジュールする。
   *
   * 条件:
   * - AUTO_CLOSE_TAB が true
   * - window.history.length <= 1（ブラウザバックできないタブ）
   */
  function scheduleAutoCloseIfNeeded() {
    if (!AUTO_CLOSE_TAB) {
      debugLog("[AutoClose] Disabled by AUTO_CLOSE_TAB flag.");
      return;
    }

    if (window.history.length > 1) {
      debugLog(
        "[AutoClose] history.length > 1, will NOT auto-close this tab. history.length =",
        window.history.length
      );
      return;
    }

    debugLog(
      `[AutoClose] Auto-close scheduled in ${AUTO_CLOSE_DELAY_MS}ms (history.length=${window.history.length}).`
    );

    setTimeout(() => {
      debugLog("[AutoClose] Auto-close timer fired. Closing tab now.");
      requestCloseCurrentTab();
    }, AUTO_CLOSE_DELAY_MS);
  }

  // ==============================
  // メインのトリガー処理
  // ==============================

  function tryTriggerOnce() {
    if (alreadyTriggered) {
      debugLog("Already triggered. Skipping this attempt.");
      return;
    }

    attempts += 1;
    debugLog(`Attempt #${attempts} on ${location.href}`);

    if (triggerViaVisibleButton()) {
      debugLog("Triggered via visible button.");
      alreadyTriggered = true;
      scheduleAutoCloseIfNeeded();
      return;
    }

    if (triggerViaModFileDownloadComponent()) {
      debugLog("Triggered via mod-file-download component.");
      alreadyTriggered = true;
      scheduleAutoCloseIfNeeded();
      return;
    }

    debugLog(
      "No visible button or mod-file-download component found in this attempt."
    );
  }

  function startPolling() {
    debugLog(
      "Starting polling for Slow download trigger.",
      `maxAttempts=${MAX_ATTEMPTS}, interval=${POLL_INTERVAL_MS}ms`
    );

    const timerId = setInterval(() => {
      if (alreadyTriggered) {
        debugLog("Stopping polling because alreadyTriggered = true.");
        clearInterval(timerId);
        return;
      }

      if (attempts >= MAX_ATTEMPTS) {
        debugLog(
          "Stopping polling because max attempts reached.",
          `attempts=${attempts}`
        );
        clearInterval(timerId);
        return;
      }

      tryTriggerOnce();
    }, POLL_INTERVAL_MS);
  }

  function setupMutationObserver() {
    if (!("MutationObserver" in window)) {
      debugLog("MutationObserver is not available in this environment.");
      return;
    }

    const observer = new MutationObserver((mutations) => {
      if (alreadyTriggered) return;

      const hasAddedNodes = mutations.some(
        (m) => m.addedNodes && m.addedNodes.length > 0
      );
      if (!hasAddedNodes) return;

      debugLog("DOM changed (MutationObserver) - trying a one-shot trigger.");
      tryTriggerOnce();
    });

    try {
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
      });
      debugLog("MutationObserver registered.");
    } catch (e) {
      debugLog("Failed to register MutationObserver:", e);
    }
  }

  // ==============================
  // エントリーポイント
  // ==============================

  function start() {
    debugLog(
      "Content script initialized.",
      "URL:",
      location.href,
      "readyState:",
      document.readyState
    );

    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      debugLog(
        "Document is already loaded or interactive. Starting immediately."
      );
      startPolling();
      setupMutationObserver();
      // 自動クローズは「トリガー成功時」に scheduleAutoCloseIfNeeded() から開始
    } else {
      debugLog(
        "Document is still loading. Waiting for DOMContentLoaded."
      );
      document.addEventListener("DOMContentLoaded", () => {
        debugLog(
          "DOMContentLoaded fired. Starting polling and observer."
        );
        startPolling();
        setupMutationObserver();
      });
    }
  }

  start();
})();
