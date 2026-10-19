import { Pad } from './pad.js';
import { readHandwriting } from './recognize.js';
import { deviceId, track } from './analytics.js';
import { evaluateRead, hint, marks } from './feedback.js';
import * as speech from './speech.js';
import * as store from './words.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let cfg = store.load();
let session = null;
let pad = null;

// ---------- bee ----------
const beeTpl = $('bee-tpl');
document.querySelectorAll('[data-bee]').forEach((el) => el.append(beeTpl.content.cloneNode(true)));

function beeMood(mood, motion = '') {
  const bee = $('coach-bee');
  bee.className = `bee bee-coach mood-${mood}`;
  if (motion) {
    void bee.offsetWidth; // restart animation
    bee.classList.add(motion);
  }
}

// ---------- sounds ----------
let audio = null;
function tone(freqs, dur = 0.12, type = 'sine') {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audio.currentTime;
    freqs.forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * dur);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + i * dur + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i + 1) * dur + 0.15);
      o.connect(g).connect(audio.destination);
      o.start(t0 + i * dur);
      o.stop(t0 + (i + 1) * dur + 0.2);
    });
  } catch { /* audio is optional */ }
}
const chime = () => tone([523, 659, 784, 1047], 0.1, 'triangle');
const boop = () => tone([392, 330], 0.14, 'sine');

function confetti() {
  const box = $('confetti');
  const bits = ['🐝', '🍯', '⭐', '🌼', '✨'];
  for (let i = 0; i < 26; i++) {
    const el = document.createElement('i');
    el.textContent = pick(bits);
    el.style.left = Math.random() * 100 + 'vw';
    el.style.setProperty('--x', (Math.random() * 200 - 100) + 'px');
    el.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
    el.style.setProperty('--d', (1.4 + Math.random() * 1.2) + 's');
    el.style.animationDelay = Math.random() * 0.3 + 's';
    box.append(el);
    setTimeout(() => el.remove(), 3200);
  }
}

// ---------- screens ----------
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  if (id === 'home') renderHome();
  if (id === 'learn') renderLearn();
  if (id === 'settings') renderSettings();
}
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { speech.stop(); show(b.dataset.go); }));

function list() { return store.activeList(cfg); } // the list open in Grown-ups
function inScope() { return store.practiceWords(cfg); }
function persist() { store.save(cfg); speech.configure(cfg); pad?.setFingerMode(cfg.fingerMode); }

function renderHome() {
  const box = $('home-lists');
  box.innerHTML = '';
  for (const l of cfg.lists) {
    const n = l.words.filter((w) => w.w.trim()).length;
    const b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('aria-pressed', String(cfg.selectedListIds.includes(l.id)));
    b.innerHTML = `${esc(l.name)} <small>· ${n} word${n === 1 ? '' : 's'}</small>`;
    b.addEventListener('click', () => toggleList(l.id));
    box.append(b);
  }
  $('btn-start').disabled = !inScope().length;
  const tricky = store.trickyWords(cfg);
  $('btn-tricky').classList.toggle('hidden', !tricky.length);
  $('btn-tricky').textContent = `🔁 Tricky words (${tricky.length})`;
}

function toggleList(id) {
  const on = cfg.selectedListIds.includes(id);
  if (on && cfg.selectedListIds.length === 1) return; // always practise at least one list
  cfg.selectedListIds = on ? cfg.selectedListIds.filter((x) => x !== id) : [...cfg.selectedListIds, id];
  persist();
  renderHome();
}

function renderLearn() {
  const box = $('learn-words');
  box.innerHTML = '';
  const words = inScope();
  for (const l of store.selectedLists(cfg)) {
    const section = document.createElement('section');
    section.className = 'learn-list';
    section.innerHTML = `<h3>${esc(l.name)}</h3>${l.note ? `<p class="rule-note">${esc(l.note)}</p>` : ''}<div class="honeycomb"></div>`;
    const comb = section.querySelector('.honeycomb');
    for (const w of words.filter((x) => x.listId === l.id)) {
      const b = document.createElement('button');
      b.textContent = w.w;
      b.addEventListener('click', async () => {
        b.classList.add('speaking');
        const word = speech.spoken(w.w, w.say);
        await speech.say(word, cfg.readSentence && w.sentence, word);
        b.classList.remove('speaking');
      });
      comb.append(b);
    }
    box.append(section);
  }
}

