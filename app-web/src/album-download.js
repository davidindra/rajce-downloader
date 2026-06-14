// album-download.js — download a whole album by URL. Runs in the background
// service worker, so it must avoid DOM/Blob APIs (no URL.createObjectURL in MV3
// service workers). chrome.downloads fetches each media URL directly, reusing
// the browser session cookies (works for the logged-in user's own albums).

import { fetchAlbumPage, parseAlbum, buildQueue, sanitizeSegment } from "./rajce.js";

function deriveUser(albumUrl) {
  try {
    const u = new URL(albumUrl);
    const first = u.hostname.split(".")[0];
    if (first && first !== "www") return first;
    const segs = u.pathname.split("/").filter(Boolean);
    return segs[0] || "";
  } catch {
    return "";
  }
}

function downloadUrl(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename, conflictAction: "uniquify", saveAs: false },
      (id) => {
        if (chrome.runtime.lastError || id === undefined) {
          reject(new Error(chrome.runtime.lastError?.message || "download failed"));
          return;
        }
        const onChanged = (delta) => {
          if (delta.id !== id) return;
          if (delta.state?.current === "complete") {
            chrome.downloads.onChanged.removeListener(onChanged);
            resolve();
          } else if (delta.state?.current === "interrupted") {
            chrome.downloads.onChanged.removeListener(onChanged);
            reject(new Error(delta.error?.current || "interrupted"));
          }
        };
        chrome.downloads.onChanged.addListener(onChanged);
      }
    );
  });
}

// Downloads every photo/video of the album into Downloads/<user>/<album>/.
// onProgress receives { phase, done, total, name }. isCancelled() lets the
// caller stop the loop between files.
export async function downloadAlbum({ url, onProgress, isCancelled }) {
  onProgress?.({ phase: "fetching" });
  const html = await fetchAlbumPage(url, { authorize: false });

  onProgress?.({ phase: "parsing" });
  const parsed = parseAlbum(html);
  if (parsed.error) {
    throw new Error(
      { AUTH_REQUIRED: "auth", TOO_MANY_ATTEMPTS: "tooMany", PARSE_ERROR: "parse" }[parsed.error] ||
        "parse"
    );
  }

  const items = buildQueue(parsed.photos, { downloadVideo: true });
  const total = items.length;
  if (total === 0) {
    onProgress?.({ phase: "empty", done: 0, total: 0 });
    return { total: 0, downloaded: 0, failed: 0 };
  }

  const user = sanitizeSegment(deriveUser(url) || "rajce");
  const album = sanitizeSegment(parsed.albumName || "album");

  let downloaded = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i++) {
    if (isCancelled?.()) throw new Error("cancelled");
    const it = items[i];
    onProgress?.({ phase: "downloading", done: i, total, name: it.name });
    const filename = [user, album, sanitizeSegment(it.name)].join("/");
    try {
      await downloadUrl(it.url, filename);
      downloaded++;
    } catch {
      failed++; // keep going on per-file errors (e.g. 404)
    }
    onProgress?.({ phase: "downloading", done: i + 1, total, name: it.name });
  }

  onProgress?.({ phase: "complete", total, downloaded, failed });
  return { total, downloaded, failed };
}
