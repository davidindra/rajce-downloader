# Rajce album downloader — web / browser extension

A browser-extension (Manifest V3) equivalent of the U++ desktop application in
this repository. It downloads images and videos from
[rajce.net](https://www.rajce.net) albums, including password-protected ones —
without any external server or proxy.

## Why an extension instead of a GitHub Pages web app?

rajce.net does not send CORS headers, so JavaScript running on a normal web page
(such as one hosted on GitHub Pages) **cannot** fetch album pages or media files
from it — the browser blocks cross-origin requests. WebAssembly does not change
this: code in the browser still uses the same network layer and is subject to
the same CORS rules.

A browser extension is granted cross-origin access to rajce.net through its
manifest `host_permissions`, so it can fetch and download directly, no proxy
required, and your album password never leaves your machine.

The repository's `docs/` folder (served on GitHub Pages) hosts only a landing
page with install instructions.

## Install (unpacked — Chrome / Edge / Brave)

1. Clone or download this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this `app-web/` folder.
5. Click the toolbar icon — the downloader opens in a new tab.

> Firefox: the same code works with a minor `manifest.json` adjustment
> (`background.scripts` instead of `service_worker`); a port is straightforward
> but not included here.

## Usage

1. Paste an album URL (e.g. `https://user.rajce.net/album`).
2. For protected albums, tick **Enable album authorization** and fill in the
   album user and password.
3. Pick a **Save mode**:
   - **Save into the Downloads folder** — each file is written under
     `Downloads/<optional sub-folder>/<user>/<album>/…`.
   - **Single ZIP** — the whole album is packed into one `.zip` (no
     compression; media is already compressed).
4. Click **Download**.

## How it maps to the desktop app

| Desktop (C++/U++)                                   | Extension                                            |
| --------------------------------------------------- | ---------------------------------------------------- |
| `HttpDownloadPage` (+ POST `login`/`code`)          | `fetchAlbumPage()` in `src/rajce.js`                 |
| `HttpParse` (find `legacy_media`+`photoID`, parse)  | `parseAlbum()` / `buildQueue()` in `src/rajce.js`    |
| `DecodeEscapedUtf`                                  | not needed — `JSON.parse` decodes `\uXXXX`           |
| File download loop (`FileDownload`)                 | `Downloader.run()` in `src/downloader.js`            |
| `.ini` configuration file                           | `chrome.storage.local` (`src/settings.js`)           |
| Append user / album name to directory               | sub-folder path under Downloads / inside the ZIP     |
| Continue on 404                                      | `downloadContinue` option (precise status via fetch) |
| HTTP proxy, self-update                             | dropped — not meaningful in the browser              |

## Limitations

- **"Download new files only"** cannot inspect your real disk. It skips files
  this extension recorded as downloaded before (per album URL), stored in
  `chrome.storage.local`. Clearing extension storage resets that record.
- **ZIP mode** holds files in memory while building the archive; very large
  albums or long videos can hit browser memory limits — use the Downloads mode
  for those.
- The toolbar icons are the desktop logo scaled by the browser. To ship crisp
  16/48/128 px icons, regenerate them, e.g.:
  ```bash
  for s in 16 48 128; do convert app/Rajce/Rajce.png -resize ${s}x${s} app-web/icons/icon${s}.png; done
  ```

## Project layout

```
app-web/
  manifest.json        MV3 manifest (host_permissions for rajce.net)
  background.js        opens the UI tab on toolbar click
  ui/panel.html|css|js the UI (port of Rajce.lay + the Rajce ctor logic)
  src/rajce.js         page fetch + JSON parsing (port of HttpParse)
  src/downloader.js    download orchestration + save modes
  src/zip.js           dependency-free STORE-method ZIP writer
  src/settings.js      chrome.storage.local persistence
  src/i18n.js          EN/CZ strings (ported from Rajce.t)
  icons/               extension icons
```
