// Read-aloud using the Web Speech API.
// Picks the most natural British English voice on the device: Apple's free
// "Premium" and "Enhanced" voices (downloadable on the iPad) beat the basic ones.

const synth = window.speechSynthesis;
let voices = [];
let chosenURI = '';
let rate = 0.9;

function refresh() { voices = synth ? synth.getVoices() : []; }
if (synth) {
  refresh();
  synth.addEventListener?.('voiceschanged', refresh);
}

// Apple's novelty and robotic voices: never pick these automatically.
const NOVELTY = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
const FAVOURITES = ['Serena', 'Jamie', 'Kate', 'Daniel', 'Stephanie', 'Arthur', 'Martha', 'Oliver', 'Google UK English Female'];

export function quality(v) {
  const id = `${v.name} ${v.voiceURI}`;
  if (/premium/i.test(id)) return 'Premium';
  if (/enhanced/i.test(id)) return 'Enhanced';
  return '';
}

function score(v) {
  let s = 0;
  if (/en[-_]GB/i.test(v.lang)) s += 100;
  s += { Premium: 40, Enhanced: 20, '': 0 }[quality(v)];
  const fav = FAVOURITES.findIndex((n) => v.name.includes(n));
  if (fav >= 0) s += 10 - fav;
  if (NOVELTY.test(v.name)) s -= 1000;
  return s;
}

// English voices, best first.
export function englishVoices() {
  refresh();
  return voices.filter((v) => /^en[-_]/i.test(v.lang)).sort((a, b) => score(b) - score(a));
}

// The voice to use, or null to let the device use its own default voice for
// British English (on an iPad, the one chosen in Settings, which Safari may not
// list for web pages even when it's a downloaded Enhanced or Premium voice).
export const SYSTEM = 'system';
export function currentVoice() {
  if (chosenURI === SYSTEM) return null;
  const en = englishVoices();
  const chosen = chosenURI && en.find((x) => x.voiceURI === chosenURI);
  if (chosen) return chosen;
  const best = en[0];
  return best && quality(best) ? best : null;
}

export function configure({ voiceURI, rate: r }) {
  chosenURI = voiceURI || '';
  if (r) rate = r;
}

export const supported = !!synth;

// Words that voices tend to say wrongly when they're on their own,
// mapped to a spelling that sounds right ("reading" isn't the town of Reading).
const SOUNDS_LIKE = {
  reading: 'reeding',
};

// How to say a spelling word by itself. A grown-up's "say it as" wins.
export function spoken(word, sayAs) {
  return (sayAs && sayAs.trim()) || SOUNDS_LIKE[word.trim().toLowerCase()] || word;
}

// Speak one or more phrases in order. Resolves when finished (or cancelled).
// The phrases go in one utterance (a full stop between each gives a pause):
// iPad Safari can drop the later utterances of a queue.
export function say(...phrases) {
  if (!synth) return Promise.resolve();
  synth.cancel();
  const parts = phrases.flat().filter(Boolean).map((p) => String(p).trim());
  if (!parts.length) return Promise.resolve();
  const text = parts.map((p) => (/[.!?…]$/.test(p) ? p : p + '.')).join(' ');
  const voice = currentVoice();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-GB'; }
    u.rate = rate;
    u.onend = resolve;
    u.onerror = resolve;
    synth.speak(u);
  });
}

export function stop() { synth?.cancel(); }
