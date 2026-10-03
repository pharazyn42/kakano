(function () {
  'use strict';
  var C = window.KakanoCore;
  var LS_KEY = 'kakano.v1';
  var SESSION_SIZE = 10, NEW_PER_DAY = 5;
  var app = document.getElementById('app');
  var content, items, state, session = null;

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function blank() { return { items: {}, days: [], newToday: { date: '', count: 0 }, verified: {} }; }
  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && s.items) return Object.assign(blank(), s);
    } catch (e) { /* fall through */ }
    return blank();
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function today() { return C.todayStr(); }
  function $(sel) { return app.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(app.querySelectorAll(sel)); }

  function linksFor(item) {
    var out = [];
    var dict = item.dictionary_link ||
      (item.type === 'word' ? 'https://maoridictionary.co.nz/search?keywords=' + encodeURIComponent(item.mi) : '');
    if (dict) out.push('<a href="' + esc(dict) + '" target="_blank" rel="noopener">Te Aka</a>');
    if (item.audio_link) out.push('<a href="' + esc(item.audio_link) + '" target="_blank" rel="noopener">Listen</a>');
    if (item.video_link) out.push('<a href="' + esc(item.video_link) + '" target="_blank" rel="noopener">Watch</a>');
    return out.length ? '<div class="links">' + out.join('') + '</div>' : '';
  }

  function plantFor(n) {
    if (n >= 14) return '🌸';
    if (n >= 7) return '🪴';
    if (n >= 3) return '🌿';
    if (n >= 1) return '🌱';
    return '🌰';
  }

  /* ---------- home ---------- */
  function renderHome() {
    session = null;
    var t = today();
    var streak = C.streak(state.days, t);
    var seen = items.filter(function (i) { return state.items[i.id]; }).length;
    var due = C.dueItems(items, state, t).length;
    var fresh = Math.min(C.newAllowance(state, t, NEW_PER_DAY), items.length - seen);
    var doneToday = state.days.indexOf(t) !== -1;
    var checked = items.filter(function (i) { return state.verified[i.id]; }).length;

    var cta = due + fresh > 0 ? (doneToday ? 'Keep going' : "Start today's lesson") : 'Free practice';
    var units = content.units.map(function (u) {
      var n = u.items.length;
      var s = u.items.filter(function (i) { return state.items[i.id]; }).length;
      return '<li><b>' + esc(u.title) + '</b> <span class="muted small">' + s + ' / ' + n + '</span></li>';
    }).join('');

    app.innerHTML =
      '<div class="card hero"><div class="plant">' + plantFor(streak) + '</div>' +
      '<h2>' + (streak ? streak + '-day streak' : 'Plant your first seed') + '</h2>' +
      '<p class="muted">' + (doneToday ? "Today's lesson is done. Nice mahi." : 'A few minutes a day grows a language.') + '</p>' +
      '<button class="btn" id="go">' + cta + '</button></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + seen + '</b><span class="muted small">learned</span></div>' +
      '<div class="stat"><b>' + due + '</b><span class="muted small">due</span></div>' +
      '<div class="stat"><b>' + fresh + '</b><span class="muted small">new today</span></div></div>' +
      '<div class="card"><h3>Units</h3><ul class="plain">' + units + '</ul></div>' +
      '<div class="card small muted"><b>Accuracy check:</b> ' + checked + ' of ' + items.length +
      ' items marked as checked by you. This content was AI-drafted, so verify each item in Te Aka before trusting it.</div>';
    $('#go').onclick = function () { startSession(false); };
  }

  /* ---------- session ---------- */
  function startSession(forcePractice) {
    var t = today();
    var built = C.buildSession(items, state, t, { size: SESSION_SIZE, newPerDay: NEW_PER_DAY });
    if (forcePractice) {
      var seen = items.filter(function (i) { return state.items[i.id]; });
      built = {
        mode: 'practice',
        steps: C.shuffle(seen).slice(0, SESSION_SIZE).map(function (it) { return { kind: 'quiz', item: it }; })
      };
    }
    if (!built.steps.length) { renderEmpty(); return; }
    session = {
      mode: built.mode, steps: built.steps, i: 0,
      seenIds: {}, requeued: {}, firstTotal: 0, firstRight: 0, q: null, answered: false
    };
    renderStep();
  }

  function renderEmpty() {
    app.innerHTML = '<div class="card"><h2>Nothing to practise yet</h2><p class="muted">Start a lesson first and come back.</p>' +
      '<button class="btn" id="back">Back</button></div>';
    $('#back').onclick = renderHome;
  }

  function progressBar() {
    var pct = Math.round((session.i / session.steps.length) * 100);
    return '<div class="progress"><i style="width:' + pct + '%"></i></div>';
  }

  function renderStep() {
    var step = session.steps[session.i];
    if (!step) { renderDone(); return; }
    if (step.kind === 'learn') renderLearn(step.item); else renderQuiz(step.item);
  }

  function next() { session.i += 1; renderStep(); }

  /* ---------- learn card ---------- */
  function introduce(item) {
    var t = today();
    if (!state.items[item.id]) {
      state.items[item.id] = { box: 0, due: t, right: 0, wrong: 0 };
      var used = state.newToday.date === t ? state.newToday.count : 0;
      state.newToday = { date: t, count: used + 1 };
      save();
    }
  }

  function renderLearn(item) {
    introduce(item);
    app.innerHTML = progressBar() +
      '<div class="card"><div class="kicker">New ' + (item.type === 'word' ? 'word' : 'sentence') + ' · ' + esc(item.unitTitle) + '</div>' +
      '<div class="prompt">' + esc(item.mi) + '</div>' +
      '<p>' + esc(item.en) + '</p>' +
      (item.note ? '<p class="muted small">' + esc(item.note) + '</p>' : '') +
      linksFor(item) +
      '<label class="check"><input type="checkbox" id="ver"' + (state.verified[item.id] ? ' checked' : '') + '> I checked this against a trusted source</label>' +
      '<button class="btn" id="cont">Continue</button></div>';
    $('#ver').onchange = function (e) {
      if (e.target.checked) state.verified[item.id] = true; else delete state.verified[item.id];
      save();
    };
    $('#cont').onclick = next;
  }

  /* ---------- quiz ---------- */
  function makeQuestion(item) {
    var rec = state.items[item.id] || { box: 0 };
    var kind = C.pickExercise(item, rec.box);
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

  function renderQuiz(item) {
    var q = makeQuestion(item);
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
    app.innerHTML = progressBar() +
      '<div class="card"><div class="kicker">' + esc(q.label) + '</div>' +
      '<div class="prompt">' + esc(q.prompt) + '</div>' + body +
      '<div id="fb"></div></div>';

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
          finishAnswer(ok, ok ? null : q.correct);
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
        finishAnswer(m.ok, m.ok ? null : q.correct, m.ok && !m.exact ? q.correct : null);
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
        finishAnswer(ok, ok ? null : q.correct);
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

  function finishAnswer(correct, shownAnswer, macronHint) {
    var q = session.q, item = q.item;
    session.answered = true;
    var first = !session.seenIds[item.id];
    session.seenIds[item.id] = true;
    if (first) {
      session.firstTotal += 1;
      if (correct) session.firstRight += 1;
      if (session.mode === 'normal') {
        state.items[item.id] = C.grade(state.items[item.id] || { box: 0, due: today(), right: 0, wrong: 0 }, correct, today());
        save();
      }
    }
    if (!correct && !session.requeued[item.id]) {
      session.requeued[item.id] = true;
      session.steps.push({ kind: 'quiz', item: item });
    }
    var cls = correct ? (macronHint ? 'warn' : 'good') : 'bad';
    var head = correct ? (macronHint ? 'Correct, mind the macrons' : 'Correct') : 'Not quite';
    var detail = '';
    if (macronHint) detail = '<div class="ans">' + esc(macronHint) + '</div>';
    else if (!correct) detail = '<div class="ans">' + esc(shownAnswer) + '</div>';
    var meaning = item.type === 'sentence' || q.kind === 'build' || q.kind === 'mc_sent'
      ? '<div class="small muted">' + esc(item.mi) + ' = ' + esc(item.en) + '</div>' : '';
    $('#fb').innerHTML = '<div class="feedback ' + cls + '"><b>' + head + '</b>' + detail + meaning + '</div>' +
      linksFor(item) + '<button class="btn" id="cont">Continue</button>';
    $('#cont').focus();
    $('#cont').onclick = next;
  }

  /* ---------- finish ---------- */
  function renderDone() {
    var t = today();
    if (session.mode === 'normal' && state.days.indexOf(t) === -1) { state.days.push(t); save(); }
    var streak = C.streak(state.days, t);
    var s = session;
    app.innerHTML = '<div class="card hero"><div class="plant">' + plantFor(streak) + '</div>' +
      '<h2>' + (s.mode === 'practice' ? 'Practice complete' : 'Lesson complete') + '</h2>' +
      '<p>' + s.firstRight + ' of ' + s.firstTotal + ' right first time.</p>' +
      (s.mode === 'normal' ? '<p class="muted">' + streak + '-day streak. Words you missed come back sooner.</p>' : '<p class="muted">Free practice does not change your review schedule.</p>') +
      '<button class="btn" id="more">Practise more</button>' +
      '<button class="btn ghost" id="home">Done</button></div>';
    $('#more').onclick = function () { startSession(true); };
    $('#home').onclick = renderHome;
  }

  /* ---------- sounds ---------- */
  function renderSounds() {
    session = null;
    app.innerHTML =
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
      '<div class="card"><h3>Listen</h3>' + resourceList(true) + '</div>';
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
    app.innerHTML =
      '<div class="card"><h2>More</h2>' +
      '<button class="btn" id="list">Word list &amp; accuracy checks</button>' +
      '<button class="btn ghost" id="res">Resources</button>' +
      '<button class="btn ghost" id="exp">Export progress</button>' +
      '<button class="btn ghost" id="imp">Import progress</button>' +
      '<input type="file" id="file" accept="application/json" hidden>' +
      '<button class="btn ghost" id="reset">Reset progress</button>' +
      '<p class="small muted" style="margin-top:12px">Progress is stored in this browser only. Export it to move between devices.</p></div>';
    $('#list').onclick = renderList;
    $('#res').onclick = function () {
      app.innerHTML = '<div class="card"><h2>Resources</h2>' + resourceList(false) + '</div>';
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
          state = Object.assign(blank(), s); save(); renderHome();
        } catch (err) { alert('That file is not a Kakano progress export.'); }
      };
      r.readAsText(f);
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
          '<br><span class="small muted">' + (rec ? 'box ' + rec.box : 'not started') + '</span></span></label></li>';
      }).join('') + '</ul></div>';
    });
    app.innerHTML = html;
    $all('[data-ver]').forEach(function (cb) {
      cb.onchange = function () {
        if (cb.checked) state.verified[cb.dataset.ver] = true; else delete state.verified[cb.dataset.ver];
        save();
      };
    });
  }

  /* ---------- boot ---------- */
  document.getElementById('homeBtn').onclick = renderHome;
  document.getElementById('soundsBtn').onclick = function () { if (content) renderSounds(); };
  document.getElementById('moreBtn').onclick = function () { if (content) renderMore(); };

  fetch('content/lessons.json').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (json) {
    content = json; items = C.flatten(content); state = loadState(); renderHome();
  }).catch(function (err) {
    app.innerHTML = '<div class="card"><h2>Could not load lessons</h2><p>' + esc(err.message) +
      '</p><p class="muted small">Open this through a web server (GitHub Pages, or <code>python3 -m http.server</code>), not by double-clicking the file.</p></div>';
  });
})();
