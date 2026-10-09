// Handwriting recognition via Google's (free, keyless) input tools endpoint.
// Sends raw pen strokes; returns a ranked list of candidate words.

const URL = 'https://inputtools.google.com/request?ime=handwriting&app=mobilescript&cs=1&oe=UTF-8';

// Recognise several inks in one request; returns one candidate list per ink.
export async function recognizeMany(inks, width, height, { timeoutMs = 10000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const writing_guide = { writing_area_width: Math.round(width), writing_area_height: Math.round(height) };
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        options: 'enable_pre_space',
        requests: inks.map((ink) => ({ writing_guide, ink, language: 'en' })),
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data[0] !== 'SUCCESS') throw new Error('Recogniser said ' + data[0]);
    return inks.map((_, i) => data[1]?.[i]?.[1] || []);
  } finally {
    clearTimeout(timer);
  }
}

export async function recognize(ink, width, height, opts) {
  return (await recognizeMany([ink], width, height, opts))[0];
}
