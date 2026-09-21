/* API 客户端：统一错误结构 { code, message }，任何失败都不静默降级 */
'use strict';

const GengApi = (function () {

  async function parseError(res) {
    try {
      const j = await res.json();
      if (j && j.error) return { code: j.error.code || 'http_' + res.status, message: j.error.message || '请求失败' };
      return { code: 'http_' + res.status, message: '请求失败（' + res.status + '）' };
    } catch (e) {
      return { code: 'http_' + res.status, message: '请求失败（' + res.status + '）' };
    }
  }

  async function gallery() {
    const res = await fetch('/api/gallery', { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw await parseError(res);
    return res.json();
  }

  async function getGame(id) {
    const res = await fetch('/api/games/' + encodeURIComponent(id), { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw await parseError(res);
    return res.json();
  }

  async function patchGame(id, patch, editToken) {
    const res = await fetch('/api/games/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(Object.assign({ editToken: editToken }, patch)),
    });
    if (!res.ok) throw await parseError(res);
    return res.json();
  }

  /* 流式生成：服务端以 NDJSON 推送真实阶段；返回 { id, config, editToken, createdAt } */
  async function createGame(story, opts) {
    const o = opts || {};
    let res;
    try {
      res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/x-ndjson' },
        body: JSON.stringify({ story: story, mode: o.mode || 'auto' }),
        signal: o.signal,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw { code: 'aborted', message: '已取消' };
      throw { code: 'network', message: '网络连接失败，请检查网络后重试' };
    }
    if (!res.ok) throw await parseError(res);
    if (!res.body || !res.body.getReader) {
      /* 不支持流式读取的环境：退化为整包 JSON */
      const j = await res.json();
      return j;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let result = null;
    while (true) {
      let chunk;
      try { chunk = await reader.read(); }
      catch (e) { throw { code: 'network', message: '连接中断，请重试' }; }
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch (e) { continue; }
        if (msg.stage && o.onStage) o.onStage(msg.stage);
        if (msg.done && msg.error) throw { code: msg.error.code, message: msg.error.message };
        if (msg.done && msg.result) result = msg.result;
      }
    }
    if (buf.trim()) {
      try {
        const msg = JSON.parse(buf);
        if (msg.done && msg.error) throw { code: msg.error.code, message: msg.error.message };
        if (msg.done && msg.result) result = msg.result;
      } catch (e) { if (e && e.code) throw e; }
    }
    if (!result) throw { code: 'bad_response', message: '生成未返回结果，请重试' };
    return result;
  }

  /* 复制文本，失败时返回 false（调用方展示可选中链接兜底） */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext !== false) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* 继续走兜底 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  return { gallery: gallery, getGame: getGame, patchGame: patchGame, createGame: createGame, copyText: copyText };
})();

if (typeof window !== 'undefined') window.GengApi = GengApi;
