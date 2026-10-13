// Spelling Bee handwriting reader.
// Receives a PNG of a child's handwriting and asks Claude to copy the letters
// exactly as written (mistakes included). The app compares the result with the
// target word itself, so Claude is never told what the word should be.

import Anthropic from "@anthropic-ai/sdk";

interface Env {
  ANTHROPIC_API_KEY: string;
  APP_CODE: string;
  ALLOWED_ORIGINS: string;
  LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const MODEL = "claude-haiku-5-5";
const MAX_IMAGE_BYTES = 400_000;

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = cors(request.headers.get("Origin"), env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/read") {
      return json({ error: "not_found" }, 404, headers);
    }
    if (!env.APP_CODE || request.headers.get("X-Bee-Code") !== env.APP_CODE) {
      return json({ error: "bad_code" }, 401, headers);
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.LIMITER.limit({ key: ip });
    if (!success) return json({ error: "rate_limited" }, 429, headers);

    let image: string;
    try {
      ({ image } = (await request.json()) as { image: string });
    } catch {
      return json({ error: "bad_request" }, 400, headers);
    }
    if (typeof image !== "string" || !image.startsWith("iVBOR") || image.length > (MAX_IMAGE_BYTES * 4) / 3) {
      return json({ error: "bad_image" }, 400, headers);
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: image } },
              { type: "text", text: "Transcribe this handwritten word exactly as written." },
            ],
          },
        ],
      });

      if (response.stop_reason === "refusal") return json({ error: "refused" }, 502, headers);
      const block = response.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") return json({ error: "no_text" }, 502, headers);
      const parsed = JSON.parse(block.text) as { text: string; unclear: boolean };
      return json({ read: parsed.text, unclear: parsed.unclear, model: response.model }, 200, headers);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 503, headers);
      if (err instanceof Anthropic.APIError) {
        console.error("Claude API error", err.status, err.message);
        return json({ error: "claude_error" }, 502, headers);
      }
      console.error("Reader failed", err);
      return json({ error: "reader_failed" }, 500, headers);
    }
  },
};
