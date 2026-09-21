# 素材与第三方来源说明

本项目按任务书要求，**全部视觉素材均为程序绘制的矢量图形**，没有使用任何外部图片文件、
图标库、字体文件或付费素材。

## 一、程序绘制素材

以下内容全部由本仓库源码在运行时用 Canvas 2D 绘制，属于本项目原创：

| 类别 | 数量 | 绘制实现位置 |
|---|---|---|
| 12 套场景背景 | 12 | `public/js/art-scenes.js` |
| 障碍图案 | 21 | `public/js/art-scenes.js` + `public/js/theme.js` |
| 奖励图案 | 27 | `public/js/art-scenes.js` + `public/js/theme.js` |
| 主角形象 | 12 | `public/js/theme.js` |
| 分享卡版式 | — | `public/js/app.js` |
| 二维码 | — | `public/js/qr.js`（自研零依赖编码器，非模型绘制） |

这些绘制代码受本仓库 MIT 许可证覆盖，可自由使用。

## 二、字体

界面与卡片使用**系统字体栈**（`system-ui`、`-apple-system`、`PingFang SC` 等），
不打包、不分发任何字体文件，因此不涉及字体授权。

## 三、音效

`public/js/audio.js` 使用 Web Audio API 的振荡器与包络**实时合成**音效，
不包含任何音频文件，不涉及采样授权。

## 四、图标

`public/img/favicon.svg` 为本项目手写的 SVG，未使用第三方图标集。

## 五、运行时依赖

**零 npm 依赖**：只使用 Node.js 内置模块（`node:http`、`node:sqlite`、`node:crypto`、原生 `fetch`）
与浏览器标准 API（Canvas 2D、Pointer Events、Web Audio、Clipboard）。前端无构建步骤。

## 六、模型生成的内容

游戏文案（标题、简介、台词、结算语）由用户配置的大模型在运行时生成，
**不存在于本仓库中**。仓库内的 `eval/` 目录是测试期间生成的评测记录，
其输出文本由模型产生、输入故事为测试用合成文本（不含任何真实个人信息）。

## 七、许可证

- 本项目代码：**MIT**（见 `LICENSE`）
- 上述程序绘制素材：同样以 MIT 授权
