// downloader.js — orchestrates the download (port of HttpDownload/FileDownload).
// Runs inside the extension page, which has cross-origin access to rajce.net
// through the manifest host_permissions, so no CORS proxy is needed.

import {
  HttpError,
  normalizeAlbumUrl,
  fetchAlbumPage,
  parseAlbum,
  buildQueue,
  sanitizeSegment,
} from "./rajce.js";
import { ZipWriter } from "./zip.js";
import { getSeen, addSeen } from "./settings.js";
import { t } from "./i18n.js";

const STATUS_NOT_FOUND = 404;

function buildRelPath(item, { subfolder, appendUser, appendAlbum, user, albumName }) {
  const parts = [];
  if (subfolder) {
    for (const seg of subfolder.split("/")) {
      if (seg.trim()) parts.push(sanitizeSegment(seg));
    }
  }
  if (appendUser && user) parts.push(sanitizeSegment(user));
  if (appendAlbum && albumName) parts.push(sanitizeSegment(albumName));
  parts.push(sanitizeSegment(item.name));
  return parts.join("/");
}

// Stream a URL into a Blob, reporting byte progress. Session cookies set by the
// authorized album-page POST are reused via credentials:'include'.
async function fetchToBlob(url, signal, onProgress) {
  const res = await fetch(url, { credentials: "include", signal });
  if (!res.ok) throw new HttpError(res.status, res.statusText);

  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body) {
    const blob = await res.blob();
    onProgress(blob.size, blob.size || 1);
    return blob;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total || loaded);
  }
  return new Blob(chunks);
}

function saveViaDownloads(blob, relPath) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename: relPath, conflictAction: "uniquify", saveAs: false },
      (id) => {
        if (chrome.runtime.lastError || id === undefined) {
          URL.revokeObjectURL(url);
          reject(new Error(chrome.runtime.lastError?.message || "download failed"));
          return;
        }
        const onChanged = (delta) => {
          if (delta.id !== id) return;
          if (delta.state && delta.state.current === "complete") {
            chrome.downloads.onChanged.removeListener(onChanged);
            URL.revokeObjectURL(url);
            resolve();
          } else if (delta.error) {
            chrome.downloads.onChanged.removeListener(onChanged);
            URL.revokeObjectURL(url);
            reject(new Error(delta.error.current));
          }
        };
        chrome.downloads.onChanged.addListener(onChanged);
      }
    );
  });
}

export class Downloader {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.controller = new AbortController();
    this.aborted = false;
  }

  abort() {
    this.aborted = true;
    this.controller.abort();
  }

  status(text) {
    this.cb.onStatus?.(text);
  }

  // settings: object from settings.js
  async run(settings) {
    const url = normalizeAlbumUrl(settings.albumUrl, true);
    if (!url || !/^https?:\/\/.+/.test(url)) {
      throw new AppError(t("errInvalidUrl"));
    }

    this.status(t("fetching"));
    let html;
    try {
      html = await fetchAlbumPage(url, {
        authorize: settings.enableAuth,
        user: settings.albumUser,
        pass: settings.albumPass,
      });
    } catch (e) {
      if (this.aborted) throw new AppError(t("aborted"));
      throw new AppError(`${t("errDownloadFailed")} ${e.message}`);
    }

    this.status(t("parsing"));
    const parsed = parseAlbum(html);
    if (parsed.error) throw new AppError(mapParseError(parsed.error, settings));

    const albumName = parsed.albumName || "";
    let queue = buildQueue(parsed.photos, { downloadVideo: settings.downloadVideo });

    // Resolve relative paths.
    queue = queue.map((item) => ({
      ...item,
      relPath: buildRelPath(item, {
        subfolder: settings.subfolder,
        appendUser: settings.appendUserName && settings.enableAuth,
        appendAlbum: settings.appendAlbumName,
        user: settings.albumUser,
        albumName,
      }),
    }));

    // "Download new files only": skip paths this extension already fetched.
    if (settings.downloadNewOnly) {
      const seen = await getSeen(url);
      queue = queue.filter((item) => !seen[item.relPath]);
    }

    const total = queue.length;
    if (total === 0) {
      this.status(t("nothingToDownload"));
      return { total: 0, downloaded: 0, failed: 0 };
    }

    const zip = settings.saveMode === "zip" ? new ZipWriter() : null;
    const savedPaths = [];
    let downloaded = 0;
    let failed = 0;

    for (let i = 0; i < queue.length; i++) {
      if (this.aborted) throw new AppError(t("aborted"));
      const item = queue[i];
      this.cb.onOverall?.(i + 1, total, item.name);
      this.status(t("downloadingN", i + 1, total));

      let blob;
      try {
        blob = await fetchToBlob(item.url, this.controller.signal, (loaded, tot) =>
          this.cb.onFileProgress?.(loaded, tot)
        );
      } catch (e) {
        if (this.aborted) throw new AppError(t("aborted"));
        const status = e instanceof HttpError ? e.status : 0;
        if (status === STATUS_NOT_FOUND && settings.downloadContinue) {
          failed++;
          continue;
        }
        throw new AppError(`${t("errDownloadFailed")} ${e.message}`);
      }

      if (zip) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        zip.add(item.relPath, buf);
      } else {
        await saveViaDownloads(blob, item.relPath);
      }
      savedPaths.push(item.relPath);
      downloaded++;
    }

    if (zip && zip.count > 0) {
      this.status(t("building"));
      const albumLabel = sanitizeSegment(albumName || "rajce-album");
      await saveViaDownloads(zip.generateBlob(), `${albumLabel}.zip`);
    }

    if (settings.downloadNewOnly && savedPaths.length) {
      await addSeen(url, savedPaths);
    }

    return { total, downloaded, failed };
  }
}

export class AppError extends Error {
  constructor(message) {
    super(message);
    this.name = "AppError";
  }
}

function mapParseError(code, settings) {
  switch (code) {
    case "TOO_MANY_ATTEMPTS":
      return t("errTooManyAttempts");
    case "AUTH_REQUIRED":
      if (!settings.enableAuth) return t("errAuthEnable");
      if (!settings.albumUser || !settings.albumPass) return t("errAuthFill");
      return t("errAuthWrong");
    default:
      return t("errParse");
  }
}
