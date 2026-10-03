// Run with: node test/core.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../core.js');

const content = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'lessons.json'), 'utf8'));
const items = C.flatten(content);
const byId = Object.fromEntries(items.map((i) => [i.id, i]));
const lessons = C.makeLessons(content);
const T = '2026-10-03';
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok  ' + name); }
const blank = () => ({ items: {}, days: [], lessons: {}, verified: {} });
const seqRng = () => { let i = 0; return () => ((i++ * 0.37) % 1); };

/* ---- basics ---- */

test('addDays crosses month and year', () => {
  assert.strictEqual(C.addDays('2026-10-31', 1), '2026-11-01');
  assert.strictEqual(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(C.addDays('2026-03-01', -1), '2026-02-28');
});

test('normalize drops macrons and punctuation', () => {
  assert.strictEqual(C.normalize('Tēnā koe!'), 'tena koe');
  assert.strictEqual(C.normalize('  Kei te  pēhea koe? '), 'kei te pehea koe');
});

test('matchTyped accepts missing macrons but flags them', () => {
  assert.deepStrictEqual(C.matchTyped('tena koe', 'tēnā koe'), { ok: true, exact: false });
  assert.deepStrictEqual(C.matchTyped('tēnā koe', 'tēnā koe'), { ok: true, exact: true });
  assert.strictEqual(C.matchTyped('tena koutou', 'tēnā koe').ok, false);
});

test('tokensOf splits and keeps ending punctuation', () => {
  assert.deepStrictEqual(C.tokensOf('Kei te pai au.'), { tokens: ['Kei', 'te', 'pai', 'au'], end: '.' });
  assert.deepStrictEqual(C.tokensOf('Ko wai tōu ingoa?'), { tokens: ['Ko', 'wai', 'tōu', 'ingoa'], end: '?' });
});

test('checkBuild is macron-sensitive and order-sensitive', () => {
  assert.ok(C.checkBuild(['He', 'tāne', 'ia'], 'He tāne ia.'));
  assert.ok(!C.checkBuild(['He', 'tane', 'ia'], 'He tāne ia.'));
  assert.ok(!C.checkBuild(['ia', 'He', 'tāne'], 'He tāne ia.'));
  assert.ok(!C.checkBuild(['He', 'tāne'], 'He tāne ia.'));
});

/* ---- spaced repetition ---- */

test('grade: right moves up and schedules, wrong drops and is due today', () => {
  let r = C.grade({ box: 0, due: T, right: 0, wrong: 0 }, true, T);
  assert.deepStrictEqual([r.box, r.due, r.right], [1, '2026-10-04', 1]);
  r = C.grade(r, true, '2026-10-04');
  assert.deepStrictEqual([r.box, r.due], [2, '2026-10-06']);
  r = C.grade({ box: 5, due: T, right: 9, wrong: 0 }, true, T);
  assert.deepStrictEqual([r.box, r.due], [5, '2026-10-19']);
  r = C.grade({ box: 4, due: T, right: 3, wrong: 0 }, false, T);
  assert.deepStrictEqual([r.box, r.due, r.wrong], [2, T, 1]);
  r = C.grade({ box: 0, due: T, right: 0, wrong: 0 }, false, T);
  assert.strictEqual(r.box, 0);
});

test('streak counts consecutive days, survives until end of next day', () => {
  assert.strictEqual(C.streak([], T), 0);
  assert.strictEqual(C.streak(['2026-10-03'], T), 1);
  assert.strictEqual(C.streak(['2026-10-01', '2026-10-02', '2026-10-03'], T), 3);
  assert.strictEqual(C.streak(['2026-10-01', '2026-10-02'], T), 2, 'yesterday still counts');
  assert.strictEqual(C.streak(['2026-09-30', '2026-10-01'], T), 0, 'gap breaks it');
});

test('review: due items only, falls back to practice when none are due', () => {
  const st = blank();
  st.items[items[0].id] = { box: 1, due: '2026-10-02', right: 1, wrong: 0 };
  st.items[items[1].id] = { box: 1, due: '2026-10-09', right: 1, wrong: 0 };
  let s = C.buildReview(items, st, T, 10, seqRng());
  assert.strictEqual(s.mode, 'review');
  assert.deepStrictEqual(s.steps.map((x) => x.item.id), [items[0].id]);
  st.items[items[0].id].due = '2026-10-20';
  s = C.buildReview(items, st, T, 10, seqRng());
  assert.strictEqual(s.mode, 'practice');
  assert.strictEqual(s.steps.length, 2);
  assert.strictEqual(C.buildReview(items, blank(), T, 10, seqRng()).steps.length, 0);
});

test('pickExercise ramps difficulty', () => {
  const w = items.find((i) => i.type === 'word');
  const s = items.find((i) => i.type === 'sentence');
  assert.strictEqual(C.pickExercise(w, 0, () => 0), 'mc_mi_en');
  assert.strictEqual(C.pickExercise(w, 1, () => 0), 'mc_en_mi');
  assert.strictEqual(C.pickExercise(w, 4, () => 0), 'type');
  assert.strictEqual(C.pickExercise(s, 0, () => 0), 'mc_sent');
  assert.strictEqual(C.pickExercise(s, 1, () => 0), 'build');
});

test('distractors are distinct, exclude the answer, and match type', () => {
  items.forEach((it) => {
    ['en', 'mi'].forEach((field) => {
      const d = C.distractorsFor(it, items, field, 3, Math.random);
      assert.strictEqual(d.length, 3, `${it.id} ${field} needs 3 distractors`);
      assert.strictEqual(new Set(d.concat(it[field])).size, 4);
    });
  });
});

test('every sentence can be built from its own tokens plus distractors', () => {
  items.filter((i) => i.type === 'sentence').forEach((s) => {
    const toks = C.tokensOf(s.mi).tokens;
    assert.ok(C.checkBuild(toks, s.mi), s.id);
    (s.distractors || []).forEach((d) => assert.ok(!toks.includes(d), `${s.id}: distractor "${d}" is in the answer`));
  });
});

/* ---- the path ---- */

test('makeLessons: every item is in exactly one lesson, each unit ends with a review', () => {
  const seen = {};
  lessons.filter((l) => l.kind === 'lesson').forEach((l) => l.itemIds.forEach((id) => {
    assert.ok(!seen[id], `${id} appears in two lessons`);
    seen[id] = true;
  }));
  assert.strictEqual(Object.keys(seen).length, items.length);
  content.units.forEach((u) => {
    const last = lessons.filter((l) => l.unitId === u.id).pop();
    assert.strictEqual(last.kind, 'review');
    assert.strictEqual(last.itemIds.length, u.items.length);
  });
});

test('makeLessons: sizes are even (2-5 items), never a stray single item', () => {
  lessons.filter((l) => l.kind === 'lesson').forEach((l) => {
    assert.ok(l.itemIds.length >= 2 && l.itemIds.length <= 5, `${l.id} has ${l.itemIds.length}`);
  });
  const ids = lessons.map((l) => l.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'lesson ids unique');
});

test('makeLessons: honours explicit lessons in a unit', () => {
  const c = { units: [{ id: 'x', title: 'X', items: [
    { type: 'word', id: 'a', mi: 'a', en: 'A' }, { type: 'word', id: 'b', mi: 'b', en: 'B' }, { type: 'word', id: 'c', mi: 'c', en: 'C' }
  ], lessons: [{ title: 'Pair', items: ['a', 'b'] }, { items: ['c'] }] }] };
  const l = C.makeLessons(c);
  assert.deepStrictEqual(l.map((x) => [x.id, x.title, x.itemIds.join('')]),
    [['x-l1', 'Pair', 'ab'], ['x-l2', 'Lesson 2', 'c'], ['x-review', 'Unit review', 'abc']]);
});

test('unlocking is strictly sequential', () => {
  const st = blank();
  assert.ok(C.isUnlocked(lessons, st, 0));
  assert.ok(!C.isUnlocked(lessons, st, 1));
  assert.strictEqual(C.currentIndex(lessons, st), 0);
  st.lessons[lessons[0].id] = { done: true, stars: 2 };
  assert.ok(C.isUnlocked(lessons, st, 1));
  assert.ok(!C.isUnlocked(lessons, st, 2));
  assert.strictEqual(C.currentIndex(lessons, st), 1);
  lessons.forEach((l) => { st.lessons[l.id] = { done: true, stars: 3 }; });
  assert.strictEqual(C.currentIndex(lessons, st), -1);
});

test('lessonSteps: cards for unseen items, then an easy and a hard round of every item', () => {
  const l = lessons[0];
  const steps = C.lessonSteps(l, byId, blank(), seqRng());
  const k = l.itemIds.length;
  assert.strictEqual(steps.length, k * 3);
  assert.ok(steps.slice(0, k).every((s) => s.kind === 'learn'));
  assert.deepStrictEqual(steps.slice(k, 2 * k).map((s) => s.round), Array(k).fill(1));
  assert.deepStrictEqual(steps.slice(2 * k).map((s) => s.round), Array(k).fill(2));
  [steps.slice(k, 2 * k), steps.slice(2 * k)].forEach((round) => {
    assert.deepStrictEqual(round.map((s) => s.item.id).sort(), l.itemIds.slice().sort());
  });
});

test('lessonSteps: no card for items already learned; reviews have none and cap at 10', () => {
  const st = blank();
  lessons[0].itemIds.forEach((id) => { st.items[id] = { box: 1, due: T, right: 1, wrong: 0 }; });
  const steps = C.lessonSteps(lessons[0], byId, st, seqRng());
  assert.ok(steps.every((s) => s.kind === 'quiz'));
  const review = lessons.find((l) => l.kind === 'review' && l.itemIds.length > 10) || lessons.find((l) => l.kind === 'review');
  const rs = C.lessonSteps(review, byId, st, seqRng());
  assert.strictEqual(rs.length, Math.min(10, review.itemIds.length));
  assert.ok(rs.every((s) => s.kind === 'quiz' && s.round === 3));
});

test('exerciseFor: recognition, then recall, then hardest', () => {
  const w = items.find((i) => i.type === 'word' && i.mi.indexOf('/') === -1);
  const s = items.find((i) => i.type === 'sentence');
  assert.strictEqual(C.exerciseFor(w, 1, 0), 'mc_mi_en');
  assert.strictEqual(C.exerciseFor(w, 1, 1), 'mc_en_mi');
  assert.strictEqual(C.exerciseFor(w, 2, 1), 'mc_en_mi');
  assert.strictEqual(C.exerciseFor(w, 2, 3), 'type');
  assert.strictEqual(C.exerciseFor(w, 3, 0), 'type');
  assert.strictEqual(C.exerciseFor(s, 1, 0), 'mc_sent');
  assert.strictEqual(C.exerciseFor(s, 1, 1), 'build');
  assert.strictEqual(C.exerciseFor(s, 2, 0), 'build');
});

test('starsFor thresholds', () => {
  assert.strictEqual(C.starsFor(8, 8), 3);
  assert.strictEqual(C.starsFor(9, 10), 3);
  assert.strictEqual(C.starsFor(7, 10), 2);
  assert.strictEqual(C.starsFor(6, 10), 1);
  assert.strictEqual(C.starsFor(0, 0), 1);
});

test('migrate marks fully-learned lessons done, in order, and nothing after a gap', () => {
  const st = blank();
  lessons[0].itemIds.concat(lessons[2].itemIds).forEach((id) => { st.items[id] = { box: 1, due: T, right: 1, wrong: 0 }; });
  C.migrate(st, lessons);
  assert.ok(C.isDone(st, lessons[0]));
  assert.ok(!C.isDone(st, lessons[1]), 'lesson 2 was never learned');
  assert.ok(!C.isDone(st, lessons[2]), 'cannot skip past an unfinished lesson');
  const fresh = C.migrate(blank(), lessons);
  assert.strictEqual(Object.keys(fresh.lessons).length, 0);
});

/* ---- Te Aka audio and links ---- */

test('audioUrl: Te Aka entry id, explicit override, or nothing', () => {
  const meta = content.meta;
  assert.strictEqual(C.audioUrl({ te_aka_id: 1684 }, meta),
    'https://storage.googleapis.com/maori-dictionary-prod2-web-assets/public/1684.mp3');
  assert.strictEqual(C.audioUrl({ te_aka_id: 1684, audio: 'https://example.org/a.mp3' }, meta), 'https://example.org/a.mp3');
  assert.strictEqual(C.audioUrl({ mi: 'ka kite' }, meta), '');
  assert.strictEqual(C.audioUrl({ te_aka_id: 5 }, {}), '', 'no base configured means no audio');
});

test('dictionaryUrl: exact entry, override, search fallback for words only', () => {
  const meta = content.meta;
  assert.strictEqual(C.dictionaryUrl({ type: 'word', te_aka_id: 1684, mi: 'ika' }, meta), 'https://maoridictionary.co.nz/word/1684');
  assert.strictEqual(C.dictionaryUrl({ type: 'word', mi: 'ka kite' }, meta), 'https://maoridictionary.co.nz/search?keywords=ka%20kite');
  assert.strictEqual(C.dictionaryUrl({ type: 'word', mi: 'x', dictionary_link: 'https://e.org/x' }, meta), 'https://e.org/x');
  assert.strictEqual(C.dictionaryUrl({ type: 'sentence', mi: 'He ika.' }, meta), '');
});

test('content: every word except "ka kite" has a Te Aka id; ids are unique; spellings match Te Aka', () => {
  const words = items.filter((i) => i.type === 'word');
  const missing = words.filter((w) => !w.te_aka_id).map((w) => w.mi);
  assert.deepStrictEqual(missing, ['ka kite']);
  const ids = words.filter((w) => w.te_aka_id).map((w) => w.te_aka_id);
  assert.strictEqual(new Set(ids).size, ids.length, 'two words share a Te Aka id');
  assert.strictEqual(byId['ae'].mi, 'āe', 'Te Aka spells yes with a macron');
  assert.ok(content.meta.audio_base.startsWith('https://') && content.meta.audio_base.endsWith('/'));
  assert.ok(content.meta.audio_credit.includes('Te Aka'));
});

console.log(`\n${n} tests passed`);
