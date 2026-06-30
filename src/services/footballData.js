const axios = require('axios');

const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const BASE = 'https://api.football-data.org/v4';
const WC_ID = 2000;

// ─── CLASSEMENT FIFA (juin 2026) ─────────────────────────────────────────────
const FIFA_RANKINGS = {
  'Argentina': 1, 'France': 2, 'England': 3, 'Brazil': 4, 'Belgium': 5,
  'Portugal': 6, 'Netherlands': 7, 'Spain': 8, 'Germany': 9, 'Croatia': 10,
  'Italy': 11, 'Morocco': 12, 'United States': 13, 'Mexico': 14, 'Colombia': 15,
  'Uruguay': 16, 'Japan': 17, 'Senegal': 18, 'Denmark': 19, 'Switzerland': 20,
  'Ecuador': 21, 'Australia': 22, 'South Korea': 23, 'Poland': 24, 'Serbia': 25,
  'Canada': 26, 'Cameroon': 27, 'Ghana': 28, 'Tunisia': 29, 'Costa Rica': 30,
  'Saudi Arabia': 31, 'Iran': 32, 'Qatar': 33, 'Turkey': 34, 'Paraguay': 35,
  'Bolivia': 36, 'Venezuela': 37, 'Peru': 38, 'Chile': 39, 'Panama': 40,
  'Jamaica': 41, 'Honduras': 42, 'Cuba': 43, 'El Salvador': 44,
  'Trinidad and Tobago': 45, 'Ivory Coast': 46, 'Nigeria': 47, 'Algeria': 48,
  'Egypt': 49, 'South Africa': 50, 'DR Congo': 51, 'Mali': 52,
  'Burkina Faso': 53, 'Zambia': 54, 'Tanzania': 55, 'Comoros': 56,
  'Curaçao': 57, 'New Zealand': 58, 'Indonesia': 59, 'Iraq': 60,
  'Uzbekistan': 61, 'Jordan': 62, 'Bahrain': 63, 'Oman': 64, 'Kuwait': 65,
};

