/* 静态部署垫片：把 /api/* 请求映射到静态 JSON 文件。
 * 仅用于 GitHub Pages 等纯静态托管：只能读预设游戏，无法生成新游戏。 */
(function () {
  'use strict';
  var real = window.fetch;
  function json(obj) {
    return new Response(JSON.stringify(obj),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  function err(code, message, status) {
    return new Response(JSON.stringify({ error: { code: code, message: message } }),
      { status: status || 404, headers: { 'Content-Type': 'application/json' } });
  }
  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : ((input && input.url) || '');
    var m = url.match(/^\/api\/games\/([^\/?]+)/);
    if (m) {
      var id = decodeURIComponent(m[1]);
      if (init && (init.method === 'PATCH' || init.method === 'POST')) {
        return Promise.resolve(err('static_mode',
          '这是静态演示站点：可以玩预设游戏，但不能生成或编辑。', 403));
      }
      return real('/api/games/' + id + '.json', init).then(function (r) {
        if (r.ok) return r;
        return err('not_found', '这个游戏不在静态包里。', 404);
      });
    }
    if (url.indexOf('/api/gallery') === 0) {
      return real('/api/gallery.json', init);
    }
    if (url.indexOf('/api/games') === 0 && init && (init.method === 'POST')) {
      return Promise.resolve(err('static_mode',
        '这是静态演示站点：生成功能需要服务端与模型密钥，未包含在静态版里。', 403));
    }
    return real(input, init);
  };
})();
