const router = require('express').Router();
const axios = require('axios');
const { query } = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

const { collectMatchData, formatDataForPrompt } = require('../services/footballData');
const { query: dbQuery } = require('../db');

const PLAN_FEATURES = {
  free:       { quota: 1, score_exact: false, analyse: false, live: false },
  ai_plus:    { quota: 999, score_exact: true, analyse: true, live: false },
  ai_premium: { quota: 999, score_exact: true, analyse: true, live: true },
};

// ─── APPEL IA GÉNÉRIQUE ───────────────────────────────────────────────────────
async function callAI(prompt, maxTokens = 600) {
  if (!OPENAI_KEY) throw new Error('Service IA non configuré');
  const response = await axios.post(`${OPENAI_BASE}/chat/completions`, {
    model: AI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: maxTokens,
  }, {
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    timeout: 25000,
  });
  return response.data.choices[0]?.message?.content || '';
}

// ─── GÉNÉRER UN PRONOSTIC IA ──────────────────────────────────────────────────
async function generatePronostic(match, allMatches) {
  const phase = match.phase || 'GROUP_STAGE';
  const isKnockout = ['LAST_32','LAST_16','QUARTER_FINAL','SEMI_FINAL','FINAL','THIRD_PLACE'].includes(phase);
  const enjeu = isKnockout ? 'Match éliminatoire — pas de prolongations en temps réglementaire' : 'Phase de groupes';

  // Collecter les données réelles
  let realData = '';
  try {
    const data = await collectMatchData(match, allMatches || []);
    realData = formatDataForPrompt(data);
  } catch(e) {
    console.log('Données réelles non disponibles:', e.message);
  }

  const prompt = `Tu es un analyste football expert. Génère un pronostic précis basé sur les données réelles ci-dessous.

MATCH : ${match.equipe1} vs ${match.equipe2}
Phase : ${phase} | ${enjeu}
Date : ${new Date(match.date_heure).toLocaleDateString('fr-FR')}
${realData}
INSTRUCTIONS :
1. Base-toi UNIQUEMENT sur les données réelles fournies ci-dessus
2. Les probabilités doivent refléter la forme réelle des équipes
3. Le score exact doit être cohérent avec les stats offensives/défensives
4. score_confiance entre 52 et 85 selon la clarté du favori
5. prob_p1 + prob_nul + prob_p2 = 100 exactement
6. L'analyse_texte doit citer des chiffres réels des données ci-dessus

Réponds UNIQUEMENT avec ce JSON (sans texte avant ou après) :
{
  "favori": "<nom exact de l'équipe favorite ou 'Match nul'>",
  "score_confiance": <entier 52-85>,
  "niveau_confiance": "<'faible'|'modérée'|'élevée'>",
  "prob_p1": <entier victoire ${match.equipe1}>,
  "prob_nul": <entier match nul>,
  "prob_p2": <entier victoire ${match.equipe2}>,
  "score_exact": "<X-Y>",
  "analyse_texte": "<2-3 phrases avec chiffres réels des données>",
  "raisons": ["<raison basée sur données réelles>", "<raison 2>", "<raison 3>"],
  "trap_score": <entier 0-100>,
  "trap_raison": "<risque principal>"
}`;

  const text = await callAI(prompt, 800);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Réponse IA invalide');
  const data = JSON.parse(jsonMatch[0]);

  // Validation : proba = 100
  const total = (data.prob_p1 || 0) + (data.prob_nul || 0) + (data.prob_p2 || 0);
  if (total !== 100 && total > 0) {
    data.prob_p1 = (data.prob_p1 || 0) + (100 - total);
  }

  return data;
}

