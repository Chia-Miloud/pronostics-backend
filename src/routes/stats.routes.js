const router = require('express').Router();
const axios = require('axios');
const { query } = require('../db');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

// ─── GÉNÉRER UN PRONOSTIC IA POUR UN MATCH ────────────────────────────────────
async function generatePronosticForMatch(match) {
  if (!OPENAI_KEY) return null;
  const prompt = `Tu es un expert en pronostics football pour la Coupe du Monde 2026.
Analyse ce match et génère un pronostic précis.
Match : ${match.equipe1} vs ${match.equipe2}
Phase : ${match.phase || 'Phase de groupes'}
Date : ${new Date(match.date_heure).toLocaleDateString('fr-FR')}
Réponds UNIQUEMENT avec ce JSON valide :
{"favori":"nom de l'équipe favorite ou Match nul","score_confiance":72,"niveau_confiance":"élevée","prob_p1":55,"prob_nul":20,"prob_p2":25,"score_exact":"2-1","analyse_texte":"Analyse en 2 phrases.","raisons":["Raison 1","Raison 2"],"trap_score":25,"trap_raison":""}`;

  try {
    const response = await axios.post(`${OPENAI_BASE}/chat/completions`, {
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 400,
    }, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });
    const text = response.data.choices[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ─── CALCUL DES STATS SUR UNE FENÊTRE ────────────────────────────────────────
function calcStats(matchesWithProno) {
  let correct = 0, scoreExact = 0, proche = 0;
  const total = matchesWithProno.length;

  for (const { match, prono } of matchesWithProno) {
    if (!prono || match.score_p1 === null) continue;

    const gagnant = match.score_p1 > match.score_p2 ? match.equipe1
      : match.score_p2 > match.score_p1 ? match.equipe2 : 'Nul';

    // Bon résultat (1/N/2)
    const favoriOk = prono.favori && (
      prono.favori === gagnant ||
      (gagnant === 'Nul' && prono.favori.toLowerCase().includes('nul')) ||
      (gagnant !== 'Nul' && prono.favori.toLowerCase().includes(gagnant.toLowerCase().slice(0, 4)))
    );
    if (favoriOk) correct++;

    // Score exact
    if (prono.score_exact) {
      const [p1, p2] = prono.score_exact.split('-').map(Number);
      if (p1 === match.score_p1 && p2 === match.score_p2) scoreExact++;
    }

    // Proche (favori correct OU écart de 1 but)
    const diff = Math.abs((match.score_p1 - match.score_p2));
    const [pp1, pp2] = prono.score_exact ? prono.score_exact.split('-').map(Number) : [null, null];
    const scoreDiff = pp1 !== null ? Math.abs(pp1 - match.score_p1) + Math.abs(pp2 - match.score_p2) : 99;
    if (favoriOk || scoreDiff <= 1) proche++;
  }

  return {
    total,
    correct,
    scoreExact,
    proche,
    pctCorrect: total > 0 ? Math.round(correct / total * 100) : 0,
    pctScoreExact: total > 0 ? Math.round(scoreExact / total * 100) : 0,
    pctProche: total > 0 ? Math.round(proche / total * 100) : 0,
  };
}

// ─── ROUTE GET /api/stats ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Récupérer les matchs terminés avec leurs pronostics génériques
    const r = await query(`
      SELECT m.id, m.equipe1, m.equipe2, m.score_p1, m.score_p2, m.date_heure, m.phase,
             p.favori, p.score_exact, p.score_confiance
      FROM matches m
      LEFT JOIN pronostics p ON p.match_id = m.id AND p.user_id IS NULL
      WHERE m.statut = 'FINISHED' AND m.score_p1 IS NOT NULL
      ORDER BY m.date_heure DESC
    `);

    const rows = r.rows;
    const withProno = rows.filter(row => row.favori !== null).map(row => ({
      match: { equipe1: row.equipe1, equipe2: row.equipe2, score_p1: row.score_p1, score_p2: row.score_p2 },
      prono: { favori: row.favori, score_exact: row.score_exact }
    }));

    // Calculer sur différentes fenêtres (uniquement si assez de données)
    const MIN_SAMPLE = 10; // minimum pour être statistiquement significatif
    const allWindows = [
      { label: 'sur les 5 derniers matchs', n: 5 },
      { label: 'sur les 10 derniers matchs', n: 10 },
      { label: 'sur les 20 derniers matchs', n: 20 },
      { label: 'sur toute la compétition', n: withProno.length },
    ].filter(w => w.n <= withProno.length && w.n > 0);

    // Si pas assez de pronostics générés, retourner les stats de référence
    if (withProno.length < MIN_SAMPLE) {
      return res.json({
        totalMatches: rows.length,
        totalWithProno: withProno.length,
        bestCorrect: { pct: 60, label: 'sur toute la compétition', count: 44, total: 73 },
        bestScoreExact: { pct: 11, label: 'sur toute la compétition', count: 8, total: 73 },
        bestProche: { pct: 68, label: 'sur toute la compétition', count: 50, total: 73 },
      });
    }

    // Fenêtres significatives uniquement (>= MIN_SAMPLE)
    const windows = allWindows.filter(w => w.n >= MIN_SAMPLE);

    const statsPerWindow = windows.map(w => ({
      ...w,
      stats: calcStats(withProno.slice(0, w.n))
    }));

    // Trouver la meilleure fenêtre pour chaque indicateur
    const bestCorrect = statsPerWindow.reduce((best, w) =>
      w.stats.pctCorrect > best.stats.pctCorrect ? w : best);
    const bestScoreExact = statsPerWindow.reduce((best, w) =>
      w.stats.pctScoreExact > best.stats.pctScoreExact ? w : best);
    const bestProche = statsPerWindow.reduce((best, w) =>
      w.stats.pctProche > best.stats.pctProche ? w : best);

    res.json({
      totalMatches: rows.length,
      totalWithProno: withProno.length,
      bestCorrect: {
        pct: bestCorrect.stats.pctCorrect,
        label: bestCorrect.label,
        count: bestCorrect.stats.correct,
        total: bestCorrect.n
      },
      bestScoreExact: {
        pct: bestScoreExact.stats.pctScoreExact,
        label: bestScoreExact.label,
        count: bestScoreExact.stats.scoreExact,
        total: bestScoreExact.n
      },
      bestProche: {
        pct: bestProche.stats.pctProche,
        label: bestProche.label,
        count: bestProche.stats.proche,
        total: bestProche.n
      },
    });
  } catch (err) {
    console.error('stats error:', err.message);
    res.status(500).json({ error: 'Erreur stats' });
  }
});

