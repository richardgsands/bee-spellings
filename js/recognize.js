// Handwriting recognition via Google's (free, keyless) input tools endpoint.
// Sends raw pen strokes; returns a ranked list of candidate words.

const URL = 'https://inputtools.google.com/request?ime=handwriting&app=mobilescript&cs=1&oe=UTF-8';

export async function recognize(ink, width, height, { timeoutMs = 10000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        options: 'enable_pre_space',
        requests: [{
          writing_guide: { writing_area_width: Math.round(width), writing_area_height: Math.round(height) },
          ink,
          language: 'en',
        }],
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data[0] !== 'SUCCESS') throw new Error('Recogniser said ' + data[0]);
    return data[1]?.[0]?.[1] || [];
  } finally {
    clearTimeout(timer);
  }
}