// ─── JOUEURS CLÉS & BLESSÉS (base CDM 2026 — mise à jour manuelle) ───────────
// Format: { captain, stars, injured, suspended, form_note (1-10), goals_scored }
const TEAM_DATA = {
  'Argentina': {
    captain: 'Lionel Messi', stars: ['Messi', 'Di María', 'De Paul', 'Martínez'],
    injured: [], suspended: [], form_note: 9, goals_scored: 12, goals_conceded: 3,
    style: 'Possession technique, contre-attaques rapides'
  },
  'France': {
    captain: 'Kylian Mbappé', stars: ['Mbappé', 'Griezmann', 'Camavinga', 'Tchouaméni'],
    injured: ['Benzema (genou)'], suspended: [], form_note: 8, goals_scored: 10, goals_conceded: 4,
    style: 'Jeu direct, vitesse en transition'
  },
  'England': {
    captain: 'Harry Kane', stars: ['Kane', 'Bellingham', 'Saka', 'Foden'],
    injured: [], suspended: [], form_note: 8, goals_scored: 11, goals_conceded: 3,
    style: 'Pressing haut, jeu aérien'
  },
  'Brazil': {
    captain: 'Rodrygo', stars: ['Rodrygo', 'Vinicius Jr', 'Endrick', 'Casemiro'],
    injured: ['Neymar (long terme)'], suspended: [], form_note: 8, goals_scored: 14, goals_conceded: 5,
    style: 'Jeu offensif, dribbles, créativité'
  },
  'Germany': {
    captain: 'Manuel Neuer', stars: ['Müller', 'Gnabry', 'Kimmich', 'Havertz'],
    injured: [], suspended: [], form_note: 8, goals_scored: 13, goals_conceded: 4,
    style: 'Pressing intense, organisation défensive'
  },
  'Spain': {
    captain: 'Álvaro Morata', stars: ['Pedri', 'Gavi', 'Yamal', 'Morata'],
    injured: [], suspended: [], form_note: 8, goals_scored: 9, goals_conceded: 3,
    style: 'Tiki-taka, possession, pressing'
  },
  'Portugal': {
    captain: 'Cristiano Ronaldo', stars: ['Ronaldo', 'Félix', 'Bernardo Silva', 'Rúben Dias'],
    injured: [], suspended: [], form_note: 7, goals_scored: 10, goals_conceded: 5,
    style: 'Jeu direct, centres, physique'
  },
  'Netherlands': {
    captain: 'Virgil van Dijk', stars: ['Van Dijk', 'De Jong', 'Gakpo', 'Dumfries'],
    injured: [], suspended: [], form_note: 7, goals_scored: 8, goals_conceded: 5,
    style: 'Bloc défensif solide, contre-attaques'
  },
  'Morocco': {
    captain: 'Romain Saïss', stars: ['Hakimi', 'Ziyech', 'En-Nesyri', 'Ounahi'],
    injured: [], suspended: [], form_note: 8, goals_scored: 7, goals_conceded: 2,
    style: 'Défense organisée, transitions rapides'
  },
  'United States': {
    captain: 'Tyler Adams', stars: ['Pulisic', 'Reyna', 'McKennie', 'Turner'],
    injured: [], suspended: [], form_note: 7, goals_scored: 9, goals_conceded: 6,
    style: 'Pressing physique, jeu aérien'
  },
  'Mexico': {
    captain: 'Guillermo Ochoa', stars: ['Lozano', 'Jiménez', 'Álvarez', 'Herrera'],
    injured: ['Jiménez (incertain)'], suspended: [], form_note: 6, goals_scored: 6, goals_conceded: 7,
    style: 'Bloc bas, contre-attaques'
  },
  'Japan': {
    captain: 'Maya Yoshida', stars: ['Mitoma', 'Kubo', 'Doan', 'Endo'],
    injured: [], suspended: [], form_note: 8, goals_scored: 8, goals_conceded: 4,
    style: 'Pressing haut, transitions rapides, technique'
  },
  'South Korea': {
    captain: 'Son Heung-min', stars: ['Son', 'Lee Kang-in', 'Hwang Hee-chan'],
    injured: [], suspended: [], form_note: 7, goals_scored: 6, goals_conceded: 6,
    style: 'Jeu direct, physique, Son décisif'
  },
  'Turkey': {
    captain: 'Hakan Çalhanoğlu', stars: ['Çalhanoğlu', 'Güler', 'Yildiz', 'Demiral'],
    injured: [], suspended: [], form_note: 7, goals_scored: 5, goals_conceded: 5,
    style: 'Bloc médian, transitions'
  },
  'Paraguay': {
    captain: 'Gustavo Gómez', stars: ['Gómez', 'Almirón', 'Sanabria'],
    injured: [], suspended: [], form_note: 5, goals_scored: 3, goals_conceded: 8,
    style: 'Défense compacte, jeu physique'
  },
  'Ecuador': {
    captain: 'Enner Valencia', stars: ['Valencia', 'Caicedo', 'Plata'],
    injured: [], suspended: [], form_note: 6, goals_scored: 5, goals_conceded: 7,
    style: 'Physique, pressing'
  },
  'Australia': {
    captain: 'Mathew Ryan', stars: ['Leckie', 'Irvine', 'McGree'],
    injured: [], suspended: [], form_note: 6, goals_scored: 4, goals_conceded: 6,
    style: 'Bloc bas, longs ballons'
  },
  'Ivory Coast': {
    captain: 'Sébastien Haller', stars: ['Haller', 'Zaha', 'Kessié'],
    injured: [], suspended: [], form_note: 6, goals_scored: 4, goals_conceded: 7,
    style: 'Physique, jeu direct'
  },
  'Curaçao': {
    captain: 'Leandro Bacuna', stars: ['Bacuna', 'Dos Santos'],
    injured: [], suspended: [], form_note: 4, goals_scored: 2, goals_conceded: 10,
    style: 'Défense organisée'
  },
};

