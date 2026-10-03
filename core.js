/* Kakano core logic: pure functions, no DOM. Works in the browser (window.KakanoCore) and Node (module.exports). */
(function (root) {
  'use strict';

  var INTERVALS = [0, 1, 2, 4, 8, 16]; // days until next review, by Leitner box
  var MAX_BOX = INTERVALS.length - 1;

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

  function newAllowance(state, today, perDay) {
    var used = state.newToday && state.newToday.date === today ? state.newToday.count : 0;
    return Math.max(0, perDay - used);
  }

  // A session is a list of steps: {kind:'learn'|'quiz', item}. If nothing is due and
  // nothing is new, fall back to free practice over items already seen.
  function buildSession(items, state, today, opts, rng) {
    opts = opts || {};
    var size = opts.size || 10, perDay = opts.newPerDay || 5;
    var due = dueItems(items, state, today).slice(0, size);
    var fresh = items.filter(function (it) { return !state.items[it.id]; })
      .slice(0, newAllowance(state, today, perDay));
    var steps = [];
    due.forEach(function (it) { steps.push({ kind: 'quiz', item: it }); });
    fresh.forEach(function (it) {
      steps.push({ kind: 'learn', item: it });
      steps.push({ kind: 'quiz', item: it });
    });
    if (steps.length) return { mode: 'normal', steps: steps };
    var seen = items.filter(function (it) { return state.items[it.id]; });
    var pick = shuffle(seen, rng).slice(0, size);
    return {
      mode: 'practice',
      steps: pick.map(function (it) { return { kind: 'quiz', item: it }; })
    };
  }

  // Which exercise to use for an item at a given box.
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
    INTERVALS: INTERVALS, MAX_BOX: MAX_BOX,
    todayStr: todayStr, addDays: addDays, normalize: normalize, strict: strict,
    matchTyped: matchTyped, tokensOf: tokensOf, checkBuild: checkBuild,
    flatten: flatten, shuffle: shuffle, grade: grade, streak: streak,
    dueItems: dueItems, newAllowance: newAllowance, buildSession: buildSession,
    pickExercise: pickExercise, distractorsFor: distractorsFor
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KakanoCore = api;
})(typeof window !== 'undefined' ? window : this);
