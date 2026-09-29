const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, existsSync, unlinkSync, rmdirSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { readTestAccounts, signInTestAccount, testAccountsAllowed } = require('./test-accounts.cjs');
const config = { version: 1, enabled: true, supabaseUrl: 'https://qa.example.test', publishableKey: 'test-public-key',
  accounts: [{ alias: 'testeur3', id: '12345678-1234-1234-1234-123456789abc', email: 'qa@example.test', password: 'a-local-test-password' }] };

test('disabled, malformed, duplicate or unrelated aliases never enable quick login', () => {
  const directory = mkdtempSync(join(tmpdir(), 'meewav-test-accounts-'));
  const file = join(directory, 'qa-test-accounts.json');
  try {
    assert.equal(readTestAccounts(file), null);
    for (const invalid of [{ ...config, enabled: false }, { ...config, supabaseUrl: 'http://qa.example.test' },
      { ...config, accounts: [...config.accounts, ...config.accounts] },
      { ...config, accounts: [{ ...config.accounts[0], alias: 'puf' }] }]) {
      writeFileSync(file, JSON.stringify(invalid));
      assert.equal(readTestAccounts(file), null);
    }
    writeFileSync(file, JSON.stringify(config));
    assert.equal(readTestAccounts(file).accounts[0].alias, 'testeur3');
    writeFileSync(file, JSON.stringify({ ...config, accounts: ['testeur3', 'testeur2', 'testeur1'].map(alias => ({ ...config.accounts[0], alias })) }));
    assert.deepEqual(readTestAccounts(file).accounts.map(account => account.alias), ['testeur3', 'testeur2', 'testeur1']);
  } finally { if (existsSync(file)) unlinkSync(file); rmdirSync(directory); }
});

test('unknown alias and wrong project cannot send credentials', async () => {
  const fetcher = () => { throw new Error('must not send'); };
  await assert.rejects(signInTestAccount(config, 'puf', config.supabaseUrl, fetcher), /Compte test indisponible/);
  await assert.rejects(signInTestAccount(config, 'testeur3', 'https://other.example.test', fetcher), /Compte test indisponible/);
});

test('real password endpoint must return the configured identity; only session tokens reach renderer', async () => {
  const fetcher = async (url, options) => {
    assert.equal(url, `${config.supabaseUrl}/auth/v1/token?grant_type=password`);
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), { email: config.accounts[0].email, password: config.accounts[0].password });
    return { ok: true, json: async () => ({ user: { id: config.accounts[0].id }, access_token: 'access', refresh_token: 'refresh', password: 'never-return' }) };
  };
  assert.deepEqual(await signInTestAccount(config, ' TESTEUR3 ', config.supabaseUrl, fetcher), { access_token: 'access', refresh_token: 'refresh' });
  await assert.rejects(signInTestAccount(config, 'testeur3', config.supabaseUrl,
    async () => ({ ok: true, json: async () => ({ user: { id: 'other' }, access_token: 'access', refresh_token: 'refresh' }) })), /Compte test indisponible/);
});

test('network errors never expose credentials or create a fake session', async () => {
  await assert.rejects(signInTestAccount(config, 'testeur3', config.supabaseUrl,
    async () => { throw new Error(config.accounts[0].password); }), error => !error.message.includes(config.accounts[0].password));
});

test('packaged Electron includes the new required module', () => {
  assert.ok(require('../../electron-builder.config.cjs').files.includes('apps/meewav-studio/test-accounts.cjs'));
});

test('production always rejects shortcuts, even with the test environment flag', () => {
  for (const flag of [undefined, '', '0', '1']) assert.equal(testAccountsAllowed(true, flag), false);
  assert.equal(testAccountsAllowed(false, undefined), false);
  assert.equal(testAccountsAllowed(false, '1'), true);
});
