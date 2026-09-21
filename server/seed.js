/* 预设游戏入库：启动时确保预设存在且为最新版本（幂等 + 可升级）。
 *
 * 预设属于产品内容，不可编辑（editTokenHash = null），因此升级预设配置时
 * 直接覆盖旧行是安全的 —— 用户生成的内容永远不被触碰。
 */
'use strict';

const db = require('./db.js');
const Schema = require('../shared/schema.js');
const { getValidatedPresets } = require('./presets.js');

function ensurePresets() {
  const now = Date.now();
  let created = 0;
  let upgraded = 0;
  for (const p of getValidatedPresets()) {
    const existing = db.getGame(p.id);
    const row = {
      id: p.id,
      configJson: JSON.stringify(p.config),
      schemaVersion: p.config.schemaVersion,
      source: 'preset',
      themeId: p.sceneId,
      mode: p.mode,
      sceneId: p.sceneId,
      editTokenHash: null,          // 预设不可编辑（属于产品内容，不属于任何人）
      createdAt: now,
      updatedAt: now,
    };
    if (!existing) {
      db.insertGame(row);
      created++;
      continue;
    }
    /* 已存在：只在"仍是预设 + 不是最新 schema"或配置内容变了时覆盖 */
    if (existing.source !== 'preset') continue;   // 同名用户游戏，不覆盖
    let sameContent = false;
    try {
      sameContent = existing.config_json === row.configJson;
    } catch (e) { sameContent = false; }
    if (!sameContent || existing.schema_version !== Schema.SCHEMA_VERSION || existing.mode !== p.mode) {
      db.replaceGame(row, existing.created_at);
      upgraded++;
    }
  }
  return { created, upgraded, total: db.countGames() };
}

module.exports = { ensurePresets };
