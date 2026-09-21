/* 100 条真实故事批量评测（第二轮任务书 P3 / 验收 #6）
 *
 * 覆盖：短输入、长输入、多人物、宠物、工作、生日、隐晦表达、矛盾故事。
 * 输出：输入、脱敏输出、结构合法性、语义一致性、失败分类、耗时、重试数。
 * 不保存、不泄露任何凭据。
 *
 * 用法：
 *   node scripts/eval-100.js --port 8770 --db ./data/eval.db --limit 100
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.EVAL_PORT || '8770', 10);
const DB = process.env.EVAL_DB || path.join(ROOT, 'data', 'eval.db');
const OUT = process.env.EVAL_OUT || path.join(ROOT, 'eval', 'results.json');
const CONCURRENCY = parseInt(process.env.EVAL_CONC || '3', 10);
const LIMIT = parseInt(process.env.EVAL_LIMIT || '100', 10);
/* 首批（pilot）：每种玩法各 5 条、显式指定玩法，用于确认设计与接口合理 */
const PILOT = process.env.EVAL_PILOT === '1';

/* ---------------- 100 条故事：按类型分组 ---------------- */
const STORIES = [
  /* ===== 工作 / 职场（18）===== */
  ['work', '老板一天改五遍需求，每次都说这是最后一版，结果第二天又推翻重来，我们组的进度条已经倒退了。'],
  ['work', '周报写了三千字，领导只回了一个"阅"，同事说他已经练到手不动就能按出这个字了。'],
  ['work', '开会两小时，讨论的核心是把会议改到明天再开，走出会议室的时候我甚至不知道今天的议题是什么。'],
  ['work', '甲方说要"五彩斑斓的黑"，设计改了十七版，最后选了第一版，还说这是他们启发的结果。'],
  ['work', '每天下班前五分钟，总有人发一句"这个今晚能给我吗"，我怀疑他是掐着表发的。'],
  ['work', '远程办公第三天，我的猫踩过键盘给同事发了一串乱码，同事回了个大拇指说收到。'],
  ['work', '工位对面的同事敲键盘声音像在打桩，我戴了降噪耳机还是能听见他的节奏，甚至开始跟着抖腿。'],
  ['work', '绩效考核面谈，领导说我这年"稳"，我不知道稳是夸我还是说我没进步，出门的时候心里空空的。'],
  ['work', '项目上线前一天发现数据库连的是测试环境，全组连夜排查，最后发现是我把配置文件改了。'],
  ['work', '我提了一个方案，会上没人说话，第二天领导在会上把我的方案重新讲了一遍，大家都说这个思路好。'],
  ['work', '实习生问我怎么才能不加班的秘诀，我想了半天，告诉他找一个不加班的工作。'],
  ['work', '每天早上打开电脑的第一件事是把昨天没做完的事再看一遍，然后决定今天继续不做。'],
  ['work', '打印机卡纸卡了四十分钟，维修师傅来了只看了一眼就抽出来了，他说这是今天第五台了。'],
  ['work', '团建去爬山，领导说这是放松，爬到一半我怀疑这是在筛选谁还有体力加班。'],
  ['work', '我把需求文档写得特别详细，产品经理看完说"你理解错了，我们再对一下"，然后打开了空白文档。'],
  ['work', '加班到晚上十点，电梯里遇到隔壁组的人，我们对视一眼谁也没说话，都知道对方为什么还在。'],
  ['work', '同事离职请吃散伙饭，饭桌上每个人都在问他新公司招不招人，包括我们的组长。'],
  ['work', '公司换了新的考勤系统，打卡必须连公司 wifi，我为了打卡在门口站了十五分钟。'],

  /* ===== 宠物（16）===== */
  ['pet', '我的猫每天凌晨三点开演唱会，我拿着猫条追它，它躲开拖鞋还要把水杯推下桌，最后是我先睡着了。'],
  ['pet', '狗子坚信每个快递都是给它买的，只要听到胶带声就从沙发上弹起来，比门铃反应还快。'],
  ['pet', '猫咪把我刚泡好的咖啡当成洗手池，爪子蘸了一下甩得到处都是，还看着我像是我的错。'],
  ['pet', '养了只仓鼠，它把囤的粮食全塞在腮帮子里，走路像揣了两个球，我怀疑它把整个家都搬走了。'],
  ['pet', '我家猫只在我开视频会议的时候跳上键盘，平时怎么叫都不理我。'],
  ['pet', '狗子第一次见到雪，兴奋地冲出去，三秒后又跑回来扒着门，表示这玩意儿太冷了。'],
  ['pet', '猫碗里明明有粮，它非要在旁边叫，我加了新粮它才吃，吃完又去看了一眼原来的碗。'],
  ['pet', '我给猫买了个两百块的猫窝，它一眼没看，睡在了装猫窝的纸箱里。'],
  ['pet', '遛狗遇到另一只狗，两只狗对视了很久，我和对面主人都很尴尬，最后谁也没动。'],
  ['pet', '家里的猫和鱼缸里的鱼互相盯着看，一盯就是半小时，我不知道这是友情还是狩猎准备。'],
  ['pet', '狗子听到"散步"两个字立刻精神，听到"洗澡"立刻装睡，演技可以拿奖。'],
  ['pet', '猫把我的耳机线咬断了三根，我把新买的第四根藏在抽屉里，它居然会开抽屉。'],
  ['pet', '半夜听到厨房有声音，我以为是老鼠，开灯发现是猫在翻垃圾桶，它看了我一眼继续翻。'],
  ['pet', '我家的仓鼠跑轮子跑到半夜，声音像有人在楼上拖动家具，我妈以为我们家闹鬼了。'],
  ['pet', '给猫剪指甲像打仗，剪完三个指甲我手上多了两道，它倒是睡得很香。'],
  ['pet', '狗子在外面吃了草，回家吐在了我的新地毯上，然后一脸无辜地看着我。'],

  /* ===== 生日 / 祝福（12）===== */
  ['birthday', '小王今天生日，她最爱喝奶茶，但总是迟到，我们打算给她一个必须准时到场的惊喜。'],
  ['birthday', '室友生日在期末考试周，我们只能在图书馆给她唱生日歌，被管理员请了出去。'],
  ['birthday', '朋友生日许愿说希望明年不再加班，吹蜡烛的时候风把愿望单吹跑了，她说这是天意。'],
  ['birthday', '给女朋友准备生日惊喜，蛋糕藏在了后备箱，结果一整天她都想开后备箱取东西。'],
  ['birthday', '我妈生日，我说送她一个包，她说不要浪费钱，然后发了一张她看中的包的截图。'],
  ['birthday', '同事生日订了蛋糕，快递送到的时候箱子被压塌了，奶油挤成了一朵云，我们照样吃了。'],
  ['birthday', '爷爷过生日说不办，结果那天来了四桌人，他嘴上嫌吵闹，笑得最开心。'],
  ['birthday', '闺蜜生日我订了一束花，结果送花小哥记错日期提前一天送到，她以为是谁表白了。'],
  ['birthday', '生日那天加班到十点，回到家发现室友在门口插了蜡烛，说再晚就烧完了。'],
  ['birthday', '我生日许了三个愿望，第一个是希望愿望能实现，后两个现在记不起来了。'],
  ['birthday', '小侄女过生日要一个公主蛋糕，店家做成了城堡，她哭着说这是房子不是公主。'],
  ['birthday', '给朋友送蛋糕的路上遇到下雨，我抱着蛋糕跑，到了发现盒子是湿的，蛋糕是好的。'],

  /* ===== 宿舍 / 校园（14）===== */
  ['dorm', '我们宿舍都起不来床，早八的闹钟响了七次，最后是楼下阿姨点名把我们叫起来的。'],
  ['dorm', '室友半夜两点打游戏开麦，说"我小声点"，结果声音更大了。'],
  ['dorm', '宿舍的插座只有四个，我们六个人抢着充电，后来发明了充电排班表。'],
  ['dorm', '期末考试前一晚，全宿舍决定六点起床复习，第二天十一点我们互相看着对方笑了。'],
  ['dorm', '室友煮泡面被查寝的阿姨发现，他说这是他的早饭，时间是下午三点。'],
  ['dorm', '宿舍的空调遥控器失踪了一个月，最后在冰箱里找到了，没人记得为什么。'],
  ['dorm', '我们宿舍养了一盆绿萝，六个人的照料方式不同，它在一个月内经历了过涝和过旱。'],
  ['dorm', '室友说要减肥，晚上点了三份外卖，说这是最后一次，然后第二天又点了。'],
  ['dorm', '早八的路上下起了雨，我们四个人撑着两把伞，最后四个人都湿了。'],
  ['dorm', '宿舍熄灯后卧谈会开始了，聊到凌晨三点，第二天所有人都说没睡好。'],
  ['dorm', '室友把袜子晾在了床头，第二天早上他找了二十分钟，最后发现挂在书包上了。'],
  ['dorm', '我们宿舍的门锁坏了，用一张卡片就能开，从此大家出门都带一张没用的卡。'],
  ['dorm', '大四收拾宿舍，翻出了大一时买的健身卡，一次都没用过，卡面还很新。'],
  ['dorm', '室友考完试说要睡一天，结果睡了整整二十个小时，我们差点叫救护车。'],

  /* ===== 家庭 / 厨房（12）===== */
  ['home', '我想给家人做一顿饭，结果煎蛋糊了、汤咸了、锅还烧黑了一个，最后全家一起吃泡面，都说泡面真香。'],
  ['home', '妈妈让我去买葱，我在菜市场转了三圈，买回来一把蒜苗，她说这个炒肉也行。'],
  ['home', '我爸第一次用电饭煲煮饭，忘了放水，米饭煮成了一块饼，他坚称这是锅巴。'],
  ['home', '家里的洗衣机坏了三天，全家人手洗衣服，我爸说这样能锻炼手臂。'],
  ['home', '我拖地的时候发现地板缝里有三年没找到的橡皮，它已经变成了化石的样子。'],
  ['home', '妈妈说冰箱里什么都有，我打开发现只有半根黄瓜和一罐不知道什么时候的酱。'],
  ['home', '弟弟写作业到十一点，我进去看发现他在给橡皮擦雕花纹。'],
  ['home', '家里养的绿植被我浇死了，我买了盆一模一样的，我妈到现在都没发现。'],
  ['home', '我爸学会用外卖软件以后，一天点了三次，我妈说他把二十年没吃过的都补回来了。'],
  ['home', '周末想睡懒觉，楼上开始装修，电钻声像直接钻进我的脑子里。'],
  ['home', '我把钥匙锁在了家里，等开锁师傅的两小时里，我在楼道里和邻居聊了三次天。'],
  ['home', '全家一起去超市，说好只买三样东西，结账的时候推车里堆成了小山。'],

  /* ===== 通勤 / 出行（10）===== */
  ['travel', '去海边旅游五天，四天都在下雨，带的泳衣一次没穿，最后一天出太阳了，我们已经在返程的高铁上。'],
  ['travel', '早高峰的地铁，我被挤得双脚离地，到站的时候发现自己被推到了另一个车厢。'],
  ['travel', '赶飞机起晚了，安检排队的时候前面的人把液体全掏出来慢慢装袋，我盯着手表心在滴血。'],
  ['travel', '坐高铁邻座的大哥一路打电话谈生意，说了六个小时，我甚至记住了他所有的项目名称。'],
  ['travel', '自驾出游导航把我导到了一条村道，路窄到后视镜刮到了树枝，还遇到了对面来的牛。'],
  ['travel', '在机场等了四个小时的延误通知，最后登机口换到了最远的一个。'],
  ['travel', '公交车快到站的时候我按了下车铃，司机说这站不停，我坐过了三站。'],
  ['travel', '出差住酒店，隔壁房间的闹钟从早上六点响到七点，我怀疑那人在用闹钟当广播。'],
  ['travel', '打车遇到司机师傅一路讲他年轻时候的故事，到地方了我有点不想下车。'],
  ['travel', '行李箱的轮子在机场坏了，我拖着一个瘸腿的箱子走了两公里。'],

  /* ===== 健康 / 健身（8）===== */
  ['health', '我发誓这个月一定减肥，结果第一周就点了三次炸鸡，每次都说这是最后一顿，健身房年卡到现在只去过两次。'],
  ['health', '办了健身卡的第一天，我在跑步机上走了十分钟，然后去楼下买了杯奶茶庆祝。'],
  ['health', '说要早睡，躺下以后刷手机刷到两点，看的还是关于早睡好处的文章。'],
  ['health', '体检查出轻微脂肪肝，医生让我少吃夜宵，当晚我点了份水煮菜外卖，加了份炸鸡。'],
  ['health', '开始跑步的第一天，我穿了新买的跑鞋，跑了八百米就回家了，鞋还挺好看的。'],
  ['health', '我妈买了体重秤，全家轮流称，最后把秤收起来说这东西影响心情。'],
  ['health', '说好一起健身的朋友，第三周就没了消息，我给他发消息他说在吃饭。'],
  ['health', '买了瑜伽垫，用它最多的时候是躺着看剧，垫子倒是很软。'],

  /* ===== 购物 / 快递（6）===== */
  ['shopping', '双十一买的东西到了七个包裹，我拆到手软，最后发现有四个是给猫买的。'],
  ['shopping', '快递放到了驿站，取件码发到了我三年前已经不用的手机上。'],
  ['shopping', '网上买衣服，模特穿是气质，我穿是刚下夜班，退货的时候还超重了。'],
  ['shopping', '为了凑满减我买了三件不需要的东西，最后发现比原价还贵。'],
  ['shopping', '等了一个月的包裹显示已签收，我在小区翻了三圈，最后发现它在门口花坛里。'],
  ['shopping', '超市打折我推着车冲进去，出来发现买的都是原价商品，打折的早被抢光了。'],

  /* ===== 隐晦表达（4）===== */
  ['subtle', '有些话不用说得太明白，比如"最近忙吗"，比如"在吗"，比如"这个周末有安排吗"。'],
  ['subtle', '他说"随便你"，我就知道接下来的每一条路都是错的。'],
  ['subtle', '群里没人回我的消息，过了一会儿大家开始聊别的话题，我把自己的那条默默撤回了。'],
  ['subtle', '她发来"我没事"，我盯着这三个字看了十分钟，然后打了电话过去。'],
];

