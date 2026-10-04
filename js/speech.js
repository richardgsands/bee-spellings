// Read-aloud using the Web Speech API, preferring a British English voice.

const synth = window.speechSynthesis;
let voices = [];
let chosenURI = '';
let rate = 0.85;

function refresh() { voices = synth ? synth.getVoices() : []; }
if (synth) {
  refresh();
  synth.addEventListener?.('voiceschanged', refresh);
}

const preferred = ['Daniel', 'Kate', 'Serena', 'Martha', 'Arthur', 'Stephanie', 'Google UK English Female'];

export function englishVoices() {
  refresh();
  return voices.filter((v) => /^en[-_]/i.test(v.lang));
}

function pickVoice() {
  const en = englishVoices();
  if (chosenURI) {
    const v = en.find((x) => x.voiceURI === chosenURI);
    if (v) return v;
  }
  const gb = en.filter((v) => /en[-_]GB/i.test(v.lang));
  for (const name of preferred) {
    const v = gb.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return gb.find((v) => v.localService) || gb[0] || en[0] || null;
}

export function configure({ voiceURI, rate: r }) {
  chosenURI = voiceURI || '';
  if (r) rate = r;
}

export const supported = !!synth;

// Speak one or more phrases in order. Resolves when finished (or cancelled).
export function say(...phrases) {
  if (!synth) return Promise.resolve();
  synth.cancel();
  const voice = pickVoice();
  const parts = phrases.flat().filter(Boolean);
  return new Promise((resolve) => {
    if (!parts.length) return resolve();
    parts.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-GB'; }
      u.rate = rate;
      u.pitch = 1.1;
      if (i === parts.length - 1) { u.onend = resolve; u.onerror = resolve; }
      synth.speak(u);
    });
  });
}

export function stop() { synth?.cancel(); }