// ---------- practise ----------
function startSession(words) {
  if (!words.length) return;
  let pool = store.shuffle(words);
  if (cfg.perGo > 0) pool = pool.slice(0, cfg.perGo);
  session = { words: pool, i: 0, results: [], points: 0 };
  track('start', { lists: cfg.selectedListIds, words: pool.length });
  show('practise');
  if (!pad) pad = new Pad($('pad'), { fingerMode: cfg.fingerMode, onChange: updateButtons });
  $('score').textContent = '0';
  presentWord();
}

function current() { return session.words[session.i]; }

function sayWord() {
  const w = current();
  const word = speech.spoken(w.w, w.say);
  return speech.say(`Can you write… ${word}?`, cfg.readSentence && w.sentence, cfg.readSentence && w.sentence && word);
}

function setBubble(html, { good = false } = {}) {
  $('bubble-text').innerHTML = html;
  $('bubble').classList.toggle('good', good);
}

function presentWord() {
  Object.assign(session, { attempt: 1, unclear: 0, peeked: false, revealed: false, finished: false });
  pad.clear();
  $('reveal').classList.add('hidden');
  $('bubble-read').classList.add('hidden');
  $('btn-misread').classList.add('hidden');
  $('btn-next').classList.add('hidden');
  $('btn-check').classList.remove('hidden');
  renderProgress();
  beeMood('smile');
  setBubble(`Word ${session.i + 1} of ${session.words.length}. Listen carefully, then write the word you hear! 👂✏️`);
  updateButtons();
  sayWord();
}

function renderProgress() {
  const p = $('progress');
  p.innerHTML = '';
  session.words.forEach((_, i) => {
    const el = document.createElement('i');
    const r = session.results[i];
    if (r) el.className = 'r' + r.score;
    else if (i === session.i) el.className = 'now';
    p.append(el);
  });
}

function updateButtons(busy = false) {
  if (!session) return;
  const empty = !pad || pad.isEmpty;
  $('btn-check').disabled = busy === true || empty;
  $('btn-undo').disabled = busy === true || empty || session.finished;
  $('btn-clear').disabled = busy === true || empty || session.finished;
  $('btn-peek').disabled = busy === true || session.finished || session.revealed;
  $('btn-hear').disabled = busy === true;
}

function showJars() {
  const jars = session.points / 2;
  $('score').textContent = Math.floor(jars) + (jars % 1 ? '½' : '');
  const s = $('score').parentElement;
  s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump');
}

const praise = [
  ['Bee-utiful!', 'Beautiful!'],
  ['Buzz-tastic!', 'Buzztastic!'],
  ['Hive five! 🖐️', 'Hive five!'],
  ['Un-bee-lievable!', 'Unbelievable!'],
  ['Sweet as honey!', 'Sweet as honey!'],
  ["You're the bee's knees!", "You're the bee's knees!"],
];

function finishWord(score) {
  const w = current();
  session.finished = true;
  session.results[session.i] = { w: w.w, score };
  session.points += score;
  store.record(cfg, w.listId, w.w, score);
  store.save(cfg);
  if (score) showJars();
  renderProgress();
  $('btn-check').classList.add('hidden');
  $('btn-next').classList.remove('hidden');
  updateButtons();
}

function correct() {
  const w = current();
  const score = session.attempt === 1 && !session.peeked ? 2 : 1;
  const [html, spoken] = pick(praise);
  beeMood('happy', 'dance');
  const jar = score === 2 ? 'a whole jar of honey 🍯' : 'half a jar of honey 🍯';
  setBubble(`${html} You spelled <b>${esc(w.w)}</b> correctly and won ${jar}!`, { good: true });
  $('reveal').classList.add('hidden');
  $('bubble-read').classList.add('hidden');
  $('btn-misread').classList.add('hidden');
  chime();
  confetti();
  const jarSpoken = score === 2 ? 'a whole jar of honey' : 'half a jar of honey';
  speech.say(`${spoken} You spelled ${speech.spoken(w.w, w.say)} correctly and won ${jarSpoken}!`);
  finishWord(score);
}

