const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer, request } = require('node:http');
const { runInNewContext } = require('node:vm');
const { createAuthLoopback } = require('./auth-loopback.cjs');

async function prepare(t, onReturn = () => {}) {
  const listener = await createAuthLoopback({ port: 0, onReturn });
  t.after(() => listener.close());
  const origin = `http://127.0.0.1:${listener.port}`;
  const response = await fetch(origin);
  const html = await response.text();
  const nonce = html.match(/<script nonce="([^"]+)">/)[1];
  return { listener, origin, response, html, nonce };
}

test('the browser relays its fragment in memory and clears it before returning to the app', async t => {
  let received;
  const { listener, origin, response, html } = await prepare(t, value => { received = value; });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  let cleared = false;
  const status = {};
  const script = html.match(/<script nonce="[^"]+">([\s\S]+?)<\/script>/)[1];
  await runInNewContext(script, {
    URL, URLSearchParams,
    location: { search: '', hash: '#access_token=test-access&refresh_token=test-refresh&unexpected=discard' },
    history: { replaceState(_state, _title, path) { assert.equal(path, '/auth/callback'); cleared = true; } },
    document: { getElementById() { return status; } },
    fetch(path, options) {
      assert.equal(cleared, true);
      return fetch(origin + path, { ...options, headers: { ...options.headers, Origin: origin } });
    },
  });
  assert.equal(received, 'meewav://app/auth/callback#access_token=test-access&refresh_token=test-refresh');
  assert.match(status.textContent, /transmise à Meewav/);
  assert.equal(listener.active, false);
});

test('rejects foreign origins, missing nonce, DNS rebinding and invalid callback destinations', async t => {
  let calls = 0;
  const { origin, nonce } = await prepare(t, () => { calls++; });
  const options = {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Meewav-Auth': nonce },
    body: JSON.stringify({ url: 'meewav://app/auth/callback?code=test-code' }),
  };
  for (const headers of [
    { ...options.headers, Origin: 'https://untrusted.example' },
    { ...options.headers, 'X-Meewav-Auth': 'wrong' },
  ]) assert.equal((await fetch(origin + '/complete', { ...options, headers })).status, 403);
  const rebindingStatus = await new Promise((resolve, reject) => {
    const call = request(origin + '/complete', { method: 'POST', headers: { ...options.headers, Host: 'untrusted.example' } }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    call.on('error', reject);
    call.end(options.body);
  });
  assert.equal(rebindingStatus, 403);
  for (const url of ['https://untrusted.example/auth/callback?code=x', 'meewav://other/auth/callback?code=x', 'meewav://app/auth/update-password?code=x', 'meewav://app/auth/callback']) {
    assert.equal((await fetch(origin + '/complete', { ...options, body: JSON.stringify({ url }) })).status, 400);
  }
  assert.equal(calls, 0);
});

test('receives a code callback once and releases the listener', async t => {
  const received = [];
  const { listener, origin, nonce } = await prepare(t, value => received.push(value));
  const response = await fetch(origin + '/complete', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Meewav-Auth': nonce },
    body: JSON.stringify({ url: 'meewav://app/auth/callback?code=test-code&next=https://untrusted.example' }),
  });
  assert.equal(response.status, 204);
  assert.deepEqual(received, ['meewav://app/auth/callback?code=test-code']);
  await listener.close();
  assert.equal(listener.active, false);
  await assert.rejects(fetch(origin));
});

test('does not intercept a port owned by another application', async t => {
  const occupied = createServer();
  await new Promise(resolve => occupied.listen({ host: '127.0.0.1', port: 0 }, resolve));
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  await assert.rejects(createAuthLoopback({ port: occupied.address().port, onReturn() {} }), { code: 'EADDRINUSE' });
});
