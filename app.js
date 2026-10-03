(function () {
  'use strict';
  var C = window.KakanoCore;
  var LS_KEY = 'kakano.v1';
  var STATE_VERSION = 2;
  var REVIEW_SIZE = 10;
  var app = document.getElementById('app');
  var content, items, byId, lessons, state, session = null;

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function blank() { return { v: STATE_VERSION, items: {}, days: [], lessons: {}, verified: {}, settings: { autoplay: true } }; }
  function normalizeState(s) {
    s.lessons = s.lessons || {};
    s.verified = s.verified || {};
    s.settings = Object.assign({ autoplay: true }, s.settings);
    return s;
  }
  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && s.items) return normalizeState(Object.assign(blank(), s, { v: s.v }));
    } catch (e) { /* fall through */ }
    return blank();
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function today() { return C.todayStr(); }
  function $(sel) { return app.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(app.querySelectorAll(sel)); }
  function starsHtml(n) { return '<span class="stars" aria-label="' + n + ' of 3 stars">' + '★'.repeat(n) + '☆'.repeat(3 - n) + '</span>'; }
  function seenCount() { return items.filter(function (i) { return state.items[i.id]; }).length; }

  // Sets the screen. During a lesson, wires up the quit button.
  function setView(html) {
    app.innerHTML = html;
    var q = $('#quit');
    if (q) q.onclick = function () {
      if (session && session.mode === 'lesson' && !confirm('Quit this lesson? You will lose your progress in it.')) return;
      renderHome();
    };
  }

  /* ---------- audio ---------- */
  var player = typeof Audio !== 'undefined' ? new Audio() : null;
  var toastTimer = null;

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3000);
  }

  function hasAudio(item) { return !!C.audioUrl(item, content.meta); }

  // quiet = automatic playback: stay silent if the browser blocks it or the file won't load.
  function playItem(item, quiet) {
    var url = item && C.audioUrl(item, content.meta);
    if (!url || !player) return;
    try {
      player.pause();
      player.src = url;
      var p = player.play();
      if (p && p.catch) p.catch(function () { if (!quiet) toast("Couldn't play that audio. Check your connection."); });
    } catch (e) { if (!quiet) toast("Couldn't play that audio."); }
  }

  function autoplay(item) { if (state.settings.autoplay) playItem(item, true); }

  function playBtn(item) {
    return hasAudio(item)
      ? '<button class="play" data-play="' + esc(item.id) + '" aria-label="Play pronunciation of ' + esc(item.mi) + '">🔊 Listen</button>'
      : '';
  }

  function linksFor(item) {
    var out = [];
    if (hasAudio(item)) out.push(playBtn(item));
    var dict = C.dictionaryUrl(item, content.meta);
    if (dict) out.push('<a href="' + esc(dict) + '" target="_blank" rel="noopener">Te Aka</a>');
    if (item.audio_link) out.push('<a href="' + esc(item.audio_link) + '" target="_blank" rel="noopener">More audio</a>');
    if (item.video_link) out.push('<a href="' + esc(item.video_link) + '" target="_blank" rel="noopener">Watch</a>');
    return out.length ? '<div class="links">' + out.join('') + '</div>' : '';
  }

  app.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-play]');
    if (b && byId) playItem(byId[b.getAttribute('data-play')], false);
  });

  function plantFor(n) {
    if (n >= 14) return '🌸';
    if (n >= 7) return '🪴';
    if (n >= 3) return '🌿';
    if (n >= 1) return '🌱';
    return '🌰';
  }

  /* ---------- home: the lesson path ---------- */
  function renderHome() {
    session = null;
    var t = today();
    var streak = C.streak(state.days, t);
    var due = C.dueItems(items, state, t).length;
    var learned = seenCount();
    var cur = C.currentIndex(lessons, state);

    var html = '<div class="card topcard"><div class="plant sm">' + plantFor(streak) + '</div>' +
      '<div class="grow"><b>' + (streak ? streak + '-day streak' : 'Plant your first seed') + '</b>' +
      '<div class="muted small">' + learned + ' learned' + (due ? ' · ' + due + ' due for review' : '') + '</div></div>' +
      (learned ? '<button class="pill" id="review">' + (due ? 'Review ' + due : 'Practise') + '</button>' : '') + '</div>';

    html += '<p id="hint" class="center muted small" aria-live="polite"></p><div class="path">';
    var lastUnit = -1, k = 0;
    lessons.forEach(function (l, i) {
      if (l.unitIndex !== lastUnit) {
        lastUnit = l.unitIndex;
        html += '<div class="unit-banner"><span class="kicker">Unit ' + (l.unitIndex + 1) + '</span><b>' + esc(l.unitTitle) + '</b></div>';
      }
      var rec = state.lessons[l.id];
      var done = C.isDone(state, l), open = C.isUnlocked(lessons, state, i);
      var cls = 'node' + (done ? ' done' : '') + (i === cur ? ' current' : '') + (!open ? ' locked' : '') + (l.kind === 'review' ? ' review' : '');
      var icon = !open ? '🔒' : l.kind === 'review' ? '🏆' : done ? '★' : '▶';
      var off = Math.round(Math.sin(k * 0.9) * 46); k++;
      html += '<div class="node-wrap" style="transform:translateX(' + off + 'px)">' +
        '<button class="' + cls + '" data-i="' + i + '" aria-label="' + esc(l.unitTitle + ', ' + l.title) + (open ? '' : ' (locked)') + '"><span>' + icon + '</span></button>' +
        '<div class="node-label">' + esc(l.title) + (done && rec ? '<br>' + starsHtml(rec.stars || 1) : '') + '</div></div>';
    });
    html += '</div>';
    html += cur === -1
      ? '<div class="card center"><h3>Path complete 🎉</h3><p class="muted small">Add more units in <code>content/lessons.json</code> and they will appear here.</p></div>'
      : '';
    html += '<div class="card small muted"><b>Accuracy check:</b> ' +
      items.filter(function (i) { return state.verified[i.id]; }).length + ' of ' + items.length +
      ' items marked as checked by you. This content was AI-drafted, so verify each item in Te Aka before trusting it.</div>';
    setView(html);

    if ($('#review')) $('#review').onclick = startReview;
    $all('.node').forEach(function (b) {
      b.onclick = function () {
        var i = Number(b.dataset.i);
        if (!C.isUnlocked(lessons, state, i)) {
          $('#hint').textContent = 'Finish the previous lesson to unlock this one.';
          return;
        }
        renderLessonIntro(i);
      };
    });
    var here = $('.node.current');
    if (here && here.scrollIntoView) here.scrollIntoView({ block: 'center' });
  }

  function renderLessonIntro(i) {
    var l = lessons[i];
    var rec = state.lessons[l.id];
    var list = l.itemIds.map(function (id) { return byId[id]; }).filter(Boolean).map(function (it) {
      return '<li class="row"><span><b>' + esc(it.mi) + '</b> <span class="muted">' + esc(it.en) + '</span></span>' + playBtn(it) + '</li>';
    }).join('');
    var anyAudio = l.itemIds.some(function (id) { return byId[id] && hasAudio(byId[id]); });
    setView('<div class="card"><div class="kicker">Unit ' + (l.unitIndex + 1) + ' · ' + esc(l.unitTitle) + '</div>' +
      '<h2>' + esc(l.title) + '</h2>' +
      '<p class="muted">' + (l.kind === 'review'
        ? 'Mixed questions from the whole unit. Type your answers where you can.'
        : 'Meet these, then practise them twice.') + '</p>' +
      (anyAudio ? '<p class="small muted">Tap 🔊 to hear a word.</p>' : '') +
      '<ul class="plain">' + list + '</ul>' +
      (rec ? '<p class="small muted" style="margin-top:10px">Best result: ' + starsHtml(rec.stars || 1) + '</p>' : '') +
      '<button class="btn" id="start">' + (rec ? 'Practise again' : 'Start') + '</button>' +
      '<button class="btn ghost" id="back">Back</button></div>');
    $('#start').onclick = function () { startLesson(i); };
    $('#back').onclick = renderHome;
  }

  /* ---------- sessions ---------- */
  function newSession(mode, steps, extra) {
    session = Object.assign({
      mode: mode, steps: steps, i: 0,
      seenIds: {}, requeued: {}, firstTotal: 0, firstRight: 0, q: null, answered: false
    }, extra || {});
  }

  function startLesson(i) {
    var l = lessons[i];
    newSession('lesson', C.lessonSteps(l, byId, state), { lesson: l });
    renderStep();
  }

  function startReview() {
    var built = C.buildReview(items, state, today(), REVIEW_SIZE);
    if (!built.steps.length) { renderEmpty(); return; }
    newSession(built.mode, built.steps);
    renderStep();
  }

  function renderEmpty() {
    setView('<div class="card"><h2>Nothing to practise yet</h2><p class="muted">Finish a lesson first and come back.</p>' +
      '<button class="btn" id="back">Back</button></div>');
    $('#back').onclick = renderHome;
  }

  function progressBar() {
    var pct = Math.round((session.i / session.steps.length) * 100);
    return '<div class="topbar"><button class="x" id="quit" aria-label="Quit">✕</button>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div></div>';
  }

  function renderStep() {
    var step = session.steps[session.i];
    if (!step) { renderDone(); return; }
    if (step.kind === 'learn') renderLearn(step.item); else renderQuiz(step);
  }

  function next() { session.i += 1; renderStep(); }

  /* ---------- learn card ---------- */
  function introduce(item) {
    if (!state.items[item.id]) {
      state.items[item.id] = { box: 0, due: today(), right: 0, wrong: 0 };
      save();
    }
  }

  function renderLearn(item) {
    introduce(item);
    setView(progressBar() +
      '<div class="card"><div class="kicker">New ' + (item.type === 'word' ? 'word' : 'sentence') + '</div>' +
      '<div class="prompt">' + esc(item.mi) + '</div>' +
      '<p>' + esc(item.en) + '</p>' +
      (item.note ? '<p class="muted small">' + esc(item.note) + '</p>' : '') +
      linksFor(item) +
      '<label class="check"><input type="checkbox" id="ver"' + (state.verified[item.id] ? ' checked' : '') + '> I checked this against a trusted source</label>' +
      '<button class="btn" id="cont">Continue</button></div>');
    $('#ver').onchange = function (e) {
      if (e.target.checked) state.verified[item.id] = true; else delete state.verified[item.id];
      save();
    };
    $('#cont').onclick = next;
    autoplay(item);
  }

  /* ---------- quiz ---------- */
  function makeQuestion(step) {
    var item = step.item;
    var rec = state.items[item.id] || { box: 0 };
    var kind = step.round ? C.exerciseFor(item, step.round, rec.box) : C.pickExercise(item, rec.box);
    var q = { kind: kind, item: item };
    function opts(field, correct) {
      return C.shuffle([correct].concat(C.distractorsFor(item, items, field, 3)));
    }
    if (kind === 'mc_mi_en' || kind === 'mc_sent') {
      q.label = item.type === 'word' ? 'What does this mean?' : 'What does this sentence mean?';
      q.prompt = item.mi; q.options = opts('en', item.en); q.correct = item.en;
    } else if (kind === 'mc_en_mi') {
      q.label = 'How do you say this in te reo Māori?';
      q.prompt = item.en; q.options = opts('mi', item.mi); q.correct = item.mi;
    } else if (kind === 'type') {
      q.label = 'Type it in te reo Māori (macrons optional, but worth practising)';
      q.prompt = item.en; q.correct = item.mi;
    } else {
      q.label = 'Build the sentence';
      q.prompt = item.en; q.correct = item.mi;
      var toks = C.tokensOf(item.mi).tokens.concat(item.distractors || []);
      q.bank = C.shuffle(toks.map(function (text, idx) { return { id: idx, text: text }; }));
      q.picked = [];
    }
    return q;
  }

  function renderQuiz(step) {
    var q = makeQuestion(step);
    session.q = q; session.answered = false;
    var body = '';
    if (q.options) {
      body = '<div class="opts">' + q.options.map(function (o, i) {
        return '<button class="opt" data-i="' + i + '">' + esc(o) + '</button>';
      }).join('') + '</div>';
    } else if (q.kind === 'type') {
      body = '<input type="text" id="typed" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your answer">' +
        '<button class="btn" id="check">Check</button>';
    } else {
      body = '<div class="slot" id="slot"></div><div class="bank" id="bank"></div>' +
        '<button class="btn" id="check" disabled>Check</button>';
    }
    setView(progressBar() +
      '<div class="card"><div class="kicker">' + esc(q.label) + '</div>' +
      '<div class="prompt">' + esc(q.prompt) + '</div>' +
      (q.kind === 'mc_mi_en' && hasAudio(q.item) ? '<div class="links">' + playBtn(q.item) + '</div>' : '') +
      body + '<div id="fb"></div></div>');

    if (q.options) {
      $all('.opt').forEach(function (b) {
        b.onclick = function () {
          if (session.answered) return;
          var chosen = q.options[Number(b.dataset.i)];
          var ok = chosen === q.correct;
          b.classList.add(ok ? 'right' : 'wrong');
          if (!ok) {
            $all('.opt').forEach(function (o) { if (q.options[Number(o.dataset.i)] === q.correct) o.classList.add('right'); });
          }
          finishAnswer(step, ok, ok ? null : q.correct);
        };
      });
    } else if (q.kind === 'type') {
      var input = $('#typed');
      input.focus();
      var go = function () {
        if (session.answered || !input.value.trim()) return;
        var m = C.matchTyped(input.value, q.correct);
        input.disabled = true;
        $('#check').style.display = 'none';
        finishAnswer(step, m.ok, m.ok ? null : q.correct, m.ok && !m.exact ? q.correct : null);
      };
      $('#check').onclick = go;
      input.onkeydown = function (e) { if (e.key === 'Enter') go(); };
    } else {
      drawBuild(q);
      $('#check').onclick = function () {
        if (session.answered || !q.picked.length) return;
        var words = q.picked.map(function (id) { return q.bank[idxOf(q, id)].text; });
        var ok = C.checkBuild(words, q.correct);
        $('#check').style.display = 'none';
        $all('.chip').forEach(function (c) { c.disabled = true; });
        finishAnswer(step, ok, ok ? null : q.correct);
      };
    }
  }

  function idxOf(q, id) {
    for (var i = 0; i < q.bank.length; i++) if (q.bank[i].id === id) return i;
    return -1;
  }

  function drawBuild(q) {
    $('#slot').innerHTML = q.picked.map(function (id) {
      return '<button class="chip" data-pick="' + id + '">' + esc(q.bank[idxOf(q, id)].text) + '</button>';
    }).join('');
    $('#bank').innerHTML = q.bank.map(function (c) {
      var used = q.picked.indexOf(c.id) !== -1;
      return '<button class="chip' + (used ? ' used' : '') + '" data-bank="' + c.id + '"' + (used ? ' tabindex="-1"' : '') + '>' + esc(c.text) + '</button>';
    }).join('');
    var check = $('#check');
    if (check) check.disabled = !q.picked.length;
    $all('[data-bank]').forEach(function (b) {
      b.onclick = function () {
        if (session.answered) return;
        var id = Number(b.dataset.bank);
        if (q.picked.indexOf(id) === -1) { q.picked.push(id); drawBuild(q); }
      };
    });
    $all('[data-pick]').forEach(function (b) {
      b.onclick = function () {
        if (session.answered) return;
        var id = Number(b.dataset.pick);
        q.picked.splice(q.picked.indexOf(id), 1);
        drawBuild(q);
      };
    });
  }

  function finishAnswer(step, correct, shownAnswer, macronHint) {
    var q = session.q, item = q.item;
    session.answered = true;
    var first = !session.seenIds[item.id];
    session.seenIds[item.id] = true;
    if (first) {
      session.firstTotal += 1;
      if (correct) session.firstRight += 1;
      // Reviews always update the schedule. Lessons only do for an item's very first attempts,
      // so replaying a lesson for stars doesn't distort the review schedule.
      var rec = state.items[item.id];
      var gradeable = session.mode === 'review' ||
        (session.mode === 'lesson' && (!rec || rec.right + rec.wrong === 0));
      if (gradeable) {
        state.items[item.id] = C.grade(rec || { box: 0, due: today(), right: 0, wrong: 0 }, correct, today());
        save();
      }
    }
    if (!correct && !session.requeued[item.id]) {
      session.requeued[item.id] = true;
      session.steps.push(step);
    }
    var cls = correct ? (macronHint ? 'warn' : 'good') : 'bad';
    var head = correct ? (macronHint ? 'Correct, mind the macrons' : 'Correct') : 'Not quite';
    var detail = '';
    if (macronHint) detail = '<div class="ans">' + esc(macronHint) + '</div>';
    else if (!correct) detail = '<div class="ans">' + esc(shownAnswer) + '</div>';
    var meaning = item.type === 'sentence'
      ? '<div class="small muted">' + esc(item.mi) + ' = ' + esc(item.en) + '</div>' : '';
    $('#fb').innerHTML = '<div class="feedback ' + cls + '"><b>' + head + '</b>' + detail + meaning + '</div>' +
      linksFor(item) + '<button class="btn" id="cont">Continue</button>';
    $('#cont').focus();
    $('#cont').onclick = next;
    if (item.type === 'word') autoplay(item);
  }

  /* ---------- finish ---------- */
  function renderDone() {
    var s = session, t = today();
    if (s.mode !== 'practice' && state.days.indexOf(t) === -1) state.days.push(t);

    if (s.mode === 'lesson') {
      var stars = C.starsFor(s.firstRight, s.firstTotal);
      var prev = state.lessons[s.lesson.id];
      state.lessons[s.lesson.id] = { done: true, stars: Math.max(stars, prev && prev.stars || 0) };
      save();
      var streak = C.streak(state.days, t);
      var isReview = s.lesson.kind === 'review';
      var cur = C.currentIndex(lessons, state);
      var nextUp = cur === -1 ? '' : (isReview ? 'Next unit unlocked.' : 'Next lesson unlocked.');
      setView('<div class="card hero"><div class="plant">' + (isReview ? '🏆' : plantFor(streak)) + '</div>' +
        '<h2>' + (isReview ? esc(s.lesson.unitTitle) + ' complete!' : 'Lesson complete!') + '</h2>' +
        '<p class="bigstars">' + starsHtml(stars) + '</p>' +
        '<p>' + s.firstRight + ' of ' + s.firstTotal + ' right first time.</p>' +
        '<p class="muted">' + (streak ? streak + '-day streak. ' : '') + nextUp + '</p>' +
        '<button class="btn" id="home">Continue</button></div>');
      $('#home').onclick = renderHome;
      return;
    }

    save();
    var st = C.streak(state.days, t);
    setView('<div class="card hero"><div class="plant">' + plantFor(st) + '</div>' +
      '<h2>' + (s.mode === 'practice' ? 'Practice complete' : 'Review complete') + '</h2>' +
      '<p>' + s.firstRight + ' of ' + s.firstTotal + ' right first time.</p>' +
      (s.mode === 'review' ? '<p class="muted">Words you missed come back sooner.</p>' : '<p class="muted">Free practice does not change your review schedule.</p>') +
      '<button class="btn" id="more">Practise more</button>' +
      '<button class="btn ghost" id="home">Done</button></div>');
    $('#more').onclick = startReview;
    $('#home').onclick = renderHome;
  }

  /* ---------- sounds ---------- */
  function renderSounds() {
    session = null;
    setView(
      '<div class="card"><h2>Sounds</h2>' +
      '<p>Five vowels, each short or long. A macron (ā ē ī ō ū) marks a long vowel and can change meaning, so always write it.</p>' +
      '<table><tr><th>Vowel</th><th>Short, like</th><th>Long, like</th></tr>' +
      '<tr><td>a</td><td>aloud</td><td>car</td></tr>' +
      '<tr><td>e</td><td>entry</td><td>led</td></tr>' +
      '<tr><td>i</td><td>eat</td><td>peep</td></tr>' +
      '<tr><td>o</td><td>ordinary</td><td>pork</td></tr>' +
      '<tr><td>u</td><td>to</td><td>loot</td></tr></table>' +
      '<p class="small muted" style="margin-top:10px">English approximations from the Victoria University of Wellington guide; dialects vary. Listen to real speakers below.</p></div>' +
      '<div class="card"><h3>Consonants</h3><ul class="plain small">' +
      '<li><b>t</b>: soft, almost like a d before a, e, o; slightly sibilant before i or u.</li>' +
      '<li><b>r</b>: a soft tap or roll.</li>' +
      '<li><b>ng</b>: like the middle of "singer".</li>' +
      '<li><b>wh</b>: in most dialects, close to an English f.</li></ul></div>' +
      '<div class="card"><h3>Listen</h3>' + resourceList(true) + '</div>');
  }

  function resourceList(onlyAudio) {
    var list = content.resources || [];
    if (onlyAudio) list = list.filter(function (r) { return /Pronunciation|podcast/i.test(r.title); });
    return '<ul class="plain">' + list.map(function (r) {
      return '<li><a href="' + esc(r.url) + '" target="_blank" rel="noopener"><b>' + esc(r.title) + '</b></a>' +
        (r.about ? '<div class="small muted">' + esc(r.about) + '</div>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  /* ---------- more: word list, resources, data ---------- */
  function renderMore() {
    session = null;
    setView(
      '<div class="card"><h2>More</h2>' +
      '<button class="btn" id="list">Word list &amp; accuracy checks</button>' +
      '<button class="btn ghost" id="res">Resources</button>' +
      '<button class="btn ghost" id="exp">Export progress</button>' +
      '<button class="btn ghost" id="imp">Import progress</button>' +
      '<input type="file" id="file" accept="application/json" hidden>' +
      '<button class="btn ghost" id="snd">Auto-play sound: ' + (state.settings.autoplay ? 'On' : 'Off') + '</button>' +
      '<button class="btn ghost" id="reset">Reset progress</button>' +
      '<p class="small muted" style="margin-top:12px">Progress is stored in this browser only. Export it to move between devices.</p></div>');
    $('#list').onclick = renderList;
    $('#res').onclick = function () {
      setView('<div class="card"><h2>Resources</h2>' + resourceList(false) + '</div>');
    };
    $('#exp').onclick = function () {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'kakano-progress.json';
      document.body.appendChild(a); a.click(); a.remove();
    };
    $('#imp').onclick = function () { $('#file').click(); };
    $('#file').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var s = JSON.parse(r.result);
          if (!s || typeof s.items !== 'object') throw new Error('bad');
          state = normalizeState(Object.assign(blank(), s, { v: s.v }));
          if (state.v !== STATE_VERSION) { C.migrate(state, lessons); state.v = STATE_VERSION; }
          save(); renderHome();
        } catch (err) { alert('That file is not a Kakano progress export.'); }
      };
      r.readAsText(f);
    };
    $('#snd').onclick = function () {
      state.settings.autoplay = !state.settings.autoplay;
      save();
      $('#snd').textContent = 'Auto-play sound: ' + (state.settings.autoplay ? 'On' : 'Off');
    };
    $('#reset').onclick = function () {
      if (confirm('Erase all progress on this device?')) { state = blank(); save(); renderHome(); }
    };
  }

  function renderList() {
    var html = '<div class="card"><h2>Word list</h2><p class="small muted">Tick an item once you have checked it in Te Aka or with a fluent speaker. Fix any mistakes in <code>content/lessons.json</code>.</p></div>';
    content.units.forEach(function (u) {
      html += '<div class="card"><h3>' + esc(u.title) + '</h3><ul class="plain">' + u.items.map(function (it) {
        var rec = state.items[it.id];
        return '<li><label class="check" style="margin:0"><input type="checkbox" data-ver="' + esc(it.id) + '"' + (state.verified[it.id] ? ' checked' : '') + '>' +
          '<span><b>' + esc(it.mi) + '</b> <span class="muted">' + esc(it.en) + '</span>' +
          '<br><span class="small muted">' + (rec ? 'box ' + rec.box : 'not started') + '</span></span></label>' +
          (hasAudio(it) ? '<div class="links">' + playBtn(it) + '</div>' : '') + '</li>';
      }).join('') + '</ul></div>';
    });
    setView(html);
    $all('[data-ver]').forEach(function (cb) {
      cb.onchange = function () {
        if (cb.checked) state.verified[cb.dataset.ver] = true; else delete state.verified[cb.dataset.ver];
        save();
      };
    });
  }

  /* ---------- boot ---------- */
  document.getElementById('homeBtn').onclick = function () { if (content) renderHome(); };
  document.getElementById('soundsBtn').onclick = function () { if (content) renderSounds(); };
  document.getElementById('moreBtn').onclick = function () { if (content) renderMore(); };

  fetch('content/lessons.json').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (json) {
    content = json;
    content.meta = content.meta || {};
    var credit = document.getElementById('credit');
    if (credit && content.meta.audio_credit) credit.textContent = content.meta.audio_credit;
    items = C.flatten(content);
    byId = {}; items.forEach(function (i) { byId[i.id] = i; });
    lessons = C.makeLessons(content);
    state = loadState();
    if (state.v !== STATE_VERSION) {
      // Progress from before the lesson path existed: credit lessons already learned.
      C.migrate(state, lessons);
      state.v = STATE_VERSION;
      save();
    }
    renderHome();
  }).catch(function (err) {
    app.innerHTML = '<div class="card"><h2>Could not load lessons</h2><p>' + esc(err.message) +
      '</p><p class="muted small">Open this through a web server (GitHub Pages, or <code>python3 -m http.server</code>), not by double-clicking the file.</p></div>';
  });
})();