/* 去重 + 截取 */
const seen = new Set();
const list = [];
for (const [kind, story] of STORIES) {
  const k = story.trim();
  if (seen.has(k)) continue;
  seen.add(k);
  list.push({ kind: kind, story: k });
  if (list.length >= LIMIT) break;
}
/* 失败重跑：EVAL_ONLY=文件名 时，从上次结果里挑出失败的条目重跑并合并 */
const ONLY_FROM = process.env.EVAL_ONLY_FROM || '';

/* 首批：每种玩法 5 条，显式指定玩法，用于确认设计与接口合理 */
const PILOT_LIST = (function () {
  const picks = [
    /* 躲避收集适合：躲需求、赶早八、收集礼物 */
    { kind: 'work', forceMode: 'dodge', story: '老板一天改五遍需求，每次都说这是最后一版，结果第二天又推翻重来，我们组的进度条已经倒退了。' },
    { kind: 'work', forceMode: 'dodge', story: '甲方说要"五彩斑斓的黑"，设计改了十七版，最后选了第一版，还说这是他们启发的结果。' },
    { kind: 'dorm', forceMode: 'dodge', story: '我们宿舍都起不来床，早八的闹钟响了七次，最后是楼下阿姨点名把我们叫起来的。' },
    { kind: 'pet', forceMode: 'dodge', story: '我的猫每天凌晨三点开演唱会，我拿着猫条追它，它躲开拖鞋还要把水杯推下桌，最后是我先睡着了。' },
    { kind: 'home', forceMode: 'dodge', story: '我想给家人做一顿饭，结果煎蛋糊了、汤咸了、锅还烧黑了一个，最后全家一起吃泡面，都说泡面真香。' },

    /* 三路跑酷适合：赶时间、赶车、赶场 */
    { kind: 'travel', forceMode: 'runner', story: '赶飞机起晚了，安检排队的时候前面的人把液体全掏出来慢慢装袋，我盯着手表心在滴血。' },
    { kind: 'dorm', forceMode: 'runner', story: '期末考试前一晚，全宿舍决定六点起床复习，第二天十一点我们互相看着对方笑了。' },
    { kind: 'health', forceMode: 'runner', story: '我发誓这个月一定减肥，结果第一周就点了三次炸鸡，每次都说这是最后一顿，健身房年卡到现在只去过两次。' },
    { kind: 'travel', forceMode: 'runner', story: '早高峰的地铁，我被挤得双脚离地，到站的时候发现自己被推到了另一个车厢。' },
    { kind: 'work', forceMode: 'runner', story: '每天下班前五分钟，总有人发一句"这个今晚能给我吗"，我怀疑他是掐着表发的。' },

    /* 限时点击适合：群聊整活、快速反应 */
    { kind: 'pet', forceMode: 'click', story: '猫碗里明明有粮，它非要在旁边叫，我加了新粮它才吃，吃完又去看了一眼原来的碗。' },
    { kind: 'work', forceMode: 'click', story: '开会两小时，讨论的核心是把会议改到明天再开，走出会议室的时候我甚至不知道今天的议题是什么。' },
    { kind: 'shopping', forceMode: 'click', story: '为了凑满减我买了三件不需要的东西，最后发现比原价还贵。' },
    { kind: 'subtle', forceMode: 'click', story: '群里没人回我的消息，过了一会儿大家开始聊别的话题，我把自己的那条默默撤回了。' },
    { kind: 'work', forceMode: 'click', story: '工位对面的同事敲键盘声音像在打桩，我戴了降噪耳机还是能听见他的节奏，甚至开始跟着抖腿。' },
  ];
  return picks;
})();

