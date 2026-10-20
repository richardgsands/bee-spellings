# Spelling Bee 🐝

A handwriting spelling practice app for primary school pupils, designed for **Safari on an iPad with an Apple Pencil**.

Bumble the bee reads each word aloud. The child writes the word on the lined pad, and Bumble checks it and gives friendly hints:

- **Hear it**: read the word (and an example sentence) again.
- **Peek**: show the word for 3 seconds (the child earns half a honey jar instead of a whole one).
- **Check**: the handwriting is read and compared with the word.
  1. First mistake: a hint that doesn't give the answer away. Hints know the spelling rules: y → i before -es/-ed/-er/-est, keep the y before -ing, y spelling a short i sound (gym), doubling after a short vowel or a stressed ending (and not doubling otherwise), and dropping or not repeating a final e.
  2. Second mistake: Bumble shows what it read next to the real word with the letters to fix highlighted, and the child copies it.
- **Tricky words**: practise again the words that were missed or peeked at.
- **My words**: on the home screen, choose which week's list to practise.

## Grown-ups

Press and hold **Grown-ups** on the home screen for 1.5 seconds. There you can:
- add, edit or delete word lists
- add example sentences
- choose how many words per go, the voice and the speed
- set palm rejection: once the Pencil is used, finger touches are ignored
- export or import lists as JSON

Everything is stored in the browser on that device (`localStorage`).

**Tip:** in Safari, use *Share → Add to Home Screen* to get a full-screen app.

## How it works

- Plain HTML, CSS and ES modules, with no build step.
- **Handwriting reading:** a picture of just the written word is sent to a small Cloudflare Worker (`worker/`). The Worker asks Claude (Opus 5.5, set by `MODEL` in `worker/src/index.ts`) to copy the letters exactly as written, mistakes included; it isn't told the target word. The app then compares the letters with the word. This works for printed and joined-up writing, and doesn't "auto-correct" misspellings. Each check costs about $0.008 on the Anthropic API.
- If the Worker or Claude can't be reached, Bumble says it's taking a break and the child can press Check again later. (Google's handwriting reader is no longer used by the app: its dictionary turns misspellings into real words.)
- After each check, the bubble shows what Bumble read. If Bumble misreads correct writing, a grown-up can press and hold **"Bumble misread it"** to count it as correct.
- Read-aloud uses the browser's built-in speech synthesis. It picks the most natural British voice on the device (Apple's free Premium or Enhanced voices first, never the novelty ones). Words that voices get wrong on their own are spoken with a sound-alike spelling (e.g. "reading" as "reeding", not the town), and grown-ups can add their own in the word list's **Say it as** box.
- A small service worker (`sw.js`) fetches the latest files on every load when online, so updates appear on the next reload. Saved copies are used when offline.

## Usage and accuracy dashboard

The Worker keeps simple logs in a Cloudflare D1 database (`bee-logs`) and shows them at
**https://bee-reader.bee-reader.workers.dev/admin**. Sign in with any username and the `ADMIN_KEY` password.

- **Usage:** devices per day, week and month, sessions, country/region, and words checked per device and IP address. Each device is a random ID made on the device. The device's IP address is stored with its checks and events; no names are stored.
- **Accuracy:** every check is answered by Claude Opus 5.5. In the background it is also read by Claude Haiku 5.5 (`CROSS_CHECK_RATE` in `worker/wrangler.toml`, 1 = all; about $0.0002 each) and, from the pen strokes, by Google's free handwriting reader. The dashboard compares both with Opus: how often they agree, which misspellings they'd wrongly pass or correct writing they'd fail, and each disagreement with its handwriting.
- **Images** of the written word are saved unless a grown-up turns off *"Help improve Bumble"* under Grown-ups.
- **Retention:** everything older than `RETENTION_DAYS` (90) is deleted nightly.

## Handwriting reader (Cloudflare Worker)

```bash
cd worker && npm install
```

```bash
npx wrangler login
```

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

```bash
npx wrangler secret put APP_CODE
```

```bash
npx wrangler secret put ADMIN_KEY
```

```bash
npx wrangler d1 migrations apply bee-logs --remote
```

```bash
npx wrangler deploy
```

Then set `READER_URL` in `js/recognize.js` to the deployed `…workers.dev/read` address. Set a monthly spend limit on the Anthropic API key's workspace. `APP_CODE` must match `READER_CODE` in `js/recognize.js`. The Worker only accepts requests from the app's own site, at up to 20 per minute per device.

## Development

```bash
python3 -m http.server 8765
```

```bash
npm test
```

Built-in word lists (choose one on the home screen):
- **Y3 Autumn 1, Week 4:** adding -ing, -ed, -er and -est (y → i).
- **Y3 Autumn 1, Week 5:** doubling the last letter only when the end of the word is stressed (forgetting, gardening).
- **Y3 Autumn 1, Week 6:** y making a short i sound (gym, myth, crystal, Egypt).

New built-in lists are added to existing devices automatically, without touching their own lists.
