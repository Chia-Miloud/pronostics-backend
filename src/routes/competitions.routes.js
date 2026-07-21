const router = require('express').Router();
const axios = require('axios');
const { query } = require('../db');

const FOOTBALL_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const FOOTBALL_API_URL = 'https://api.football-data.org/v4';

// ─── LISTE DES COMPÉTITIONS ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { sport } = req.query;
    let sql = 'SELECT * FROM competitions ORDER BY ordre ASC, nom ASC';
    const params = [];
    if (sport) {
      sql = 'SELECT * FROM competitions WHERE sport = $1 ORDER BY ordre ASC, nom ASC';
      params.push(sport);
    }
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MATCHS D'UNE COMPÉTITION ─────────────────────────────────────────────────
router.get('/:compId/matches', async (req, res) => {
  try {
    const { compId } = req.params;
    const { status } = req.query; // 'upcoming', 'live', 'finished', 'all'

    // Trouver la compétition
    const compR = await query('SELECT * FROM competitions WHERE id::text = $1 OR external_id = $1', [String(compId)]);
    if (!compR.rows.length) return res.status(404).json({ error: 'Compétition introuvable' });
    const comp = compR.rows[0];

    // Si c'est la CDM 2026 (external_id = 2000), utiliser la table matches existante
    if (comp.external_id === '2000') {
      let conditions = [];
      if (status === 'live') conditions.push("statut IN ('IN_PLAY','PAUSED')");
      else if (status === 'upcoming') conditions.push("statut IN ('TIMED','SCHEDULED')");
      else if (status === 'finished') conditions.push("statut = 'FINISHED'");
      // Pas de filtre sur competition_nom - tous les matchs sont CDM 2026
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const orderBy = status === 'finished' ? 'ORDER BY date_heure DESC' : 'ORDER BY date_heure ASC';

      const r = await query(
        `SELECT id, equipe1 AS participant1, equipe2 AS participant2,
                logo1 AS participant1_logo, logo2 AS participant2_logo,
                date_heure, phase, competition AS competition_nom, statut, score_p1, score_p2
         FROM matches ${whereClause} ${orderBy} LIMIT 50`
      );
      return res.json({ competition: comp, matches: r.rows });
    }

    // Pour les autres compétitions : récupérer depuis football-data.org
    if (!FOOTBALL_API_KEY) return res.json({ competition: comp, matches: [] });

    const params_api = {};
    if (status === 'live') params_api.status = 'IN_PLAY,PAUSED';
    else if (status === 'upcoming') params_api.status = 'SCHEDULED,TIMED';
    else if (status === 'finished') params_api.status = 'FINISHED';
    else params_api.status = 'SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED';

    const response = await axios.get(
      `${FOOTBALL_API_URL}/competitions/${comp.external_id}/matches`,
      {
        headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
        params: params_api,
        timeout: 10000,
      }
    );

    const matches = (response.data.matches || []).map(m => ({
      id: `${comp.external_id}_${m.id}`,
      external_id: m.id,
      participant1: m.homeTeam?.name || 'TBD',
      participant2: m.awayTeam?.name || 'TBD',
      participant1_logo: m.homeTeam?.crest || null,
      participant2_logo: m.awayTeam?.crest || null,
      date_heure: m.utcDate,
      phase: m.stage || 'REGULAR_SEASON',
      competition_nom: comp.nom,
      competition_logo: comp.logo,
      statut: m.status === 'LIVE' ? 'IN_PLAY' : m.status,
      score_p1: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
      score_p2: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
      matchday: m.matchday,
    }));

    res.json({ competition: comp, matches });
  } catch (err) {
    console.error('competitions matches error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── MATCHS DU JOUR (toutes compétitions actives) ─────────────────────────────
router.get('/today/all', async (req, res) => {
  try {
    if (!FOOTBALL_API_KEY) return res.json([]);

    const response = await axios.get(`${FOOTBALL_API_URL}/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { status: 'SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED' },
      timeout: 10000,
    });

    const matches = (response.data.matches || []).map(m => ({
      id: m.id,
      participant1: m.homeTeam?.name || 'TBD',
      participant2: m.awayTeam?.name || 'TBD',
      participant1_logo: m.homeTeam?.crest || null,
      participant2_logo: m.awayTeam?.crest || null,
      date_heure: m.utcDate,
      phase: m.stage || 'REGULAR_SEASON',
      competition_nom: m.competition?.name || '',
      competition_id: m.competition?.id,
      statut: m.status === 'LIVE' ? 'IN_PLAY' : m.status,
      score_p1: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
      score_p2: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
    }));

    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── DÉTAIL D'UN MATCH PAR ID ─────────────────────────────────────────────────
// Supporte les IDs CDM (ex: "42") et les IDs composés (ex: "2001_551981")
router.get('/match/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    
    // Si l'ID contient "_", c'est un match d'une autre compétition
    if (matchId.includes('_')) {
      const [compExtId, extMatchId] = matchId.split('_');
      if (!FOOTBALL_API_KEY) return res.status(404).json({ error: 'Match introuvable' });
      
      const response = await axios.get(
        `${FOOTBALL_API_URL}/matches/${extMatchId}`,
        { headers: { 'X-Auth-Token': FOOTBALL_API_KEY }, timeout: 10000 }
      );
      const m = response.data;
      return res.json({
        id: matchId,
        external_id: extMatchId,
        participant1: m.homeTeam?.name || 'TBD',
        participant2: m.awayTeam?.name || 'TBD',
        participant1_logo: m.homeTeam?.crest || null,
        participant2_logo: m.awayTeam?.crest || null,
        date_heure: m.utcDate,
        phase: m.stage || 'REGULAR_SEASON',
        competition_nom: m.competition?.name || '',
        statut: m.status === 'LIVE' ? 'IN_PLAY' : m.status,
        score_p1: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
        score_p2: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
      });
    }
    
    // Sinon c'est un match CDM (ID numérique)
    const r = await query(
      `SELECT id, equipe1 AS participant1, equipe2 AS participant2,
              logo1 AS participant1_logo, logo2 AS participant2_logo,
              date_heure, phase, competition AS competition_nom, statut, score_p1, score_p2
       FROM matches WHERE id = $1 OR id::text = $1`,
      [matchId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Match introuvable' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('match detail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
