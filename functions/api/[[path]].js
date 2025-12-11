// functions/api/[[path]].js
export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Helper: Basic auth check using environment secrets
  function checkAuth(req) {
    const auth = req.headers.get('authorization');
    if (!auth || !auth.startsWith('Basic ')) return false;
    const cred = atob(auth.split(' ')[1] || '');
    const [u, p] = cred.split(':');
    return u === env.ADMIN_USER && p === env.ADMIN_PASS;
  }

  // Read catalog.json from R2 (FRESHKA_R2)
  async function readCatalog() {
    try {
      const obj = await env.FRESHKA_R2.get('catalog.json');
      if (!obj) return [];
      const text = await obj.text();
      return JSON.parse(text);
    } catch (e) {
      return [];
    }
  }
  async function writeCatalog(data) {
    await env.FRESHKA_R2.put('catalog.json', JSON.stringify(data), {
      httpMetadata: { contentType: 'application/json' }
    });
  }

  // Serve catalog
  if (request.method === 'GET' && path === '/api/products') {
    const data = await readCatalog();
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' }});
  }

  // Admin update/create item
  if ((request.method === 'POST' || request.method === 'PUT') && path.startsWith('/api/admin/items/')) {
    if (!checkAuth(request)) return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Freshka"' }});
    const parts = path.split('/');
    const sku = decodeURIComponent(parts[parts.length - 1]);
    const payload = await request.json().catch(()=>null);
    if (!payload) return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { 'Content-Type': 'application/json' }});

    const data = await readCatalog();
    let found = false;
    for (const cat of data) {
      const item = (cat.items || []).find(i => i.sku === sku);
      if (item) {
        Object.assign(item, payload);
        item.updatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) {
      if (!payload.name || payload.price == null || !payload.unit || !payload.category) {
        return new Response(JSON.stringify({ error: 'missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' }});
      }
      let cat = data.find(c => c.category === payload.category);
      if (!cat) { cat = { category: payload.category, items: [] }; data.push(cat); }
      const item = {
        sku, name: payload.name, price: payload.price, unit: payload.unit,
        img: payload.img || '/images/placeholder.jpg', stock: payload.stock ?? 0,
        available: payload.available ?? true, updatedAt: new Date().toISOString()
      };
      cat.items.push(item);
    }
    await writeCatalog(data);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' }});
  }

  // Admin image upload -> save to R2 and update entry
  if (request.method === 'POST' && path.match(/^\/api\/admin\/items\/[^/]+\/image$/)) {
    if (!checkAuth(request)) return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Freshka"' }});
    const parts = path.split('/');
    const sku = decodeURIComponent(parts[parts.length - 2]);

    // parse multipart form data
    const form = await request.formData().catch(()=>null);
    if (!form) return new Response(JSON.stringify({ error: 'invalid form' }), { status: 400, headers: { 'Content-Type': 'application/json' }});
    const file = form.get('image');
    if (!file) return new Response(JSON.stringify({ error: 'no file' }), { status: 400, headers: { 'Content-Type': 'application/json' }});

    const ext = (file.name && file.name.split('.').pop()) || 'jpg';
    const key = `images/${sku}-${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    await env.FRESHKA_R2.put(key, arrayBuffer, { httpMetadata: { contentType: file.type || 'image/jpeg' } });

    // update catalog entry
    const data = await readCatalog();
    let updated = false;
    for (const cat of data) {
      const item = (cat.items || []).find(i => i.sku === sku);
      if (item) {
        // Public URL depends on how you serve R2; here we use a worker route /images/<key>
        item.img = `/images/${key}?v=${Date.now()}`;
        item.updatedAt = new Date().toISOString();
        updated = true;
        break;
      }
    }
    if (!updated) return new Response(JSON.stringify({ error: 'sku not found' }), { status: 404, headers: { 'Content-Type': 'application/json' }});
    await writeCatalog(data);
    return new Response(JSON.stringify({ ok: true, path: `/images/${key}` }), { headers: { 'Content-Type': 'application/json' }});
  }

  // If image GET route — serve image from R2 (public)
  if (request.method === 'GET' && path.startsWith('/images/')) {
    const key = path.replace(/^\/images\//, '');
    const obj = await env.FRESHKA_R2.get(key);
    if (!obj) return new Response('Not found', { status: 404 });
    const ct = obj.httpMetadata && obj.httpMetadata.contentType ? obj.httpMetadata.contentType : 'application/octet-stream';
    return new Response(obj.body, { headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=31536000' }});
  }

  return new Response('Not found', { status: 404 });
}
