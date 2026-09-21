/* 「梗一下」共享配置 Schema v2
 * 服务端 (Node) 与浏览器 (UMD -> window.GengSchema) 共用同一份定义。
 *
 * v2 关键变化（针对第二轮任务书 P0-2「文案与规则不一致」）：
 *  1. 新增 mode（3 种玩法）与 sceneId（12 套场景），均受枚举限制。
 *  2. ruleText 由服务端模板生成，不接受模型创作 —— 玩法说明里的核心对象
 *     永远取自同一份配置，模型无法另写一套矛盾规则。
 *  3. 语义一致性检查：文案若把"要躲的东西"说成"要去追的东西"（或反之），
 *     判定不合规并触发修复。
 *  4. 场景素材可用性检查：图案必须属于该场景允许的集合。
 *  5. 提供 v1 → v2 迁移，保证旧分享链接的配置仍可校验通过。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GengSchema = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const SCHEMA_VERSION = 2;

  /* ---------------- 枚举：玩法 ---------------- */
  const MODES = {
    'dodge': { label: '躲避收集', desc: '接取奖励，躲开障碍', duration: 45000, lives: 3 },
    'runner': { label: '三路跑酷', desc: '在三条跑道之间切换', duration: 45000, lives: 3 },
    'click': { label: '限时点击', desc: '点掉目标，避开干扰项', duration: 35000, lives: 3 },
  };

  /* ---------------- 枚举：12 套场景 id ---------------- */
  /* 场景的完整定义（配色/素材/示例）在 shared/scenes.js，那里是单一事实来源。 */
  const SCENE_IDS = [
    'bedroom-night', 'office-night', 'dorm-morning', 'birthday-party',
    'milk-tea-shop', 'subway-commute', 'gym', 'exam-classroom',
    'kitchen', 'pet-living-room', 'travel-airport', 'parcel-delivery',
  ];

  /* ---------------- 枚举：主角形象 ---------------- */
  const AVATARS = {
    'office-worker': '打工人',
    'student': '学生',
    'birthday-star': '寿星',
    'sleepy-head': '起床困难户',
    'hero': '通用主角（其他情景）',
    'commuter': '通勤族',
    'gym-goer': '健身的人',
    'exam-taker': '备考的人',
    'chef': '下厨的人',
    'cat-owner': '铲屎官',
    'traveler': '旅行的人',
    'shopper': '网购的人',
  };

  /* ---------------- 枚举：障碍图案 ---------------- */
  const OBSTACLE_SPRITES = {
    'document': '文档 / 需求单',
    'message-bubble': '消息气泡（催促消息）',
    'alarm-clock': '闹钟（截止时间）',
    'rain-cloud': '乌云（坏运气）',
    'homework': '作业本堆',
    'coffee-cup': '洒掉的咖啡',
    'cat': '捣乱的猫',
    'wrench': '扳手（装修 / 维修 / 拖延施工）',
    'phone': '手机（刷不停的屏幕）',
    'water-glass': '水杯（快要被推下桌）',
    'red-pen': '红笔（批改 / 打回）',
    'queue-rope': '排队围栏（漫长的队伍）',
    'dirty-dish': '没洗的碗碟',
    'price-tag': '价签（花超预算）',
    'traffic-jam': '堵车车流',
    'weight-plate': '杠铃片（压垮）',
    'exam-question': '考卷难题',
    'scorched-pan': '烧糊的锅',
    'cardboard-box': '堆起来的纸箱',
    'turbulence': '气流颠簸',
    'fried-chicken': '炸鸡 / 高热量的诱惑',
  };

  /* ---------------- 枚举：奖励图案 ---------------- */
  const COLLECTIBLE_SPRITES = {
    'ticket': '下班卡 / 门禁卡',
    'cake': '蛋糕',
    'milk-tea': '奶茶',
    'pillow': '枕头',
    'star': '星星（通用）',
    'coin': '金币（通用）',
    'coffee': '外卖咖啡',
    'gift': '礼物盒',
    'takeout-box': '外卖盒 / 打包餐',
    'fish': '鱼（钓鱼成果）',
    'blanket': '被子（赖床续命）',
    'phone-charger': '充电线',
    'candle': '生日蜡烛',
    'boba': '珍珠加料',
    'coupon': '优惠券',
    'seat': '空座位',
    'dumbbell': '哑铃',
    'protein-shake': '蛋白粉奶昔',
    'answer-sheet': '答题卡',
    'a-grade': '满分成绩单',
    'fried-egg': '煎蛋',
    'noodle-bowl': '一碗面',
    'cat-treat': '猫条',
    'boarding-pass': '登机牌',
    'window-seat': '靠窗座位',
    'souvenir': '纪念品',
    'parcel': '快递包裹',
  };

  /* ---------------- 长度限制（Unicode 码点计数） ---------------- */
  const LIMITS = {
    story: { min: 10, max: 1000 },
    title: { min: 2, max: 18 },
    intro: { min: 6, max: 60 },
    playerName: { min: 1, max: 12 },
    entityName: { min: 1, max: 12 },
    line: { min: 2, max: 24 },
    lines: { min: 1, max: 5 },
    ending: { min: 6, max: 80 },
  };

  /* ---------------- 隐私 / 注入 / 滥用特征 ---------------- */
  const PRIVACY_PATTERNS = [
    { name: '手机号', re: /(?:\+?86[-\s]?)?1[3-9]\d{9}/ },
    { name: '邮箱', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
    { name: '链接', re: /(?:https?:\/\/|www\.)\S+/i },
    { name: '证件号或卡号（长数字）', re: /(?<!\d)\d{15,18}(?!\d)/ },
  ];
  const HTML_CHARS = /[<>]/;

  const ABUSE_PATTERNS = [
    { name: '严重侮辱或威胁', re: /(?:杀了?你|打死你|弄死|去死|滚出去死|死全家|弄死你|杀了你全家)/ },
    { name: '针对外貌或身份的歧视', re: /(?:死胖子|丑八怪|残疾|智障|弱智|神经病|贱人|废物垃圾)/ },
    { name: '严重人身攻击', re: /(?:全家都|你妈是|你爸是)[^，。]{0,6}(?:畜生|垃圾|狗)/ },
  ];

  /* ---------------- 语义一致性：动作词族 ----------------
   * 检测「简介把要躲开的东西说成要去追的东西」这类矛盾。
   * 保守启发式：只拦明显矛盾，不误伤正常表达。 */
  const COLLECT_VERBS = ['追', '收集', '接取', '接住', '捡起', '捡', '点掉', '打掉', '吃掉', '拿走', '抢到', '拾取', '吃下', '抢'];
  const AVOID_VERBS = ['躲开', '躲避', '避开', '闪开', '绕开', '别碰', '不要碰', '防住'];

  /* ---------------- 工具函数 ---------------- */
  function countChars(s) { return [...String(s)].length; }

  function cleanText(s) {
    return String(s)
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
      .replace(/[\u200B-\u200F\u2028\u2029\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanStory(s) {
    return String(s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      .replace(/[\u200B-\u200F\uFEFF]/g, '')
      .replace(/\r\n?/g, '\n')
      .trim();
  }

  function findPrivacyIssue(s) {
    for (const p of PRIVACY_PATTERNS) { if (p.re.test(s)) return p.name; }
    return null;
  }

  function findAbuseIssue(s) {
    for (const p of ABUSE_PATTERNS) { if (p.re.test(s)) return p.name; }
    return null;
  }

  /* ---------------- 玩法说明（服务端模板，模型无法干预） ---------------- */
  function buildRuleText(mode, collectibleName, obstacleName) {
    const c = cleanText(collectibleName || '奖励');
    const o = cleanText(obstacleName || '障碍');
    if (mode === 'runner') return '切换跑道，冲过 ' + c + '，撞上 ' + o + ' 会掉血。';
    if (mode === 'click') return '点掉 ' + o + ' 得分，点到 ' + c + ' 会扣血。';
    return '接住 ' + c + ' 得分，碰到 ' + o + ' 会扣血。';
  }

  /* ---------------- 语义一致性检查 ----------------
   * 返回首个冲突描述，或 null。
   *
   * 判定要点：
   *  1. 动作词与对象名距离在阈值内，且两者之间没有分句边界（标点）——
   *     否则「拿着猫条追猫，躲开飞来的拖鞋」会被误判成"猫条是要躲开的东西"。
   *  2. 排除子串误匹配：障碍名叫「猫」而奖励叫「猫条」时，「猫」出现在
   *     「猫条」里不算命中障碍物（但「猫条」本身仍算有效出现）。
   *  3. 玩法决定动作语义：点击玩法里 obstacle 是要"点掉"的目标，
   *     collectible 是"不能点"的干扰项，与躲避类玩法正好相反。
   */
  const CLAUSE_BREAK = /[，。！？、；：,.!?;:…—]/;

  /* 点击玩法专用动词 */
  const TAP_VERBS = ['点掉', '打掉', '点击', '戳破', '消灭', '拍掉'];

  /* 找出 name 在 text 中的所有出现位置 */
  function findAll(text, name) {
    const out = [];
    if (!name) return out;
    let i = text.indexOf(name);
    while (i !== -1) {
      out.push([i, i + name.length]);
      i = text.indexOf(name, i + 1);
    }
    return out;
  }

  function spansOverlap(a, b) {
    return a[0] < b[1] && b[0] < a[1];
  }

  /* 过滤掉"落在更长实体名内部"的出现：
   * 「猫」在「猫条」里不算一次独立的障碍物出现。 */
  function spansContained(inner, outer) {
    return inner[0] >= outer[0] && inner[1] <= outer[1];
  }
  function dropContained(own, other) {
    return own.filter(function (s) {
      return !other.some(function (o) { return spansContained(s, o); });
    });
  }

  /* 实体名的"核心名词"：中文实体名常写成「[修饰语]的[名词]」，
   * 「三点开唱的猫」的核心是「猫」，「被推下桌的水杯」的核心是「水杯」。
   * 文案里通常只写核心名词，所以只匹配完整名称会漏掉
   * 「拿着猫条追猫」（障碍叫「三点开唱的猫」）这类真实矛盾。 */
  function coreNoun(name) {
    const n = cleanText(name || '');
    if (!n) return '';
    const i = n.lastIndexOf('的');
    if (i !== -1 && i < n.length - 1) {
      const tail = n.slice(i + 1);
      if (countChars(tail) >= 1) return tail;
    }
    return n;
  }

  /* 一个实体在文本里的全部出现位置：完整名称 + 核心名词。
   * 核心名词若落在完整名称的某次出现内部则不重复计入。 */
  function entitySpans(text, name, core) {
    const spans = findAll(text, name);
    if (core && core !== name) {
      findAll(text, core).forEach(function (s) {
        if (!spans.some(function (o) { return spansContained(s, o); })) spans.push(s);
      });
    }
    return spans;
  }

  /* 找到动词真正绑定的那个对象：动词前后 maxGap 内**最近**的实体名。
   *
   * 这一点很关键：中文里「收集测试道具躲开测试障碍」中，收集 与 测试障碍 的
   * 字面距离也很近，但收集 真正绑定的是更近的 测试道具。只按"附近有没有出现"
   * 判定会产生误报，必须取最近的那个。 */
  function nearestBoundObject(text, vSpan, cName, cSpans, oName, oSpans) {
    const cands = [];
    cSpans.forEach(function (s) { cands.push({ kind: 'collectible', name: cName, span: s }); });
    oSpans.forEach(function (s) { cands.push({ kind: 'obstacle', name: oName, span: s }); });
    let best = null;
    for (const c of cands) {
      const gap = (c.span[0] >= vSpan[1]) ? c.span[0] - vSpan[1]
        : (vSpan[0] >= c.span[1] ? vSpan[0] - c.span[1] : 0);
      const maxGap = Math.max(4, Math.min(8, (c.span[1] - c.span[0]) + 4));
      if (gap > maxGap) continue;
      if (!spansOverlap(vSpan, c.span)) {
        const between = text.slice(Math.min(vSpan[1], c.span[1]), Math.max(vSpan[0], c.span[0]));
        if (CLAUSE_BREAK.test(between)) continue;
      }
      /* 距离相同时，优先认为动词绑定它**后面**的对象 —— 中文是动宾结构
       * （「躲开 测试障碍」），否则「收集测试道具躲开测试障碍」里 躲开 会被
       * 误判为绑定前面的 测试道具。 */
      const after = (c.span[0] >= vSpan[1]) ? 0 : 1;
      const cand = { kind: c.kind, name: c.name, gap: gap, after: after };
      if (!best || cand.gap < best.gap || (cand.gap === best.gap && cand.after < best.after)) best = cand;
    }
    return best;
  }

  /* 动词是否绑定了不该绑的对象。
   * targets: 期望该动词绑定的对象类型（'collectible' | 'obstacle'）
   * 返回绑定到"非 targets"类型时的描述，否则 null。 */
  function findMisboundVerb(text, verbs, cName, cSpans, oName, oSpans, targets) {
    for (const v of verbs) {
      for (const vs of findAll(text, v)) {
        const b = nearestBoundObject(text, vs, cName, cSpans, oName, oSpans);
        if (b && targets.indexOf(b.kind) === -1) return { verb: v, bound: b };
      }
    }
    return null;
  }

  function findSemanticConflict(text, collectibleName, obstacleName, mode) {
    if (!text) return null;
    const t = String(text);
    const cName = cleanText(collectibleName || '');
    const oName = cleanText(obstacleName || '');
    if (!cName && !oName) return null;

    /* 同时匹配完整名称与核心名词：「三点开唱的猫」也要能命中文案里的「猫」。 */
    const cSpans = entitySpans(t, cName, coreNoun(cName));
    const oSpans = entitySpans(t, oName, coreNoun(oName));
    /* 落在对方名称内部的短出现要排除：「猫」在「猫条」里不算障碍物出现，
     * 但「猫条」本身仍是有效的奖励出现。 */
    const validOSpans = dropContained(oSpans, cSpans);
    const validCSpans = dropContained(cSpans, oSpans);

    if (mode === 'click') {
      /* 点击玩法：obstacle 是要点掉的目标，collectible 是不能点的干扰项 */
      const hit = findMisboundVerb(t, TAP_VERBS, cName, validCSpans, oName, validOSpans, ['obstacle']);
      if (hit) {
        return '文案把「' + hit.bound.name + '」写成要「' + hit.verb + '」的对象，但它是不能点的干扰项';
      }
      return null;
    }

    /* 躲避 / 跑酷：障碍要躲开，奖励要接取 */
    const bad1 = findMisboundVerb(t, COLLECT_VERBS, cName, validCSpans, oName, validOSpans, ['collectible']);
    if (bad1) {
      return '文案把障碍「' + bad1.bound.name + '」写成要去「' + bad1.verb + '」的对象，而它是要躲开的';
    }
    const bad2 = findMisboundVerb(t, AVOID_VERBS, cName, validCSpans, oName, validOSpans, ['obstacle']);
    if (bad2) {
      return '文案把奖励「' + bad2.bound.name + '」写成要「' + bad2.verb + '」的对象，而它是要接取的';
    }
    return null;
  }

  /* 收集全部语义冲突（用于生成时的批量反馈） */
  function collectSemanticConflicts(value) {
    const out = [];
    if (!value) return out;
    const cName = value.collectible && value.collectible.name;
    const oName = value.obstacle && value.obstacle.name;
    const mode = value.mode;
    const push = function (field, text) {
      const c = findSemanticConflict(text, cName, oName, mode);
      if (c) out.push(field + '：' + c);
    };
    push('intro', value.intro);
    push('title', value.title);
    (value.lines || []).forEach(function (l, i) { push('lines[' + i + ']', l); });
    if (value.ending) {
      ['low', 'mid', 'high'].forEach(function (k) { push('ending.' + k, value.ending[k]); });
    }
    return out;
  }

  /* ---------------- 字段级校验 ---------------- */
  function checkText(raw, field, limit, errors) {
    if (typeof raw !== 'string') {
      errors.push(field + ' 必须是字符串');
      return '';
    }
    const cleaned = cleanText(raw);
    const n = countChars(cleaned);
    if (n < limit.min || n > limit.max) {
      errors.push(field + ' 长度必须在 ' + limit.min + '-' + limit.max + ' 字之间（当前 ' + n + ' 字）');
      return cleaned;
    }
    if (HTML_CHARS.test(cleaned)) errors.push(field + ' 不能包含 < 或 > 字符');
    const priv = findPrivacyIssue(cleaned);
    if (priv) errors.push(field + ' 包含疑似' + priv + '，请移除');
    const abuse = findAbuseIssue(cleaned);
    if (abuse) errors.push(field + ' 包含' + abuse + '内容，请调整为轻松吐槽');
    return cleaned;
  }

  function checkEnum(raw, field, table, errors) {
    if (typeof raw !== 'string' || !Object.prototype.hasOwnProperty.call(table, raw)) {
      errors.push(field + ' 必须是以下之一：' + Object.keys(table).join('、') + '（收到 ' + JSON.stringify(raw) + '）');
      return '';
    }
    return raw;
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function sceneIdTable() {
    const t = {};
    SCENE_IDS.forEach(function (id) { t[id] = id; });
    return t;
  }

  /* ---------------- 完整配置校验 ----------------
   * opts.sceneSprites（可选）{ player:[], collectibles:[], obstacles:[] }
   *   提供时校验素材是否属于该场景允许的集合。
   * opts.skipSemantics（可选）：跳过语义检查（迁移旧配置时使用）。
   * 返回 { ok, value, errors }。value 为清洗后、仅含 schema 字段的配置。
   */
  function validateConfig(input, opts) {
    const errors = [];
    const o = opts || {};
    if (!isPlainObject(input)) {
      return { ok: false, value: null, errors: ['输出必须是一个 JSON 对象'] };
    }
    if (input.schemaVersion !== SCHEMA_VERSION && !o.acceptAnyVersion) {
      errors.push('schemaVersion 必须等于 ' + SCHEMA_VERSION + '（收到 ' + JSON.stringify(input.schemaVersion) + '）');
    }

    const value = { schemaVersion: SCHEMA_VERSION };
    value.title = checkText(input.title, 'title', LIMITS.title, errors);
    value.intro = checkText(input.intro, 'intro', LIMITS.intro, errors);
    value.mode = checkEnum(input.mode, 'mode', MODES, errors);
    value.sceneId = checkEnum(input.sceneId, 'sceneId', sceneIdTable(), errors);

    value.player = {};
    if (!isPlainObject(input.player)) {
      errors.push('player 必须是对象（含 name 和 avatarId）');
    } else {
      value.player.name = checkText(input.player.name, 'player.name', LIMITS.playerName, errors);
      value.player.avatarId = checkEnum(input.player.avatarId, 'player.avatarId', AVATARS, errors);
    }

    value.obstacle = {};
    if (!isPlainObject(input.obstacle)) {
      errors.push('obstacle 必须是对象（含 name 和 spriteId）');
    } else {
      value.obstacle.name = checkText(input.obstacle.name, 'obstacle.name', LIMITS.entityName, errors);
      value.obstacle.spriteId = checkEnum(input.obstacle.spriteId, 'obstacle.spriteId', OBSTACLE_SPRITES, errors);
    }

    value.collectible = {};
    if (!isPlainObject(input.collectible)) {
      errors.push('collectible 必须是对象（含 name 和 spriteId）');
    } else {
      value.collectible.name = checkText(input.collectible.name, 'collectible.name', LIMITS.entityName, errors);
      value.collectible.spriteId = checkEnum(input.collectible.spriteId, 'collectible.spriteId', COLLECTIBLE_SPRITES, errors);
    }

    if (!Array.isArray(input.lines)) {
      errors.push('lines 必须是数组');
    } else {
      if (input.lines.length < LIMITS.lines.min || input.lines.length > LIMITS.lines.max) {
        errors.push('lines 数量必须在 ' + LIMITS.lines.min + '-' + LIMITS.lines.max + ' 条之间（收到 ' + input.lines.length + ' 条）');
      }
      value.lines = [];
      for (let i = 0; i < input.lines.length; i++) {
        value.lines.push(checkText(input.lines[i], 'lines[' + i + ']', LIMITS.line, errors));
      }
    }

    value.ending = {};
    if (!isPlainObject(input.ending)) {
      errors.push('ending 必须是对象（含 low / mid / high）');
    } else {
      for (const k of ['low', 'mid', 'high']) {
        value.ending[k] = checkText(input.ending[k], 'ending.' + k, LIMITS.ending, errors);
      }
    }

    if (errors.length) return { ok: false, value: null, errors: errors };

    /* ---- 场景素材可用性 ---- */
    if (o.sceneSprites && value.sceneId) {
      const ss = o.sceneSprites;
      const chk = function (field, spriteId, allowed) {
        if (allowed && spriteId && allowed.indexOf(spriteId) === -1) {
          errors.push(field + '「' + spriteId + '」不属于场景 ' + value.sceneId + ' 的可用素材（可用：' + allowed.join('、') + '）');
        }
      };
      chk('avatarId', value.player.avatarId, ss.player);
      chk('collectible.spriteId', value.collectible.spriteId, ss.collectibles);
      chk('obstacle.spriteId', value.obstacle.spriteId, ss.obstacles);
    }

    /* ---- 语义一致性 ---- */
    if (!o.skipSemantics) {
      const conflicts = collectSemanticConflicts(value);
      if (conflicts.length) errors.push.apply(errors, conflicts);
    }

    if (errors.length) return { ok: false, value: null, errors: errors };

    /* ---- ruleText：服务端模板生成（模型无法干预） ---- */
    value.ruleText = buildRuleText(value.mode, value.collectible.name, value.obstacle.name);

    return { ok: true, value: value, errors: [] };
  }

  /* ---------------- 用户输入校验 ---------------- */
  function validateStory(text) {
    if (typeof text !== 'string') return { ok: false, error: '请输入故事内容' };
    const cleaned = cleanStory(text);
    const n = countChars(cleaned);
    if (n < LIMITS.story.min) return { ok: false, error: '故事太短了：至少 ' + LIMITS.story.min + ' 字，当前 ' + n + ' 字' };
    if (n > LIMITS.story.max) return { ok: false, error: '故事太长了：最多 ' + LIMITS.story.max + ' 字，当前 ' + n + ' 字' };
    return { ok: true, value: cleaned };
  }

  /* ---------------- 编辑（PATCH）校验 ---------------- */
  const PATCHABLE_FIELDS = ['title', 'playerName'];

  function validatePatch(patch) {
    const errors = [];
    if (!isPlainObject(patch)) return { ok: false, value: null, errors: ['请求体必须是对象'] };
    const keys = Object.keys(patch);
    if (keys.length === 0) return { ok: false, value: null, errors: ['没有可更新的字段（支持：title、playerName）'] };
    const value = {};
    for (const k of keys) {
      if (PATCHABLE_FIELDS.indexOf(k) === -1) { errors.push('字段 ' + k + ' 不允许修改'); continue; }
      if (k === 'title') value.title = checkText(patch.title, 'title', LIMITS.title, errors);
      if (k === 'playerName') value.playerName = checkText(patch.playerName, 'playerName', LIMITS.playerName, errors);
    }
    if (errors.length) return { ok: false, value: null, errors: errors };
    return { ok: true, value: value, errors: [] };
  }

  function applyPatch(config, patch) {
    const next = JSON.parse(JSON.stringify(config));
    if (typeof patch.title === 'string') next.title = patch.title;
    if (typeof patch.playerName === 'string') next.player.name = patch.playerName;
    /* 规则句保持与服务端模板一致 */
    if (next.mode && next.collectible && next.obstacle) {
      next.ruleText = buildRuleText(next.mode, next.collectible.name, next.obstacle.name);
    }
    return next;
  }

  /* ---------------- v1 → v2 迁移（旧分享链接仍可玩） ---------------- */
  const THEME_TO_SCENE = {
    'office-neon': 'office-night',
    'birthday-pop': 'birthday-party',
    'morning-escape': 'dorm-morning',
  };

  function migrateV1(old) {
    if (!isPlainObject(old) || old.schemaVersion !== 1) return null;
    const out = JSON.parse(JSON.stringify(old));
    out.schemaVersion = SCHEMA_VERSION;
    out.mode = 'dodge';
    out.sceneId = THEME_TO_SCENE[old.themeId] || 'office-night';
    delete out.themeId;
    const vr = validateConfig(out, { skipSemantics: true, acceptAnyVersion: true });
    if (!vr.ok) return null;
    return vr.value;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    MODES: MODES,
    SCENE_IDS: SCENE_IDS,
    AVATARS: AVATARS,
    OBSTACLE_SPRITES: OBSTACLE_SPRITES,
    COLLECTIBLE_SPRITES: COLLECTIBLE_SPRITES,
    LIMITS: LIMITS,
    PRIVACY_PATTERNS: PRIVACY_PATTERNS,
    PATCHABLE_FIELDS: PATCHABLE_FIELDS,
    THEME_TO_SCENE: THEME_TO_SCENE,
    countChars: countChars,
    cleanText: cleanText,
    cleanStory: cleanStory,
    findPrivacyIssue: findPrivacyIssue,
    findAbuseIssue: findAbuseIssue,
    findSemanticConflict: findSemanticConflict,
    collectSemanticConflicts: collectSemanticConflicts,
    buildRuleText: buildRuleText,
    validateConfig: validateConfig,
    validateStory: validateStory,
    validatePatch: validatePatch,
    applyPatch: applyPatch,
    migrateV1: migrateV1,
  };
});
