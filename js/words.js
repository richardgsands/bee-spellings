// Word lists and settings, persisted in localStorage.

const KEY = 'bee-spellings-v1';

const y3Week4 = [
  ['flies', 'A bee flies from flower to flower.'],
  ['copy', 'Please copy the sentence into your book.'],
  ['copier', 'The school copier printed our worksheets.'],
  ['happiest', 'My birthday was the happiest day of the year.'],
  ['nicest', 'That is the nicest picture you have drawn.'],
  ['tries', 'She always tries her best.'],
  ['copying', 'He is copying the words carefully.'],
  ['happy', 'The bee is happy in the sunshine.'],
  ['nice', 'It is a nice day for a picnic.'],
  ['pat', 'You can pat the friendly dog.'],
  ['replies', 'Tom always replies to his letters.'],
  ['copied', 'I copied the spelling neatly.'],
  ['happier', 'I feel happier after a hug.'],
  ['nicer', 'This cake is even nicer than the last one.'],
  ['patted', 'She patted the cat gently.'],
  ['patting', 'He is patting the puppy on the head.'],
  ['walked', 'We walked to school this morning.'],
  ['kinder', 'Try to be kinder to each other.'],
  ['walk', 'Let us walk to the park.'],
  ['kind', 'It was kind of you to help.'],
];

export function defaultConfig() {
  return {
    version: 1,
    activeListId: 'y3-autumn1-week4',
    perGo: 10,
    fingerMode: 'auto',
    readSentence: true,
    voiceURI: '',
    rate: 0.85,
    lists: [
      {
        id: 'y3-autumn1-week4',
        name: 'Y3 Autumn 1 – Week 4',
        note: 'Adding -ing, -ed, -er and -est. A final y changes to i before -es, -ed, -er and -est, but stays before -ing (no double i!).',
        words: y3Week4.map(([w, sentence]) => ({ w, sentence, on: true })),
      },
    ],
    stats: {},
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch { /* fall through to defaults */ }
  return defaultConfig();
}

export function save(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* private mode etc. */ }
}

export function activeList(cfg) {
  return cfg.lists.find((l) => l.id === cfg.activeListId) || cfg.lists[0];
}

export function parseWords(text) {
  return String(text)
    .split(/[\s,;]+/)
    .map((w) => w.trim().replace(/^[^\p{L}']+|[^\p{L}']+$/gu, ''))
    .filter(Boolean);
}

export function newId() {
  return 'list-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Record a result: 2 = first try without peeking, 1 = got there, 0 = not yet.
export function record(cfg, listId, word, score) {
  const s = (cfg.stats[listId] ||= {});
  const w = (s[word] ||= { seen: 0, best: 0, last: 0 });
  w.seen++;
  w.last = score;
  w.best = Math.max(w.best, score);
}

export function trickyWords(cfg, list) {
  const s = cfg.stats[list.id] || {};
  return list.words.filter((x) => x.on && s[x.w] && s[x.w].last < 2);
}
