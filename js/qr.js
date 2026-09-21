/* 二维码编码器（QR Code Model 2）：byte mode（UTF-8 字节流）、纠错等级 L/M/Q/H、版本 1-40 自动选择。
 * 零依赖、ES5 风格，按 ISO/IEC 18004 实现：数据编码 → Reed-Solomon 纠错 → 纠错分块交织 →
 * 8 种掩码罚分择优 → 功能图案 / 格式信息（BCH 15,5）/ 版本信息（BCH 18,6）。
 * UMD 包装：浏览器挂 window.GengQR，Node 走 module.exports。
 * 主接口 encode(text, opts) -> { size, version, ec, mask, modules }（modules[y][x] === true 表示黑）；
 * 便利接口 toCanvas(ctx, text, sizePx, opts) 直接绘制到 canvas（自带 quiet zone，返回编码结果）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GengQR = factory();
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  /* ============================ UTF-8 编码 ============================ */
  /* 字符串 → UTF-8 字节数组；孤立代理项用 U+FFFD 替换，避免产生非法字节序列。 */
  function utf8Bytes(str) {
    var out = [];
    var i, c, c2, cp;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      } else if (c >= 0xD800 && c <= 0xDBFF) {
        c2 = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
        if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
          cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
          out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
                   0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
          i++;
        } else {
          out.push(0xEF, 0xBF, 0xBD);
        }
      } else if (c >= 0xDC00 && c <= 0xDFFF) {
        out.push(0xEF, 0xBF, 0xBD);
      } else {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return out;
  }

  /* ============================ 比特缓冲 ============================ */
  function BitBuffer() { this.bits = []; }
  BitBuffer.prototype.put = function (val, len) {
    for (var i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1);
  };
  BitBuffer.prototype.length = function () { return this.bits.length; };

  /* ======================= GF(256) 与 Reed-Solomon ======================= */
  /* 本原多项式 0x11D；用对数/指数表做乘除。 */
  var GF_EXP = new Array(256);
  var GF_LOG = new Array(256);
  (function () {
    var x = 1, i;
    for (i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x = (x << 1) ^ ((x >>> 7) * 0x11D);
    }
    GF_EXP[255] = GF_EXP[0];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
  }

  /* 生成多项式 ∏(x - r^i)，i = 0..degree-1，返回降幂系数（最高次项恒为 1，已省略）。 */
  function rsDivisor(degree) {
    var result = new Array(degree);
    var i, j, root = 1;
    for (i = 0; i < degree; i++) result[i] = 0;
    result[degree - 1] = 1;
    for (i = 0; i < degree; i++) {
      for (j = 0; j < degree; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }

  /* 数据码字 → degree 个纠错码字（多项式长除法取余）。 */
  function rsRemainder(data, divisor) {
    var result = new Array(divisor.length);
    var i, j, factor;
    for (i = 0; i < divisor.length; i++) result[i] = 0;
    for (i = 0; i < data.length; i++) {
      factor = data[i] ^ result[0];
      for (j = 0; j < result.length - 1; j++) result[j] = result[j + 1];
      result[result.length - 1] = 0;
      for (j = 0; j < result.length; j++) result[j] ^= gfMul(divisor[j], factor);
    }
    return result;
  }

  /* ============================ 标准参数表 ============================ */
  /* 索引顺序：L=0, M=1, Q=2, H=3（下标 0 占位，版本从 1 开始） */
  var EC_LEVELS = ['L', 'M', 'Q', 'H'];
  /* 格式信息里的纠错等级编码（标准规定的 2 bit 值） */
  var EC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  /* 每块纠错码字数 ECC_CODEWORDS_PER_BLOCK[ec][version] */
  var ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  /* 纠错分块数 NUM_ERROR_CORRECTION_BLOCKS[ec][version] */
  var NUM_EC_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];

  /* 版本 v 的原始数据模块数（不含功能图案与格式/版本信息） */
  function numRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  function numRawCodewords(ver) { return Math.floor(numRawDataModules(ver) / 8); }
  function eccPerBlock(ver, ecIdx) { return ECC_CODEWORDS_PER_BLOCK[ecIdx][ver]; }
  function blockCount(ver, ecIdx) { return NUM_EC_BLOCKS[ecIdx][ver]; }
  function numDataCodewords(ver, ecIdx) {
    return numRawCodewords(ver) - eccPerBlock(ver, ecIdx) * blockCount(ver, ecIdx);
  }

  /* 对齐图案中心坐标（版本 1 无对齐图案） */
  function alignPositions(ver) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    var pos;
    for (pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  /* 格式信息：5 bit 数据 → BCH(15,5)，掩码 0x5412；返回 15 bit */
  function formatBits(ecIdx, mask) {
    var data = (EC_FORMAT_BITS[EC_LEVELS[ecIdx]] << 3) | mask;
    var rem = data;
    var i;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }

  /* 版本信息：6 bit 版本号 → BCH(18,6)，生成多项式 0x1F25；返回 18 bit */
  function versionBits(ver) {
    var rem = ver;
    var i;
    for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    return (ver << 12) | rem;
  }

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  /* ============================ 数据编码 ============================ */
  /* byte mode：模式指示符 0100 + 字符计数（版本 1-9 为 8 bit，10+ 为 16 bit）+ UTF-8 字节流。
   * 之后依次做：终止符 → 补零到字节边界 → 填充字节 0xEC/0x11 交替至容量上限。 */
  function encodeDataCodewords(bytes, ver, ecIdx) {
    var capacityBits = numDataCodewords(ver, ecIdx) * 8;
    var ccBits = ver < 10 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 > capacityBits) return null;

    var bb = new BitBuffer();
    var i, j, b;
    bb.put(4, 4);
    bb.put(bytes.length, ccBits);
    for (i = 0; i < bytes.length; i++) bb.put(bytes[i], 8);
    for (i = 0; i < 4 && bb.length() < capacityBits; i++) bb.put(0, 1);
    while (bb.length() % 8 !== 0) bb.put(0, 1);

    var bits = bb.bits;
    var out = [];
    for (i = 0; i < bits.length; i += 8) {
      b = 0;
      for (j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      out.push(b);
    }
    var pad = [0xEC, 0x11], p = 0;
    while (out.length < capacityBits / 8) { out.push(pad[p]); p ^= 1; }
    return out;
  }

  /* 纠错分块 + 交织：短块补一个 0 占位，交织时跳过该占位字节。 */
  function addEccAndInterleave(dataCodewords, ver, ecIdx) {
    var numBlocks = blockCount(ver, ecIdx);
    var blockEccLen = eccPerBlock(ver, ecIdx);
    var rawCodewords = numRawCodewords(ver);
    var numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var divisor = rsDivisor(blockEccLen);
    var blocks = [];
    var i, j, k = 0, dat, ecc, block;
    for (i = 0; i < numBlocks; i++) {
      var datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      dat = dataCodewords.slice(k, k + datLen);
      k += datLen;
      if (dat.length !== datLen) throw new Error('数据码字数量与版本表不符');
      ecc = rsRemainder(dat, divisor);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    var result = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (j = 0; j < numBlocks; j++) {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][i]);
      }
    }
    return result;
  }

  /* ============================ 矩阵与功能图案 ============================ */
  function makeMatrix(n) {
    var m = new Array(n), i, j, row;
    for (i = 0; i < n; i++) {
      row = new Array(n);
      for (j = 0; j < n; j++) row[j] = false;
      m[i] = row;
    }
    return m;
  }

  function setFn(modules, isFn, size, x, y, dark) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    isFn[y][x] = true;
  }

  /* 定位图案：以 (x,y) 为中心的 7×7（含外侧白色分隔带，按半径 4 绘制） */
  function drawFinder(modules, isFn, size, x, y) {
    var dx, dy, dist;
    for (dy = -4; dy <= 4; dy++) {
      for (dx = -4; dx <= 4; dx++) {
        dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(modules, isFn, size, x + dx, y + dy, dist !== 2 && dist !== 4);
      }
    }
  }

  /* 对齐图案：以 (x,y) 为中心的 5×5 */
  function drawAlignment(modules, isFn, size, x, y) {
    var dx, dy;
    for (dy = -2; dy <= 2; dy++) {
      for (dx = -2; dx <= 2; dx++) {
        setFn(modules, isFn, size, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  /* 格式信息：两份拷贝（左上绕角 + 左下/右上） */
  function drawFormatBits(modules, isFn, size, ecIdx, mask) {
    var bits = formatBits(ecIdx, mask);
    var i;
    for (i = 0; i <= 5; i++) setFn(modules, isFn, size, 8, i, getBit(bits, i));
    setFn(modules, isFn, size, 8, 7, getBit(bits, 6));
    setFn(modules, isFn, size, 8, 8, getBit(bits, 7));
    setFn(modules, isFn, size, 7, 8, getBit(bits, 8));
    for (i = 9; i < 15; i++) setFn(modules, isFn, size, 14 - i, 8, getBit(bits, i));

    for (i = 0; i < 8; i++) setFn(modules, isFn, size, size - 1 - i, 8, getBit(bits, i));
    for (i = 8; i < 15; i++) setFn(modules, isFn, size, 8, size - 15 + i, getBit(bits, i));
    setFn(modules, isFn, size, 8, size - 8, true); /* 固定黑模块 */
  }

  /* 版本信息（版本 7+）：两份 6×3 拷贝 */
  function drawVersionBits(modules, isFn, size, ver) {
    if (ver < 7) return;
    var bits = versionBits(ver);
    var i, a, b;
    for (i = 0; i < 18; i++) {
      a = size - 11 + (i % 3);
      b = Math.floor(i / 3);
      setFn(modules, isFn, size, a, b, getBit(bits, i));
      setFn(modules, isFn, size, b, a, getBit(bits, i));
    }
  }

  function drawFunctionPatterns(modules, isFn, size, ver, ecIdx) {
    var i, j, pos = alignPositions(ver), n = pos.length;
    /* 时序图案 */
    for (i = 0; i < size; i++) {
      setFn(modules, isFn, size, 6, i, i % 2 === 0);
      setFn(modules, isFn, size, i, 6, i % 2 === 0);
    }
    /* 三个定位图案（会覆盖部分时序图案） */
    drawFinder(modules, isFn, size, 3, 3);
    drawFinder(modules, isFn, size, size - 4, 3);
    drawFinder(modules, isFn, size, 3, size - 4);
    /* 对齐图案（跳过三个定位图案角落） */
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if (!((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0))) {
          drawAlignment(modules, isFn, size, pos[i], pos[j]);
        }
      }
    }
    /* 先画占位格式信息（掩码 0），保证数据区正确避让，正式值在掩码选择后覆盖 */
    drawFormatBits(modules, isFn, size, ecIdx, 0);
    drawVersionBits(modules, isFn, size, ver);
  }

  /* 之字形逐位放置码字：从右下角开始，两列一组，遇第 6 列（时序图案）左移一格 */
  function drawCodewords(modules, isFn, size, codewords) {
    var i = 0, right, vert, j, x, y, upward;
    for (right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          x = right - j;
          upward = ((right + 1) & 2) === 0;
          y = upward ? size - 1 - vert : vert;
          if (!isFn[y][x] && i < codewords.length * 8) {
            modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
            i++;
          }
          /* 剩余位（0-7 个）保持浅色，随后同样参与掩码 */
        }
      }
    }
  }

  /* ============================ 掩码与罚分 ============================ */
  function maskInvert(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      default: throw new Error('非法掩码：' + mask);
    }
  }

  function applyMask(modules, isFn, size, mask) {
    var x, y;
    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        if (!isFn[y][x] && maskInvert(mask, x, y)) modules[y][x] = !modules[y][x];
      }
    }
  }

  /* 标准罚分规则：N1=3（连排）、N2=3（2×2 同色块）、N3=40（疑似定位图案）、N4=10（黑白失衡） */
  var PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

  function finderPenaltyCount(runHistory) {
    var n = runHistory[1];
    var core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 &&
               runHistory[4] === n && runHistory[5] === n;
    return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
           (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
  }

  function finderPenaltyAddHistory(len, runHistory, size) {
    if (runHistory[0] === 0) len += size; /* 行首补浅色边 */
    runHistory.pop();
    runHistory.unshift(len);
  }

  function finderPenaltyTerminate(runColor, runLen, runHistory, size) {
    if (runColor) {
      finderPenaltyAddHistory(runLen, runHistory, size);
      runLen = 0;
    }
    runLen += size; /* 行尾补浅色边 */
    finderPenaltyAddHistory(runLen, runHistory, size);
    return finderPenaltyCount(runHistory);
  }

  function penaltyScore(modules, size) {
    var result = 0, x, y, runColor, runX, runHistory, color, dark = 0, total, k5;

    for (y = 0; y < size; y++) {
      runColor = false; runX = 0; runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (x = 0; x < size; x++) {
        if (modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += PENALTY_N1;
          else if (runX > 5) result++;
        } else {
          finderPenaltyAddHistory(runX, runHistory, size);
          if (!runColor) result += finderPenaltyCount(runHistory) * PENALTY_N3;
          runColor = modules[y][x];
          runX = 1;
        }
      }
      result += finderPenaltyTerminate(runColor, runX, runHistory, size) * PENALTY_N3;
    }
    for (x = 0; x < size; x++) {
      runColor = false; runX = 0; runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (y = 0; y < size; y++) {
        if (modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += PENALTY_N1;
          else if (runX > 5) result++;
        } else {
          finderPenaltyAddHistory(runX, runHistory, size);
          if (!runColor) result += finderPenaltyCount(runHistory) * PENALTY_N3;
          runColor = modules[y][x];
          runX = 1;
        }
      }
      result += finderPenaltyTerminate(runColor, runX, runHistory, size) * PENALTY_N3;
    }

    for (y = 0; y < size - 1; y++) {
      for (x = 0; x < size - 1; x++) {
        color = modules[y][x];
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) {
          result += PENALTY_N2;
        }
      }
    }

    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) if (modules[y][x]) dark++;
    }
    total = size * size;
    k5 = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k5 * PENALTY_N4;
    return result;
  }

  /* ============================ 主流程 ============================ */
  function normalizeEc(ec) {
    var v = (ec == null ? 'M' : String(ec)).toUpperCase();
    if (EC_LEVELS.indexOf(v) < 0) throw new Error('不支持的纠错等级：' + ec + '（可用 L/M/Q/H）');
    return v;
  }

  function fits(bytes, ver, ecIdx) {
    return 4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= numDataCodewords(ver, ecIdx) * 8;
  }

  function encode(text, opts) {
    var o = opts || {};
    var ecName = normalizeEc(o.ec);
    var ecIdx = EC_LEVELS.indexOf(ecName);
    var bytes = utf8Bytes(String(text));

    var ver = o.version ? Math.floor(o.version) : 0;
    if (ver) {
      if (ver < 1 || ver > 40) throw new Error('版本范围 1-40');
      if (!fits(bytes, ver, ecIdx)) {
        throw new Error('内容超出指定版本 v' + ver + '-' + ecName + ' 的容量（' + bytes.length + ' 字节）');
      }
    } else {
      ver = 1;
      while (ver <= 40 && !fits(bytes, ver, ecIdx)) ver++;
      if (ver > 40) throw new Error('内容过长，超出 v40-' + ecName + ' 容量（' + bytes.length + ' 字节）');
    }

    var dataCodewords = encodeDataCodewords(bytes, ver, ecIdx);
    var allCodewords = addEccAndInterleave(dataCodewords, ver, ecIdx);

    var size = ver * 4 + 17;
    var modules = makeMatrix(size);
    var isFn = makeMatrix(size);
    drawFunctionPatterns(modules, isFn, size, ver, ecIdx);
    drawCodewords(modules, isFn, size, allCodewords);

    var mask = Math.floor(o.mask == null ? -1 : o.mask);
    if (mask >= 0) {
      if (mask > 7) throw new Error('掩码范围 0-7');
      applyMask(modules, isFn, size, mask);
      drawFormatBits(modules, isFn, size, ecIdx, mask);
    } else {
      var best = 0, minPenalty = Infinity, i, p;
      for (i = 0; i < 8; i++) {
        applyMask(modules, isFn, size, i);
        drawFormatBits(modules, isFn, size, ecIdx, i);
        p = penaltyScore(modules, size);
        if (p < minPenalty) { best = i; minPenalty = p; }
        applyMask(modules, isFn, size, i); /* 异或回滚 */
      }
      mask = best;
      applyMask(modules, isFn, size, mask);
      drawFormatBits(modules, isFn, size, ecIdx, mask);
    }

    return { size: size, version: ver, ec: ecName, mask: mask, modules: modules };
  }

  /* ============================ Canvas 绘制 ============================ */
  /* 把二维码画到 2D 上下文：先铺浅色底，再按模块整数倍缩放逐格填深色，
   * 四周自动留 quiet zone（默认 4 模块），并整体居中。返回 encode 的结果对象。 */
  function toCanvas(ctx, text, sizePx, opts) {
    if (!ctx || typeof ctx.fillRect !== 'function') throw new Error('toCanvas 需要 2D canvas 上下文');
    var o = opts || {};
    var qr = encode(text, o);
    var quiet = o.quiet == null ? 4 : Math.max(0, Math.floor(o.quiet));
    var px = Math.max(1, Math.floor(sizePx));
    var total = qr.size + quiet * 2;
    var scale = Math.max(1, Math.floor(px / total));
    var drawn = scale * total;
    /* x/y 为该二维码左上角的画布坐标（缺省 0,0 = 画布左上角）。
     * 内部仍按 (0,0) 起算，靠 translate 落到目标位置，避免调用方自己偏移。 */
    var bx = Math.floor(o.x || 0);
    var by = Math.floor(o.y || 0);
    var ox = Math.floor((px - drawn) / 2);
    var oy = Math.floor((px - drawn) / 2);
    var dark = o.dark || '#000000';
    var light = o.light || '#ffffff';
    var x, y;

    ctx.save();
    ctx.translate(bx, by);
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, drawn, drawn);
    ctx.fillStyle = dark;
    for (y = 0; y < qr.size; y++) {
      for (x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) {
          ctx.fillRect(ox + (quiet + x) * scale, oy + (quiet + y) * scale, scale, scale);
        }
      }
    }
    ctx.restore();
    return qr;
  }

  return {
    encode: encode,
    toCanvas: toCanvas,
    utf8Bytes: utf8Bytes,
    EC_LEVELS: EC_LEVELS
  };
});
