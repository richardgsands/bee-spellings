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

// Returns { read, unclear, model }. The other fields are only for the Worker's logs and
// dashboard: `target` (never shown to Claude), `device`, `save: false` to keep the image out,
// and the pen strokes (`ink`, `area`) for a background comparison with Google's reader.
export async function readHandwriting(png, { target, device, save = true, ink, area, timeoutMs = 20000 } = {}) {
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(`${API_URL}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bee-Code': READER_CODE },
      body: JSON.stringify({ image: png, target, device, save, ink, area }),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ReaderError(data.error || 'http_' + res.status);
    return { read: String(data.read ?? ''), unclear: !!data.unclear, model: String(data.model ?? '') };
  });
}
