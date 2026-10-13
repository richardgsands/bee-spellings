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

const y3Week5 = [
  ['forgetting', 'I keep forgetting my PE kit.'],
  ['beginning', 'The beginning of the story was exciting.'],
  ['preferred', 'She preferred apples to bananas.'],
  ['limiting', 'Mum is limiting my screen time.'],
  ['footballer', 'The footballer scored a goal.'],
  ['forgotten', 'I have forgotten my lunchbox.'],
  ['beginner', 'He is a beginner at swimming.'],
  ['gardening', 'Grandad loves gardening in the spring.'],
  ['limited', 'There are only a limited number of tickets.'],
  ['writer', 'The writer made up a funny story.'],
  ['writing', 'I am writing a letter to my friend.'],
  ['reading', 'We are reading a book about bees.'],
  ['reader', 'She is a very good reader.'],
  ['cleaning', 'We are cleaning the classroom.'],
  ['cleaner', 'The cleaner mopped the floor.'],
  ['prefer', 'I prefer honey to jam.'],
  ['gardener', 'The gardener planted some flowers.'],
  ['limitation', 'Being tired was the only limitation on our fun.'],
  ['begin', 'Let us begin the race!'],
  ['forget', 'Do not forget your coat.'],
];

const builtInLists = () => [
  {
    id: 'y3-autumn1-week4',
    name: 'Y3 Autumn 1 – Week 4',
    note: 'Adding -ing, -ed, -er and -est. A final y changes to i before -es, -ed, -er and -est, but stays before -ing (no double i!).',
    words: y3Week4.map(([w, sentence]) => ({ w, sentence })),
  },
  {
    id: 'y3-autumn1-week5',
    name: 'Y3 Autumn 1 – Week 5',
    note: 'Adding -ing, -ed, -er and -en to longer words. If the end of the word is stressed (for-GET, be-GIN), double the last letter: forgetting. If it isn\'t (GAR-den, LIM-it), just add the ending: gardening.',
    words: y3Week5.map(([w, sentence]) => ({ w, sentence })),
  },
];

export function defaultConfig() {
  return {
    version: 1,
    selectedListIds: ['y3-autumn1-week5'], // the weeks being practised
    activeListId: 'y3-autumn1-week5', // the list open for editing in Grown-ups
    perGo: 10,
    fingerMode: 'auto',
    readSentence: true,
    shareSamples: true, // let the reader save pictures of the written words (Grown-ups can turn off)
    voiceURI: '',
    rate: 0.9,
    lists: builtInLists(),
    removedBuiltIns: [],
    stats: {},
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const cfg = { ...defaultConfig(), ...JSON.parse(raw) };
      // Bring in built-in lists added since this device last saved (unless a grown-up deleted them).
      for (const l of builtInLists()) {
        if (!cfg.lists.some((x) => x.id === l.id) && !cfg.removedBuiltIns.includes(l.id)) cfg.lists.push(l);
      }
      // Older saves picked a single list to practise.
      if (!Array.isArray(JSON.parse(raw).selectedListIds)) cfg.selectedListIds = [cfg.activeListId];
      tidySelection(cfg);
      return cfg;
    }
  } catch { /* fall through to defaults */ }
  return defaultConfig();
}

export function save(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* private mode etc. */ }
}

export function isBuiltIn(id) {
  return builtInLists().some((l) => l.id === id);
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

// Keep the selection pointing at lists that exist, and never empty.
export function tidySelection(cfg) {
  cfg.selectedListIds = cfg.selectedListIds.filter((id) => cfg.lists.some((l) => l.id === id));
  if (!cfg.selectedListIds.length && cfg.lists.length) cfg.selectedListIds = [cfg.lists[0].id];
}

export function selectedLists(cfg) {
  return cfg.lists.filter((l) => cfg.selectedListIds.includes(l.id));
}

// Every word in the selected lists (a word in two lists is only practised once).
export function practiceWords(cfg) {
  const seen = new Set();
  const out = [];
  for (const l of selectedLists(cfg)) {
    for (const x of l.words) {
      const key = x.w.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ w: x.w.trim(), sentence: x.sentence, say: x.say, listId: l.id });
    }
  }
  return out;
}

export function trickyWords(cfg) {
  return practiceWords(cfg).filter((x) => cfg.stats[x.listId]?.[x.w]?.last < 2);
}
