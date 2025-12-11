# NexusMods Slow Download Auto Clicker

Automatically clicks the **"Slow download"** button on NexusMods to simplify free downloads.  
NexusMods の「Slow download」ボタンを自動クリックして、無料ダウンロード操作を簡略化するブラウザ拡張機能です。

## Features

- Detects the “Slow download” button automatically  
- Clicks the button as soon as it appears  
- Supports **Chrome** and **Firefox**  
- No special permissions required (content script only)  
- Works with NexusMods’ next-generation UI (`next.nexusmods.com`)

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
├─ manifest.json
└─ content-script.js
```


## How It Works

The extension injects a small content script that:

1. Searches for any button or link that contains the text **"Slow download"**
2. Automatically clicks it once when found  
3. Continues monitoring the page (using MutationObserver) for SPA-style dynamic content

This ensures the button is pressed even if NexusMods loads it asynchronously.

## Permissions

This extension does **not** require special permissions.  
Only runs on the following domains:

- `https://www.nexusmods.com/*`
- `https://next.nexusmods.com/*`

## For Developers

To modify or extend this extension:

- Edit `content-script.js` for behavior changes
- Adjust `matches` in `manifest.json` if you want to limit the pages where it runs

PRs and forks are welcome, even though this project is mainly for personal use.

## License

MIT License  
You are free to use, modify, and distribute this software under the terms of the MIT license.