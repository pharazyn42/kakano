/* Kakano core logic: pure functions, no DOM. Works in the browser (window.KakanoCore) and Node (module.exports). */
(function (root) {
  'use strict';

  var INTERVALS = [0, 1, 2, 4, 8, 16]; // days until next review, by Leitner box
  var MAX_BOX = INTERVALS.length - 1;
  var LESSON_SIZE = 4;                 // target items per lesson

  function pad(n) { return String(n).padStart(2, '0'); }

  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function addDays(dateStr, n) {
    var p = dateStr.split('-').map(Number);
    return todayStr(new Date(p[0], p[1] - 1, p[2] + n));
  }

  // Lowercase, drop macrons/accents and punctuation, collapse spaces.
  function normalize(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[.,!?;:"]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Same, but keeps macrons, so we can tell the learner when only the macrons are wrong.
  function strict(s) {
    return String(s).toLowerCase().normalize('NFC').replace(/[.,!?;:"]/g, '').replace(/\s+/g, ' ').trim();
  }

  function matchTyped(input, answer) {
    var ok = normalize(input) === normalize(answer);
    return { ok: ok, exact: ok && strict(input) === strict(answer) };
  }

  // "Kei te pai au." -> { tokens: ["Kei","te","pai","au"], end: "." }
  function tokensOf(sentence) {
    var m = sentence.match(/[.?!]+$/);
    var end = m ? m[0] : '';
    var body = end ? sentence.slice(0, -end.length) : sentence;
    return { tokens: body.trim().split(/\s+/), end: end };
  }

  function checkBuild(picked, sentence) {
    var want = tokensOf(sentence).tokens;
    if (picked.length !== want.length) return false;
    for (var i = 0; i < want.length; i++) {
      if (strict(picked[i]) !== strict(want[i])) return false;
    }
    return true;
  }

  function flatten(content) {
    var out = [];
    content.units.forEach(function (u, ui) {
      u.items.forEach(function (it) {
        var c = {}; for (var k in it) c[k] = it[k];
        c.unit = u.id; c.unitTitle = u.title; c.unitIndex = ui;
        out.push(c);
      });
    });
    return out;
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- spaced repetition ---------- */

  // Update a progress record after an answer.
  function grade(rec, correct, today) {
    var r = { box: 0, due: today, right: 0, wrong: 0 };
    for (var k in rec) r[k] = rec[k];
    if (correct) {
      r.box = Math.min(MAX_BOX, r.box + 1);
      r.due = addDays(today, INTERVALS[r.box]);
      r.right += 1;
    } else {
      r.box = Math.max(0, r.box - 2);
      r.due = today;
      r.wrong += 1;
    }
    return r;
  }

  // Consecutive days with a finished session, ending today or yesterday.
  function streak(days, today) {
    var set = {};
    (days || []).forEach(function (d) { set[d] = true; });
    var cur = set[today] ? today : addDays(today, -1);
    var n = 0;
    while (set[cur]) { n++; cur = addDays(cur, -1); }
    return n;
  }

  function dueItems(items, state, today) {
    return items.filter(function (it) {
      var r = state.items[it.id];
      return r && r.due <= today;
    }).sort(function (a, b) {
      var ra = state.items[a.id], rb = state.items[b.id];
      return ra.due < rb.due ? -1 : ra.due > rb.due ? 1 : ra.box - rb.box;
    });
  }

  // Review session: items that are due; if none, free practice over what you've seen.
  function buildReview(items, state, today, size, rng) {
    size = size || 10;
    var due = dueItems(items, state, today).slice(0, size);
    if (due.length) {
      return { mode: 'review', steps: due.map(function (it) { return { kind: 'quiz', item: it }; }) };
    }
    var seen = items.filter(function (it) { return state.items[it.id]; });
    return {
      mode: 'practice',
      steps: shuffle(seen, rng).slice(0, size).map(function (it) { return { kind: 'quiz', item: it }; })
    };
  }

  // Which exercise to use for an item at a given box (reviews and practice).
  function pickExercise(item, box, rng) {
    rng = rng || Math.random;
    if (item.type === 'word') {
      var typeable = item.mi.indexOf('/') === -1;
      if (box <= 0) return 'mc_mi_en';
      if (box === 1) return 'mc_en_mi';
      if (box === 2) return typeable && rng() < 0.5 ? 'type' : 'mc_en_mi';
      return typeable ? 'type' : 'mc_en_mi';
    }
    if (box <= 0) return 'mc_sent';
    if (box === 1) return 'build';
    return rng() < 0.7 ? 'build' : 'mc_sent';
  }

  /* ---------- the lesson path ---------- */

  // Split every unit into short lessons (evenly sized, ~LESSON_SIZE items) followed by a
  // unit review. A unit can override the split with "lessons": [{ "title", "items": [ids] }].
  function makeLessons(content, size) {
    size = size || LESSON_SIZE;
    var out = [];
    content.units.forEach(function (u, ui) {
      var parts = [];
      if (u.lessons && u.lessons.length) {
        u.lessons.forEach(function (l, li) {
          parts.push({ title: l.title || ('Lesson ' + (li + 1)), itemIds: l.items.slice() });
        });
      } else {
        var ids = u.items.map(function (i) { return i.id; });
        var n = Math.max(1, Math.ceil(ids.length / size));
        var base = Math.floor(ids.length / n), extra = ids.length % n, pos = 0;
        for (var k = 0; k < n; k++) {
          var cnt = base + (k < extra ? 1 : 0);
          parts.push({ title: 'Lesson ' + (k + 1), itemIds: ids.slice(pos, pos + cnt) });
          pos += cnt;
        }
      }
      parts.forEach(function (p, pi) {
        out.push({
          id: u.id + '-l' + (pi + 1), kind: 'lesson', title: p.title, itemIds: p.itemIds,
          unitId: u.id, unitTitle: u.title, unitIndex: ui
        });
      });
      out.push({
        id: u.id + '-review', kind: 'review', title: 'Unit review',
        itemIds: u.items.map(function (i) { return i.id; }),
        unitId: u.id, unitTitle: u.title, unitIndex: ui
      });
    });
    return out;
  }

  function isDone(state, lesson) {
    return !!(state.lessons && state.lessons[lesson.id] && state.lessons[lesson.id].done);
  }

  // A lesson is open once the one before it is done (the first is always open).
  function isUnlocked(lessons, state, index) {
    return index === 0 || isDone(state, lessons[index - 1]);
  }

  // Index of the first lesson that isn't done yet (the "you are here" node), or -1 if all done.
  function currentIndex(lessons, state) {
    for (var i = 0; i < lessons.length; i++) if (!isDone(state, lessons[i])) return i;
    return -1;
  }

  // Introduce unseen items with a card, then two rounds of questions (easier, then harder).
  // Unit reviews skip the cards and run one mixed round of up to 10 of the harder questions.
  function lessonSteps(lesson, byId, state, rng) {
    var its = lesson.itemIds.map(function (id) { return byId[id]; }).filter(Boolean);
    var steps = [];
    if (lesson.kind === 'review') {
      shuffle(its, rng).slice(0, 10).forEach(function (it) { steps.push({ kind: 'quiz', item: it, round: 3 }); });
      return steps;
    }
    its.filter(function (it) { return !state.items[it.id]; })
      .forEach(function (it) { steps.push({ kind: 'learn', item: it }); });
    [1, 2].forEach(function (round) {
      shuffle(its, rng).forEach(function (it) { steps.push({ kind: 'quiz', item: it, round: round }); });
    });
    return steps;
  }

  // Exercise for a lesson round. Round 1 is recognition, 2 is recall, 3 (unit review) is hardest.
  function exerciseFor(item, round, box) {
    if (item.type === 'word') {
      var typeable = item.mi.indexOf('/') === -1;
      if (round === 1) return box <= 0 ? 'mc_mi_en' : 'mc_en_mi';
      if (round === 2) return box >= 2 && typeable ? 'type' : 'mc_en_mi';
      return typeable ? 'type' : 'mc_en_mi';
    }
    if (round === 1) return box >= 1 ? 'build' : 'mc_sent';
    return 'build';
  }

  function starsFor(right, total) {
    if (!total) return 1;
    var r = right / total;
    return r >= 0.9 ? 3 : r >= 0.7 ? 2 : 1;
  }

  // First-time upgrade for learners who had progress before the path existed: lessons whose
  // items are all learned count as done (in order, so nothing is skipped).
  function migrate(state, lessons) {
    state.lessons = state.lessons || {};
    var prevDone = true;
    lessons.forEach(function (l) {
      var allSeen = l.itemIds.every(function (id) { return state.items[id]; });
      if (prevDone && allSeen && !isDone(state, l)) state.lessons[l.id] = { done: true, stars: 1 };
      prevDone = isDone(state, l);
    });
    return state;
  }

  /* ---------- Te Aka links and audio ---------- */

  // Direct audio URL for an item: an explicit "audio", else Te Aka's recording for its entry id.
  function audioUrl(item, meta) {
    if (item.audio) return item.audio;
    if (item.te_aka_id && meta && meta.audio_base) return meta.audio_base + item.te_aka_id + '.mp3';
    return '';
  }

  // Dictionary page for an item: explicit link, else the exact Te Aka entry, else a search (words only).
  function dictionaryUrl(item, meta) {
    if (item.dictionary_link) return item.dictionary_link;
    if (item.te_aka_id && meta && meta.dictionary_base) return meta.dictionary_base + item.te_aka_id;
    if (item.type === 'word') return 'https://maoridictionary.co.nz/search?keywords=' + encodeURIComponent(item.mi);
    return '';
  }

  // n wrong options for field ('en' or 'mi'), same type, preferring the same unit.
  function distractorsFor(item, pool, field, n, rng) {
    var cand = pool.filter(function (p) {
      return p.id !== item.id && p.type === item.type && p[field] !== item[field];
    });
    var near = shuffle(cand.filter(function (p) { return p.unit === item.unit; }), rng);
    var far = shuffle(cand.filter(function (p) { return p.unit !== item.unit; }), rng);
    var out = [], seen = {};
    seen[item[field]] = true;
    near.concat(far).forEach(function (p) {
      if (out.length < n && !seen[p[field]]) { seen[p[field]] = true; out.push(p[field]); }
    });
    return out;
  }

  var api = {
    INTERVALS: INTERVALS, MAX_BOX: MAX_BOX, LESSON_SIZE: LESSON_SIZE,
    todayStr: todayStr, addDays: addDays, normalize: normalize, strict: strict,
    matchTyped: matchTyped, tokensOf: tokensOf, checkBuild: checkBuild,
    flatten: flatten, shuffle: shuffle, grade: grade, streak: streak,
    dueItems: dueItems, buildReview: buildReview, pickExercise: pickExercise,
    makeLessons: makeLessons, isDone: isDone, isUnlocked: isUnlocked, currentIndex: currentIndex,
    lessonSteps: lessonSteps, exerciseFor: exerciseFor, starsFor: starsFor, migrate: migrate,
    distractorsFor: distractorsFor, audioUrl: audioUrl, dictionaryUrl: dictionaryUrl
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KakanoCore = api;
})(typeof window !== 'undefined' ? window : this);
