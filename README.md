# Spelling Bee 🐝

A handwriting spelling practice app for primary school pupils, designed for **Safari on an iPad with an Apple Pencil**.

Bumble the bee reads each word aloud. The child writes the word on the lined pad, and Bumble checks it and gives friendly hints:

- **Hear it**: read the word (and an example sentence) again.
- **Peek**: show the word for 3 seconds (the child earns half a honey jar instead of a whole one).
- **Check**: the handwriting is read and compared with the word.
  1. First mistake: a hint that doesn't give the answer away. Hints know the spelling rules: y → i before -es/-ed/-er/-est, keep the y before -ing, doubling after a short vowel or a stressed ending (and not doubling otherwise), and dropping or not repeating a final e.
  2. Second mistake: Bumble shows what it read next to the real word with the letters to fix highlighted, and the child copies it.
- **Tricky words**: practise again the words that were missed or peeked at.
- **Which words?**: on the home screen, tap a week to switch it on or off. Several weeks can be on at once for revision.

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
- **Handwriting reading:** with the family access code (entered under Grown-ups), a picture of just the written word is sent to a small Cloudflare Worker (`worker/`). The Worker asks Claude to copy the letters exactly as written, mistakes included; it isn't told the target word. The app then compares the letters with the word. This works for printed and joined-up writing, and doesn't "auto-correct" misspellings. Each check costs well under a penny on the Anthropic API.
- Without the code, or if the Worker can't be reached, the pen strokes go to Google's free handwriting endpoint instead. Its dictionary can turn a misspelling into the real word, so it's only a fallback.
- After each check, the bubble shows what Bumble read. If Bumble misreads correct writing, a grown-up can press and hold **"Bumble misread it"** to count it as correct.
- Read-aloud uses the browser's built-in speech synthesis, preferring a British English voice.
- A small service worker (`sw.js`) fetches the latest files on every load when online, so updates appear on the next reload. Saved copies are used when offline.

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
npx wrangler deploy
```

Then set `READER_URL` in `js/recognize.js` to the deployed `…workers.dev/read` address. Set a monthly spend limit on the Anthropic API key's workspace. The Worker only accepts requests from the app's own site, with the right access code, at up to 20 per minute per device.

## Development

```bash
python3 -m http.server 8765
```

```bash
npm test
```

Built-in word lists. Choose one or more on the home screen; words from every chosen list are mixed together:
- **Y3 Autumn 1, Week 4:** adding -ing, -ed, -er and -est (y → i).
- **Y3 Autumn 1, Week 5:** doubling the last letter only when the end of the word is stressed (forgetting, gardening).

New built-in lists are added to existing devices automatically, without touching their own lists.
