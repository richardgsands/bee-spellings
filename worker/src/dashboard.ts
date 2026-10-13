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
    has_image: number;
  }[];
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

export function renderDashboard(d: DashboardData): string {
  const main = modelName(d.mainModel);
  const other = modelName(d.checkModel);

  // Accuracy: compare the main reader with the cross-check reader.
  const compared = d.checks.filter((c) => c.check_read !== null);
  const sameText = compared.filter((c) => norm(c.read) === norm(c.check_read));
  const withTarget = compared.filter((c) => c.target);
  const verdict = (read: string | null, target: string | null) => norm(read) === norm(target);
  const falsePass = withTarget.filter((c) => verdict(c.read, c.target) && !verdict(c.check_read, c.target));
  const falseFail = withTarget.filter((c) => !verdict(c.read, c.target) && verdict(c.check_read, c.target));
  const sameVerdict = withTarget.length - falsePass.length - falseFail.length;
  const errors = d.checks.filter((c) => c.check_error).length;
  const times = d.checks.map((c) => c.ms ?? 0).filter(Boolean).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : 0;

  // Words that children find hardest (by the main reader's verdict).
  const byWord = new Map<string, { tries: number; right: number }>();
  for (const c of d.checks) {
    if (!c.target) continue;
    const w = byWord.get(c.target) ?? { tries: 0, right: 0 };
    w.tries++;
    if (verdict(c.read, c.target)) w.right++;
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

  const img = (c: DashboardData["checks"][number]) =>
    c.has_image ? `<img src="/admin/image?id=${c.id}" alt="handwriting" loading="lazy">` : `<span class="muted">not saved</span>`;
  const verdictBadge = (c: DashboardData["checks"][number]) => {
    if (!c.target || c.check_read === null) return "";
    if (falsePass.includes(c)) return `<span class="badge bad">${esc(main)} passed a misspelling</span>`;
    if (falseFail.includes(c)) return `<span class="badge warn">${esc(main)} failed correct writing</span>`;
    return `<span class="badge ok">same verdict</span>`;
  };
  const disagreements = compared.filter((c) => norm(c.read) !== norm(c.check_read)).slice(0, 60);
  const checkRow = (c: DashboardData["checks"][number]) => `
    <tr>
      <td class="nowrap">${esc(when(c.ts))}</td>
      <td class="word">${esc(c.target ?? "")}</td>
      <td>${img(c)}</td>
      <td class="word">${esc(c.read ?? "")}${c.unclear ? ' <span class="muted">(unclear)</span>' : ""}</td>
      <td class="word">${c.check_error ? `<span class="muted">error: ${esc(c.check_error)}</span>` : esc(c.check_read ?? "–")}</td>
      <td>${verdictBadge(c)}</td>
    </tr>`;
  const checkTable = (rows: DashboardData["checks"], empty: string) =>
    rows.length
      ? `<div class="scroll"><table><thead><tr><th>When</th><th>Word</th><th>Writing</th><th>${esc(main)} read</th><th>${esc(other)} read</th><th></th></tr></thead><tbody>${rows.map(checkRow).join("")}</tbody></table></div>`
      : `<p class="muted">${empty}</p>`;

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
  .badge { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
  .ok { color: var(--ok); background: var(--ok-bg); }
  .warn { color: var(--warn); background: var(--warn-bg); }
  .bad { color: var(--bad); background: var(--bad-bg); }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
</style>
</head>
<body>
<main>
  <h1>🐝 Spelling Bee dashboard</h1>
  <p class="muted">Updated ${esc(when(d.generated))} (UK time). Data is kept for ${d.retentionDays} days. Devices are random IDs made on each device, with no names.</p>

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

  <h2>Reader accuracy: ${esc(main)} vs ${esc(other)}</h2>
  <p class="muted">Every check is read by ${esc(main)} (what the child sees). ${Math.round(d.crossCheckRate * 100)}% are also re-read by ${esc(other)} in the background for comparison.</p>
  <div class="tiles">
    <div class="tile"><b>${compared.length}</b><span>checks compared</span></div>
    <div class="tile"><b>${pct(sameText.length, compared.length)}</b><span>read exactly the same</span></div>
    <div class="tile"><b>${pct(sameVerdict, withTarget.length)}</b><span>same right/wrong verdict</span></div>
    <div class="tile"><b>${falsePass.length}</b><span>${esc(main)} passed a misspelling ${esc(other)} spotted</span></div>
    <div class="tile"><b>${falseFail.length}</b><span>${esc(main)} failed writing ${esc(other)} read as correct</span></div>
    <div class="tile"><b>${(median / 1000).toFixed(1)} s</b><span>median ${esc(main)} time${errors ? ` · ${errors} cross-check errors` : ""}</span></div>
  </div>

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
