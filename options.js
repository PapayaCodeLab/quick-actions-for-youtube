// Settings page. Reads and writes the same chrome.storage.local keys the
// content script uses; changes reach open YouTube tabs via storage events.
(() => {
  'use strict';

  const KEY = 'yqaSettings';
  const KEY_STATS = 'yqaStats';
  const DEFAULTS = {
    showNames: false,
    showOnPlaylists: true,
    showOnWatchLater: true,
    alwaysShow: true,
    speedControls: true,
    screenshotButton: true,
  };
  const FIELDS = Object.keys(DEFAULTS);

  // Same defaults and limits as bridge.js, which checks everything again
  // before a YouTube tab uses it.
  const ACTIONS = ['slower', 'faster', 'preferred', 'rewind', 'advance'];
  const DEFAULT_KEYS = { slower: 's', faster: 'd', preferred: 'q', rewind: 'w', advance: 'e' };
  const DEFAULT_AMOUNTS = { slower: 0.1, faster: 0.1, preferred: 1.4, rewind: 5, advance: 5 };
  const RANGE = {
    slower: [0.01, 4], faster: [0.01, 4], preferred: [0.1, 16],
    rewind: [0.1, 600], advance: [0.1, 600],
  };
  // Keys that cannot be a shortcut on their own.
  const IGNORED = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock',
    'Tab', 'Fn', 'OS', 'Dead', 'Process', 'Unidentified']);

  const keyLabel = (key) => {
    if (!key) return 'None';
    if (key === ' ') return 'Space';
    return key.length === 1 ? key.toUpperCase()
      : key.charAt(0).toUpperCase() + key.slice(1);
  };

  // How much the extension has actually done for this user. Counted locally
  // by the content script, read only here.
  //   removing a video by hand costs 2 clicks (menu, then the entry), the
  //   button costs 1 — so one saved click each. Saving to a playlist costs
  //   4 by hand (menu, "Save to", the playlist, close), so three saved.
  chrome.storage.local.get(KEY_STATS, (res) => {
    const stats = res[KEY_STATS] || {};
    const removed = Number(stats.removed) || 0;
    const saved = Number(stats.saved) || 0;
    const total = removed + saved;
    if (total < 5) return;              // too early to be worth mentioning
    const clicks = removed + saved * 3;
    const line = document.getElementById('stats');
    if (!line) return;
    const num = (v) => {
      const b = document.createElement('b');
      b.textContent = v.toLocaleString();
      return b;
    };
    line.append('You have taken ', num(total), ' one-click actions - ',
      "that's ", num(clicks), ' clicks you did not have to make.');
    line.hidden = false;
  });

  chrome.storage.local.get(KEY, (res) => {
    const settings = Object.assign({}, DEFAULTS, res[KEY] || {});
    settings.keys = Object.assign({}, DEFAULT_KEYS, settings.keys || {});
    settings.amounts = Object.assign({}, DEFAULT_AMOUNTS, settings.amounts || {});
    const save = () => chrome.storage.local.set({ [KEY]: settings });

    const table = document.getElementById('keys');
    const syncTable = () => {
      if (table) table.classList.toggle('off', !settings.speedControls);
    };

    for (const field of FIELDS) {
      const box = document.getElementById(field);
      if (!box) continue;
      box.checked = !!settings[field];
      box.addEventListener('change', () => {
        settings[field] = box.checked;
        save();
        syncTable();
      });
    }
    syncTable();

    // Shortcut keys: click a key cap, then press the new key. Escape keeps
    // the old one, Backspace / Delete removes it. A key can only belong to
    // one action, so taking it away from another action clears that one.
    const caps = [...document.querySelectorAll('.keycap')];
    let listening = null;

    const paint = () => caps.forEach((cap) => {
      if (cap === listening) return;
      const key = settings.keys[cap.dataset.act];
      cap.textContent = keyLabel(key);
      cap.classList.toggle('empty', !key);
    });

    const stopListening = () => {
      if (!listening) return;
      listening.classList.remove('listening');
      listening = null;
      paint();
    };

    caps.forEach((cap) => cap.addEventListener('click', () => {
      if (listening === cap) { stopListening(); return; }
      stopListening();
      listening = cap;
      cap.classList.add('listening');
      cap.classList.remove('empty');
      cap.textContent = 'Press a key';
    }));

    document.addEventListener('keydown', (ev) => {
      if (!listening) return;
      ev.preventDefault();
      if (ev.key === 'Escape') { stopListening(); return; }
      if (IGNORED.has(ev.key)) return;
      const act = listening.dataset.act;
      const key = ev.key === 'Backspace' || ev.key === 'Delete'
        ? '' : ev.key.toLowerCase();
      if (key) {
        for (const other of ACTIONS) {
          if (other !== act && settings.keys[other] === key) settings.keys[other] = '';
        }
      }
      settings.keys[act] = key;
      save();
      stopListening();
    });

    document.addEventListener('click', (ev) => {
      if (listening && !ev.target.closest('.keycap')) stopListening();
    });

    // Amounts accept a comma as well ("0,1"), and are kept within limits.
    document.querySelectorAll('.amount input').forEach((input) => {
      const act = input.dataset.act;
      input.value = String(settings.amounts[act]);
      input.addEventListener('change', () => {
        const [lo, hi] = RANGE[act];
        let n = Number(String(input.value).trim().replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0) n = DEFAULT_AMOUNTS[act];
        n = Math.min(hi, Math.max(lo, Math.round(n * 100) / 100));
        input.value = String(n);
        settings.amounts[act] = n;
        save();
      });
    });

    paint();
  });
})();
