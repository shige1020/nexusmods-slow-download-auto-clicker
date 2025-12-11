// background.js (Manifest V3 service worker 用)
// content-script からの "NEXUS_SLOWDL_CLOSE_TAB" メッセージを受けて、
// そのタブ自身を閉じる。Chrome / Firefox 両対応のラッパー実装。

// 共通 API ラッパー（browser があれば優先し、無ければ chrome を使う）
const api =
  (typeof browser !== "undefined" && browser) ||
  (typeof chrome !== "undefined" && chrome);

if (!api || !api.runtime) {
  // ここに来ることはほぼ無いが、拡張の実行環境でない場合などを考慮してガードしておく
  console.warn(
    "[NexusMods SlowDL][background] No runtime API (browser/chrome) is available."
  );
}

// メッセージハンドラ
function handleMessage(message, sender, sendResponse) {
  if (!message || message.type !== "NEXUS_SLOWDL_CLOSE_TAB") {
    return; // この拡張のメッセージでなければ何もしない
  }

  console.log(
    "[NexusMods SlowDL][background] Received close-tab request.",
    {
      senderTab: sender.tab
    }
  );

  // どのタブを閉じるか → このメッセージを送ってきたタブ
  const tabId = sender.tab && sender.tab.id;

  if (tabId == null) {
    console.warn(
      "[NexusMods SlowDL][background] sender.tab.id is null/undefined. Cannot close tab."
    );
    if (typeof sendResponse === "function") {
      sendResponse({ ok: false, error: "no-tab-id" });
    }
    return;
  }

  try {
    api.tabs.remove(tabId, () => {
      const lastError =
        api.runtime && api.runtime.lastError
          ? api.runtime.lastError.message
          : null;

      if (lastError) {
        console.warn(
          "[NexusMods SlowDL][background] tabs.remove error:",
          lastError
        );
        if (typeof sendResponse === "function") {
          sendResponse({ ok: false, error: lastError });
        }
        return;
      }

      console.log(
        "[NexusMods SlowDL][background] Tab closed successfully. tabId =",
        tabId
      );
      if (typeof sendResponse === "function") {
        sendResponse({ ok: true });
      }
    });
  } catch (e) {
    console.warn(
      "[NexusMods SlowDL][background] Exception in tabs.remove:",
      e
    );
    if (typeof sendResponse === "function") {
      sendResponse({ ok: false, error: String(e) });
    }
  }

  // 非同期で sendResponse を使うので true を返す（Chrome 形式）
  return true;
}

// runtime.onMessage へ登録（Chrome/Firefox 両方で動作）
if (api && api.runtime && api.runtime.onMessage) {
  api.runtime.onMessage.addListener(handleMessage);
}