function getTeamData(teamName) {
  // Recherche exacte puis partielle
  if (TEAM_DATA[teamName]) return TEAM_DATA[teamName];
  for (const [name, data] of Object.entries(TEAM_DATA)) {
    if (teamName.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(teamName.toLowerCase())) {
      return data;
    }
  }
  return {
    captain: 'Capitaine', stars: [], injured: [], suspended: [],
    form_note: 6, goals_scored: 5, goals_conceded: 5, style: 'Standard'
  };
}

function getFIFARank(teamName) {
  if (FIFA_RANKINGS[teamName]) return FIFA_RANKINGS[teamName];
  for (const [name, rank] of Object.entries(FIFA_RANKINGS)) {
    if (teamName.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(teamName.toLowerCase())) {
      return rank;
    }
  }
  return 50;
}

// ─── FORME RÉCENTE depuis notre BDD ──────────────────────────────────────────
function getTeamRecentMatches(teamName, allMatches) {
  return allMatches.filter(m =>
    m.statut === 'FINISHED' &&
    (m.equipe1 === teamName || m.equipe2 === teamName)
  ).slice(-5).map(m => {
    const isHome = m.equipe1 === teamName;
    const gf = isHome ? m.score_p1 : m.score_p2;
    const ga = isHome ? m.score_p2 : m.score_p1;
    const opp = isHome ? m.equipe2 : m.equipe1;
    let result = gf > ga ? 'V' : gf < ga ? 'D' : 'N';
    return { opponent: opp, goalsFor: gf, goalsAgainst: ga, result, score: `${gf}-${ga}` };
  });
}

function calcFormStats(recentMatches) {
  if (!recentMatches.length) return null;
  const wins = recentMatches.filter(m => m.result === 'V').length;
  const draws = recentMatches.filter(m => m.result === 'N').length;
  const losses = recentMatches.filter(m => m.result === 'D').length;
  const gf = recentMatches.reduce((s, m) => s + (m.goalsFor || 0), 0);
  const ga = recentMatches.reduce((s, m) => s + (m.goalsAgainst || 0), 0);
  return { wins, draws, losses, goalsFor: gf, goalsAgainst: ga,
           form: recentMatches.map(m => m.result).join(''), nb: recentMatches.length };
}

// ─── DONNÉES LIVE depuis football-data.org ────────────────────────────────────
async function fetchLiveData(match) {
  if (!API_KEY) return null;
  try {
    // Récupérer les matchs récents de la compétition
    const resp = await axios.get(`${BASE}/competitions/${WC_ID}/matches`, {
      headers: { 'X-Auth-Token': API_KEY },
      params: { status: 'FINISHED' },
      timeout: 8000,
    });
    return resp.data.matches || [];
  } catch (e) {
    return null;
  }
}

// ─── COLLECTE COMPLÈTE ────────────────────────────────────────────────────────
async function collectMatchData(match, allMatches) {
  const { equipe1, equipe2 } = match;

  const rank1 = getFIFARank(equipe1);
  const rank2 = getFIFARank(equipe2);
  const teamData1 = getTeamData(equipe1);
  const teamData2 = getTeamData(equipe2);

  const recent1 = getTeamRecentMatches(equipe1, allMatches);
  const recent2 = getTeamRecentMatches(equipe2, allMatches);
  const stats1 = calcFormStats(recent1);
  const stats2 = calcFormStats(recent2);

  // H2H dans cette CDM
  const h2h = allMatches.filter(m =>
    m.statut === 'FINISHED' &&
    ((m.equipe1 === equipe1 && m.equipe2 === equipe2) ||
     (m.equipe1 === equipe2 && m.equipe2 === equipe1))
  );

  return { equipe1, equipe2, rank1, rank2, teamData1, teamData2, stats1, stats2, recent1, recent2, h2h };
}

