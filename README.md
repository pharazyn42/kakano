# Kakano 🌱

A small, personal Duolingo-style app for learning te reo Māori. *Kakano* means seed.

Built for one learner, so there is no backend, no account and no tracking. Progress lives in your browser.

## What it does

- **A Duolingo-style path**: each unit is split into short lessons laid out on a trail. Lessons unlock one at a time, and every unit ends with a **Unit review** (🏆) that mixes the whole unit and asks you to type answers. There is no daily limit: do as many lessons as you like
- **Stars**: 1 to 3 per lesson depending on how many answers you got right first time. Replay any lesson to improve
- **Inside a lesson**: a card for each new item, then two rounds of questions (recognise, then recall). Missed questions come back once more
- **Streak** that grows a little plant. Finishing a lesson or a review counts for the day
- **Exercises**: multiple choice (both directions), typing, and tap-to-build sentences
- **Spaced repetition**: Leitner boxes with 0, 1, 2, 4, 8 and 16 day gaps, graded on the first time you answer each item. The **Review** button (top of the path) shows how many items are due. Replaying a lesson never changes the schedule
- **Sounds** page, plus links to real audio from Māori educators and institutions
- **Pronunciation audio** from Te Aka on 32 of the 33 words: plays automatically on new-word cards and after you answer, and there is a 🔊 Listen button wherever a word appears (including the word list). Turn auto-play off in **More**
- **Te Aka links** on every word, straight to the exact dictionary entry, so you can check it as you learn
- **Practise** button when nothing is due (free practice, no effect on the schedule)
- **Export / import** progress to move between devices

## Run it

It needs a web server because it loads `content/lessons.json`:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

To host it free on GitHub Pages: repo **Settings → Pages → Deploy from a branch → `main` / root**.

## ⚠️ Accuracy

The starter content was **drafted by an AI and has not been checked by a fluent speaker**. Treat every item as unverified until you have confirmed it in [Te Aka Māori Dictionary](https://maoridictionary.co.nz/) or with a teacher. The app helps:

- Every learn card and the **More → Word list** screen have a checkbox for "I checked this".
- Every word links straight to its Te Aka search.
- Fix mistakes by editing `content/lessons.json`. No code changes needed.

## Audio and licensing

Each word has a `te_aka_id`: the number in its Te Aka page URL (`maoridictionary.co.nz/word/1684` is *ika*). Te Aka's recording for an entry lives at the same number, and the app plays it straight from Te Aka's own public storage (`audio_base` in the content file). **No audio files are copied into this repo.**

- The entries were matched by hand against Te Aka on 2026-10-03, picking the right homonym each time (for example *wai* "who" vs "water", *rā* "sun" vs "to wed"). That check also corrected *ae* to **āe**.
- *ka kite* has no entry of its own in Te Aka (only longer phrases), so it has no audio.
- Sentences have no audio yet.
- Te Aka's site is © John C Moorfield and does not state terms for reusing its audio. This app is for personal study, credits Te Aka in the footer and links to the entry for every word. If you ever share it widely, ask Te Aka / Te Whanake for permission first. If the audio location changes, edit `audio_base`; if a recording stops loading, the app just shows "Couldn't play that audio".
- To use a recording from somewhere else, give the item an `audio` URL; it takes priority over `te_aka_id`.

## Editing content

All content lives in `content/lessons.json`, grouped into units. Items appear in file order, and each unit is automatically split into lessons of about 4 items (plus a unit review), so adding content never means touching code. Put words before the sentences that use them.

To control the split yourself, give a unit a `lessons` list. Every item in the unit must appear in exactly one lesson (`node tools/validate.js` checks this):

```json
"lessons": [
  { "title": "Say hello", "items": ["kia-ora", "tena-koe"] },
  { "title": "Say goodbye", "items": ["haere-ra", "e-noho-ra"] }
]
```

```json
{ "type": "word", "id": "kai", "te_aka_id": 1894, "mi": "kai", "en": "food; to eat",
  "note": "optional hint",
  "audio": "https://…", "audio_link": "https://…", "video_link": "https://…", "dictionary_link": "https://…" }

{ "type": "sentence", "id": "s-kei-te-kai", "mi": "Kei te kai au.", "en": "I am eating.",
  "distractors": ["inu", "koe"] }
```

- `id` must be unique and should never change once you've started learning it (progress is keyed by it).
- `en` should be unique within a type, or multiple choice gets ambiguous.
- Sentences are built from the words in `mi`, plus any `distractors`.
- `te_aka_id` (words only) gives the in-app 🔊 audio and the exact Te Aka link. `audio` overrides the audio URL. `audio_link` / `video_link` appear as "More audio" / "Watch" links to elsewhere, so add recordings and videos as you find good ones. `dictionary_link` overrides the Te Aka link.

Check your edits:

```sh
node tools/validate.js
node test/core.test.js
```

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Page shell and styles (light and dark) |
| `app.js` | Screens and interaction |
| `core.js` | Pure logic: path and unlocking, lesson building, scheduling, grading (unit tested) |
| `content/lessons.json` | The actual language content |
| `tools/validate.js`, `test/core.test.js` | Content checks and tests |

## Ideas for later

- Installable PWA with offline support
- Recorded audio per item, played in-app
- More units: numbers, colours, days, simple pepeha
- A "weak items" review screen
