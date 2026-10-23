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

Built-in word lists (choose one on the home screen, newest first):
- **Y3 Autumn 1, Week 4:** adding -ing, -ed, -er and -est (y → i).
- **Y3 Autumn 1, Week 5:** doubling the last letter only when the end of the word is stressed (forgetting, gardening).
- **Y3 Autumn 1, Week 6:** y making a short i sound (gym, myth, crystal, Egypt).
- **Y3 Autumn 1, Week 7:** revision of earlier weeks plus tricky words (answer, believe, business, February).

New built-in lists are added to existing devices automatically, without touching their own lists.

## How this was built with Claude

The app was built in October 2026 by talking to Claude Code (Claude Opus 5.5 - Medium effort) in plain English. It started with this prompt:

> Create an app that a primary school pupil could use to learn spellings. Use the words in the example worksheet as a start - and make this configurable in terms of what words are in scope. The focus should be on handwriting the words, as opposed to typing - and target device is the web browser of an iPad with Apple Pencil. The app should have a friendly bee theme.
>
> Perhaps read out the word, with a hint option to show the word in a popup, before the user writes the word. And the app should check if the handwritten word is correct - and provide friendly feedback (perhaps using the bee character) on any mistakes.
>
> Ideally deploy the app somewhere that offers free hosting. Public site is fine.

From there we went on to:

- **Build and publish the first version** from a photo of the Week 4 worksheet, hosted free on GitHub Pages.
- **Replace the handwriting reader** with Claude vision behind a Cloudflare Worker, after tests on the iPad showed Google's reader passing misspellings and rejecting correct words.
- **Add Weeks 5 and 6** from worksheet photos, each with hints for that week's spelling rule, and a home-screen picker for which week to practise.
- **Make read-aloud natural and correct, for free**, using Apple's Premium voices and "say it as" pronunciations, and fix Safari caching and cut-off speech.
- **Add a usage and accuracy dashboard** that compares Claude Opus with Claude Haiku and Google on real children's writing.

### How the handwriting check evolved

Reading a child's spelling turned out to be the hard part: a reader must copy mistakes, not fix them. It took five versions, each prompted by a real result on the iPad.

1. **Google's handwriting reader (4 Oct).** Free and good with messy writing, but its dictionary turned "walc" into "walk", so misspellings passed.
2. **Google plus a letter-by-letter check (9 Oct).** Caught "walc", but rejected a correct "beginning": single letters were misread and the tails of g's merged letters together. It could never work for joined-up writing.
3. **Claude Opus vision (13 Oct).** A picture of the word goes to Claude through a small Cloudflare Worker that keeps the API key secret. Claude is told to copy the letters exactly, and is never told the target word. Printed and joined-up writing both worked well.
4. **Cheaper models (13 Oct).** Haiku cost about 40 times less per check and was kept. Sonnet failed intermittently on this account and was dropped.
5. **Opus, with Haiku and Google compared in the background (19 Oct).** Opus answers the child. Haiku and Google read the same writing so the dashboard shows how they would have scored. The Google fallback was removed, and an "unclear" reading now gets one retry rather than a free pass.

### What we learned

The biggest improvements came from trying the app on the real iPad and reporting back what went wrong.

- **Test on the real device.** The "walc" false pass, the rejected "beginning", Safari hiding the Enhanced voice, cached files and cut-off speech all showed up only on the iPad.
- **Photos and screenshots make the best prompts.** Each worksheet photo became a word list, with example sentences and a hint for that week's rule, in one step. A screenshot pinpointed each bug.
- **Plan the big changes first.** Before switching to Claude and before building the dashboard, Claude proposed a plan and asked a few short questions (which reader to use, how much to cross-check, consent for saving images, how long to keep data) before writing code.
- **Keep control of secrets and releases.** The parent signed in and typed the API key and passwords; Claude never saw them. Prompts such as "separate commits" and "don't deploy yet" set the pace.
- **Measure instead of guessing.** The dashboard compares readers on real children's writing, so the choice of model rests on evidence rather than impressions.