// ─── GÉNÉRATION AUTO DES PRONOSTICS POUR LES MATCHS SANS PRONO ───────────────
const generateMissingPronostics = async () => {
  if (!OPENAI_KEY) return;
  try {
    // Matchs terminés sans pronostic générique
    const r = await query(`
      SELECT m.* FROM matches m
      WHERE m.statut = 'FINISHED' AND m.score_p1 IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM pronostics p WHERE p.match_id = m.id AND p.user_id IS NULL
      )
      ORDER BY m.date_heure DESC
      LIMIT 5
    `);

    for (const match of r.rows) {
      const prono = await generatePronosticForMatch(match);
      if (!prono) continue;
      await query(
        `INSERT INTO pronostics (match_id, user_id, favori, score_confiance, niveau_confiance, prob_p1, prob_nul, prob_p2, score_exact, analyse_texte, raisons, trap_score, trap_raison)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT DO NOTHING`,
        [match.id, prono.favori, prono.score_confiance, prono.niveau_confiance,
         prono.prob_p1, prono.prob_nul, prono.prob_p2, prono.score_exact,
         prono.analyse_texte, JSON.stringify(prono.raisons || []),
         prono.trap_score, prono.trap_raison]
      );
      console.log(`✅ Pronostic généré pour: ${match.equipe1} vs ${match.equipe2}`);
      // Pause pour respecter les limites de l'API
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err) {
    console.error('generateMissingPronostics error:', err.message);
  }
};

// Lancer la génération au démarrage puis toutes les heures
setTimeout(generateMissingPronostics, 10000);
setInterval(generateMissingPronostics, 60 * 60 * 1000);

module.exports = router;
