# NexusMods Slow Download Auto Clicker

Automatically clicks the **"Slow download"** button on NexusMods to simplify free downloads.  
NexusMods の「Slow download」ボタンを自動クリックして、無料ダウンロード操作を簡略化するブラウザ拡張機能です。

## Features

- Detects the “Slow download” action automatically, both when it is a normal DOM button and when it is hidden inside the `mod-file-download` Web Component  
- Keeps polling and watching DOM mutations so the action fires even when NexusMods injects the button late  
- Supports **Chrome** and **Firefox** (classic + next-generation UI)  
- Automatically closes the throwaway download tab ~10 seconds after the click when it was opened solely for the download  
- Uses only a lightweight background service worker plus the `tabs` permission to support the auto-close fallback

## Installation

### Chrome
1. Download or clone this repository.
2. Open `chrome://extensions/`
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extension folder.

### Firefox
1. Download or clone this repository.
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select the `manifest.json` file.

> Note: For Firefox permanent installation, signing via AMO is required, but for personal use, the temporary load method is sufficient.

## File Structure
```
nexusmods-slow-download-auto-clicker/
├─ manifest.json          (wires the content script + background worker)
├─ content-script.js      (detects/dispatches the Slow download action)
└─ background.js          (close-tab fallback when auto-close is enabled)
```


## How It Works

When you open the *Files* tab of a mod page, the content script starts once the DOM is ready and:

1. Polls the page every 500 ms while also listening to DOM mutations so it reacts to SPA-style updates.  
2. Tries to click any visible button/link that contains **"Slow download"**.  
3. If the site renders the download UI through the `mod-file-download` component, dispatches its `slowDownload` event instead.  
4. After a successful trigger the script marks the page as handled, then schedules the optional auto-close routine (see below).

This dual-path approach covers both the classic and the new NexusMods UI, and keeps retrying up to the configured attempt limit.

### Auto-close behavior

By default the script schedules an auto-close ~10 seconds after the slow download starts **only** when the tab has no browsing history (typical countdown pop-up tab). It first injects `window.close()` inside the page context, then falls back to messaging the background service worker which calls `tabs.remove`. If you prefer to keep the tab open, edit `AUTO_CLOSE_TAB` (or adjust `AUTO_CLOSE_DELAY_MS`) in `content-script.js` before loading the extension.

## Permissions

The manifest now requests the minimal `tabs` permission so the background worker can close the download tab when the foreground script asks for it. The extension runs on the Files tab of NexusMods mod pages:

- `*://www.nexusmods.com/*/mods/*?tab=files*`
- `*://next.nexusmods.com/*/mods/*?tab=files*`

`all_frames: true` is enabled so the script also activates inside iframe-based download dialogs.

## For Developers

To modify or extend this extension:

- Edit `content-script.js` for behavior changes (polling frequency, auto-close flags, etc.)
- Adjust `matches` in `manifest.json` if you want to limit the pages where it runs
- Update `background.js` only if you plan to change how the fallback tab-closing logic works

PRs and forks are welcome, even though this project is mainly for personal use.

## License

MIT License  
You are free to use, modify, and distribute this software under the terms of the MIT license.
