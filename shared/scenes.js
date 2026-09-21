/* 「梗一下」12 套场景定义（v2）
 *
 * 每套场景包含：
 *  - palette：完整配色（引擎与素材都用这一份，保证对比度统一）
 *  - artId：背景绘制函数名（实现在 public/js/art-scenes.js）
 *  - player：该场景默认主角素材
 *  - collectibles / obstacles：该场景可用的素材集合（至少 2 + 2）
 *  - modes：该场景支持的玩法（生成前用于过滤不支持的组合）
 *  - sample：示例故事、标题、台词、结算（首页示例入口与预设使用）
 *
 * 所有素材 ID 必须同时出现在 shared/schema.js 的枚举中，否则校验会拒绝。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GengScenes = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const SCENES = {
    /* ---------- 1. 深夜卧室 ---------- */
    'bedroom-night': {
      label: '深夜卧室',
      artId: 'bedroom-night',
      blurb: '夜晚、卧室、睡觉、熬夜、刷手机、起夜',
      palette: {
        bg: ['#0a0a1f', '#161335', '#241c4a'],
        grid: 'rgba(150,140,255,0.06)',
        accent: '#8b7cf6',
        accent2: '#f472b6',
        danger: '#f87171',
        text: '#f0eeff',
        textDim: 'rgba(240,238,255,0.66)',
        glow: 'rgba(139,124,246,0.35)',
        playerRing: '#8b7cf6',
        collectibleGlow: '#c4b5fd',
        obstacleTint: '#f472b6',
        hud: 'rgba(22,19,53,0.74)',
        particle: ['#c4b5fd', '#8b7cf6', '#fbbf24'],
        floor: 'rgba(139,124,246,0.14)',
      },
      player: 'sleepy-head',
      collectibles: ['pillow', 'blanket', 'star', 'phone-charger'],
      obstacles: ['alarm-clock', 'phone', 'water-glass', 'cat'],
      modes: ['dodge', 'runner', 'click'],
      sample: {
        story: '我每天晚上都说十一点睡，结果刷手机刷到凌晨两点，第二天顶着黑眼圈上班，枕头在旁边看着我。',
        title: '两点还没睡',
        lines: ['再刷五分钟', '十一点就睡（假的）', '枕头在等我', '黑眼圈又深了'],
        ending: { low: '手机赢了，枕头等了一夜。今晚试试把充电线放远一点。', mid: '你成功在十二点前放下手机，进步很大。', high: '十一点准时入睡，黑眼圈终于淡了！' },
      },
    },

    /* ---------- 2. 办公室 ---------- */
    'office-night': {
      label: '办公室',
      artId: 'office-night',
      blurb: '职场、加班、改稿、需求、会议、deadline',
      palette: {
        bg: ['#0b1026', '#141a3d', '#1d2350'],
        grid: 'rgba(120,150,255,0.07)',
        accent: '#5ce1e6',
        accent2: '#ff6b9d',
        danger: '#ff5a6e',
        text: '#eef2ff',
        textDim: 'rgba(238,242,255,0.66)',
        glow: 'rgba(92,225,230,0.35)',
        playerRing: '#5ce1e6',
        collectibleGlow: '#5ce1e6',
        obstacleTint: '#ff6b9d',
        hud: 'rgba(20,26,61,0.72)',
        particle: ['#5ce1e6', '#8affc1', '#ffd166'],
        floor: 'rgba(92,225,230,0.12)',
      },
      player: 'office-worker',
      collectibles: ['ticket', 'coffee', 'coin', 'star'],
      obstacles: ['document', 'message-bubble', 'coffee-cup', 'red-pen'],
      modes: ['dodge', 'click', 'runner'],
      sample: {
        story: '老板一天改五遍需求，我们组五个人改到凌晨两点，就为了他一句“这里再小改一下”。第二天早上九点他问：进度呢？',
        title: '再小改一下',
        lines: ['这里再小改一下', '第五版了，第几版了？', '凌晨两点了，还有人吗', '进度呢？', '下班就在前方'],
        ending: { low: '今天先到这里，明天再和需求周旋。', mid: '你成功守住了一部分下班时间！', high: '准点下班大师，需求都追不上你！' },
      },
    },

    /* ---------- 3. 宿舍早八 ---------- */
    'dorm-morning': {
      label: '宿舍早八',
      artId: 'dorm-morning',
      blurb: '校园、宿舍、早八、起床、迟到、点名',
      palette: {
        bg: ['#0d2818', '#12402a', '#1b5c3a'],
        grid: 'rgba(160,255,200,0.07)',
        accent: '#7bf1a8',
        accent2: '#ffd166',
        danger: '#ff7b54',
        text: '#f0fff7',
        textDim: 'rgba(240,255,247,0.66)',
        glow: 'rgba(123,241,168,0.32)',
        playerRing: '#7bf1a8',
        collectibleGlow: '#ffd166',
        obstacleTint: '#ff7b54',
        hud: 'rgba(18,64,42,0.72)',
        particle: ['#7bf1a8', '#ffd166', '#a0e7ff'],
        floor: 'rgba(123,241,168,0.12)',
      },
      player: 'sleepy-head',
      collectibles: ['coffee', 'blanket', 'takeout-box', 'star'],
      obstacles: ['alarm-clock', 'homework', 'queue-rope', 'phone'],
      modes: ['dodge', 'runner', 'click'],
      sample: {
        story: '我们宿舍四个人都起不来床，早八的课设了七个闹钟还是迟到，最后是宿管阿姨敲门才把大家叫起来。',
        title: '第七个闹钟',
        lines: ['再睡五分钟', '第七个闹钟也阵亡了', '阿姨敲门了！全体起床！', '鞋穿反了也别停', '点名点到我了'],
        ending: { low: '你被闹钟彻底击溃，一觉睡到中午。明天试试把手机放到床下。', mid: '踩着铃声冲进教室，勉强算赢了。', high: '提前十分钟到教室，你就是早八战神！' },
      },
    },

    /* ---------- 4. 生日派对 ---------- */
    'birthday-party': {
      label: '生日派对',
      artId: 'birthday-party',
      blurb: '生日、庆祝、聚会、蛋糕、礼物、许愿',
      palette: {
        bg: ['#2a0b2e', '#451a4d', '#5c2760'],
        grid: 'rgba(255,180,230,0.08)',
        accent: '#ffb703',
        accent2: '#ff5d8f',
        danger: '#ff4d6d',
        text: '#fff5fb',
        textDim: 'rgba(255,245,251,0.68)',
        glow: 'rgba(255,183,3,0.35)',
        playerRing: '#ffb703',
        collectibleGlow: '#ffd166',
        obstacleTint: '#ff5d8f',
        hud: 'rgba(69,26,77,0.72)',
        particle: ['#ffb703', '#ff5d8f', '#9bf6ff'],
        floor: 'rgba(255,183,3,0.14)',
      },
      player: 'birthday-star',
      collectibles: ['gift', 'cake', 'candle', 'milk-tea'],
      obstacles: ['alarm-clock', 'dirty-dish', 'message-bubble', 'price-tag'],
      modes: ['dodge', 'click'],
      sample: {
        story: '小王特别爱喝奶茶，全糖去冰加珍珠，但他每次都迟到。今天是他生日，我们订了蛋糕准备整他一下。',
        title: '全糖去冰加珍珠',
        lines: ['生日快乐！', '全糖去冰加珍珠，谢谢', '又迟到了？蛋糕都等凉了', '先许愿，许完愿才有奶茶', '生日快乐，快吹蜡烛'],
        ending: { low: '蜡烛还没点上，派对就散场了，明年再战。', mid: '派对及格分！大家记得你最爱的奶茶口味。', high: '全场为你庆生，奶茶蛋糕全都到位！' },
      },
    },

    /* ---------- 5. 奶茶店 ---------- */
    'milk-tea-shop': {
      label: '奶茶店',
      artId: 'milk-tea-shop',
      blurb: '奶茶、点单、排队、加料、外卖',
      palette: {
        bg: ['#2b1a12', '#43261a', '#5c3a26'],
        grid: 'rgba(255,200,160,0.07)',
        accent: '#f2b880',
        accent2: '#e2725b',
        danger: '#d94f3d',
        text: '#fff7f0',
        textDim: 'rgba(255,247,240,0.68)',
        glow: 'rgba(242,184,128,0.35)',
        playerRing: '#f2b880',
        collectibleGlow: '#ffd9a0',
        obstacleTint: '#e2725b',
        hud: 'rgba(67,38,26,0.74)',
        particle: ['#f2b880', '#e2725b', '#fff1d6'],
        floor: 'rgba(242,184,128,0.14)',
      },
      player: 'commuter',
      collectibles: ['milk-tea', 'boba', 'coupon', 'takeout-box'],
      obstacles: ['queue-rope', 'price-tag', 'water-glass', 'coffee-cup'],
      modes: ['dodge', 'click'],
      sample: {
        story: '奶茶店排队四十分钟，前面那个人点了八杯还全是定制，我只要一杯去冰三分糖，结果做错了还要重新排。',
        title: '一杯去冰三分糖',
        lines: ['前面还有八杯', '去冰三分糖，谢谢', '这杯不是我的', '重新排一次吧', '终于拿到手了'],
        ending: { low: '奶茶没喝上，队伍倒是排够了。下次提前点单吧。', mid: '拿到奶茶了，虽然等了四十分钟。', high: '插空点单成功，成为奶茶店排队之王！' },
      },
    },

    /* ---------- 6. 通勤地铁 ---------- */
    'subway-commute': {
      label: '通勤地铁',
      artId: 'subway-commute',
      blurb: '地铁、通勤、挤、换乘、迟到、早高峰',
      palette: {
        bg: ['#0c1a2b', '#122a45', '#1a3a5c'],
        grid: 'rgba(140,200,255,0.07)',
        accent: '#5eb3f0',
        accent2: '#ffd166',
        danger: '#ff6b6b',
        text: '#eef7ff',
        textDim: 'rgba(238,247,255,0.66)',
        glow: 'rgba(94,179,240,0.35)',
        playerRing: '#5eb3f0',
        collectibleGlow: '#8fd3ff',
        obstacleTint: '#ff6b6b',
        hud: 'rgba(18,42,69,0.74)',
        particle: ['#5eb3f0', '#ffd166', '#8fd3ff'],
        floor: 'rgba(94,179,240,0.13)',
      },
      player: 'commuter',
      collectibles: ['seat', 'ticket', 'coffee', 'star'],
      obstacles: ['traffic-jam', 'queue-rope', 'message-bubble', 'rain-cloud'],
      modes: ['dodge', 'runner', 'click'],
      sample: {
        story: '早高峰地铁挤到怀疑人生，我被挤到门边脸贴着玻璃，还要在下一站想办法挤出去，每次到站都像一场拔河比赛。',
        title: '下一站，挤出去',
        lines: ['下一站，请提前做好准备', '别挤了，我脸贴玻璃上了', '让一让，我要下车！', '到站就像拔河', '终于出来了'],
        ending: { low: '你被挤回车厢深处，眼睁睁看着站台溜走。', mid: '成功挤下车，虽然鞋子掉了一只。', high: '游刃有余地穿过人潮，通勤大师！' },
      },
    },

    /* ---------- 7. 健身房 ---------- */
    'gym': {
      label: '健身房',
      artId: 'gym',
      blurb: '健身、减肥、撸铁、打卡、办卡不去',
      palette: {
        bg: ['#14161c', '#1e2330', '#2a3040'],
        grid: 'rgba(255,255,255,0.05)',
        accent: '#7dd35f',
        accent2: '#ffd166',
        danger: '#ff5c5c',
        text: '#f4f7f2',
        textDim: 'rgba(244,247,242,0.66)',
        glow: 'rgba(125,211,95,0.35)',
        playerRing: '#7dd35f',
        collectibleGlow: '#b6f09c',
        obstacleTint: '#ff5c5c',
        hud: 'rgba(30,35,48,0.76)',
        particle: ['#7dd35f', '#ffd166', '#b6f09c'],
        floor: 'rgba(125,211,95,0.13)',
      },
      player: 'gym-goer',
      collectibles: ['dumbbell', 'protein-shake', 'star', 'coin'],
      obstacles: ['weight-plate', 'fried-chicken', 'phone', 'water-glass'],
      modes: ['dodge', 'runner', 'click'],
      sample: {
        story: '我发誓这个月一定减肥，结果第一周就点了三次炸鸡，每次都说这是最后一顿，健身房年卡到现在只去过两次。',
        title: '这真的是最后一顿',
        lines: ['这是最后一顿，真的', '年卡去过两次，还剩三百天', '明天开始，一定开始', '先练腿还是先点外卖？', '吃饱了才有力气减肥'],
        ending: { low: '炸鸡赢了，年卡在钱包里默默流泪。', mid: '勉强练了半小时，晚上又没忍住。', high: '连续打卡成功，年卡终于回本了！' },
      },
    },

    /* ---------- 8. 考试教室 ---------- */
    'exam-classroom': {
      label: '考试教室',
      artId: 'exam-classroom',
      blurb: '考试、复习、背书、倒计时、成绩',
      palette: {
        bg: ['#171a14', '#23291c', '#303826'],
        grid: 'rgba(220,255,180,0.06)',
        accent: '#a3d977',
        accent2: '#ffd166',
        danger: '#e85d5d',
        text: '#f6faee',
        textDim: 'rgba(246,250,238,0.66)',
        glow: 'rgba(163,217,119,0.32)',
        playerRing: '#a3d977',
        collectibleGlow: '#d9f2b0',
        obstacleTint: '#e85d5d',
        hud: 'rgba(35,41,28,0.76)',
        particle: ['#a3d977', '#ffd166', '#d9f2b0'],
        floor: 'rgba(163,217,119,0.12)',
      },
      player: 'exam-taker',
      collectibles: ['answer-sheet', 'a-grade', 'coffee', 'star'],
      obstacles: ['exam-question', 'red-pen', 'alarm-clock', 'homework'],
      modes: ['dodge', 'click'],
      sample: {
        story: '考研倒计时三十天，图书馆六点半的座位全靠抢，我的室友凌晨四点就去占座，还给我带了一杯美式。',
        title: '六点半的座位',
        lines: ['六点半开门，冲！', '室友四点就来了', '这杯美式，是兄弟情', '座位是我的，谁也别抢', '还剩三十天，稳住'],
        ending: { low: '座位没抢到，美式也凉透了。明天四点再战。', mid: '抢到座位，复习效率勉强及格。', high: '连续三十天抢到第一排，你就是考研狠人！' },
      },
    },

    /* ---------- 9. 厨房 ---------- */
    'kitchen': {
      label: '厨房',
      artId: 'kitchen',
      blurb: '做饭、下厨、翻车、洗碗、宵夜',
      palette: {
        bg: ['#241512', '#3a211a', '#4f2f23'],
        grid: 'rgba(255,190,150,0.06)',
        accent: '#ff9f6b',
        accent2: '#ffd166',
        danger: '#e04b4b',
        text: '#fff4ec',
        textDim: 'rgba(255,244,236,0.68)',
        glow: 'rgba(255,159,107,0.35)',
        playerRing: '#ff9f6b',
        collectibleGlow: '#ffc98f',
        obstacleTint: '#e04b4b',
        hud: 'rgba(58,33,26,0.76)',
        particle: ['#ff9f6b', '#ffd166', '#ffc98f'],
        floor: 'rgba(255,159,107,0.13)',
      },
      player: 'chef',
      collectibles: ['fried-egg', 'noodle-bowl', 'takeout-box', 'star'],
      obstacles: ['scorched-pan', 'dirty-dish', 'water-glass', 'coffee-cup'],
      modes: ['dodge', 'click'],
      sample: {
        story: '我想给家人做一顿饭，结果煎蛋糊了、汤咸了、锅还烧黑了一个，最后全家一起吃泡面，都说泡面真香。',
        title: '煎蛋糊了',
        lines: ['这个火候应该没问题', '糊了，但还能吃', '盐放多了，加水吧', '锅底黑了一块', '还是泡面真香'],
        ending: { low: '厨房一片狼藉，最后全家点了外卖。', mid: '勉强凑出一桌菜，味道看运气。', high: '大厨附体，全家都说好吃！' },
      },
    },

    /* ---------- 10. 宠物客厅 ---------- */
    'pet-living-room': {
      label: '宠物客厅',
      artId: 'pet-living-room',
      blurb: '猫狗、宠物、铲屎官、拆家、卖萌',
      palette: {
        bg: ['#1f1a2b', '#2d2540', '#3d3255'],
        grid: 'rgba(230,200,255,0.06)',
        accent: '#c79bf0',
        accent2: '#ffb3c6',
        danger: '#ff7b7b',
        text: '#f9f4ff',
        textDim: 'rgba(249,244,255,0.68)',
        glow: 'rgba(199,155,240,0.35)',
        playerRing: '#c79bf0',
        collectibleGlow: '#e3c8ff',
        obstacleTint: '#ffb3c6',
        hud: 'rgba(45,37,64,0.76)',
        particle: ['#c79bf0', '#ffb3c6', '#e3c8ff'],
        floor: 'rgba(199,155,240,0.13)',
      },
      player: 'cat-owner',
      collectibles: ['cat-treat', 'fish', 'pillow', 'star'],
      obstacles: ['cat', 'water-glass', 'cardboard-box', 'phone'],
      modes: ['dodge', 'click'],
      sample: {
        story: '我的猫每天凌晨三点开演唱会，我拿着猫条追它，它躲开拖鞋还要把水杯推下桌，最后是我先睡着了。',
        title: '凌晨三点演唱会',
        lines: ['三点整，准时开唱', '猫条一响，它比谁都快', '水杯又要掉下去了', '这家里到底谁说了算', '它睡了，我醒了'],
        ending: { low: '猫赢了，水杯阵亡，你顶着黑眼圈上班。', mid: '用两根猫条换来了安静的一小时。', high: '成功把猫哄睡，你赢回了整晚安眠！' },
      },
    },

    /* ---------- 11. 旅行机场 ---------- */
    'travel-airport': {
      label: '旅行机场',
      artId: 'travel-airport',
      blurb: '旅行、机场、航班、行李、安检、延误',
      palette: {
        bg: ['#0d1a24', '#14303f', '#1c4459'],
        grid: 'rgba(150,230,255,0.07)',
        accent: '#4fd1e0',
        accent2: '#ffd166',
        danger: '#ff7b54',
        text: '#eefcff',
        textDim: 'rgba(238,252,255,0.66)',
        glow: 'rgba(79,209,224,0.34)',
        playerRing: '#4fd1e0',
        collectibleGlow: '#9deaf5',
        obstacleTint: '#ff7b54',
        hud: 'rgba(20,48,63,0.74)',
        particle: ['#4fd1e0', '#ffd166', '#9deaf5'],
        floor: 'rgba(79,209,224,0.13)',
      },
      player: 'traveler',
      collectibles: ['boarding-pass', 'window-seat', 'souvenir', 'star'],
      obstacles: ['turbulence', 'traffic-jam', 'cardboard-box', 'queue-rope'],
      modes: ['dodge', 'runner'],
      sample: {
        story: '去海边旅游五天，四天都在下雨，带的泳衣一次没穿，最后一天出太阳了，我们已经在返程的高铁上。',
        title: '泳衣白带了',
        lines: ['天气预报说是晴天', '泳衣又白带了', '酒店电视其实挺好看', '再等等，雨就停了', '最后一天出太阳了'],
        ending: { low: '五天假期四天雨，泳衣全程躺在行李箱里。', mid: '见到了半天的太阳，勉强算度假。', high: '抓住唯一的晴天，拍出了年度最佳照片！' },
      },
    },

    /* ---------- 12. 购物快递 ---------- */
    'parcel-delivery': {
      label: '购物快递',
      artId: 'parcel-delivery',
      blurb: '网购、快递、取件、剁手、优惠券',
      palette: {
        bg: ['#1c1410', '#2e2018', '#422e21'],
        grid: 'rgba(255,210,170,0.06)',
        accent: '#e8a45c',
        accent2: '#7dd3fc',
        danger: '#e05c5c',
        text: '#fff6ec',
        textDim: 'rgba(255,246,236,0.68)',
        glow: 'rgba(232,164,92,0.35)',
        playerRing: '#e8a45c',
        collectibleGlow: '#ffcf9a',
        obstacleTint: '#e05c5c',
        hud: 'rgba(46,32,24,0.76)',
        particle: ['#e8a45c', '#7dd3fc', '#ffcf9a'],
        floor: 'rgba(232,164,92,0.13)',
      },
      player: 'shopper',
      collectibles: ['parcel', 'coupon', 'coin', 'star'],
      obstacles: ['cardboard-box', 'price-tag', 'queue-rope', 'message-bubble'],
      modes: ['dodge', 'click'],
      sample: {
        story: '双十一我一口气下了十七个快递，驿站大哥都认识我了，他说你又来了，我说这次真的是最后一个。',
        title: '还有最后一个快递',
        lines: ['取件码多少来着', '你又来了？', '这次真的是最后一个', '驿站快装不下我了', '拆快递最快乐'],
        ending: { low: '快递没取完，取件码先过期了。', mid: '抱着一堆纸箱回家，手都勒红了。', high: '十七个快递全部到手，拆箱冠军！' },
      },
    },
  };

  /* 玩法元信息（引擎与前端共用） */
  const MODES = {
    'dodge': { label: '躲避收集', desc: '接取奖励，躲开障碍，坚持 45 秒', duration: 45000, lives: 3 },
    'runner': { label: '三路跑酷', desc: '在三条跑道间切换，冲过 45 秒', duration: 45000, lives: 3 },
    'click': { label: '限时点击', desc: '点掉目标，别碰干扰项', duration: 35000, lives: 3 },
  };

  function getScene(id) { return SCENES[id] || null; }
  function sceneIds() { return Object.keys(SCENES); }
  function scenesForMode(mode) {
    return Object.keys(SCENES).filter(function (id) { return SCENES[id].modes.indexOf(mode) !== -1; });
  }
  /* 该场景内可用的全部素材 ID（用于校验） */
  function sceneSprites(id) {
    const s = SCENES[id];
    if (!s) return null;
    return {
      player: [s.player],
      collectibles: s.collectibles.slice(),
      obstacles: s.obstacles.slice(),
    };
  }

  return {
    SCENES: SCENES,
    MODES: MODES,
    getScene: getScene,
    sceneIds: sceneIds,
    scenesForMode: scenesForMode,
    sceneSprites: sceneSprites,
  };
});
