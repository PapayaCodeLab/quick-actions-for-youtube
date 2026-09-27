// Storage bridge (isolated world). The UI runs in the MAIN world, where
// chrome.* APIs are unavailable, so this script relays them via postMessage.
//
// Protocol:
//   MAIN -> bridge: {type:'YQA_GET'}                  request current state
//   MAIN -> bridge: {type:'YQA_SET', pins, settings}  persist state
//   MAIN -> bridge: {type:'YQA_CHANGE', listId, id, member, ts}
//                                                     share a just-made change
//   MAIN -> bridge: {type:'YQA_BUMP', what}           count one quick action
//   MAIN -> bridge: {type:'YQA_ICONS'}                request the icon library
//   bridge -> MAIN: {type:'YQA_STATE', pins, settings}
//   bridge -> MAIN: {type:'YQA_ICON_DATA', icons}
(() => {
  'use strict';

  const KEY_PINS = 'yqaPins';
  const KEY_SETTINGS = 'yqaSettings';
  const KEY_MEM = 'yqaMembership';
  const KEY_SNAP = 'yqaSnapshots';
  const KEY_CHANGES = 'yqaChanges';
  const KEY_CUSTOM = 'yqaCustomIcons';
  const KEY_GLYPHS = 'yqaGlyphs';
  const KEY_STATS = 'yqaStats';
  const IMAGE_LIMIT = 80000;  // characters of a data URI (~60 KB image)
  // Cutting a data URI to length would leave a broken picture behind, so an
  // oversized one is dropped instead of shortened.
  const image = (value) =>
    (typeof value === 'string' && value.startsWith('data:image/') &&
      value.length <= IMAGE_LIMIT) ? value : '';
  const CUSTOM_LIMIT = 60;    // images the library keeps
  const GLYPH_LIMIT = 40;     // remembered symbols of unpinned playlists
  const CHANGE_TTL = 90000;
  const MEM_LIMIT = 800;

  const DEFAULT_SETTINGS = {
    showNames: false,        // playlist name under each icon (history only)
    showOnPlaylists: true,   // quick-save bar on playlist pages
    showOnWatchLater: true,  // quick-save bar in Watch later
    alwaysShow: true,        // icons visible without hovering the video
    speedControls: true,     // speed pill in the player + its shortcuts
    screenshotButton: true,  // screenshot button in the player
  };

  // Keyboard shortcuts of the speed controls: one key per action ('' = none)
  // and how far each one goes (speed steps, seconds).
  const ACTIONS = ['slower', 'faster', 'preferred', 'rewind', 'advance'];
  const DEFAULT_KEYS = { slower: 's', faster: 'd', preferred: 'q', rewind: 'w', advance: 'e' };
  const DEFAULT_AMOUNTS = { slower: 0.1, faster: 0.1, preferred: 1.4, rewind: 5, advance: 5 };
  const AMOUNT_RANGE = {
    slower: [0.01, 4], faster: [0.01, 4], preferred: [0.1, 16],
    rewind: [0.1, 600], advance: [0.1, 600],
  };

  const sanitizePins = (pins) => {
    if (!Array.isArray(pins)) return [];
    return pins
      .filter((p) => p && typeof p.name === 'string' && p.name)
      .slice(0, 8)
      .map((p) => ({
        name: String(p.name).slice(0, 200),
        thumb: typeof p.thumb === 'string' ? p.thumb.slice(0, 500) : '',
        emoji: typeof p.emoji === 'string' ? p.emoji.slice(0, 8) : '',
        icon: typeof p.icon === 'string' ? p.icon.slice(0, 48) : '',
        // Drawing data is stored with the pin so rendering the bar never
        // needs the full icon library.
        nodes: Array.isArray(p.nodes) ? p.nodes.slice(0, 24) : null,
        listId: typeof p.listId === 'string' ? p.listId.slice(0, 64) : '',
        // A picture the user uploaded, stored with the pin as a data URI.
        image: image(p.image),
      }));
  };

  const sanitizeCustom = (list) => {
    if (!Array.isArray(list)) return [];
    return list
      .filter((entry) => entry && image(entry.uri))
      .slice(0, CUSTOM_LIMIT)
      .map((entry) => ({
        id: String(entry.id || '').slice(0, 40),
        uri: entry.uri,
        // The scaled-down original plus the crop it was made with, so the
        // same picture can be adjusted again later.
        src: image(entry.src),
        view: entry.view && typeof entry.view === 'object' ? {
          zoom: Number(entry.view.zoom) || 1,
          x: Number(entry.view.x) || 0,
          y: Number(entry.view.y) || 0,
        } : null,
      }));
  };

  // The symbol of a playlist that is no longer pinned. Kept so pinning it
  // again brings the symbol back instead of falling back to the thumbnail.
  const sanitizeGlyphs = (map) => {
    const out = {};
    if (!map || typeof map !== 'object') return out;
    const names = Object.keys(map).slice(-GLYPH_LIMIT);
    for (const name of names) {
      const g = map[name];
      if (!g || typeof g !== 'object') continue;
      out[String(name).slice(0, 200)] = {
        emoji: typeof g.emoji === 'string' ? g.emoji.slice(0, 8) : '',
        icon: typeof g.icon === 'string' ? g.icon.slice(0, 48) : '',
        nodes: Array.isArray(g.nodes) ? g.nodes.slice(0, 24) : null,
        image: image(g.image),
      };
    }
    return out;
  };

  const sanitizeSettings = (settings) => {
    const out = Object.assign({}, DEFAULT_SETTINGS);
    const src = settings && typeof settings === 'object' ? settings : {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof src[key] === 'boolean') out[key] = src[key];
    }
    out.keys = {};
    out.amounts = {};
    for (const action of ACTIONS) {
      const key = src.keys && src.keys[action];
      out.keys[action] = typeof key === 'string' && key.length <= 20
        ? key.toLowerCase() : DEFAULT_KEYS[action];
      const amount = Number(src.amounts && src.amounts[action]);
      const [lo, hi] = AMOUNT_RANGE[action];
      out.amounts[action] = Number.isFinite(amount) && amount >= lo && amount <= hi
        ? amount : DEFAULT_AMOUNTS[action];
    }
    return out;
  };

  const push = (pins, settings, mem, snapshots, changes, custom, glyphs) => {
    window.postMessage({
      type: 'YQA_STATE',
      pins: sanitizePins(pins),
      settings: sanitizeSettings(settings),
      mem: mem && typeof mem === 'object' ? mem : {},
      snapshots: snapshots && typeof snapshots === 'object' ? snapshots : {},
      changes: changes && typeof changes === 'object' ? changes : {},
      custom: sanitizeCustom(custom),
      glyphs: sanitizeGlyphs(glyphs),
    }, '*');
  };

  const readAndPush = () =>
    chrome.storage.local.get(
      [KEY_PINS, KEY_SETTINGS, KEY_MEM, KEY_SNAP, KEY_CHANGES, KEY_CUSTOM,
        KEY_GLYPHS],
      (res) => push(res[KEY_PINS] || [], res[KEY_SETTINGS],
        res[KEY_MEM], res[KEY_SNAP], res[KEY_CHANGES], res[KEY_CUSTOM],
        res[KEY_GLYPHS]));

  let iconCache = null;

  // Counts of the quick actions taken, shown on the options page. Purely
  // local, never sent anywhere. The bulk run fires these in quick succession,
  // so they are buffered and written once the burst is over.
  const pending = { removed: 0, saved: 0 };
  let flushTimer = 0;

  function flushStats() {
    flushTimer = 0;
    const add = { removed: pending.removed, saved: pending.saved };
    pending.removed = 0;
    pending.saved = 0;
    if (!add.removed && !add.saved) return;
    chrome.storage.local.get(KEY_STATS, (res) => {
      const cur = res[KEY_STATS] && typeof res[KEY_STATS] === 'object'
        ? res[KEY_STATS] : {};
      chrome.storage.local.set({
        [KEY_STATS]: {
          removed: (Number(cur.removed) || 0) + add.removed,
          saved: (Number(cur.saved) || 0) + add.saved,
        },
      });
    });
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || typeof ev.data !== 'object') return;

    if (ev.data.type === 'YQA_GET') {
      readAndPush();
    } else if (ev.data.type === 'YQA_SET') {
      const pins = sanitizePins(ev.data.pins);
      const settings = sanitizeSettings(ev.data.settings);
      const write = { [KEY_PINS]: pins, [KEY_SETTINGS]: settings };
      if (ev.data.glyphs) write[KEY_GLYPHS] = sanitizeGlyphs(ev.data.glyphs);
      chrome.storage.local.set(write, readAndPush);
    } else if (ev.data.type === 'YQA_MEM') {
      // Remember which playlists a video is in, so the marking shows up
      // instantly the next time it is seen. Oldest entries are dropped.
      const id = String(ev.data.id || '').slice(0, 32);
      if (!id || !Array.isArray(ev.data.names)) return;
      chrome.storage.local.get(KEY_MEM, (res) => {
        const mem = res[KEY_MEM] && typeof res[KEY_MEM] === 'object'
          ? res[KEY_MEM] : {};
        delete mem[id];
        mem[id] = ev.data.names.slice(0, 20).map((n) => String(n).slice(0, 200));
        const keys = Object.keys(mem);
        for (let i = 0; i < keys.length - MEM_LIMIT; i++) delete mem[keys[i]];
        chrome.storage.local.set({ [KEY_MEM]: mem });
      });
    } else if (ev.data.type === 'YQA_SNAPSHOT') {
      // Contents of one pinned playlist, so marking is instant next time.
      const listId = String(ev.data.listId || '').slice(0, 64);
      if (!listId || !Array.isArray(ev.data.ids)) return;
      chrome.storage.local.get(KEY_SNAP, (res) => {
        const all = res[KEY_SNAP] && typeof res[KEY_SNAP] === 'object'
          ? res[KEY_SNAP] : {};
        all[listId] = {
          ids: ev.data.ids.slice(0, 2000)
            .map((v) => String(v).slice(0, 24)),
          complete: !!ev.data.complete,
          ts: Number(ev.data.ts) || Date.now(),
        };
        // Only pinned playlists matter; drop anything that piled up.
        const keys = Object.keys(all);
        for (let i = 0; i < keys.length - 16; i++) delete all[keys[i]];
        chrome.storage.local.set({ [KEY_SNAP]: all });
      });
    } else if (ev.data.type === 'YQA_CUSTOM_SET') {
      // The user's own image library, kept until they delete an entry.
      chrome.storage.local.set(
        { [KEY_CUSTOM]: sanitizeCustom(ev.data.custom) }, readAndPush);
    } else if (ev.data.type === 'YQA_CHANGE') {
      // What the user just added or removed, shared so no other tab undoes it
      // from a page that still shows the old state.
      const listId = String(ev.data.listId || '').slice(0, 64);
      const id = String(ev.data.id || '').slice(0, 32);
      if (!listId || !id) return;
      chrome.storage.local.get(KEY_CHANGES, (res) => {
        const all = res[KEY_CHANGES] && typeof res[KEY_CHANGES] === 'object'
          ? res[KEY_CHANGES] : {};
        const cutoff = Date.now() - CHANGE_TTL;
        for (const key of Object.keys(all)) {
          if (!all[key] || Number(all[key].ts) < cutoff) delete all[key];
        }
        all[listId + '|' + id] = {
          member: !!ev.data.member,
          ts: Number(ev.data.ts) || Date.now(),
        };
        chrome.storage.local.set({ [KEY_CHANGES]: all });
      });
    } else if (ev.data.type === 'YQA_BUMP') {
      if (ev.data.what !== 'removed' && ev.data.what !== 'saved') return;
      pending[ev.data.what]++;
      if (!flushTimer) flushTimer = setTimeout(flushStats, 1500);
    } else if (ev.data.type === 'YQA_ICONS') {
      // The icon library is only read when the picker is opened, so normal
      // page loads stay light.
      if (iconCache) {
        window.postMessage({ type: 'YQA_ICON_DATA', icons: iconCache }, '*');
        return;
      }
      fetch(chrome.runtime.getURL('icons.json'))
        .then((r) => r.json())
        .then((icons) => {
          iconCache = icons;
          window.postMessage({ type: 'YQA_ICON_DATA', icons }, '*');
        })
        .catch(() =>
          window.postMessage({ type: 'YQA_ICON_DATA', icons: null }, '*'));
    }
  });

  // Pick up changes made in other tabs or on the options page.
  // Every tab follows the same stored state, so adding or removing a video
  // in one tab re-marks it everywhere else without a reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[KEY_PINS] || changes[KEY_SETTINGS] ||
        changes[KEY_SNAP] || changes[KEY_MEM] || changes[KEY_CHANGES] ||
        changes[KEY_CUSTOM] || changes[KEY_GLYPHS]) {
      readAndPush();
    }
  });

  readAndPush();
})();
