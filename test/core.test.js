// Run with: node test/core.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../core.js');

const content = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'lessons.json'), 'utf8'));
const items = C.flatten(content);
const T = '2026-10-03';
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok  ' + name); }
const blank = () => ({ items: {}, days: [], newToday: { date: '', count: 0 }, verified: {} });
const seqRng = () => { let i = 0; return () => ((i++ * 0.37) % 1); };

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

test('first session introduces 5 new items as learn+quiz', () => {
  const s = C.buildSession(items, blank(), T, { size: 10, newPerDay: 5 }, seqRng());
  assert.strictEqual(s.mode, 'normal');
  assert.strictEqual(s.steps.length, 10);
  assert.deepStrictEqual(s.steps.slice(0, 2).map((x) => x.kind), ['learn', 'quiz']);
  assert.strictEqual(s.steps[0].item.id, items[0].id);
});

test('new-item allowance shrinks after learning today', () => {
  const st = blank();
  st.newToday = { date: T, count: 5 };
  assert.strictEqual(C.newAllowance(st, T, 5), 0);
  assert.strictEqual(C.newAllowance(st, '2026-10-04', 5), 5);
});

test('due items come first and only when due', () => {
  const st = blank();
  st.items[items[0].id] = { box: 1, due: '2026-10-02', right: 1, wrong: 0 };
  st.items[items[1].id] = { box: 1, due: '2026-10-09', right: 1, wrong: 0 };
  st.newToday = { date: T, count: 5 };
  const s = C.buildSession(items, st, T, { size: 10, newPerDay: 5 }, seqRng());
  assert.deepStrictEqual(s.steps.map((x) => x.item.id), [items[0].id]);
});

test('falls back to practice mode when nothing due or new', () => {
  const st = blank();
  items.forEach((it) => { st.items[it.id] = { box: 3, due: '2026-12-01', right: 3, wrong: 0 }; });
  const s = C.buildSession(items, st, T, { size: 10, newPerDay: 5 }, seqRng());
  assert.strictEqual(s.mode, 'practice');
  assert.strictEqual(s.steps.length, 10);
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

console.log(`\n${n} tests passed`);
