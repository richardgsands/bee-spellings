// Server-rendered usage and accuracy dashboard for /admin.

export interface DashboardData {
  generated: number;
  devices: { d1: number; d7: number; d30: number };
  daily: { day: string; devices: number; sessions: number; finished: number }[];
  dailyChecks: { day: string; checks: number }[];
  places: { country: string | null; region: string | null; devices: number; events: number }[];
  checks: {
    id: number;
    ts: number;
    device: string | null;
    target: string | null;
    read: string | null;
    unclear: number;
    model: string | null;
    ms: number | null;
    check_read: string | null;
    check_unclear: number | null;
    check_model: string | null;
    check_error: string | null;
    google_read: string | null;
    google_error: string | null;
    has_image: number;
  }[];
  byDevice: { device: string | null; ip: string | null; country: string | null; checks: number; first: number; last: number }[];
  crossCheckRate: number;
  retentionDays: number;
  mainModel: string;
  checkModel: string;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const when = (ts: number) =>
  new Date(ts).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const flag = (cc: string | null) =>
  cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "";
const modelName = (id: string) => {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? "." + m[3] : ""}` : id;
};

type Check = DashboardData["checks"][number];

// One check's readings by reader. Older rows had Haiku answering and Opus checking,
// newer ones the other way round, so look readers up by model name.
function readingOf(c: Check, reader: string): string | null {
  if (reader === "google") return c.google_read;
  if (c.model?.includes(reader)) return c.read;
  if (c.check_model?.includes(reader)) return c.check_read;
  return null;
}

const REFERENCE = "opus";
const COMPARED = [
  { key: "haiku", name: "Claude Haiku" },
  { key: "google", name: "Google" },
];

export function renderDashboard(d: DashboardData): string {
  const verdict = (read: string | null, target: string | null) => norm(read) === norm(target);

  // Accuracy of each reader against Opus.
  const stats = COMPARED.map((r) => {
    const both = d.checks.filter((c) => readingOf(c, REFERENCE) !== null && readingOf(c, r.key) !== null);
    const withTarget = both.filter((c) => c.target);
    const falsePass = withTarget.filter((c) => verdict(readingOf(c, r.key), c.target) && !verdict(readingOf(c, REFERENCE), c.target));
    const falseFail = withTarget.filter((c) => !verdict(readingOf(c, r.key), c.target) && verdict(readingOf(c, REFERENCE), c.target));
    return {
      ...r,
      compared: both.length,
      sameText: both.filter((c) => norm(readingOf(c, r.key)) === norm(readingOf(c, REFERENCE))).length,
      withTarget: withTarget.length,
      falsePass: falsePass.length,
      falseFail: falseFail.length,
    };
  });
  const errors = d.checks.filter((c) => c.check_error || c.google_error).length;
  const times = d.checks.filter((c) => c.model?.includes(REFERENCE)).map((c) => c.ms ?? 0).filter(Boolean).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : 0;

  // Words that children find hardest (by the reference reader's verdict).
  const byWord = new Map<string, { tries: number; right: number }>();
  for (const c of d.checks) {
    const ref = readingOf(c, REFERENCE) ?? c.read;
    if (!c.target) continue;
    const w = byWord.get(c.target) ?? { tries: 0, right: 0 };
    w.tries++;
    if (verdict(ref, c.target)) w.right++;
    byWord.set(c.target, w);
  }
  const hardest = [...byWord.entries()]
    .filter(([, w]) => w.tries >= 2)
    .sort((a, b) => a[1].right / a[1].tries - b[1].right / b[1].tries || b[1].tries - a[1].tries)
    .slice(0, 15);

  // Daily table: merge usage events and checks.
  const checksByDay = new Map(d.dailyChecks.map((r) => [r.day, r.checks]));
  const days = [...new Set([...d.daily.map((r) => r.day), ...checksByDay.keys()])].sort().reverse();
  const usageByDay = new Map(d.daily.map((r) => [r.day, r]));

  const img = (c: Check) =>
    c.has_image ? `<img src="/admin/image?id=${c.id}" alt="handwriting" loading="lazy">` : `<span class="muted">not saved</span>`;
  const cell = (c: Check, reader: string) => {
    const read = readingOf(c, reader);
    const error = reader === "google" ? c.google_error : c.model?.includes(reader) ? null : c.check_error;
    if (read === null) return error ? `<span class="muted">error: ${esc(error)}</span>` : `<span class="muted">–</span>`;
    const ok = c.target ? verdict(read, c.target) : null;
    const shown = c.model?.includes(reader) ? ' <span class="muted" title="What the child saw">★</span>' : "";
    return `<span class="${ok === null ? "" : ok ? "right" : "wrongword"}">${esc(read) || "<i>nothing</i>"}</span>${shown}`;
  };
  const disagree = (c: Check) => {
    const ref = readingOf(c, REFERENCE);
    return ref !== null && COMPARED.some((r) => readingOf(c, r.key) !== null && norm(readingOf(c, r.key)) !== norm(ref));
  };
  const checkRow = (c: Check) => `
    <tr>
      <td class="nowrap">${esc(when(c.ts))}</td>
      <td class="word">${esc(c.target ?? "")}</td>
      <td>${img(c)}</td>
      <td class="word">${cell(c, REFERENCE)}</td>
      ${COMPARED.map((r) => `<td class="word">${cell(c, r.key)}</td>`).join("")}
    </tr>`;
  const checkTable = (rows: Check[], empty: string) =>
    rows.length
      ? `<div class="scroll"><table><thead><tr><th>When</th><th>Word</th><th>Writing</th><th>Claude Opus</th>${COMPARED.map((r) => `<th>${esc(r.name)}</th>`).join("")}</tr></thead><tbody>${rows.map(checkRow).join("")}</tbody></table></div>`
      : `<p class="muted">${empty}</p>`;
  const disagreements = d.checks.filter(disagree).slice(0, 60);

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spelling Bee dashboard</title>
<style>
  :root { --bg: #fffaeb; --card: #fff; --ink: #2b1d0e; --muted: #7a6446; --line: #ecdcb4; --honey: #ffc93c;
          --ok: #2f8a3e; --ok-bg: #e2f5e1; --warn: #a3620a; --warn-bg: #fff0d4; --bad: #b8324f; --bad-bg: #ffe2e9; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #1d1710; --card: #2a2118; --ink: #f5ead6; --muted: #bba78a; --line: #4a3b28; --honey: #f0b52e;
            --ok: #8fd69a; --ok-bg: #1f3a22; --warn: #f2c27a; --warn-bg: #3d2d12; --bad: #ff9fb5; --bad-bg: #42202a; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, -apple-system, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 20px 16px 60px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 32px 0 10px; }
  .muted { color: var(--muted); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 16px; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .tile b { display: block; font-size: 28px; line-height: 1.1; }
  .tile span { color: var(--muted); font-size: 13px; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  th { font-size: 13px; color: var(--muted); font-weight: 600; }
  tr:last-child td { border-bottom: 0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .nowrap { white-space: nowrap; }
  .word { font-size: 17px; letter-spacing: 0.3px; }
  img { height: 44px; max-width: 220px; background: #fff; border: 1px solid var(--line); border-radius: 6px; display: block; }
  .right { color: var(--ok); }
  .wrongword { color: var(--bad); }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
</style>
</head>
<body>
<main>
  <h1>🐝 Spelling Bee dashboard</h1>
  <p class="muted">Updated ${esc(when(d.generated))} (UK time). Data is kept for ${d.retentionDays} days. Devices are random IDs made on each device, with no names; IP addresses are the device's network address at the time.</p>

  <h2>Usage</h2>
  <div class="tiles">
    <div class="tile"><b>${d.devices.d1}</b><span>devices today (24 h)</span></div>
    <div class="tile"><b>${d.devices.d7}</b><span>devices in 7 days</span></div>
    <div class="tile"><b>${d.devices.d30}</b><span>devices in 30 days</span></div>
    <div class="tile"><b>${d.checks.length}</b><span>words checked in 30 days</span></div>
  </div>

  <div class="grid2">
    <div>
      <h2>Last 14 days</h2>
      <table><thead><tr><th>Day</th><th class="num">Devices</th><th class="num">Sessions</th><th class="num">Finished</th><th class="num">Checks</th></tr></thead>
      <tbody>${
        days.length
          ? days.map((day) => {
              const u = usageByDay.get(day);
              return `<tr><td>${esc(day)}</td><td class="num">${u?.devices ?? 0}</td><td class="num">${u?.sessions ?? 0}</td><td class="num">${u?.finished ?? 0}</td><td class="num">${checksByDay.get(day) ?? 0}</td></tr>`;
            }).join("")
          : `<tr><td colspan="5" class="muted">No activity yet.</td></tr>`
      }</tbody></table>
    </div>
    <div>
      <h2>Where (30 days)</h2>
      <table><thead><tr><th>Place</th><th class="num">Devices</th><th class="num">Events</th></tr></thead>
      <tbody>${
        d.places.length
          ? d.places.map((p) => `<tr><td>${flag(p.country)} ${esc(p.country ?? "?")}${p.region ? ` · ${esc(p.region)}` : ""}</td><td class="num">${p.devices}</td><td class="num">${p.events}</td></tr>`).join("")
          : `<tr><td colspan="3" class="muted">No activity yet.</td></tr>`
      }</tbody></table>
    </div>
  </div>

  <h2>Words checked by device and IP address (30 days)</h2>
  <div class="scroll"><table>
    <thead><tr><th>Device</th><th>IP address</th><th>Place</th><th class="num">Words checked</th><th>First</th><th>Last</th></tr></thead>
    <tbody>${
      d.byDevice.length
        ? d.byDevice.map((r) => `<tr><td><code title="${esc(r.device ?? "")}">${r.device ? esc(r.device.slice(0, 8)) : '<span class="muted">unknown</span>'}</code></td><td><code>${r.ip ? esc(r.ip) : '<span class="muted">not recorded</span>'}</code></td><td>${flag(r.country)} ${esc(r.country ?? "")}</td><td class="num">${r.checks}</td><td class="nowrap">${esc(when(r.first))}</td><td class="nowrap">${esc(when(r.last))}</td></tr>`).join("")
        : `<tr><td colspan="6" class="muted">No checks yet.</td></tr>`
    }</tbody>
  </table></div>

  <h2>Reader accuracy, compared with Claude Opus</h2>
  <p class="muted">The child sees ${esc(modelName(d.mainModel))}'s reading. ${Math.round(d.crossCheckRate * 100)}% of checks are also read by ${esc(modelName(d.checkModel))}, and every check by Google's handwriting reader, in the background. Opus is treated as the reference.</p>
  <div class="scroll"><table>
    <thead><tr><th>Reader</th><th class="num">Compared</th><th class="num">Same reading as Opus</th><th class="num">Same right/wrong verdict</th><th class="num">Passed a misspelling Opus spotted</th><th class="num">Failed writing Opus read as correct</th></tr></thead>
    <tbody>${stats.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.compared}</td><td class="num">${pct(r.sameText, r.compared)}</td><td class="num">${pct(r.withTarget - r.falsePass - r.falseFail, r.withTarget)}</td><td class="num">${r.falsePass}</td><td class="num">${r.falseFail}</td></tr>`).join("")}</tbody>
  </table></div>
  <p class="muted">Median Opus time: ${(median / 1000).toFixed(1)} s${errors ? ` · ${errors} background check errors` : ""}. ★ marks the reading the child saw. Green = spelt like the word, red = not.</p>

  <h2>Where the readers disagree</h2>
  ${checkTable(disagreements, "No disagreements yet.")}

  <h2>Trickiest words (30 days)</h2>
  <table><thead><tr><th>Word</th><th class="num">Checks</th><th class="num">Read as correct</th></tr></thead>
  <tbody>${
    hardest.length
      ? hardest.map(([w, s]) => `<tr><td class="word">${esc(w)}</td><td class="num">${s.tries}</td><td class="num">${pct(s.right, s.tries)}</td></tr>`).join("")
      : `<tr><td colspan="3" class="muted">Not enough checks yet.</td></tr>`
  }</tbody></table>

  <h2>Latest checks</h2>
  ${checkTable(d.checks.slice(0, 30), "No checks yet.")}
</main>
</body>
</html>`;
}
