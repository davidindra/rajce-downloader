// rajce.js — pure parsing/fetch logic, ported from the U++ application
// (Rajce.cpp: HttpDownloadPage, HttpParse, HttpGetParameterValue).
//
// The browser equivalent does not need DecodeEscapedUtf() because JSON.parse
// already decodes \uXXXX escapes natively.

export class HttpError extends Error {
  constructor(status, statusText) {
    super(`${status} ${statusText}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
  }
}

// Port of HttpPrependProtocol(): strip trailing slashes and force the protocol.
export function normalizeAlbumUrl(input, useHttps = true) {
  let url = (input || "").trim();
  url = url.replace(/\/+$/, "");
  const proto = useHttps ? "https://" : "http://";
  const m = url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(.*)$/);
  return proto + (m ? m[1] : url);
}

// Port of HttpDownloadPage(): GET the album page, or POST login/code when the
// album is authorized. credentials:'include' lets the resulting session cookie
// be reused by later file downloads (image/video URLs need that cookie).
export async function fetchAlbumPage(url, { authorize = false, user = "", pass = "" } = {}) {
  const opts = { credentials: "include", redirect: "follow" };
  if (authorize) {
    const body = new URLSearchParams();
    body.set("login", user);
    body.set("code", pass);
    opts.method = "POST";
    opts.body = body;
  }
  const res = await fetch(url, opts);
  if (!res.ok) throw new HttpError(res.status, res.statusText);
  return await res.text();
}

// Port of HttpGetParameterValue(): find `param`, the following ':' then the
// first quoted string value.
function getParameterValue(param, txt) {
  const posParam = txt.indexOf(param);
  if (posParam < 0) return "";
  const posColon = txt.indexOf(":", posParam);
  if (posColon < 0) return "";
  const posFirst = txt.indexOf('"', posColon);
  if (posFirst < 0) return "";
  const posLast = txt.indexOf('"', posFirst + 1);
  if (posLast < 0) return "";
  const raw = txt.slice(posFirst + 1, posLast);
  // JSON.parse handles the \uXXXX escapes (DecodeEscapedUtf equivalent).
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

// Extract a balanced JSON array starting at `start` (index of '[' in `s`),
// respecting string literals and escapes.
function extractJsonArray(s, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

// Port of HttpParse(): locate the JS line holding the photo array (it carries
// both `legacy_media` and `photoID`), then JSON.parse the array. Returns either
// { error } or { albumName, photos }.
export function parseAlbum(html) {
  if (html.includes("Album s přístupem na kód")) {
    if (html.includes("Příliš mnoho neúspěšných pokusů")) {
      return { error: "TOO_MANY_ATTEMPTS" };
    }
    return { error: "AUTH_REQUIRED" };
  }

  let arrStr = null;
  for (const line of html.split(/\r?\n/)) {
    if (line.includes("legacy_media") && line.includes("photoID")) {
      const start = line.indexOf("[");
      if (start >= 0) {
        const candidate = extractJsonArray(line, start);
        if (candidate) {
          arrStr = candidate;
          break;
        }
      }
    }
  }

  // Fallback for non-minified pages where the array spans multiple lines.
  if (!arrStr) {
    const pid = html.indexOf('"photoID"');
    if (pid >= 0) {
      const br = html.lastIndexOf("[", pid);
      if (br >= 0) arrStr = extractJsonArray(html, br);
    }
  }

  if (!arrStr) return { error: "PARSE_ERROR" };

  let photos;
  try {
    photos = JSON.parse(arrStr);
  } catch {
    return { error: "PARSE_ERROR" };
  }
  if (!Array.isArray(photos)) return { error: "PARSE_ERROR" };

  return { albumName: getParameterValue("album_name", html), photos };
}

// Collapse duplicate slashes in the path part of a URL (keeps the `://`),
// matching the cleanup loop in HttpParse().
function collapseDoubleSlashes(u) {
  const i = u.indexOf("://");
  if (i < 0) return u;
  const start = i + 3;
  return u.slice(0, start) + u.slice(start).replace(/\/{2,}/g, "/");
}

// Port of the per-photo loop in HttpParse(): turn parsed photos into download
// entries. `downloadVideo` controls whether videos are included.
export function buildQueue(photos, { downloadVideo = true } = {}) {
  const items = [];
  for (const p of photos) {
    const isVideo = String(p.isVideo) === "true";
    let name = String(p.fileName ?? "");
    let url = "";

    if (isVideo) {
      if (downloadVideo) {
        const fmt = p?.video_structure?.items?.[1]?.video?.[0]?.format;
        if (fmt) name = `${name}.${fmt}`;
        url = String(p.video_url ?? "");
      }
    } else {
      url = String(p.image_url ?? "");
    }

    if (url) items.push({ url: collapseDoubleSlashes(url), name, isVideo });
  }
  return items;
}

// Sanitize a single path segment so it is safe as a file/folder name across
// platforms (mirrors the Windows replacements done in HttpParse()).
export function sanitizeSegment(name) {
  let s = String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  s = s.replace(/[. ]+$/, ""); // no trailing dots/spaces (Windows)
  return s || "_";
}
