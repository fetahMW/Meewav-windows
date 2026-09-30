const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authReturnUrl, authStartUrl, authRendererReturnUrl } = require('./auth-links.cjs');

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

test('opens only the configured Supabase OAuth endpoint with the native callback', () => {
  const project = 'https://project.supabase.co';
  const target = project + '/auth/v1/authorize?provider=google&redirect_to=meewav%3A%2F%2Fapp%2Fauth%2Fcallback';
  assert.equal(authStartUrl(target, project), target);
  for (const invalid of [
    target.replace('https:', 'http:'),
    target.replace('project.supabase.co', 'untrusted.example'),
    target.replace('/auth/v1/authorize', '/auth/v1/logout'),
    target.replace('provider=google', 'provider=unknown'),
    target.replace('meewav%3A%2F%2Fapp%2Fauth%2Fcallback', 'https://untrusted.example'),
    target.replace('https://', 'https://user:secret@'),
    'javascript:alert(1)',
  ]) assert.equal(authStartUrl(invalid, project), null);
});

test('returns the native OAuth callback to the same renderer origin in dev and packaged builds', () => {
  const callback = 'meewav://app/auth/callback?code=test-code';
  assert.equal(authRendererReturnUrl(callback, 'http://127.0.0.1:5197/'), 'http://127.0.0.1:5197/auth/callback?code=test-code');
  assert.equal(authRendererReturnUrl(callback, 'meewav://app/'), callback);
  assert.equal(authRendererReturnUrl('meewav://other/auth/callback?code=x', 'http://127.0.0.1:5197/'), null);
});
