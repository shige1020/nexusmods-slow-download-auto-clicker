// NexusMods Slow Download Auto Clicker
// NexusMods の「Slow download」ボタンを自動クリックするコンテンツスクリプト

(() => {
  // 1ページ内で複数回クリックしないためのフラグ
  let alreadyClicked = false;

  /**
   * "Slow download" ボタンを探してクリックする
   * 見つけてクリックしたら true を返す
   */
  function clickSlowDownload() {
    if (alreadyClicked) return false;

    // button 要素と role="button" の a 要素をまとめて見る
    const candidates = Array.from(
      document.querySelectorAll("button, a[role='button']")
    );

    for (const el of candidates) {
      const text = (el.textContent || "").trim().toLowerCase();

      // "slow download" を含むボタンを対象にする
      if (!text || !text.includes("slow download")) continue;
      if (el.disabled) continue;

      // クリック実行
      el.click();
      alreadyClicked = true;
      console.log(
        "[NexusMods Slow Download Auto Clicker] Clicked 'Slow download' button."
      );
      return true;
    }

    return false;
  }

  /**
   * DOM が出揃うまで一定間隔で探索する
   * SPA 的に遅れてボタンが出てくるケースもカバー
   */
  function tryClickRepeatedly(maxTries = 30, intervalMs = 1000) {
    let tries = 0;

    const timerId = setInterval(() => {
      if (alreadyClicked) {
        clearInterval(timerId);
        return;
      }

      tries += 1;
      const clicked = clickSlowDownload();

      if (clicked || tries >= maxTries) {
        clearInterval(timerId);
      }
    }, intervalMs);
  }

  /**
   * SPA 的な画面更新にも追従するための MutationObserver
   * すでにクリック済みなら何もしない
   */
  function setupMutationObserver() {
    const observer = new MutationObserver(() => {
      if (alreadyClicked) return;
      clickSlowDownload();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // エントリーポイント
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      tryClickRepeatedly();
      setupMutationObserver();
    });
  } else {
    tryClickRepeatedly();
    setupMutationObserver();
  }
})();