function revealHTML(target, read) {
  const mk = marks(target, read);
  const tiles = (arr, cls) => `<div class="tiles ${cls}">${arr.map((x) =>
    `<span class="${x.ok ? '' : 'bad'} ${x.missing ? 'missing' : ''}">${esc(x.ch)}</span>`).join('')}</div>`;
  return `<span>Bumble read:</span>${tiles(mk.read, 'read')}<span>The word is:</span>${tiles(mk.target, 'target')}`;
}

function wrong(read) {
  const w = current();
  boop();
  pad.dim();
  if (session.attempt === 1) {
    const h = hint(w.w, read);
    const lead = ['different', 'empty'].includes(h.rule) ? 'Good try!' : pick(['Ooh, nearly!', 'Good try!', 'So close!']);
    beeMood('oops', 'wiggle');
    setBubble(`${lead} ${h.html} Have another go! 💪`);
    speech.say(lead, h.speak, 'Have another go!');
    session.attempt = 2;
  } else if (session.attempt === 2) {
    beeMood('think', 'wiggle');
    setBubble(`Let's look at it together. The <span style="color:var(--leaf)">green</span> letters are the ones to fix. Copy it carefully, then press Check!`);
    const r = $('reveal');
    r.innerHTML = revealHTML(w.w, read);
    r.classList.remove('hidden');
    session.revealed = true;
    session.attempt = 3;
    speech.say(`Let's look at it together. Copy it carefully, then press check.`);
  } else {
    beeMood('smile');
    setBubble(`Good try! This one is tricky. We'll practise <b>${esc(w.w)}</b> again soon. 🌼`);
    speech.say(`Good try! We'll practise this one again soon.`);
    finishWord(0);
  }
  updateButtons();
}

// Read the writing with Claude (exact letters).
async function readPad(target) {
  const r = await readHandwriting(pad.toPNGBase64(), { target, device: deviceId(), save: cfg.shareSamples !== false });
  return evaluateRead(target, r.read, r.unclear);
}

function showRead(read) {
  $('bubble-read').innerHTML = `Bumble read: <b>${esc(read)}</b>`;
  $('bubble-read').classList.toggle('hidden', !read);
}

async function check() {
  if (!session || session.finished) return;
  if (pad.isEmpty) {
    beeMood('think', 'wiggle');
    setBubble('Write the word in the box first! ✏️');
    return;
  }
  const w = current();
  updateButtons(true);
  $('bubble-read').classList.add('hidden'); // the last reading is out of date now
  $('checking').classList.remove('hidden');
  beeMood('think');
  let res;
  try {
    res = await readPad(w.w);
  } catch (err) {
    console.warn('Reader unavailable', err);
    beeMood('think', 'wiggle');
    if (err.code === 'rate_limited' || err.code === 'busy') {
      setBubble(`Phew, lots of checking! Bumble needs a quick breather. Wait a minute, then press <b>Check</b> again. 🐝`);
      speech.say(`Phew, lots of checking! Bumble needs a quick breather. Wait a minute, then press check again.`);
    } else {
      setBubble(`Bumble is taking a little break right now 💤 Your writing is safe – press <b>Check</b> again in a few minutes. (If it keeps happening, check the Wi-Fi.)`);
      speech.say(`Bumble is taking a little break right now. Press check again in a few minutes.`);
    }
    updateButtons();
    return;
  } finally {
    $('checking').classList.add('hidden');
  }
  session.checkedAttempt = session.attempt;
  if (res.status === 'correct') return correct();
  $('btn-misread').classList.remove('hidden');
  // Claude couldn't make out a letter: ask once for a neater go, then treat the reading
  // as a normal answer (an unclear reading says nothing about whether the spelling is right).
  if (res.status === 'unclear' && ++session.unclear < 2) {
    beeMood('think', 'wiggle');
    pad.dim();
    setBubble(`I couldn't quite read one of your letters. Can you write it again a bit neater? 🔍`);
    showRead(res.read);
    speech.say(`I couldn't quite read one of your letters. Can you write it again a bit neater?`);
    return updateButtons();
  }
  if (res.status === 'empty') {
    beeMood('think', 'wiggle');
    pad.dim();
    setBubble(`Hmm, I couldn't read any letters. Try writing a bit bigger, sitting on the bold line. 🔍`);
    speech.say(`Hmm, I couldn't read that. Try writing a bit bigger.`);
    return updateButtons();
  }
  wrong(res.read);
  showRead(res.read);
}

