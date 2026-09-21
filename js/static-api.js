/* 静态部署垫片：把 /api/* 请求映射到静态 JSON 文件。
 * 仅用于 GitHub Pages 等纯静态托管：只能读预设游戏，无法生成新游戏。
 *
 * 路径处理：站点可能挂在子路径下（如 /gengxia/），
 * 因此这里从 <base href> 推导前缀，再用绝对路径请求静态 JSON。 */
(function () {
  'use strict';
  var real = window.fetch;
  var baseEl = document.querySelector('base');
  var base = (baseEl && baseEl.getAttribute('href')) || '/';
  if (base.charAt(base.length - 1) !== '/') base += '/';

  function json(obj) {
    return new Response(JSON.stringify(obj),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  function err(code, message, status) {
    return new Response(JSON.stringify({ error: { code: code, message: message } }),
      { status: status || 404, headers: { 'Content-Type': 'application/json' } });
  }
  function staticUrl(rel) { return base + rel; }

  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : ((input && input.url) || '');
    var m = url.match(/^\/api\/games\/([^\/?]+)/);
    if (m) {
      var id = decodeURIComponent(m[1]);
      if (init && (init.method === 'PATCH' || init.method === 'POST')) {
        return Promise.resolve(err('static_mode',
          '这是静态演示站点：可以玩预设游戏，但不能生成或编辑。', 403));
      }
      /* 已经带后缀的（如 demo-naicha.json）直接放行，避免重复加后缀 */
      var file = /\.json$/.test(id) ? id : (id + '.json');
      return real(staticUrl('api/games/' + file), init).then(function (r) {
        if (r.ok) return r;
        return err('not_found', '这个游戏不在静态包里。', 404);
      });
    }
    if (url.indexOf('/api/gallery') === 0) {
      return real(staticUrl('api/gallery.json'), init);
    }
    if (url.indexOf('/api/games') === 0 && init && (init.method === 'POST')) {
      return Promise.resolve(err('static_mode',
        '这是静态演示站点：生成功能需要服务端与模型密钥，未包含在静态版里。', 403));
    }
    return real(input, init);
  };
})();
