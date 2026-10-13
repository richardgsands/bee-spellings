// Anonymous usage events, sent to the reader Worker (see worker/).
// The device ID is a random value made on this device; nothing personal is sent.

import { API_URL, READER_CODE } from './recognize.js';

const KEY = 'bee-device-id';
let id = null;

export function deviceId() {
  if (id) return id;
  try {
    id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
  } catch {
    id ||= crypto.randomUUID(); // storage blocked: one ID for this visit
  }
  return id;
}

// Fire-and-forget; analytics must never get in the way of practising.
export function track(event, detail) {
  try {
    fetch(`${API_URL}/event`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Bee-Code': READER_CODE },
      body: JSON.stringify({ device: deviceId(), event, detail }),
    }).catch(() => {});
  } catch { /* ignore */ }
}
