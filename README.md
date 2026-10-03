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
- **Te Aka links** on every word, so you can check it as you learn
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
{ "type": "word", "id": "kai", "mi": "kai", "en": "food; to eat",
  "note": "optional hint",
  "audio_link": "https://…", "video_link": "https://…", "dictionary_link": "https://…" }

{ "type": "sentence", "id": "s-kei-te-kai", "mi": "Kei te kai au.", "en": "I am eating.",
  "distractors": ["inu", "koe"] }
```

- `id` must be unique and should never change once you've started learning it (progress is keyed by it).
- `en` should be unique within a type, or multiple choice gets ambiguous.
- Sentences are built from the words in `mi`, plus any `distractors`.
- `audio_link` / `video_link` show up as "Listen" / "Watch" buttons. Add links as you find good pronunciation recordings.

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