// A grown-up says the writing was right and Bumble misread it.
function misread() {
  if (!session) return;
  const prev = session.results[session.i];
  if (prev) session.points -= prev.score; // the word had already been scored as "not yet"
  session.finished = false;
  session.attempt = session.checkedAttempt || session.attempt;
  track('misread', { target: current().w, read: $('bubble-read').textContent.replace('Bumble read: ', '') });
  correct();
}

function next() {
  session.i++;
  if (session.i >= session.words.length) return showResults();
  presentWord();
}

function showResults() {
  speech.stop();
  const max = session.words.length * 2;
  const pct = session.points / max;
  $('results-title').textContent = pct === 1 ? 'Perfect! Buzz-tastic!' : pct >= 0.7 ? 'Bee-utiful work!' : 'Well done for trying!';
  const jars = session.points / 2;
  $('results-sub').textContent = `You collected ${Math.floor(jars)}${jars % 1 ? '½' : ''} jar${jars === 1 ? '' : 's'} of honey 🍯`;
  const icon = ['🔁', '👍', '⭐'];
  $('results-list').innerHTML = session.results.map((r) => `<li class="r${r.score}">${icon[r.score]} ${esc(r.w)}</li>`).join('');
  const tricky = session.results.filter((r) => r.score < 2);
  $('btn-results-tricky').classList.toggle('hidden', !tricky.length);
  show('results');
  track('finish', { words: session.words.length, points: session.points, max });
  if (pct >= 0.7) { confetti(); chime(); }
  speech.say($('results-title').textContent.replace('Bee-utiful', 'Beautiful'), $('results-sub').textContent);
}

// ---------- peek ----------
let peekTimer = null;
function peek() {
  if (!session || session.finished) return;
  session.peeked = true;
  const ms = 3000;
  $('peek-word').textContent = current().w;
  const bar = $('peek-bar');
  bar.classList.remove('run'); void bar.offsetWidth;
  bar.style.setProperty('--peek-ms', ms + 'ms');
  bar.classList.add('run');
  $('peek').classList.remove('hidden');
  clearTimeout(peekTimer);
  peekTimer = setTimeout(closePeek, ms);
}
function closePeek() {
  clearTimeout(peekTimer);
  $('peek').classList.add('hidden');
}

// ---------- grown-ups (press and hold) ----------
function holdButton(btn, ms, done) {
  let raf = 0, start = 0;
  const step = (t) => {
    const p = Math.min(1, (t - start) / ms);
    btn.style.setProperty('--p', p);
    if (p >= 1) { cancel(); done(); } else raf = requestAnimationFrame(step);
  };
  const cancel = () => { cancelAnimationFrame(raf); btn.style.setProperty('--p', 0); };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); start = performance.now(); raf = requestAnimationFrame(step); });
  for (const t of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(t, cancel);
}

function renderSettings() {
  const sel = $('list-select');
  sel.innerHTML = cfg.lists.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
  sel.value = list().id;
  $('list-name').value = list().name;
  $('list-note').value = list().note || '';
  $('per-go').value = String(cfg.perGo);
  $('read-sentence').checked = cfg.readSentence;
  $('share-samples').checked = cfg.shareSamples !== false;
  $('finger-mode').value = cfg.fingerMode;
  $('rate').value = cfg.rate;
  $('reader-status').textContent = '';
  $('btn-del-list').disabled = cfg.lists.length < 2;
  renderVoices();
  renderWordRows();
}

// "claude-haiku-5-5" -> "Claude Haiku 5.5"
function modelName(id) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id || '');
  if (!m) return id || 'Claude';
  return `Claude ${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}`;
}

