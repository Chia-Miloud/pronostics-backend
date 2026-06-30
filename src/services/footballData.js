const axios = require('axios');

const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const BASE = 'https://api.football-data.org/v4';
const WC_ID = 2000; // Coupe du Monde 2026

// Classement FIFA approximatif des équipes CDM 2026 (source FIFA juin 2026)
const FIFA_RANKINGS = {
  'Argentina':     1,  'France':        2,  'England':       3,
  'Brazil':        4,  'Belgium':        5,  'Portugal':       6,
  'Netherlands':   7,  'Spain':          8,  'Germany':        9,
  'Croatia':      10,  'Italy':         11,  'Morocco':       12,
  'United States': 13, 'Mexico':        14,  'Colombia':      15,
  'Uruguay':      16,  'Japan':         17,  'Senegal':       18,
  'Denmark':      19,  'Switzerland':   20,  'Ecuador':       21,
  'Australia':    22,  'South Korea':   23,  'Poland':        24,
  'Serbia':       25,  'Canada':        26,  'Cameroon':      27,
  'Ghana':        28,  'Tunisia':       29,  'Costa Rica':    30,
  'Saudi Arabia': 31,  'Iran':          32,  'Qatar':         33,
  'Turkey':       34,  'Paraguay':      35,  'Bolivia':       36,
  'Venezuela':    37,  'Peru':          38,  'Chile':         39,
  'Panama':       40,  'Jamaica':       41,  'Honduras':      42,
  'Cuba':         43,  'El Salvador':   44,  'Trinidad and Tobago': 45,
  'Ivory Coast':  46,  'Nigeria':       47,  'Algeria':       48,
  'Egypt':        49,  'South Africa':  50,  'DR Congo':      51,
  'Mali':         52,  'Burkina Faso':  53,  'Zambia':        54,
  'Tanzania':     55,  'Comoros':       56,  'Curaçao':       57,
  'New Zealand':  58,  'Indonesia':     59,  'Iraq':          60,
  'Uzbekistan':   61,  'Jordan':        62,  'Bahrain':       63,
  'Oman':         64,  'Kuwait':        65,  'Palestine':     66,
};

function getFIFARank(teamName) {
  // Cherche une correspondance partielle
  for (const [name, rank] of Object.entries(FIFA_RANKINGS)) {
    if (teamName.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(teamName.toLowerCase())) {
      return rank;
    }
  }
  return 50; // rang par défaut si inconnu
}

// Récupérer les matchs récents d'une équipe dans la CDM 2026
async function getTeamRecentMatches(teamName, allMatches) {
  const finished = allMatches.filter(m =>
    m.statut === 'FINISHED' &&
    (m.equipe1 === teamName || m.equipe2 === teamName)
  ).slice(-5); // 5 derniers matchs

  return finished.map(m => {
    const isHome = m.equipe1 === teamName;
    const goalsFor = isHome ? m.score_p1 : m.score_p2;
    const goalsAgainst = isHome ? m.score_p2 : m.score_p1;
    const opponent = isHome ? m.equipe2 : m.equipe1;
    let result = 'N';
    if (goalsFor > goalsAgainst) result = 'V';
    else if (goalsFor < goalsAgainst) result = 'D';
    return { opponent, goalsFor, goalsAgainst, result, score: `${goalsFor}-${goalsAgainst}` };
  });
}

// Récupérer les confrontations directes entre 2 équipes
async function getH2H(team1, team2, allMatches) {
  return allMatches.filter(m =>
    m.statut === 'FINISHED' &&
    ((m.equipe1 === team1 && m.equipe2 === team2) ||
     (m.equipe1 === team2 && m.equipe2 === team1))
  );
}

// Calculer les stats de forme d'une équipe
function calcFormStats(recentMatches, teamName) {
  if (!recentMatches.length) return { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, form: 'N/A' };
  const wins = recentMatches.filter(m => m.result === 'V').length;
  const draws = recentMatches.filter(m => m.result === 'N').length;
  const losses = recentMatches.filter(m => m.result === 'D').length;
  const goalsFor = recentMatches.reduce((s, m) => s + (m.goalsFor || 0), 0);
  const goalsAgainst = recentMatches.reduce((s, m) => s + (m.goalsAgainst || 0), 0);
  const form = recentMatches.map(m => m.result).join('');
  return { wins, draws, losses, goalsFor, goalsAgainst, form, nbMatchs: recentMatches.length };
}

