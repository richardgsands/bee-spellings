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
- Pen strokes are sent to Google's handwriting recognition endpoint (`inputtools.google.com`). It needs an internet connection; only the stroke coordinates are sent.
- Read-aloud uses the browser's built-in speech synthesis, preferring a British English voice.

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
