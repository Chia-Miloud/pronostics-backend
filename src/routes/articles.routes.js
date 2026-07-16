const router = require('express').Router();
const axios = require('axios');
const { query } = require('../db');
const { authRequired } = require('../middleware/auth');
const OpenAI = require('openai');

const ADMIN_EMAILS = ['miloudchia@gmail.com', 'miloudc@hotmail.com'];
const requireAdmin = [authRequired, (req, res, next) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Accès refusé' });
  next();
}];

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Slugifier un titre
const slugify = (text) =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

// ─── LISTE ARTICLES PUBLIÉS (public) ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, titre, slug, resume, categorie, tags, image_url, auteur, vues, published_at, created_at
       FROM articles WHERE publie = true ORDER BY published_at DESC LIMIT 20`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ARTICLE PAR SLUG (public) ────────────────────────────────────────────────
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    const r = await query(
      `SELECT id, titre, slug, resume, categorie, publie, vues, published_at, created_at
       FROM articles ORDER BY created_at DESC`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const r = await query(
      `SELECT * FROM articles WHERE slug = $1 AND publie = true`,
      [req.params.slug]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Article introuvable' });
    // Incrémenter les vues
    await query('UPDATE articles SET vues = vues + 1 WHERE slug = $1', [req.params.slug]);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GÉNÉRER UN THÈME BASÉ SUR L'ACTUALITÉ SPORTIVE ─────────────────────────
async function generateActualityTheme(matchs, derniersResultats) {
  const prochainMatchs = matchs.map(m =>
    `${m.equipe1} vs ${m.equipe2} (${new Date(m.date_heure).toLocaleDateString('fr-FR')})`
  ).join(', ');

  const resultatsRecents = derniersResultats.map(m =>
    `${m.equipe1} ${m.score_p1}-${m.score_p2} ${m.equipe2}`
  ).join(', ');

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Construire un contexte riche basé sur les données réelles
  const contexte = `
Date : ${dateStr}
Prochains matchs CDM 2026 : ${prochainMatchs || 'phase finale en cours'}
Résultats récents : ${resultatsRecents || 'voir les matchs terminés'}
  `.trim();

  return contexte;
}

// ─── PROMPT ARTICLE SEO/AEO ──────────────────────────────────────────────────
function buildArticlePrompt(contexte) {
  return {
    system: `Tu es un journaliste sportif expert en Coupe du Monde 2026 et en pronostics football.
Tu écris pour le site pronostics.coupedumonde.ai.

OBJECTIF SEO/AEO : Tes articles doivent :
1. Répondre à des questions que les gens tapent sur Google en ce moment ("pronostic [équipe] vs [équipe]", "qui va gagner la CDM 2026", "analyse [match]")
2. Être cités par les IA (ChatGPT, Perplexity, Gemini) quand on leur pose des questions sur la CDM 2026
3. Contenir des données chiffrées réelles (classements FIFA, stats de la compétition, résultats)
4. Avoir un titre optimisé pour la recherche (inclure les noms d'équipes, "CDM 2026", "pronostic")
5. Mentionner naturellement pronostics.coupedumonde.ai comme source de pronostics

STYLE : Journalistique, factuel, chiffres précis, pas de jargon IA.
AUTEUR : "Équipe Rédaction" (pas d'IA dans le texte)`,
    user: `Contexte actuel :
${contexte}

Génère un article d'ACTUALITÉ SPORTIVE sur un des sujets suivants (choisis le plus pertinent selon les matchs à venir) :
- Analyse pré-match d'un des prochains matchs (avec stats, forme, enjeux)
- Bilan d'une équipe après ses matchs (avec chiffres réels)
- Qui sont les favoris pour la prochaine phase ?
- Analyse tactique d'une équipe en forme
- Les surprises et déceptions de la compétition jusqu'ici

Format JSON strict :
{
  "titre": "Titre SEO avec noms d'équipes et CDM 2026 (max 70 chars)",
  "resume": "2 phrases avec chiffres réels, accrocheur (max 180 chars)",
  "contenu": "Article HTML MINIMUM 800 MOTS avec <h2>, <p>, <ul>, <strong> — données chiffrées réelles, mention naturelle de pronostics.coupedumonde.ai. Structure: intro (100 mots) + 4 sections h2 (150 mots chacune) + analyse favoris (100 mots) + conclusion CTA (50 mots)",
  "categorie": "actualite|analyse|strategie",
  "tags": ["coupe-du-monde-2026", "pronostic", "<nom-equipe>", "<autre-tag>"],
  "social_fb": "Post Facebook 200 chars avec emoji, résultat ou match à venir, lien vers site",
  "social_insta": "Caption Instagram 150 chars avec hashtags #CDM2026 #Football #Pronostic",
  "social_tiktok": "Script TikTok 30s : chiffre choc + analyse + CTA vers site"
}`
  };
}