// Send a small typed sample to the Claude reader to check the code works.
async function testReader() {
  const status = (text) => { $('reader-status').textContent = text; };
  const c = document.createElement('canvas');
  c.width = 360; c.height = 140;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000'; ctx.font = '80px Andika, sans-serif';
  ctx.fillText('bees', 40, 100);
  status('Testing…');
  try {
    const r = await readHandwriting(c.toDataURL('image/png').split(',')[1], { target: 'bees', device: deviceId(), save: false });
    status(`Working ✓ – ${modelName(r.model)} read “${r.read}”.`);
  } catch (err) {
    const why = { rate_limited: 'too many checks – wait a minute' }[err.code];
    status(`Not working: ${why || err.message}. Bumble can't check writing until it's working again.`);
  }
}

function renderVoices() {
  const voices = speech.englishVoices();
  const label = (v) => {
    const q = speech.quality(v);
    return `${v.name}${q && !v.name.includes(q) ? ` (${q})` : ''} – ${v.lang}`;
  };
  const natural = voices.find((v) => speech.quality(v) && /en[-_]GB/i.test(v.lang));
  const auto = natural ? label(natural) : 'the iPad’s own English (UK) voice';
  $('voice').innerHTML =
    `<option value="">Automatic (${esc(auto)})</option>` +
    `<option value="${speech.SYSTEM}">The iPad’s own English (UK) voice (from Settings)</option>` +
    voices.map((v) => `<option value="${esc(v.voiceURI)}">${esc(label(v))}</option>`).join('');
  $('voice').value = cfg.voiceURI || '';
  $('voice-tip').classList.toggle('hidden', !!natural);
  $('voice-list').innerHTML = voices.length
    ? voices.map((v) => `<li>${esc(label(v))}${v.localService ? '' : ' · online'}<br><code>${esc(v.voiceURI)}</code></li>`).join('')
    : '<li>None reported yet – try again in a moment.</li>';
}

