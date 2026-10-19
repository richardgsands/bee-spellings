// Spelling Bee handwriting reader.
// Receives a PNG of a child's handwriting and asks Claude to copy the letters
// exactly as written (mistakes included). The app compares the result with the
// target word itself, so Claude is never told what the word should be.
//
// Also: logs each check (and the image, if the device allows it) to D1, re-reads it
// in the background with a cheaper model and with Google's handwriting reader for
// comparison, records simple usage events, and serves a password-protected
// dashboard at /admin.

import Anthropic from "@anthropic-ai/sdk";
import { renderDashboard, type DashboardData } from "./dashboard";

interface Env {
  ANTHROPIC_API_KEY: string;
  APP_CODE: string;
  ADMIN_KEY: string;
  ALLOWED_ORIGINS: string;
  CROSS_CHECK_RATE: string;
  RETENTION_DAYS: string;
  DB: D1Database;
  LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const MODEL = "claude-opus-5-5"; // answers the child
const CHECK_MODEL = "claude-haiku-5-5"; // background comparison for the dashboard
const MAX_IMAGE_BYTES = 400_000;
const MAX_INK_CHARS = 300_000;
const EVENTS = new Set(["open", "start", "finish", "misread"]);
const DAY = 86_400_000;

const SYSTEM = `You transcribe a primary-school child's handwriting for a spelling test.

The image shows one word written with a pen on a tablet. It may be printed or joined-up (cursive).

Copy the letters exactly as the child wrote them. Keep every spelling mistake: missing, extra, doubled, swapped or wrong letters must appear just as written. Never correct the spelling and never guess which word the child meant - a misspelt word must stay misspelt.

When a letter's shape is ambiguous, choose what the shape actually shows, not the letter that would make a real word. Ignore stray marks and crossings-out.

Return the word in lowercase letters only. Set "unclear" to true only if at least one letter is genuinely hard to make out.`;

const SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string", description: "The letters exactly as written, lowercase" },
    unclear: { type: "boolean", description: "True if any letter is genuinely hard to read" },
  },
  required: ["text", "unclear"],
  additionalProperties: false,
};

interface Reading {
  text: string;
  unclear: boolean;
  model: string;
}

// ---------- helpers ----------

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Bee-Code",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

const shortText = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

// The pen strokes and writing-area size, if the app sent sensible ones (for the Google comparison).
function strokes(ink: unknown, area: unknown): { ink: unknown[] | null; area: { w: number; h: number } | null } {
  const a = area as { w?: unknown; h?: unknown } | null;
  const ok =
    Array.isArray(ink) && ink.length > 0 && ink.length <= 200 && JSON.stringify(ink).length <= MAX_INK_CHARS &&
    typeof a?.w === "number" && typeof a?.h === "number" && a.w > 0 && a.h > 0 && a.w < 10_000 && a.h < 10_000;
  return ok ? { ink: ink as unknown[], area: { w: Math.round(a!.w as number), h: Math.round(a!.h as number) } } : { ink: null, area: null };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const imageContent = (image: string) => [
  { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: image } },
  { type: "text" as const, text: "Transcribe this handwritten word exactly as written." },
];

function parseReading(response: {
  stop_reason: string | null;
  content: Array<{ type: string; text?: string }>;
  model: string;
}): Reading {
  if (response.stop_reason === "refusal") throw new Error("refused");
  const block = response.content.find((b) => b.type === "text");
  if (!block?.text) throw new Error("no_text");
  const parsed = JSON.parse(block.text) as { text: string; unclear: boolean };
  return { text: parsed.text, unclear: parsed.unclear, model: response.model };
}

// Models that accept Anthropic's server-side refusal fallback on this account.
const FALLBACK_MODELS = new Set(["claude-opus-5-5"]);

async function transcribe(client: Anthropic, model: string, image: string): Promise<Reading> {
  const params = {
    model,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: "low" as const, format: { type: "json_schema" as const, schema: SCHEMA } },
    messages: [{ role: "user" as const, content: imageContent(image) }],
  };
  const response = FALLBACK_MODELS.has(model)
    ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
    : await client.messages.create(params);
  return parseReading(response);
}

// Google's free handwriting reader, for comparison only: it reads pen strokes, and its
// dictionary tends to turn misspellings into real words.
const GOOGLE_URL = "https://inputtools.google.com/request?ime=handwriting&app=mobilescript&cs=1&oe=UTF-8";

