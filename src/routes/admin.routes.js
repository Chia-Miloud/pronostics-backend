const router = require('express').Router();
const { query } = require('../db');
const { authRequired } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const ADMIN_EMAILS = ['miloudchia@gmail.com', 'miloudc@hotmail.com'];

// Middleware admin
const requireAdmin = [authRequired, (req, res, next) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Accès refusé' });
  next();
}];

// ─── STATS GLOBALES ───────────────────────────────────────────────────────────
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [users, pronostics, plans, recentUsers, recentPronostics, matchStats] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM pronostics'),
      query(`SELECT plan, COUNT(*) as count FROM users GROUP BY plan ORDER BY count DESC`),
      query(`SELECT id, prenom, nom, email, plan, created_at FROM users ORDER BY created_at DESC LIMIT 5`),
      query(`SELECT p.id, u.email, u.prenom, m.equipe1, m.equipe2, p.created_at
             FROM pronostics p
             JOIN users u ON p.user_id = u.id
             JOIN matches m ON p.match_id = m.id
             ORDER BY p.created_at DESC LIMIT 5`),
      query(`SELECT statut, COUNT(*) as count FROM matches GROUP BY statut`),
    ]);
    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalPronostics: parseInt(pronostics.rows[0].count),
      planBreakdown: plans.rows,
      recentUsers: recentUsers.rows,
      recentPronostics: recentPronostics.rows,
      matchStats: matchStats.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LISTE UTILISATEURS ───────────────────────────────────────────────────────
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const r = await query(
      `SELECT u.id, u.prenom, u.nom, u.email, u.plan, u.telephone, u.created_at,
              COUNT(p.id)::int AS nb_pronostics,
              MAX(p.created_at) AS last_pronostic
       FROM users u
       LEFT JOIN pronostics p ON p.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DÉTAIL D'UN UTILISATEUR ──────────────────────────────────────────────────
router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await query(
      `SELECT id, prenom, nom, email, plan, telephone, created_at FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!user.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const pronostics = await query(
      `SELECT p.id, m.equipe1, m.equipe2, m.statut, m.score_p1, m.score_p2,
              p.created_at, p.favori, p.confiance
       FROM pronostics p
       JOIN matches m ON p.match_id = m.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC LIMIT 20`,
      [req.params.id]
    );

    res.json({ user: user.rows[0], pronostics: pronostics.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CHANGER LE PLAN ──────────────────────────────────────────────────────────
router.put('/users/:id/plan', requireAdmin, async (req, res) => {
  const { plan } = req.body;
  if (!['free', 'ai_plus', 'ai_premium'].includes(plan)) {
    return res.status(400).json({ error: 'Plan invalide' });
  }
  try {
    await query('UPDATE users SET plan = $1 WHERE id = $2', [plan, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RÉINITIALISER LE MOT DE PASSE ───────────────────────────────────────────
router.put('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min)' });
  }
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MODIFIER LES INFOS D'UN UTILISATEUR ─────────────────────────────────────
router.put('/users/:id', requireAdmin, async (req, res) => {
  const { prenom, nom, email, telephone } = req.body;
  try {
    await query(
      `UPDATE users SET prenom=$1, nom=$2, email=$3, telephone=$4 WHERE id=$5`,
      [prenom, nom, email?.toLowerCase(), telephone, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SUPPRIMER UN UTILISATEUR ─────────────────────────────────────────────────
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    // Supprimer les pronostics d'abord
    await query('DELETE FROM pronostics WHERE user_id = $1', [req.params.id]);
    await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SYNC MANUELLE DES MATCHS ─────────────────────────────────────────────────
router.post('/sync-matches', requireAdmin, async (req, res) => {
  const FOOTBALL_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
  if (!FOOTBALL_API_KEY) return res.status(500).json({ error: 'Clé API football manquante' });
  try {
    const response = await axios.get('https://api.football-data.org/v4/competitions/2000/matches', {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { status: 'SCHEDULED,IN_PLAY,PAUSED,FINISHED' }
    });
    const matches = response.data.matches || [];
    let updated = 0;
    for (const m of matches) {
      const statut = ['SCHEDULED','IN_PLAY','PAUSED','FINISHED'].includes(m.status) ? m.status : m.status;
      await query(
        `INSERT INTO matches (external_id, equipe1, equipe2, logo1, logo2, date_heure, phase, competition, statut, score_p1, score_p2)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (external_id) DO UPDATE SET statut=$9, score_p1=$10, score_p2=$11, updated_at=NOW()`,
        [String(m.id), m.homeTeam?.name||'TBD', m.awayTeam?.name||'TBD',
         m.homeTeam?.crest||null, m.awayTeam?.crest||null, m.utcDate,
         m.stage||'GROUP_STAGE', 'Coupe du Monde 2026', statut,
         m.score?.fullTime?.home??null, m.score?.fullTime?.away??null]
      );
      updated++;
    }
    res.json({ success: true, updated, total: matches.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
