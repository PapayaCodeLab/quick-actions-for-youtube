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
  };
  const FIELDS = Object.keys(DEFAULTS);

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
    for (const field of FIELDS) {
      const box = document.getElementById(field);
      if (!box) continue;
      box.checked = !!settings[field];
      box.addEventListener('change', () => {
        settings[field] = box.checked;
        chrome.storage.local.set({ [KEY]: settings });
      });
    }
  });
})();