// Fonction principale : collecter toutes les données pour un match
async function collectMatchData(match, allMatches) {
  const { equipe1, equipe2 } = match;

  // Classements FIFA
  const rank1 = getFIFARank(equipe1);
  const rank2 = getFIFARank(equipe2);

  // Forme récente dans la CDM 2026
  const recent1 = await getTeamRecentMatches(equipe1, allMatches);
  const recent2 = await getTeamRecentMatches(equipe2, allMatches);
  const form1 = calcFormStats(recent1, equipe1);
  const form2 = calcFormStats(recent2, equipe2);

  // Confrontations directes dans cette CDM
  const h2h = await getH2H(equipe1, equipe2, allMatches);

  // Essayer de récupérer des données supplémentaires depuis football-data.org
  let extraData = null;
  if (API_KEY) {
    try {
      // Récupérer les matchs de la compétition avec stats
      const resp = await axios.get(`${BASE}/competitions/${WC_ID}/matches`, {
        headers: { 'X-Auth-Token': API_KEY },
        params: { status: 'FINISHED' },
        timeout: 8000,
      });
      const apiMatches = resp.data.matches || [];

      // Trouver les matchs récents des 2 équipes dans l'API
      const getApiTeamMatches = (teamName) => {
        return apiMatches.filter(m =>
          m.homeTeam?.name === teamName || m.awayTeam?.name === teamName
        ).slice(-5);
      };

      const apiMatches1 = getApiTeamMatches(equipe1);
      const apiMatches2 = getApiTeamMatches(equipe2);

      if (apiMatches1.length || apiMatches2.length) {
        extraData = { apiMatches1, apiMatches2 };
      }
    } catch (e) {
      // Silencieux si l'API échoue
    }
  }

  return {
    equipe1, equipe2,
    rank1, rank2,
    form1, form2,
    recent1, recent2,
    h2h,
    extraData,
  };
}

// Formater les données en texte pour le prompt IA
function formatDataForPrompt(data) {
  const { equipe1, equipe2, rank1, rank2, form1, form2, recent1, recent2, h2h } = data;

  let text = `\n=== DONNÉES RÉELLES EN TEMPS RÉEL ===\n`;

  text += `\n📊 CLASSEMENT FIFA :\n`;
  text += `• ${equipe1} : #${rank1} mondial\n`;
  text += `• ${equipe2} : #${rank2} mondial\n`;

  text += `\n📈 FORME RÉCENTE dans la CDM 2026 (${recent1.length} derniers matchs) :\n`;
  if (recent1.length > 0) {
    text += `• ${equipe1} : ${form1.wins}V ${form1.draws}N ${form1.losses}D | ${form1.goalsFor} buts marqués, ${form1.goalsAgainst} encaissés | Forme: ${form1.form}\n`;
    text += `  Matchs: ${recent1.map(m => `${m.result} vs ${m.opponent} (${m.score})`).join(', ')}\n`;
  } else {
    text += `• ${equipe1} : Premier match de la compétition\n`;
  }

  if (recent2.length > 0) {
    text += `• ${equipe2} : ${form2.wins}V ${form2.draws}N ${form2.losses}D | ${form2.goalsFor} buts marqués, ${form2.goalsAgainst} encaissés | Forme: ${form2.form}\n`;
    text += `  Matchs: ${recent2.map(m => `${m.result} vs ${m.opponent} (${m.score})`).join(', ')}\n`;
  } else {
    text += `• ${equipe2} : Premier match de la compétition\n`;
  }

  if (h2h.length > 0) {
    text += `\n⚔️ CONFRONTATIONS DIRECTES dans cette CDM :\n`;
    h2h.forEach(m => {
      text += `• ${m.equipe1} ${m.score_p1}-${m.score_p2} ${m.equipe2}\n`;
    });
  }

  text += `\n=====================================\n`;
  return text;
}

module.exports = { collectMatchData, formatDataForPrompt, getFIFARank };
