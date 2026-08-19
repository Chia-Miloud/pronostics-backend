const axios = require('axios');

const FOOTBALL_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const FOOTBALL_API_URL = 'https://api.football-data.org/v4';

function normaliseStatus(status) {
  return status === 'LIVE' ? 'IN_PLAY' : status;
}

function normaliseMatch(raw, publicId) {
  return {
    id: publicId,
    external_match_id: publicId,
    equipe1: raw.homeTeam?.name || 'TBD',
    equipe2: raw.awayTeam?.name || 'TBD',
    logo1: raw.homeTeam?.crest || null,
    logo2: raw.awayTeam?.crest || null,
    date_heure: raw.utcDate,
    phase: raw.stage || 'REGULAR_SEASON',
    competition_nom: raw.competition?.name || 'Compétition',
    competition_id: raw.competition?.id || null,
    statut: normaliseStatus(raw.status),
    score_p1: raw.score?.fullTime?.home ?? raw.score?.halfTime?.home ?? null,
    score_p2: raw.score?.fullTime?.away ?? raw.score?.halfTime?.away ?? null,
  };
}

function computeForm(team, matches) {
  const recent = matches
    .filter(m => m.statut === 'FINISHED' && (m.equipe1 === team || m.equipe2 === team))
    .sort((a, b) => new Date(b.date_heure) - new Date(a.date_heure))
    .slice(0, 5);

  const resultats = recent.map(m => {
    const domicile = m.equipe1 === team;
    const pour = domicile ? m.score_p1 : m.score_p2;
    const contre = domicile ? m.score_p2 : m.score_p1;
    return {
      resultat: pour > contre ? 'V' : pour < contre ? 'D' : 'N',
      score: `${pour}-${contre}`,
      adversaire: domicile ? m.equipe2 : m.equipe1,
      pour,
      contre,
    };
  });

  const wins = resultats.filter(r => r.resultat === 'V').length;
  const draws = resultats.filter(r => r.resultat === 'N').length;
  const losses = resultats.filter(r => r.resultat === 'D').length;
  const butsPour = resultats.reduce((total, r) => total + (r.pour ?? 0), 0);
  const butsContre = resultats.reduce((total, r) => total + (r.contre ?? 0), 0);

  return { resultats, wins, draws, losses, butsPour, butsContre };
}

function buildClubContext(match, history) {
  const home = computeForm(match.equipe1, history);
  const away = computeForm(match.equipe2, history);
  const h2h = history
    .filter(m => (m.equipe1 === match.equipe1 && m.equipe2 === match.equipe2) || (m.equipe1 === match.equipe2 && m.equipe2 === match.equipe1))
    .slice(0, 3);

  const line = (team, form) => {
    if (!form.resultats.length) return `${team} : aucune rencontre terminée disponible dans cette compétition pour la saison en cours.`;
    const sequence = form.resultats.map(r => `${r.resultat} vs ${r.adversaire} (${r.score})`).join(' | ');
    return `${team} : ${form.wins} victoire(s), ${form.draws} nul(s), ${form.losses} défaite(s) sur ${form.resultats.length} match(s) ; ${form.butsPour} but(s) marqué(s), ${form.butsContre} encaissé(s). Derniers résultats : ${sequence}.`;
  };

  const h2hText = h2h.length
    ? h2h.map(m => `${m.equipe1} ${m.score_p1}-${m.score_p2} ${m.equipe2}`).join(' | ')
    : 'Aucune confrontation terminée entre ces deux équipes n’est disponible dans les données de la saison en cours.';

  return [
    'DONNÉES OFFICIELLES DE COMPÉTITION (football-data.org)',
    `Compétition : ${match.competition_nom}`,
    line(match.equipe1, home),
    line(match.equipe2, away),
    `Confrontations disponibles : ${h2hText}`,
    'Effectifs, blessures, suspensions et buteurs : aucune source officielle vérifiée n’est disponible dans ce flux. Ne pas les inventer.',
  ].join('\n');
}

async function resolveSeasonMatch(publicId) {
  if (!FOOTBALL_API_KEY) throw new Error('Clé API football manquante');
  const [competitionId, externalMatchId] = String(publicId).split('_');
  if (!competitionId || !externalMatchId) throw new Error('Identifiant de match invalide');

  const headers = { 'X-Auth-Token': FOOTBALL_API_KEY };
  const detail = await axios.get(`${FOOTBALL_API_URL}/matches/${externalMatchId}`, { headers, timeout: 10000 });
  const rawMatch = detail.data;
  const resolvedCompetitionId = rawMatch.competition?.id || Number(competitionId);
  const match = normaliseMatch(rawMatch, publicId);

  let history = [];
  try {
    const historyResponse = await axios.get(
      `${FOOTBALL_API_URL}/competitions/${resolvedCompetitionId}/matches`,
      { headers, params: { status: 'FINISHED' }, timeout: 10000 }
    );
    history = (historyResponse.data.matches || []).map(m => normaliseMatch(m, `${resolvedCompetitionId}_${m.id}`));
  } catch (error) {
    console.error('season history unavailable:', error.message);
  }

  return { match, history, context: buildClubContext(match, history) };
}

module.exports = { resolveSeasonMatch, buildClubContext };
