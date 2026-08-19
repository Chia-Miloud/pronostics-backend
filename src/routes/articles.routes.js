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
const FOOTBALL_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const FOOTBALL_API_URL = 'https://api.football-data.org/v4';
const EDITORIAL_COMPETITIONS = [
  { id: 2015, nom: 'Ligue 1', priorite: 1 },
  { id: 2001, nom: 'UEFA Champions League', priorite: 2 },
  { id: 2021, nom: 'Premier League', priorite: 3 },
  { id: 2014, nom: 'La Liga', priorite: 4 },
  { id: 2002, nom: 'Bundesliga', priorite: 5 },
  { id: 2019, nom: 'Serie A', priorite: 6 },
];

const slugify = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

let editorialContextCache = null;
let editorialContextCachedAt = 0;

function formatDate(date) {
  return new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

async function fetchEditorialContext() {
  const now = new Date();
  const date = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  if (!FOOTBALL_API_KEY) {
    return `Date de référence : ${date}. La saison 2026-2027 reprend. Aucun calendrier officiel n'a pu être chargé : écrire un article de contexte sur la reprise de Ligue 1 ou des grands championnats, sans inventer de résultat, de transfert, de blessure ou de donnée chiffrée non vérifiée.`;
  }

  if (editorialContextCache && Date.now() - editorialContextCachedAt < 10 * 60 * 1000) {
    return editorialContextCache;
  }

  const headers = { 'X-Auth-Token': FOOTBALL_API_KEY };
  const sources = await Promise.all(EDITORIAL_COMPETITIONS.map(async (competition) => {
    try {
      const [upcomingResponse, finishedResponse] = await Promise.all([
        axios.get(`${FOOTBALL_API_URL}/competitions/${competition.id}/matches`, {
          headers, params: { status: 'SCHEDULED,TIMED' }, timeout: 10000,
        }),
        axios.get(`${FOOTBALL_API_URL}/competitions/${competition.id}/matches`, {
          headers, params: { status: 'FINISHED' }, timeout: 10000,
        }),
      ]);

      return {
        ...competition,
        upcoming: (upcomingResponse.data.matches || []).slice(0, 3),
        finished: (finishedResponse.data.matches || []).slice(-3),
      };
    } catch (error) {
      console.error(`editorial context unavailable for ${competition.nom}:`, error.message);
      return { ...competition, upcoming: [], finished: [] };
    }
  }));

  const lines = [`Date de référence : ${date}.`, 'Source des calendriers et résultats : football-data.org.'];
  for (const source of sources.sort((a, b) => a.priorite - b.priorite)) {
    const upcoming = source.upcoming.map(m =>
      `${m.homeTeam?.name || 'TBD'} vs ${m.awayTeam?.name || 'TBD'} (${formatDate(m.utcDate)})`
    );
    const finished = source.finished.map(m =>
      `${m.homeTeam?.name || 'TBD'} ${m.score?.fullTime?.home ?? '-'}-${m.score?.fullTime?.away ?? '-'} ${m.awayTeam?.name || 'TBD'}`
    );
    if (upcoming.length || finished.length) {
      lines.push(`${source.nom} — prochains matchs : ${upcoming.join(', ') || 'aucun match disponible'} ; derniers résultats : ${finished.join(', ') || 'aucun résultat disponible'}.`);
    }
  }

  lines.push('Priorité éditoriale : Ligue 1 et reprise de saison en France, puis grands championnats européens.');
  lines.push('Ne jamais réutiliser Coupe du monde 2026, Espagne–Argentine, France–Argentine ou tout autre scénario historique sans lien avec le calendrier fourni.');

  editorialContextCache = lines.join('\n');
  editorialContextCachedAt = Date.now();
  return editorialContextCache;
}

function buildArticlePrompt(contexte) {
  return {
    system: `Tu es un journaliste football français, rigoureux et factuel. Tu écris pour Prono Sport, un média d'analyses et de projections sportives. Le service ne propose aucun pari ni aucune mise.

RÈGLES ABSOLUES :
- Le sujet est l'actualité de la saison 2026-2027 : Ligue 1 en priorité, puis grands championnats européens et Ligue des champions.
- Tu n'écris jamais sur la Coupe du monde 2026, sauf si le contexte fourni la mentionne explicitement et qu'elle est indispensable. Ici, elle ne l'est pas.
- Tu utilises uniquement les informations vérifiables dans le contexte. N'invente ni transferts, ni blessés, ni absences, ni statistiques, ni résultats.
- Si le contexte ne contient pas assez de données pour analyser un match, écris un article de préparation de saison ou de calendrier, sans chiffrage inventé.
- Le texte ne dit jamais qu'il a été généré par une IA. L'auteur est « Équipe Rédaction ».

OBJECTIF SEO/AEO : répondre clairement aux recherches des supporters français autour de la Ligue 1, des calendriers, des affiches à venir et des analyses de matchs.`,
    user: `Contexte éditorial vérifié :
${contexte}

Rédige un article d'actualité sportive utile et durable. Choisis le sujet le plus pertinent pour un visiteur français à cette date.

Format JSON strict :
{
  "titre": "Titre SEO centré sur la saison 2026-2027, la Ligue 1 ou un match réellement présent dans le contexte (70 caractères maximum)",
  "resume": "Deux phrases factuelles et accrocheuses (180 caractères maximum)",
  "contenu": "Article HTML de 800 mots minimum, avec <h2>, <p>, <ul> et <strong>. Structure : introduction, contexte, calendrier ou forme des équipes, enjeux, ce qu'il faut suivre, conclusion. Ne pas inventer de donnée.",
  "categorie": "actualite|analyse|strategie",
  "tags": ["ligue-1-ou-championnat-concerne", "saison-2026-2027", "pronostic", "football"],
  "social_fb": "Post Facebook factuel de 200 caractères maximum, avec lien vers le blog Prono Sport",
  "social_insta": "Légende Instagram de 150 caractères maximum et hashtags adaptés, sans #CDM2026",
  "social_tiktok": "Script TikTok 30 secondes : accroche, fait vérifié, analyse et appel à lire l'article"
}`,
  };
}

async function generateArticle() {
  const contexte = await fetchEditorialContext();
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
  const slug = `${slugify(data.titre)}-${Date.now().toString(36)}`;

  const r = await query(
    `INSERT INTO articles (titre, slug, resume, contenu, categorie, tags, auteur, publie, social_fb, social_insta, social_tiktok, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,'Équipe Rédaction',true,$7,$8,$9,NOW())
     RETURNING id, titre, slug, resume, categorie, tags, social_fb, social_insta, social_tiktok, published_at`,
    [data.titre, slug, data.resume, data.contenu, data.categorie || 'actualite',
      data.tags || ['football', 'saison-2026-2027', 'pronostic'], data.social_fb, data.social_insta, data.social_tiktok]
  );
  return r.rows[0];
}

// ─── LISTE ARTICLES PUBLIÉS (public) ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, titre, slug, resume, categorie, tags, image_url, auteur, vues, published_at, created_at
       FROM articles WHERE publie = true ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 20`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    const r = await query(`SELECT id, titre, slug, resume, categorie, publie, vues, published_at, created_at FROM articles ORDER BY created_at DESC`);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const r = await query(`SELECT * FROM articles WHERE slug = $1 AND publie = true`, [req.params.slug]);
    if (!r.rows.length) return res.status(404).json({ error: 'Article introuvable' });
    await query('UPDATE articles SET vues = vues + 1 WHERE slug = $1', [req.params.slug]);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate', requireAdmin, async (req, res) => {
  try {
    const article = await generateArticle();
    await query('UPDATE articles SET publie = false WHERE id = $1', [article.id]);
    res.json({ success: true, article: { ...article, publie: false } });
  } catch (err) {
    console.error('generate article error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/publish', requireAdmin, async (req, res) => {
  try {
    const { publie } = req.body;
    await query(`UPDATE articles SET publie = $1, published_at = CASE WHEN $1 THEN NOW() ELSE published_at END WHERE id = $2`, [publie, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { titre, resume, contenu, categorie, tags, social_fb, social_insta, social_tiktok } = req.body;
  try {
    await query(
      `UPDATE articles SET titre=$1, resume=$2, contenu=$3, categorie=$4, tags=$5, social_fb=$6, social_insta=$7, social_tiktok=$8 WHERE id=$9`,
      [titre, resume, contenu, categorie, tags, social_fb, social_insta, social_tiktok, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM articles WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AUTO-PUBLICATION LUNDI + VENDREDI 9H UTC ────────────────────────────────
router.post('/auto-publish', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET) return res.status(403).json({ error: 'Accès refusé' });

  const weekday = new Date().getUTCDay();
  const forced = req.query.force === 'true';
  if (!forced && weekday !== 1 && weekday !== 5) {
    return res.json({ success: true, skipped: true, reason: 'Publication prévue uniquement lundi et vendredi.' });
  }

  try {
    const article = await generateArticle();
    console.log(`✅ Article saison auto-publié : ${article.titre}`);
    res.json({ success: true, article });
  } catch (err) {
    console.error('auto-publish error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const scheduleArticleGeneration = () => {
  const scheduleNext = () => {
    const now = new Date();
    let next = new Date(now);
    next.setUTCHours(9, 0, 0, 0);
    while (next <= now || ![1, 5].includes(next.getUTCDay())) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    const delay = next - now;
    console.log(`📝 Article saison planifié pour ${next.toISOString()}`);
    setTimeout(async () => {
      try {
        await generateArticle();
      } catch (err) {
        console.error('schedule article error:', err.message);
      }
      scheduleNext();
    }, delay);
  };
  scheduleNext();
};

scheduleArticleGeneration();

module.exports = router;
