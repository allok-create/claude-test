/* 丙級會計練習站 — 單頁應用（無外部相依，資料存於瀏覽器 localStorage） */
(function () {
  'use strict';

  var CATS = window.CATEGORIES;
  var QS = window.QUESTIONS;
  var QMAP = {};
  QS.forEach(function (q) { QMAP[q.id] = q; });
  var CATMAP = {};
  CATS.forEach(function (c) { CATMAP[c.id] = c; });

  // 模擬考配置：單選60題×1分＋複選20題×2分＝100分，100分鐘，60分及格
  var EXAM = { single: 60, multi: 20, sPt: 1, mPt: 2, minutes: 100, pass: 60 };
  var LETTERS = 'ABCD';
  var KEY = 'cacct-v1';

  /* ───────── Storage ───────── */
  function defaults() {
    return {
      v: 1,
      stats: {},   // qid -> { c: 答對次數, w: 答錯次數, t: 最後作答時間, last: 1|0 }
      wrong: {},   // qid -> { n: 累計答錯, streak: 連續答對, at: 最後答錯時間 }
      marks: {},   // qid -> 收藏時間
      exams: [],   // 模擬考紀錄
      draft: null, // 進行中的模擬考
      settings: { shuffle: true, autoRemove: 2, theme: 'auto' },
      pset: { cats: CATS.map(function (c) { return c.id; }), type: 'all', scope: 'all', order: 'random', count: 20 }
    };
  }
  function load() {
    var base = defaults();
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        return Object.assign(base, d, {
          settings: Object.assign(base.settings, d.settings || {}),
          pset: Object.assign(base.pset, d.pset || {})
        });
      }
    } catch (e) { /* 無法讀取時使用預設值 */ }
    return base;
  }
  var storageOk = true;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) {
      if (storageOk) toast('瀏覽器無法儲存資料，作答紀錄將不會保留');
      storageOk = false;
    }
  }
  var db = load();

  /* ───────── Utils ───────── */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function perm(q) { return db.settings.shuffle ? shuffle([0, 1, 2, 3].slice(0, q.o.length)) : q.o.map(function (_, i) { return i; }); }
  function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtShortDate(ts) { var d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
  }
  function fmtScore(n) { return Math.round(n * 10) / 10; }
  function answerText(q) {
    var a = Array.isArray(q.a) ? q.a : [q.a];
    return a.map(function (i) { return LETTERS[i]; }).join('、');
  }
  function isCorrect(q, sel) {
    if (!sel || !sel.length) return false;
    if (q.type === 'single') return sel.length === 1 && sel[0] === q.a;
    if (sel.length !== q.a.length) return false;
    var s = sel.slice().sort();
    return q.a.every(function (v, i) { return s[i] === v; });
  }
  function typeTag(q) { return q.type === 'multi' ? '<span class="tag warn">複選</span>' : '<span class="tag">單選</span>'; }
  function catTag(q) { return '<span class="tag primary">' + esc(CATMAP[q.cat].name) + '</span>'; }

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2400);
  }

  /* ───────── 作答紀錄 / 錯題本 ───────── */
  function record(qid, ok) {
    var s = db.stats[qid] || (db.stats[qid] = { c: 0, w: 0, t: 0, last: 0 });
    if (ok) s.c++; else s.w++;
    s.t = Date.now();
    s.last = ok ? 1 : 0;
    var w = db.wrong[qid];
    if (!ok) {
      w = w || (db.wrong[qid] = { n: 0, streak: 0, at: 0 });
      w.n++; w.streak = 0; w.at = Date.now();
      return 'added';
    }
    if (w) {
      w.streak++;
      if (db.settings.autoRemove > 0 && w.streak >= db.settings.autoRemove) {
        delete db.wrong[qid];
        return 'removed';
      }
    }
    return null;
  }
  function wrongIds() { return Object.keys(db.wrong).filter(function (id) { return QMAP[id]; }); }

  /* ───────── Router ───────── */
  var app = document.getElementById('app');
  var quiz = null;      // 進行中的練習
  var timerId = null;
  var examNavOpen = false;
  var resultFilter = 'all';
  var wbFilter = 'all';

  var routes = {
    home: viewHome,
    practice: viewPractice,
    quiz: viewQuiz,
    exam: viewExam,
    examrun: viewExamRun,
    result: viewResult,
    wrong: viewWrong,
    stats: viewStats,
    settings: viewSettings
  };

  function parseHash() {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    return { name: parts[0] || 'home', arg: parts[1] };
  }
  function go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  }
  function render(keepScroll) {
    var r = parseHash();
    var fn = routes[r.name] || viewHome;
    if (timerId) { clearInterval(timerId); timerId = null; }
    hideTip();
    document.body.classList.toggle('exam-mode', r.name === 'examrun');
    app.innerHTML = fn(r.arg) || '';
    if (r.name === 'examrun') startTimer();
    var navKey = { quiz: 'practice', examrun: 'exam', result: 'exam' }[r.name] || r.name;
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === navKey);
    });
    if (!keepScroll) window.scrollTo(0, 0);
  }
  function rerender() { render(true); }
  window.addEventListener('hashchange', function () { render(false); });

  /* ───────── 首頁 ───────── */
  function overall() {
    var c = 0, w = 0, seen = 0;
    Object.keys(db.stats).forEach(function (id) {
      if (!QMAP[id]) return;
      var s = db.stats[id]; c += s.c; w += s.w; seen++;
    });
    return { c: c, w: w, total: c + w, seen: seen };
  }

  function viewHome() {
    var o = overall();
    var nSingle = QS.filter(function (q) { return q.type === 'single'; }).length;
    var nMulti = QS.length - nSingle;
    var last = db.exams[db.exams.length - 1];
    var draft = db.draft;
    return '' +
      '<section class="card hero">' +
        '<h1>丙級會計事務 學科練習</h1>' +
        '<p>題庫練習、限時模擬考、自動錯題本與成績分析，手機電腦都能用；作答紀錄只存在你的瀏覽器中。</p>' +
        '<div class="btn-row">' +
          '<a class="btn" href="#/practice">開始練習</a>' +
          (draft ? '<a class="btn ghost" href="#/examrun">繼續未完成的模擬考</a>'
                 : '<a class="btn ghost" href="#/exam">進行模擬考</a>') +
        '</div>' +
      '</section>' +
      '<div class="kpis" style="margin-bottom:16px">' +
        kpi('題庫題數', QS.length, '單選 ' + nSingle + '・複選 ' + nMulti) +
        kpi('已練習', o.seen, '覆蓋率 ' + pct(o.seen, QS.length) + '%') +
        kpi('正答率', o.total ? pct(o.c, o.total) + '%' : '—', '累計作答 ' + o.total + ' 次') +
        kpi('錯題本', wrongIds().length, last ? '最近模考 ' + fmtScore(last.score) + ' 分' : '尚未模擬考') +
      '</div>' +
      '<div class="grid grid-2">' +
        feature('#/practice', '✎', '題庫練習', '依單元、題型、範圍篩選，作答後立即顯示解析。') +
        feature('#/exam', '⏱', '模擬考', '單選 ' + EXAM.single + ' 題＋複選 ' + EXAM.multi + ' 題，限時 ' + EXAM.minutes + ' 分鐘，交卷後自動評分。') +
        feature('#/wrong', '✗', '錯題本', '答錯自動收錄，可集中重練；連續答對 ' + (db.settings.autoRemove || '—') + ' 次自動移出。') +
        feature('#/stats', '▤', '成績分析', '模擬考成績走勢、各單元正答率與弱點建議。') +
      '</div>' +
      '<section class="card">' +
        '<h2>學科測試說明</h2>' +
        '<ul class="plain">' +
          '<li>本站模擬考配置：單選題 ' + EXAM.single + ' 題（每題 ' + EXAM.sPt + ' 分）、複選題 ' + EXAM.multi + ' 題（每題 ' + EXAM.mPt + ' 分，須全部答對才給分），滿分 100 分，' + EXAM.pass + ' 分及格。</li>' +
          '<li>題目範圍涵蓋會計學基礎、商業會計法、營業稅與所得稅，以及共同科目（職業安全衛生、工作倫理、環境保護、節能減碳）。</li>' +
          '<li>題庫為依學科範圍自行編寫之練習題，實際題目與配分請以技能檢定主管機關公告為準。</li>' +
        '</ul>' +
      '</section>';
  }
  function kpi(label, value, sub) {
    return '<div class="kpi"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) + '</div><div class="sub">' + esc(sub) + '</div></div>';
  }
  function feature(href, ico, title, desc) {
    return '<a class="card feature" href="' + href + '"><div class="f-ico" aria-hidden="true">' + ico + '</div><h3>' + esc(title) + '</h3><p>' + esc(desc) + '</p></a>';
  }

  /* ───────── 題庫練習：設定 ───────── */
  function filterPool(ps) {
    var cats = {};
    ps.cats.forEach(function (c) { cats[c] = 1; });
    return QS.filter(function (q) {
      if (!cats[q.cat]) return false;
      if (ps.type !== 'all' && q.type !== ps.type) return false;
      var s = db.stats[q.id];
      if (ps.scope === 'new' && s) return false;
      if (ps.scope === 'wrong' && !(s && s.w > 0)) return false;
      if (ps.scope === 'marked' && !db.marks[q.id]) return false;
      return true;
    });
  }
  function seg(name, value, opts) {
    return '<div class="seg" role="group">' + opts.map(function (o) {
      return '<button type="button" data-act="pset" data-k="' + name + '" data-v="' + o[0] + '" aria-pressed="' + (String(value) === String(o[0])) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function viewPractice() {
    var ps = db.pset;
    var pool = filterPool(ps);
    var chips = CATS.map(function (c) {
      var all = QS.filter(function (q) { return q.cat === c.id; });
      var done = all.filter(function (q) { return db.stats[q.id]; }).length;
      var on = ps.cats.indexOf(c.id) >= 0;
      return '<button type="button" class="chip" data-act="cat" data-v="' + c.id + '" aria-pressed="' + on + '">' +
        esc(c.name) + '<span class="count">' + done + '/' + all.length + '</span></button>';
    }).join('');
    var n = ps.count === 0 ? pool.length : Math.min(ps.count, pool.length);
    return '' +
      '<h1>題庫練習</h1>' +
      '<section class="card">' +
        '<div class="field"><div class="card-title"><span class="label" style="margin:0;font-weight:600">單元（已練/總題數）</span>' +
          '<span class="btn-row"><button class="btn btn-sm" data-act="cat-all">全選</button><button class="btn btn-sm" data-act="cat-none">全不選</button></span></div>' +
          '<div class="chips">' + chips + '</div></div>' +
        '<div class="field"><span class="label">題型</span>' + seg('type', ps.type, [['all', '全部'], ['single', '單選'], ['multi', '複選']]) + '</div>' +
        '<div class="field"><span class="label">範圍</span>' + seg('scope', ps.scope, [['all', '全部'], ['new', '未作答'], ['wrong', '曾答錯'], ['marked', '已收藏']]) + '</div>' +
        '<div class="field"><span class="label">順序</span>' + seg('order', ps.order, [['random', '隨機'], ['seq', '依題號']]) + '</div>' +
        '<div class="field"><span class="label">題數</span>' + seg('count', ps.count, [[10, '10'], [20, '20'], [50, '50'], [0, '全部']]) + '</div>' +
        '<p class="muted">符合條件 ' + pool.length + ' 題，本次練習 ' + n + ' 題。</p>' +
        '<button class="btn btn-primary btn-block" data-act="start-practice"' + (n ? '' : ' disabled') + '>開始練習</button>' +
      '</section>';
  }

  function startQuiz(ids, title, source) {
    quiz = {
      title: title, source: source, ids: ids, i: 0,
      order: {}, ans: {}, pending: [], done: false
    };
    ids.forEach(function (id) { quiz.order[id] = perm(QMAP[id]); });
    go('#/quiz');
  }

  /* ───────── 練習作答 ───────── */
  function optionButtons(q, order, opts) {
    // opts: { sel:[], reveal:bool, disabled:bool, act:string }
    var sel = opts.sel || [];
    return '<div class="options">' + order.map(function (orig, pos) {
      var cls = ['opt'];
      if (q.type === 'multi') cls.push('multi');
      var isSel = sel.indexOf(orig) >= 0;
      var isAns = Array.isArray(q.a) ? q.a.indexOf(orig) >= 0 : q.a === orig;
      var mark = '';
      if (opts.reveal) {
        if (isAns) { cls.push('correct'); mark = isSel ? '✓' : '正解'; }
        else if (isSel) { cls.push('wrong'); mark = '✗'; }
      } else if (isSel) cls.push('selected');
      return '<button type="button" class="' + cls.join(' ') + '" data-act="' + (opts.act || '') + '" data-v="' + orig + '"' +
        (opts.disabled ? ' disabled' : '') + ' aria-pressed="' + isSel + '">' +
        '<span class="letter">' + LETTERS[pos] + '</span><span>' + esc(q.o[orig]) + '</span>' +
        (mark ? '<span class="mark">' + mark + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function displayAnswer(q, order) {
    var a = Array.isArray(q.a) ? q.a : [q.a];
    return a.map(function (orig) { return LETTERS[order.indexOf(orig)]; }).sort().join('、');
  }

  function viewQuiz() {
    if (!quiz) { setTimeout(function () { go('#/practice'); }); return ''; }
    if (quiz.done) return viewQuizSummary();
    var id = quiz.ids[quiz.i];
    var q = QMAP[id];
    var order = quiz.order[id];
    var a = quiz.ans[id];
    var answered = !!a;
    var sel = answered ? a.sel : quiz.pending;
    var nDone = Object.keys(quiz.ans).length;
    var last = quiz.i === quiz.ids.length - 1;
    var html = '' +
      '<div class="q-top"><span class="title">' + esc(quiz.title) + '</span><span class="spacer"></span>' +
        '<span class="muted small">第 ' + (quiz.i + 1) + ' / ' + quiz.ids.length + ' 題</span>' +
        '<button class="btn btn-sm" data-act="quit-quiz">結束</button></div>' +
      '<div class="progress" aria-hidden="true"><span style="width:' + pct(nDone, quiz.ids.length) + '%"></span></div>' +
      '<article class="card">' +
        '<div class="q-meta">' + catTag(q) + typeTag(q) + '<span class="muted small">#' + esc(q.id) + '</span>' + statHint(id) + '</div>' +
        '<div class="q-text">' + esc(q.q) + '</div>' +
        optionButtons(q, order, { sel: sel, reveal: answered, disabled: answered, act: 'pick' });
    if (answered) {
      html += '<div class="feedback ' + (a.ok ? 'good' : 'bad') + '">' +
        '<div class="fb-title">' + (a.ok ? '答對了！' : '答錯了，正確答案：' + displayAnswer(q, order)) + '</div>' +
        '<div class="explain">' + esc(q.e) + '</div>' +
        (a.note ? '<div class="small muted" style="margin-top:6px">' + esc(a.note) + '</div>' : '') +
      '</div>';
    }
    html += '<div class="q-actions">' +
        '<button class="btn" data-act="prev"' + (quiz.i === 0 ? ' disabled' : '') + '>上一題</button>' +
        '<button class="icon-btn star' + (db.marks[id] ? ' on' : '') + '" data-act="mark" aria-label="收藏此題" title="收藏">' + (db.marks[id] ? '★' : '☆') + '</button>' +
        '<span class="spacer"></span>' +
        (!answered && q.type === 'multi'
          ? '<button class="btn btn-primary" data-act="confirm"' + (quiz.pending.length ? '' : ' disabled') + '>確認答案</button>'
          : '<button class="btn btn-primary" data-act="next"' + (answered ? '' : ' disabled') + '>' + (last ? '完成' : '下一題') + '</button>') +
      '</div>' +
      '<div class="kbd-hint">快捷鍵：1–4 選擇選項，Enter 確認／下一題，← → 切換題目</div>' +
      '</article>';
    return html;
  }
  function statHint(id) {
    var s = db.stats[id];
    if (!s) return '<span class="tag">新題</span>';
    return '<span class="muted small">答對 ' + s.c + '・答錯 ' + s.w + '</span>';
  }
  function answerQuiz(sel) {
    var id = quiz.ids[quiz.i];
    var q = QMAP[id];
    var ok = isCorrect(q, sel);
    var res = record(id, ok);
    var note = '';
    if (res === 'added' && quiz.source !== 'wrong') note = '已加入錯題本。';
    if (res === 'removed') note = '已連續答對 ' + db.settings.autoRemove + ' 次，自動移出錯題本。';
    quiz.ans[id] = { sel: sel.slice(), ok: ok, note: note };
    quiz.pending = [];
    save();
    rerender();
  }
  function moveQuiz(d) {
    var n = quiz.i + d;
    if (n < 0) return;
    if (n >= quiz.ids.length) { quiz.done = true; render(); return; }
    quiz.i = n; quiz.pending = [];
    render();
  }

  function viewQuizSummary() {
    var ids = Object.keys(quiz.ans);
    var ok = ids.filter(function (id) { return quiz.ans[id].ok; });
    var bad = ids.filter(function (id) { return !quiz.ans[id].ok; });
    var html = '<h1>練習結果</h1>' +
      '<section class="card"><div class="score-ring">' +
        '<div class="score-big">' + pct(ok.length, ids.length) + '<small>%</small></div>' +
        '<div><div>' + esc(quiz.title) + '</div><div class="muted">作答 ' + ids.length + ' 題，答對 ' + ok.length + ' 題，答錯 ' + bad.length + ' 題</div></div>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:16px">' +
        (bad.length ? '<button class="btn btn-primary" data-act="retry-bad">重練本次答錯的 ' + bad.length + ' 題</button>' : '') +
        '<a class="btn" href="#/practice">回題庫練習</a><a class="btn" href="#/wrong">查看錯題本</a>' +
      '</div></section>';
    if (bad.length) {
      html += '<section class="card"><h2>本次答錯</h2>' + bad.map(function (id, k) {
        return reviewItem(QMAP[id], quiz.ans[id].sel, k + 1);
      }).join('') + '</section>';
    }
    return html;
  }

  function reviewItem(q, sel, num, extra) {
    sel = sel || [];
    var order = q.o.map(function (_, i) { return i; });
    var ok = isCorrect(q, sel);
    var status = !sel.length ? '<span class="tag warn">未作答</span>' : ok ? '<span class="tag good">答對</span>' : '<span class="tag bad">答錯</span>';
    return '<div class="review-item">' +
      '<div class="q-meta">' + status + catTag(q) + typeTag(q) + (extra || '') + '</div>' +
      '<div class="q-text"><span class="q-num">' + num + '.</span>' + esc(q.q) + '</div>' +
      optionButtons(q, order, { sel: sel, reveal: true, disabled: true }) +
      '<div class="explain"><strong>正解 ' + answerText(q) + '</strong>　' + esc(q.e) + '</div>' +
    '</div>';
  }

  /* ───────── 模擬考 ───────── */
  function viewExam() {
    var singles = QS.filter(function (q) { return q.type === 'single'; }).length;
    var multis = QS.length - singles;
    var nS = Math.min(EXAM.single, singles), nM = Math.min(EXAM.multi, multis);
    var history = db.exams.slice(-5).reverse();
    return '<h1>模擬考</h1>' +
      (db.draft ? '<section class="card notice"><strong>你有一份未完成的模擬考</strong>（開始於 ' + fmtDate(db.draft.startAt) + '）。' +
        '<div class="btn-row" style="margin-top:10px"><a class="btn btn-primary" href="#/examrun">繼續作答</a><button class="btn btn-danger" data-act="discard-draft">放棄此份</button></div></section>' : '') +
      '<section class="card">' +
        '<h2>考試規則</h2>' +
        '<ul class="plain">' +
          '<li>單選題 ' + nS + ' 題，每題 ' + EXAM.sPt + ' 分。</li>' +
          '<li>複選題 ' + nM + ' 題，每題 ' + EXAM.mPt + ' 分，所有正確選項皆選且無錯選才給分。</li>' +
          '<li>作答時間 ' + EXAM.minutes + ' 分鐘，時間到自動交卷；' + EXAM.pass + ' 分及格。</li>' +
          '<li>考試中不顯示對錯，交卷後可檢視每題解析；答錯題目會自動加入錯題本。</li>' +
          '<li>中途離開頁面不會遺失進度，計時仍會持續。</li>' +
        '</ul>' +
        (db.draft ? '' : '<button class="btn btn-primary btn-block" data-act="start-exam">開始模擬考</button>') +
      '</section>' +
      (history.length ? '<section class="card"><div class="card-title"><h2>最近紀錄</h2><a class="small" href="#/stats">完整分析 →</a></div>' + examTable(history) + '</section>' : '');
  }
  function examTable(list) {
    return '<div class="table-wrap"><table class="data"><thead><tr><th>日期</th><th class="num">分數</th><th>結果</th><th class="num">單選</th><th class="num">複選</th><th class="num">用時</th><th></th></tr></thead><tbody>' +
      list.map(function (e) {
        return '<tr><td class="nowrap">' + fmtDate(e.at) + '</td><td class="num"><strong>' + fmtScore(e.score) + '</strong></td>' +
          '<td>' + (e.score >= EXAM.pass ? '<span class="tag good">及格</span>' : '<span class="tag bad">未及格</span>') + '</td>' +
          '<td class="num">' + e.sRight + '/' + e.sTotal + '</td><td class="num">' + e.mRight + '/' + e.mTotal + '</td>' +
          '<td class="num">' + fmtDur(e.dur) + '</td><td><a href="#/result/' + e.id + '">檢視</a></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function startExam() {
    var singles = shuffle(QS.filter(function (q) { return q.type === 'single'; })).slice(0, EXAM.single);
    var multis = shuffle(QS.filter(function (q) { return q.type === 'multi'; })).slice(0, EXAM.multi);
    var ids = singles.concat(multis).map(function (q) { return q.id; });
    var order = {};
    ids.forEach(function (id) { order[id] = perm(QMAP[id]); });
    var now = Date.now();
    db.draft = { ids: ids, order: order, sel: {}, flags: {}, i: 0, startAt: now, endAt: now + EXAM.minutes * 60000 };
    examNavOpen = false;
    save();
    go('#/examrun');
  }

  function viewExamRun() {
    var d = db.draft;
    if (!d) { setTimeout(function () { go('#/exam'); }); return ''; }
    var id = d.ids[d.i];
    var q = QMAP[id];
    var sel = d.sel[id] || [];
    var answered = d.ids.filter(function (x) { return (d.sel[x] || []).length; }).length;
    var html = '' +
      '<div class="exam-bar">' +
        '<span class="timer" id="timer">--:--</span>' +
        '<span class="muted small">已答 ' + answered + '/' + d.ids.length + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn-sm" data-act="toggle-nav">題號</button>' +
        '<button class="btn btn-sm btn-primary" data-act="submit-exam">交卷</button>' +
      '</div>' +
      '<div class="exam-layout"><div>' +
        '<article class="card">' +
          '<div class="q-meta">' + typeTag(q) + '<span class="muted small">第 ' + (d.i + 1) + ' / ' + d.ids.length + ' 題</span>' +
            (q.type === 'multi' ? '<span class="muted small">（' + EXAM.mPt + ' 分，全對才給分）</span>' : '') + '</div>' +
          '<div class="q-text">' + esc(q.q) + '</div>' +
          optionButtons(q, d.order[id], { sel: sel, act: 'exam-pick' }) +
          '<div class="q-actions">' +
            '<button class="btn" data-act="exam-move" data-v="-1"' + (d.i === 0 ? ' disabled' : '') + '>上一題</button>' +
            '<button class="btn btn-sm" data-act="flag" aria-pressed="' + !!d.flags[id] + '">' + (d.flags[id] ? '⚑ 取消標記' : '⚐ 標記') + '</button>' +
            '<span class="spacer"></span>' +
            (d.i < d.ids.length - 1
              ? '<button class="btn btn-primary" data-act="exam-move" data-v="1">下一題</button>'
              : '<button class="btn btn-primary" data-act="submit-exam">交卷</button>') +
          '</div>' +
        '</article>' +
      '</div>' +
      '<aside class="card exam-nav' + (examNavOpen ? ' open' : '') + '">' + examGrid(d) + '</aside>' +
      '</div>';
    return html;
  }
  function examGrid(d, result) {
    var nS = d.ids.filter(function (id) { return QMAP[id].type === 'single'; }).length;
    function cell(id, k) {
      var cls = [];
      var sel = d.sel[id] || [];
      if (result) cls.push(isCorrect(QMAP[id], sel) ? 'r-ok' : 'r-bad');
      else {
        if (sel.length) cls.push('done');
        if (d.flags[id]) cls.push('flag');
        if (k === d.i) cls.push('cur');
      }
      return '<button type="button" class="' + cls.join(' ') + '" data-act="' + (result ? 'jump-review' : 'exam-jump') + '" data-v="' + k + '" aria-label="第' + (k + 1) + '題">' + (k + 1) + '</button>';
    }
    var cells = d.ids.map(cell);
    var legend = result
      ? '<div class="legend-row"><span><i style="background:var(--good-soft);border-color:var(--good)"></i>答對</span><span><i style="background:var(--bad-soft);border-color:var(--bad)"></i>答錯／未答</span></div>'
      : '<div class="legend-row"><span><i style="background:var(--primary-soft);border-color:var(--primary)"></i>已答</span><span><i style="background:var(--warn)"></i>標記</span><span><i></i>未答</span></div>';
    return '<div class="grid-section-label">單選題</div><div class="qgrid">' + cells.slice(0, nS).join('') + '</div>' +
      (cells.length > nS ? '<div class="grid-section-label">複選題</div><div class="qgrid">' + cells.slice(nS).join('') + '</div>' : '') + legend;
  }
  function startTimer() {
    var el = document.getElementById('timer');
    function tick() {
      if (!db.draft) return;
      var left = (db.draft.endAt - Date.now()) / 1000;
      if (left <= 0) { finishExam(true); return; }
      if (el) {
        el.textContent = '剩餘 ' + fmtDur(left);
        el.classList.toggle('low', left < 300);
      }
    }
    tick();
    timerId = setInterval(tick, 1000);
  }
  function finishExam(timeout) {
    var d = db.draft;
    if (!d) return;
    if (timerId) { clearInterval(timerId); timerId = null; }
    var sR = 0, sT = 0, mR = 0, mT = 0;
    var items = d.ids.map(function (id) {
      var q = QMAP[id];
      var sel = d.sel[id] || [];
      var ok = isCorrect(q, sel);
      if (q.type === 'single') { sT++; if (ok) sR++; } else { mT++; if (ok) mR++; }
      record(id, ok);
      return { id: id, s: sel };
    });
    var maxRaw = sT * EXAM.sPt + mT * EXAM.mPt;
    var raw = sR * EXAM.sPt + mR * EXAM.mPt;
    var now = Date.now();
    var exam = {
      id: String(now), at: now,
      dur: Math.min(now, d.endAt) / 1000 - d.startAt / 1000,
      score: maxRaw ? raw / maxRaw * 100 : 0,
      sRight: sR, sTotal: sT, mRight: mR, mTotal: mT,
      items: items
    };
    db.exams.push(exam);
    db.draft = null;
    save();
    resultFilter = 'all';
    if (timeout) toast('時間到，已自動交卷');
    go('#/result/' + exam.id);
  }

  /* ───────── 成績單 ───────── */
  function catBreakdown(items) {
    var m = {};
    items.forEach(function (it) {
      var q = QMAP[it.id];
      if (!q) return;
      var r = m[q.cat] || (m[q.cat] = { r: 0, t: 0 });
      r.t++;
      if (isCorrect(q, it.s)) r.r++;
    });
    return m;
  }
  function viewResult(id) {
    var e = db.exams.filter(function (x) { return x.id === id; })[0];
    if (!e) return '<div class="empty"><div class="big">🔍</div><p>找不到這份成績。</p><a class="btn" href="#/exam">回模擬考</a></div>';
    var pass = e.score >= EXAM.pass;
    var cb = catBreakdown(e.items);
    var items = e.items.filter(function (it) { return QMAP[it.id]; });
    var shown = items.map(function (it, k) { return { it: it, k: k }; }).filter(function (x) {
      var ok = isCorrect(QMAP[x.it.id], x.it.s);
      if (resultFilter === 'wrong') return !ok;
      if (resultFilter === 'blank') return !x.it.s.length;
      return true;
    });
    var nWrong = items.filter(function (it) { return !isCorrect(QMAP[it.id], it.s); }).length;
    var nBlank = items.filter(function (it) { return !it.s.length; }).length;
    return '<h1>模擬考成績</h1>' +
      '<section class="card"><div class="score-ring">' +
        '<div class="score-big">' + fmtScore(e.score) + '<small> 分</small></div>' +
        '<div>' + (pass ? '<span class="tag good">及格</span>' : '<span class="tag bad">未及格</span>') +
          '<div class="muted small" style="margin-top:4px">' + fmtDate(e.at) + '・用時 ' + fmtDur(e.dur) + '</div>' +
          '<div class="small">單選 ' + e.sRight + '/' + e.sTotal + '（' + e.sRight * EXAM.sPt + ' 分）・複選 ' + e.mRight + '/' + e.mTotal + '（' + e.mRight * EXAM.mPt + ' 分）</div></div>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:16px"><button class="btn btn-primary" data-act="start-exam">再考一次</button>' +
        (nWrong ? '<button class="btn" data-act="retry-exam-wrong" data-v="' + e.id + '">重練本次錯題（' + nWrong + '）</button>' : '') +
        '<a class="btn" href="#/stats">成績分析</a></div></section>' +
      '<section class="card"><h2>各單元得分</h2><div class="table-wrap"><table class="data"><thead><tr><th>單元</th><th class="num">答對</th><th class="num">題數</th><th class="num">正答率</th></tr></thead><tbody>' +
        CATS.filter(function (c) { return cb[c.id]; }).map(function (c) {
          var r = cb[c.id];
          return '<tr><td>' + esc(c.name) + '</td><td class="num">' + r.r + '</td><td class="num">' + r.t + '</td><td class="num">' + pct(r.r, r.t) + '%</td></tr>';
        }).join('') + '</tbody></table></div></section>' +
      '<section class="card"><h2>答題總覽</h2>' + examGrid({ ids: items.map(function (it) { return it.id; }), sel: selMap(items), flags: {}, i: -1 }, true) + '</section>' +
      '<section class="card"><div class="card-title"><h2>逐題檢視</h2>' +
        seg('rfilter', resultFilter, [['all', '全部（' + items.length + '）'], ['wrong', '答錯（' + nWrong + '）'], ['blank', '未答（' + nBlank + '）']]) + '</div>' +
        (shown.length ? shown.map(function (x) { return '<div id="rv-' + x.k + '">' + reviewItem(QMAP[x.it.id], x.it.s, x.k + 1) + '</div>'; }).join('')
                      : '<p class="muted">沒有符合的題目。</p>') +
      '</section>';
  }
  function selMap(items) { var m = {}; items.forEach(function (it) { m[it.id] = it.s; }); return m; }

  /* ───────── 錯題本 ───────── */
  function viewWrong() {
    var ids = wrongIds();
    if (!ids.length) {
      return '<h1>錯題本</h1><section class="card empty"><div class="big">🎉</div><p>目前沒有錯題。</p>' +
        '<p class="small muted">練習或模擬考答錯的題目會自動收錄在這裡。</p><a class="btn btn-primary" href="#/practice">去練習</a></section>';
    }
    var counts = {};
    ids.forEach(function (id) { var c = QMAP[id].cat; counts[c] = (counts[c] || 0) + 1; });
    var list = ids.filter(function (id) { return wbFilter === 'all' || QMAP[id].cat === wbFilter; })
      .sort(function (a, b) { return db.wrong[b].n - db.wrong[a].n || db.wrong[b].at - db.wrong[a].at; });
    var opts = '<option value="all">全部單元（' + ids.length + '）</option>' + CATS.filter(function (c) { return counts[c.id]; }).map(function (c) {
      return '<option value="' + c.id + '"' + (wbFilter === c.id ? ' selected' : '') + '>' + esc(c.name) + '（' + counts[c.id] + '）</option>';
    }).join('');
    var auto = db.settings.autoRemove;
    return '<h1>錯題本</h1>' +
      '<div class="toolbar">' +
        '<label class="sr-only" for="wb-filter">篩選單元</label><select id="wb-filter" class="input" data-act="wb-filter">' + opts + '</select>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn-primary" data-act="practice-wrong">練習這 ' + list.length + ' 題</button>' +
        '<button class="btn btn-danger btn-sm" data-act="clear-wrong">清空</button>' +
      '</div>' +
      '<p class="small muted">依答錯次數排序。' + (auto ? '在練習中連續答對 ' + auto + ' 次會自動移出。' : '已關閉自動移出，可手動移除。') + '</p>' +
      list.map(function (id) {
        var q = QMAP[id], w = db.wrong[id];
        return '<details class="wb-item"><summary><span class="q">' +
          '<span class="q-meta" style="margin-bottom:4px">' + catTag(q) + typeTag(q) + '<span class="tag bad">錯 ' + w.n + ' 次</span>' +
          (w.streak ? '<span class="tag good">連對 ' + w.streak + '</span>' : '') + '</span>' + esc(q.q) + '</span><span class="chev">›</span></summary>' +
          '<div class="body">' + optionButtons(q, q.o.map(function (_, i) { return i; }), { sel: [], reveal: true, disabled: true }) +
          '<div class="explain"><strong>正解 ' + answerText(q) + '</strong>　' + esc(q.e) + '</div>' +
          '<div class="btn-row end" style="margin-top:10px"><button class="btn btn-sm" data-act="wb-remove" data-v="' + id + '">移出錯題本</button></div></div></details>';
      }).join('');
  }

  /* ───────── 成績分析 ───────── */
  function viewStats() {
    var o = overall();
    var ex = db.exams;
    var scores = ex.map(function (e) { return e.score; });
    var avg = scores.length ? scores.reduce(function (a, b) { return a + b; }, 0) / scores.length : 0;
    var best = scores.length ? Math.max.apply(null, scores) : 0;
    var passN = scores.filter(function (s) { return s >= EXAM.pass; }).length;

    var catRows = CATS.map(function (c) {
      var qs = QS.filter(function (q) { return q.cat === c.id; });
      var cr = 0, wr = 0, seen = 0;
      qs.forEach(function (q) { var s = db.stats[q.id]; if (s) { cr += s.c; wr += s.w; seen++; } });
      return { c: c, total: qs.length, seen: seen, att: cr + wr, acc: cr + wr ? cr / (cr + wr) : null };
    });
    var weak = catRows.filter(function (r) { return r.att >= 5; }).sort(function (a, b) { return a.acc - b.acc; }).slice(0, 3)
      .filter(function (r) { return r.acc < 0.8; });
    var untouched = catRows.filter(function (r) { return r.seen === 0; });

    var html = '<h1>成績分析</h1>' +
      '<div class="kpis" style="margin-bottom:16px">' +
        kpi('累計作答', o.total, '答對 ' + o.c + '・答錯 ' + o.w) +
        kpi('整體正答率', o.total ? pct(o.c, o.total) + '%' : '—', '已練 ' + o.seen + '/' + QS.length + ' 題') +
        kpi('模擬考', ex.length + ' 次', '及格 ' + passN + ' 次') +
        kpi('平均／最高', ex.length ? fmtScore(avg) + '／' + fmtScore(best) : '—', '及格標準 ' + EXAM.pass + ' 分') +
      '</div>';

    html += '<section class="card"><div class="card-title"><h2>模擬考成績走勢</h2><span class="small muted">最近 ' + Math.min(ex.length, 20) + ' 次</span></div>' +
      (ex.length ? lineChart(ex.slice(-20)) : '<p class="muted">完成第一次模擬考後，這裡會顯示分數走勢。</p>') + '</section>';

    html += '<section class="card"><div class="card-title"><h2>各單元正答率</h2><span class="small muted">含練習與模擬考</span></div>' +
      '<div class="bars">' + catRows.map(function (r) {
        var tip = esc(r.c.name) + '：' + (r.acc === null ? '尚未作答' : '正答率 ' + Math.round(r.acc * 100) + '%，作答 ' + r.att + ' 次') + '，已練 ' + r.seen + '/' + r.total + ' 題';
        return '<div class="bar-row' + (r.acc === null ? ' none' : '') + '" data-tip="' + tip + '">' +
          '<span class="name">' + esc(r.c.name) + '</span>' +
          '<span class="track"><span class="fill" style="width:' + (r.acc === null ? 0 : Math.max(r.acc * 100, 1)) + '%"></span></span>' +
          '<span class="val">' + (r.acc === null ? '—' : Math.round(r.acc * 100) + '%') + '<small>' + r.seen + '/' + r.total + ' 題</small></span></div>';
      }).join('') + '</div></section>';

    html += '<section class="card"><h2>學習建議</h2><ul class="plain">';
    if (!o.total) html += '<li>尚無作答資料，建議先從「題庫練習」開始，每個單元各練一輪。</li>';
    weak.forEach(function (r) {
      html += '<li><strong>' + esc(r.c.name) + '</strong> 正答率 ' + Math.round(r.acc * 100) + '%，建議加強。' +
        '<button class="btn btn-sm" style="margin-left:6px" data-act="practice-cat" data-v="' + r.c.id + '">練習此單元</button></li>';
    });
    if (untouched.length && o.total) html += '<li>尚未練習的單元：' + untouched.map(function (r) { return esc(r.c.name); }).join('、') + '。</li>';
    if (wrongIds().length) html += '<li>錯題本中還有 ' + wrongIds().length + ' 題，<a href="#/wrong">前往複習</a>。</li>';
    if (ex.length && avg < EXAM.pass) html += '<li>模擬考平均 ' + fmtScore(avg) + ' 分，尚未達及格標準，建議先加強弱點單元再應考。</li>';
    if (ex.length >= 3 && scores.slice(-3).every(function (s) { return s >= 80; })) html += '<li>最近三次模擬考皆達 80 分以上，狀態良好，保持練習！</li>';
    if (o.total && !weak.length && !untouched.length) html += '<li>各單元表現均衡，可多做模擬考維持手感。</li>';
    html += '</ul></section>';

    if (ex.length) html += '<section class="card"><h2>模擬考紀錄</h2>' + examTable(ex.slice().reverse()) + '</section>';
    return html;
  }

  function lineChart(list) {
    // 依容器寬度決定畫布寬，讓手機上文字維持可讀大小
    var W = Math.max(300, Math.min(640, app.clientWidth - 36)), H = 240, L = 36, R = 16, T = 16, B = 30;
    var iw = W - L - R, ih = H - T - B;
    var n = list.length;
    function x(i) { return L + (n === 1 ? iw / 2 : i * iw / (n - 1)); }
    function y(v) { return T + ih - v / 100 * ih; }
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="模擬考成績走勢圖">';
    [0, 20, 40, 60, 80, 100].forEach(function (v) {
      s += '<line class="grid-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    });
    s += '<line class="pass-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(EXAM.pass) + '" y2="' + y(EXAM.pass) + '"/>' +
      '<text class="pass-label" x="' + (W - R) + '" y="' + (y(EXAM.pass) - 5) + '" text-anchor="end">及格 ' + EXAM.pass + '</text>';
    var pts = list.map(function (e, i) { return x(i) + ',' + y(e.score); });
    if (n > 1) {
      s += '<path class="series-area" d="M' + x(0) + ',' + y(0) + ' L' + pts.join(' L') + ' L' + x(n - 1) + ',' + y(0) + ' Z"/>';
      s += '<polyline class="series-line" points="' + pts.join(' ') + '"/>';
    }
    var step = Math.ceil(n / 8);
    list.forEach(function (e, i) {
      if (i % step === 0 || i === n - 1) {
        s += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtShortDate(e.at) + '</text>';
      }
    });
    list.forEach(function (e, i) {
      var tip = fmtDate(e.at) + '｜' + fmtScore(e.score) + ' 分（' + (e.score >= EXAM.pass ? '及格' : '未及格') + '）';
      s += '<circle class="hit" cx="' + x(i) + '" cy="' + y(e.score) + '" r="14" data-tip="' + esc(tip) + '" data-href="#/result/' + e.id + '"/>' +
        '<circle class="dot' + (e.score >= EXAM.pass ? '' : ' fail') + '" cx="' + x(i) + '" cy="' + y(e.score) + '" r="4.5" pointer-events="none"/>';
    });
    var lastE = list[n - 1];
    s += '<text x="' + Math.min(x(n - 1), W - R) + '" y="' + (y(lastE.score) - 10) + '" text-anchor="' + (n === 1 ? 'middle' : 'end') + '" style="fill:var(--text);font-weight:600">' + fmtScore(lastE.score) + '</text>';
    s += '</svg><p class="small muted">實心點為及格、空心點為未及格；點擊圓點可開啟該次成績。</p>';
    return s;
  }

  /* ───────── 設定 ───────── */
  function viewSettings() {
    var st = db.settings;
    return '<h1>設定</h1>' +
      '<section class="card">' +
        '<div class="setting"><div><div>選項順序隨機排列</div><div class="desc">避免背答案位置，練習與模擬考皆適用。</div></div>' +
          seg('shuffle', st.shuffle ? 1 : 0, [[1, '開'], [0, '關']]) + '</div>' +
        '<div class="setting"><div><div>錯題自動移出</div><div class="desc">錯題連續答對幾次後自動移出錯題本。</div></div>' +
          seg('autoRemove', st.autoRemove, [[1, '1 次'], [2, '2 次'], [3, '3 次'], [0, '不移出']]) + '</div>' +
        '<div class="setting"><div><div>外觀</div><div class="desc">跟隨系統或固定淺色／深色。</div></div>' +
          seg('theme', st.theme, [['auto', '系統'], ['light', '淺色'], ['dark', '深色']]) + '</div>' +
      '</section>' +
      '<section class="card"><h2>資料管理</h2>' +
        '<p class="small muted">作答紀錄僅存在此瀏覽器。更換裝置或清除瀏覽器資料前，請先匯出備份。</p>' +
        '<div class="btn-row"><button class="btn" data-act="export">匯出備份（JSON）</button>' +
        '<label class="btn">匯入備份<input type="file" accept="application/json,.json" data-act="import" hidden></label>' +
        '<button class="btn btn-danger" data-act="reset">清除所有紀錄</button></div>' +
      '</section>' +
      '<section class="card"><h2>關於</h2>' +
        '<p class="small">題庫共 ' + QS.length + ' 題，依丙級會計事務學科範圍編寫。題目內容如有疑義，歡迎與方圓會計師事務所聯繫。</p>' +
        '<p class="small muted">※ 本頁內容僅供參考，實際申報以主管機關核定為準</p>' +
      '</section>';
  }
  function applyTheme() {
    var t = db.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function exportData() {
    var blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = '丙級會計練習紀錄-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var d = JSON.parse(reader.result);
        if (!d || typeof d !== 'object' || !d.stats || !Array.isArray(d.exams)) throw new Error('格式不符');
        if (!confirm('匯入將覆蓋目前所有紀錄，確定嗎？')) return;
        localStorage.setItem(KEY, JSON.stringify(d));
        db = load();
        applyTheme();
        toast('匯入完成');
        rerender();
      } catch (e) { toast('匯入失敗：檔案格式不正確'); }
    };
    reader.readAsText(file);
  }

  /* ───────── Events ───────── */
  document.addEventListener('click', function (ev) {
    var hrefEl = ev.target.closest('[data-href]');
    if (hrefEl) { go(hrefEl.getAttribute('data-href')); return; }
    var el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var act = el.getAttribute('data-act');
    var v = el.getAttribute('data-v');
    var ps = db.pset;
    switch (act) {
      /* practice setup */
      case 'cat':
        var i = ps.cats.indexOf(v);
        if (i >= 0) ps.cats.splice(i, 1); else ps.cats.push(v);
        save(); rerender(); break;
      case 'cat-all': ps.cats = CATS.map(function (c) { return c.id; }); save(); rerender(); break;
      case 'cat-none': ps.cats = []; save(); rerender(); break;
      case 'pset':
        var k = el.getAttribute('data-k');
        if (k === 'rfilter') { resultFilter = v; rerender(); break; }
        if (k === 'shuffle') { db.settings.shuffle = v === '1'; save(); rerender(); break; }
        if (k === 'autoRemove') { db.settings.autoRemove = Number(v); save(); rerender(); break; }
        if (k === 'theme') { db.settings.theme = v; applyTheme(); save(); rerender(); break; }
        ps[k] = k === 'count' ? Number(v) : v;
        save(); rerender(); break;
      case 'start-practice':
        var pool = filterPool(ps);
        if (ps.order === 'random') pool = shuffle(pool);
        if (ps.count) pool = pool.slice(0, ps.count);
        startQuiz(pool.map(function (q) { return q.id; }), '題庫練習', 'practice');
        break;
      case 'practice-cat':
        startQuiz(shuffle(QS.filter(function (q) { return q.cat === v; })).slice(0, 20).map(function (q) { return q.id; }),
          CATMAP[v].name + ' 加強練習', 'practice');
        break;

      /* quiz */
      case 'pick':
        var q = QMAP[quiz.ids[quiz.i]];
        var n = Number(v);
        if (q.type === 'single') { answerQuiz([n]); break; }
        var p = quiz.pending.indexOf(n);
        if (p >= 0) quiz.pending.splice(p, 1); else quiz.pending.push(n);
        rerender(); break;
      case 'confirm': if (quiz.pending.length) answerQuiz(quiz.pending); break;
      case 'next': moveQuiz(1); break;
      case 'prev': moveQuiz(-1); break;
      case 'mark':
        var mid = quiz.ids[quiz.i];
        if (db.marks[mid]) { delete db.marks[mid]; toast('已取消收藏'); } else { db.marks[mid] = Date.now(); toast('已收藏，可在練習範圍選「已收藏」'); }
        save(); rerender(); break;
      case 'quit-quiz':
        if (!Object.keys(quiz.ans).length) { quiz = null; go('#/practice'); break; }
        quiz.done = true; render(); break;
      case 'retry-bad':
        startQuiz(shuffle(Object.keys(quiz.ans).filter(function (id) { return !quiz.ans[id].ok; })), '本次錯題重練', quiz.source);
        break;

      /* exam */
      case 'start-exam':
        if (db.draft && !confirm('目前有未完成的模擬考，要放棄並重新開始嗎？')) break;
        startExam(); break;
      case 'discard-draft':
        if (confirm('確定放棄這份未完成的模擬考？作答內容不會計分。')) { db.draft = null; save(); rerender(); }
        break;
      case 'exam-pick':
        var d = db.draft, eid = d.ids[d.i], eq = QMAP[eid], en = Number(v);
        var cur = (d.sel[eid] || []).slice();
        if (eq.type === 'single') cur = cur[0] === en ? [] : [en];
        else { var ix = cur.indexOf(en); if (ix >= 0) cur.splice(ix, 1); else cur.push(en); }
        d.sel[eid] = cur;
        save(); rerender(); break;
      case 'exam-move':
        db.draft.i = Math.max(0, Math.min(db.draft.ids.length - 1, db.draft.i + Number(v)));
        save(); render(); break;
      case 'exam-jump':
        db.draft.i = Number(v); examNavOpen = false; save(); render(); break;
      case 'flag':
        var fid = db.draft.ids[db.draft.i];
        if (db.draft.flags[fid]) delete db.draft.flags[fid]; else db.draft.flags[fid] = 1;
        save(); rerender(); break;
      case 'toggle-nav': examNavOpen = !examNavOpen; rerender(); break;
      case 'submit-exam':
        var dd = db.draft;
        var blank = dd.ids.filter(function (x) { return !(dd.sel[x] || []).length; }).length;
        var flagged = Object.keys(dd.flags).length;
        var msg = '確定要交卷嗎？' + (blank ? '\n尚有 ' + blank + ' 題未作答。' : '') + (flagged ? '\n有 ' + flagged + ' 題標記待檢查。' : '');
        if (confirm(msg)) finishExam(false);
        break;
      case 'jump-review':
        resultFilter = 'all'; rerender();
        var target = document.getElementById('rv-' + v);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case 'retry-exam-wrong':
        var ex = db.exams.filter(function (x) { return x.id === v; })[0];
        if (ex) startQuiz(shuffle(ex.items.filter(function (it) { return QMAP[it.id] && !isCorrect(QMAP[it.id], it.s); }).map(function (it) { return it.id; })), '模擬考錯題重練', 'practice');
        break;

      /* wrong book */
      case 'practice-wrong':
        var wl = wrongIds().filter(function (id) { return wbFilter === 'all' || QMAP[id].cat === wbFilter; });
        startQuiz(shuffle(wl), '錯題練習', 'wrong'); break;
      case 'wb-remove': delete db.wrong[v]; save(); toast('已移出錯題本'); rerender(); break;
      case 'clear-wrong':
        if (confirm('確定清空錯題本？此動作無法復原。')) { db.wrong = {}; save(); rerender(); }
        break;

      /* settings */
      case 'export': exportData(); break;
      case 'reset':
        if (confirm('確定清除所有作答紀錄、錯題本、收藏與模擬考成績？此動作無法復原。')) {
          var keep = db.settings;
          db = defaults(); db.settings = keep; save(); toast('已清除所有紀錄'); rerender();
        }
        break;
    }
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target;
    var act = el.getAttribute && el.getAttribute('data-act');
    if (act === 'wb-filter') { wbFilter = el.value; rerender(); }
    if (act === 'import' && el.files && el.files[0]) { importData(el.files[0]); el.value = ''; }
  });

  // 鍵盤快捷鍵（練習與模擬考）
  document.addEventListener('keydown', function (ev) {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    var tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    var r = parseHash().name;
    var key = ev.key;
    var num = '1234'.indexOf(key);
    if (num < 0) num = 'abcd'.indexOf(key.toLowerCase());
    function clickOpt(i) {
      var btns = app.querySelectorAll('.opt');
      if (btns[i] && !btns[i].disabled) btns[i].click();
    }
    if (r === 'quiz' && quiz && !quiz.done) {
      if (num >= 0) { clickOpt(num); ev.preventDefault(); }
      else if (key === 'Enter') {
        var b = app.querySelector('[data-act="confirm"]:not(:disabled), [data-act="next"]:not(:disabled)');
        if (b) { b.click(); ev.preventDefault(); }
      }
      else if (key === 'ArrowRight' && quiz.ans[quiz.ids[quiz.i]]) moveQuiz(1);
      else if (key === 'ArrowLeft') moveQuiz(-1);
    } else if (r === 'examrun' && db.draft) {
      if (num >= 0) { clickOpt(num); ev.preventDefault(); }
      else if (key === 'ArrowRight' || key === 'ArrowLeft') {
        var dir = key === 'ArrowRight' ? 1 : -1;
        db.draft.i = Math.max(0, Math.min(db.draft.ids.length - 1, db.draft.i + dir));
        save(); render();
      }
    }
  });

  /* ───────── Tooltip ───────── */
  var tipEl = document.getElementById('tooltip');
  function showTip(text, x, y) {
    tipEl.textContent = text;
    tipEl.hidden = false;
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
    var top = y - h - 12;
    if (top < 8) top = y + 16;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }
  document.addEventListener('pointermove', function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-tip]');
    if (t) showTip(t.getAttribute('data-tip'), ev.clientX, ev.clientY);
    else hideTip();
  });
  document.addEventListener('scroll', hideTip, { passive: true });

  /* ───────── Boot ───────── */
  applyTheme();
  window.addEventListener('storage', function (ev) { if (ev.key === KEY) { db = load(); rerender(); } });
  if (!location.hash) history.replaceState(null, '', '#/home');
  render();
})();
