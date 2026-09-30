const paths = new Set(['/auth/callback', '/auth/update-password']);
const queryKeys = new Set(['code', 'type', 'error', 'error_description', 'error_code', 'next']);
const fragmentKeys = new Set(['access_token', 'refresh_token', 'token_type', 'expires_in', 'expires_at', 'type', 'error', 'error_description', 'error_code']);

/** Validate an OS protocol argument before it can navigate the trusted renderer. */
function authReturnUrl(value) {
  if (typeof value !== 'string' || value.length > 32768) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'meewav:' || url.hostname !== 'app' || url.port || url.username || url.password || !paths.has(url.pathname)) return null;
    for (const key of [...url.searchParams.keys()]) if (!queryKeys.has(key)) url.searchParams.delete(key);
    const next = url.searchParams.get('next');
    if (next && (!next.startsWith('/') || next.startsWith('//') || next.includes('\\'))) url.searchParams.delete('next');
    const fragment = new URLSearchParams(url.hash.slice(1));
    for (const key of [...fragment.keys()]) if (!fragmentKeys.has(key)) fragment.delete(key);
    if (!url.searchParams.has('code') && !url.searchParams.has('error') && !fragment.has('access_token') && !fragment.has('error')) return null;
    url.hash = fragment.toString();
    return url.href;
  } catch { return null; }
}
const desktopAuthCallback = 'meewav://app/auth/callback';

/** Only the configured Supabase authorization endpoint may open a browser. */
function authStartUrl(value, supabaseUrl) {
  try {
    const target = new URL(value);
    const expected = new URL(supabaseUrl);
    if (expected.protocol !== 'https:' || target.origin !== expected.origin
      || target.username || target.password || target.hash
      || target.pathname !== '/auth/v1/authorize'
      || !['google', 'apple'].includes(target.searchParams.get('provider'))
      || target.searchParams.get('redirect_to') !== desktopAuthCallback) return null;
    return target.href;
  } catch { return null; }
}

function authRendererReturnUrl(value, studioUrl) {
  const validated = authReturnUrl(value);
  if (!validated) return null;
  const callback = new URL(validated);
  return new URL(callback.pathname + callback.search + callback.hash, studioUrl).href;
}
module.exports = { authReturnUrl, authStartUrl, authRendererReturnUrl, desktopAuthCallback };
