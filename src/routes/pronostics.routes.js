const router = require('express').Router();
const axios = require('axios');
const { query } = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

const { collectMatchData, formatDataForPrompt } = require('../services/footballData');
const { resolveSeasonMatch } = require('../services/seasonMatchData');
const { query: dbQuery } = require('../db');

const PLAN_FEATURES = {
  free:       { quota: 3, score_exact: false, analyse: false, live: false },
  ai_plus:    { quota: 999, score_exact: true, analyse: true, live: false },
  ai_premium: { quota: 999, score_exact: true, analyse: true, live: true },
};

async function resolveMatchForFeature(matchId) {
  if (String(matchId).includes('_')) {
    const seasonData = await resolveSeasonMatch(matchId);
    return seasonData.match;
  }
  const matchR = await query(
    `SELECT id, equipe1, equipe2, statut, score_p1, score_p2, phase, competition AS competition_nom, date_heure
     FROM matches WHERE id = $1`, [matchId]
  );
  return matchR.rows[0] || null;
}

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
async function generatePronostic(match, allMatches, verifiedContext = null) {
  const phase = match.phase || 'REGULAR_SEASON';
  const isKnockout = ['LAST_32','LAST_16','QUARTER_FINAL','SEMI_FINAL','FINAL','THIRD_PLACE'].includes(phase);
  const enjeu = isKnockout ? 'Match éliminatoire — pas de prolongations en temps réglementaire' : 'Phase de groupes';

  // Les compétitions de clubs utilisent le contexte officiel de leur calendrier.
  // Les anciennes données CDM ne restent qu'un secours pour les matchs historiques locaux.
  let realData = verifiedContext || '';
  if (!realData) {
    try {
      const data = await collectMatchData(match, allMatches || []);
      realData = formatDataForPrompt(data);
    } catch (e) {
      console.log('Données réelles non disponibles:', e.message);
    }
  }

  const prompt = `Tu es un analyste football expert et FACTUEL. Génère un pronostic précis basé UNIQUEMENT sur les données réelles ci-dessous.

MATCH : ${match.equipe1} vs ${match.equipe2}
Phase : ${phase} | ${enjeu}
Date : ${new Date(match.date_heure).toLocaleDateString('fr-FR')}
${realData}
⚠️ GARDE-FOUS ABSOLUS - VIOLATIONS INTERDITES :
1. NE JAMAIS inventer de joueurs, d'absences, de blessures, de suspensions ou de statistiques non présentes dans les données ci-dessus.
2. NE JAMAIS dire qu'une équipe n'a pas marqué si les données montrent des buts.
3. Si aucune liste d'effectif officielle vérifiée n'est fournie, retourner impérativement un tableau vide pour buteurs_potentiels.
4. Si les données montrent X buts marqués, citer uniquement ce chiffre réel.
5. prob_p1 + prob_nul + prob_p2 = 100 exactement.
6. score_confiance entre 52 et 85.
7. L'analyse_texte doit s'appuyer uniquement sur les données disponibles (calendrier, forme, résultats, buts).
8. Les cotes sont des cotes indicatives calculées à partir des probabilités ; ne jamais les présenter comme des cotes bookmakers observées.

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
  "trap_raison": "<risque principal>",
    "buteurs_potentiels": [],
  "cotes": {
    "victoire_1": <cote indicative décimale pour ${match.equipe1}>,
    "nul": <cote indicative décimale pour match nul>,
    "victoire_2": <cote indicative décimale pour ${match.equipe2}>,
    "score_exact": <cote indicative pour le score exact prédit>,
    "source": "Estimation Prono Sport fondée sur les probabilités IA"
  }
}`;

  const text = await callAI(prompt, 1200);
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

    const isSeasonMatch = String(matchId).includes('_');
    let match;
    let storageMatchId = null;
    let externalMatchId = null;
    let verifiedContext = null;
    let allMatches = [];

    if (isSeasonMatch) {
      // Les matchs de championnat restent liés à leur source officielle.
      const seasonData = await resolveSeasonMatch(matchId);
      match = seasonData.match;
      externalMatchId = String(matchId);
      verifiedContext = seasonData.context;
      allMatches = seasonData.history;
    } else {
      const matchR = await query(
        `SELECT id, equipe1, equipe2, date_heure, phase, competition AS competition_nom, statut, score_p1, score_p2
         FROM matches WHERE id = $1`, [matchId]
      );
      if (!matchR.rows.length) return res.status(404).json({ error: 'Match introuvable' });
      match = matchR.rows[0];
      storageMatchId = match.id;
      const allMatchesR = await query('SELECT * FROM matches ORDER BY date_heure ASC');
      allMatches = allMatchesR.rows;
    }

    const cacheField = isSeasonMatch ? 'external_match_id' : 'match_id';
    const cacheValue = isSeasonMatch ? externalMatchId : storageMatchId;
    const existing = await query(
      `SELECT * FROM pronostics WHERE ${cacheField} = $1 AND user_id IS NULL AND created_at > NOW() - INTERVAL '2 hours' ORDER BY created_at DESC LIMIT 1`,
      [cacheValue]
    );

    let pronosticData;
    if (existing.rows.length) {
      pronosticData = existing.rows[0];
    } else {
      const generated = await generatePronostic(match, allMatches, verifiedContext);
      const saved = await query(
        `INSERT INTO pronostics (match_id, external_match_id, user_id, favori, score_confiance, niveau_confiance, prob_p1, prob_nul, prob_p2, score_exact, analyse_texte, raisons, trap_score, trap_raison, buteurs, cotes)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
        [storageMatchId, externalMatchId, generated.favori, generated.score_confiance, generated.niveau_confiance,
         generated.prob_p1, generated.prob_nul, generated.prob_p2, generated.score_exact,
         generated.analyse_texte, JSON.stringify(generated.raisons || []),
         generated.trap_score, generated.trap_raison,
         JSON.stringify(generated.buteurs_potentiels || []),
         JSON.stringify(generated.cotes || null)]
      );
      pronosticData = saved.rows[0];
    }

    // Enregistrer la consommation du quota (uniquement pour les utilisateurs Free).
    if (plan === 'free') {
      await query(
        `INSERT INTO pronostics (match_id, external_match_id, user_id, favori, score_confiance, niveau_confiance, prob_p1, prob_nul, prob_p2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [storageMatchId, externalMatchId, user.id, pronosticData.favori, pronosticData.score_confiance,
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
      // Cotes disponibles pour tous (incite à l'abonnement)
      cotes: pronosticData.cotes || null,
      // Buteurs potentiels : 1 seul pour free, tous pour plus/premium
      buteurs: (() => {
        const b = pronosticData.buteurs || [];
        if (plan === 'free') return b.slice(0, 1); // 1 buteur en apercu
        return b; // tous pour plus/premium
      })(),
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

    // Récupérer le match depuis la base historique ou le calendrier officiel de saison.
    const match = await resolveMatchForFeature(matchId);
    if (!match) return res.status(404).json({ error: 'Match introuvable' });

    const scoreInfo = match.score_p1 !== null
      ? `Score actuel : ${match.equipe1} ${match.score_p1}-${match.score_p2} ${match.equipe2}`
      : `Match pas encore commencé`;

    const prompt = `Tu es le Live IA Coach de Prono Sport. Tu aides les supporters pendant les matchs de championnat et de coupe.

Match : ${match.equipe1} vs ${match.equipe2}
Compétition : ${match.competition_nom || 'Football'}
Phase : ${match.phase || 'Saison régulière'}
Statut : ${match.statut}
${scoreInfo}

Question du supporter : "${question}"

Réponds en 2-3 phrases maximum et en français. Base-toi exclusivement sur le score, le statut et les informations ci-dessus. Si une donnée (minute, carton, blessure, tireur) n'est pas fournie, indique clairement qu'elle n'est pas disponible au lieu de l'inventer. Tu peux proposer une lecture prudente de l'évolution du match, sans présenter de chiffre inventé comme une donnée réelle.`;

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
    const match = await resolveMatchForFeature(matchId);
    if (!match) return res.status(404).json({ error: 'Match introuvable' });

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