async function readGoogle(ink: unknown, area: { w: number; h: number }): Promise<string> {
  const res = await fetch(GOOGLE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      options: "enable_pre_space",
      requests: [{ writing_guide: { writing_area_width: area.w, writing_area_height: area.h }, ink, language: "en" }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as [string, [string, string[]][]];
  if (data[0] !== "SUCCESS") throw new Error(String(data[0]));
  return (data[1]?.[0]?.[1]?.[0] ?? "").trim().toLowerCase();
}

// ---------- background work ----------

interface CheckEntry {
  device: string | null;
  country: string | null;
  target: string | null;
  image: string;
  ink: unknown[] | null;
  area: { w: number; h: number } | null;
  save: boolean;
  ms: number;
  reading: Reading;
}

const errorText = (err: unknown) =>
  (err instanceof Anthropic.APIError ? `API ${err.status}` : String((err as Error)?.message ?? err)).slice(0, 200);

async function logCheck(env: Env, client: Anthropic, entry: CheckEntry): Promise<void> {
  const { meta } = await env.DB.prepare(
    `INSERT INTO checks (ts, device, country, target, read, unclear, model, ms, image)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      Date.now(), entry.device, entry.country, entry.target,
      entry.reading.text, entry.reading.unclear ? 1 : 0, entry.reading.model, entry.ms,
      entry.save ? base64ToBytes(entry.image) : null,
    )
    .run();
  const id = meta.last_row_id;

  const crossCheck = async () => {
    if (Math.random() >= (Number(env.CROSS_CHECK_RATE) || 0)) return;
    try {
      const check = await transcribe(client, CHECK_MODEL, entry.image);
      await env.DB.prepare(`UPDATE checks SET check_read = ?, check_unclear = ?, check_model = ? WHERE id = ?`)
        .bind(check.text, check.unclear ? 1 : 0, check.model, id)
        .run();
    } catch (err) {
      await env.DB.prepare(`UPDATE checks SET check_error = ? WHERE id = ?`).bind(errorText(err), id).run();
    }
  };
  const googleCheck = async () => {
    if (!entry.ink || !entry.area) return;
    try {
      const read = await readGoogle(entry.ink, entry.area);
      await env.DB.prepare(`UPDATE checks SET google_read = ? WHERE id = ?`).bind(read, id).run();
    } catch (err) {
      await env.DB.prepare(`UPDATE checks SET google_error = ? WHERE id = ?`).bind(errorText(err), id).run();
    }
  };
  await Promise.all([crossCheck(), googleCheck()]);
}

// ---------- routes ----------

async function handleRead(request: Request, env: Env, ctx: ExecutionContext, headers: Record<string, string>) {
  let body: { image?: unknown; target?: unknown; device?: unknown; save?: unknown; ink?: unknown; area?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400, headers);
  }
  const image = body.image;
  if (typeof image !== "string" || !image.startsWith("iVBOR") || image.length > (MAX_IMAGE_BYTES * 4) / 3) {
    return json({ error: "bad_image" }, 400, headers);
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const started = Date.now();
  let reading: Reading;
  try {
    reading = await transcribe(client, MODEL, image);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 503, headers);
    if (err instanceof Anthropic.APIError) {
      console.error("Claude API error", err.status, err.message);
      return json({ error: "claude_error" }, 502, headers);
    }
    console.error("Reader failed", err);
    return json({ error: "reader_failed" }, 500, headers);
  }

  ctx.waitUntil(
    logCheck(env, client, {
      device: shortText(body.device, 64),
      country: (request.cf?.country as string | undefined) ?? null,
      target: shortText(body.target, 40),
      image,
      ...strokes(body.ink, body.area),
      save: body.save !== false,
      ms: Date.now() - started,
      reading,
    }).catch((err) => console.error("Logging failed", err)),
  );
  return json({ read: reading.text, unclear: reading.unclear, model: reading.model }, 200, headers);
}

async function handleEvent(request: Request, env: Env, headers: Record<string, string>) {
  let body: { device?: unknown; event?: unknown; detail?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400, headers);
  }
  const device = shortText(body.device, 64);
  const event = typeof body.event === "string" && EVENTS.has(body.event) ? body.event : null;
  if (!device || !event) return json({ error: "bad_request" }, 400, headers);
  const detail = body.detail === undefined ? null : JSON.stringify(body.detail).slice(0, 500);
  await env.DB.prepare(`INSERT INTO events (ts, device, event, country, region, detail) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(
      Date.now(), device, event,
      (request.cf?.country as string | undefined) ?? null,
      (request.cf?.region as string | undefined) ?? null,
      detail,
    )
    .run();
  return json({ ok: true }, 200, headers);
}

function adminAuthorised(request: Request, env: Env): boolean {
  if (!env.ADMIN_KEY) return false;
  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Basic ")) return false;
  try {
    const decoded = atob(auth.slice(6));
    return decoded.slice(decoded.indexOf(":") + 1) === env.ADMIN_KEY;
  } catch {
    return false;
  }
}

async function handleAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  if (!adminAuthorised(request, env)) {
    return new Response("Sign in with any username and the admin password.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Spelling Bee dashboard", charset="UTF-8"' },
    });
  }

  if (url.pathname === "/admin/image") {
    const id = Number(url.searchParams.get("id"));
    const row = await env.DB.prepare(`SELECT image FROM checks WHERE id = ?`).bind(id).first<{ image: number[] | null }>();
    if (!row?.image) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(row.image), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" },
    });
  }

  const now = Date.now();
  const since = (days: number) => now - days * DAY;
  const [devices, daily, dailyChecks, places, checks] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(DISTINCT CASE WHEN ts > ?1 THEN device END) AS d1,
         COUNT(DISTINCT CASE WHEN ts > ?2 THEN device END) AS d7,
         COUNT(DISTINCT CASE WHEN ts > ?3 THEN device END) AS d30
       FROM events`,
    ).bind(since(1), since(7), since(30)).first<DashboardData["devices"]>(),
    env.DB.prepare(
      `SELECT date(ts / 1000, 'unixepoch') AS day, COUNT(DISTINCT device) AS devices,
              SUM(event = 'start') AS sessions, SUM(event = 'finish') AS finished
       FROM events WHERE ts > ? GROUP BY day ORDER BY day DESC`,
    ).bind(since(14)).all<DashboardData["daily"][number]>(),
    env.DB.prepare(
      `SELECT date(ts / 1000, 'unixepoch') AS day, COUNT(*) AS checks FROM checks WHERE ts > ? GROUP BY day`,
    ).bind(since(14)).all<DashboardData["dailyChecks"][number]>(),
    env.DB.prepare(
      `SELECT country, region, COUNT(DISTINCT device) AS devices, COUNT(*) AS events
       FROM events WHERE ts > ? GROUP BY country, region ORDER BY devices DESC, events DESC LIMIT 30`,
    ).bind(since(30)).all<DashboardData["places"][number]>(),
    env.DB.prepare(
      `SELECT id, ts, device, target, read, unclear, model, ms, check_read, check_unclear, check_model, check_error,
              google_read, google_error, image IS NOT NULL AS has_image
       FROM checks WHERE ts > ? ORDER BY ts DESC LIMIT 1000`,
    ).bind(since(30)).all<DashboardData["checks"][number]>(),
  ]);

  const data: DashboardData = {
    generated: now,
    devices: devices ?? { d1: 0, d7: 0, d30: 0 },
    daily: daily.results,
    dailyChecks: dailyChecks.results,
    places: places.results,
    checks: checks.results,
    crossCheckRate: Number(env.CROSS_CHECK_RATE) || 0,
    retentionDays: Number(env.RETENTION_DAYS) || 90,
    mainModel: MODEL,
    checkModel: CHECK_MODEL,
  };
  return new Response(renderDashboard(data), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      return handleAdmin(request, env, url);
    }

    const headers = cors(request.headers.get("Origin"), env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST" || (url.pathname !== "/read" && url.pathname !== "/event")) {
      return json({ error: "not_found" }, 404, headers);
    }
    if (!env.APP_CODE || request.headers.get("X-Bee-Code") !== env.APP_CODE) {
      return json({ error: "bad_code" }, 401, headers);
    }
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.LIMITER.limit({ key: `${url.pathname}:${ip}` });
    if (!success) return json({ error: "rate_limited" }, 429, headers);

    return url.pathname === "/read" ? handleRead(request, env, ctx, headers) : handleEvent(request, env, headers);
  },

  // Nightly: delete logs and images past the retention period.
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const cutoff = Date.now() - (Number(env.RETENTION_DAYS) || 90) * DAY;
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM checks WHERE ts < ?`).bind(cutoff),
      env.DB.prepare(`DELETE FROM events WHERE ts < ?`).bind(cutoff),
    ]);
  },
};
