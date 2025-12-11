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

  /**
   * デバッグログ出力用ラッパー
   * DEBUG が false の場合は何も出さない。
   */
  function debugLog(...args) {
    if (!DEBUG) return;
    // prefix を付けておくとコンソールで見つけやすい
    console.log("[NexusMods SlowDL]", ...args);
  }

  /**
   * 要素を視覚的にマークして「ここだよ」と分かるようにする。
   * 主にデバッグ用途。
   */
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
  // （next.nexusmods.com 等）
  // ==============================

  /**
   * 通常の DOM 上にある「Slow download」ボタンを探して返す。
   * 見つからなければ null。
   *
   * 注意:
   *   - shadow DOM 内はこの方法では見えない。
   *   - 文字列は "Slow download" を含むかどうかで判定。
   */
  function findVisibleSlowDownloadButton() {
    // button と、ボタン的に使われる a[role="button"] を候補にする
    const candidates = document.querySelectorAll("button, a[role='button']");

    debugLog(
      "Scanning for visible Slow download button. candidate count:",
      candidates.length
    );

    for (const el of candidates) {
      const rawText = el.textContent || "";
      const text = rawText.trim().toLowerCase();

      if (!text) continue;

      // "slow download" を含むものを対象にする
      if (!text.includes("slow download")) continue;

      // disabled なボタンはスキップ
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

  /**
   * 通常 DOM 上の「Slow download」ボタンをクリックする。
   * 成功すれば true、見つからなければ false。
   */
  function triggerViaVisibleButton() {
    const btn = findVisibleSlowDownloadButton();
    if (!btn) return false;

    debugLog("Clicking visible Slow download button.");
    btn.click();
    return true;
  }

  // ==============================
  // パターン2: Web Components 経由の slowDownload イベント
  // （www.nexusmods.com の download ページ等）
  // ==============================

  /**
   * mod-file-download コンポーネントに slowDownload イベントを dispatch して
   * 「Slow download ボタンが押された」のと同じ挙動を発生させる。
   *
   * 成功すれば true、要素が見つからなければ false。
   */
  function triggerViaModFileDownloadComponent() {
    const modComponent = document.querySelector("mod-file-download");
    if (!modComponent) {
      debugLog("mod-file-download component not found in this frame.");
      return false;
    }

    debugLog("mod-file-download component found. Dispatching slowDownload event.", modComponent);

    // ページ側では modComponent.addEventListener('slowDownload', ...) のように
    // リスナーが設定されているので、それを起動する。
    const event = new CustomEvent("slowDownload", {
      bubbles: true,
      cancelable: true,
      composed: true // shadow DOM を跨いで伝播させたい場合に有効
    });

    const dispatchResult = modComponent.dispatchEvent(event);
    debugLog("slowDownload event dispatched. defaultPrevented:", !dispatchResult);

    return true;
  }

  // ==============================
  // メインのトリガー処理
  // ==============================

  /**
   * 1 回の試行で「Slow download」を起動しようとする。
   *
   * 1. 通常 DOM にボタンがあるならそれをクリック。
   * 2. なければ、mod-file-download コンポーネントに slowDownload を dispatch。
   *
   * どちらかが成功すれば alreadyTriggered を true にして終了。
   */
  function tryTriggerOnce() {
    if (alreadyTriggered) {
      debugLog("Already triggered. Skipping this attempt.");
      return;
    }

    attempts += 1;
    debugLog(`Attempt #${attempts} on ${location.href}`);

    // 1. 画面に見えているボタンを探してクリックする
    if (triggerViaVisibleButton()) {
      debugLog("Triggered via visible button.");
      alreadyTriggered = true;
      return;
    }

    // 2. Web Component (mod-file-download) に slowDownload を投げる
    if (triggerViaModFileDownloadComponent()) {
      debugLog("Triggered via mod-file-download component.");
      alreadyTriggered = true;
      return;
    }

    debugLog("No visible button or mod-file-download component found in this attempt.");
  }

  /**
   * ポーリングで複数回 tryTriggerOnce を呼び出す。
   * - DOM の構築が遅れている場合や、SPA 的に後から要素が追加される場合に対応する。
   */
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

  /**
   * DOM の変化を監視し、新しいノードが追加されたタイミングでも
   * 1 回だけ tryTriggerOnce を呼ぶ。
   *
   * ポーリングとは別系統の「保険」として動作する。
   */
  function setupMutationObserver() {
    if (!("MutationObserver" in window)) {
      debugLog("MutationObserver is not available in this environment.");
      return;
    }

    const observer = new MutationObserver((mutations) => {
      if (alreadyTriggered) return;

      // 追加ノードがある変化だけを見る簡易フィルタ
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

    // ドキュメントの状態に応じて開始タイミングを変える
    if (document.readyState === "complete" || document.readyState === "interactive") {
      // すでに DOM はほぼ準備済み
      debugLog("Document is already loaded or interactive. Starting immediately.");
      startPolling();
      setupMutationObserver();
    } else {
      // まだ loading の場合
      debugLog("Document is still loading. Waiting for DOMContentLoaded.");
      document.addEventListener("DOMContentLoaded", () => {
        debugLog("DOMContentLoaded fired. Starting polling and observer.");
        startPolling();
        setupMutationObserver();
      });
    }
  }

  // エントリーポイント呼び出し
  start();
})();
