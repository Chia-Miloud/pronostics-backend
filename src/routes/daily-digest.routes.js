const router = require('express').Router();
const { query } = require('../db');
const nodemailer = require('nodemailer');

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

const PHASE_LABELS = {
  GROUP_STAGE: 'Phase de groupes',
  LAST_32: 'Huitièmes de finale',
  LAST_16: 'Huitièmes de finale',
  QUARTER_FINALS: 'Quarts de finale',
  SEMI_FINALS: 'Demi-finales',
  FINAL: 'Finale',
  THIRD_PLACE: 'Match pour la 3ème place',
};

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

function buildDailyEmail(user, todayMatches, tomorrowMatches) {
  const prenom = user.prenom || 'supporter';
  const isPremium = user.plan === 'ai_premium';
  const isPlus = user.plan === 'ai_plus';
  const isFree = user.plan === 'free';

  // Construire la liste des matchs du jour
  const matchesHtml = todayMatches.length > 0
    ? todayMatches.map(m => {
        const phase = PHASE_LABELS[m.phase] || m.phase;
        const time = formatTime(m.date_heure);
        const isLive = m.statut === 'IN_PLAY' || m.statut === 'PAUSED';
        return `
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);">
              ${isLive ? '<span style="display:inline-block;width:8px;height:8px;background:#ff3b3b;border-radius:50%;margin-right:6px;"></span>' : ''}
              <span style="font-weight: 700; color: #f1f5f9; font-size: 14px;">${m.equipe1} vs ${m.equipe2}</span>
              <br><span style="font-size: 11px; color: #475569;">${phase} · ${time}</span>
            </td>
            <td style="padding: 12px 16px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.06);">
              <a href="https://pronostics.coupedumonde.ai" style="background: linear-gradient(135deg, #ff3b3b, #c62828); color: #fff; text-decoration: none; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; white-space: nowrap;">
                ${isLive ? '🔴 En direct' : '⚽ Pronostic'}
              </a>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="2" style="padding: 20px; text-align: center; color: #475569;">Aucun match aujourd\'hui</td></tr>';

  // Accroche selon le plan
  let upgradeBlock = '';
  if (isFree) {
    upgradeBlock = `
      <div style="background: linear-gradient(135deg, rgba(255,59,59,0.12), rgba(255,215,0,0.06)); border: 1px solid rgba(255,59,59,0.3); border-radius: 14px; padding: 22px; margin: 24px 0;">
        <div style="font-size: 13px; font-weight: 900; color: #ff3b3b; margin-bottom: 10px;">⚡ Tu rates les infos de dernière minute !</div>
        <p style="font-size: 13px; color: #94a3b8; line-height: 1.7; margin: 0 0 14px;">
          Un absent détecté 30 min avant le coup d'envoi ? <strong style="color: #fff;">Notre IA recalcule le pronostic en temps réel.</strong><br>
          Avec le plan <strong style="color: #ffd700;">AI Plus</strong>, tu reçois le pronostic mis à jour <em>avant tout le monde</em> — score exact inclus.
        </p>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <a href="https://pronostics.coupedumonde.ai/abonnement" style="display: inline-block; background: linear-gradient(135deg, #ffd700, #ff8c00); color: #000; text-decoration: none; padding: 11px 22px; border-radius: 10px; font-weight: 900; font-size: 13px;">
            🚀 AI Plus — 4,99€/mois
          </a>
          <a href="https://pronostics.coupedumonde.ai/abonnement" style="display: inline-block; background: linear-gradient(135deg, #ff3b3b, #c62828); color: #fff; text-decoration: none; padding: 11px 22px; border-radius: 10px; font-weight: 900; font-size: 13px;">
            🧠 AI Premium + Live Coach — 9,99€/mois
          </a>
        </div>
      </div>`;
  } else if (isPlus) {
    upgradeBlock = `
      <div style="background: rgba(255,215,0,0.08); border: 1px solid rgba(255,215,0,0.25); border-radius: 14px; padding: 20px; margin: 24px 0;">
        <div style="font-size: 13px; font-weight: 900; color: #ffd700; margin-bottom: 8px;">🧠 Envie du Live IA Coach ?</div>
        <p style="font-size: 13px; color: #94a3b8; line-height: 1.7; margin: 0 0 12px;">
          Pendant les matchs en direct, pose tes questions à notre IA : <em>"Va-t-il y avoir un but ?"</em>, <em>"Quelle est la probabilité de prolongations ?"</em>...<br>
          Réponses instantanées avec chiffres et probabilités.
        </p>
        <a href="https://pronostics.coupedumonde.ai/abonnement" style="display: inline-block; background: linear-gradient(135deg, #ff3b3b, #c62828); color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 10px; font-weight: 900; font-size: 13px;">
          Passer à AI Premium →
        </a>
      </div>`;
  }

  const subject = todayMatches.length > 0
    ? `⚽ ${todayMatches.length} match${todayMatches.length > 1 ? 's' : ''} ce soir — tes pronostics t'attendent`
    : `⚽ Les prochains matchs CDM 2026 — prépare tes pronostics`;

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #f1f5f9; border-radius: 16px; overflow: hidden;">
  <!-- Header -->
  <div style="background: linear-gradient(180deg, #1a0a2e 0%, #130d2a 100%); padding: 28px 32px 24px; border-bottom: 2px solid rgba(255,59,59,0.3);">
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
      <span style="font-size: 24px;">⚽</span>
      <span style="font-size: 16px; font-weight: 900; color: #fff;">Prédictions IA · CDM 2026</span>
    </div>
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">pronostics.coupedumonde.ai</p>
  </div>

  <!-- Corps -->
  <div style="padding: 28px 32px;">
    <p style="font-size: 16px; color: #f1f5f9; margin: 0 0 6px;">Bonsoir ${prenom} 👋</p>
    <p style="font-size: 14px; color: #94a3b8; margin: 0 0 24px; line-height: 1.6;">
      ${todayMatches.length > 0
        ? `<strong style="color: #fff;">${todayMatches.length} match${todayMatches.length > 1 ? 's' : ''}</strong> au programme ce soir — voici les affiches et tes pronostics IA.`
        : 'Pas de match ce soir, mais les prochaines affiches arrivent !'}
    </p>

    <!-- Matchs du jour -->
    ${todayMatches.length > 0 ? `
    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; overflow: hidden; margin-bottom: 20px;">
      <div style="padding: 12px 16px; background: rgba(255,59,59,0.08); border-bottom: 1px solid rgba(255,255,255,0.06);">
        <span style="font-size: 11px; color: #ff3b3b; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em;">🔴 Matchs du soir</span>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        ${matchesHtml}
      </table>
    </div>` : ''}

    <!-- CTA principal -->
    <div style="text-align: center; margin: 24px 0;">
      <a href="https://pronostics.coupedumonde.ai" style="display: inline-block; background: linear-gradient(135deg, #ff3b3b, #c62828); color: #fff; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-weight: 900; font-size: 15px; box-shadow: 0 4px 20px rgba(255,59,59,0.35);">
        Voir tous les pronostics →
      </a>
    </div>

    <!-- Bloc upgrade -->
    ${upgradeBlock}

    <!-- Stats rapides -->
    <div style="display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 120px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 12px; text-align: center;">
        <div style="font-size: 22px; font-weight: 900; color: #ffd700;">73%</div>
        <div style="font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.06em;">Taux de réussite</div>
      </div>
      <div style="flex: 1; min-width: 120px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 12px; text-align: center;">
        <div style="font-size: 22px; font-weight: 900; color: #4f8ef7;">104</div>
        <div style="font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.06em;">Matchs analysés</div>
      </div>
      <div style="flex: 1; min-width: 120px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 12px; text-align: center;">
        <div style="font-size: 22px; font-weight: 900; color: #00e676;">IA</div>
        <div style="font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.06em;">Données temps réel</div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding: 18px 32px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center;">
    <p style="font-size: 11px; color: #475569; margin: 0;">
      pronostics.coupedumonde.ai · <a href="https://pronostics.coupedumonde.ai/cgv" style="color: #475569;">CGV</a> · <a href="https://pronostics.coupedumonde.ai/rgpd" style="color: #475569;">Confidentialité</a><br>
      ⚠️ Les pronostics sont fournis à titre informatif. Jouez de manière responsable.
    </p>
  </div>
</div>`;

  return { subject, html };
}

// ─── ENVOYER LE DIGEST QUOTIDIEN ──────────────────────────────────────────────
async function sendDailyDigest() {
  try {
    // Récupérer les matchs du jour (heure Paris)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [matchsToday, users] = await Promise.all([
      query(`SELECT id, equipe1, equipe2, phase, statut, date_heure
             FROM matches
             WHERE date_heure >= $1 AND date_heure <= $2
               AND equipe1 != 'TBD' AND equipe2 != 'TBD'
             ORDER BY date_heure ASC`,
        [todayStart.toISOString(), todayEnd.toISOString()]),
      query(`SELECT id, email, prenom, plan FROM users
             WHERE email NOT LIKE '%test%'
               AND email NOT LIKE '%@test.%'`),
    ]);

    const todayMatches = matchsToday.rows;
    console.log(`📧 Digest quotidien: ${todayMatches.length} matchs, ${users.rows.length} destinataires`);

    let sent = 0, errors = 0;
    for (const user of users.rows) {
      try {
        const { subject, html } = buildDailyEmail(user, todayMatches, []);
        await transporter.sendMail({
          from: '"CoupeDuMonde.ai" <contact@coupedumonde.ai>',
          to: user.email,
          subject,
          html,
        });
        sent++;
        console.log(`✅ Digest envoyé à ${user.email}`);
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        errors++;
        console.error(`❌ Erreur digest ${user.email}:`, e.message);
      }
    }
    console.log(`📧 Digest terminé: ${sent} envoyés, ${errors} erreurs`);
    return { sent, errors, matches: todayMatches.length };
  } catch (err) {
    console.error('sendDailyDigest error:', err.message);
    return { error: err.message };
  }
}

// ─── ROUTE DÉCLENCHÉE PAR LE SCHEDULER ───────────────────────────────────────
router.post('/send', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  const result = await sendDailyDigest();
  res.json({ success: true, ...result });
});

// ─── PLANIFICATION AUTOMATIQUE À 18H30 ───────────────────────────────────────
const scheduleDailyDigest = () => {
  const now = new Date();
  const next1830 = new Date();
  next1830.setHours(16, 30, 0, 0); // 18h30 Paris = 16h30 UTC
  if (next1830 <= now) next1830.setDate(next1830.getDate() + 1);
  const delay = next1830 - now;

  setTimeout(async () => {
    console.log('📧 Envoi du digest quotidien 18h30...');
    await sendDailyDigest();
    setInterval(sendDailyDigest, 24 * 60 * 60 * 1000);
  }, delay);

  const h = Math.floor(delay / 3600000);
  const m = Math.floor((delay % 3600000) / 60000);
  console.log(`📧 Digest quotidien planifié dans ${h}h${m}min`);
};

scheduleDailyDigest();

module.exports = router;