// ─── GÉNÉRER UN ARTICLE VIA IA ────────────────────────────────────────────────
router.post('/generate', requireAdmin, async (req, res) => {
  try {
    const [matchsR, resultatsR] = await Promise.all([
      query(`SELECT equipe1, equipe2, date_heure, phase FROM matches WHERE statut IN ('SCHEDULED','TIMED') ORDER BY date_heure ASC LIMIT 6`),
      query(`SELECT equipe1, equipe2, score_p1, score_p2, date_heure FROM matches WHERE statut = 'FINISHED' ORDER BY date_heure DESC LIMIT 5`),
    ]);

    const contexte = await generateActualityTheme(matchsR.rows, resultatsR.rows);
    const { system, user } = buildArticlePrompt(contexte);

    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 5000,
    });

    const raw = completion.choices[0]?.message?.content || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Réponse IA invalide');
    const data = JSON.parse(jsonMatch[0]);
    const slug = slugify(data.titre) + '-' + Date.now().toString(36);

    const r = await query(
      `INSERT INTO articles (titre, slug, resume, contenu, categorie, tags, auteur, publie, social_fb, social_insta, social_tiktok, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Équipe Rédaction',false,$7,$8,$9,NOW()) RETURNING *`,
      [data.titre, slug, data.resume, data.contenu, data.categorie || 'actualite',
       data.tags || [], data.social_fb, data.social_insta, data.social_tiktok]
    );

    res.json({ success: true, article: r.rows[0] });
  } catch (err) {
    console.error('generate article error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUBLIER / DÉPUBLIER ──────────────────────────────────────────────────────
router.put('/:id/publish', requireAdmin, async (req, res) => {
  try {
    const { publie } = req.body;
    await query(
      `UPDATE articles SET publie = $1, published_at = CASE WHEN $1 THEN NOW() ELSE published_at END WHERE id = $2`,
      [publie, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MODIFIER UN ARTICLE ──────────────────────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  const { titre, resume, contenu, categorie, tags, social_fb, social_insta, social_tiktok } = req.body;
  try {
    await query(
      `UPDATE articles SET titre=$1, resume=$2, contenu=$3, categorie=$4, tags=$5,
       social_fb=$6, social_insta=$7, social_tiktok=$8 WHERE id=$9`,
      [titre, resume, contenu, categorie, tags, social_fb, social_insta, social_tiktok, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SUPPRIMER UN ARTICLE ─────────────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM articles WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AUTO-GÉNÉRATION HEBDOMADAIRE (appelé par le scheduler Manus) ─────────────
router.post('/auto-publish', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  try {
    const [matchsR, resultatsR] = await Promise.all([
      query(`SELECT equipe1, equipe2, date_heure, phase FROM matches WHERE statut IN ('SCHEDULED','TIMED') ORDER BY date_heure ASC LIMIT 6`),
      query(`SELECT equipe1, equipe2, score_p1, score_p2, date_heure FROM matches WHERE statut = 'FINISHED' ORDER BY date_heure DESC LIMIT 5`),
    ]);

    const contexte = await generateActualityTheme(matchsR.rows, resultatsR.rows);
    const { system, user } = buildArticlePrompt(contexte);

    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 5000,
    });

    const raw = completion.choices[0]?.message?.content || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Réponse IA invalide');
    const data = JSON.parse(jsonMatch[0]);
    const slug = slugify(data.titre) + '-' + Date.now().toString(36);

    const r = await query(
      `INSERT INTO articles (titre, slug, resume, contenu, categorie, tags, auteur, publie, social_fb, social_insta, social_tiktok, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Équipe Rédaction',true,$7,$8,$9,NOW()) RETURNING id, titre`,
      [data.titre, slug, data.resume, data.contenu, data.categorie || 'actualite',
       data.tags||[], data.social_fb, data.social_insta, data.social_tiktok]
    );

    console.log(`✅ Article SEO auto-publié : ${r.rows[0].titre}`);
    res.json({ success: true, article: r.rows[0] });
  } catch (err) {
    console.error('auto-publish error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PLANIFICATION AUTOMATIQUE LUNDI + VENDREDI À 9H ─────────────────────────────────────────────────────────────────────────────────
const autoPublishArticle = async () => {
  try {
    console.log('📝 Génération automatique article (lundi/vendredi)...');
    const [matchsR, resultatsR] = await Promise.all([
      query(`SELECT equipe1, equipe2, date_heure, phase FROM matches WHERE statut IN ('SCHEDULED','TIMED') ORDER BY date_heure ASC LIMIT 6`),
      query(`SELECT equipe1, equipe2, score_p1, score_p2, date_heure FROM matches WHERE statut = 'FINISHED' ORDER BY date_heure DESC LIMIT 5`),
    ]);
    const contexte = await generateActualityTheme(matchsR.rows, resultatsR.rows);
    const { system, user } = buildArticlePrompt(contexte);
    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 5000,
    });
    const raw = completion.choices[0]?.message?.content || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Réponse IA invalide');
    const data = JSON.parse(jsonMatch[0]);
    const slug = slugify(data.titre) + '-' + Date.now().toString(36);
    const r = await query(
      `INSERT INTO articles (titre, slug, resume, contenu, categorie, tags, auteur, publie, social_fb, social_insta, social_tiktok, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,'\u00c9quipe R\u00e9daction',true,$7,$8,$9,NOW()) RETURNING id, titre`,
      [data.titre, slug, data.resume, data.contenu, data.categorie || 'actualite',
       data.tags||[], data.social_fb, data.social_insta, data.social_tiktok]
    );
    console.log(`\u2705 Article auto-publi\u00e9 : ${r.rows[0].titre}`);
  } catch (err) {
    console.error('autoPublishArticle error:', err.message);
  }
};

const scheduleArticleGeneration = () => {
  const scheduleNext = () => {
    const now = new Date();
    const day = now.getUTCDay(); // 0=dim, 1=lun, 5=ven
    
    // Trouver le prochain lundi (1) ou vendredi (5) à 9h UTC
    let daysUntil = 0;
    for (let i = 0; i <= 7; i++) {
      const nextDay = (day + i) % 7;
      const nextDate = new Date(now);
      nextDate.setUTCDate(now.getUTCDate() + i);
      nextDate.setUTCHours(9, 0, 0, 0);
      if ((nextDay === 1 || nextDay === 5) && nextDate > now) {
        daysUntil = i;
        break;
      }
    }
    
    const next = new Date(now);
    next.setUTCDate(now.getUTCDate() + daysUntil);
    next.setUTCHours(9, 0, 0, 0);
    
    const delay = next - now;
    const h = Math.floor(delay / 3600000);
    const d = Math.floor(h / 24);
    console.log(`📝 Article auto planifié dans ${d}j ${h%24}h (${next.toISOString()})`);
    
    setTimeout(async () => {
      await autoPublishArticle();
      scheduleNext(); // Planifier le suivant
    }, delay);
  };
  scheduleNext();
};

// Démarrer la planification
scheduleArticleGeneration();

module.exports = router;
