const router = require('express').Router();
const { query } = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');

const ADMIN_EMAILS = ['miloudchia@gmail.com', 'miloudc@hotmail.com'];
const requireAdmin = [authRequired, (req, res, next) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Accès refusé' });
  next();
}];

// ─── TRACKER UNE PAGE VUE ─────────────────────────────────────────────────────
router.post('/track', authOptional, async (req, res) => {
  try {
    const { session_id, page, referrer } = req.body;
    if (!session_id || !page) return res.status(400).json({ error: 'session_id et page requis' });

    const ua = req.headers['user-agent'] || '';

    // Ignorer les bots
    const isBot = /bot|crawler|spider|googlebot|bingbot|facebookexternalhit|twitterbot|linkedinbot|slurp|duckduckbot|yandex|baidu|sogou|exabot|facebot|ia_archiver/i.test(ua);
    if (isBot) return res.json({ tracked: false });

    // Ignorer les visites admin
    if (req.user && ADMIN_EMAILS.includes(req.user.email)) {
      return res.json({ tracked: false, reason: 'admin' });
    }

    await query(
      `INSERT INTO page_views (session_id, page, referrer, user_agent, user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [session_id, page, referrer || null, ua.slice(0, 300), req.user?.id || null]
    );

    res.json({ tracked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STATS GLOBALES (admin) ───────────────────────────────────────────────────
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query; // jours
    const days = parseInt(period) || 30;

    const [
      totalViews, uniqueVisitors, todayViews, todayUnique,
      topPages, dailyStats, referrers, realtimeActive
    ] = await Promise.all([
      // Total pages vues sur la période
      query(`SELECT COUNT(*) FROM page_views WHERE created_at > NOW() - INTERVAL '${days} days'`),
      // Visiteurs uniques (sessions distinctes)
      query(`SELECT COUNT(DISTINCT session_id) FROM page_views WHERE created_at > NOW() - INTERVAL '${days} days'`),
      // Aujourd'hui
      query(`SELECT COUNT(*) FROM page_views WHERE DATE(created_at) = CURRENT_DATE`),
      query(`SELECT COUNT(DISTINCT session_id) FROM page_views WHERE DATE(created_at) = CURRENT_DATE`),
      // Top pages
      query(`SELECT page, COUNT(*) as views, COUNT(DISTINCT session_id) as unique_visitors
             FROM page_views WHERE created_at > NOW() - INTERVAL '${days} days'
             GROUP BY page ORDER BY views DESC LIMIT 10`),
      // Stats par jour (courbe)
      query(`SELECT DATE(created_at) as date,
                    COUNT(*) as views,
                    COUNT(DISTINCT session_id) as unique_visitors
             FROM page_views WHERE created_at > NOW() - INTERVAL '${days} days'
             GROUP BY DATE(created_at) ORDER BY date ASC`),
      // Sources de trafic (referrers)
      query(`SELECT
               CASE
                 WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
                 WHEN referrer LIKE '%google%' THEN 'Google'
                 WHEN referrer LIKE '%facebook%' OR referrer LIKE '%fb.com%' THEN 'Facebook'
                 WHEN referrer LIKE '%instagram%' THEN 'Instagram'
                 WHEN referrer LIKE '%tiktok%' THEN 'TikTok'
                 WHEN referrer LIKE '%twitter%' OR referrer LIKE '%t.co%' THEN 'Twitter/X'
                 WHEN referrer LIKE '%youtube%' THEN 'YouTube'
                 WHEN referrer LIKE '%coupedumonde%' THEN 'coupedumonde.ai'
                 ELSE 'Autre'
               END as source,
               COUNT(*) as views
             FROM page_views WHERE created_at > NOW() - INTERVAL '${days} days'
             GROUP BY source ORDER BY views DESC`),
      // Actifs en temps réel (dernières 5 minutes)
      query(`SELECT COUNT(DISTINCT session_id) FROM page_views WHERE created_at > NOW() - INTERVAL '5 minutes'`),
    ]);

    res.json({
      period: days,
      totalViews: parseInt(totalViews.rows[0].count),
      uniqueVisitors: parseInt(uniqueVisitors.rows[0].count),
      todayViews: parseInt(todayViews.rows[0].count),
      todayUnique: parseInt(todayUnique.rows[0].count),
      realtimeActive: parseInt(realtimeActive.rows[0].count),
      topPages: topPages.rows,
      dailyStats: dailyStats.rows,
      referrers: referrers.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STATS TEMPS RÉEL (admin) ─────────────────────────────────────────────────
router.get('/realtime', requireAdmin, async (req, res) => {
  try {
    const [active, lastViews] = await Promise.all([
      query(`SELECT COUNT(DISTINCT session_id) as active FROM page_views WHERE created_at > NOW() - INTERVAL '5 minutes'`),
      query(`SELECT page, created_at FROM page_views ORDER BY created_at DESC LIMIT 20`),
    ]);
    res.json({
      active: parseInt(active.rows[0].active),
      lastViews: lastViews.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
