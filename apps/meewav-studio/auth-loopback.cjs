const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');
const { authReturnUrl } = require('./auth-links.cjs');

// Older hosted Auth configurations return to localhost:3000 when the native
// callback is not allowlisted. Receive that return only during an explicit login.
async function createAuthLoopback({ onReturn, port = 3000, expiresInMs = 30 * 60 * 1000 }) {
  const nonce = randomBytes(24).toString('hex');
  const servers = [];
  let closed = false;
  let completed = false;
  let closePromise;
  let timer;
  let boundPort = port;
  const close = () => {
    if (closePromise) return closePromise;
    closed = true;
    clearTimeout(timer);
    closePromise = Promise.all(servers.map(server => new Promise(resolve => {
      server.close(() => resolve());
      server.closeIdleConnections();
    })));
    return closePromise;
  };
  const handler = async (request, response) => {
    const hosts = [`localhost:${boundPort}`, `127.0.0.1:${boundPort}`, `[::1]:${boundPort}`];
    const host = request.headers.host;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`);
    if (closed || !hosts.includes(host)) { response.writeHead(403).end(); return; }
    const path = new URL(request.url, `http://${host}`).pathname;
    if (request.method === 'GET' && (path === '/' || path === '/auth/callback')) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Retour dans Meewav</title>
<style nonce="${nonce}">body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090d;color:#f2f0f8;font:16px system-ui}main{max-width:420px;padding:32px}h1{font-size:24px}p{color:#bdb8ca;line-height:1.5}</style>
<main><h1>Retour dans Meewav</h1><p id="status">Finalisation de ta connexion…</p></main>
<script nonce="${nonce}">
(async()=>{
  const destination=new URL('meewav://app/auth/callback');
  const query=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));
  for(const key of ['code','type','error','error_description','error_code','next'])if(query.has(key))destination.searchParams.set(key,query.get(key));
  const result=new URLSearchParams();
  for(const key of ['access_token','refresh_token','token_type','expires_in','expires_at','type','error','error_description','error_code'])if(fragment.has(key))result.set(key,fragment.get(key));
  destination.hash=result.toString();
  history.replaceState(null,'','/auth/callback');
  const status=document.getElementById('status');
  try{
    const response=await fetch('/complete',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','X-Meewav-Auth':'${nonce}'},body:JSON.stringify({url:destination.href})});
    if(!response.ok)throw new Error();
    status.textContent='La connexion a été transmise à Meewav. Tu peux fermer cet onglet.';
  }catch{status.textContent='Ce retour de connexion est invalide ou a expiré. Reprends la connexion dans Meewav.';}
})();
</script></html>`);
      return;
    }
    if (request.method !== 'POST' || path !== '/complete') { response.writeHead(404).end(); return; }
    if (request.headers.origin !== `http://${host}` || request.headers['x-meewav-auth'] !== nonce
      || request.headers['content-type'] !== 'application/json') { response.writeHead(403).end(); return; }
    if (completed) { response.writeHead(409).end(); return; }
    let body = '';
    try {
      for await (const chunk of request) {
        body += chunk.toString('utf8');
        if (body.length > 40000) { response.writeHead(413).end(); return; }
      }
      const callback = authReturnUrl(JSON.parse(body).url);
      if (!callback || new URL(callback).pathname !== '/auth/callback') { response.writeHead(400).end(); return; }
      if (closed || completed) { response.writeHead(409).end(); return; }
      completed = true;
      response.writeHead(204).end();
      try { onReturn(callback); } finally { void close(); }
    } catch { if (!response.headersSent) response.writeHead(400).end(); }
  };
  const listen = (host, listenPort) => new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      void handler(request, response).catch(() => { if (!response.headersSent) response.writeHead(400).end(); });
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    server.once('error', reject);
    server.listen({ host, port: listenPort }, () => {
      server.removeListener('error', reject);
      servers.push(server);
      resolve(server.address().port);
    });
  });
  try {
    boundPort = await listen('127.0.0.1', port);
    try { await listen('::1', boundPort); }
    catch (error) { if (!['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) throw error; }
  } catch (error) { await close(); throw error; }
  timer = setTimeout(() => { void close(); }, expiresInMs);
  timer.unref();
  return { port: boundPort, close, get active() { return !closed; } };
}

module.exports = { createAuthLoopback };
