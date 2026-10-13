// Handwriting recognition.
//  - readHandwriting(): Claude vision, via our Cloudflare Worker (see worker/). Copies the
//    letters exactly as written, so misspellings stay misspelt.
//  - recognize(): Google's free input-tools endpoint. Fallback only: its dictionary can
//    "correct" a misspelling into the real word.

export const READER_URL = 'https://bee-reader.bee-reader.workers.dev/read';
const READER_CODE = 'bee'; // must match the Worker's APP_CODE secret

const GOOGLE_URL = 'https://inputtools.google.com/request?ime=handwriting&app=mobilescript&cs=1&oe=UTF-8';

async function withTimeout(ms, fn) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

export class ReaderError extends Error {
  constructor(code) {
    super('Reader said ' + code);
    this.code = code;
  }
}

// Returns { read, unclear, model }.
export async function readHandwriting(png, { timeoutMs = 15000 } = {}) {
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(READER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bee-Code': READER_CODE },
      body: JSON.stringify({ image: png }),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ReaderError(data.error || 'http_' + res.status);
    return { read: String(data.read ?? ''), unclear: !!data.unclear, model: String(data.model ?? '') };
  });
}

// Returns Google's ranked candidate words.
export async function recognize(ink, width, height, { timeoutMs = 10000 } = {}) {
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(GOOGLE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
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
  });
}
