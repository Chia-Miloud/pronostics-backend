const router = require('express').Router();
const axios = require('axios');

const FOOTBALL_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const FOOTBALL_API_URL = 'https://api.football-data.org/v4';

// Compétitions prioritaires pour la France
const PRIORITY_COMPETITIONS = [
  { id: 2015, nom: 'Ligue 1', flag: '🇫🇷', priority: 1 },
  { id: 2001, nom: 'Champions League', flag: '🇪🇺', priority: 2 },
  { id: 2021, nom: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', priority: 3 },
  { id: 2014, nom: 'La Liga', flag: '🇪🇸', priority: 4 },
  { id: 2002, nom: 'Bundesliga', flag: '🇩🇪', priority: 5 },
  { id: 2019, nom: 'Serie A', flag: '🇮🇹', priority: 6 },
];

// Cache des matchs chocs (actualisé toutes les heures)
let featuredCache = null;
let featuredCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 heure

async function fetchFeaturedMatches() {
  if (!FOOTBALL_API_KEY) return [];

  const now = Date.now();
  if (featuredCache && (now - featuredCacheTime) < CACHE_TTL) {
    return featuredCache;
  }

  try {
    // Récupérer les matchs de la semaine depuis football-data.org
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const dateFrom = today.toISOString().slice(0, 10);
    const dateTo = nextWeek.toISOString().slice(0, 10);

    const response = await axios.get(`${FOOTBALL_API_URL}/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: {
        dateFrom,
        dateTo,
        competitions: PRIORITY_COMPETITIONS.map(c => c.id).join(','),
      },
      timeout: 10000,
    });

    const matches = response.data.matches || [];

    // Trier par priorité de compétition + date
    const featured = matches
      .filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED' || m.status === 'IN_PLAY' || m.status === 'PAUSED')
      .map(m => {
        const comp = PRIORITY_COMPETITIONS.find(c => c.id === m.competition?.id);
        return {
          id: `${m.competition?.id}_${m.id}`,
          external_id: m.id,
          participant1: m.homeTeam?.name || 'TBD',
          participant2: m.awayTeam?.name || 'TBD',
          participant1_logo: m.homeTeam?.crest || null,
          participant2_logo: m.awayTeam?.crest || null,
          date_heure: m.utcDate,
          phase: m.stage || 'REGULAR_SEASON',
          competition_nom: comp?.nom || m.competition?.name || '',
          competition_flag: comp?.flag || '⚽',
          competition_id: m.competition?.id,
          statut: m.status === 'LIVE' ? 'IN_PLAY' : m.status,
          score_p1: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
          score_p2: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
          priority: comp?.priority || 99,
          matchday: m.matchday,
        };
      })
      .sort((a, b) => {
        // D'abord les matchs en direct
        const aLive = a.statut === 'IN_PLAY' || a.statut === 'PAUSED';
        const bLive = b.statut === 'IN_PLAY' || b.statut === 'PAUSED';
        if (aLive && !bLive) return -1;
        if (!aLive && bLive) return 1;
        // Puis par priorité de compétition
        if (a.priority !== b.priority) return a.priority - b.priority;
        // Puis par date
        return new Date(a.date_heure) - new Date(b.date_heure);
      })
      .slice(0, 12); // Max 12 matchs chocs

    featuredCache = featured;
    featuredCacheTime = now;
    console.log(`✅ Featured matches mis à jour: ${featured.length} matchs`);
    return featured;
  } catch (err) {
    console.error('fetchFeaturedMatches error:', err.message);
    return featuredCache || [];
  }
}

// ─── GET /api/matches/featured ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const matches = await fetchFeaturedMatches();
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualisation automatique toutes les heures
setInterval(fetchFeaturedMatches, CACHE_TTL);
// Premier chargement au démarrage
setTimeout(fetchFeaturedMatches, 5000);

module.exports = router;
