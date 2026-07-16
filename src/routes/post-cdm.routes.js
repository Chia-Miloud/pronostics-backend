const router = require('express').Router();
const { query } = require('../db');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'pro2.mail.ovh.net', port: 587, secure: false,
  auth: { user: 'contact@coupedumonde.ai', pass: process.env.SMTP_PASSWORD || 'LoudMoud33/-' },
  tls: { rejectUnauthorized: false },
});

// ─── EMAIL PROMO POST-CDM ─────────────────────────────────────────────────────
function buildPromoEmail(user) {
  const prenom = user.prenom || 'passionné(e) de foot';
  const isPaying = user.plan !== 'free';

  const subject = `🏆 La CDM est terminée — les championnats reprennent avec une offre spéciale`;

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #f1f5f9; border-radius: 16px; overflow: hidden;">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #1a0a2e, #0d0d14); padding: 32px; text-align: center; border-bottom: 2px solid rgba(251,191,36,0.3);">
    <div style="font-size: 40px; margin-bottom: 12px;">🏆</div>
    <h1 style="font-size: 22px; font-weight: 900; color: #fff; margin: 0 0 8px;">La Coupe du Monde 2026 est terminée !</h1>
    <p style="color: #94a3b8; font-size: 14px; margin: 0;">Mais les pronostics IA continuent...</p>
  </div>

  <div style="padding: 32px;">
    <p style="font-size: 16px; color: #f1f5f9; margin: 0 0 16px;">Bonjour ${prenom} 👋</p>
    <p style="font-size: 14px; color: #94a3b8; line-height: 1.7; margin: 0 0 24px;">
      La finale est jouée, le champion est couronné. Mais la saison footballistique ne s'arrête pas là !<br>
      <strong style="color: #fff;">Champions League, Premier League, Ligue 1, Bundesliga, Serie A, La Liga</strong> — les plus grands championnats reprennent dès août 2026.
    </p>

    <!-- Promo box -->
    ${!isPaying ? `
    <div style="background: linear-gradient(135deg, rgba(229,62,62,0.15), rgba(251,191,36,0.1)); border: 1px solid rgba(251,191,36,0.4); border-radius: 14px; padding: 24px; margin: 0 0 24px; text-align: center; position: relative; overflow: hidden;">
      <div style="position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #fbbf24, transparent);"></div>
      <div style="font-size: 12px; color: #fbbf24; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">🎉 OFFRE EXCLUSIVE POST-CDM 2026</div>
      <div style="font-size: 28px; font-weight: 900; color: #fbbf24; margin-bottom: 4px;">AI Premium à 4,99€/mois</div>
      <div style="font-size: 14px; color: #94a3b8; margin-bottom: 16px;"><s style="color: #475569;">9,99€/mois</s> — Économisez 5€ le premier mois</div>
      <div style="font-size: 13px; color: #f1f5f9; margin-bottom: 16px;">
        ✅ Pronostics illimités · ✅ Score exact · ✅ Buteurs potentiels<br>
        ✅ Cotes bookmakers · ✅ Live IA Coach en direct
      </div>
      <div style="margin-bottom: 12px;">
        <span style="background: rgba(229,62,62,0.2); color: #e53e3e; border: 1px solid rgba(229,62,62,0.4); padding: 4px 12px; border-radius: 8px; font-weight: 900; font-size: 14px;">Code : CDM2026PREMIUM</span>
      </div>
      <a href="https://pronostics.coupedumonde.ai/abonnement" style="display: inline-block; background: linear-gradient(135deg, #fbbf24, #ff8c00); color: #000; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 900; font-size: 15px;">
        Profiter de l'offre →
      </a>
      <p style="font-size: 11px; color: #475569; margin: 10px 0 0;">Offre valable jusqu'au 31 août 2026 · Sans engagement</p>
    </div>
    ` : `
    <div style="background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 12px; padding: 16px; margin: 0 0 24px; text-align: center;">
      <div style="font-size: 13px; color: #22c55e; font-weight: 800;">✅ Vous êtes déjà abonné — profitez des championnats dès maintenant !</div>
    </div>
    `}

    <!-- Compétitions -->
    <div style="margin-bottom: 24px;">
      <div style="font-size: 12px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px;">⚽ Compétitions disponibles dès août</div>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${['🇪🇺 Champions League', '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League', '🇫🇷 Ligue 1', '🇩🇪 Bundesliga', '🇮🇹 Serie A', '🇪🇸 La Liga'].map(c => `
          <span style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); padding: 5px 12px; border-radius: 20px; font-size: 12px; color: #f1f5f9;">${c}</span>
        `).join('')}
      </div>
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="https://pronostics.coupedumonde.ai/competitions" style="display: inline-block; background: linear-gradient(135deg, #e53e3e, #c62828); color: #fff; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-weight: 900; font-size: 15px; box-shadow: 0 4px 20px rgba(229,62,62,0.35);">
        Voir les compétitions →
      </a>
    </div>
  </div>

  <div style="padding: 18px 32px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center;">
    <p style="font-size: 11px; color: #475569; margin: 0;">
      pronostics.coupedumonde.ai · <a href="https://pronostics.coupedumonde.ai/cgv" style="color: #475569;">CGV</a> · <a href="https://pronostics.coupedumonde.ai/rgpd" style="color: #475569;">Confidentialité</a>
    </p>
  </div>
</div>`;

  return { subject, html };
}

// ─── ENVOYER LES EMAILS PROMO ─────────────────────────────────────────────────
async function sendPromoEmails() {
  try {
    const users = await query(`
      SELECT id, email, prenom, plan FROM users
      WHERE email NOT LIKE '%test%' AND email NOT LIKE '%@test.%'
        AND id != (SELECT id FROM users WHERE email = 'miloudc@hotmail.com' LIMIT 1)
    `);

    let sent = 0, errors = 0;
    for (const user of users.rows) {
      try {
        const { subject, html } = buildPromoEmail(user);
        await transporter.sendMail({
          from: '"Prédictions IA · CDM 2026" <contact@coupedumonde.ai>',
          to: user.email, subject, html,
        });
        sent++;
        console.log(`✅ Promo envoyée à ${user.email}`);
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        errors++;
        console.error(`❌ Erreur promo ${user.email}:`, e.message);
      }
    }
    console.log(`📧 Promo terminée: ${sent} envoyés, ${errors} erreurs`);
    return { sent, errors };
  } catch (err) {
    console.error('sendPromoEmails error:', err.message);
    return { error: err.message };
  }
}

// ─── ROUTE DÉCLENCHÉE LE 20 JUILLET À 00H00 ──────────────────────────────────
router.post('/launch', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET) return res.status(403).json({ error: 'Accès refusé' });

  try {
    // 1. Envoyer les emails promo
    const emailResult = await sendPromoEmails();

    // 2. Mettre à jour le flag "post-cdm" en base pour que le frontend bascule
    await query(`
      INSERT INTO settings (key, value) VALUES ('post_cdm_mode', 'true')
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()
    `).catch(() => {}); // Ignore si table settings n'existe pas encore

    res.json({ success: true, emails: emailResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PLANIFICATION AUTOMATIQUE LE 20 JUILLET À 00H00 ─────────────────────────
const schedulePostCDM = () => {
  const now = new Date();
  const target = new Date('2026-07-20T00:00:00+02:00'); // 00h00 heure Paris
  const delay = target - now;

  if (delay <= 0) {
    console.log('📅 Post-CDM: date passée, pas de planification');
    return;
  }

  setTimeout(async () => {
    console.log('🚀 LANCEMENT POST-CDM 2026 — Refonte + emails promo');
    await sendPromoEmails();
  }, delay);

  const h = Math.floor(delay / 3600000);
  const d = Math.floor(h / 24);
  console.log(`📅 Post-CDM planifié dans ${d} jours et ${h % 24}h`);
};

schedulePostCDM();

module.exports = router;
