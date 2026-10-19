// Spelling comparison and child-friendly feedback.
// Pure functions only (no DOM) so they can be unit tested with `node --test`.

export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, '')
    .replace(/^[^a-z']+|[^a-z']+$/g, '');
}

// Claude's reading: the letters exactly as written.
//   correct – the letters spell the word
//   unclear – they don't, but the reader flagged a letter it couldn't make out
//             (says nothing about whether the spelling is right)
//   wrong   – they spell something else
//   empty   – nothing readable
export function evaluateRead(target, read, unclear = false) {
  const t = norm(target), r = norm(read);
  if (!r) return { status: 'empty', read: '' };
  if (r === t) return { status: 'correct', read: r };
  return { status: unclear ? 'unclear' : 'wrong', read: r };
}

// Optimal-string-alignment edit script from target `a` to what was read `b`.
// Ops: same | sub | del (letter missing from b) | ins (extra letter in b) | swap
export function align(a, b) {
  const n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && a[i - 1] !== a[i - 2]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) {
      ops.push({ op: 'same', t: a[i - 1], r: b[j - 1], ti: i - 1 }); i--; j--;
    } else if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && a[i - 1] !== a[i - 2] && d[i][j] === d[i - 2][j - 2] + 1) {
      ops.push({ op: 'swap', t: a[i - 2] + a[i - 1], r: b[j - 2] + b[j - 1], ti: i - 2 }); i -= 2; j -= 2;
    } else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      ops.push({ op: 'sub', t: a[i - 1], r: b[j - 1], ti: i - 1 }); i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ op: 'del', t: a[i - 1], r: '', ti: i - 1 }); i--;
    } else {
      ops.push({ op: 'ins', t: '', r: b[j - 1], ti: i }); j--;
    }
  }
  return ops.reverse();
}

// Letter-by-letter marks for showing both words with mistakes highlighted.
export function marks(target, read) {
  const ops = align(norm(target), norm(read));
  const t = [], r = [];
  for (const o of ops) {
    const ok = o.op === 'same';
    if (o.op === 'swap') {
      for (const ch of o.t) t.push({ ch, ok: false });
      for (const ch of o.r) r.push({ ch, ok: false });
      continue;
    }
    if (o.t) t.push({ ch: o.t, ok });
    if (o.r) r.push({ ch: o.r, ok });
    else if (o.op === 'del') r.push({ ch: '_', ok: false, missing: true });
  }
  return { target: t, read: r };
}

const b = (s) => `<b>${s}</b>`;
const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/-(\w+)/g, ' $1');

const syllables = (s) => (s.match(/[aeiouy]+/g) || []).length;

function where(index, length) {
  if (index < length / 3) return 'near the beginning';
  if (index >= (2 * length) / 3) return 'near the end';
  return 'in the middle';
}

// A hint that helps without giving the answer away.
// Returns { rule, html, speak } where `rule` names the spelling pattern spotted.
export function hint(target, read) {
  const t = norm(target), r = norm(read);
  const out = (rule, html) => ({ rule, html, speak: plain(html) });

  if (!r) return out('empty', `I couldn't see any letters. Try writing a bit bigger!`);

  // y -> i before -es, -ed, -er, -est (fly -> flies, copy -> copier)
  let m = t.match(/^(.*[^aeiou])i(es|ed|er|est)$/);
  if (m && r.startsWith(m[1] + 'y')) {
    return out('y-to-i', `When a word ends in ${b('y')}, change the ${b('y')} to ${b('i')} before adding ${b('-' + m[2])}.`);
  }

  // keep the y before -ing (copy -> copying, not copiing)
  m = t.match(/^(.*)y(ing)$/);
  if (m && (r.startsWith(m[1] + 'i') || r === m[1] + 'ing')) {
    return out('keep-y-ing', `Keep the ${b('y')} when you add ${b('-ing')} – we never want ${b('ii')}!`);
  }

  // double the final consonant after a short vowel (pat -> patting)
  // or a stressed last syllable (forget -> forgetting, prefer -> preferred)
  m = t.match(/^(.*[aeiou])([bdgklmnprt])\2(ed|ing|er|est|en)$/);
  if (m && r.startsWith(m[1] + m[2]) && !r.startsWith(m[1] + m[2] + m[2])) {
    const end = b('-' + m[3]);
    if (m[2] === 'l') return out('double', `Don't forget the double ${b('ll')}!`);
    if (syllables(m[1]) > 1) {
      return out('double', `The end of this word is stressed – say it out loud! So double the last letter before adding ${end}.`);
    }
    return out('double', `Short vowel sound? Double the last letter before adding ${end}.`);
  }

  // no doubling when the last syllable isn't stressed (garden -> gardening, limit -> limited)
  // or the vowel sound is long (read -> reading, write -> writer)
  m = t.match(/^(.*[aeiou])([bdgkmnprt])(ed|ing|er|en|ation)$/);
  if (m && r.startsWith(m[1] + m[2] + m[2])) {
    if (syllables(m[1]) > 1) {
      return out('no-double', `The end of this word isn't stressed – say it out loud! So don't double the last letter.`);
    }
    return out('no-double', `Long vowel sound, so you only need one ${b(m[2])}.`);
  }

  // drop the e before -ing (write -> writing)
  m = t.match(/^(.*[^aeiou])ing$/);
  if (m && r.startsWith(m[1] + 'eing')) {
    return out('drop-e-ing', `When a word ends in ${b('e')}, take the ${b('e')} off before adding ${b('-ing')}.`);
  }

  // word already ends in e (nice -> nicer, nicest)
  m = t.match(/^(.*e)(r|st|d)$/);
  if (m && r.startsWith(m[1] + 'e')) {
    return out('drop-e', `The word already ends in ${b('e')}, so you only need to add ${b('-' + m[2])}.`);
  }

  const ops = align(t, r);
  const errs = ops.filter((o) => o.op !== 'same');

  // an extra doubled letter (e.g. wallked)
  const dbl = errs.find((o) => o.op === 'ins' && ops.some((p) => p.op === 'same' && (p.ti === o.ti - 1 || p.ti === o.ti) && p.r === o.r));
  if (errs.length === 1 && dbl) {
    return out('extra-double', `You only need one ${b(dbl.r)} there.`);
  }

  const place = where(errs[0]?.ti ?? 0, t.length);
  if (errs.length === 1) {
    const e = errs[0];
    if (e.op === 'del') return out('missing', `You've missed out a letter ${place}. Can you spot it?`);
    if (e.op === 'ins') return out('extra', `An extra letter has sneaked in ${place}!`);
    if (e.op === 'swap') return out('swap', `Two letters have swapped places ${place}!`);
    return out('one-letter', `Just one letter isn't quite right – look ${place}.`);
  }

  // right start, wrong ending
  const endings = ['ing', 'est', 'ed', 'er', 'ies', 'es', 's'];
  const tEnd = endings.find((e) => t.endsWith(e) && t.length - e.length >= 2);
  if (tEnd) {
    const stem = t.slice(0, t.length - tEnd.length);
    if (r.startsWith(stem) && !r.endsWith(tEnd)) {
      return out('ending', `Great start! Listen carefully to the ${b('ending')} of the word.`);
    }
  }
  if (!tEnd && r.startsWith(t) && r.length > t.length) {
    return out('ending', `You've added an ending this word doesn't need. Listen again!`);
  }

  if (errs.length > Math.max(2, t.length / 2)) {
    return out('different', `Hmm, that looks like a different word. Listen carefully to it again!`);
  }
  return out('few', `A few letters need fixing – look ${place}.`);
}
