import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, evaluate, evaluateRead, align, marks, hint } from '../js/feedback.js';

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

test('week 5: double only when the end is stressed', () => {
  assert.equal(rule('forgetting', 'forgeting'), 'double');
  assert.match(hint('forgetting', 'forgeting').speak, /stressed/);
  assert.equal(rule('beginning', 'begining'), 'double');
  assert.equal(rule('preferred', 'prefered'), 'double');
  assert.equal(rule('forgotten', 'forgoten'), 'double');
  assert.equal(rule('beginner', 'beginer'), 'double');
  assert.equal(rule('footballer', 'footbaler'), 'double');
  assert.match(hint('patted', 'pated').speak, /Short vowel/);
  assert.equal(rule('limiting', 'limitting'), 'no-double');
  assert.equal(rule('gardening', 'gardenning'), 'no-double');
  assert.equal(rule('limited', 'limitted'), 'no-double');
  assert.equal(rule('limitation', 'limittation'), 'no-double');
  assert.match(hint('gardener', 'gardenner').speak, /isn't stressed/);
  assert.equal(rule('writing', 'writting'), 'no-double');
  assert.match(hint('reading', 'readding').speak, /Long vowel/);
  assert.equal(rule('writing', 'writeing'), 'drop-e-ing');
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
  const words = ['forgetting', 'beginning', 'preferred', 'limiting', 'footballer', 'forgotten', 'beginner',
    'gardening', 'limited', 'writer', 'writing', 'reading', 'reader', 'cleaning', 'cleaner', 'prefer', 'gardener',
    'limitation', 'begin', 'forget', 'flies', 'copy', 'copier', 'happiest', 'nicest', 'tries', 'copying', 'happy', 'nice', 'pat',
    'replies', 'copied', 'happier', 'nicer', 'patted', 'patting', 'walked', 'kinder', 'walk', 'kind'];
  const misspell = (w) => w.slice(0, -1);
  for (const w of words) {
    const h = hint(w, misspell(w));
    assert.ok(!h.speak.toLowerCase().includes(w), `${w}: ${h.speak}`);
  }
});

test('evaluateRead: exact letters decide, unclear readings ask for a neater go', () => {
  assert.deepEqual(evaluateRead('beginning', 'beginning'), { status: 'correct', read: 'beginning' });
  assert.equal(evaluateRead('beginning', ' Beginning. ').status, 'correct');
  assert.deepEqual(evaluateRead('walk', 'walc'), { status: 'wrong', read: 'walc' });
  assert.equal(evaluateRead('walk', 'walc', true).status, 'unsure');
  assert.equal(evaluateRead('walk', '').status, 'empty');
  assert.equal(hint('walk', evaluateRead('walk', 'walc').read).rule, 'one-letter');
});