function renderWordRows() {
  const body = $('words-body');
  body.innerHTML = '';
  list().words.forEach((w, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="word-input" value="${esc(w.w)}" autocapitalize="off" autocorrect="off" spellcheck="false"></td>
      <td><input type="text" value="${esc(w.sentence || '')}" placeholder="—"></td>
      <td><input type="text" class="say-input" value="${esc(w.say || '')}" placeholder="—" autocapitalize="off" autocorrect="off" spellcheck="false"></td>
      <td><button class="del" aria-label="Remove word">🗑️</button></td>`;
    const [word, sentence, sayAs] = tr.querySelectorAll('input');
    sayAs.addEventListener('change', () => { w.say = sayAs.value.trim(); persist(); speech.say(speech.spoken(w.w, w.say)); });
    word.addEventListener('change', () => { w.w = word.value.trim(); persist(); });
    sentence.addEventListener('change', () => { w.sentence = sentence.value.trim(); persist(); });
    tr.querySelector('.del').addEventListener('click', () => { list().words.splice(i, 1); persist(); renderWordRows(); });
    body.append(tr);
  });
  countWords();
}

function countWords() {
  const n = list().words.length;
  $('word-count').textContent = `${n} word${n === 1 ? '' : 's'} in this list`;
}

function bindSettings() {
  $('list-select').addEventListener('change', (e) => { cfg.activeListId = e.target.value; persist(); renderSettings(); });
  $('list-name').addEventListener('change', (e) => { list().name = e.target.value.trim() || 'My words'; persist(); renderSettings(); });
  $('list-note').addEventListener('change', (e) => { list().note = e.target.value.trim(); persist(); });
  $('btn-new-list').addEventListener('click', () => {
    const name = prompt('Name for the new list:', 'New spellings');
    if (name === null) return;
    const l = { id: store.newId(), name: name.trim() || 'New spellings', note: '', words: [] };
    cfg.lists.push(l);
    cfg.activeListId = l.id;
    persist();
    renderSettings();
    $('add-words').focus();
  });
  $('btn-del-list').addEventListener('click', () => {
    if (cfg.lists.length < 2 || !confirm(`Delete the list “${list().name}”?`)) return;
    if (store.isBuiltIn(list().id)) cfg.removedBuiltIns.push(list().id);
    cfg.lists = cfg.lists.filter((l) => l.id !== list().id);
    cfg.activeListId = cfg.lists[0].id;
    store.tidySelection(cfg);
    persist();
    renderSettings();
  });
  $('btn-add-words').addEventListener('click', () => {
    const have = new Set(list().words.map((w) => w.w.toLowerCase()));
    for (const w of store.parseWords($('add-words').value)) {
      if (have.has(w.toLowerCase())) continue;
      have.add(w.toLowerCase());
      list().words.push({ w, sentence: '' });
    }
    $('add-words').value = '';
    persist();
    renderWordRows();
  });
  $('btn-test-reader').addEventListener('click', testReader);
  $('per-go').addEventListener('change', (e) => { cfg.perGo = Number(e.target.value); persist(); });
  $('read-sentence').addEventListener('change', (e) => { cfg.readSentence = e.target.checked; persist(); });
  $('share-samples').addEventListener('change', (e) => { cfg.shareSamples = e.target.checked; persist(); });
  $('finger-mode').addEventListener('change', (e) => { cfg.fingerMode = e.target.value; persist(); });
  $('voice').addEventListener('change', (e) => { cfg.voiceURI = e.target.value; persist(); });
  $('rate').addEventListener('change', (e) => { cfg.rate = Number(e.target.value); persist(); });
  $('btn-test-voice').addEventListener('click', () => speech.say('Hello! I am Bumble the bee. Can you write… happier?'));
  $('btn-export').addEventListener('click', () => {
    const data = JSON.stringify({ app: 'spelling-bee', lists: cfg.lists }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'spelling-bee-lists.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const lists = (data.lists || []).filter((l) => l && l.id && l.name && Array.isArray(l.words));
      if (!lists.length) throw new Error('no lists');
      for (const l of lists) {
        l.words = l.words.filter((w) => w && w.w).map((w) => ({ w: String(w.w), sentence: String(w.sentence || ''), say: String(w.say || '') }));
        const i = cfg.lists.findIndex((x) => x.id === l.id);
        if (i >= 0) cfg.lists[i] = l; else cfg.lists.push(l);
      }
      persist();
      renderSettings();
      alert(`Imported ${lists.length} list${lists.length === 1 ? '' : 's'}.`);
    } catch {
      alert('Sorry, that file doesn’t look like a Spelling Bee export.');
    }
  });
  $('btn-clear-stats').addEventListener('click', () => {
    if (!confirm('Forget which words were tricky?')) return;
    cfg.stats = {};
    persist();
  });
  $('btn-reset').addEventListener('click', () => {
    if (!confirm('Reset all lists and settings back to the start? Your own lists will be deleted.')) return;
    cfg = store.defaultConfig();
    persist();
    renderSettings();
  });
  $('btn-settings-done').addEventListener('click', () => show('home'));
}

// ---------- wiring ----------
$('btn-start').addEventListener('click', () => startSession(inScope()));
$('btn-learn').addEventListener('click', () => show('learn'));
$('btn-tricky').addEventListener('click', () => startSession(store.trickyWords(cfg)));
$('btn-again').addEventListener('click', () => startSession(inScope()));
$('btn-results-tricky').addEventListener('click', () => {
  const tricky = new Set(session.results.filter((r) => r.score < 2).map((r) => r.w));
  startSession(inScope().filter((w) => tricky.has(w.w)));
});
$('btn-hear').addEventListener('click', sayWord);
$('btn-peek').addEventListener('click', peek);
$('peek').addEventListener('click', closePeek);
$('btn-undo').addEventListener('click', () => pad.undo());
$('btn-clear').addEventListener('click', () => pad.clear());
$('btn-check').addEventListener('click', check);
$('btn-next').addEventListener('click', next);
$('btn-quit').addEventListener('click', () => {
  if (session && session.results.length && !confirm('Stop practising and go home?')) return;
  speech.stop();
  closePeek();
  show('home');
});
holdButton($('btn-grownups'), 1500, () => show('settings'));
window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
  if ($('settings').classList.contains('active')) renderVoices();
});
holdButton($('btn-misread'), 1500, misread);
bindSettings();
speech.configure(cfg);
show('home');
track('open');
