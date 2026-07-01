const router = require('express').Router();
const { query } = require('../db');
const nodemailer = require('nodemailer');

const ADMIN_EMAILS = ['miloudchia@gmail.com', 'miloudc@hotmail.com'];

// Transporter SMTP OVH
const transporter = nodemailer.createTransport({
  host: 'pro2.mail.ovh.net',
  port: 587,
  secure: false,
  auth: {
    user: 'contact@coupedumonde.ai',
    pass: process.env.SMTP_PASSWORD || 'LoudMoud33/-',
  },
  tls: { rejectUnauthorized: false },
});

// ─── TEMPLATES D'EMAILS ───────────────────────────────────────────────────────

function emailJ1(user) {
  const prenom = user.prenom || 'passionné(e) de foot';
  return {
    subject: `${prenom}, ton pronostic gratuit t'attend ⚽`,
    html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #f1f5f9; border-radius: 16px; overflow: hidden;">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #1a0a2e, #130d2a); padding: 32px 32px 24px; text-align: center; border-bottom: 2px solid #ff3b3b40;">
    <div style="font-size: 36px; margin-bottom: 8px;">⚽</div>
    <h1 style="font-size: 22px; font-weight: 900; color: #fff; margin: 0; letter-spacing: -0.02em;">Prédictions IA · CDM 2026</h1>
    <p style="color: #94a3b8; font-size: 13px; margin: 6px 0 0;">pronostics.coupedumonde.ai</p>
  </div>

  <!-- Corps -->
  <div style="padding: 32px;">
    <p style="font-size: 16px; color: #f1f5f9; margin: 0 0 16px;">Bonjour ${prenom} 👋</p>
    <p style="font-size: 14px; color: #94a3b8; line-height: 1.7; margin: 0 0 20px;">
      Tu t'es inscrit(e) hier sur <strong style="color: #fff;">pronostics.coupedumonde.ai</strong> — bienvenue dans la Coupe du Monde 2026 vue par l'IA !
    </p>

    <!-- Stat mise en avant -->
    <div style="background: linear-gradient(135deg, #1e1640, #130d2a); border: 1px solid #ffd70040; border-radius: 12px; padding: 20px; margin: 0 0 24px; text-align: center;">
      <div style="font-size: 11px; color: #ffd700; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">Taux de réussite</div>
      <div style="font-size: 42px; font-weight: 900; color: #ffd700;">73%</div>
      <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">sur les matchs analysés de la CDM 2026</div>
    </div>

    <p style="font-size: 14px; color: #94a3b8; line-height: 1.7; margin: 0 0 24px;">
      Tu as <strong style="color: #fff;">1 pronostic gratuit par jour</strong> — les matchs des quarts de finale approchent, c'est le moment de tester notre IA sur les meilleures affiches !
    </p>

    <!-- CTA -->
    <div style="text-align: center; margin: 28px 0;">
      <a href="https://pronostics.coupedumonde.ai" style="display: inline-block; background: linear-gradient(135deg, #ff3b3b, #c62828); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 900; font-size: 15px; letter-spacing: -0.01em;">
        Voir les pronostics du jour →
      </a>
    </div>

    <!-- Plans -->
    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin: 24px 0 0;">
      <div style="font-size: 12px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px;">Pour aller plus loin</div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 200px; background: rgba(255,215,0,0.08); border: 1px solid rgba(255,215,0,0.3); border-radius: 10px; padding: 14px;">
          <div style="font-weight: 900; color: #ffd700; margin-bottom: 4px;">🚀 AI Plus — 4,99€/mois</div>
          <div style="font-size: 12px; color: #94a3b8;">Pronostics illimités + score exact</div>
        </div>
        <div style="flex: 1; min-width: 200px; background: rgba(255,59,59,0.08); border: 1px solid rgba(255,59,59,0.3); border-radius: 10px; padding: 14px;">
          <div style="font-weight: 900; color: #ff3b3b; margin-bottom: 4px;">🧠 AI Premium — 9,99€/mois</div>
          <div style="font-size: 12px; color: #94a3b8;">Tout + Live IA Coach en direct</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.07); text-align: center;">
    <p style="font-size: 11px; color: #475569; margin: 0;">
      pronostics.coupedumonde.ai · <a href="https://pronostics.coupedumonde.ai/cgv" style="color: #475569;">CGV</a> · <a href="https://pronostics.coupedumonde.ai/rgpd" style="color: #475569;">Confidentialité</a><br>
      ⚠️ Les pronostics sont fournis à titre informatif. Jouez de manière responsable.
    </p>
  </div>
</div>`
  };
}

function emailJ3(user) {
  const prenom = user.prenom || 'passionné(e) de foot';
  return {
    subject: `${prenom}, les quarts de finale arrivent — es-tu prêt(e) ? 🏆`,
    html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #f1f5f9; border-radius: 16px; overflow: hidden;">
  <!-- Header stade -->
  <div style="background: linear-gradient(180deg, #1a0a2e 0%, #130d2a 100%); padding: 32px; text-align: center; position: relative; border-bottom: 2px solid #ffd70040;">
    <div style="font-size: 40px; margin-bottom: 8px;">🏆</div>
    <h1 style="font-size: 20px; font-weight: 900; color: #fff; margin: 0;">Les quarts de finale approchent</h1>
    <p style="color: #ffd700; font-size: 13px; margin: 6px 0 0; font-weight: 700;">Coupe du Monde 2026</p>
  </div>

  <div style="padding: 32px;">
    <p style="font-size: 16px; color: #f1f5f9; margin: 0 0 16px;">Salut ${prenom} 👋</p>
    <p style="font-size: 14px; color: #94a3b8; line-height: 1.7; margin: 0 0 20px;">
      Tu as utilisé ton pronostic gratuit — et tu sais maintenant comment fonctionne notre IA. Maintenant, les <strong style="color: #fff;">matchs décisifs</strong> arrivent.
    </p>

    <!-- Urgence -->
    <div style="background: linear-gradient(135deg, rgba(255,59,59,0.15), rgba(255,59,59,0.05)); border: 1px solid rgba(255,59,59,0.4); border-radius: 12px; padding: 20px; margin: 0 0 24px;">
      <div style="font-size: 13px; font-weight: 900; color: #ff3b3b; margin-bottom: 8px;">⏰ Les quarts de finale — matchs à ne pas rater</div>
      <div style="font-size: 13px; color: #94a3b8; line-height: 1.7;">
        France · Brésil · Angleterre · Allemagne — les 4 favoris s'affrontent.<br>
        Notre IA a analysé <strong style="color: #fff;">104 matchs</strong> pour prédire les résultats.
      </div>
    </div>

    <!-- Comparaison plans -->
    <div style="margin: 0 0 24px;">
      <div style="font-size: 12px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px;">Ce que tu rates avec le plan gratuit :</div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 12px; font-size: 13px; color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.06);">Score exact prédit</td>
          <td style="padding: 8px 12px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <span style="background: rgba(255,59,59,0.15); color: #ff3b3b; padding: 2px 8px; border-radius: 20px; font-size: 11px;">🔒 Bloqué</span>
          </td>
          <td style="padding: 8px 12px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <span style="background: rgba(0,230,118,0.15); color: #00e676; padding: 2px 8px; border-radius: 20px; font-size: 11px;">✅ AI Plus</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-size: 13px; color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.06);">Pronostics illimités</td>
          <td style="padding: 8px 12px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <span style="background: rgba(255,59,59,0.15); color: #ff3b3b; padding: 2px 8px; border-radius: 20px; font-size: 11px;">1/jour</span>
          </td>
          <td style="padding: 8px 12px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <span style="background: rgba(0,230,118,0.15); color: #00e676; padding: 2px 8px; border-radius: 20px; font-size: 11px;">✅ Illimité</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-size: 13px; color: #94a3b8;">Live IA Coach en direct</td>
          <td style="padding: 8px 12px; text-align: center;">
            <span style="background: rgba(255,59,59,0.15); color: #ff3b3b; padding: 2px 8px; border-radius: 20px; font-size: 11px;">🔒 Bloqué</span>
          </td>
          <td style="padding: 8px 12px; text-align: center;">
            <span style="background: rgba(255,215,0,0.15); color: #ffd700; padding: 2px 8px; border-radius: 20px; font-size: 11px;">🧠 Premium</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- CTA principal -->
    <div style="text-align: center; margin: 28px 0;">
      <a href="https://pronostics.coupedumonde.ai/abonnement" style="display: inline-block; background: linear-gradient(135deg, #ffd700, #ff8c00); color: #000; text-decoration: none; padding: 16px 36px; border-radius: 12px; font-weight: 900; font-size: 16px;">
        Passer à AI Plus — 4,99€/mois →
      </a>
      <p style="font-size: 11px; color: #475569; margin: 10px 0 0;">Annulable à tout moment · Sans engagement</p>
    </div>
  </div>

  <div style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.07); text-align: center;">
    <p style="font-size: 11px; color: #475569; margin: 0;">
      pronostics.coupedumonde.ai · <a href="https://pronostics.coupedumonde.ai/cgv" style="color: #475569;">CGV</a> · <a href="https://pronostics.coupedumonde.ai/rgpd" style="color: #475569;">Confidentialité</a>
    </p>
  </div>
</div>`
  };
}

