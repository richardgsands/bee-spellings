// Handwriting recognition: Claude vision, via our Cloudflare Worker (see worker/).
// Copies the letters exactly as written, so misspellings stay misspelt.

export const API_URL = 'https://bee-reader.bee-reader.workers.dev';
export const READER_CODE = 'bee'; // must match the Worker's APP_CODE secret

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

// Returns { read, unclear, model }. `target`, `device` and `save` are only used for the
// Worker's logs (the target word is never shown to Claude); `save: false` keeps the image out.
export async function readHandwriting(png, { target, device, save = true, timeoutMs = 15000 } = {}) {
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(`${API_URL}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bee-Code': READER_CODE },
      body: JSON.stringify({ image: png, target, device, save }),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ReaderError(data.error || 'http_' + res.status);
    return { read: String(data.read ?? ''), unclear: !!data.unclear, model: String(data.model ?? '') };
  });
}
