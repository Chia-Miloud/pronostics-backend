const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const configPath = path.resolve(__dirname, '../src/config/env.js');
const databaseUrl = 'postgresql://test:test@127.0.0.1:5432/test?sslmode=disable';

function loadConfig(extraEnv) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})`], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      DATABASE_URL: databaseUrl,
      ...extraEnv,
    },
    encoding: 'utf8',
  });
}

test('la production refuse une clé JWT absente', () => {
  const result = loadConfig({ JWT_SECRET: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET/);
});

test('la production accepte une clé JWT robuste', () => {
  const result = loadConfig({ JWT_SECRET: 'a-secure-production-secret-with-more-than-32-characters' });
  assert.equal(result.status, 0, result.stderr);
});
