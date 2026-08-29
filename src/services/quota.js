const { pool, query } = require('../db');

const FREE_DAILY_QUOTA = 3;
const PARIS_TODAY_SQL = "(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Paris')::date";

async function getDailyQuota(userId) {
  const result = await query(
    `SELECT COUNT(*)::int AS used
     FROM prediction_accesses
     WHERE user_id = $1
       AND access_date = ${PARIS_TODAY_SQL}`,
    [userId]
  );
  const used = result.rows[0]?.used || 0;
  return {
    used,
    limit: FREE_DAILY_QUOTA,
    remaining: Math.max(0, FREE_DAILY_QUOTA - used),
  };
}

async function getFreeAccessStatus(userId, matchKey) {
  const result = await query(
    `SELECT
       EXISTS (
         SELECT 1 FROM prediction_accesses
         WHERE user_id = $1
           AND match_key = $2
           AND access_date = ${PARIS_TODAY_SQL}
       ) AS already_accessed,
       (
         SELECT COUNT(*)::int FROM prediction_accesses
         WHERE user_id = $1
           AND access_date = ${PARIS_TODAY_SQL}
       ) AS used`,
    [userId, matchKey]
  );
  const row = result.rows[0];
  const used = row?.used || 0;
  return {
    alreadyAccessed: Boolean(row?.already_accessed),
    used,
    limit: FREE_DAILY_QUOTA,
    remaining: Math.max(0, FREE_DAILY_QUOTA - used),
    allowed: Boolean(row?.already_accessed) || used < FREE_DAILY_QUOTA,
  };
}

async function claimFreeAccess(userId, matchKey) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [userId]);

    const existing = await client.query(
      `SELECT 1 FROM prediction_accesses
       WHERE user_id = $1
         AND match_key = $2
         AND access_date = ${PARIS_TODAY_SQL}`,
      [userId, matchKey]
    );

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS used
       FROM prediction_accesses
       WHERE user_id = $1
         AND access_date = ${PARIS_TODAY_SQL}`,
      [userId]
    );
    const usedBefore = countResult.rows[0]?.used || 0;

    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return {
        allowed: true,
        counted: false,
        used: usedBefore,
        limit: FREE_DAILY_QUOTA,
        remaining: Math.max(0, FREE_DAILY_QUOTA - usedBefore),
      };
    }

    if (usedBefore >= FREE_DAILY_QUOTA) {
      await client.query('ROLLBACK');
      return {
        allowed: false,
        counted: false,
        used: usedBefore,
        limit: FREE_DAILY_QUOTA,
        remaining: 0,
      };
    }

    await client.query(
      `INSERT INTO prediction_accesses (user_id, match_key, access_date)
       VALUES ($1, $2, ${PARIS_TODAY_SQL})`,
      [userId, matchKey]
    );
    await client.query('COMMIT');

    const used = usedBefore + 1;
    return {
      allowed: true,
      counted: true,
      used,
      limit: FREE_DAILY_QUOTA,
      remaining: Math.max(0, FREE_DAILY_QUOTA - used),
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  FREE_DAILY_QUOTA,
  getDailyQuota,
  getFreeAccessStatus,
  claimFreeAccess,
};