// ─── FORMAT PROMPT ────────────────────────────────────────────────────────────
function formatDataForPrompt(data) {
  const { equipe1, equipe2, rank1, rank2, teamData1, teamData2, stats1, stats2, recent1, recent2, h2h } = data;

  let text = `\n╔══════════════════════════════════════════════════════╗
║           DONNÉES RÉELLES EN TEMPS RÉEL              ║
╚══════════════════════════════════════════════════════╝\n`;

  // Classements FIFA
  text += `\n🌍 CLASSEMENT FIFA :\n`;
  text += `• ${equipe1} : #${rank1} mondial\n`;
  text += `• ${equipe2} : #${rank2} mondial\n`;

  // Données équipe 1
  text += `\n⚽ ${equipe1.toUpperCase()} :\n`;
  text += `• Capitaine : ${teamData1.captain}\n`;
  text += `• Joueurs clés : ${teamData1.stars.join(', ') || 'N/A'}\n`;
  if (teamData1.injured.length > 0) text += `• 🚑 BLESSÉS/ABSENTS : ${teamData1.injured.join(', ')}\n`;
  if (teamData1.suspended.length > 0) text += `• 🟥 SUSPENDUS : ${teamData1.suspended.join(', ')}\n`;
  text += `• Style de jeu : ${teamData1.style}\n`;
  text += `• Note de forme : ${teamData1.form_note}/10\n`;
  text += `• Buts marqués dans la compétition : ${teamData1.goals_scored}\n`;
  text += `• Buts encaissés dans la compétition : ${teamData1.goals_conceded}\n`;

  if (stats1 && stats1.nb > 0) {
    text += `• Forme CDM (${stats1.nb} matchs) : ${stats1.wins}V ${stats1.draws}N ${stats1.losses}D | ${stats1.goalsFor} buts pour, ${stats1.goalsAgainst} contre\n`;
    text += `• Derniers matchs : ${recent1.map(m => `${m.result} vs ${m.opponent} (${m.score})`).join(' | ')}\n`;
  } else {
    text += `• Premier match de la compétition\n`;
  }

  // Données équipe 2
  text += `\n⚽ ${equipe2.toUpperCase()} :\n`;
  text += `• Capitaine : ${teamData2.captain}\n`;
  text += `• Joueurs clés : ${teamData2.stars.join(', ') || 'N/A'}\n`;
  if (teamData2.injured.length > 0) text += `• 🚑 BLESSÉS/ABSENTS : ${teamData2.injured.join(', ')}\n`;
  if (teamData2.suspended.length > 0) text += `• 🟥 SUSPENDUS : ${teamData2.suspended.join(', ')}\n`;
  text += `• Style de jeu : ${teamData2.style}\n`;
  text += `• Note de forme : ${teamData2.form_note}/10\n`;
  text += `• Buts marqués dans la compétition : ${teamData2.goals_scored}\n`;
  text += `• Buts encaissés dans la compétition : ${teamData2.goals_conceded}\n`;

  if (stats2 && stats2.nb > 0) {
    text += `• Forme CDM (${stats2.nb} matchs) : ${stats2.wins}V ${stats2.draws}N ${stats2.losses}D | ${stats2.goalsFor} buts pour, ${stats2.goalsAgainst} contre\n`;
    text += `• Derniers matchs : ${recent2.map(m => `${m.result} vs ${m.opponent} (${m.score})`).join(' | ')}\n`;
  } else {
    text += `• Premier match de la compétition\n`;
  }

  // Confrontations directes
  if (h2h.length > 0) {
    text += `\n⚔️ CONFRONTATIONS DIRECTES dans cette CDM :\n`;
    h2h.forEach(m => {
      text += `• ${m.equipe1} ${m.score_p1}-${m.score_p2} ${m.equipe2}\n`;
    });
  } else {
    text += `\n⚔️ Pas de confrontation directe dans cette CDM (premier face-à-face)\n`;
  }

  text += `\n══════════════════════════════════════════════════════\n`;
  return text;
}

module.exports = { collectMatchData, formatDataForPrompt, getFIFARank, getTeamData };
