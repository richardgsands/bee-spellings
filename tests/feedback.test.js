import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, evaluate, align, marks, hint, spellable, letterReading } from '../js/feedback.js';
import { groupStrokes } from '../js/segment.js';

test('norm lowercases, strips spaces and stray punctuation', () => {
  assert.equal(norm('  Happ ier. '), 'happier');
  assert.equal(norm('Walked!'), 'walked');
});

test('evaluate: correct, unsure, wrong, empty', () => {
  assert.equal(evaluate('happier', ['Happier', 'happies']).status, 'correct');
  assert.equal(evaluate('happier', ['hoppier', 'happier']).status, 'unsure');
  assert.equal(evaluate('happier', ['happyer', 'happier']).status, 'unsure');
  assert.equal(evaluate('happier', ['happyer', 'hippyer']).status, 'wrong');
  assert.equal(evaluate('happier', ['a', 'b', 'c', 'd', 'e', 'happier']).status, 'wrong');
  assert.equal(evaluate('happier', []).status, 'empty');
});

test('align finds swaps, missing and extra letters', () => {
  const kinds = (a, b) => align(a, b).filter((o) => o.op !== 'same').map((o) => o.op);
  assert.deepEqual(kinds('kind', 'kidn'), ['swap']);
  assert.deepEqual(kinds('walked', 'walkd'), ['del']);
  assert.deepEqual(kinds('walk', 'wallk'), ['ins']);
  assert.deepEqual(kinds('nice', 'nise'), ['sub']);
  assert.deepEqual(kinds('copy', 'copy'), []);
});

test('marks highlight the wrong letters', () => {
  const mk = marks('happier', 'happyer');
  assert.deepEqual(mk.target.map((x) => x.ok), [true, true, true, true, false, true, true]);
  assert.equal(mk.read.find((x) => !x.ok).ch, 'y');
  const missing = marks('walked', 'walkd');
  assert.ok(missing.read.some((x) => x.missing));
});

const rule = (t, r) => hint(t, r).rule;

test('y to i rule', () => {
  assert.equal(rule('happier', 'happyer'), 'y-to-i');
  assert.equal(rule('copied', 'copyed'), 'y-to-i');
  assert.equal(rule('flies', 'flys'), 'y-to-i');
  assert.equal(rule('happiest', 'happyest'), 'y-to-i');
  assert.equal(rule('replies', 'replys'), 'y-to-i');
});

test('keep y before -ing', () => {
  assert.equal(rule('copying', 'copiing'), 'keep-y-ing');
  assert.equal(rule('copying', 'coping'), 'keep-y-ing');
});

test('double the consonant', () => {
  assert.equal(rule('patted', 'pated'), 'double');
  assert.equal(rule('patting', 'pating'), 'double');
});

test('word already ends in e', () => {
  assert.equal(rule('nicer', 'niceer'), 'drop-e');
  assert.equal(rule('nicest', 'niceest'), 'drop-e');
});

test('endings and generic hints', () => {
  assert.equal(rule('walked', 'walkt'), 'ending');
  assert.equal(rule('kinder', 'kindest'), 'ending');
  assert.equal(rule('walk', 'walking'), 'ending');
  assert.equal(rule('walk', 'wallk'), 'extra-double');
  assert.equal(rule('kind', 'kidn'), 'swap');
  assert.equal(rule('nice', 'nise'), 'one-letter');
  assert.equal(rule('tries', 'tres'), 'missing');
  assert.equal(rule('happy', 'elephant'), 'different');
  assert.equal(rule('happy', ''), 'empty');
});

test('hints never reveal the whole word', () => {
  const words = ['flies', 'copy', 'copier', 'happiest', 'nicest', 'tries', 'copying', 'happy', 'nice', 'pat',
    'replies', 'copied', 'happier', 'nicer', 'patted', 'patting', 'walked', 'kinder', 'walk', 'kind'];
  const misspell = (w) => w.slice(0, -1);
  for (const w of words) {
    const h = hint(w, misspell(w));
    assert.ok(!h.speak.toLowerCase().includes(w), `${w}: ${h.speak}`);
  }
});

test('letters read one by one catch dictionary "corrections"', () => {
  const walc = [['w', 'W'], ['a', 'A'], ['l', '1', '|'], ['C', 'c', '(', '[', 'E']];
  const res = evaluate('walk', ['walk', 'walc'], walc);
  assert.equal(res.status, 'wrong');
  assert.equal(res.read, 'walc');
  assert.equal(hint('walk', res.read).rule, 'one-letter');
});

test('letter check accepts correct writing, confusable shapes and joined letters', () => {
  assert.equal(evaluate('walk', ['walk'], [['w'], ['a'], ['l'], ['k', 'K']]).status, 'correct');
  assert.equal(evaluate('walk', ['walk'], [['w'], ['a'], ['1', '|'], ['k']]).status, 'correct');
  assert.equal(evaluate('walk', ['walk'], [['wa', 'wo'], ['lk', 'Ik']]).status, 'correct');
  assert.equal(evaluate('kind', ['kind'], [['k'], ['i', 'l'], ['n', 'h'], ['d', 'a']]).status, 'correct');
  assert.equal(evaluate('kind', ['kind'], [['k'], ['i'], ['.'], ['n'], ['d']]).status, 'correct');
  assert.equal(evaluate('walk', ['walk'], []).status, 'correct');
  assert.equal(evaluate('walk', ['walk'], [['walk']]).status, 'correct');
});

test('letters that clearly spell the word make a dictionary mismatch "unsure", not wrong', () => {
  assert.equal(evaluate('walk', ['wall'], [['w'], ['a'], ['l'], ['k']]).status, 'unsure');
  assert.equal(evaluate('walk', ['wall'], [['w'], ['a'], ['l'], ['l', 'k']]).status, 'wrong');
});

test('spellable only uses the top three distinct readings per letter', () => {
  assert.equal(spellable('cat', [['c'], ['o', 'O', 'a'], ['t']]), true);
  assert.equal(spellable('cat', [['c'], ['o', 'O', '0', 'u', 'e', 'a'], ['t']]), false);
  assert.equal(letterReading([['C', 'c'], ['|'], ['t']]), 'clt');
});

test('groupStrokes keeps overlapping strokes together and splits on gaps', () => {
  const s = (x0, x1) => [[x0, x1], [0, 10], [0, 1]];
  const ink = [s(0, 20), s(30, 50), s(40, 40), s(30, 55), s(80, 100)];
  const groups = groupStrokes(ink);
  assert.equal(groups.length, 3);
  assert.equal(groups[1].length, 3);
  assert.equal(groupStrokes([s(0, 10)]).length, 1);
});
