/* 官方预设游戏（可玩、可分享、无需模型）。
 *
 * 预设走完整 v2 Schema 校验，与 AI 生成游戏共用同一引擎与数据结构。
 * 作用：模型不可用（额度到期 / 未配置凭据 / 限流）时，产品依然完整可玩。
 * 覆盖三种玩法与多套场景，让用户不调用模型也能体验全部玩法。
 */
'use strict';

const Schema = require('../shared/schema.js');
const SceneDefs = require('../shared/scenes.js');

/* 每个预置：id + 场景 + 玩法 + 故事化文案。素材取自该场景的合法清单。 */
const RAW_PRESETS = [
  /* ---------- 躲避收集 ---------- */
  {
    id: 'demo-genggao',
    sceneId: 'office-night',
    mode: 'dodge',
    config: {
      title: '再小改一下',
      intro: '第五版刚发出去，第六版需求已经在路上了。',
      player: { name: '打工人', avatarId: 'office-worker' },
      obstacle: { name: '临时需求', spriteId: 'document' },
      collectible: { name: '下班卡', spriteId: 'ticket' },
      lines: ['这个改动很小', '最后再来一版', '下班就在前方', '第五版了，第几版了？', '进度呢？'],
      ending: {
        low: '今天先到这里，明天再和需求周旋。',
        mid: '你成功守住了一部分下班时间！',
        high: '准点下班大师，需求都追不上你！',
      },
    },
  },
  {
    id: 'demo-birthday',
    sceneId: 'birthday-party',
    mode: 'dodge',
    config: {
      title: '小王的生日冲刺',
      intro: '派对已经开场，最爱的奶茶和蛋糕还在路上。',
      player: { name: '寿星小王', avatarId: 'birthday-star' },
      obstacle: { name: '迟到的闹钟', spriteId: 'alarm-clock' },
      collectible: { name: '全糖奶茶', spriteId: 'milk-tea' },
      lines: ['生日快乐！', '奶茶加料了吗', '蛋糕在路上了', '许愿要快，蜡烛要灭'],
      ending: {
        low: '蜡烛还没点上，派对就散场了，明年再战。',
        mid: '派对及格分！大家记得你最爱的奶茶口味。',
        high: '全场为你庆生，奶茶蛋糕全都到位！',
      },
    },
  },
  {
    id: 'demo-mao',
    sceneId: 'pet-living-room',
    mode: 'dodge',
    config: {
      title: '凌晨三点演唱会',
      intro: '猫准时开唱，客厅里的东西开始一件件往下掉。',
      player: { name: '铲屎官', avatarId: 'cat-owner' },
      obstacle: { name: '被推下桌的水杯', spriteId: 'water-glass' },
      collectible: { name: '猫条', spriteId: 'cat-treat' },
      lines: ['喵——', '这个也要推下去', '猫条拿来', '凌晨三点，准时开唱'],
      ending: {
        low: '水杯碎了三个，猫毫发无伤。今晚锁好柜子吧。',
        mid: '你成功救下了大部分杯子，猫有点佩服你。',
        high: '全场零损失！你就是凌晨三点演唱会的最佳场务。',
      },
    },
  },
  {
    id: 'demo-zaoba-bao',
    sceneId: 'bedroom-night',
    mode: 'dodge',
    config: {
      title: '两点还没睡',
      intro: '说好十一点睡，手机说再刷五分钟。',
      player: { name: '熬夜的人', avatarId: 'sleepy-head' },
      obstacle: { name: '停不下来的手机', spriteId: 'phone' },
      collectible: { name: '枕头', spriteId: 'pillow' },
      lines: ['再刷五分钟', '十一点就睡（假的）', '枕头在等我', '黑眼圈又深了'],
      ending: {
        low: '手机赢了，枕头等了一夜。今晚试试把充电线放远一点。',
        mid: '你成功在十二点前放下手机，进步很大。',
        high: '十一点准时入睡，黑眼圈终于淡了！',
      },
    },
  },

  /* ---------- 三路跑酷 ---------- */
  {
    id: 'demo-zaoba',
    sceneId: 'dorm-morning',
    mode: 'runner',
    config: {
      title: '早八跑道',
      intro: '七个闹钟全阵亡，宿舍楼下已经开始点名。',
      player: { name: '起床困难户', avatarId: 'sleepy-head' },
      obstacle: { name: '连环闹钟', spriteId: 'alarm-clock' },
      collectible: { name: '早饭', spriteId: 'coffee' },
      lines: ['再睡五分钟', '要迟到了！', '鞋穿反了也别停', '点名点到我了'],
      ending: {
        low: '今天又是迟到的一天，明天一定早起（大概）。',
        mid: '踩着铃声冲进教室，勉强算赢了。',
        high: '提前十分钟到教室，你就是早八战神！',
      },
    },
  },
  {
    id: 'demo-tongqin',
    sceneId: 'subway-commute',
    mode: 'runner',
    config: {
      title: '挤上那班车',
      intro: '早高峰的地铁，门开的那三秒决定一切。',
      player: { name: '通勤族', avatarId: 'commuter' },
      obstacle: { name: '挤过来的队伍', spriteId: 'queue-rope' },
      collectible: { name: '空座位', spriteId: 'seat' },
      lines: ['往里走一走', '下一班就到你', '别挤了别挤了', '今天能坐下吗'],
      ending: {
        low: '站了一路，鞋还被踩了三脚。明天早点出门。',
        mid: '挤上去了，虽然是被推进去的。',
        high: '一次挤上还有座位，今天运气爆棚！',
      },
    },
  },
  {
    id: 'demo-airport',
    sceneId: 'travel-airport',
    mode: 'runner',
    config: {
      title: '赶最后一班登机',
      intro: '广播已经在念你的名字了，登机口在最远那头。',
      player: { name: '赶飞机的人', avatarId: 'traveler' },
      obstacle: { name: '气流颠簸', spriteId: 'turbulence' },
      collectible: { name: '登机牌', spriteId: 'boarding-pass' },
      lines: ['请尽快登机', '登机口在最远那头', '鞋带开了也不停', '还有八分钟'],
      ending: {
        low: '改签窗口在等你，今晚先住机场吧。',
        mid: '连滚带爬上了飞机，行李差点没跟上。',
        high: '稳稳落座，还赶上了发餐食！',
      },
    },
  },

  /* ---------- 限时点击 ---------- */
  {
    id: 'demo-naicha',
    sceneId: 'milk-tea-shop',
    mode: 'click',
    config: {
      title: '全糖去冰加珍珠',
      intro: '下午三点的奶茶店，订单多到店员手忙脚乱。',
      player: { name: '点单的人', avatarId: 'commuter' },
      obstacle: { name: '排到门口的长队', spriteId: 'queue-rope' },
      collectible: { name: '刚加好的珍珠', spriteId: 'boba' },
      lines: ['全糖去冰加珍珠', '您的号是 47 号', '前面还有 12 杯', '珍珠快没了'],
      ending: {
        low: '单子做错了三杯，店员想下班了。',
        mid: '基本没错，就是珍珠给少了。',
        high: '零失误出单，你就是奶茶店店长！',
      },
    },
  },
  {
    id: 'demo-kaoshi',
    sceneId: 'exam-classroom',
    mode: 'click',
    config: {
      title: '还有十分钟交卷',
      intro: '选择题还剩一整页，教室后墙的钟走得飞快。',
      player: { name: '考生', avatarId: 'exam-taker' },
      obstacle: { name: '没做完的题', spriteId: 'exam-question' },
      collectible: { name: '写完的答题卡', spriteId: 'answer-sheet' },
      lines: ['还有十分钟', '这道题见过（假的）', '涂卡了吗', '下一题下一题'],
      ending: {
        low: '交卷铃响了，最后五道全靠蒙。',
        mid: '勉强写完了，选择题一半靠直觉。',
        high: '提前十分钟写完还检查了一遍，稳了！',
      },
    },
  },
  {
    id: 'demo-kuaidi',
    sceneId: 'parcel-delivery',
    mode: 'click',
    config: {
      title: '双十一取件大作战',
      intro: '驿站货架已经堆到天花板，取件码一条接一条。',
      player: { name: '网购的人', avatarId: 'shopper' },
      obstacle: { name: '要签收的包裹', spriteId: 'cardboard-box' },
      collectible: { name: '快过期的优惠券', spriteId: 'coupon' },
      lines: ['您的快递到了', '取件码 8-3-2-1', '货架满了', '还有一个在路上'],
      ending: {
        low: '包裹堆成山，这个月卡里没钱了。',
        mid: '搬回了大部分，胳膊有点酸。',
        high: '一次搬完所有包裹，你就是驿站之王！',
      },
    },
  },
];

/* 校验并补全为完整 v2 配置（ruleText 由 schema 模板生成） */
function getValidatedPresets() {
  const out = [];
  for (const p of RAW_PRESETS) {
    const sc = SceneDefs.SCENES[p.sceneId];
    if (!sc) throw new Error('预设 ' + p.id + ' 的场景不存在：' + p.sceneId);
    if (sc.modes.indexOf(p.mode) === -1) {
      throw new Error('预设 ' + p.id + ' 的玩法 ' + p.mode + ' 不被场景 ' + p.sceneId + ' 支持');
    }
    const full = Object.assign({
      schemaVersion: Schema.SCHEMA_VERSION,
      mode: p.mode,
      sceneId: p.sceneId,
    }, p.config);

    const vr = Schema.validateConfig(full, { sceneSprites: SceneDefs.sceneSprites(p.sceneId) });
    if (!vr.ok) throw new Error('预设配置未通过校验：' + p.id + ' → ' + vr.errors.join('；'));
    out.push({ id: p.id, config: vr.value, sceneId: p.sceneId, mode: p.mode, source: 'preset' });
  }
  return out;
}

module.exports = { getValidatedPresets, RAW_PRESETS };
