const router = require('express').Router();
const { query } = require('../db');

const MINIMUM_VERIFIED_SAMPLE = 20;

const normalizeTeam = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

function calcStats(rows) {
  let correct = 0;
  let scoreExact = 0;
  let proche = 0;

  for (const row of rows) {
    const actualOutcome = row.score_p1 > row.score_p2
      ? normalizeTeam(row.equipe1)
      : row.score_p2 > row.score_p1
        ? normalizeTeam(row.equipe2)
        : 'nul';

    const predictedOutcome = normalizeTeam(row.favori);
    const favoriOk = predictedOutcome === actualOutcome
      || (actualOutcome === 'nul' && predictedOutcome.includes('nul'));
    if (favoriOk) correct += 1;

    const scoreMatch = String(row.score_exact || '').match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
    let scoreDistance = Number.POSITIVE_INFINITY;
    if (scoreMatch) {
      const predictedHome = Number(scoreMatch[1]);
      const predictedAway = Number(scoreMatch[2]);
      if (predictedHome === row.score_p1 && predictedAway === row.score_p2) scoreExact += 1;
      scoreDistance = Math.abs(predictedHome - row.score_p1) + Math.abs(predictedAway - row.score_p2);
    }
    if (favoriOk || scoreDistance <= 1) proche += 1;
  }

  const total = rows.length;
  return {
    total,
    correct,
    scoreExact,
    proche,
    pctCorrect: total ? Math.round((correct / total) * 100) : 0,
    pctScoreExact: total ? Math.round((scoreExact / total) * 100) : 0,
    pctProche: total ? Math.round((proche / total) * 100) : 0,
  };
}

router.get('/', async (req, res) => {
  try {
    const rawCompetitionId = req.query.competition_id;
    let competitionFilter = '';
    const params = [];

    if (rawCompetitionId && rawCompetitionId !== '2000') {
      const competitionId = Number.parseInt(rawCompetitionId, 10);
      if (!Number.isInteger(competitionId)) {
        return res.status(400).json({ error: 'competition_id invalide' });
      }
      params.push(competitionId);
      competitionFilter = `AND m.competition_id = $${params.length}`;
    }

    const result = await query(`
      WITH ranked_predictions AS (
        SELECT
          m.id,
          m.equipe1,
          m.equipe2,
          m.score_p1,
          m.score_p2,
          m.date_heure,
          p.id AS pronostic_id,
          p.favori,
          p.score_exact,
          p.created_at AS pronostic_created_at,
          ROW_NUMBER() OVER (
            PARTITION BY m.id
            ORDER BY p.created_at ASC, p.id ASC
          ) AS prediction_rank
        FROM matches m
        JOIN pronostics p
          ON p.match_id = m.id
         AND p.user_id IS NULL
         AND p.created_at < m.date_heure
        WHERE m.statut = 'FINISHED'
          AND m.score_p1 IS NOT NULL
          AND m.score_p2 IS NOT NULL
          ${competitionFilter}
      )
      SELECT *
      FROM ranked_predictions
      WHERE prediction_rank = 1
      ORDER BY date_heure ASC
    `, params);

    const eligibleRows = result.rows;
    const methodology = {
      rule: 'Première prédiction générique enregistrée avant le coup d’envoi de chaque match.',
      sample: 'Échantillon fixe couvrant tous les matchs éligibles, sans sélection de la meilleure fenêtre.',
      minimumRequired: MINIMUM_VERIFIED_SAMPLE,
    };

    if (eligibleRows.length < MINIMUM_VERIFIED_SAMPLE) {
      return res.json({
        available: false,
        provisional: eligibleRows.length > 0,
        totalWithVerifiedProno: eligibleRows.length,
        minimumRequired: MINIMUM_VERIFIED_SAMPLE,
        message: `Bilan temporairement masqué : ${eligibleRows.length} prédiction(s) antérieure(s) au match sur ${MINIMUM_VERIFIED_SAMPLE} requises.`,
        methodology,
      });
    }

    const stats = calcStats(eligibleRows);
    const label = 'sur toutes les prédictions vérifiées avant match';

    res.json({
      available: true,
      totalWithVerifiedProno: stats.total,
      methodology,
      bestCorrect: {
        pct: stats.pctCorrect,
        label,
        count: stats.correct,
        total: stats.total,
      },
      bestScoreExact: {
        pct: stats.pctScoreExact,
        label,
        count: stats.scoreExact,
        total: stats.total,
      },
      bestProche: {
        pct: stats.pctProche,
        label,
        count: stats.proche,
        total: stats.total,
      },
    });
  } catch (error) {
    console.error('stats error:', error.message);
    res.status(500).json({ error: 'Erreur stats' });
  }
});

module.exports = router;
module.exports.calcStats = calcStats;
module.exports.MINIMUM_VERIFIED_SAMPLE = MINIMUM_VERIFIED_SAMPLE;
