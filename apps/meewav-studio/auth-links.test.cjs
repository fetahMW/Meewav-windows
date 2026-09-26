const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authReturnUrl } = require('./auth-links.cjs');

test('accepts only the app auth routes and retains both supported session formats', () => {
  assert.equal(authReturnUrl('meewav://app/auth/callback?code=test-code'), 'meewav://app/auth/callback?code=test-code');
  const recovery = authReturnUrl('meewav://app/auth/update-password#access_token=test&refresh_token=refresh&type=recovery');
  assert.ok(recovery.includes('access_token=test'));
  assert.ok(recovery.includes('type=recovery'));
});
test('rejects hostile OS protocol arguments', () => {
  for (const input of ['https://app/auth/callback?code=x', 'meewav://other/auth/callback?code=x', 'meewav://user@app/auth/callback?code=x',
    'meewav://app/assets/payload.js?code=x', 'meewav://app/auth/callback', 'javascript:alert(1)', 'meewav://app:123/auth/callback?code=x']) {
    assert.equal(authReturnUrl(input), null);
  }
});
test('removes external redirects and unexpected parameters without logging session values', () => {
  assert.equal(authReturnUrl('meewav://app/auth/callback?code=x&next=https://example.com&script=payload'), 'meewav://app/auth/callback?code=x');
});
