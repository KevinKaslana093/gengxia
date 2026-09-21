/* SQLite 持久化（node:sqlite，零依赖）。
 * 只存：配置、创建时间、版本、来源、编辑凭据哈希。绝不存原始故事。 */
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let db = null;

function open(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id              TEXT PRIMARY KEY,
      config_json     TEXT NOT NULL,
      schema_version  INTEGER NOT NULL,
      source          TEXT NOT NULL,
      theme_id        TEXT NOT NULL,
      edit_token_hash TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS counters (
      k TEXT PRIMARY KEY,
      v INTEGER NOT NULL
    );
  `);
  /* v2 迁移：老库没有 mode / scene_id 列。theme_id 保留（存 sceneId 供索引用）。 */
  const cols = db.prepare('PRAGMA table_info(games)').all().map(function (r) { return r.name; });
  if (cols.indexOf('mode') === -1) db.exec("ALTER TABLE games ADD COLUMN mode TEXT NOT NULL DEFAULT 'dodge'");
  if (cols.indexOf('scene_id') === -1) db.exec("ALTER TABLE games ADD COLUMN scene_id TEXT NOT NULL DEFAULT 'office-night'");
  return db;
}

function requireDb() {
  if (!db) throw new Error('数据库未初始化：请先调用 open()');
  return db;
}

function insertGame(g) {
  requireDb().prepare(
    'INSERT INTO games (id, config_json, schema_version, source, theme_id, mode, scene_id, edit_token_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(g.id, g.configJson, g.schemaVersion, g.source, g.themeId, g.mode || 'dodge', g.sceneId || 'office-night', g.editTokenHash, g.createdAt, g.updatedAt);
}

function getGame(id) {
  return requireDb().prepare(
    'SELECT id, config_json, schema_version, source, theme_id, mode, scene_id, edit_token_hash, created_at, updated_at FROM games WHERE id = ?'
  ).get(id) || null;
}

function updateGameConfig(id, configJson, updatedAt) {
  requireDb().prepare('UPDATE games SET config_json = ?, updated_at = ? WHERE id = ?').run(configJson, updatedAt, id);
}

/* 覆盖整行（仅用于预设升级：预设不属于任何用户，覆盖是安全的） */
function replaceGame(g, keepCreatedAt) {
  requireDb().prepare(
    'UPDATE games SET config_json = ?, schema_version = ?, source = ?, theme_id = ?, mode = ?, scene_id = ?, edit_token_hash = ?, created_at = ?, updated_at = ? WHERE id = ?'
  ).run(g.configJson, g.schemaVersion, g.source, g.themeId, g.mode || 'dodge', g.sceneId || 'office-night', g.editTokenHash, keepCreatedAt || g.createdAt, g.updatedAt, g.id);
}

function deleteGame(id) {
  requireDb().prepare('DELETE FROM games WHERE id = ?').run(id);
}

function countGames() {
  return requireDb().prepare('SELECT COUNT(*) AS c FROM games').get().c;
}

/* 列出全部游戏（按创建时间倒序），供首页画廊使用 */
function listGames(limit) {
  const n = Math.max(1, Math.min(200, limit || 50));
  return requireDb().prepare(
    'SELECT id, config_json, schema_version, source, theme_id, mode, scene_id, edit_token_hash, created_at, updated_at FROM games ORDER BY created_at DESC LIMIT ?'
  ).all(n);
}

function incrCounter(key, delta) {
  requireDb().prepare(
    'INSERT INTO counters (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = v + excluded.v'
  ).run(key, delta);
}

function getCounter(key) {
  const row = requireDb().prepare('SELECT v FROM counters WHERE k = ?').get(key);
  return row ? row.v : 0;
}

function ping() {
  try { requireDb().prepare('SELECT 1 AS ok').get(); return true; } catch (e) { return false; }
}

module.exports = { open, insertGame, getGame, listGames, updateGameConfig, replaceGame, deleteGame, countGames, incrCounter, getCounter, ping };
