// src/index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/products') {
      // read products.json from assets included with the worker
      const r = await fetch(`${new URL(request.url).origin}/products.json`);
      const json = await r.text();
      return new Response(json, { headers: { 'Content-Type': 'application/json' }});
    }
    // default: serve index.html so worker can also behave like SPA host
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/index.html`);
    const body = await res.text();
    return new Response(body, { headers: { 'Content-Type': 'text/html' }});
  }
}
