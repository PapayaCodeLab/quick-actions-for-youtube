// Regenerates icons.json (the full Lucide set) for the icon picker.
//
//   curl -sL https://unpkg.com/lucide-static@latest/icon-nodes.json -o lucide-nodes.json
//   curl -sL https://unpkg.com/lucide-static@latest/tags.json -o lucide-tags.json
//   node tools-generate-icons.js
//
// Output format (loaded on demand, never on page load):
//   { n: { name: [["tag", attrs], …] },   // drawing nodes
//     k: { name: "search keywords" },
//     c: [ { id, name, tab, icons: [names…] } ] }   // quick-access categories
const fs = require('fs');

const nodes = JSON.parse(fs.readFileSync(__dirname + '/lucide-nodes.json', 'utf8'));
const tags = JSON.parse(fs.readFileSync(__dirname + '/lucide-tags.json', 'utf8'));

// Curated quick-access categories. Every icon stays reachable through the
// "All" tab and the search, these are just shortcuts to common topics.
const CATS = [
  {
    id: 'general', name: 'General', tab: 'star',
    icons: ['star', 'heart', 'bookmark', 'flame', 'sparkles', 'zap', 'target',
      'trophy', 'crown', 'gem', 'flag', 'pin', 'tag', 'lightbulb', 'rocket',
      'thumbs-up', 'bell', 'eye', 'clock', 'calendar', 'infinity',
      'circle-check', 'list', 'layers'],
  },
  {
    id: 'media', name: 'Media', tab: 'clapperboard',
    icons: ['play', 'clapperboard', 'film', 'tv', 'video', 'camera', 'music',
      'headphones', 'mic', 'guitar', 'piano', 'drum', 'radio', 'disc-3',
      'gamepad-2', 'joystick', 'dice-5', 'popcorn', 'drama', 'palette',
      'brush', 'image', 'audio-lines', 'captions'],
  },
  {
    id: 'tech', name: 'Tech', tab: 'code',
    icons: ['code', 'terminal', 'bot', 'brain-circuit', 'cpu', 'laptop',
      'monitor', 'smartphone', 'server', 'database', 'cloud', 'git-branch',
      'bug', 'wrench', 'settings', 'binary', 'keyboard', 'wifi', 'plug',
      'hard-drive', 'blocks', 'puzzle', 'shield', 'lock', 'key', 'globe',
      'scan', 'webhook'],
  },
  {
    id: 'business', name: 'Business', tab: 'trending-up',
    icons: ['trending-up', 'chart-column', 'chart-line', 'chart-pie',
      'briefcase', 'building-2', 'handshake', 'dollar-sign', 'euro', 'coins',
      'credit-card', 'wallet', 'piggy-bank', 'bitcoin', 'receipt',
      'calculator', 'shopping-cart', 'package', 'store', 'truck', 'megaphone',
      'presentation', 'clipboard-list', 'users', 'mail', 'scale'],
  },
  {
    id: 'learning', name: 'Learning', tab: 'graduation-cap',
    icons: ['graduation-cap', 'book-open', 'book', 'library', 'notebook-pen',
      'pencil', 'pen-tool', 'languages', 'microscope', 'flask-conical', 'atom',
      'telescope', 'dna', 'newspaper', 'scroll', 'landmark', 'square-sigma',
      'search', 'file-text', 'quote'],
  },
  {
    id: 'health', name: 'Health & Sport', tab: 'dumbbell',
    icons: ['dumbbell', 'activity', 'heart-pulse', 'bike', 'footprints',
      'mountain', 'waves-horizontal', 'tent', 'trees', 'sun', 'moon', 'salad',
      'apple', 'pill', 'stethoscope', 'brain', 'timer', 'medal', 'volleyball',
      'flame-kindling', 'bath'],
  },
  {
    id: 'life', name: 'Life & Travel', tab: 'plane',
    icons: ['plane', 'car', 'train-front', 'ship', 'map', 'map-pin', 'compass',
      'luggage', 'hotel', 'house', 'sofa', 'utensils', 'chef-hat', 'coffee',
      'wine', 'beer', 'cake-slice', 'shirt', 'gift', 'baby', 'dog', 'cat',
      'leaf', 'flower', 'sprout', 'recycle', 'hammer', 'paintbrush',
      'scissors'],
  },
];

const missing = [];
CATS.forEach((cat) => {
  if (!nodes[cat.tab]) missing.push('tab:' + cat.tab);
  cat.icons = cat.icons.filter((name) => {
    if (nodes[name]) return true;
    missing.push(cat.id + '/' + name);
    return false;
  });
});
if (missing.length) console.error('MISSING: ' + missing.join(', '));

const keywords = {};
for (const name of Object.keys(nodes)) {
  const words = new Set(name.split('-'));
  (tags[name] || []).forEach((tag) =>
    String(tag).toLowerCase().split(/[\s-]+/).forEach((w) => words.add(w)));
  keywords[name] = [...words].join(' ');
}

const out = { n: nodes, k: keywords, c: CATS };
fs.writeFileSync(__dirname + '/icons.json', JSON.stringify(out));
console.log('icons:', Object.keys(nodes).length,
  '| categories:', CATS.length,
  '| bytes:', fs.statSync(__dirname + '/icons.json').size);
