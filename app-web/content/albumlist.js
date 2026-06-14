// albumlist.js — injected on rajce pages. On a user's album-list page it adds a
// one-click download icon next to each album name and shows a progress overlay.
//
// The album tiles are rendered client-side into #user-albums-list, so we wait
// for them with a MutationObserver and (re)decorate as they appear / paginate.

(function () {
  const list = document.getElementById("user-albums-list");
  if (!list) return; // not an album-list page

  const T = {
    download: "Stáhnout album",
    fetching: "Načítám album…",
    parsing: "Zpracovávám…",
    downloading: (a, b) => `Stahuji ${a}/${b}`,
    done: (d, t) => `Hotovo — ${d}/${t}`,
    empty: "Album je prázdné",
    cancel: "Zrušit",
    errAuth: "Vyžaduje přihlášení / autorizaci",
    errTooMany: "Příliš mnoho pokusů, zkuste to později",
    errParse: "Album se nepodařilo načíst",
    errGeneric: "Chyba stahování",
  };

  const ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path d="M12 3v10m0 0l-4-4m4 4l4-4M5 20h14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const BLOCKED_FIRST_SEG = new Set([
    "hledej", "napoveda", "export", "assets", "js", "css", "u", "video",
    "alba", "search", "login", "registrace", "secure", "img", "static",
  ]);
  const BLOCKED_SUBDOMAIN = new Set([
    "www", "obchod", "alba", "video", "secure", "cdn", "api", "blog",
    "podpora", "napoveda",
  ]);

  function isAlbumUrl(href) {
    let u;
    try {
      u = new URL(href, location.href);
    } catch {
      return false;
    }
    if (!/(^|\.)rajce\.(idnes\.cz|net)$/.test(u.hostname)) return false;
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length === 0) return false;
    if (BLOCKED_FIRST_SEG.has(segs[0].toLowerCase())) return false;
    // /<album-slug> on a user subdomain, or /<user>/album/<slug>/<id> anywhere
    if (segs.length === 1) return !BLOCKED_SUBDOMAIN.has(u.hostname.split(".")[0].toLowerCase());
    if (segs.length >= 3 && segs[1] === "album") return true;
    return false;
  }

  function albumKey(href) {
    const u = new URL(href, location.href);
    return u.origin + u.pathname.replace(/\/+$/, "");
  }

  // Nearest ancestor that is an album tile (or, failing that, a reasonable card).
  function tileFor(anchor) {
    const tile = anchor.closest(".album-item, .rajce-photo-card, .product, [data-id]");
    if (tile && tile !== list) return tile;
    return anchor.parentElement || anchor;
  }

  function decorate() {
    // Primary path: the real rajce.idnes album-list markup.
    let decorated = 0;
    list.querySelectorAll(".album-item").forEach((tile) => {
      if (tile.dataset.rajceDecorated) return;
      const nameAnchor = tile.querySelector(".name a[href]") || tile.querySelector(".bottom-info a[href]");
      if (!nameAnchor) return;

      const perma = tile.querySelector("[data-permanent-link]");
      const rawUrl = (perma && perma.getAttribute("data-permanent-link")) || nameAnchor.getAttribute("href");
      if (!rawUrl || !isAlbumUrl(rawUrl)) return;

      tile.dataset.rajceDecorated = "1";
      const nameEl = tile.querySelector("[data-album-name]");
      const name = (nameEl && nameEl.getAttribute("data-album-name")) || nameAnchor.textContent.trim();
      injectButton(tile, nameAnchor, new URL(rawUrl, location.href).href, name);
      decorated++;
    });
    if (decorated > 0) return;

    // Fallback: generic anchor scan for other/older markup.
    const anchors = Array.from(list.querySelectorAll("a[href]")).filter((a) => isAlbumUrl(a.href));
    const groups = new Map();
    for (const a of anchors) {
      const key = albumKey(a.href);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    }
    for (const [url, group] of groups) {
      const nameAnchor = group.find((a) => a.textContent.trim().length > 0) || group[0];
      const tile = tileFor(nameAnchor);
      if (tile.dataset.rajceDecorated) continue;
      tile.dataset.rajceDecorated = "1";
      injectButton(tile, nameAnchor, url, nameAnchor.textContent.trim());
    }
  }

  function injectButton(tile, nameAnchor, url, name) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rajce-dl-btn";
    btn.title = T.download;
    btn.innerHTML = ICON;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startDownload(tile, btn, url, name);
    });

    nameAnchor.insertAdjacentElement("afterend", btn);
  }

  function makeOverlay(tile) {
    if (getComputedStyle(tile).position === "static") tile.style.position = "relative";
    const overlay = document.createElement("div");
    overlay.className = "rajce-dl-overlay";
    overlay.innerHTML =
      '<div class="rajce-dl-spinner"></div>' +
      '<div class="rajce-dl-text"></div>' +
      '<div class="rajce-dl-bar"><div class="rajce-dl-bar-fill"></div></div>' +
      '<button type="button" class="rajce-dl-cancel"></button>';
    tile.appendChild(overlay);
    return {
      el: overlay,
      text: overlay.querySelector(".rajce-dl-text"),
      fill: overlay.querySelector(".rajce-dl-bar-fill"),
      cancel: overlay.querySelector(".rajce-dl-cancel"),
    };
  }

  function startDownload(tile, btn, url, name) {
    btn.disabled = true;
    const ov = makeOverlay(tile);
    ov.cancel.textContent = T.cancel;

    const port = chrome.runtime.connect({ name: "album-download" });
    let finished = false;

    const cleanup = (keep) => {
      finished = true;
      btn.disabled = false;
      try {
        port.disconnect();
      } catch {}
      if (!keep) ov.el.remove();
    };

    ov.cancel.addEventListener("click", () => cleanup(false));

    ov.text.textContent = T.fetching;

    port.onMessage.addListener((m) => {
      if (m.type === "progress") {
        if (m.phase === "fetching") ov.text.textContent = T.fetching;
        else if (m.phase === "parsing") ov.text.textContent = T.parsing;
        else if (m.phase === "empty") {
          ov.text.textContent = T.empty;
          ov.el.classList.add("is-done");
          setTimeout(() => cleanup(false), 2500);
        } else if (m.phase === "downloading") {
          ov.text.textContent = T.downloading(m.done, m.total);
          ov.fill.style.width = m.total ? `${(m.done / m.total) * 100}%` : "0%";
        }
      } else if (m.type === "done") {
        ov.text.textContent = T.done(m.downloaded, m.total);
        ov.fill.style.width = "100%";
        ov.el.classList.add("is-done");
        ov.cancel.style.display = "none";
        setTimeout(() => cleanup(false), 3000);
      } else if (m.type === "error") {
        const map = {
          auth: T.errAuth,
          tooMany: T.errTooMany,
          parse: T.errParse,
        };
        ov.text.textContent = map[m.message] || `${T.errGeneric}: ${m.message}`;
        ov.el.classList.add("is-error");
        ov.cancel.textContent = "OK";
      }
    });

    port.onDisconnect.addListener(() => {
      if (!finished) ov.el.remove();
    });

    port.postMessage({ type: "start", url, name });
  }

  // Debounced (re)decoration as tiles load / pagination changes.
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorate();
    });
  };

  new MutationObserver(schedule).observe(list, { childList: true, subtree: true });
  schedule();
})();
