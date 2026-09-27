// YouTube Quick Actions — content script (MAIN world).
//
// Features:
//  1. Trash button on watch-history rows and playlist rows (incl. Watch later)
//     — one click removes the video from the history / the current playlist.
//  2. Pin + emoji controls inside the native "Save to…" dialog.
//  3. Quick-save bar under each video: one click toggles the video in a pinned
//     playlist (add / remove); playlists that already contain the video are
//     highlighted.
//
// All actions are performed through YouTube's own UI (the native menu is
// opened invisibly and the native menu item is clicked), so YouTube itself
// handles the request, the animation and its native toast.
//
// Menu items are identified by their icon (SVG path) or by their Polymer
// endpoint data — never by visible text — so this works in any YouTube UI
// language. The extension's own UI is English-only.
(() => {
  'use strict';
  if (window.__yqaLoaded) return;
  window.__yqaLoaded = true;

  const BTN_CLASS = 'yqa-btn';
  const FALLBACK_CLASS = 'yqa-trash-fallback';
  const HIDE_CLASS = 'yqa-hide-popup';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAX_PINS = 8;

  // ---------------------------------------------------------------- icons

  // Native YouTube trash icon ("Remove from watch history" menu item).
  const TRASH_PATH =
    'M19 3h-4V2a1 1 0 00-1-1h-4a1 1 0 00-1 1v1H5a2 2 0 00-2 2h18a2 2 0 ' +
    '00-2-2ZM6 19V7H4v12a4 4 0 004 4h8a4 4 0 004-4V7h-2v12a2 2 0 01-2 ' +
    '2H8a2 2 0 01-2-2Zm4-11a1 1 0 00-1 1v8a1 1 0 102 0V9a1 1 0 00-1-1Zm4 ' +
    '0a1 1 0 00-1 1v8a1 1 0 002 0V9a1 1 0 00-1-1Z';
  const PIN_OUTLINE =
    'M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 ' +
    '.45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c' +
    '-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z';
  const PIN_FILLED =
    'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 ' +
    '1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z';
  const SMILEY_PATH =
    'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 ' +
    '12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 ' +
    '8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 ' +
    '14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 ' +
    '8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c' +
    '.8 2.04 2.78 3.5 5.11 3.5z';

  const PLUS_PATH = 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z';
  const PENCIL_PATH = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.7' +
    '1 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.' +
    '83 3.75 3.75 1.83-1.83z';
  const CLOSE_PATH = 'M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 ' +
    '13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z';

  // Icon-path prefixes used to recognise native menu items (language-agnostic).
  const TRASH_ICON_PREFIXES = ['M19 3h-4V2', 'M11 17H9V8'];
  // Bookmark (current menus) and the two legacy "playlist add" glyphs.
  const SAVE_ICON_PREFIXES = ['M19 2H5', 'M22 13h-4', 'M14 10H2v2h12v-2z'];

  // --------------------------------------------------------------- texts

  // Follow YouTube's own interface language so our tooltips never clash with
  // the surrounding UI; fall back to English for anything not translated.
  const STRINGS = window.__yqaStrings || {};
  // Legacy or script-specific codes YouTube still uses.
  const LANG_ALIASES = {
    iw: 'he', in: 'id', nb: 'no', nn: 'no', 'zh-hant': 'zh-tw',
    'zh-hk': 'zh-tw', 'sr-latn': 'sr', tl: 'fil',
  };
  const LANG = (() => {
    let tag = (document.documentElement.lang || 'en').toLowerCase();
    tag = LANG_ALIASES[tag] || tag;
    // Try the full tag, then drop subtags one by one ("zh-hant-tw" → "zh").
    const parts = tag.split('-');
    while (parts.length) {
      const candidate = parts.join('-');
      const resolved = LANG_ALIASES[candidate] || candidate;
      if (STRINGS[resolved]) return resolved;
      parts.pop();
    }
    return 'en';
  })();

  const t = (key, arg) => {
    const table = STRINGS[LANG] || STRINGS.en || {};
    const s = table[key] || (STRINGS.en || {})[key] || key;
    return arg == null ? s : s.replace('{0}', arg);
  };

  const T = {
    get removeHistory() { return t('removeHistory'); },
    get removePlaylist() { return t('removePlaylist'); },
    get pin() { return t('pin'); },
    get unpin() { return t('unpin'); },
    get icon() { return t('icon'); },
    get limit() { return t('limit', MAX_PINS); },
    get search() { return t('search'); },
    get removeIcon() { return t('removeIcon'); },
    get noResults() { return t('noResults'); },
    get emojiTab() { return t('emojiTab'); },
    get iconsTab() { return t('iconsTab'); },
    get allIcons() { return t('allIcons'); },
    get allEmojis() { return t('allEmojis'); },
    get customTab() { return t('customTab'); },
    get uploadImage() { return t('uploadImage'); },
    get adjustImage() { return t('adjustImage'); },
    get apply() { return t('apply'); },
    get deleteImage() { return t('deleteImage'); },
    get editImage() { return t('editImage'); },
    get imageFailed() { return t('imageFailed'); },
    get removeDownload() { return t('removeDownload'); },
    get removeAll() { return t('removeAll'); },
    get cancel() { return t('cancel'); },
    get close() { return t('close'); },
    saveTo: (n) => t('saveTo', n),
    removeFrom: (n) => t('removeFrom', n),
    notFound: (n) => t('notFound', n),
    get removeAllChecking() { return t('removeAllChecking'); },
    removeAllConfirm: (n) => t('removeAllConfirm', n),
    removeAllResuming: (n) => t('removeAllResuming', n),
    removeAllLeft: (n) => t('removeAllLeft', n),
    removeAllRunning: (n) => t('removeAllRunning', n),
    removeAllDone: (n) => t('removeAllDone', n),
  };

  // ------------------------------------------------------------- helpers

  const isHistoryPage = () => location.pathname === '/feed/history';
  const isPlaylistPage = () => location.pathname === '/playlist';
  const isVisible = (el) => el.getClientRects().length > 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function svgIcon(d, size) {
    // No innerHTML: YouTube enforces Trusted Types.
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  // YouTube's newer components ignore a bare click() — dispatch the full
  // pointer sequence instead.
  function fullClick(node) {
    const r = node.getBoundingClientRect();
    const opts = {
      bubbles: true, cancelable: true, composed: true,
      clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
      button: 0, pointerId: 1, isPrimary: true, view: window,
    };
    node.dispatchEvent(new PointerEvent('pointerdown', opts));
    node.dispatchEvent(new MouseEvent('mousedown', opts));
    node.dispatchEvent(new PointerEvent('pointerup', opts));
    node.dispatchEvent(new MouseEvent('mouseup', opts));
    node.dispatchEvent(new MouseEvent('click', opts));
  }

  function waitFor(fn, timeoutMs) {
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = () => {
        const result = fn();
        if (result) return resolve(result);
        if (performance.now() - start > timeoutMs) return resolve(null);
        setTimeout(tick, 20);
      };
      tick();
    });
  }

  function closeMenu() {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true,
    }));
  }

  // Serialises all background work per video row so a membership check and a
  // click never drive the native menu at the same time.
  const queues = new WeakMap();
  function runExclusive(item, task) {
    const prev = queues.get(item) || Promise.resolve();
    const next = prev.then(task, task);
    queues.set(item, next.catch(() => {}));
    return next;
  }

  // YouTube's dialogs lock page scrolling by cancelling wheel/touch events
  // from a document-level capture listener. While we drive a dialog in the
  // background the user must still be able to scroll, so we stop those events
  // at window capture — before YouTube's scroll lock ever sees them.
  const stopEvent = (ev) => ev.stopPropagation();
  const SCROLL_EVENTS = ['wheel', 'mousewheel', 'DOMMouseScroll', 'touchmove'];

  let lastScroll = 0;
  window.addEventListener('scroll', () => { lastScroll = performance.now(); },
    { passive: true, capture: true });

  // Scrolling the user actually did — wheel, touch, or a scrolling key.
  // Plain scroll events cannot tell this apart from the page scrolling
  // itself, which is exactly what YouTube does when it moves focus.
  const SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End',
    'ArrowUp', 'ArrowDown']);
  let lastScrollInput = -Infinity;
  const noteScrollInput = () => { lastScrollInput = performance.now(); };
  window.addEventListener('wheel', noteScrollInput, { passive: true, capture: true });
  window.addEventListener('touchmove', noteScrollInput, { passive: true, capture: true });
  window.addEventListener('keydown', (ev) => {
    if (SCROLL_KEYS.has(ev.key)) noteScrollInput();
  }, true);

  // Measured: after YouTube removes a video from the history it moves focus
  // to the "removed" banner in that row, and it stays there. The next time
  // one of its menus closes, YouTube hands focus back to that banner, and
  // the browser scrolls it into view — the page jumped ~1000px up to the
  // banner of an earlier removal. Taking focus off such leftovers keeps
  // YouTube from ever going back to them. Nothing the user is typing into
  // is touched: only YouTube's banners and its popup layer.
  const STRAY_FOCUS = 'notification-multi-action-renderer, ytd-popup-container';
  function dropStrayFocus() {
    const active = document.activeElement;
    if (active && active !== document.body && active.closest &&
      active.closest(STRAY_FOCUS)) {
      active.blur();
    }
  }

  let hideDepth = 0;
  function hidePopups() {
    dropStrayFocus();
    if (!hideDepth) {
      document.documentElement.classList.add(HIDE_CLASS);
      SCROLL_EVENTS.forEach((type) =>
        window.addEventListener(type, stopEvent, true));
    }
    hideDepth++;
    // Closing a dialog makes YouTube restore focus, which can jump the page
    // back to the top. Remember where we were and put it back.
    const startedAt = performance.now();
    const scrollTop = window.scrollY;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      hideDepth = Math.max(0, hideDepth - 1);
      if (!hideDepth) {
        document.documentElement.classList.remove(HIDE_CLASS);
        SCROLL_EVENTS.forEach((type) =>
          window.removeEventListener(type, stopEvent, true));
      }
      dropStrayFocus();
      // Only the user's own scrolling counts. Before, any scroll event did,
      // so YouTube's jump switched off the very restore meant to undo it.
      const userScrolled = lastScrollInput > startedAt;
      if (!userScrolled && Math.abs(window.scrollY - scrollTop) > 4) {
        window.scrollTo({ top: scrollTop, behavior: 'instant' });
      }
    };
  }

  // ------------------------------------------------- native menu lookups

  // Legacy menus mix several element types: "Save to playlist" is a
  // navigation item, the downloads page uses its own renderer, everything
  // else is a service item. All of them have to be searched.
  const LEGACY_ITEMS = 'ytd-menu-service-item-renderer, ' +
    'ytd-menu-navigation-item-renderer, ytd-menu-service-item-download-renderer';

  // Some renderers hold several rows and show only one of them.
  const clickTarget = (node) =>
    Array.from(node.querySelectorAll('tp-yt-paper-item')).find(isVisible) ||
    node.querySelector('tp-yt-paper-item') || node;

  // preferLast: several entries can share the trash icon — "remove from
  // downloads" and "remove from this collection" look identical. YouTube
  // consistently puts the collection's own removal last, so that is the one
  // to take.
  function menuItemsByIcon(prefixes, preferLast) {
    const pc = document.querySelector('ytd-popup-container');
    if (!pc) return null;
    const matches = (node) => {
      const p = node.querySelector('svg path');
      const d = p ? p.getAttribute('d') || '' : '';
      return prefixes.some((pre) => d.startsWith(pre));
    };
    let found = null;
    for (const node of pc.querySelectorAll('yt-list-item-view-model')) {
      if (isVisible(node) && matches(node)) {
        found = node.querySelector('button[role="menuitem"], button') || node;
        if (!preferLast) return found;
      }
    }
    if (found) return found;
    for (const node of pc.querySelectorAll(LEGACY_ITEMS)) {
      if (isVisible(node) && matches(node)) {
        found = clickTarget(node);
        if (!preferLast) return found;
      }
    }
    return found;
  }

  // Legacy menus expose their action in Polymer data — used as a fallback so
  // an icon change on YouTube's side cannot break the feature outright.
  function menuItemByEndpoint(test) {
    const pc = document.querySelector('ytd-popup-container');
    if (!pc) return null;
    for (const node of pc.querySelectorAll(LEGACY_ITEMS)) {
      if (!isVisible(node)) continue;
      let ep;
      try {
        ep = node.data?.serviceEndpoint || node.data?.navigationEndpoint;
      } catch (_) { continue; }
      if (ep && test(ep)) return clickTarget(node);
    }
    return null;
  }

  // Legacy renderers also name their icon in Polymer data — another
  // language-independent way to recognise an item.
  function menuItemByIconType(types) {
    const pc = document.querySelector('ytd-popup-container');
    if (!pc) return null;
    for (const node of pc.querySelectorAll(LEGACY_ITEMS)) {
      if (!isVisible(node)) continue;
      let iconType;
      try { iconType = node.data?.icon?.iconType; } catch (_) { continue; }
      if (iconType && types.includes(iconType)) {
        return clickTarget(node);
      }
    }
    return null;
  }

  const findHistoryDeleteItem = () =>
    menuItemsByIcon(TRASH_ICON_PREFIXES, true) ||
    menuItemByEndpoint((ep) => !!ep.feedbackEndpoint) ||
    menuItemByIconType(['DELETE', 'REMOVE']);

  const findSaveItem = () =>
    menuItemsByIcon(SAVE_ICON_PREFIXES) ||
    menuItemByIconType(['BOOKMARK_BORDER', 'BOOKMARK', 'PLAYLIST_ADD',
      'ADD_TO_PLAYLIST']) ||
    menuItemByEndpoint((ep) =>
      Object.keys(ep).some((k) =>
        k.toLowerCase().includes('addtoplaylist') || k === 'showSheetCommand'));

  const findPlaylistRemoveItem = () =>
    menuItemsByIcon(TRASH_ICON_PREFIXES, true) ||
    menuItemByEndpoint((ep) =>
      (ep.playlistEditEndpoint?.actions || [])
        .some((a) => String(a.action || '').includes('REMOVE'))) ||
    menuItemByIconType(['DELETE', 'REMOVE']);

  function findDotsButton(item) {
    return (
      // current architecture (exclude our own buttons)
      item.querySelector(
        '.ytLockupMetadataViewModelMenuButton button-view-model button'
      ) ||
      // legacy architecture
      item.querySelector('ytd-menu-renderer yt-icon-button#button button') ||
      item.querySelector('ytd-menu-renderer yt-icon-button button') ||
      item.querySelector('ytd-menu-renderer yt-button-shape button') ||
      item.querySelector(
        'ytd-menu-renderer button:not(.' + BTN_CLASS + ')' +
        ':not(.' + FALLBACK_CLASS + ')'
      )
    );
  }

  // Opens the row's native menu invisibly and clicks the item `find` returns.
  async function useNativeMenu(item, find) {
    const dots = findDotsButton(item);
    if (!dots) return false;
    fullClick(dots);
    const found = await waitFor(find, 1500);
    if (!found) { closeMenu(); return false; }
    await sleep(30);
    fullClick(find() || found);
    return true;
  }

  // --------------------------------------------------- pins (via bridge)

  let pins = [];
  let settings = {
    showNames: false,
    showOnPlaylists: true,
    showOnWatchLater: true,
    alwaysShow: true,
  };
  let customIcons = [];   // the user's own uploaded images
  // Symbol of a playlist that was unpinned, by playlist name. Pinning it
  // again restores it instead of falling back to the thumbnail.
  let glyphMemory = {};
  let lastShape = '';
  const savePins = () =>
    window.postMessage(
      { type: 'YQA_SET', pins, settings, glyphs: glyphMemory }, '*');
  const findPin = (name) => pins.find((p) => p.name === name);

  // Counts one completed quick action. Only ever read back by the options
  // page; nothing about it leaves the browser.
  const bumpStat = (what) =>
    window.postMessage({ type: 'YQA_BUMP', what }, '*');

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data) return;
    if (ev.data.type === 'YQA_STATE') {
      pins = Array.isArray(ev.data.pins) ? ev.data.pins : [];
      if (ev.data.settings) settings = ev.data.settings;
      // Remembered playlist membership makes the marking appear instantly
      // on videos that were already looked at in an earlier session.
      // Storage is the shared source of truth: adopting it wholesale is what
      // lets a change made in another tab show up here right away.
      if (ev.data.mem && typeof ev.data.mem === 'object') {
        for (const id of Object.keys(ev.data.mem)) {
          membership.set(id, new Set(ev.data.mem[id]));
          probed.add(id);
        }
      }
      if (Array.isArray(ev.data.custom)) customIcons = ev.data.custom;
      if (ev.data.glyphs && typeof ev.data.glyphs === 'object') {
        glyphMemory = ev.data.glyphs;
      }
      if (ev.data.changes && typeof ev.data.changes === 'object') {
        let touched = false;
        for (const key of Object.keys(ev.data.changes)) {
          const entry = ev.data.changes[key];
          const split = key.indexOf('|');
          if (split < 1 || !entry) continue;
          if (rememberChange(key.slice(0, split), key.slice(split + 1),
            !!entry.member, Number(entry.ts) || 0)) touched = true;
        }
        if (touched) queueScan();
      }
      if (ev.data.snapshots && typeof ev.data.snapshots === 'object') {
        for (const listId of Object.keys(ev.data.snapshots)) {
          const stored = ev.data.snapshots[listId];
          if (stored && Array.isArray(stored.ids)) {
            snapshots.set(listId, {
              ids: new Set(stored.ids),
              complete: !!stored.complete,
              ts: Number(stored.ts) || 0,
            });
          }
        }
      }
      // Rebuilding every bar is only needed when the pins or the display
      // settings changed; a pure membership update just re-marks them.
      const shape = JSON.stringify([pins, settings]);
      if (shape !== lastShape) {
        lastShape = shape;
        updateDialogRows();
        rebuildBars();
      } else {
        updateAllBars();
      }
      refreshSnapshots();
    } else if (ev.data.type === 'YQA_ICON_DATA') {
      iconLibrary = ev.data.icons || null;
      if (onIconsReady) { const fn = onIconsReady; onIconsReady = null; fn(); }
    }
  });
  window.postMessage({ type: 'YQA_GET' }, '*');

  // --------------------------------------------------------- hint bubble

  let hint = null;
  let hintTimer = null;

  function hideHint() {
    clearTimeout(hintTimer);
    if (hint) { hint.remove(); hint = null; }
  }

  function showHint(anchor, text, autoHideMs) {
    hideHint();
    hint = el('div', 'yqa-hint', text);
    document.body.appendChild(hint);
    const r = anchor.getBoundingClientRect();
    hint.style.left = Math.max(8, Math.min(
      innerWidth - hint.offsetWidth - 8,
      r.left + r.width / 2 - hint.offsetWidth / 2)) + 'px';
    const above = r.top - hint.offsetHeight - 8;
    hint.style.top = (above > 8 ? above : r.bottom + 8) + 'px';
    if (autoHideMs) hintTimer = setTimeout(hideHint, autoHideMs);
  }

  // ------------------------------------------------- "Save to…" dialog IO

  const dialogRows = () =>
    Array.from(document.querySelectorAll('toggleable-list-item-view-model'))
      .filter(isVisible);

  function rowName(row) {
    const title = row.querySelector('.ytListItemViewModelTitle');
    return title ? title.textContent.trim() : '';
  }

  function rowThumb(row) {
    const img = row.querySelector('img');
    return img ? img.src : '';
  }

  // The outline bookmark icon carries an extra sub-path ("…ZM5 20.233…");
  // the filled one (= video is in this playlist) does not.
  function rowIsChecked(row) {
    const p = row.querySelector('.ytListItemViewModelAccessory svg path');
    return !!p && !(p.getAttribute('d') || '').includes('20.233');
  }

  // ------------------------------------------------ playlist membership

  // ---------------------------------------------------------- snapshots
  //
  // Marking has to be right the moment a row appears, and YouTube ships no
  // membership data with its feeds. So instead of asking per video, the
  // contents of the pinned playlists are read once (the same pages the
  // browser would load anyway) and matched locally.

  // A playlist page is over a megabyte, so snapshots are refreshed rarely
  // and at most one per page load. In between they stay accurate because
  // every add and remove updates them locally.
  const SNAPSHOT_MAX_AGE = 6 * 60 * 60 * 1000;
  const PAGE_SIZE = 100; // what one playlist page returns

  // listId -> { ids: Set, complete: boolean, ts: number }
  const snapshots = new Map();
  let playlistIndex = null; // playlist title -> listId

  const parseInitialData = (html) => {
    const m = html.match(/var ytInitialData\s*=\s*(\{.+?\});<\/script>/s);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (_) { return null; }
  };

  function walkData(root, visit) {
    const seen = new Set();
    (function walk(value, depth) {
      if (!value || typeof value !== 'object' || depth > 60) return;
      if (seen.has(value)) return;
      seen.add(value);
      visit(value);
      for (const key in value) walk(value[key], depth + 1);
    })(root, 0);
  }

  async function fetchInitialData(path) {
    const res = await fetch(path, { credentials: 'include' });
    if (!res.ok) return null;
    return parseInitialData(await res.text());
  }

  // Titles differ between YouTube's surfaces ("Watch later" in the dialog vs.
  // the localised sidebar label), so ids come from the playlist overview.
  async function ensurePlaylistIndex() {
    if (playlistIndex) return playlistIndex;
    const data = await fetchInitialData('/feed/playlists');
    const index = new Map();
    if (data) {
      walkData(data, (node) => {
        const lockup = node.lockupViewModel;
        if (!lockup || typeof lockup.contentId !== 'string') return;
        if (lockup.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST') return;
        const title = JSON.stringify(lockup.metadata || '')
          .match(/"content":"((?:[^"\\]|\\.)*)"/);
        if (title) {
          try { index.set(JSON.parse('"' + title[1] + '"'), lockup.contentId); }
          catch (_) { /* skip odd titles */ }
        }
      });
    }
    playlistIndex = index;
    return index;
  }

  async function resolveListId(pin) {
    if (pin.listId) return pin.listId;
    const index = await ensurePlaylistIndex();
    // YouTube calls this one "Watch later" in the save dialog but shows the
    // localised name everywhere else.
    const id = index.get(pin.name) ||
      (pin.name === 'Watch later' ? 'WL' : '');
    if (id) {
      pin.listId = id;
      savePins();
    }
    return id;
  }

  async function fetchSnapshot(listId) {
    const data = await fetchInitialData('/playlist?list=' +
      encodeURIComponent(listId));
    if (!data) return null;
    const ids = new Set();
    walkData(data, (node) => {
      const video = node.playlistVideoRenderer;
      if (video && typeof video.videoId === 'string') ids.add(video.videoId);
    });
    // A short page means we saw the whole playlist; a full one means there
    // is more behind a continuation we deliberately do not request.
    return { ids, complete: ids.size < PAGE_SIZE, ts: Date.now() };
  }

  const publishSnapshot = (listId, snap) =>
    window.postMessage({
      type: 'YQA_SNAPSHOT',
      listId,
      ids: [...snap.ids],
      complete: snap.complete,
      ts: snap.ts,
    }, '*');

  let refreshing = false;
  async function refreshSnapshots() {
    if (refreshing || !pins.length) return;
    refreshing = true;
    try {
      let fetched = 0;
      for (const pin of pins.slice()) {
        const listId = await resolveListId(pin);
        if (!listId) continue;
        const known = snapshots.get(listId);
        if (known && Date.now() - known.ts < SNAPSHOT_MAX_AGE) continue;
        if (fetched >= 1) break; // one playlist page per load is plenty
        const snap = await fetchSnapshot(listId);
        if (!snap) continue;
        fetched++;
        snapshots.set(listId, snap);
        publishSnapshot(listId, snap);
        updateAllBars();
      }
    } catch (_) {
      // Offline or a changed page shape — the dialog probe still covers us.
    } finally {
      refreshing = false;
    }
  }

  // videoId -> Set of playlist names containing the video (probe results,
  // used for playlists whose snapshot is not complete).
  const membership = new Map();
  const probed = new Set();

  // 'in' | 'out' | 'unknown'
  function pinState(videoId, pin) {
    const snap = pin.listId ? snapshots.get(pin.listId) : null;
    if (snap) {
      if (snap.ids.has(videoId)) return 'in';
      if (snap.complete) return 'out';
    }
    const names = membership.get(videoId);
    if (names) return names.has(pin.name) ? 'in' : 'out';
    return 'unknown';
  }

  const anyUnknown = (videoId) =>
    pins.some((pin) => pinState(videoId, pin) === 'unknown');

  function setSnapshotMember(pin, videoId, isMember) {
    if (!videoId || !pin.listId) return;
    noteChange(pin.listId, videoId, isMember);
    const snap = snapshots.get(pin.listId);
    if (!snap) return;
    if (isMember) snap.ids.add(videoId); else snap.ids.delete(videoId);
    publishSnapshot(pin.listId, snap);
  }

  function videoId(item) {
    const link = item.querySelector('a[href*="/watch?v="]');
    if (!link) return '';
    const m = /[?&]v=([^&]+)/.exec(link.getAttribute('href') || '');
    return m ? m[1] : '';
  }

  const rememberMembership = (id) => {
    const set = membership.get(id);
    if (!id || !set) return;
    window.postMessage(
      { type: 'YQA_MEM', id, names: [...set] }, '*');
  };

  const markMember = (id, name, isMember) => {
    if (!id) return;
    const set = membership.get(id) || new Set();
    if (isMember) set.add(name); else set.delete(name);
    membership.set(id, set);
  };

  // On a playlist page every listed video is by definition in that playlist.
  // Matching happens through the playlist id from the URL, because the page
  // title is localised while the dialog is not ("Watch later" stays English).
  const currentListId = () =>
    isPlaylistPage()
      ? (new URLSearchParams(location.search).get('list') || '')
      : '';

  function currentPlaylistName() {
    const id = currentListId();
    if (!id) return '';
    const pin = pins.find((p) => p.listId && p.listId === id);
    return pin ? pin.name : '';
  }

  function readMembershipFromDialog() {
    const names = new Set();
    dialogRows().forEach((row) => {
      if (rowIsChecked(row)) names.add(rowName(row));
    });
    return names;
  }

  // Reading which playlists contain a video means opening YouTube's own
  // "Save to…" dialog, so this only runs after a deliberate hover over the
  // bar, never while the user is scrolling, and at most once per video.
  function ensureMembership(item) {
    const id = videoId(item);
    if (!id || probed.has(id)) return Promise.resolve();
    // Snapshots usually answer this already; only ask YouTube when some
    // pinned playlist is too large for its snapshot to be conclusive.
    if (!anyUnknown(id)) return Promise.resolve();
    if (performance.now() - lastScroll < 300) return Promise.resolve();
    probed.add(id);
    return runExclusive(item, async () => {
      const unhide = hidePopups();
      try {
        const opened = await useNativeMenu(item, findSaveItem);
        if (!opened) { probed.delete(id); return; }
        const ready = await waitFor(() => dialogRows().length, 2500);
        if (!ready) { probed.delete(id); closeMenu(); return; }
        await sleep(80);
        const names = readMembershipFromDialog();
        const current = currentPlaylistName();
        if (current) names.add(current);
        membership.set(id, names);
        closeMenu();
        rememberMembership(id);
        updateAllBars();
      } catch (_) {
        probed.delete(id);
      } finally {
        await sleep(150);
        unhide();
      }
    });
  }

  // ------------------------------------------------------ trash buttons

  function wireButton(btn, label, onClick) {
    btn.classList.add(BTN_CLASS);
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    return btn;
  }

  // Pixel-perfect native look: clone YouTube's own overflow button and swap
  // its icon, so hover circle, size and dark mode come for free.
  function cloneNativeButton(dots) {
    const btn = dots.cloneNode(true);
    btn.removeAttribute('aria-expanded');
    btn.removeAttribute('id');
    const svg = btn.querySelector('svg');
    if (!svg) return null;
    const fresh = svgIcon(TRASH_PATH, 24);
    ['width', 'height', 'class'].forEach((a) => {
      const v = svg.getAttribute(a);
      if (v) fresh.setAttribute(a, v);
    });
    svg.replaceWith(fresh);
    return btn;
  }

  function makeFallbackButton() {
    const btn = el('button', FALLBACK_CLASS);
    btn.type = 'button';
    btn.appendChild(svgIcon(TRASH_PATH, 24));
    return btn;
  }

  function removeFromHistory(item) {
    runExclusive(item, async () => {
      const unhide = hidePopups();
      try {
        if (await useNativeMenu(item, findHistoryDeleteItem)) {
          bumpStat('removed');
        }
      } finally {
        await sleep(250);
        unhide();
      }
    });
  }

  // quick: used by the bulk run, where the loop already waits for the row to
  // disappear, so the extra settling pause is not needed.
  function removeFromPlaylist(item, quick) {
    return runExclusive(item, async () => {
      const unhide = hidePopups();
      try {
        const ok = await useNativeMenu(item, findPlaylistRemoveItem);
        if (ok) bumpStat('removed');
        return ok;
      } finally {
        await sleep(quick ? 60 : 250);
        unhide();
      }
    });
  }

  // ------------------------------------------- remove every Watch later row

  // YouTube only offers "remove watched videos", so clearing the list means
  // repeating the single-video removal. The first row is taken each time,
  // because the list closes the gap after every removal.
  let bulkAbort = false;
  // YouTube drops the row from the page as soon as it is clicked, even when
  // the request behind it fails. So the run starts brisk and only slows down
  // if a pass actually left videos behind.
  const BULK_PAUSE_MIN = 110;
  const BULK_PAUSE_MAX = 600;
  const PACE_KEY = 'yqaBulkPause';
  const bulkPause = () => {
    let stored = 0;
    try { stored = Number(sessionStorage.getItem(PACE_KEY)) || 0; } catch (_) {}
    return Math.min(BULK_PAUSE_MAX, Math.max(BULK_PAUSE_MIN, stored));
  };
  let bulkToastTimer = null;
  const BULK_KEY = 'yqaBulkResume';
  const BULK_MAX_PASSES = 12;

  // The page only holds a hundred rows at a time, so the real number comes
  // from the playlist's own header.
  // YouTube keeps the previous page's DOM around after an in-app navigation,
  // so anything counted here has to be visible — otherwise the rows of the
  // page visited before are counted as part of this playlist.
  const ROW_SELECTOR = 'ytd-playlist-video-renderer, yt-lockup-view-model';
  const visibleRows = () =>
    Array.from(document.querySelectorAll(ROW_SELECTOR))
      .filter((row) => row.getBoundingClientRect().height > 10);

  function playlistVideoCount() {
    const listed = visibleRows().length;
    const wrapper = document.querySelector('.metadata-buttons-wrapper');
    const scope = wrapper && wrapper.parentElement;
    if (scope) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = (node.textContent || '').trim();
        if (!/^\d[\d.,\s ]*$/.test(text)) continue;
        const value = parseInt(text.replace(/\D/g, ''), 10);
        if (value >= listed) return value;
      }
    }
    return listed;
  }

  // A page keeps showing a video for a while after it was removed, so a fresh
  // read of it would undo what the user just did. Recent changes therefore
  // win over whatever the page still shows.
  // Shared with the other tabs: a change made here must not be undone by a
  // tab whose page still shows the old state.
  const CHANGE_TTL = 90000;
  const recentChanges = new Map(); // videoId -> Map(listId -> {member, ts})

  function rememberChange(listId, id, member, ts) {
    let byList = recentChanges.get(id);
    if (!byList) { byList = new Map(); recentChanges.set(id, byList); }
    const known = byList.get(listId);
    if (known && known.ts >= ts) return false;
    byList.set(listId, { member, ts });
    return true;
  }

  function noteChange(listId, id, member) {
    if (!listId || !id) return;
    const ts = Date.now();
    rememberChange(listId, id, member, ts);
    window.postMessage({ type: 'YQA_CHANGE', listId, id, member, ts }, '*');
  }

  function applyRecentChanges(listId, ids) {
    const now = Date.now();
    recentChanges.forEach((byList, id) => {
      const entry = byList.get(listId);
      if (!entry) return;
      if (now - entry.ts > CHANGE_TTL) { byList.delete(listId); return; }
      if (entry.member) ids.add(id); else ids.delete(id);
    });
  }

  function dropFromSnapshot(listId, id) {
    const snap = listId ? snapshots.get(listId) : null;
    if (!snap || !id || !snap.ids.has(id)) return;
    snap.ids.delete(id);
    noteChange(listId, id, false);
    publishSnapshot(listId, snap);
    updateAllBars();
  }

  // How many videos the playlist really still holds, asked of YouTube itself
  // rather than of the page we just emptied.
  async function remainingOnServer(listId) {
    const snap = await fetchSnapshot(listId);
    if (!snap) return -1;
    snapshots.set(listId, snap);
    publishSnapshot(listId, snap);
    return snap.ids.size;
  }

  async function removeAllInPlaylist(onProgress) {
    bulkAbort = false;
    let removed = 0;
    let failures = 0;
    document.documentElement.classList.add('yqa-bulk-running');
    try {
      return await bulkLoop();
    } finally {
      // YouTube queues one toast per removal and keeps showing them after the
      // run has finished, so the suppression outlives the loop.
      clearTimeout(bulkToastTimer);
      bulkToastTimer = setTimeout(
        () => document.documentElement.classList.remove('yqa-bulk-running'),
        6000);
    }

    async function bulkLoop() {
      const rowCount = () => visibleRows().length;
      while (!bulkAbort && failures < 3) {
        const rows = visibleRows();
        if (!rows.length) {
          // Only a page's worth exists at a time; give YouTube a moment to
          // load the next batch before calling it done.
          const more = await waitFor(rowCount, 4000);
          if (!more) break;
          continue;
        }

        let handled = 0;
        // "Liked videos" keeps its rows until the page is reloaded, so once
        // that is clear there is nothing to wait for on the following ones.
        let rowsStay = false;
        for (const row of rows) {
          if (bulkAbort) break;
          if (!row.isConnected) continue;
          const id = videoId(row);
          const before = rowCount();
          await removeFromPlaylist(row, true);
          const vanished = await waitFor(
            () => !row.isConnected || rowCount() < before,
            rowsStay ? 150 : 900);
          if (!vanished && !handled) rowsStay = true;
          handled++;
          removed++;
          dropFromSnapshot(currentListId(), id);
          if (onProgress) onProgress(removed);
          await sleep(bulkPause());
        }

        if (!handled) { failures++; continue; }
        failures = 0;
        // Nothing disappeared: this page keeps its rows, so a second lap over
        // the same ones would be pointless — the reload pass handles the rest.
        if (rows.every((r) => r.isConnected)) break;
      }
      return { removed, aborted: bulkAbort, failed: failures >= 3 };
    }
  }

  const BULK_LISTS = ['WL', 'LL'];

  function injectBulkButton() {
    if (BULK_LISTS.indexOf(currentListId()) === -1) return;
    const wrapper = document.querySelector('.metadata-buttons-wrapper');
    if (!wrapper) return;
    if (wrapper.querySelector('.yqa-bulk-btn')) return;

    // These sidebar buttons get their filled circle — and their own colours,
    // which differ from the page text — from the element around the <button>.
    // Cloning that whole control is what makes ours look identical.
    const reference = Array.from(wrapper.querySelectorAll('button'))
      .filter((b) => b.getBoundingClientRect().width > 20 &&
        !b.closest('.yqa-bulk-btn'))
      .map((b) => b.closest('yt-button-shape'))
      .find(Boolean);

    let control = null;
    let btn = null;
    if (reference) {
      control = reference.cloneNode(true);
      btn = control.querySelector('button');
      const svg = control.querySelector('svg');
      if (btn && svg) {
        const fresh = svgIcon(TRASH_PATH, 24);
        ['width', 'height', 'class'].forEach((attr) => {
          const value = svg.getAttribute(attr);
          if (value) fresh.setAttribute(attr, value);
        });
        svg.replaceWith(fresh);
        control.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
        control.removeAttribute('id');
      } else {
        control = null;
      }
    }
    // Nothing to clone yet: YouTube paints these buttons a moment after the
    // page appears. Waiting for the real thing avoids showing a mismatched
    // button first and shifting the row once it is replaced.
    if (!control) return;

    // Deliberately not tagged with the usual button class: that one carries
    // the page text colour, which is wrong on the sidebar's own background.
    control.classList.add('yqa-bulk-btn');
    btn.setAttribute('aria-label', T.removeAll);
    btn.removeAttribute('aria-expanded');
    btn.addEventListener('mouseenter', () => showHint(btn, T.removeAll));
    btn.addEventListener('mouseleave', hideHint);
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      hideHint();
      openBulkDialog();
    });
    wrapper.appendChild(control);
  }

  function openBulkDialog(autoStart) {
    if (document.querySelector('.yqa-modal')) return;
    const count = playlistVideoCount();

    const overlay = el('div', 'yqa-modal');
    const box = el('div', 'yqa-modal-box');
    const title = el('div', 'yqa-modal-title', T.removeAll);
    const text = el('div', 'yqa-modal-text', T.removeAllConfirm(count));
    const row = el('div', 'yqa-modal-actions');
    const cancel = el('button', 'yqa-modal-btn', T.cancel);
    const go = el('button', 'yqa-modal-btn yqa-modal-danger', T.removeAll);
    cancel.type = 'button';
    go.type = 'button';
    row.appendChild(cancel);
    row.appendChild(go);
    box.appendChild(title);
    box.appendChild(text);
    box.appendChild(row);
    overlay.appendChild(box);

    // Keep the clicks away from YouTube — but in the bubble phase, after our
    // own buttons have seen them. Stopping during capture would swallow them
    // before they ever reach the buttons.
    ['pointerdown', 'mousedown', 'click', 'wheel'].forEach((type) =>
      overlay.addEventListener(type, (ev) => ev.stopPropagation()));

    // Closing the dialog always stops a run in progress.
    const close = () => { bulkAbort = true; overlay.remove(); };
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close();
    });

    const run = async () => {
      if (go.isConnected) go.remove();
      text.textContent = T.removeAllRunning(count);
      const result = await removeAllInPlaylist((done) => {
        text.textContent = T.removeAllRunning(Math.max(0, count - done));
      });

      // The page empties optimistically, so ask YouTube what is really left
      // instead of trusting the emptied list.
      const listId = currentListId();
      let left = -1;
      if (!result.aborted && listId) {
        text.textContent = T.removeAllChecking;
        left = await remainingOnServer(listId);
      }

      const passes = Number(sessionStorage.getItem(BULK_KEY + 'Passes') || 0);
      if (left > 0 && result.removed > 0 && passes < BULK_MAX_PASSES) {
        // Rows YouTube kept can only be reached again after a reload.
        text.textContent = T.removeAllResuming(left);
        try {
          sessionStorage.setItem(BULK_KEY, listId);
          sessionStorage.setItem(BULK_KEY + 'Passes', String(passes + 1));
          // Leftovers mean the pace was too brisk for YouTube — ease off.
          sessionStorage.setItem(PACE_KEY,
            String(Math.min(BULK_PAUSE_MAX, Math.round(bulkPause() * 1.8))));
        } catch (_) { /* private mode */ }
        await sleep(900);
        location.reload();
        return;
      }

      try {
        sessionStorage.removeItem(BULK_KEY);
        sessionStorage.removeItem(BULK_KEY + 'Passes');
        sessionStorage.removeItem(PACE_KEY);
      } catch (_) { /* ignore */ }
      text.textContent = left > 0
        ? T.removeAllLeft(left)
        : T.removeAllDone(result.removed);
      cancel.textContent = T.close;
    };

    go.addEventListener('click', run);
    document.body.appendChild(overlay);
    if (autoStart) run();
  }

  // Picks the run back up after the reload it asked for.
  function resumeBulkIfPending() {
    let pending = null;
    try { pending = sessionStorage.getItem(BULK_KEY); } catch (_) { return; }
    if (!pending || pending !== currentListId()) return;
    if (!firstVisible('ytd-playlist-video-renderer')) return;
    openBulkDialog(true);
  }

  // mode: 'history' | 'playlist' | 'corner'
  //  - history / playlist put the button beside the overflow menu
  //  - corner pins it to the bottom right of the row, for the pages where
  //    the quick-save icons are not shown (downloads, liked videos)
  function injectTrash(item, mode) {
    if (item.querySelector('.' + BTN_CLASS)) return;
    const label = mode === 'history' ? T.removeHistory
      : mode === 'download' ? T.removeDownload
      : T.removePlaylist;
    const action = mode === 'history'
      ? () => removeFromHistory(item)
      : () => removeFromPlaylist(item);

    const menuBox = item.querySelector('.ytLockupMetadataViewModelMenuButton');
    const dots = menuBox
      ? menuBox.querySelector('button-view-model button')
      : item.querySelector('ytd-menu-renderer button');
    // Only the current architecture's button can be cloned; the legacy one
    // takes its size from the surrounding layout and would blow up.
    const btn = (menuBox && dots && cloneNativeButton(dots)) ||
      makeFallbackButton();
    wireButton(btn, label, action);

    if (mode === 'corner') {
      // Bottom right of the row's hover area.
      const host = item.querySelector('.ytLockupViewModelMetadata') ||
        item.querySelector('#dismissible') || item;
      host.classList.add('yqa-corner-host');
      btn.classList.add('yqa-corner');
      host.appendChild(btn);
      return;
    }

    // Current architecture: right of the dots (on the left it would overlap
    // long titles).
    if (menuBox) {
      if (!dots) return;
      btn.classList.add('yqa-right-of-dots');
      menuBox.appendChild(btn);
      return;
    }

    // Legacy architecture (playlists, Watch later): left of the dots.
    const menu = item.querySelector('ytd-menu-renderer');
    if (!menu || !menu.parentElement) return;
    menu.parentElement.classList.add('yqa-menu-host');
    menu.parentElement.insertBefore(btn, menu);
  }

  // -------------------------------------------------------- emoji picker

  // "All emojis": every emoji the user's own system can render, derived at
  // runtime from the Unicode blocks. Undrawable code points are filtered out
  // via a canvas signature check, so no emoji data has to be shipped and the
  // result matches whatever font the user's OS provides.
  let allEmojisCache = null;

  function buildAllEmojis() {
    if (allEmojisCache) return allEmojisCache;
    try {
      const stored = JSON.parse(localStorage.getItem('yqa-emoji-all') || 'null');
      if (stored && stored.v === 1 && Array.isArray(stored.list) && stored.list.length) {
        allEmojisCache = stored.list;
        return allEmojisCache;
      }
    } catch (_) { /* cache is optional */ }

    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.textBaseline = 'top';
    ctx.font = '16px sans-serif';
    const sig = (ch) => {
      ctx.clearRect(0, 0, 20, 20);
      ctx.fillText(ch, 0, 0);
      const d = ctx.getImageData(0, 0, 20, 20).data;
      let h = 0;
      let painted = 0;
      for (let i = 0; i < d.length; i += 16) {
        h = (h * 31 + d[i] + d[i + 1] + d[i + 2] + d[i + 3]) >>> 0;
        if (d[i + 3]) painted++;
      }
      return h + ':' + painted;
    };
    const tofu = sig('\uFFFF');
    const blank = sig('\u200B');

    const ranges = [
      [0x1F600, 0x1F64F, ''],        // emoticons
      [0x1F300, 0x1F5FF, ''],        // symbols & pictographs
      [0x1F680, 0x1F6FF, ''],        // transport
      [0x1F900, 0x1F9FF, ''],        // supplemental symbols
      [0x1FA70, 0x1FAFF, ''],        // extended-A
      [0x2600, 0x26FF, '\uFE0F'],    // misc symbols
      [0x2700, 0x27BF, '\uFE0F'],    // dingbats
    ];
    const list = [];
    for (const [from, to, suffix] of ranges) {
      for (let cp = from; cp <= to; cp++) {
        const ch = String.fromCodePoint(cp) + suffix;
        const s = sig(ch);
        if (s !== tofu && s !== blank) list.push(ch);
      }
    }
    allEmojisCache = list;
    try {
      localStorage.setItem('yqa-emoji-all', JSON.stringify({ v: 1, list }));
    } catch (_) { /* cache is optional */ }
    return list;
  }

  // ---------------------------------------------------------- lucide icons

  // The full library (~1800 icons) is fetched from the extension only when
  // the picker is opened. Pinned playlists carry their own drawing data, so
  // the bar renders without it.
  let iconLibrary = null;
  let onIconsReady = null;

  function loadIcons() {
    if (iconLibrary) return Promise.resolve(iconLibrary);
    return new Promise((resolve) => {
      onIconsReady = () => resolve(iconLibrary);
      window.postMessage({ type: 'YQA_ICONS' }, '*');
      setTimeout(() => {
        if (onIconsReady) { onIconsReady = null; resolve(iconLibrary); }
      }, 8000);
    });
  }

  // Lucide icons are stroke drawings made of several shapes.
  function lucideIcon(nodes, size) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('yqa-lucide');
    for (const [tag, attrs] of nodes) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const key of Object.keys(attrs)) {
        node.setAttribute(key, String(attrs[key]));
      }
      svg.appendChild(node);
    }
    return svg;
  }

  // Wheel events are intercepted too: YouTube's dialog cancels scrolling
  // outside itself, which would freeze the picker's own grid.
  const PICKER_EVENTS = ['pointerdown', 'mousedown', 'click', 'touchstart',
    'wheel', 'mousewheel', 'DOMMouseScroll'];

  let picker = null;
  let pickerFor = null;
  let pickerActions = null;
  let fileField = null;

  function closeEmojiPicker() {
    if (picker) picker.remove();
    if (fileField) { fileField.remove(); fileField = null; }
    picker = null;
    pickerFor = null;
    pickerActions = null;
    PICKER_EVENTS.forEach((type) =>
      window.removeEventListener(type, pickerGuard, true));
    window.removeEventListener('keydown', pickerKeyGuard, true);
  }

  // The picker lives in <body> so nothing can clip it, but YouTube's dialog
  // closes on any outside pointer event it sees. We therefore intercept the
  // picker's own events at window capture (before YouTube's document-level
  // handler) and dispatch the interaction ourselves.
  function pickerGuard(ev) {
    if (!picker) return;
    // Our file field sits outside the picker; its click must not reach
    // YouTube either, or the dialog behind us would close. Stopping the
    // event does not cancel the browser's own action, so the file dialog
    // still opens.
    if (fileField && ev.target === fileField) {
      ev.stopPropagation();
      return;
    }
    if (!picker.contains(ev.target)) {
      // Leave the icon buttons alone: their own click handler toggles the
      // picker, so closing here would immediately reopen it.
      if (ev.target.closest && ev.target.closest('.yqa-emoji-btn')) return;
      if (ev.type === 'pointerdown') closeEmojiPicker();
      return;
    }
    // Only stop it from reaching YouTube — never cancel it, so the grid
    // keeps scrolling normally.
    // Only stop it from reaching YouTube — never cancel it, so text fields,
    // sliders and the file dialog keep working.
    ev.stopPropagation();
    if (ev.type === 'pointerdown') {
      const input = ev.target.closest('input[type="text"]');
      if (input) setTimeout(() => input.focus(), 0);
      const dragger = ev.target.closest('[data-yqa-down]');
      if (dragger && pickerActions) {
        const fn = pickerActions.get(dragger.dataset.yqaDown);
        if (fn) fn(dragger, ev);
      }
    } else if (ev.type === 'click') {
      const target = ev.target.closest('[data-yqa-act]');
      if (target && pickerActions) {
        const fn = pickerActions.get(target.dataset.yqaAct);
        if (fn) fn(target, ev);
      }
    } else if (ev.type === 'wheel') {
      const zoomer = ev.target.closest('[data-yqa-wheel]');
      if (zoomer && pickerActions) {
        const fn = pickerActions.get(zoomer.dataset.yqaWheel);
        if (fn) fn(zoomer, ev);
      }
    }
  }

  function pickerKeyGuard(ev) {
    if (!picker) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); closeEmojiPicker(); }
  }

  function setGlyph(name, { icon = '', emoji = '', nodes = null, image = '' }) {
    const pin = findPin(name);
    if (pin) {
      pin.icon = icon;
      pin.emoji = emoji;
      pin.image = image;
      // Store the drawing with the pin so the bar never needs the library.
      pin.nodes = nodes;
      savePins();
      updateDialogRows();
      rebuildBars();
    }
    closeEmojiPicker();
  }

  // Grid entries are either {icon, nodes} (Lucide) or {emoji}. Large sets are
  // rendered in chunks so opening "All icons" stays instant.
  const CHUNK = 240;

  function renderGrid(grid, entries) {
    grid.textContent = '';
    grid.scrollTop = 0;
    if (!entries.length) {
      grid.appendChild(el('div', 'yqa-picker-empty', T.noResults));
      return;
    }
    let shown = 0;
    const appendChunk = () => {
      const next = Math.min(shown + CHUNK, entries.length);
      for (; shown < next; shown++) {
        const entry = entries[shown];
        if (entry.upload) {
          const cell = el('button', 'yqa-picker-cell yqa-upload-cell');
          cell.type = 'button';
          cell.title = T.uploadImage;
          cell.dataset.yqaAct = 'upload';
          cell.appendChild(svgIcon(PLUS_PATH, 22));
          grid.appendChild(cell);
          continue;
        }
        if (entry.image) {
          const cell = el('div', 'yqa-picker-cell yqa-image-cell');
          const pick = el('button', 'yqa-image-pick');
          pick.type = 'button';
          pick.dataset.yqaAct = 'pick';
          pick.dataset.yqaImage = entry.image;
          const thumb = document.createElement('img');
          thumb.src = entry.image;
          thumb.alt = '';
          pick.appendChild(thumb);
          const edit = el('button', 'yqa-image-edit');
          edit.type = 'button';
          edit.title = T.editImage;
          edit.dataset.yqaAct = 'editimage';
          edit.dataset.yqaId = entry.id;
          edit.appendChild(svgIcon(PENCIL_PATH, 11));
          const del = el('button', 'yqa-image-del');
          del.type = 'button';
          del.title = T.deleteImage;
          del.dataset.yqaAct = 'delimage';
          del.dataset.yqaId = entry.id;
          del.appendChild(svgIcon(CLOSE_PATH, 12));
          cell.appendChild(pick);
          cell.appendChild(edit);
          cell.appendChild(del);
          grid.appendChild(cell);
          continue;
        }
        const b = el('button', 'yqa-picker-cell');
        b.type = 'button';
        b.dataset.yqaAct = 'pick';
        if (entry.icon) {
          b.dataset.yqaIcon = entry.icon;
          b.title = entry.icon.replace(/-/g, ' ');
          b.appendChild(lucideIcon(entry.nodes, 22));
        } else {
          b.dataset.yqaEmoji = entry.emoji;
          b.classList.add('yqa-picker-cell-emoji');
          b.textContent = entry.emoji;
        }
        grid.appendChild(b);
      }
    };
    appendChunk();
    grid.onscroll = () => {
      if (shown >= entries.length) { grid.onscroll = null; return; }
      if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 200) {
        appendChunk();
      }
    };
  }

  // ------------------------------------------------- own uploaded images

  const ICON_PX = 96;      // stored size — small enough to be free, sharp at 40
  const PREVIEW_PX = 148;  // editing size
  // A scaled-down copy of the upload is kept so the crop can be changed
  // later. 384 px means even the deepest zoom still has real pixels behind
  // it (96 px output at 4× reads a 96 px region of the source).
  const SOURCE_PX = 384;
  // Must stay under what the storage bridge accepts, or the copy would be
  // dropped there and the picture could not be adjusted a second time.
  const SOURCE_MAX = 76000;
  const MIN_ZOOM = 0.2;    // far enough out to fit a tightly cropped drawing
  const MAX_ZOOM = 4;

  const saveCustomIcons = () =>
    window.postMessage({ type: 'YQA_CUSTOM_SET', custom: customIcons }, '*');

  function loadImage(uri) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = uri;
    });
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => loadImage(reader.result).then(resolve, reject);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // The editable copy: same picture, bounded size, one uniform format.
  // A busy photograph can still be large at full detail, so the quality and
  // then the size give way until it fits — measured, not assumed: a noisy
  // 384 px image lands at 121 KB, far over what may be stored.
  function toSource(img) {
    const draw = (px) => {
      const scale = Math.min(1, px / Math.max(img.width, img.height, 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas;
    };
    const big = draw(SOURCE_PX);
    const small = draw(SOURCE_PX / 2);
    for (const [canvas, quality] of [[big, 0.9], [big, 0.7], [big, 0.5],
      [small, 0.7], [small, 0.4]]) {
      const uri = canvas.toDataURL('image/webp', quality);
      if (uri.length <= SOURCE_MAX) return uri;
    }
    return '';   // no editable copy; the finished crop stays the fallback
  }

  // Everything is drawn through a canvas: any format becomes the same small
  // WebP, and an SVG loses whatever it might have carried along.
  function renderCircle(img, view, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    const cover = Math.max(size / img.width, size / img.height);
    const scale = cover * view.zoom;
    const w = img.width * scale;
    const h = img.height * scale;
    const factor = size / PREVIEW_PX;
    ctx.drawImage(img,
      size / 2 - w / 2 + view.x * factor,
      size / 2 - h / 2 + view.y * factor, w, h);
    ctx.restore();
    return canvas;
  }

  // `entry` is set when an image from the library is being adjusted again;
  // it is then replaced in place instead of a new one being added.
  function openImageEditor(picker, playlistName, img, source, entry) {
    picker.querySelectorAll('.yqa-editor').forEach((old) => old.remove());
    const saved = entry && entry.view;
    const view = {
      zoom: saved ? saved.zoom : 1,
      x: saved ? saved.x : 0,
      y: saved ? saved.y : 0,
    };
    const editor = el('div', 'yqa-editor');

    const stage = document.createElement('canvas');
    stage.className = 'yqa-editor-stage';
    stage.width = PREVIEW_PX;
    stage.height = PREVIEW_PX;
    stage.dataset.yqaDown = 'pan';
    stage.dataset.yqaWheel = 'zoom';
    editor.appendChild(stage);

    const hint = el('div', 'yqa-editor-hint', T.adjustImage);
    editor.appendChild(hint);

    const zoom = el('input', 'yqa-editor-zoom');
    zoom.type = 'range';
    zoom.min = String(MIN_ZOOM * 100);
    zoom.max = String(MAX_ZOOM * 100);
    zoom.value = String(Math.round(view.zoom * 100));
    editor.appendChild(zoom);

    const actions = el('div', 'yqa-editor-actions');
    const cancel = el('button', 'yqa-modal-btn', T.cancel);
    cancel.type = 'button';
    cancel.dataset.yqaAct = 'editcancel';
    const apply = el('button', 'yqa-modal-btn yqa-modal-danger', T.apply);
    apply.type = 'button';
    apply.dataset.yqaAct = 'editapply';
    actions.appendChild(cancel);
    actions.appendChild(apply);
    editor.appendChild(actions);

    const paint = () => {
      const ctx = stage.getContext('2d');
      ctx.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);
      ctx.drawImage(renderCircle(img, view, PREVIEW_PX), 0, 0);
    };

    const clampPan = () => {
      // While the picture is larger than the circle it may not be pulled off
      // it, so no empty wedge appears. Once it is smaller — zoomed out past
      // the edges, which is what a tightly cropped drawing needs — it may be
      // moved anywhere inside the circle, and the rest stays transparent.
      const cover = Math.max(PREVIEW_PX / img.width, PREVIEW_PX / img.height);
      const scale = cover * view.zoom;
      const slackX = Math.abs(img.width * scale - PREVIEW_PX) / 2;
      const slackY = Math.abs(img.height * scale - PREVIEW_PX) / 2;
      view.x = Math.max(-slackX, Math.min(slackX, view.x));
      view.y = Math.max(-slackY, Math.min(slackY, view.y));
    };

    zoom.addEventListener('input', () => {
      view.zoom = Number(zoom.value) / 100;
      clampPan();
      paint();
    });

    pickerActions.set('pan', (target, ev) => {
      const start = { x: ev.clientX, y: ev.clientY, ox: view.x, oy: view.y };
      const move = (move_ev) => {
        view.x = start.ox + (move_ev.clientX - start.x);
        view.y = start.oy + (move_ev.clientY - start.y);
        clampPan();
        paint();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    pickerActions.set('zoom', (target, ev) => {
      const next = view.zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1);
      view.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      zoom.value = String(Math.round(view.zoom * 100));
      clampPan();
      paint();
    });

    pickerActions.set('editcancel', () => editor.remove());

    pickerActions.set('editapply', () => {
      const uri = renderCircle(img, view, ICON_PX)
        .toDataURL('image/webp', 0.85);
      const record = {
        id: entry ? entry.id :
          'c' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
        uri,
        src: source,
        view: { zoom: view.zoom, x: view.x, y: view.y },
      };
      customIcons = entry
        ? customIcons.map((e) => (e.id === entry.id ? record : e))
        : customIcons.concat([record]).slice(-60);
      saveCustomIcons();
      setGlyph(playlistName, { image: uri });
    });

    picker.appendChild(editor);
    paint();
  }

  async function openEmojiPicker(anchor, name) {
    if (picker && pickerFor === name) { closeEmojiPicker(); return; }
    closeEmojiPicker();

    const emojiCats = window.__yqaEmojiData || [];
    const lib = await loadIcons();
    // The anchor may be gone by the time the library arrives.
    if (!anchor.isConnected) return;
    if (!lib && !emojiCats.length) return;
    pickerFor = name;
    pickerActions = new Map();

    const iconEntry = (iconName) =>
      ({ icon: iconName, nodes: lib.n[iconName] });

    // Two modes; each has its own row of category tabs.
    const modes = [];
    if (lib) {
      const allNames = Object.keys(lib.n).sort();
      modes.push({
        key: 'icons',
        label: T.iconsTab,
        cats: lib.c
          .map((cat) => ({
            label: cat.name,
            tabNodes: lib.n[cat.tab],
            entries: cat.icons.map(iconEntry),
          }))
          .concat([{
            label: T.allIcons,
            tabNodes: lib.n['layout-grid'] || lib.n['grid-3x3'],
            tabChar: '⋯',
            entries: allNames.map(iconEntry),
          }]),
      });
    }
    modes.push({
      key: 'custom',
      label: T.customTab,
      cats: [{
        label: T.customTab,
        tabNodes: lib && lib.n ? lib.n['image'] : null,
        tabChar: '+',
        custom: true,
      }],
    });
    if (emojiCats.length) {
      modes.push({
        key: 'emoji',
        label: T.emojiTab,
        cats: emojiCats
          .map((cat) => ({
            label: cat.name,
            tabChar: cat.icon,
            entries: cat.emojis.map(([ch]) => ({ emoji: ch })),
          }))
          .concat([{
            label: T.allEmojis,
            tabChar: '🌐',
            entries: null, // built lazily
          }]),
      });
    }

    picker = el('div', 'yqa-picker');
    // Copy the surface colour from YouTube's own dialog so the picker fits
    // whichever theme is active (YouTube exposes no usable CSS variables).
    const surface = anchor.closest('yt-sheet-view-model') || document.body;
    for (let node = surface; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && !/rgba?\([^)]*,\s*0\s*\)/.test(bg) && bg !== 'transparent') {
        // A shade lighter than YouTube's own menu, so the picker reads as its
        // own panel and dark images the user uploaded stay visible on it. Its
        // buttons go one step further.
        const [r, g, b] = (bg.match(/\d+(\.\d+)?/g) || []).map(Number);
        const dark = 0.299 * r + 0.587 * g + 0.114 * b < 128;
        picker.style.background = shade(bg, dark ? 0.12 : 0.02, dark);
        picker.style.setProperty('--yqa-chip-bg',
          shade(bg, dark ? 0.26 : 0.08, dark));
        picker.style.setProperty('--yqa-chip-bg-hover',
          shade(bg, dark ? 0.36 : 0.14, dark));
        break;
      }
    }
    const label = surface.querySelector('.ytListItemViewModelTitle');
    if (label) picker.style.color = getComputedStyle(label).color;

    const search = el('input', 'yqa-picker-search');
    search.type = 'text';
    search.placeholder = T.search;
    picker.appendChild(search);

    const modeRow = el('div', 'yqa-picker-modes');
    if (modes.length > 1) picker.appendChild(modeRow);

    const tabs = el('div', 'yqa-picker-tabs');
    picker.appendChild(tabs);
    const grid = el('div', 'yqa-picker-grid');
    picker.appendChild(grid);

    const pin = findPin(name);
    if (pin && (pin.icon || pin.emoji || pin.image)) {
      const rm = el('button', 'yqa-picker-remove', T.removeIcon);
      rm.type = 'button';
      rm.dataset.yqaAct = 'clear';
      picker.appendChild(rm);
    }

    let modeIdx = 0;
    let catIdx = 0;

    const onFile = (file) => {
      readImageFile(file)
        .then((img) => {
          const source = toSource(img);
          // Nothing small enough to keep: the picture can still be cropped
          // now, it just cannot be adjusted again afterwards.
          if (!source) return openImageEditor(picker, name, img, '', null);
          return loadImage(source)
            .then((small) => openImageEditor(picker, name, small, source, null));
        })
        .catch(() => showHint(anchor, T.imageFailed, 2500));
    };
    // Deliberately outside the picker: inside it, the guard that keeps
    // YouTube's dialog open would swallow the click that opens the file
    // dialog. Triggered from the button's own handler instead.
    fileField = document.createElement('input');
    fileField.type = 'file';
    fileField.accept = 'image/*';
    fileField.style.cssText = 'position:fixed;left:-9999px;top:0';
    fileField.addEventListener('change', () => {
      const file = fileField.files && fileField.files[0];
      fileField.value = '';
      if (file) onFile(file);
    });
    document.body.appendChild(fileField);
    const catEntries = (cat) => {
      if (cat.custom) {
        return [{ upload: true, onFile }].concat(
          customIcons.map((entry) => ({ image: entry.uri, id: entry.id })));
      }
      return cat.entries || buildAllEmojis().map((ch) => ({ emoji: ch }));
    };

    const showCat = (idx) => {
      catIdx = idx;
      tabs.querySelectorAll('.yqa-picker-tab').forEach((tab, i) =>
        tab.classList.toggle('yqa-active', i === idx));
      const cat = modes[modeIdx].cats[idx];
      // The badges on the picture cells sit slightly outside them; without
      // the extra room the top row would be cut off by the scroll edge.
      grid.classList.toggle('yqa-grid-custom', !!cat.custom);
      renderGrid(grid, catEntries(cat));
      grid.scrollTop = 0;
    };

    const showMode = (idx) => {
      modeIdx = idx;
      modeRow.querySelectorAll('.yqa-picker-mode').forEach((chip, i) =>
        chip.classList.toggle('yqa-active', i === idx));
      tabs.textContent = '';
      modes[idx].cats.forEach((cat, i) => {
        const tab = el('button', 'yqa-picker-tab');
        tab.type = 'button';
        tab.title = cat.label;
        tab.dataset.yqaAct = 'tab';
        tab.dataset.yqaTab = String(i);
        if (cat.tabNodes) tab.appendChild(lucideIcon(cat.tabNodes, 18));
        else tab.textContent = cat.tabChar;
        tabs.appendChild(tab);
      });
      showCat(0);
    };

    modes.forEach((mode, i) => {
      const chip = el('button', 'yqa-picker-mode', mode.label);
      chip.type = 'button';
      chip.dataset.yqaAct = 'mode';
      chip.dataset.yqaMode = String(i);
      modeRow.appendChild(chip);
    });

    const runSearch = () => {
      const q = search.value.trim().toLowerCase();
      if (!q) { showCat(catIdx); return; }
      tabs.querySelectorAll('.yqa-picker-tab')
        .forEach((tab) => tab.classList.remove('yqa-active'));
      // Match on word starts, so "ai" finds "ai chatbot" but not "painting".
      const hit = (keywords) =>
        keywords.split(' ').some((word) => word.startsWith(q));
      const matches = [];
      if (modes[modeIdx].key === 'custom') { showCat(catIdx); return; }
      if (modes[modeIdx].key === 'icons') {
        for (const iconName of Object.keys(lib.n)) {
          if (hit(lib.k[iconName] || iconName)) matches.push(iconEntry(iconName));
        }
      } else {
        for (const cat of emojiCats) {
          for (const [ch, kw] of cat.emojis) {
            if (ch === q || hit(kw)) matches.push({ emoji: ch });
          }
        }
      }
      renderGrid(grid, matches);
    };
    search.addEventListener('input', runSearch);

    pickerActions.set('pick', (target) => {
      const iconName = target.dataset.yqaIcon || '';
      setGlyph(name, {
        icon: iconName,
        emoji: target.dataset.yqaEmoji || '',
        image: target.dataset.yqaImage || '',
        nodes: iconName && lib ? lib.n[iconName] : null,
      });
    });
    pickerActions.set('upload', () => {
      if (fileField) fileField.click();
    });
    pickerActions.set('editimage', (target) => {
      const entry = customIcons.find((e) => e.id === target.dataset.yqaId);
      if (!entry) return;
      // Pictures saved before this existed only kept the finished crop;
      // that one is then the starting point — and the crop stored with it
      // belongs to the original, so it must not be reapplied to it.
      const source = entry.src || entry.uri;
      const base = entry.src ? entry : { id: entry.id };
      loadImage(source)
        .then((img) => openImageEditor(picker, name, img, source, base))
        .catch(() => showHint(anchor, T.imageFailed, 2500));
    });
    pickerActions.set('delimage', (target) => {
      // Playlists already using this picture keep their own copy.
      customIcons = customIcons.filter((e) => e.id !== target.dataset.yqaId);
      saveCustomIcons();
      showCat(catIdx);
    });
    pickerActions.set('clear', () => setGlyph(name, {}));
    pickerActions.set('tab', (target) => {
      search.value = '';
      showCat(Number(target.dataset.yqaTab));
    });
    pickerActions.set('mode', (target) => {
      search.value = '';
      showMode(Number(target.dataset.yqaMode));
    });

    document.body.appendChild(picker);
    showMode(0);

    const r = anchor.getBoundingClientRect();
    const pw = picker.offsetWidth;
    const ph = picker.offsetHeight;
    picker.style.left =
      Math.max(8, Math.min(innerWidth - pw - 8, r.right - pw)) + 'px';
    const below = r.bottom + 6;
    picker.style.top =
      (below + ph > innerHeight - 8 ? Math.max(8, r.top - ph - 6) : below) + 'px';

    PICKER_EVENTS.forEach((type) =>
      window.addEventListener(type, pickerGuard, true));
    window.addEventListener('keydown', pickerKeyGuard, true);
    search.focus();
  }

  // ------------------------------------- pin & emoji controls in dialog

  // Best effort: dig the playlist id out of the row's view-model data. Used
  // to recognise the playlist a page is showing (its title can differ from
  // the name in the dialog — "Watch later" vs. the localised sidebar label).
  function rowListId(row) {
    const seen = new Set();
    const walk = (value, depth) => {
      if (!value || depth > 6 || typeof value !== 'object') return '';
      if (seen.has(value)) return '';
      seen.add(value);
      for (const key of Object.keys(value)) {
        const child = value[key];
        if (typeof child === 'string') {
          if (/playlistid/i.test(key) && /^[A-Za-z0-9_-]{2,64}$/.test(child)) {
            return child;
          }
        } else {
          const found = walk(child, depth + 1);
          if (found) return found;
        }
      }
      return '';
    };
    for (const key of Object.keys(row)) {
      if (!/^(data|__data|props|_props)$/.test(key)) continue;
      try {
        const found = walk(row[key], 0);
        if (found) return found;
      } catch (_) { /* ignore */ }
    }
    return '';
  }

  function togglePin(row, anchor) {
    const name = rowName(row);
    if (!name) return;
    const existing = findPin(name);
    if (existing) {
      // Remember the symbol: unpinning is often just a way to reorder, and
      // losing a picked icon over that would be annoying.
      if (existing.icon || existing.emoji || existing.image) {
        delete glyphMemory[name];
        glyphMemory[name] = {
          icon: existing.icon || '',
          emoji: existing.emoji || '',
          image: existing.image || '',
          nodes: existing.nodes || null,
        };
      } else {
        delete glyphMemory[name];
      }
      pins = pins.filter((p) => p !== existing);
    } else {
      if (pins.length >= MAX_PINS) { showHint(anchor, T.limit, 2500); return; }
      const back = glyphMemory[name] || {};
      pins.push({
        name,
        thumb: rowThumb(row),
        emoji: back.emoji || '',
        icon: back.icon || '',
        image: back.image || '',
        nodes: back.nodes || null,
        listId: rowListId(row),
      });
    }
    savePins();
    updateDialogRows();
    rebuildBars();
  }

  function injectRowActions(row) {
    const trailing = row.querySelector('.ytListItemViewModelTrailing');
    if (!trailing || trailing.querySelector('.yqa-row-actions')) return;

    const wrap = el('span', 'yqa-row-actions');

    const emojiBtn = el('button', 'yqa-mini-btn yqa-emoji-btn');
    emojiBtn.type = 'button';
    emojiBtn.setAttribute('aria-label', T.icon);
    emojiBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openEmojiPicker(emojiBtn, rowName(row));
    });

    const pinBtn = el('button', 'yqa-mini-btn yqa-pin-btn');
    pinBtn.type = 'button';
    pinBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      togglePin(row, pinBtn);
    });

    wrap.appendChild(emojiBtn);
    wrap.appendChild(pinBtn);
    trailing.insertBefore(wrap, trailing.firstChild);
    updateRowActions(row);
  }

  // YouTube recycles dialog rows, so always re-read the current name.
  function updateRowActions(row) {
    const wrap = row.querySelector('.yqa-row-actions');
    if (!wrap) return;
    const pin = findPin(rowName(row));

    const pinBtn = wrap.querySelector('.yqa-pin-btn');
    pinBtn.textContent = '';
    pinBtn.appendChild(svgIcon(pin ? PIN_FILLED : PIN_OUTLINE, 20));
    pinBtn.classList.toggle('yqa-pinned', !!pin);
    pinBtn.setAttribute('aria-label', pin ? T.unpin : T.pin);

    const emojiBtn = wrap.querySelector('.yqa-emoji-btn');
    emojiBtn.style.display = pin ? '' : 'none';
    emojiBtn.textContent = '';
    if (pin && pin.image) {
      const own = document.createElement('img');
      own.className = 'yqa-mini-thumb';
      own.src = pin.image;
      own.alt = '';
      emojiBtn.appendChild(own);
    } else if (pin && pin.icon && pin.nodes) {
      emojiBtn.appendChild(lucideIcon(pin.nodes, 20));
    } else if (pin && pin.emoji) {
      emojiBtn.appendChild(el('span', 'yqa-emoji-char', pin.emoji));
    } else {
      emojiBtn.appendChild(svgIcon(SMILEY_PATH, 20));
    }
  }

  const updateDialogRows = () =>
    document.querySelectorAll('toggleable-list-item-view-model')
      .forEach((row) => {
        if (row.querySelector('.yqa-row-actions')) updateRowActions(row);
      });

  const scanDialog = () =>
    document.querySelectorAll('toggleable-list-item-view-model')
      .forEach(injectRowActions);

  // ---------------------------------------------------- quick-save bar

  // One click toggles the video in the pinned playlist: added when it is not
  // in yet, removed when it is. YouTube shows its own toast either way.
  // Measured on the live page: a few hundred milliseconds after the
  // background menu closes, YouTube rebuilds the row and leaves out one of
  // its 40px buttons for about 45ms. The metadata column grows by exactly
  // that much, the two-line title re-wraps for those frames and its second
  // line appears to blink. Holding the column at its current width keeps the
  // text where it is; the row looks unchanged because the value is the one
  // it already has.
  function holdColumnWidth(item) {
    const host = item.querySelector('.yqa-meta-host');
    const width = host ? Math.round(host.getBoundingClientRect().width) : 0;
    if (!width) return () => {};
    host.style.maxWidth = width + 'px';
    let released = false;
    return () => {
      if (released) return;
      released = true;
      // The rebuild lands after the menu is already gone.
      setTimeout(() => { host.style.maxWidth = ''; }, 1200);
    };
  }

  function quickToggle(item, pin, btn) {
    const id = videoId(item);
    // Flip the marking straight away — waiting for the dialog round-trip
    // would make every click feel sluggish. Corrected below if it fails.
    const assumeIn = !btn.classList.contains('yqa-in');
    markMember(id, pin.name, assumeIn);
    setSnapshotMember(pin, id, assumeIn);
    updateAllBars();

    runExclusive(item, async () => {
      const unhide = hidePopups();
      const releaseWidth = holdColumnWidth(item);
      btn.classList.add('yqa-busy');
      let done = false;
      try {
        const opened = await useNativeMenu(item, findSaveItem);
        if (!opened) return;
        const row = await waitFor(
          () => dialogRows().find((r) => rowName(r) === pin.name), 2500);
        if (!row) {
          closeMenu();
          showHint(btn, T.notFound(pin.name), 2500);
          return;
        }
        await sleep(60);
        const wasIn = rowIsChecked(row);
        if (wasIn === assumeIn) {
          // Something else changed it in the meantime — the video is
          // already in the state we wanted.
          closeMenu();
          done = true;
          return;
        }
        fullClick(row.querySelector('button[role="menuitem"], button') || row);
        await sleep(250);
        closeMenu();
        markMember(id, pin.name, !wasIn);
        setSnapshotMember(pin, id, !wasIn);
        bumpStat('saved');
        done = true;
      } finally {
        if (!done) {
          // Roll the optimistic marking back.
          markMember(id, pin.name, !assumeIn);
          setSnapshotMember(pin, id, !assumeIn);
        }
        probed.add(id);
        rememberMembership(id);
        updateAllBars();
        btn.classList.remove('yqa-busy');
        await sleep(150);
        unhide();
        releaseWidth();
      }
    });
  }

  function pinGlyph(pin, size) {
    if (pin.image) {
      const own = document.createElement('img');
      own.className = 'yqa-bar-thumb';
      own.src = pin.image;
      own.alt = '';
      return own;
    }
    if (pin.icon && pin.nodes) return lucideIcon(pin.nodes, size);
    if (pin.emoji) return el('span', 'yqa-bar-emoji', pin.emoji);
    if (pin.thumb) {
      const img = document.createElement('img');
      img.className = 'yqa-bar-thumb';
      img.src = pin.thumb;
      img.alt = '';
      return img;
    }
    return svgIcon(PIN_FILLED, size);
  }

  function makeBarItem(item, pin, withLabel) {
    const cell = el('div', 'yqa-bar-item');
    const btn = el('button', 'yqa-bar-btn');
    btn.type = 'button';
    btn.dataset.yqaPlaylist = pin.name;
    btn.appendChild(pinGlyph(pin, 22));
    const label = () => btn.classList.contains('yqa-in')
      ? T.removeFrom(pin.name)
      : T.saveTo(pin.name);
    btn.setAttribute('aria-label', label());
    btn.addEventListener('mouseenter', () => showHint(btn, label()));
    btn.addEventListener('mouseleave', hideHint);
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      hideHint();
      quickToggle(item, pin, btn);
    });
    cell.appendChild(btn);
    if (withLabel) {
      const text = el('span', 'yqa-bar-label', pin.name);
      text.title = pin.name;
      cell.appendChild(text);
    }
    return cell;
  }

  // Reflect which pinned playlists already contain this video.
  function updateBar(item) {
    const bar = item.querySelector('.yqa-bar');
    if (!bar) return;
    const id = videoId(item);
    bar.querySelectorAll('.yqa-bar-btn').forEach((btn) => {
      const pin = findPin(btn.dataset.yqaPlaylist);
      const inList = !!pin && pinState(id, pin) === 'in';
      btn.classList.toggle('yqa-in', inList);
      btn.setAttribute('aria-label', inList
        ? T.removeFrom(btn.dataset.yqaPlaylist)
        : T.saveTo(btn.dataset.yqaPlaylist));
    });
  }

  // The same video can appear several times (history days, playlists), so a
  // result always refreshes every bar on the page.
  const ROW_TAGS = 'yt-lockup-view-model, ytd-video-renderer, ytd-playlist-video-renderer';
  function updateAllBars() {
    document.querySelectorAll('.yqa-bar').forEach((bar) => {
      const item = bar.closest(ROW_TAGS);
      if (item) updateBar(item);
    });
  }

  function injectBar(item, onHistory) {
    const lockup = item.matches('yt-lockup-view-model');
    const mount = lockup
      ? item.querySelector('.ytLockupViewModelMetadata')
      : item.querySelector('#meta');
    if (!mount) return;
    // The legacy row lays its metadata out as blocks, where auto margins
    // cannot centre anything. A flex column changes nothing visually but
    // lets the bar sit in the middle of the space the title leaves.
    if (!lockup) mount.classList.add('yqa-meta-host');

    let bar = mount.querySelector(':scope > .yqa-bar');
    if (!bar) {
      bar = el('div', 'yqa-bar');
      // Reading membership needs a dialog round-trip. Start it as soon as
      // the pointer enters the row, so the result is usually there by the
      // time it reaches the icons — but not while the user is scrolling.
      let dwell = null;
      item.addEventListener('pointerenter', () => {
        clearTimeout(dwell);
        dwell = setTimeout(() => ensureMembership(item), 150);
      });
      item.addEventListener('pointerleave', () => clearTimeout(dwell));
      mount.appendChild(bar);
    }
    bar.classList.toggle('yqa-always', !!settings.alwaysShow);

    // Videos listed on a playlist page are in that playlist by definition.
    const current = currentPlaylistName();
    if (current) markMember(videoId(item), current, true);

    // Labels would not fit the compact playlist rows, so they stay history-only.
    const withLabel = onHistory && settings.showNames;
    const sig = pins
      .map((p) => p.name + '|' + p.icon + '|' + p.emoji + '|' + p.thumb +
        '|' + (p.image ? p.image.length : 0))
      .join('~') + (withLabel ? '#named' : '');
    if (bar.dataset.yqaSig !== sig) {
      bar.dataset.yqaSig = sig;
      bar.textContent = '';
      bar.classList.toggle('yqa-labeled', withLabel);
      pins.forEach((pin) => bar.appendChild(makeBarItem(item, pin, withLabel)));
    }
    updateBar(item);
  }

  const rebuildBars = () => {
    document.querySelectorAll('.yqa-bar').forEach((bar) => {
      bar.dataset.yqaSig = '';
    });
    queueScan();
  };

  // ---------------------------------------------------------- scanning

  const rowSelector =
    'ytd-item-section-renderer yt-lockup-view-model, ytd-video-renderer';
  const isDownloadsPage = () => location.pathname === '/feed/downloads';

  // YouTube colours only its text elements, never html/body or the row
  // containers (both stay black even in the dark theme), so inheriting is
  // not enough. Copy the colour from a real title and expose it as a
  // variable every injected element uses.
  // Title elements of the page types the extension draws on, most specific
  // first. Downloads uses its own renderer, which is why its trash button
  // stayed black: none of the earlier selectors matched there, so no colour
  // was ever measured.
  const THEME_PROBES = [
    'yt-lockup-view-model h3 .ytAttributedStringHost',
    'yt-lockup-view-model .ytAttributedStringHost',
    'ytd-playlist-video-renderer #video-title',
    'ytd-video-renderer #video-title',
    'ytd-rich-item-renderer #video-title',
    '.ytListItemViewModelTitle',
    '#video-title',
  ];

  // Moves a colour towards white or black. Used to lift the picker off
  // YouTube's menu surface and to set its buttons apart from the picker.
  function shade(color, amount, towardsWhite) {
    const parts = (color.match(/\d+(\.\d+)?/g) || []).map(Number);
    if (parts.length < 3 || !parts.slice(0, 3).every(Number.isFinite)) return color;
    const target = towardsWhite ? 255 : 0;
    const mixed = parts.slice(0, 3)
      .map((v) => Math.round(v + (target - v) * amount));
    return 'rgb(' + mixed.join(', ') + ')';
  }

  // The measured colours, kept for the next page load. Without them every
  // fresh page shows the buttons in the fallback colour (black in the dark
  // theme) until a title element exists to measure, which YouTube renders
  // late. The stored value is applied before the first scan and corrected as
  // soon as the real measurement comes in.
  const THEME_CACHE = 'yqa-theme';
  const THEME_VARS = ['--yqa-fg', '--yqa-chip', '--yqa-chip-hover', '--yqa-surface'];
  let themeMeasured = false;

  function applyStoredTheme() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(THEME_CACHE) || 'null'); }
    catch (_) { stored = null; }
    if (!stored || typeof stored !== 'object') return;
    for (const name of THEME_VARS) {
      if (typeof stored[name] === 'string' && stored[name]) setYqaVar(name, stored[name]);
    }
  }

  function storeTheme() {
    const stored = {};
    for (const name of THEME_VARS) stored[name] = varValues.get(name) || '';
    try { localStorage.setItem(THEME_CACHE, JSON.stringify(stored)); }
    catch (_) { /* private mode, storage full: not worth reporting */ }
  }

  function refreshThemeColor() {
    // Only visible elements: YouTube keeps the previous page's DOM around,
    // and a leftover would hand back the colour of another page type.
    let probe = null;
    for (const selector of THEME_PROBES) {
      probe = Array.from(document.querySelectorAll(selector)).find(isVisible);
      if (probe) break;
    }
    if (probe) {
      const color = getComputedStyle(probe).color;
      if (color) {
        setYqaVar('--yqa-fg', color);
        // Light text means the dark theme. There the round buttons get a
        // slightly stronger tint, which reads as a lighter grey.
        const [r, g, b] = (color.match(/\d+(\.\d+)?/g) || []).map(Number);
        const dark = 0.299 * r + 0.587 * g + 0.114 * b > 140;
        setYqaVar('--yqa-chip', dark ? '16%' : '12%');
        setYqaVar('--yqa-chip-hover', dark ? '26%' : '22%');
        themeMeasured = true;
      }
    }
    // Surface colour for our own dialog, taken from YouTube's page background.
    for (let node = document.querySelector('ytd-app') || document.body;
      node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && !/rgba?\([^)]*,\s*0\s*\)/.test(bg) && bg !== 'transparent') {
        setYqaVar('--yqa-surface', bg);
        break;
      }
    }
    if (themeMeasured) storeTheme();
  }

  // YouTube-derived values (colours, bar geometry) for the extension's own
  // elements. They live in one rule scoped to those elements. Setting a
  // custom property on <html> instead restyles the whole page: measured at
  // 4-5 s of frozen page on a watch page with about 10,000 nodes, and the
  // probed colour could flip between a white thumbnail badge and a dark
  // title, so that happened again and again. Unchanged values are not
  // written at all.
  // Every element whose rule in styles.css reads a --yqa- variable. Leaving
  // one out drops it back to its fallback: the trash buttons went black in
  // the dark theme when only the bar and the dialog were listed here.
  const VARS_SELECTOR = [
    '.yqa-btn', '.yqa-trash-fallback', '.yqa-mini-btn',
    '.yqa-bar', '.yqa-bar-btn',
    '.yqa-picker', '.yqa-picker-cell', '.yqa-picker-tab', '.yqa-picker-mode',
    '.yqa-picker-search', '.yqa-picker-remove',
    '.yqa-modal-box', '.yqa-modal-btn',
  ].join(', ');
  const varValues = new Map();
  let varsRule = null;

  function setYqaVar(name, value) {
    const sheetGone = !varsRule || !varsRule.parentStyleSheet ||
      !varsRule.parentStyleSheet.ownerNode ||
      !varsRule.parentStyleSheet.ownerNode.isConnected;
    if (sheetGone) {
      const style = el('style');
      style.id = 'yqa-vars';
      (document.head || document.documentElement).appendChild(style);
      style.sheet.insertRule(VARS_SELECTOR + ' {}', 0);
      varsRule = style.sheet.cssRules[0];
      varValues.forEach((v, k) => varsRule.style.setProperty(k, v));
    }
    if (varValues.get(name) === value) return;
    varValues.set(name, value);
    varsRule.style.setProperty(name, value);
  }

  // The bar has to line up with what the user actually sees: the thumbnail
  // image (whose link carries padding) on the left and the hover highlight
  // (which reaches past the text column) on the right and bottom. All of it
  // is measured once per pass and published as CSS variables, so no layout
  // is read per row.
  const firstVisible = (selector) => {
    for (const node of document.querySelectorAll(selector)) {
      if (node.getBoundingClientRect().height > 10) return node;
    }
    return null;
  };

  // Some rows are narrower than others — a "Downloaded" badge, for example,
  // takes space from the text column. Spacing is therefore derived from the
  // widest row and applied to all of them, so every row lines up.
  function widestMetadata(selector, inner) {
    let width = 0;
    let seen = 0;
    for (const node of document.querySelectorAll(selector)) {
      if (node.getBoundingClientRect().height < 10) continue;
      const meta = node.querySelector(inner);
      if (meta) width = Math.max(width, meta.getBoundingClientRect().width);
      if (++seen >= 12) break;
    }
    return width;
  }

  let metricsKind = '';
  const lastMetrics = {};
  // The widest metadata column seen for the current layout. Measured on the
  // live page: a row is 40px (one button) wider once YouTube has finished
  // laying it out, which moved the gap from 30px to 35px and shifted the
  // icons of every row sideways. Keeping the largest value makes that a
  // one-time growth instead of a back and forth.
  let metricsKey = '';
  let widestSeen = 0;

  function refreshMetrics() {
    const setVar = setYqaVar;

    let barWidth = 0;
    let left = 0;
    let right = 0;
    let shift = 0;

    const lockup = firstVisible('yt-lockup-view-model');
    if (lockup) {
      const image = lockup.querySelector('.ytLockupViewModelContentImage');
      const meta = lockup.querySelector('.ytLockupViewModelMetadata');
      const feedback = lockup.querySelector('yt-touch-feedback-shape');
      left = image ? parseFloat(getComputedStyle(image).paddingRight) || 0 : 0;
      if (meta && feedback) {
        right = Math.max(0, Math.round(
          feedback.getBoundingClientRect().right -
          meta.getBoundingClientRect().right));
      }
      barWidth = widestMetadata(
        'yt-lockup-view-model', '.ytLockupViewModelMetadata') + left + right;
    }

    const row = firstVisible('ytd-playlist-video-renderer');
    if (row) {
      const meta = row.querySelector('#meta');
      if (meta) {
        shift = Math.max(0, Math.round((row.getBoundingClientRect().bottom -
          meta.getBoundingClientRect().bottom) / 2));
        if (!barWidth) {
          barWidth = widestMetadata('ytd-playlist-video-renderer', '#meta');
        }
      }
    }

    // Re-measuring can differ by a pixel when YouTube re-renders a row, for
    // instance right after a video was added to a playlist. Writing that
    // through made the icon row jump, so small changes are ignored. When the
    // page type changes every value is written: a leftover offset from the
    // previous type would misplace the bar.
    const kind = (lockup ? 'l' : '') + (row ? 'r' : '');
    const steady = kind === metricsKind;
    metricsKind = kind;
    const setPx = (name, value) => {
      const previous = lastMetrics[name];
      if (steady && previous != null && Math.abs(previous - value) <= 3) return;
      lastMetrics[name] = value;
      setVar(name, value + 'px');
    };

    setPx('--yqa-bar-left', -left);
    setPx('--yqa-bar-right', -right);
    setPx('--yqa-bar-shift', shift);

    // Reset the remembered width whenever the layout itself changes.
    const key = kind + '|' + Math.round(window.innerWidth) + '|' + pins.length;
    if (key !== metricsKey) {
      metricsKey = key;
      widestSeen = 0;
    }
    if (barWidth > widestSeen) widestSeen = barWidth;

    if (widestSeen && pins.length) {
      const gap = Math.max(2,
        (widestSeen - pins.length * 40) / (pins.length + 1));
      setPx('--yqa-bar-gap', Math.round(gap));
      // A name may span its own button plus one gap before it would touch
      // the neighbouring one.
      setPx('--yqa-label-max', Math.max(38, Math.round(40 + gap - 4)));
    }
  }

  // When a playlist fits on one page, the page itself is the truth — cheaper
  // and fresher than re-fetching, and it keeps the marking elsewhere correct
  // right after a playlist was emptied.
  function syncSnapshotFromPage() {
    const listId = currentListId();
    if (!listId) return;
    const ids = new Set();
    visibleRows().forEach((row) => {
      const id = videoId(row);
      if (id) ids.add(id);
    });
    const total = playlistVideoCount();
    const known = snapshots.get(listId);

    if (total > ids.size) {
      // Only part of the playlist is on screen. Whatever is listed is
      // certainly in it, so fold those in without claiming to know the rest —
      // otherwise a long playlist stays unmarked on its own page.
      if (!ids.size) return;
      const merged = new Set(known ? known.ids : []);
      const before = merged.size;
      ids.forEach((id) => merged.add(id));
      applyRecentChanges(listId, merged);
      if (known && merged.size < before) {
        // A change removed more than this page added — publish it.
        const trimmed = { ids: merged, complete: known.complete, ts: known.ts };
        snapshots.set(listId, trimmed);
        publishSnapshot(listId, trimmed);
        updateAllBars();
        return;
      }
      if (known && merged.size === before) return;
      const partial = {
        ids: merged,
        complete: known ? known.complete : false,
        ts: known ? known.ts : Date.now(),
      };
      snapshots.set(listId, partial);
      publishSnapshot(listId, partial);
      updateAllBars();
      return;
    }

    // The page holds the whole playlist, so it is the authority.
    applyRecentChanges(listId, ids);
    if (known && known.complete && known.ids.size === ids.size &&
      [...ids].every((id) => known.ids.has(id))) return;
    const snap = { ids, complete: true, ts: Date.now() };
    snapshots.set(listId, snap);
    publishSnapshot(listId, snap);
    updateAllBars();
  }

  let lastThemeAt = -Infinity;
  let lastPageKind = '';

  function scan() {
    const onHistory = isHistoryPage();
    const onPlaylist = isPlaylistPage();
    const onDownloads = isDownloadsPage();
    const dialogOpen = !!document.querySelector('toggleable-list-item-view-model');
    // Colours and measurements force style and layout work, which is
    // expensive on YouTube's large pages. They only run where the extension
    // draws something that uses them: history, playlists, downloads and the
    // "Save to…" dialog. The colour is re-read at most every 2 s, or at once
    // when the kind of page changes.
    const drawsHere = onHistory || onPlaylist || onDownloads;
    const kind = [onHistory, onPlaylist, onDownloads, dialogOpen].join();
    if ((drawsHere || dialogOpen) && (!themeMeasured || kind !== lastPageKind ||
      performance.now() - lastThemeAt > 2000)) {
      lastThemeAt = performance.now();
      refreshThemeColor();
    }
    lastPageKind = kind;
    if (drawsHere) {
      refreshMetrics();
      syncSnapshotFromPage();
    }
    scanDialog();

    const listId = currentListId();

    // YouTube keeps cached page DOM around on SPA navigation — drop anything
    // we injected on pages we are no longer on.
    if (!onHistory && !onPlaylist && !onDownloads) {
      document.querySelectorAll(
        '.' + BTN_CLASS + ', .yqa-bar, .yqa-modal, .yqa-bulk-btn')
        .forEach((node) => node.remove());
      return;
    }

    // Downloads and liked videos only get the trash button, in the corner.
    if (onDownloads || listId === 'LL') {
      document.querySelectorAll('.yqa-bar').forEach((bar) => bar.remove());
      const cards = onDownloads
        ? document.querySelectorAll('ytd-rich-item-renderer')
        : document.querySelectorAll('yt-lockup-view-model');
      cards.forEach((card) => injectTrash(card, 'corner'));
      if (!onDownloads) {
        injectBulkButton();
        resumeBulkIfPending();
      }
      return;
    }

    injectBulkButton();
    resumeBulkIfPending();

    // The quick-save bar can be switched off per page type in the settings.
    const barsAllowed = onHistory
      ? true
      : listId === 'WL'
        ? settings.showOnWatchLater
        : settings.showOnPlaylists;
    if (!barsAllowed) {
      document.querySelectorAll('.yqa-bar').forEach((bar) => bar.remove());
    }

    const items = onHistory
      ? document.querySelectorAll(rowSelector)
      : document.querySelectorAll('ytd-playlist-video-renderer');
    items.forEach((item) => {
      injectTrash(item, onHistory ? 'history' : 'playlist');
      if (barsAllowed) injectBar(item, onHistory);
    });
  }

  // At most one scan every 150 ms. YouTube changes its DOM constantly, and a
  // scan per frame kept the main thread busy for no visible gain. Hidden
  // tabs get no animation frames, so they do not scan at all until shown.
  const SCAN_GAP = 150;
  let scanQueued = false;
  let lastScanAt = -Infinity;
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    const wait = Math.max(0, SCAN_GAP - (performance.now() - lastScanAt));
    setTimeout(() => requestAnimationFrame(() => {
      scanQueued = false;
      lastScanAt = performance.now();
      scan();
    }), wait);
  }

  // The player rewrites its time, progress bar and seek previews many times
  // a second while a video plays or seeks. None of that concerns the scan,
  // so changes that happen only inside the player are ignored. Its controls,
  // which the extension extends, are checked once a second instead.
  new MutationObserver((records) => {
    for (const record of records) {
      const node = record.target;
      if (!node.closest || !node.closest('#movie_player')) {
        queueScan();
        return;
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('yt-navigate-finish', () => {
    // Membership and snapshots are keyed by video / playlist id, so they
    // stay valid across navigation — only the DOM has to be re-scanned.
    refreshSnapshots();
    queueScan();
  });
  window.addEventListener('scroll', hideHint, { passive: true });
  applyStoredTheme();
  scan();
})();