// ─── PRONOSTICS GÉNÉRIQUES DES MATCHS TERMINÉS (public, pour le bilan) ─────────────────────────────────────────────────────────────────────────────────
router.get('/results', async (req, res) => {
  try {
    // Retourner les pronostics génériques (user_id IS NULL) pour les matchs terminés
    // Prendre le plus récent par match
    const r = await query(`
      SELECT DISTINCT ON (p.match_id)
        p.match_id, p.favori, p.score_confiance, p.niveau_confiance,
        p.prob_p1, p.prob_nul, p.prob_p2
      FROM pronostics p
      JOIN matches m ON p.match_id = m.id
      WHERE p.user_id IS NULL
        AND m.statut = 'FINISHED'
        AND m.score_p1 IS NOT NULL
      ORDER BY p.match_id, p.created_at DESC
    `);
    // Retourner un objet { matchId: { favori, ... } }
    const result = {};
    for (const row of r.rows) {
      result[row.match_id] = {
        favori: row.favori,
        score_confiance: row.score_confiance,
        niveau_confiance: row.niveau_confiance,
        prob_p1: row.prob_p1,
        prob_nul: row.prob_nul,
        prob_p2: row.prob_p2,
      };
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

    // Récupérer le match — CORRECTION: utiliser competition_nom (pas competition)
    const matchR = await query(
      `SELECT id, equipe1, equipe2, date_heure, phase, competition AS competition_nom, statut, score_p1, score_p2
       FROM matches WHERE id = $1`, [matchId]
    );
    if (!matchR.rows.length) return res.status(404).json({ error: 'Match introuvable' });
    const match = matchR.rows[0];

    // Chercher un pronostic récent (< 6h, non lié à un user spécifique)
    const existing = await query(
      `SELECT * FROM pronostics WHERE match_id = $1 AND user_id IS NULL AND created_at > NOW() - INTERVAL '2 hours' ORDER BY created_at DESC LIMIT 1`,
      [matchId]
    );

    let pronosticData;
    if (existing.rows.length) {
      pronosticData = existing.rows[0];
    } else {
      // Générer via IA
      // Récupérer tous les matchs terminés pour calculer la forme
    const allMatchesR = await query('SELECT * FROM matches ORDER BY date_heure ASC');
    const generated = await generatePronostic(match, allMatchesR.rows);

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

    // Enregistrer la consommation du quota (uniquement pour les users free)
    if (plan === 'free') {
      await query(
        `INSERT INTO pronostics (match_id, user_id, favori, score_confiance, niveau_confiance, prob_p1, prob_nul, prob_p2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [matchId, user.id, pronosticData.favori, pronosticData.score_confiance,
         pronosticData.niveau_confiance, pronosticData.prob_p1, pronosticData.prob_nul, pronosticData.prob_p2]
      );
    }

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
    console.error('pronostic error:', err.message, err.stack?.split('\n')[1]);
    res.status(500).json({ error: 'Erreur lors de la génération du pronostic', detail: err.message });
  }
});

// ─── LIVE IA COACH — POST /pronostics/live/:matchId/chat ──────────────────────
// Répond à une question de l'utilisateur sur un match en cours
router.post('/live/:matchId/chat', authRequired, async (req, res) => {
  try {
    const user = req.user;
    if (user.plan !== 'ai_premium') {
      return res.status(403).json({ error: 'Live IA Coach réservé aux abonnés AI Premium', upgrade: true });
    }

    const { matchId } = req.params;
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question requise' });

    // Récupérer le match
    const matchR = await query(
      `SELECT id, equipe1, equipe2, statut, score_p1, score_p2, phase, competition AS competition_nom, date_heure
       FROM matches WHERE id = $1`, [matchId]
    );
    if (!matchR.rows.length) return res.status(404).json({ error: 'Match introuvable' });
    const match = matchR.rows[0];

    const scoreInfo = match.score_p1 !== null
      ? `Score actuel : ${match.equipe1} ${match.score_p1}-${match.score_p2} ${match.equipe2}`
      : `Match pas encore commencé`;

    const prompt = `Tu es le Live IA Coach pour la Coupe du Monde 2026.
Tu analyses le match en temps réel et réponds aux questions des supporters.

Match : ${match.equipe1} vs ${match.equipe2}
Phase : ${match.phase || 'Phase de groupes'}
Statut : ${match.statut}
${scoreInfo}

Question du supporter : "${question}"

Réponds en 2-3 phrases maximum. Sois précis, chiffré et prédictif (pas descriptif).
Donne une probabilité ou un chiffre concret dans ta réponse.
Réponds en français.`;

    const answer = await callAI(prompt, 200);

    res.json({
      question,
      answer: answer.trim(),
      match: { equipe1: match.equipe1, equipe2: match.equipe2, score_p1: match.score_p1, score_p2: match.score_p2 }
    });
  } catch (err) {
    console.error('live chat error:', err.message);
    res.status(500).json({ error: 'Erreur Live IA Coach' });
  }
});

// ─── LIVE IA COACH — GET /pronostics/live/:matchId/questions ─────────────────
// Génère des questions contextuelles selon l'état du match
router.get('/live/:matchId/questions', authRequired, async (req, res) => {
  try {
    const user = req.user;
    if (user.plan !== 'ai_premium') {
      return res.status(403).json({ error: 'Live IA Coach réservé aux abonnés AI Premium' });
    }

    const { matchId } = req.params;
    const matchR = await query(
      `SELECT id, equipe1, equipe2, statut, score_p1, score_p2, phase FROM matches WHERE id = $1`,
      [matchId]
    );
    if (!matchR.rows.length) return res.status(404).json({ error: 'Match introuvable' });
    const match = matchR.rows[0];

    const scoreInfo = match.score_p1 !== null
      ? `Score : ${match.equipe1} ${match.score_p1}-${match.score_p2} ${match.equipe2}`
      : `Match à venir`;

    const prompt = `Tu analyses le match : ${match.equipe1} vs ${match.equipe2}. ${scoreInfo}. Statut: ${match.statut}.

Génère exactement 4 questions PRÉDICTIVES et PERTINENTES que le supporter voudrait poser à l'IA.
Les questions doivent concerner l'évolution du score, les probabilités d'événements futurs, pas ce qui s'est déjà passé.

Réponds UNIQUEMENT avec ce JSON :
{"questions": ["Question 1 ?", "Question 2 ?", "Question 3 ?", "Question 4 ?"]}`;

    const text = await callAI(prompt, 200);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const data = jsonMatch ? JSON.parse(jsonMatch[0]) : { questions: [] };

    res.json(data);
  } catch (err) {
    console.error('live questions error:', err.message);
    res.status(500).json({ questions: [] });
  }
});


module.exports = router;
