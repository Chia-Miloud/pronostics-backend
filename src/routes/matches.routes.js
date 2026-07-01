const router = require('express').Router();
const axios = require('axios');
const { query } = require('../db');

const FOOTBALL_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const FOOTBALL_API_URL = 'https://api.football-data.org/v4';
const WC_2026_ID = 2000; // ID Coupe du Monde 2026 sur football-data.org

// ─── LISTE DES MATCHS ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, equipe1 AS participant1, equipe2 AS participant2,
              logo1 AS participant1_logo, logo2 AS participant2_logo,
              date_heure, phase, competition AS competition_nom,
              statut, score_p1, score_p2
       FROM matches ORDER BY date_heure ASC`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── SYNCHRONISATION DEPUIS FOOTBALL-DATA.ORG ────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    if (!FOOTBALL_API_KEY) return res.status(500).json({ error: 'Clé API football manquante' });

    const response = await axios.get(`${FOOTBALL_API_URL}/competitions/${WC_2026_ID}/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { status: 'SCHEDULED,TIMED,IN_PLAY,LIVE,PAUSED,FINISHED' }
    });

    const matches = response.data.matches || [];
    let inserted = 0, updated = 0;

    for (const m of matches) {
      const statut = m.status === 'SCHEDULED' ? 'SCHEDULED'
        : m.status === 'IN_PLAY' ? 'IN_PLAY'
        : m.status === 'LIVE' ? 'IN_PLAY'       // football-data utilise parfois LIVE
        : m.status === 'PAUSED' ? 'PAUSED'
        : m.status === 'FINISHED' ? 'FINISHED'
        : m.status === 'TIMED' ? 'TIMED' : m.status;

      // Score : fullTime si dispo, sinon currentScore (en cours de match)
      const scoreHome = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null;
      const scoreAway = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null;

      const existing = await query('SELECT id FROM matches WHERE external_id = $1', [String(m.id)]);

      if (existing.rows.length) {
        await query(
          `UPDATE matches SET statut = $1, score_p1 = $2, score_p2 = $3, updated_at = NOW() WHERE external_id = $4`,
          [statut, scoreHome, scoreAway, String(m.id)]
        );
        updated++;
      } else {
        await query(
          `INSERT INTO matches (external_id, equipe1, equipe2, logo1, logo2, date_heure, phase, competition, statut, score_p1, score_p2)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (external_id) DO NOTHING`,
          [
            String(m.id),
            m.homeTeam?.name || 'TBD',
            m.awayTeam?.name || 'TBD',
            m.homeTeam?.crest || null,
            m.awayTeam?.crest || null,
            m.utcDate,
            m.stage || m.group || 'GROUP_STAGE',
            'Coupe du Monde 2026',
            statut,
            m.score?.fullTime?.home ?? null,
            m.score?.fullTime?.away ?? null,
          ]
        );
        inserted++;
      }
    }

    res.json({ message: `Synchronisation terminée`, inserted, updated, total: matches.length });
  } catch (err) {
    console.error('sync error:', err.message);
    res.status(500).json({ error: 'Erreur synchronisation', details: err.message });
  }
});

// ─── CRON AUTO-SYNC (appelé toutes les heures) ────────────────────────────────
const autoSync = async () => {
  if (!FOOTBALL_API_KEY) return;
  try {
    const response = await axios.get(`${FOOTBALL_API_URL}/competitions/${WC_2026_ID}/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { status: 'SCHEDULED,TIMED,IN_PLAY,LIVE,PAUSED,FINISHED' }
    });
    const matches = response.data.matches || [];
    for (const m of matches) {
      const statut = m.status === 'SCHEDULED' ? 'SCHEDULED'
        : m.status === 'IN_PLAY' ? 'IN_PLAY'
        : m.status === 'LIVE' ? 'IN_PLAY'
        : m.status === 'PAUSED' ? 'PAUSED'
        : m.status === 'FINISHED' ? 'FINISHED'
        : m.status === 'TIMED' ? 'TIMED' : m.status;
      // Score en cours de match
      const scoreHome = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null;
      const scoreAway = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null;
      await query(
        `INSERT INTO matches (external_id, equipe1, equipe2, logo1, logo2, date_heure, phase, competition, statut, score_p1, score_p2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (external_id) DO UPDATE SET statut = $9, score_p1 = $10, score_p2 = $11, updated_at = NOW()`,
        [
          String(m.id), m.homeTeam?.name || 'TBD', m.awayTeam?.name || 'TBD',
          m.homeTeam?.crest || null, m.awayTeam?.crest || null, m.utcDate,
          m.stage || 'GROUP_STAGE', 'Coupe du Monde 2026', statut,
          scoreHome, scoreAway,
        ]
      );
    }
    console.log(`✅ Auto-sync: ${matches.length} matchs mis à jour`);
  } catch (err) {
    console.error('auto-sync error:', err.message);
  }
};

// Sync intelligente : toutes les 30s si match en direct, sinon toutes les 5 min
let syncInterval = null;

const scheduleSyncLoop = async () => {
  await autoSync();
  // Vérifier si un match est en direct
  try {
    const r = await query("SELECT COUNT(*) FROM matches WHERE statut IN ('IN_PLAY','PAUSED')");
    const liveCount = parseInt(r.rows[0].count);
    const nextDelay = liveCount > 0 ? 30 * 1000 : 5 * 60 * 1000; // 30s si live, 5min sinon
    if (liveCount > 0) {
      console.log(`🔴 ${liveCount} match(s) en direct — sync toutes les 30s`);
    }
    setTimeout(scheduleSyncLoop, nextDelay);
  } catch {
    setTimeout(scheduleSyncLoop, 60 * 1000);
  }
};

// Démarrer la boucle de sync au boot
setTimeout(scheduleSyncLoop, 5000);

module.exports = router;
