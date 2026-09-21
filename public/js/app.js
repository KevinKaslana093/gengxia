/* 「梗一下」前端应用：路由 + 首页 + 生成 + 游戏 + 结算 + 分享编辑。
 * 无框架、无构建步骤；所有用户内容通过 textContent 渲染，绝不注入 HTML。 */
'use strict';

(function () {

  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const EDIT_KEY = 'gengxia:editTokens';
  const MUTE_KEY = 'gengxia:muted';

  /* ---------------- 通用 ---------------- */
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return n;
  }

  let toastTimer = 0;
  function toast(msg, kind, ms) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = 'toast' + (kind ? ' ' + kind : ''); }, ms || 2600);
  }

  function loadTokens() {
    try { return JSON.parse(localStorage.getItem(EDIT_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveToken(id, token) {
    try {
      const t = loadTokens();
      t[id] = token;
      localStorage.setItem(EDIT_KEY, JSON.stringify(t));
    } catch (e) {}
  }
  function getToken(id) { return loadTokens()[id] || null; }

  function isMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }
  function setMuted(m) {
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) {}
  }

  /* 生成阶段 → 用户可见文案（服务端真实阶段，不伪造进度；避免内部术语） */
  const STAGE_LABELS = {
    'preparing': '正在读你的故事',
    'calling_model': '正在设计你的游戏',
    'validating': '正在准备关卡',
    'repairing': '正在打磨文案细节',
    'saving': '快要好了',
    'done': '完成',
  };

  /* 首页示例：与 12 套场景的示例故事同源（见 shared/scenes.js）。
   * 每个示例都能一键「填入」或直接「试玩」对应预设。 */
  const EXAMPLES = [
    { label: '职场吐槽', story: '老板一天改五遍需求，我们组五个人改到凌晨两点，就为了他一句“这里再小改一下”。第二天早上九点，他问：进度呢？', preset: 'demo-genggao' },
    { label: '宿舍早八', story: '我们宿舍四个人都起不来床，早八的课设了七个闹钟还是迟到，最后是宿管阿姨敲门才把大家叫起来。', preset: 'demo-zaoba' },
    { label: '猫的夜生活', story: '我的猫每天凌晨三点开演唱会，我拿着猫条追它，它躲开拖鞋还要把水杯推下桌。', preset: 'demo-mao' },
  ];

  /* 玩法选项（自动匹配 + 三种具体玩法） */
  const MODE_OPTIONS = [
    { id: 'auto', label: '自动匹配', desc: '交给它挑一个最合适的玩法' },
    { id: 'dodge', label: '躲避收集', desc: '接住奖励，躲开障碍，坚持到结束' },
    { id: 'runner', label: '三路跑酷', desc: '在三条跑道间切换，一路冲过去' },
    { id: 'click', label: '限时点击', desc: '点掉该点的，别碰不该碰的' },
  ];

  /* 是否触摸优先设备（无 hover + 粗指针）。首页与游戏页共用。
   * 用于只显示适合当前设备的操作提示：手机上不显示"Ctrl/⌘ + Enter"这类键盘提示。 */
  const TOUCH_ONLY = (function () {
    return !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  })();

  /* ---------------- 路由 ---------------- */
  function navigate(path) {
    history.pushState({}, '', path);
    render();
  }
  window.addEventListener('popstate', render);

  let cleanupCurrent = null;

  function render() {
    if (cleanupCurrent) { try { cleanupCurrent(); } catch (e) {} cleanupCurrent = null; }
    const path = location.pathname;
    /* 静态托管（GitHub Pages 等）会带 .html 后缀或尾斜杠，这里一并容忍，
     * 使同一套路由在动态与静态部署下都能工作。 */
    const cleaned = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
    const m = /^\/g\/([A-Za-z0-9_-]{4,32})$/.exec(cleaned);
    if (m) return renderPlay(m[1]);
    if (cleaned === '/' || cleaned === '/index') return renderHome();
    return renderNotFound('页面不存在', '检查一下地址，或者回到首页重新开始。');
  }

  function topbar(opts) {
    const o = opts || {};
    const children = [
      el('a', { class: 'brand', href: '/', onclick: function (e) { e.preventDefault(); navigate('/'); } }, [
        el('span', { class: 'brand-mark', text: '梗' }),
        el('span', { text: '梗一下' }),
      ]),
      el('span', { class: 'spacer' }),
    ];
    if (o.actions) o.actions.forEach(function (a) { children.push(a); });
    return el('header', { class: 'topbar' }, children);
  }

  /* ================= 首页 ================= */
  function renderHome() {
    document.title = '梗一下 — 把你的梗变成一个小游戏';

    const ta = el('textarea', {
      id: 'story-input',
      maxlength: '1200',
      placeholder: '写下你的梗或故事，比如：老板一天改五遍需求，我们改到凌晨两点……',
      'aria-label': '输入你的故事或梗',
    });
    const counter = el('span', { class: 'counter', text: '0 / 1000' });
    const errBox = el('div', { class: 'err-text', style: 'margin-top:8px;display:none;' });
    const submitBtn = el('button', { class: 'btn btn-primary btn-lg', text: '做一个我的游戏' });
    const modeRow = el('div', { class: 'mode-row' });

    /* 当前选中的玩法（默认自动匹配） */
    let selectedMode = 'auto';
    MODE_OPTIONS.forEach(function (mo) {
      const b = el('button', {
        class: 'mode-chip' + (mo.id === 'auto' ? ' on' : ''), type: 'button',
        title: mo.desc, text: mo.label,
        onclick: function () {
          selectedMode = mo.id;
          Array.from(modeRow.children).forEach(function (c) { c.className = 'mode-chip'; });
          b.className = 'mode-chip on';
        },
      });
      modeRow.appendChild(b);
    });

    function updateCounter() {
      const n = [...ta.value].length;
      counter.textContent = n + ' / 1000';
      counter.className = 'counter' + (n > 1000 ? ' bad' : (n > 850 ? ' warn' : ''));
    }
    ta.addEventListener('input', function () { updateCounter(); errBox.style.display = 'none'; });
    updateCounter();

    function submit() {
      const val = ta.value.trim();
      const n = [...val].length;
      if (n < 10) { errBox.textContent = '故事太短了：至少 10 字，当前 ' + n + ' 字。多写一句更能生成贴合的关卡。'; errBox.style.display = 'block'; ta.focus(); return; }
      if (n > 1000) { errBox.textContent = '故事太长了：最多 1000 字，当前 ' + n + ' 字。'; errBox.style.display = 'block'; return; }
      startGeneration(val, selectedMode);
    }
    submitBtn.addEventListener('click', submit);
    ta.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
    });

    /* 示例：分「填入这个故事」与「直接玩」两个动作 */
    const chips = el('div', { class: 'chips' });
    EXAMPLES.forEach(function (ex) {
      const fill = el('button', {
        class: 'chip', type: 'button', title: '把这段故事填进输入框，可以自己改',
        text: '试试：' + ex.label,
        onclick: function () { ta.value = ex.story; updateCounter(); errBox.style.display = 'none'; ta.focus(); },
      });
      chips.appendChild(fill);
    });

    const compose = el('div', { class: 'compose card' }, [
      ta,
      el('div', { class: 'mode-line' }, [
        el('span', { class: 'mode-label', text: '玩法' }),
        modeRow,
      ]),
      el('div', { class: 'compose-foot' }, [
        counter,
        el('span', { class: 'spacer', style: 'flex:1' }),
        el('span', { class: 'hint', text: '10–1000 字' + (TOUCH_ONLY ? '' : ' · Ctrl/⌘ + Enter 生成') }),
        submitBtn,
      ]),
      errBox,
      el('div', { class: 'example-line' }, [
        el('span', { class: 'hint', text: '没有思路？' }),
        chips,
      ]),
    ]);

    /* ---- 一键试玩卡：把成品放前面，让人立刻知道能玩到什么 ---- */
    const playNow = el('div', { class: 'play-now' });
    const galGrid = el('div', { class: 'gal-grid' });
    const gallerySection = el('section', { class: 'gallery' }, [
      el('h2', { class: 'section-title' }, [document.createTextNode('先玩一个'), el('small', { text: '点开就能玩，不用等生成' })]),
      playNow,
      galGrid,
    ]);

    /* 三个代表作：覆盖三种玩法，各自能一眼看懂玩法是什么 */
    const showcaseIds = ['demo-genggao', 'demo-zaoba', 'demo-naicha'];
    const cache = {};

    function presetCard(item) {
      const sc = GengTheme.getScenePalette ? GengTheme.getScenePalette(item.sceneId) : GengTheme.getTheme(item.themeId);
      const art = el('div', { class: 'gal-art', style: 'background:linear-gradient(160deg,' + sc.bg[0] + ',' + sc.bg[1] + ')' });
      try {
        /* 场景背景微缩图 + 主角/奖励/障碍三个素材 */
        const bg = document.createElement('canvas');
        bg.width = 220; bg.height = 130;
        const bx = bg.getContext('2d');
        const gg = bx.createLinearGradient(0, 0, 0, 130);
        gg.addColorStop(0, sc.bg[0]); gg.addColorStop(0.55, sc.bg[1]); gg.addColorStop(1, sc.bg[2]);
        bx.fillStyle = gg; bx.fillRect(0, 0, 220, 130);
        if (GengTheme.drawSceneBackground) {
          try { GengTheme.drawSceneBackground(bx, item.sceneId, 220, 130, sc, 0.6); } catch (e) {}
        }
        art.appendChild(bg);
        const row = el('div', { class: 'gal-icons' });
        [['player', item.avatarId], ['collectible', item.collectibleSpriteId], ['obstacle', item.obstacleSpriteId]].forEach(function (pair) {
          const c = document.createElement('canvas');
          c.width = 54; c.height = 54;
          const cx = c.getContext('2d');
          cx.translate(27, 27);
          if (pair[0] === 'player') GengTheme.drawAvatar(cx, pair[1], 15, 0);
          else if (pair[0] === 'collectible') GengTheme.drawCollectible(cx, pair[1], 13, sc);
          else GengTheme.drawObstacle(cx, pair[1], 12, sc);
          row.appendChild(c);
        });
        art.appendChild(row);
      } catch (e) {}
      return el('button', {
        class: 'gal-card', type: 'button',
        onclick: function () { navigate('/g/' + item.id); },
      }, [
        art,
        el('div', { class: 'gal-body' }, [
          el('h3', { text: item.title }),
          el('p', { text: item.ruleText || item.intro }),
          el('div', { class: 'gal-foot' }, [
            el('span', { class: 'pill', text: item.modeLabel || '躲避收集' }),
            el('span', { class: 'pill', text: '点击开玩' }),
          ]),
        ]),
      ]);
    }

    GengApi.gallery().then(function (data) {
      const items = data.presets || data.items || [];
      items.forEach(function (item) { cache[item.id] = item; });
      playNow.innerHTML = '';
      showcaseIds.forEach(function (id) {
        if (cache[id]) playNow.appendChild(presetCard(cache[id]));
      });
      galGrid.innerHTML = '';
      const rest = items.filter(function (i) { return showcaseIds.indexOf(i.id) === -1; });
      rest.forEach(function (item) { galGrid.appendChild(presetCard(item)); });
      const recent = (data.recent || []).filter(function (i) { return !cache[i.id]; });
      if (recent.length) {
        galGrid.appendChild(el('div', { class: 'section-sub', text: '最近生成的' }));
        recent.forEach(function (item) { galGrid.appendChild(presetCard(item)); });
      }
    }).catch(function (e) {
      galGrid.innerHTML = '';
      galGrid.appendChild(el('div', { class: 'err-text', text: '预设游戏加载失败：' + (e.message || '网络异常') }));
    });

    const hero = el('section', { class: 'hero' }, [
      el('h1', { text: '把你的梗，变成能玩的小游戏' }),
      el('p', { class: 'sub', text: '写一句吐槽或一段故事，几十秒生成一个能玩、能分享的小游戏。' }),
    ]);

    const frag = document.createDocumentFragment();
    frag.appendChild(topbar({ actions: [
      el('button', { class: 'btn btn-sm btn-ghost', text: '怎么玩？', onclick: function () { document.querySelector('.gallery').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }),
    ] }));
    frag.appendChild(el('main', { class: 'home-main wrap' }, [
      hero,
      compose,
      gallerySection,
      el('footer', { class: 'site-foot' }, [
        el('div', { text: '梗一下 · 输入一个梗 → 玩一局 → 分享给朋友。' }),
        el('div', { style: 'margin-top:6px', text: '拿着链接的人都可以打开游玩，请不要把包含隐私或敏感内容的故事拿去公开分享。' }),
      ]),
    ]));
    app.innerHTML = '';
    app.appendChild(frag);
    ta.focus();
  }

  /* ================= 生成中 ================= */
  function startGeneration(story, mode) {
    document.title = '生成中… — 梗一下';
    const stepsOrder = ['preparing', 'calling_model', 'validating', 'saving'];
    const stepEls = {};
    const list = el('ul', { class: 'steps' });
    stepsOrder.forEach(function (s) {
      const dot = el('span', { class: 'dot', text: '·' });
      const row = el('li', { class: 'step' }, [dot, el('span', { text: STAGE_LABELS[s] })]);
      stepEls[s] = row;
      list.appendChild(row);
    });

    const note = el('p', { class: 'hint gen-note', text: '真实进度取决于模型响应，一般 10–40 秒。请不要重复提交。' });
    const cancelBtn = el('button', { class: 'btn btn-sm', text: '取消' });
    const retryWrap = el('div');

    const card = el('div', { class: 'gen-card card' }, [
      el('h2', { text: '正在设计你的游戏' }),
      el('p', { class: 'hint', text: '正在读你的故事，把它变成关卡内容。' }),
      list,
      el('div', { class: 'bar-track' }, [el('div', { class: 'bar-indet' })]),
      note,
      retryWrap,
      el('div', { class: 'row', style: 'margin-top:16px' }, [cancelBtn]),
    ]);

    app.innerHTML = '';
    app.appendChild(topbar({}));
    app.appendChild(el('main', { class: 'gen-main' }, [card]));

    function markStage(stage) {
      const idx = stepsOrder.indexOf(stage);
      stepsOrder.forEach(function (s, i) {
        const row = stepEls[s];
        row.className = 'step';
        if (stage === 'done' || (idx > -1 && i < idx)) row.className = 'step done';
        else if (idx > -1 && i === idx) row.className = 'step active';
        else if (stage === 'repairing' && i === 2) row.className = 'step active';
      });
      if (stage === 'repairing') {
        stepEls.validating.className = 'step active';
        stepEls.validating.querySelector('span:last-child').textContent = STAGE_LABELS.repairing;
      }
      if (stage === 'done') list.querySelectorAll('.step').forEach(function (r) { r.className = 'step done'; });
    }
    markStage('preparing');

    const ctrl = new AbortController();
    let cancelled = false;
    cancelBtn.addEventListener('click', function () {
      cancelled = true;
      try { ctrl.abort(); } catch (e) {}
      toast('已取消本次生成');
      navigate('/');
    });

    GengApi.createGame(story, {
      signal: ctrl.signal,
      mode: mode || 'auto',
      onStage: function (s) { markStage(s); },
    }).then(function (result) {
      if (cancelled) return;
      markStage('done');
      if (result.editToken) saveToken(result.id, result.editToken);
      setTimeout(function () { if (!cancelled) navigate('/g/' + result.id + (result.editToken ? '?new=1' : '')); }, 420);
    }).catch(function (e) {
      if (cancelled) return;
      renderGenError(e, story, mode);
    });
  }

  function renderGenError(e, story, mode) {
    const code = (e && e.code) || 'server_error';
    const message = (e && e.message) || '生成失败，请重试';
    const canRetrySame = code !== 'bad_story' && code !== 'too_large';

    const btns = [];
    if (canRetrySame) {
      btns.push(el('button', { class: 'btn btn-primary', text: '重试', onclick: function () { startGeneration(story, mode); } }));
    }
    btns.push(el('button', { class: 'btn', text: '换个说法再试', onclick: function () { navigate('/'); } }));
    btns.push(el('button', { class: 'btn btn-ghost', text: '先玩预设游戏', onclick: function () { navigate('/'); } }));

    const card = el('div', { class: 'gen-card card' }, [
      el('div', { class: 'error-box' }, [
        el('h3', { text: '生成没有成功' }),
        el('p', { text: message }),
        code === 'bad_story' ? null : el('p', { class: 'hint', text: '错误代码：' + code + '。失败不会消耗你的故事，也不会产生"看起来成功"的假游戏。' }),
      ]),
      el('div', { class: 'row', style: 'margin-top:16px' }, btns),
    ]);
    app.innerHTML = '';
    app.appendChild(topbar({}));
    app.appendChild(el('main', { class: 'gen-main' }, [card]));
  }

  /* ================= 游戏页 ================= */
  function renderPlay(id) {
    document.title = '加载游戏… — 梗一下';
    app.innerHTML = '';
    app.appendChild(topbar({}));
    const loading = el('main', { class: 'gen-main' }, [
      el('div', { class: 'gen-card card' }, [el('h2', { text: '正在加载游戏…' }), el('p', { class: 'hint', text: ' ' })]),
    ]);
    app.appendChild(loading);

    GengApi.getGame(id).then(function (data) {
      mountGame(data);
    }).catch(function (e) {
      app.innerHTML = '';
      app.appendChild(topbar({}));
      app.appendChild(renderNotFound(
        e && e.code === 'not_found' ? '这个游戏不存在' : '加载失败',
        e && e.code === 'not_found'
          ? '链接可能拼错了，或者游戏已被删除。'
          : ((e && e.message) || '网络异常，请检查网络后刷新重试。'),
        e && e.code === 'not_found'
      ));
    });
  }

  function mountGame(data) {
    const cfg = data.config;
    const gid = data.id;
    const fromCreate = /[?&]new=1/.test(location.search);
    const mode = data.mode || cfg.mode || 'dodge';
    const sceneDef = GengTheme.getSceneDef ? GengTheme.getSceneDef(cfg.sceneId) : null;
    const theme = (GengTheme.getScenePalette && cfg.sceneId)
      ? GengTheme.getScenePalette(cfg.sceneId)
      : GengTheme.getTheme(cfg.themeId);
    const modeLabel = mode === 'runner' ? '三路跑酷' : (mode === 'click' ? '限时点击' : '躲避收集');
    const isCreator = !!getToken(gid);
    document.title = cfg.title + ' — 梗一下';

    /* 朋友挑战：URL 上的 ?c=<分数> 表示"发起人打了多少分"。
     * 明确属于朋友挑战数据，不是经过防作弊认证的排名；相同种子并不保证相同关卡序列，
     * 因此界面文案不承诺"同样的关卡"，只承诺"同一个游戏、比谁分高"。 */
    const challengeScore = (function () {
      const m = /[?&]c=(\d{1,7})/.exec(location.search);
      if (!m) return null;
      const v = parseInt(m[1], 10);
      return (isFinite(v) && v >= 0) ? v : null;
    })();

    /* 玩法时长（与引擎常量一致，用于倒计时显示与进度条） */
    const DURATION = (mode === 'click') ? (GengGame.CLICK_DURATION_MS || 35000)
      : (mode === 'runner' ? (GengGame.RUNNER_DURATION_MS || 45000) : (GengGame.DURATION_MS || 45000));

    /* ---- 顶部 ---- */
    const titleEl = el('h1', { text: cfg.title });
    const metaEl = el('div', { class: 'meta', text: cfg.intro });
    const ruleEl = el('div', { class: 'rule-line', text: cfg.ruleText || '' });

    /* ---- 舞台 ---- */
    const canvas = el('canvas', { id: 'game-canvas' });

    const scoreVal = el('span', { text: '0' });
    const scoreBlock = el('div', { class: 'hud-score' }, [scoreVal, el('small', { text: '分数' })]);
    const heartsWrap = el('div', { class: 'hud-lives' });
    const comboEl = el('div', { class: 'hud-combo' });
    const timerFill = el('div', { class: 'timer-fill' });
    const timeLeftEl = el('div', { class: 'hud-time', text: Math.ceil(DURATION / 1000) + 's' });

    const muteBtn = el('button', { class: 'hud-btn', text: isMuted() ? '🔇' : '🔊', 'aria-label': '音效开关' });
    const pauseBtn = el('button', { class: 'hud-btn', text: '❚❚', 'aria-label': '暂停' });

    const hud = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-top' }, [
        scoreBlock,
        el('span', { class: 'spacer', style: 'flex:1' }),
        timeLeftEl,
        heartsWrap,
        muteBtn,
        pauseBtn,
      ]),
      comboEl,
      el('div', { class: 'timer-track' }, [timerFill]),
    ]);

    const overlayHost = el('div', { class: 'overlay-host' });
    const stage = el('div', { class: 'stage mode-' + mode }, [canvas, hud, overlayHost]);

    const frag = document.createDocumentFragment();
    frag.appendChild(topbar({ actions: [
      el('button', { class: 'btn btn-sm', text: '分享', onclick: function () { doShare(); } }),
    ] }));
    frag.appendChild(el('main', { class: 'play-shell' }, [
      el('div', { class: 'play-top' }, [
        el('div', { class: 'title-wrap' }, [
          el('div', { class: 'title-row' }, [
            titleEl,
            el('span', { class: 'mode-badge mode-' + mode, text: modeLabel }),
            sceneDef ? el('span', { class: 'scene-badge', text: sceneDef.label }) : null,
          ]),
          metaEl,
          ruleEl,
        ]),
        isCreator ? el('button', { class: 'btn btn-sm', text: '编辑', onclick: function () { showEdit(); } }) : null,
      ]),
      stage,
    ]));
    app.innerHTML = '';
    app.appendChild(frag);

    heartsWrap.appendChild(el('span', { class: 'heart', text: '❤' }));
    heartsWrap.appendChild(el('span', { class: 'heart', text: '❤' }));
    heartsWrap.appendChild(el('span', { class: 'heart', text: '❤' }));

    let muted = isMuted();
    GengAudio.setMuted(muted);
    muteBtn.addEventListener('click', function () {
      muted = !muted; setMuted(muted); GengAudio.setMuted(muted);
      muteBtn.textContent = muted ? '🔇' : '🔊';
      if (!muted) { GengAudio.unlock(); GengAudio.click(); }
    });

    /* ---- 游戏实例：按玩法选择引擎（三种引擎统一生命周期与 hooks） ---- */
    let pendingResult = null;
    const game = GengModes.create(mode, canvas, cfg, {
      onScore: function (s) { scoreVal.textContent = s; },
      onLives: function (n) { renderHearts(n); },
      onCombo: function (n) {
        if (n >= 2) { comboEl.textContent = n + ' 连击'; comboEl.className = 'hud-combo on'; }
        else comboEl.className = 'hud-combo';
      },
      onState: function (s, extra) {
        if (s === 'paused') showPauseOverlay(extra && extra.reason);
        if (s === 'playing' || s === 'countdown') hideOverlay();
      },
      onEnd: function (r) { pendingResult = r; showResultOverlay(r); },
    });
    /* 调试入口：?debug=1 时把引擎实例挂到 window，便于排查与自动化测试（无敏感数据） */
    if (/[?&]debug=1/.test(location.search)) {
      window.__gengGame = game;
      window.__gengConfig = cfg;
    }
    cleanupCurrent = function () { game.destroy(); if (window.__gengGame === game) { delete window.__gengGame; delete window.__gengConfig; } };

    function renderHearts(n) {
      const hearts = heartsWrap.querySelectorAll('.heart');
      hearts.forEach(function (h, i) { h.className = 'heart' + (i < n ? '' : ' lost'); });
    }

    /* ---- 覆盖层 ---- */
    function setOverlay(node) {
      overlayHost.innerHTML = '';
      if (node) {
        overlayHost.appendChild(node);
        stage.classList.add('overlay-open');
      } else {
        stage.classList.remove('overlay-open');
      }
    }
    function hideOverlay() { overlayHost.innerHTML = ''; stage.classList.remove('overlay-open'); }

    function thumbCanvas(kind, spriteId, px) {
      const c = document.createElement('canvas');
      const size = px || 96;
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.translate(size / 2, size / 2);
      if (kind === 'player') GengTheme.drawAvatar(ctx, spriteId, size * 0.3, 0);
      else if (kind === 'obstacle') GengTheme.drawObstacle(ctx, spriteId, size * 0.21, theme);
      else GengTheme.drawCollectible(ctx, spriteId, size * 0.25, theme);
      return c;
    }

    /* ---- 开始页：按玩法给出对应的操作说明（只显示适合当前设备的提示） ---- */
    /* 是否触摸优先设备（无 hover + 粗指针）。模块级：首页与游戏页都要用。 */

    function controlHint() {
      if (mode === 'runner') {
        return TOUCH_ONLY
          ? '手机：左右滑动切换跑道。'
          : '电脑：← → 或 A D 切换跑道；手机：左右滑动。';
      }
      if (mode === 'click') {
        return TOUCH_ONLY ? '手机：直接点目标。' : '电脑：鼠标点击目标；手机：直接点。';
      }
      return TOUCH_ONLY
        ? '手机：在游戏区域左右拖动。'
        : '电脑：← → 或 A D 左右移动；手机：在游戏区域拖动。';
    }

    function ruleLineFor() {
      if (mode === 'runner') {
        return '切换跑道，冲过 ' + cfg.collectible.name + ' 得分，撞上 ' + cfg.obstacle.name + ' 扣 1 点生命。';
      }
      if (mode === 'click') {
        return '点掉 ' + cfg.obstacle.name + ' 得分，点到 ' + cfg.collectible.name + ' 扣 1 点生命。';
      }
      return '接取 ' + cfg.collectible.name + ' 得分，碰到 ' + cfg.obstacle.name + ' 扣 1 点生命。';
    }

    function durationSec() { return Math.round(DURATION / 1000); }

    function showStartOverlay() {
      const legend = el('div', { class: 'legend' }, [
        el('div', {}, [thumbCanvas('player', cfg.player.avatarId), el('span', { text: cfg.player.name })]),
        el('div', {}, [thumbCanvas('collectible', cfg.collectible.spriteId), el('span', { text: cfg.collectible.name })]),
        el('div', {}, [thumbCanvas('obstacle', cfg.obstacle.spriteId), el('span', { text: cfg.obstacle.name })]),
      ]);
      const overlay = el('div', { class: 'overlay' }, [
        el('h2', { text: cfg.title }),
        el('p', { class: 'intro-line', text: cfg.intro }),
        challengeScore !== null
          ? el('p', { class: 'challenge-banner' }, [
            el('b', { text: '朋友挑战' }),
            el('span', { text: '发起人打了 ' + challengeScore + ' 分，你来试试能不能超过。' }),
          ])
          : null,
        el('p', { class: 'rule-strong', text: ruleLineFor() }),
        legend,
        el('p', { class: 'rules' }, [
          el('span', { text: controlHint() }),
          document.createElement('br'),
          el('span', { text: '3 点生命 · ' + durationSec() + ' 秒 · 越往后越难' }),
        ]),
        el('button', { class: 'btn btn-primary btn-lg', text: '开始游戏', onclick: function () { startRound(); } }),
        el('div', { class: 'share-note', text: '持有链接的人都可以游玩这款游戏。' }),
      ]);
      setOverlay(overlay);
    }

    function escapeText(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    void escapeText;   /* 保留：外部模板可能用到，避免误删 */

    function startRound() {
      GengAudio.unlock();
      pendingResult = null;
      scoreVal.textContent = '0';
      renderHearts(GengGame.START_LIVES);
      comboEl.className = 'hud-combo';
      timerFill.style.width = '100%';
      timerFill.className = 'timer-fill';
      timeLeftEl.textContent = durationSec() + 's';
      timeLeftEl.className = 'hud-time';
      game.start();
    }

    function showPauseOverlay(reason) {
      const msg = reason === 'manual'
        ? '计时和场上的东西都停住了，不会因此多得分。'
        : (reason === 'not-visible'
          ? '当前页面不在前台，游戏先停住了。回到这个页面后点继续即可。'
          : '你切换到了别的窗口或标签页，游戏已自动暂停，回来点继续。');
      const overlay = el('div', { class: 'overlay' }, [
        el('h2', { text: '已暂停' }),
        el('p', { class: 'intro-line', text: msg }),
        el('button', { class: 'btn btn-primary btn-lg', text: '继续游戏', onclick: function () { GengAudio.unlock(); game.resume(); } }),
        el('button', { class: 'btn btn-sm btn-ghost', style: 'margin-top:10px', text: '重新开始', onclick: function () { startRound(); } }),
      ]);
      setOverlay(overlay);
    }

    function verdictFor(score) {
      const max = (typeof game.estimateMaxScore === 'function') ? game.estimateMaxScore() : 100;
      const ratio = max > 0 ? score / max : 0;
      if (ratio >= 0.65) return cfg.ending.high;
      if (ratio >= 0.35) return cfg.ending.mid;
      return cfg.ending.low;
    }

    function shareUrl() { return location.origin + '/g/' + gid; }

    /* 带挑战分数的分享链接：朋友点开会看到"发起人打了 N 分"。
     * 分数只放在查询串里，链接不含编辑凭据、不含原始故事。 */
    function challengeUrl(score) {
      return location.origin + '/g/' + gid + '?c=' + Math.max(0, Math.floor(score || 0));
    }

    function showResultOverlay(r) {
      /* 保证一局只结算一次（引擎已保证 ended 标记） */
      timerFill.style.width = (Math.max(0, game.timeLeftMs) / DURATION * 100) + '%';
      const statItems = mode === 'click'
        ? [
          el('div', {}, [el('b', { text: String(r.hits || 0) }), el('span', { text: '点掉 ' + cfg.obstacle.name })]),
          el('div', {}, [el('b', { text: String(r.misses || 0) }), el('span', { text: '漏掉的' })]),
          el('div', {}, [el('b', { text: String(r.bestCombo) }), el('span', { text: '最高连击' })]),
          el('div', {}, [el('b', { text: r.survivedSec + 's' }), el('span', { text: '坚持时间' })]),
        ]
        : [
          el('div', {}, [el('b', { text: String(r.collects) }), el('span', { text: '收集 ' + cfg.collectible.name })]),
          el('div', {}, [el('b', { text: String(r.bestCombo) }), el('span', { text: '最高连击' })]),
          el('div', {}, [el('b', { text: r.survivedSec + 's' }), el('span', { text: '坚持时间' })]),
          el('div', {}, [el('b', { text: String(r.lives) }), el('span', { text: '剩余生命' })]),
        ];

      const overlay = el('div', { class: 'overlay' }, [
        el('div', { class: 'result-label', text: r.reason === 'dead' ? '生命耗尽' : '时间到' }),
        el('div', { class: 'result-score', text: String(r.score) }),
        challengeScore !== null
          ? el('div', { class: 'challenge-result' }, [
            r.score > challengeScore
              ? el('b', { class: 'win', text: '超过了发起人的 ' + challengeScore + ' 分 🎉' })
              : (r.score === challengeScore
                ? el('b', { text: '和发起人打成平手（' + challengeScore + ' 分）' })
                : el('b', { text: '发起人 ' + challengeScore + ' 分，还差 ' + (challengeScore - r.score) + ' 分' })),
          ])
          : null,
        el('div', { class: 'ending-line', text: verdictFor(r.score) }),
        el('div', { class: 'stats' }, statItems),
        el('div', { class: 'row', style: 'justify-content:center' }, [
          el('button', { class: 'btn btn-primary', text: '再玩一次', onclick: function () { startRound(); } }),
          el('button', { class: 'btn btn-pink', text: '分享成绩卡', onclick: function () { showShareCard(r); } }),
          isCreator ? el('button', { class: 'btn', text: '编辑文案', onclick: function () { showEdit(); } }) : null,
          el('button', { class: 'btn btn-ghost', text: '我也做一个', onclick: function () { navigate('/'); } }),
        ]),
        el('div', { class: 'share-note', text: '分数只保存在你这一局，刷新就重置。' }),
      ]);
      setOverlay(overlay);
    }

    /* ---- 分享成绩卡：canvas 生成可下载图片（含二维码），带浏览器原生分享 ---- */
    function buildShareCard(r) {
      const W = 720, H = 1040;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const th = theme;

      /* 背景（场景配色渐变） */
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, th.bg[0]); g.addColorStop(0.5, th.bg[1]); g.addColorStop(1, th.bg[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      /* 场景装饰 */
      if (GengTheme.drawSceneBackground) {
        try { GengTheme.drawSceneBackground(ctx, cfg.sceneId, W, H, th, 0.5); } catch (e) {}
      }

      /* 卡片主体 */
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      GengTheme.roundRect(ctx, 48, 96, W - 96, H - 192, 28); ctx.fill();
      ctx.strokeStyle = th.accent; ctx.lineWidth = 2;
      GengTheme.roundRect(ctx, 48, 96, W - 96, H - 192, 28); ctx.stroke();

      ctx.textAlign = 'center';

      /* 卡片内边距：y 从 96 到 H-96。
       * 版式自上而下：品牌 → 标题 → 三个素材图标 → 分数 → 挑战语 → 结算评价 → 二维码 → 地址。
       * 每段都先算好占用高度再落笔，避免相互压字。 */
      const PAD = 96;
      const cardTop = PAD;
      const cardBottom = H - PAD;

      /* 产品名 */
      ctx.fillStyle = th.textDim;
      ctx.font = '600 26px system-ui, -apple-system, "PingFang SC", sans-serif';
      ctx.fillText('梗一下', W / 2, cardTop + 56);

      /* 游戏标题（自动缩字号以容纳长标题） */
      let titleSize = 54;
      ctx.font = '700 ' + titleSize + 'px system-ui, -apple-system, "PingFang SC", sans-serif';
      while (ctx.measureText(cfg.title).width > W - 160 && titleSize > 26) {
        titleSize -= 3;
        ctx.font = '700 ' + titleSize + 'px system-ui, -apple-system, "PingFang SC", sans-serif';
      }
      ctx.fillStyle = th.text;
      ctx.fillText(cfg.title, W / 2, cardTop + 132);

      /* 三个素材图标 */
      const iconY = cardTop + 242;
      const iconR = 40;
      [[cfg.player.avatarId, 'player'], [cfg.collectible.spriteId, 'collectible'], [cfg.obstacle.spriteId, 'obstacle']].forEach(function (pair, i) {
        const x = W / 2 + (i - 1) * 150;
        ctx.save();
        ctx.translate(x, iconY);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        GengTheme.circle(ctx, 0, 0, iconR + 12); ctx.fill();
        ctx.strokeStyle = (pair[1] === 'obstacle') ? th.obstacleTint : th.collectibleGlow;
        ctx.lineWidth = 3;
        GengTheme.circle(ctx, 0, 0, iconR + 12); ctx.stroke();
        if (pair[1] === 'player') GengTheme.drawAvatar(ctx, pair[0], 29, 0);
        else if (pair[1] === 'collectible') GengTheme.drawCollectible(ctx, pair[0], 25, th);
        else GengTheme.drawObstacle(ctx, pair[0], 23, th);
        ctx.restore();
      });

      /* 分数（数字与「分」各占一行，留足间隙） */
      const scoreBase = iconY + 172;
      ctx.fillStyle = th.accent;
      ctx.font = '800 96px system-ui, -apple-system, "PingFang SC", sans-serif';
      ctx.fillText(String(r.score), W / 2, scoreBase);

      /* 「分」 */
      ctx.fillStyle = th.textDim;
      ctx.font = '600 24px system-ui, -apple-system, "PingFang SC", sans-serif';
      ctx.fillText('分', W / 2, scoreBase + 44);

      /* 挑战语 */
      ctx.fillStyle = th.text;
      ctx.font = '700 30px system-ui, -apple-system, "PingFang SC", sans-serif';
      ctx.fillText('你能超过 ' + r.score + ' 分吗？', W / 2, scoreBase + 96);

      /* 结算评价：过长时**换行**（最多两行），而不是一路缩到看不清 */
      const verdict = verdictFor(r.score);
      let vSize = 23;
      ctx.font = '400 ' + vSize + 'px system-ui, -apple-system, "PingFang SC", sans-serif';
      while (ctx.measureText(verdict).width > W - 170 && vSize > 18) {
        vSize -= 2;
        ctx.font = '400 ' + vSize + 'px system-ui, -apple-system, "PingFang SC", sans-serif';
      }
      const maxW = W - 170;
      const vLines = [];
      if (ctx.measureText(verdict).width <= maxW) {
        vLines.push(verdict);
      } else {
        /* 按字符二分，尽量均匀地断成两行 */
        let cut = verdict.length;
        while (cut > 1 && ctx.measureText(verdict.slice(0, cut)).width > maxW) cut--;
        vLines.push(verdict.slice(0, cut));
        vLines.push(verdict.slice(cut));
      }
      ctx.fillStyle = th.textDim;
      const verdictTop = scoreBase + 132;
      vLines.forEach(function (ln, i) {
        ctx.fillText(ln, W / 2, verdictTop + i * (vSize + 8));
      });
      const verdictBottom = verdictTop + Math.max(1, vLines.length - 1) * (vSize + 8) + vSize * 0.3;

      /* 二维码与底部两行：自卡片底部向上排，并确保不压到评价行 */
      const url = challengeUrl(r.score);   /* 卡内二维码与地址同样携带挑战分数 */
      const QR_PX = 124;
      const lineGap = 25;
      const QR_BACKPAD = 10;
      const minQRTop = Math.max(cardBottom - 30 - 2 * lineGap - QR_BACKPAD - QR_PX, verdictBottom + 18);
      const qy = minQRTop;
      const qx = (W - QR_PX) / 2;

      const qrOk = (typeof GengQR !== 'undefined') ? (function () {
        try {
          ctx.fillStyle = '#ffffff';
          GengTheme.roundRect(ctx, qx - 10, qy - 10, QR_PX + 20, QR_PX + 20, 10); ctx.fill();
          GengQR.toCanvas(ctx, url, QR_PX, { x: qx, y: qy, ec: 'M' });
          return true;
        } catch (e) { return false; }
      })() : false;

      ctx.fillStyle = th.textDim;
      ctx.font = '400 19px system-ui, -apple-system, "PingFang SC", sans-serif';
      const urlText = url.replace(/^https?:\/\//, '');
      ctx.fillText(qrOk ? '扫码或打开：' + urlText : '打开：' + urlText, W / 2, qy + QR_PX + QR_BACKPAD + 22);
      ctx.fillText('3 点生命 · ' + durationSec() + ' 秒 · ' + (modeLabel), W / 2, qy + QR_PX + QR_BACKPAD + 22 + lineGap);

      return c;
    }

    function showShareCard(r) {
      let canvasEl;
      try { canvasEl = buildShareCard(r); }
      catch (e) { toast('成绩卡生成失败，已改为复制链接', 'err'); doShare(); return; }

      const url = challengeUrl(r.score);   /* 携带挑战分数，朋友点开就能看到目标 */
      const linkInput = el('input', { type: 'text', readonly: 'readonly', value: url, onclick: function (e) { e.target.select(); } });
      const imgWrap = el('div', { class: 'share-canvas' }, [canvasEl]);

      const dlBtn = el('button', { class: 'btn btn-primary', text: '保存图片', onclick: function () {
        try {
          const a = document.createElement('a');
          a.href = canvasEl.toDataURL('image/png');
          a.download = '梗一下-' + cfg.title + '.png';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          toast('图片已保存，发给朋友即可', 'ok');
        } catch (e) { toast('保存失败，可长按/右键图片另存为', 'err'); }
      } });

      const nativeBtn = el('button', { class: 'btn', text: '用系统分享', onclick: async function () {
        try {
          const blob = await new Promise(function (res) { canvasEl.toBlob(res, 'image/png'); });
          if (!blob || !navigator.canShare) throw new Error('no-can-share');
          const file = new File([blob], 'gengxia.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text: cfg.title + ' — ' + (modeLabel) + '，来挑战我的 ' + r.score + ' 分：' + url, title: cfg.title });
            return;
          }
          throw new Error('cannot-share-files');
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          toast('当前浏览器不支持图片分享，已复制链接', 'err');
          doShare();
        }
      } });

      const copyBtn = el('button', { class: 'btn btn-ghost', text: '复制链接', onclick: function () { doShare(); } });
      const closeBtn = el('button', { class: 'btn btn-ghost', text: '关闭', onclick: function () { hideOverlay(); showResultOverlay(r); } });

      const overlay = el('div', { class: 'overlay share-overlay' }, [
        el('h2', { text: '分享成绩卡' }),
        el('p', { class: 'intro-line', text: '发给朋友，看看谁能超过 ' + r.score + ' 分。' }),
        imgWrap,
        el('div', { class: 'share-box' }, [linkInput]),
        el('div', { class: 'row', style: 'justify-content:center;flex-wrap:wrap' }, [dlBtn, nativeBtn, copyBtn, closeBtn]),
        el('div', { class: 'share-note', text: '持有链接或扫码的人都可以直接开始同一款游戏。' }),
      ]);
      setOverlay(overlay);
    }

    /* ---- 分享 ---- */
    async function doShare() {
      /* 有本局成绩时用挑战链接（带上分数），否则退回普通链接。
       * 这样顶栏「分享」、成绩卡里的「复制链接」与二维码三处地址保持一致。 */
      const url = (pendingResult && pendingResult.score != null)
        ? challengeUrl(pendingResult.score)
        : shareUrl();
      const ok = await GengApi.copyText(url);
      if (ok) {
        toast('分享链接已复制：' + url, 'ok', 3200);
      } else {
        toast('自动复制失败，请手动复制下面的链接', 'err', 2600);
        showManualLink(url);
      }
    }

    function showManualLink(url) {
      const existing = overlayHost.querySelector('.manual-share');
      if (existing) { existing.remove(); }
      const box = el('div', { class: 'share-box manual-share' }, [
        el('input', { type: 'text', readonly: 'readonly', value: url, onclick: function (e) { e.target.select(); } }),
      ]);
      const target = overlayHost.querySelector('.overlay') || overlayHost;
      target.appendChild(box);
    }

    /* ---- 编辑（仅创建者） ---- */
    function showEdit() {
      if (!isCreator) { toast('只有创建者可以修改这款游戏', 'err'); return; }
      const titleInput = el('input', { type: 'text', value: cfg.title, maxlength: '40' });
      const nameInput = el('input', { type: 'text', value: cfg.player.name, maxlength: '24' });
      const errLine = el('div', { class: 'err-text', style: 'margin-top:8px;display:none;' });
      const saveBtn = el('button', { class: 'btn btn-primary', text: '保存并分享' });
      const cancel = el('button', { class: 'btn btn-ghost', text: '取消' });

      const panel = el('div', { class: 'edit-panel card', style: 'padding:16px' }, [
        el('div', { style: 'font-weight:700;font-size:15px', text: '修改游戏文案' }),
        el('label', { text: '游戏标题（2–18 字）' }),
        titleInput,
        el('label', { text: '主角称呼（1–12 字）' }),
        nameInput,
        errLine,
        el('div', { class: 'row', style: 'margin-top:14px' }, [saveBtn, cancel]),
      ]);

      saveBtn.addEventListener('click', async function () {
        saveBtn.disabled = true;
        const newTitle = titleInput.value.trim();
        const newName = nameInput.value.trim();
        try {
          const res = await GengApi.patchGame(gid, { title: newTitle, playerName: newName }, getToken(gid));
          cfg.title = res.config.title;
          cfg.player.name = res.config.player.name;
          titleEl.textContent = cfg.title;
          document.title = cfg.title + ' — 梗一下';
          panel.remove();
          toast('已保存，分享链接的内容已更新', 'ok');
        } catch (err) {
          errLine.textContent = (err && err.message) || '保存失败';
          errLine.style.display = 'block';
        } finally {
          saveBtn.disabled = false;
        }
      });
      cancel.addEventListener('click', function () { panel.remove(); });

      const shell = app.querySelector('.play-shell');
      shell.insertBefore(panel, shell.querySelector('.stage'));
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /* ---- HUD 按钮 ---- */
    pauseBtn.addEventListener('click', function () {
      if (game.state === 'paused') { GengAudio.unlock(); game.resume(); }
      else { game.pause('manual'); GengAudio.pause(); }
    });

    /* ---- 倒计时与进度条（每 100ms 同步一次，显示剩余秒数） ---- */
    const hudRaf = setInterval(function () {
      if (game.state === 'playing' || game.state === 'paused') {
        const leftMs = Math.max(0, game.timeLeftMs || 0);
        const pct = Math.max(0, leftMs / DURATION * 100);
        timerFill.style.width = pct + '%';
        timerFill.className = 'timer-fill' + (pct < 25 ? ' low' : '');
        const secLeft = Math.ceil(leftMs / 1000);
        timeLeftEl.textContent = secLeft + 's';
        timeLeftEl.className = 'hud-time' + (secLeft <= 10 ? ' low' : '');
      } else if (game.state === 'countdown') {
        timeLeftEl.textContent = durationSec() + 's';
        timeLeftEl.className = 'hud-time';
      }
    }, 100);
    const oldCleanup = cleanupCurrent;
    cleanupCurrent = function () { clearInterval(hudRaf); if (oldCleanup) oldCleanup(); };

    /* ---- 键盘空格快速继续 ---- */
    function onKey(e) {
      if (e.key === ' ' && game.state === 'paused') { e.preventDefault(); GengAudio.unlock(); game.resume(); }
    }
    window.addEventListener('keydown', onKey);
    const prevCleanup = cleanupCurrent;
    cleanupCurrent = function () { window.removeEventListener('keydown', onKey); if (prevCleanup) prevCleanup(); };

    /* ---- 首屏 ---- */
    game.resize();
    showStartOverlay();
    if (fromCreate) {
      history.replaceState({}, '', '/g/' + gid);
      toast('生成成功！点「开始游戏」试玩', 'ok', 3000);
    }
  }

  /* ================= 404 ================= */
  function renderNotFound(title, desc, backToPreset) {
    const box = el('div', { class: 'notfound' }, [
      el('div', {}, [
        el('div', { class: 'big', text: '🕹️' }),
        el('h1', { style: 'font-size:24px;margin:0 0 8px', text: title }),
        el('p', { class: 'hint', style: 'max-width:420px;margin:0 auto 20px', text: desc }),
        el('div', { class: 'row', style: 'justify-content:center' }, [
          el('button', { class: 'btn btn-primary', text: '回到首页', onclick: function () { navigate('/'); } }),
          backToPreset ? el('button', { class: 'btn', text: '玩预设游戏', onclick: function () { navigate('/g/demo-genggao'); } }) : null,
        ]),
      ]),
    ]);
    return box;
  }

  document.title = '梗一下 — 把你的梗变成一个小游戏';
  render();
})();
