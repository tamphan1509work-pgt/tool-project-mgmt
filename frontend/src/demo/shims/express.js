// Express "mini" chạy trong trình duyệt: đủ cho các route mà backend sử dụng
// (Router, use/get/post/put/patch/delete, tham số :id, {*splat}, middleware lỗi 4 tham số).

function compile(pattern, end) {
  const keys = [];
  const body = pattern
    .replace(/\/$/, '')
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      if (/^\{\*\w+\}$/.test(seg)) {
        keys.push(seg.slice(2, -1));
        return '(.*)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  const re = new RegExp('^' + body + (end ? '/?$' : '(?=/|$)'));
  return (path) => {
    const m = re.exec(path);
    if (!m) return null;
    const params = {};
    keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] ?? '')));
    return { params, matched: end ? path : m[0] };
  };
}

export function Router() {
  const layers = [];

  const router = (req, res, done) => {
    let i = 0;
    const basePath = req.path;
    const baseUrl = req.baseUrl;
    const next = (err) => {
      req.path = basePath;
      req.baseUrl = baseUrl;
      while (i < layers.length) {
        const layer = layers[i++];
        if (layer.method && layer.method !== req.method) continue;
        const m = layer.match(basePath);
        if (!m) continue;
        const isErrorHandler = layer.fn.length === 4;
        if (Boolean(err) !== isErrorHandler) continue;
        req.params = m.params;
        if (!layer.end) {
          req.baseUrl = baseUrl + m.matched;
          req.path = basePath.slice(m.matched.length) || '/';
        }
        try {
          const ret = err ? layer.fn(err, req, res, next) : layer.fn(req, res, next);
          if (ret && typeof ret.catch === 'function') ret.catch(next);
        } catch (e) {
          next(e);
        }
        return;
      }
      done?.(err);
    };
    next();
  };

  const route = (method) => (path, ...fns) => {
    for (const fn of fns) layers.push({ method, end: true, fn, match: compile(path, true) });
    return router;
  };
  router.get = route('GET');
  router.post = route('POST');
  router.put = route('PUT');
  router.patch = route('PATCH');
  router.delete = route('DELETE');
  router.use = (path, ...fns) => {
    if (typeof path === 'function') {
      fns.unshift(path);
      path = '/';
    }
    for (const fn of fns) layers.push({ method: null, end: false, fn, match: compile(path, false) });
    return router;
  };
  router.disable = () => router;
  return router;
}

function express() {
  return Router();
}
express.Router = Router;
express.json = () => (_req, _res, next) => next();
express.static = () => (_req, _res, next) => next();

export default express;
