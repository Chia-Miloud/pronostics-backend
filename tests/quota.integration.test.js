const test = require('node:test');
const assert = require('node:assert/strict');

const enabled = Boolean(process.env.TEST_DATABASE_URL);
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test?sslmode=disable';
process.env.JWT_SECRET ||= 'test-secret-with-at-least-thirty-two-characters';

const { initDB, query, pool } = require('../src/db');
const { claimFreeAccess, getDailyQuota } = require('../src/services/quota');

test('quota Free : trois matchs distincts, réouverture gratuite, quatrième bloqué', { skip: !enabled }, async () => {
  await initDB();
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const userResult = await query(
    `INSERT INTO users (email, pseudo, password_hash)
     VALUES ($1, $2, 'test') RETURNING id`,
    [`quota_${suffix}@example.test`, `quota_${suffix}`.slice(0, 20)]
  );
  const userId = userResult.rows[0].id;

  try {
    const first = await claimFreeAccess(userId, 'match:101');
    const reopened = await claimFreeAccess(userId, 'match:101');
    const second = await claimFreeAccess(userId, 'match:102');
    const third = await claimFreeAccess(userId, 'external:2015_103');
    const fourth = await claimFreeAccess(userId, 'match:104');
    const quota = await getDailyQuota(userId);

    assert.equal(first.allowed, true);
    assert.equal(first.counted, true);
    assert.equal(reopened.allowed, true);
    assert.equal(reopened.counted, false);
    assert.equal(second.used, 2);
    assert.equal(third.used, 3);
    assert.equal(fourth.allowed, false);
    assert.deepEqual(quota, { used: 3, limit: 3, remaining: 0 });
  } finally {
    await query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  }
});