// ─── ENVOYER LES RELANCES ─────────────────────────────────────────────────────
async function sendRetentionEmails() {
  const results = { j1: 0, j3: 0, errors: 0 };

  try {
    // J+1 : inscrits hier, plan free, pas encore converti
    const j1Users = await query(`
      SELECT id, email, prenom FROM users
      WHERE plan = 'free'
        AND DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'
        AND email NOT LIKE '%test%'
        AND email NOT LIKE '%@test.%'
    `);

    for (const user of j1Users.rows) {
      try {
        const { subject, html } = emailJ1(user);
        await transporter.sendMail({
          from: '"CoupeDuMonde.ai" <contact@coupedumonde.ai>',
          to: user.email,
          subject,
          html,
        });
        results.j1++;
        console.log(`✅ J+1 envoyé à ${user.email}`);
        await new Promise(r => setTimeout(r, 1000)); // 1s entre chaque email
      } catch (e) {
        results.errors++;
        console.error(`❌ Erreur J+1 ${user.email}:`, e.message);
      }
    }

    // J+3 : inscrits il y a 3 jours, plan free, pas encore converti
    const j3Users = await query(`
      SELECT id, email, prenom FROM users
      WHERE plan = 'free'
        AND DATE(created_at) = CURRENT_DATE - INTERVAL '3 days'
        AND email NOT LIKE '%test%'
        AND email NOT LIKE '%@test.%'
    `);

    for (const user of j3Users.rows) {
      try {
        const { subject, html } = emailJ3(user);
        await transporter.sendMail({
          from: '"CoupeDuMonde.ai" <contact@coupedumonde.ai>',
          to: user.email,
          subject,
          html,
        });
        results.j3++;
        console.log(`✅ J+3 envoyé à ${user.email}`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        results.errors++;
        console.error(`❌ Erreur J+3 ${user.email}:`, e.message);
      }
    }

  } catch (e) {
    console.error('Erreur relances:', e.message);
  }

  return results;
}

// ─── ROUTE DÉCLENCHÉE PAR LE SCHEDULER ───────────────────────────────────────
router.post('/run', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  try {
    const results = await sendRetentionEmails();
    console.log(`📧 Relances envoyées: J+1=${results.j1}, J+3=${results.j3}, erreurs=${results.errors}`);
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE ADMIN — APERÇU DES RELANCES À ENVOYER ─────────────────────────────
router.get('/preview', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });

  try {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');
    const decoded = jwt.verify(token, JWT_SECRET);
    const userR = await query('SELECT email FROM users WHERE id = $1', [decoded.id]);
    if (!userR.rows.length || !ADMIN_EMAILS.includes(userR.rows[0].email)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const [j1, j3, total] = await Promise.all([
      query(`SELECT COUNT(*) FROM users WHERE plan='free' AND DATE(created_at)=CURRENT_DATE-INTERVAL '1 day' AND email NOT LIKE '%test%'`),
      query(`SELECT COUNT(*) FROM users WHERE plan='free' AND DATE(created_at)=CURRENT_DATE-INTERVAL '3 days' AND email NOT LIKE '%test%'`),
      query(`SELECT COUNT(*) FROM users WHERE plan='free' AND email NOT LIKE '%test%'`),
    ]);

    res.json({
      j1_pending: parseInt(j1.rows[0].count),
      j3_pending: parseInt(j3.rows[0].count),
      total_free: parseInt(total.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Démarrer les relances automatiques toutes les nuits à 10h
const scheduleRetention = () => {
  const now = new Date();
  const next10h = new Date();
  next10h.setHours(10, 0, 0, 0);
  if (next10h <= now) next10h.setDate(next10h.getDate() + 1);
  const delay = next10h - now;

  setTimeout(async () => {
    console.log('📧 Lancement des relances automatiques...');
    await sendRetentionEmails();
    setInterval(sendRetentionEmails, 24 * 60 * 60 * 1000); // Toutes les 24h
  }, delay);

  console.log(`📧 Relances planifiées dans ${Math.round(delay / 60000)} minutes`);
};

scheduleRetention();

module.exports = router;
