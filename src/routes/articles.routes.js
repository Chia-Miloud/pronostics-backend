const router = require('express').Router();
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

// ─── LISTE TOUS LES ARTICLES (admin) ─────────────────────────────────────────
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

// ─── GÉNÉRER UN ARTICLE VIA IA ────────────────────────────────────────────────
router.post('/generate', requireAdmin, async (req, res) => {
  try {
    // Récupérer les prochains matchs pour contextualiser
    const matchs = await query(
      `SELECT equipe1, equipe2, date_heure, phase FROM matches
       WHERE statut IN ('SCHEDULED','TIMED') ORDER BY date_heure ASC LIMIT 5`
    );
    const prochainMatchs = matchs.rows.map(m =>
      `${m.equipe1} vs ${m.equipe2} (${new Date(m.date_heure).toLocaleDateString('fr-FR')})`
    ).join(', ');

    const themes = [
      "Comment l'IA révolutionne les pronostics sportifs",
      "Les meilleures stratégies pour parier sur la Coupe du Monde 2026",
      "Analyse tactique : les équipes favorites du tournoi",
      "Comprendre les cotes et les probabilités en paris sportifs",
      "Les surprises de la Coupe du Monde : quand l'IA se trompe",
      "Psychologie du parieur : comment éviter les biais cognitifs",
      "Les stats qui ne mentent pas : analyse des phases de groupes",
      "Guide du débutant : comment utiliser les pronostics IA",
    ];
    const theme = themes[Math.floor(Math.random() * themes.length)];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Tu es un expert en pronostics sportifs et en IA pour le site pronostics.coupedumonde.ai.
Écris des articles engageants, informatifs et qui donnent envie de tester les pronostics IA premium.
Style : dynamique, chiffres concrets, exemples réels, appel à l'action subtil vers le site.`
      }, {
        role: 'user',
        content: `Écris un article complet sur le thème : "${theme}"
Contexte : Coupe du Monde 2026. Prochains matchs : ${prochainMatchs || 'à venir'}.

Format de réponse JSON :
{
  "titre": "Titre accrocheur (max 80 chars)",
  "resume": "Résumé en 2 phrases (max 200 chars)",
  "contenu": "Article complet en HTML (h2, p, ul, strong) - 600-900 mots",
  "categorie": "analyse|strategie|guide|actualite",
  "tags": ["tag1", "tag2", "tag3"],
  "social_fb": "Post Facebook (200 chars max, emoji, CTA)",
  "social_insta": "Caption Instagram (150 chars, hashtags)",
  "social_tiktok": "Script TikTok 30s (accroche + 3 points + CTA)"
}`
      }],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    });

    const data = JSON.parse(completion.choices[0].message.content);
    const slug = slugify(data.titre) + '-' + Date.now().toString(36);

    const r = await query(
      `INSERT INTO articles (titre, slug, resume, contenu, categorie, tags, auteur, publie, social_fb, social_insta, social_tiktok, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'IA Coach', false, $7, $8, $9, NOW())
       RETURNING *`,
      [data.titre, slug, data.resume, data.contenu, data.categorie,
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
  // Sécurité : clé secrète interne
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  try {
    const matchs = await query(
      `SELECT equipe1, equipe2, date_heure, phase FROM matches
       WHERE statut IN ('SCHEDULED','TIMED') ORDER BY date_heure ASC LIMIT 5`
    );
    const prochainMatchs = matchs.rows.map(m =>
      `${m.equipe1} vs ${m.equipe2} (${new Date(m.date_heure).toLocaleDateString('fr-FR')})`
    ).join(', ');

    const themes = [
      "Comment l'IA révolutionne les pronostics sportifs",
      "Les meilleures stratégies pour parier sur la Coupe du Monde 2026",
      "Analyse tactique : les équipes favorites du tournoi",
      "Comprendre les cotes et les probabilités en paris sportifs",
      "Les surprises de la Coupe du Monde : quand l'IA se trompe",
      "Psychologie du parieur : comment éviter les biais cognitifs",
      "Les stats qui ne mentent pas : analyse des phases de groupes",
      "Guide du débutant : comment utiliser les pronostics IA",
    ];
    const theme = themes[new Date().getDate() % themes.length];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Tu es un expert en pronostics sportifs et en IA pour le site pronostics.coupedumonde.ai.
Écris des articles engageants, informatifs et qui donnent envie de tester les pronostics IA premium.`
      }, {
        role: 'user',
        content: `Écris un article complet sur le thème : "${theme}"
Contexte : Coupe du Monde 2026. Prochains matchs : ${prochainMatchs || 'à venir'}.
Format JSON : { "titre", "resume", "contenu" (HTML), "categorie", "tags", "social_fb", "social_insta", "social_tiktok" }`
      }],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    });

    const data = JSON.parse(completion.choices[0].message.content);
    const slug = slugify(data.titre) + '-' + Date.now().toString(36);

    const r = await query(
      `INSERT INTO articles (titre, slug, resume, contenu, categorie, tags, auteur, publie, social_fb, social_insta, social_tiktok, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,'IA Coach',true,$7,$8,$9,NOW()) RETURNING id, titre`,
      [data.titre, slug, data.resume, data.contenu, data.categorie,
       data.tags||[], data.social_fb, data.social_insta, data.social_tiktok]
    );

    console.log(`✅ Article auto-publié : ${r.rows[0].titre}`);
    res.json({ success: true, article: r.rows[0] });
  } catch (err) {
    console.error('auto-publish error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