const ACTIVE_LIST = PILOT ? PILOT_LIST : list;

/* 重跑失败条目：读上次结果，只挑失败的，保留原 kind / 原索引，便于合并 */
function buildRetryList() {
  const prev = JSON.parse(fs.readFileSync(ONLY_FROM, 'utf8'));
  return prev.results.filter(r => !r.ok).map(r => ({ kind: r.kind, story: r.input, _retryOf: r.idx }));
}

/* ---------------- 启动服务 ---------------- */
function startServer() {
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), DB_PATH: DB, HOST: '127.0.0.1',
    GEN_PER_IP_LIMIT: '500', GEN_ENABLED: 'true', GEN_DAILY_LIMIT: '500',
    GEN_GLOBAL_CONCURRENCY: String(CONCURRENCY),
  });
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { env: env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', function () {});
  child.stderr.on('data', function (d) { process.stderr.write('[server] ' + d); });
  return child;
}

async function waitReady(base) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) return await r.json(); } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('服务启动超时');
}

/* ---------------- 单条评测 ---------------- */
async function evalOne(base, item, idx) {
  const t0 = Date.now();
  const rec = { idx: idx, kind: item.kind, input: item.story, inputChars: item.story.length };
  if (item.forceMode) rec.forceMode = item.forceMode;
  try {
    const payload = { story: item.story, mode: item.forceMode || 'auto' };
    const res = await fetch(base + '/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    rec.ms = Date.now() - t0;
    rec.status = res.status;
    const body = await res.json().catch(() => null);
    if (res.status === 201 && body) {
      rec.ok = true;
      rec.id = body.id;
      rec.mode = body.config && body.config.mode;
      rec.sceneId = body.config && body.config.sceneId;
      rec.attempts = body.attempts;
      /* 脱敏输出：只保留文案与素材 ID，不含任何凭据 */
      rec.output = {
        title: body.config.title,
        intro: body.config.intro,
        ruleText: body.config.ruleText,
        mode: body.config.mode,
        sceneId: body.config.sceneId,
        player: body.config.player,
        collectible: body.config.collectible,
        obstacle: body.config.obstacle,
        lines: body.config.lines,
        ending: body.config.ending,
      };
    } else {
      rec.ok = false;
      rec.error = body && body.error ? body.error.code : ('http_' + res.status);
      rec.errorMsg = body && body.error ? body.error.message : '';
    }
  } catch (e) {
    rec.ms = Date.now() - t0;
    rec.ok = false;
    rec.error = 'client_error';
    rec.errorMsg = String(e && e.message || e);
  }
  /* 绝不留存凭据字段 */
  delete rec.editToken;
  return rec;
}

/* ---------------- 主流程 ---------------- */
async function main() {
  console.log('=== 100 条故事批量评测 ===');
  const activeList = ONLY_FROM ? buildRetryList() : ACTIVE_LIST;
  console.log('条目数:', activeList.length, '| 并发:', CONCURRENCY, '| 端口:', PORT,
    '| 模式:', ONLY_FROM ? ('重跑失败(' + ONLY_FROM + ')') : (PILOT ? '首批(指定玩法)' : '正式批(自动匹配)'));
  const kinds = {};
  activeList.forEach(x => { kinds[x.kind] = (kinds[x.kind] || 0) + 1; });
  console.log('类型分布:', JSON.stringify(kinds));

  const child = startServer();
  const base = 'http://127.0.0.1:' + PORT;
  let health = null;
  try {
    health = await waitReady(base);
    console.log('服务就绪，模型:', health.model, '| 生成开关:', health.generationEnabled);
    if (!health.modelConfigured) {
      console.error('模型未配置，无法评测'); process.exitCode = 2; return;
    }

    const results = [];
    let cursor = 0;
    async function worker() {
      while (true) {
        const i = cursor++;
        if (i >= ACTIVE_LIST.length) return;
        const rec = await evalOne(base, ACTIVE_LIST[i], i);
        results.push(rec);
        const mark = rec.ok ? '✓' : '✗';
        console.log(mark + ' [' + String(rec.idx + 1).padStart(3) + '/' + ACTIVE_LIST.length + '] ' + rec.kind.padEnd(9) +
          ' ' + String(rec.ms).padStart(6) + 'ms ' + (rec.ok ? (rec.mode + '/' + rec.sceneId + ' 《' + rec.output.title + '》') : (rec.error + ' ' + (rec.errorMsg || ''))));
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    results.sort((a, b) => a.idx - b.idx);

    /* ---------------- 汇总 ---------------- */
    const total = results.length;
    const okN = results.filter(r => r.ok).length;
    const structRate = okN / total;
    const fails = results.filter(r => !r.ok);
    const byErr = {};
    fails.forEach(f => { byErr[f.error] = (byErr[f.error] || 0) + 1; });
    const times = results.filter(r => r.ok).map(r => r.ms).sort((a, b) => a - b);
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const p = q => times.length ? times[Math.min(times.length - 1, Math.floor(times.length * q))] : 0;
    const retries = results.filter(r => r.ok && r.attempts > 1).length;
    const modeDist = {}, sceneDist = {};
    results.filter(r => r.ok).forEach(r => {
      modeDist[r.mode] = (modeDist[r.mode] || 0) + 1;
      sceneDist[r.sceneId] = (sceneDist[r.sceneId] || 0) + 1;
    });
    const titles = results.filter(r => r.ok).map(r => r.output.title);
    const uniqTitles = new Set(titles).size;
    const byKind = {};
    results.forEach(r => {
      byKind[r.kind] = byKind[r.kind] || { n: 0, ok: 0 };
      byKind[r.kind].n++;
      if (r.ok) byKind[r.kind].ok++;
    });

    const summary = {
      generatedAt: new Date().toISOString(),
      model: health.model,
      provider: health.provider,
      total: total, ok: okN, failed: fails.length,
      structuralValidityRate: +(structRate * 100).toFixed(1),
      ms: { avg: avg, p50: p(0.5), p90: p(0.9), min: times[0] || 0, max: times[times.length - 1] || 0 },
      retriedCount: retries,
      titleUniqueness: titles.length ? +(uniqTitles / titles.length * 100).toFixed(1) : 0,
      modeDistribution: modeDist,
      sceneDistribution: sceneDist,
      errorBreakdown: byErr,
      byKind: byKind,
      tokenUsage: 'unknown（服务未返回 token 用量，未做估算）',
      notes: '原始故事仅作为输入记录在本地评测文件中，未写入产品数据库。',
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ summary: summary, results: results }, null, 1), 'utf8');

    console.log('\n================ 汇总 ================');
    console.log('结构合法率:', summary.structuralValidityRate + '%', '(' + okN + '/' + total + ')');
    console.log('失败:', fails.length, fails.length ? JSON.stringify(byErr) : '');
    console.log('耗时: 平均', avg + 'ms', '| p50', summary.ms.p50 + 'ms', '| p90', summary.ms.p90 + 'ms', '| 区间', summary.ms.min + '-' + summary.ms.max + 'ms');
    console.log('修复重试条数:', retries);
    console.log('标题去重:', summary.titleUniqueness + '%', '(' + uniqTitles + '/' + titles.length + ')');
    console.log('玩法分布:', JSON.stringify(modeDist));
    console.log('场景分布:', JSON.stringify(sceneDist));
    console.log('按类型:', JSON.stringify(byKind));
    console.log('token 用量:', summary.tokenUsage);
    console.log('结果已写入:', OUT);
  } finally {
    try { child.kill(); } catch (e) {}
  }
}

main().catch(function (e) { console.error('评测失败:', e && e.stack || e); process.exitCode = 1; });
