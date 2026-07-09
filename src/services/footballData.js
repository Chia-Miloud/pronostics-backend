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

// ─── JOUEURS CLÉS (données RÉELLES depuis football-data.org API) ─────────────────
// Mis à jour automatiquement depuis l'API - squads officiels CDM 2026
const TEAM_DATA = {
  'Uruguay': {
    captain: 'Darwin Núñez',
    stars: ["Rodrigo Aguirre", "Darwin Núñez", "Agustín Canobbio", "Federico Valverde", "Giorgian De Arrascaeta"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Physique, jeu direct',
  },
  'Germany': {
    captain: 'Kai Havertz',
    stars: ["Kai Havertz", "Leroy Sané", "Deniz Undav", "Nadiem Amiri", "Joshua Kimmich"],
    injured: [], suspended: [],
    form_note: 8, goals_scored: 0, goals_conceded: 0,
    style: 'Pressing intense, organisation défensive',
  },
  'Spain': {
    captain: 'Lamine Yamal',
    stars: ["Borja Iglesias", "Yeremi Pino", "Nico Williams", "Fabián Ruiz", "Marcos Llorente"],
    injured: [], suspended: [],
    form_note: 8, goals_scored: 0, goals_conceded: 0,
    style: 'Tiki-taka, possession, pressing',
  },
  'Paraguay': {
    captain: 'Gustavo Gómez',
    stars: ["Antonio Sanabria", "Gabriel Ávalos", "Isidro Pitta", "Andrés Cubas", "Kaku"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Défense compacte',
  },
  'Argentina': {
    captain: 'Lionel Messi',
    stars: ["Lionel Messi", "Lautaro Martínez", "Nicolás González", "Rodrigo de Paul", "Leandro Paredes"],
    injured: [], suspended: [],
    form_note: 9, goals_scored: 0, goals_conceded: 0,
    style: 'Possession technique, contre-attaques',
  },
  'Ghana': {
    captain: 'Thomas Partey',
    stars: ["Antoine Semenyo", "Brandon Thomas-Asante", "Jordan Ayew", "Thomas Partey", "Elisha Owusu"],
    injured: [], suspended: [],
    form_note: 6, goals_scored: 0, goals_conceded: 0,
    style: 'Physique, contre-attaques',
  },
  'Brazil': {
    captain: 'Rodrygo',
    stars: ["Vinicius Junior", "Neymar", "Matheus Cunha", "Lucas Paquetá", "Bruno Guimarães"],
    injured: [], suspended: [],
    form_note: 8, goals_scored: 0, goals_conceded: 0,
    style: 'Jeu offensif, dribbles, créativité',
  },
  'Portugal': {
    captain: 'Cristiano Ronaldo',
    stars: ["Cristiano Ronaldo", "Pedro Neto", "Rafael Leão", "Bernardo Silva", "Rúben Neves"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Jeu direct, physique',
  },
  'Japan': {
    captain: 'Maya Yoshida',
    stars: ["Ritsu Doan", "Daizen Maeda", "Koki Ogawa", "Daichi Kamada", "Takefusa Kubo"],
    injured: [], suspended: [],
    form_note: 8, goals_scored: 0, goals_conceded: 0,
    style: 'Pressing haut, transitions rapides',
  },
  'Mexico': {
    captain: 'Hirving Lozano',
    stars: ["Raúl Jiménez", "Julián Quiñones", "Roberto Alvarado", "Edson Álvarez", "Orbelín Pineda"],
    injured: [], suspended: [],
    form_note: 6, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc bas, contre-attaques',
  },
  'England': {
    captain: 'Harry Kane',
    stars: ["Marcus Rashford", "Ollie Watkins", "Ivan Toney", "Jordan Henderson", "Eberechi Eze"],
    injured: [], suspended: [],
    form_note: 8, goals_scored: 0, goals_conceded: 0,
    style: 'Pressing haut, jeu aérien',
  },
  'United States': {
    captain: 'Christian Pulisic',
    stars: ["Christian Pulisic", "Tim Weah", "Haji Wright", "Weston McKennie", "Alejandro Zendejas"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Pressing physique',
  },
  'South Korea': {
    captain: 'Son Heung-min',
    stars: ["Hwang Heechan", "Heung-min Son", "Hyun-jun Yang", "Jens Castrop", "In-beom Hwang"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Jeu direct, physique',
  },
  'France': {
    captain: 'Kylian Mbappé',
    stars: ["Jean-Philippe Mateta", "Ousmane Dembélé", "Kylian Mbappé", "N'Golo Kanté", "Adrien Rabiot"],
    injured: [], suspended: [],
    form_note: 9, goals_scored: 0, goals_conceded: 0,
    style: 'Jeu direct, vitesse en transition',
  },
  'South Africa': {
    captain: 'Ronwen Williams',
    stars: ["Lyle Foster", "Oswin Appollis", "Iqraam Rayners", "Themba Zwane", "Teboho Mokoena"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc bas, contre-attaques',
  },
  'Algeria': {
    captain: 'Riyad Mahrez',
    stars: ["Riyad Mahrez", "Amine Gouiri", "Mohammed Amoura", "Nabil Bentaleb", "Houssem Aouar"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Technique, jeu collectif',
  },
  'Australia': {
    captain: 'Mathew Ryan',
    stars: ["Mohamed Toure", "Nishan Velupillay", "Cristian Volpato", "Mathew Leckie", "Jackson Irvine"],
    injured: [], suspended: [],
    form_note: 6, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc bas, longs ballons',
  },
  'New Zealand': {
    captain: 'Winston Reid',
    stars: ["Kosta Barbarouses", "Logan Rogerson", "Chris Wood", "Alex Rufer", "Sarpreet Singh"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc bas, physique',
  },
  'Switzerland': {
    captain: 'Granit Xhaka',
    stars: ["Breel Embolo", "Noah Okafor", "Cédric Itten", "Remo Freuler", "Granit Xhaka"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc médian, organisation',
  },
  'Ecuador': {
    captain: 'Enner Valencia',
    stars: ["Jordy Caicedo", "Enner Valencia", "John Yeboah", "Alan Franco", "Jordy Alcívar"],
    injured: [], suspended: [],
    form_note: 6, goals_scored: 0, goals_conceded: 0,
    style: 'Physique, pressing',
  },
  'Sweden': {
    captain: 'Victor Nilsson Lindelöf',
    stars: ["Alexander Isak", "Viktor Gyökeres", "Gustaf Nilsson", "Ken Sema", "Mattias Svanberg"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Organisation défensive',
  },
  'Czechia': {
    captain: 'Tomáš Souček',
    stars: ["Patrik Schick", "Tomáš Chorý", "Jan Kuchta", "Ladislav Krejčí", "Vladimír Darida"],
    injured: [], suspended: [],
    form_note: 6, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc médian, physique',
  },
  'Croatia': {
    captain: 'Luka Modrić',
    stars: ["Andrej Kramarić", "Ivan Perišić", "Ante Budimir", "Luka Modrić", "Mateo Kovačić"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Possession, technique',
  },
  'Saudi Arabia': {
    captain: 'Salem Al-Dawsari',
    stars: ["Sultan Mandash", "Saleh Al Shehri", "Abdullah Al-Hamdan", "Salem Al Dawsari", "Abdullah Al Khaibari"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc bas, contre-attaques',
  },
  'Tunisia': {
    captain: 'Youssef Msakni',
    stars: ["Sebastian Tounekti", "Firas Chaouat", "Elias Saad", "Ellyes Skhiri", "Rani Khedira"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc médian, organisation',
  },
  'Turkey': {
    captain: 'Hakan Çalhanoğlu',
    stars: ["Yunus Akgün", "Muhammed Kerem Aktürkoğlu", "Deniz Gul", "Salih Özcan", "Hakan Çalhanoğlu"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc médian, transitions',
  },
  'Senegal': {
    captain: 'Sadio Mané',
    stars: ["Sadio Mané", "Cherif Ndiaye", "Nicolas Jackson", "Pape Gueye", "Idrissa Gana Guèye"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Physique, vitesse',
  },
  'Belgium': {
    captain: 'Kevin De Bruyne',
    stars: ["Romelu Lukaku", "Leandro Trossard", "Charles De Ketelaere", "Kevin De Bruyne", "Axel Witsel"],
    injured: [], suspended: [],
    form_note: 8, goals_scored: 0, goals_conceded: 0,
    style: 'Jeu offensif, créativité',
  },
  'Morocco': {
    captain: 'Achraf Hakimi',
    stars: ["Soufiane Rahimi", "Ayoub El Kaabi", "Abdessamad Ezzalzouli", "Sofyan Amrabat", "Brahim Diaz"],
    injured: [], suspended: [],
    form_note: 8, goals_scored: 0, goals_conceded: 0,
    style: 'Défense organisée, transitions rapides',
  },
  'Austria': {
    captain: 'Marcel Sabitzer',
    stars: ["Michael Gregoritsch", "Marko Arnautovic", "Saša Kalajdžić", "Florian Grillitsch", "Alessandro Schöpf"],
    injured: [], suspended: [],
    form_note: 6, goals_scored: 0, goals_conceded: 0,
    style: 'Pressing, jeu direct',
  },
  'Colombia': {
    captain: 'James Rodríguez',
    stars: ["Jhon Córdoba", "Luis Díaz", "Luis Suárez", "James Rodríguez", "Juan Fernando Quintero"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Jeu technique, pressing',
  },
  'Egypt': {
    captain: 'Mohamed Salah',
    stars: ["Mohamed Salah", "Omar Marmoush", "Haissem Hassan", "Zizo", "Nabil Dunga"],
    injured: [], suspended: [],
    form_note: 6, goals_scored: 0, goals_conceded: 0,
    style: 'Contre-attaques rapides',
  },
  'Canada': {
    captain: 'Alphonso Davies',
    stars: ["Jonathan David", "Cyle Larin", "Liam Millar", "Jonathan Osorio", "Stephen Eustáquio"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Physique, pressing',
  },
  'Haiti': {
    captain: 'Duckens Nazon',
    stars: ["Duckens Nazon", "Frantzdy Pierrot", "Yassin Fortune", "Jean-Ricner Bellegarde", "Derrick Etienne"],
    injured: [], suspended: [],
    form_note: 4, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc bas',
  },
  'Iran': {
    captain: 'Mehdi Taremi',
    stars: ["Alireza Jahanbakhsh", "Mehdi Taremi", "Dennis Eckert", "Saeid Ezatolahi", "Mehdi Torabi"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Défense organisée, contre-attaques',
  },
  'Bosnia-Herzegovina': {
    captain: 'Edin Džeko',
    stars: ["Edin Džeko", "Jovo Lukić", "Ermedin Demirovic", "Dženis Burnić", "Ivan Šunjić"],
    injured: [], suspended: [],
    form_note: 6, goals_scored: 0, goals_conceded: 0,
    style: 'Physique, jeu aérien',
  },
  'Panama': {
    captain: 'Rolando Blackburn',
    stars: ["José Fajardo", "Ismael Díaz", "Tomas Rodriguez", "Adalberto Carrasquilla", "José Luis Rodríguez"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc bas, physique',
  },
  'Cape Verde Islands': {
    captain: 'Garry Rodrigues',
    stars: ["Willy Semedo", "Ryan Mendes", "Jovane Cabral", "Deroy Duarte", "Garry Rodrigues"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Contre-attaques',
  },
  'Congo DR': {
    captain: 'Chancel Mbemba',
    stars: ["Yoane Wissa", "Theo Bongonda", "Cédric Bakambu", "Gaël Kakuta", "Samuel Moutoussamy"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Physique, contre-attaques',
  },
  'Ivory Coast': {
    captain: 'Sébastien Haller',
    stars: ["Nicolas Pépé", "Evann Guessand", "Ange-Yoan Bonny", "Franck Kessié", "Seko Fofana"],
    injured: [], suspended: [],
    form_note: 6, goals_scored: 0, goals_conceded: 0,
    style: 'Physique, jeu direct',
  },
  'Qatar': {
    captain: 'Akram Afif',
    stars: ["Akram Afif", "Almoez Ali", "Mohammed Muntari", "Assim Madibo", "Abdulaziz Hatem"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Possession, technique',
  },
  'Jordan': {
    captain: 'Yazan Al-Naimat',
    stars: ["Musa Al Taamari", "Mahmoud Al Mardi", "Ali Olwan", "Nizar Al Rashdan", "Rajaei Ayed"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Défense organisée',
  },
  'Iraq': {
    captain: 'Amjad Attwan',
    stars: ["Aymen Hussein", "Ali Al-Hamadi", "Marko Farji", "Amir Al Ammari", "Kevin Yakob"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc bas, contre-attaques',
  },
  'Uzbekistan': {
    captain: 'Eldor Shomurodov',
    stars: ["Eldor Shomurodov", "Igor Sergeev", "Ruslanbek Jiyanov", "Dostonbek Xamdamov", "Otabek Shukurov"],
    injured: [], suspended: [],
    form_note: 5, goals_scored: 0, goals_conceded: 0,
    style: 'Physique, organisation',
  },
  'Netherlands': {
    captain: 'Virgil van Dijk',
    stars: ["Cody Gakpo", "Justin Kluivert", "Wout Weghorst", "Marten de Roon", "Donyell Malen"],
    injured: [], suspended: [],
    form_note: 7, goals_scored: 0, goals_conceded: 0,
    style: 'Bloc défensif, contre-attaques',
  },
  'Norway': {
    captain: 'Erling Haaland',
    stars: ["Alexander Sørloth", "Jens Hauge", "Erling Haaland", "Morten Thorsby", "Martin Ødegaard"],
    injured: [], suspended: [],
    form_note: 8, goals_scored: 0, goals_conceded: 0,
    style: 'Physique, jeu direct',
  },
  'Scotland': {
    captain: 'Andy Robertson',
    stars: ["Che Adams", "George Hirst", "Ross Stewart", "Scott McTominay", "Kenny McLean"],
    injured: [], suspended: [],
    form_note: 6, goals_scored: 0, goals_conceded: 0,
    style: 'Pressing haut, physique',
  },
  'Curaçao': {
    captain: 'Leandro Bacuna',
    stars: ["Gervane Kastaneer", "Kenji Gorré", "Jürgen Locadia", "Leandro Bacuna", "Godfried Roemeratoe"],
    injured: [], suspended: [],
    form_note: 4, goals_scored: 0, goals_conceded: 0,
    style: 'Défense organisée',
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
