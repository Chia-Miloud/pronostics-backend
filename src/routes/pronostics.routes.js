const router = require('express').Router();
const axios = require('axios');
const { query } = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

const PLAN_FEATURES = {
  free:       { quota: 1, score_exact: false, analyse: false, live: false },
  ai_plus:    { quota: 999, score_exact: true, analyse: true, live: false },
  ai_premium: { quota: 999, score_exact: true, analyse: true, live: true },
};

// ─── GÉNÉRER UN PRONOSTIC IA ──────────────────────────────────────────────────
async function generatePronostic(match) {
  const prompt = `Tu es un expert en pronostics football pour la Coupe du Monde 2026.
Analyse ce match et génère un pronostic précis.

Match : ${match.equipe1} vs ${match.equipe2}
Compétition : ${match.competition_nom}
Phase : ${match.phase || 'Phase de groupes'}
Date : ${new Date(match.date_heure).toLocaleDateString('fr-FR')}

Paramètres à analyser :
- Classement FIFA des deux équipes
- Forme récente (5 derniers matchs)
- Historique des confrontations directes
- Enjeux du match (qualification, élimination)
- Fatigue et calendrier
- Absences probables de joueurs clés
- Conditions météo et lieu du match
- Avantage psychologique

Réponds UNIQUEMENT avec ce JSON valide (rien d'autre avant ou après) :
{
  "favori": "nom de l'équipe favorite ou 'Match nul'",
  "score_confiance": 72,
  "niveau_confiance": "élevée",
  "prob_p1": 55,
  "prob_nul": 20,
  "prob_p2": 25,
  "score_exact": "2-1",
  "analyse_texte": "Analyse factuelle en 2-3 phrases avec des chiffres précis.",
  "raisons": ["Raison 1 avec chiffre", "Raison 2 factuelle", "Raison 3 contextuelle"],
  "trap_score": 25,
  "trap_raison": "Explication du risque si trap_score > 40"
}`;

  const response = await axios.post(`${OPENAI_BASE}/chat/completions`, {
    model: AI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 600,
  }, {
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const text = response.data.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Réponse IA invalide');
  return JSON.parse(jsonMatch[0]);
}

// ─── GET PRONOSTIC D'UN MATCH ─────────────────────────────────────────────────
router.get('/:matchId', authOptional, async (req, res) => {
  try {
    const { matchId } = req.params;
    const user = req.user;
    const plan = user?.plan || 'free';
    const features = PLAN_FEATURES[plan] || PLAN_FEATURES.free;

    // Vérifier quota pour free
    if (plan === 'free' && user) {
      const today = new Date().toISOString().slice(0, 10);
      const qr = await query(
        `SELECT COUNT(*) FROM pronostics WHERE user_id = $1 AND DATE(created_at) = $2`,
        [user.id, today]
      );
      if (parseInt(qr.rows[0].count) >= features.quota) {
        return res.status(429).json({ error: 'Quota journalier atteint', upgrade: true });
      }
    }

    if (!user) return res.status(401).json({ error: 'Connexion requise' });

    // Récupérer le match
    const matchR = await query(
      `SELECT id, equipe1, equipe2, date_heure, phase, competition AS competition_nom, statut
       FROM matches WHERE id = $1`, [matchId]
    );
    if (!matchR.rows.length) return res.status(404).json({ error: 'Match introuvable' });
    const match = matchR.rows[0];

    // Chercher un pronostic récent (< 6h, non lié à un user spécifique)
    const existing = await query(
      `SELECT * FROM pronostics WHERE match_id = $1 AND user_id IS NULL AND created_at > NOW() - INTERVAL '6 hours' ORDER BY created_at DESC LIMIT 1`,
      [matchId]
    );

    let pronosticData;
    if (existing.rows.length) {
      pronosticData = existing.rows[0];
    } else {
      // Générer via IA
      if (!OPENAI_KEY) return res.status(500).json({ error: 'Service IA non configuré' });
      const generated = await generatePronostic(match);

      // Sauvegarder le pronostic générique (sans user)
      const saved = await query(
        `INSERT INTO pronostics (match_id, user_id, favori, score_confiance, niveau_confiance, prob_p1, prob_nul, prob_p2, score_exact, analyse_texte, raisons, trap_score, trap_raison)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [matchId, generated.favori, generated.score_confiance, generated.niveau_confiance,
         generated.prob_p1, generated.prob_nul, generated.prob_p2, generated.score_exact,
         generated.analyse_texte, JSON.stringify(generated.raisons || []),
         generated.trap_score, generated.trap_raison]
      );
      pronosticData = saved.rows[0];
    }

    // Enregistrer la consommation du quota
    await query(
      `INSERT INTO pronostics (match_id, user_id, favori, score_confiance, niveau_confiance, prob_p1, prob_nul, prob_p2)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [matchId, user.id, pronosticData.favori, pronosticData.score_confiance,
       pronosticData.niveau_confiance, pronosticData.prob_p1, pronosticData.prob_nul, pronosticData.prob_p2]
    );

    // Filtrer selon le plan
    const result = {
      favori: pronosticData.favori,
      score_confiance: pronosticData.score_confiance,
      niveau_confiance: pronosticData.niveau_confiance,
      prob_p1: pronosticData.prob_p1,
      prob_nul: pronosticData.prob_nul,
      prob_p2: pronosticData.prob_p2,
    };
    if (features.score_exact) result.score_exact = pronosticData.score_exact;
    if (features.analyse) {
      result.analyse_texte = pronosticData.analyse_texte;
      result.raisons = pronosticData.raisons;
    }

    res.json(result);
  } catch (err) {
    console.error('pronostic error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la génération du pronostic' });
  }
});

module.exports = router;
