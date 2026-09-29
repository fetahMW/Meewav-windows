const { readFileSync } = require('node:fs');

const ALIASES = new Set(['testeur1', 'testeur2', 'testeur3']);
const unavailable = 'Compte test indisponible. Vérifie la configuration locale et la connexion Supabase.';

function testAccountsAllowed(isPackaged, testMode) {
  return isPackaged === false && testMode === '1';
}

// Opt-in file in Electron userData, never bundled with the application.
function readTestAccounts(file) {
  try {
    const config = JSON.parse(readFileSync(file, 'utf8'));
    const url = new URL(config.supabaseUrl);
    if (config.version !== 1 || config.enabled !== true || url.protocol !== 'https:'
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (typeof config.publishableKey !== 'string' || !config.publishableKey) return null;
    if (!Array.isArray(config.accounts) || !config.accounts.length || config.accounts.length > ALIASES.size) return null;
    const aliases = new Set();
    for (const account of config.accounts) {
      if (!ALIASES.has(account.alias) || aliases.has(account.alias)
        || !/^[a-f0-9-]{36}$/i.test(account.id) || !account.email?.includes('@')
        || typeof account.password !== 'string' || account.password.length < 12) return null;
      aliases.add(account.alias);
    }
    return { ...config, supabaseUrl: url.origin };
  } catch { return null; }
}

async function signInTestAccount(config, alias, expectedUrl, fetcher = fetch) {
  const name = typeof alias === 'string' ? alias.trim().toLowerCase() : '';
  if (!config || config.supabaseUrl !== expectedUrl?.replace(/\/$/, '')) throw new Error(unavailable);
  const account = config.accounts.find((item) => item.alias === name);
  if (!account) throw new Error(unavailable);
  try {
    const response = await fetcher(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    const session = await response.json();
    if (!response.ok || session.user?.id !== account.id
      || !session.access_token || !session.refresh_token) throw new Error(unavailable);
    // Only the session reaches React. Passwords and other accounts stay in main.
    return { access_token: session.access_token, refresh_token: session.refresh_token };
  } catch { throw new Error(unavailable); }
}

module.exports = { readTestAccounts, signInTestAccount, testAccountsAllowed };
