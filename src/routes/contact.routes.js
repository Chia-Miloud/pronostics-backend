const router = require('express').Router();
const nodemailer = require('nodemailer');

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

// ─── FORMULAIRE DE CONTACT ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { nom, email, sujet, message } = req.body;

  if (!nom || !email || !message) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  const SUJET_LABELS = {
    question: 'Question générale',
    abonnement: 'Problème d\'abonnement',
    technique: 'Problème technique',
    partenariat: 'Partenariat / Presse',
    rgpd: 'Données personnelles (RGPD)',
    autre: 'Autre',
  };

  try {
    // Email à Miloud
    await transporter.sendMail({
      from: '"pronostics.coupedumonde.ai" <contact@coupedumonde.ai>',
      to: 'contact@coupedumonde.ai',
      subject: `[Contact] ${SUJET_LABELS[sujet] || sujet} — ${nom}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; background: #0d1117; color: #f1f5f9; padding: 24px; border-radius: 12px;">
          <h2 style="color: #ff3b3b; margin-bottom: 20px;">📩 Nouveau message de contact</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #94a3b8; width: 120px;">Nom :</td><td style="color: #f1f5f9; font-weight: bold;">${nom}</td></tr>
            <tr><td style="padding: 8px 0; color: #94a3b8;">Email :</td><td><a href="mailto:${email}" style="color: #ff3b3b;">${email}</a></td></tr>
            <tr><td style="padding: 8px 0; color: #94a3b8;">Sujet :</td><td style="color: #ffd700;">${SUJET_LABELS[sujet] || sujet}</td></tr>
          </table>
          <div style="margin-top: 20px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px;">
            <div style="color: #94a3b8; font-size: 12px; margin-bottom: 8px;">MESSAGE :</div>
            <div style="color: #f1f5f9; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</div>
          </div>
          <div style="margin-top: 16px; font-size: 11px; color: #475569;">
            Reçu le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      `,
    });

    // Email de confirmation à l'utilisateur
    await transporter.sendMail({
      from: '"CoupeDuMonde.ai" <contact@coupedumonde.ai>',
      to: email,
      subject: 'Votre message a bien été reçu — CoupeDuMonde.ai',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; background: #0d1117; color: #f1f5f9; padding: 24px; border-radius: 12px;">
          <h2 style="color: #ffd700;">⚽ Message bien reçu !</h2>
          <p style="color: #94a3b8;">Bonjour ${nom},</p>
          <p style="color: #94a3b8;">Nous avons bien reçu votre message et nous vous répondrons dans les <strong style="color: #f1f5f9;">24-48h ouvrées</strong>.</p>
          <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px; margin: 20px 0;">
            <div style="color: #475569; font-size: 12px; margin-bottom: 8px;">VOTRE MESSAGE :</div>
            <div style="color: #94a3b8; font-style: italic;">${message.replace(/\n/g, '<br>')}</div>
          </div>
          <p style="color: #94a3b8;">En attendant, retrouvez nos pronostics IA sur :</p>
          <a href="https://pronostics.coupedumonde.ai" style="display: inline-block; background: linear-gradient(135deg, #ff3b3b, #c62828); color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; margin-top: 8px;">
            Voir les pronostics →
          </a>
          <p style="color: #475569; font-size: 11px; margin-top: 24px;">
            CoupeDuMonde.ai — contact@coupedumonde.ai<br>
            <a href="https://pronostics.coupedumonde.ai/rgpd" style="color: #475569;">Politique de confidentialité</a> · 
            <a href="https://pronostics.coupedumonde.ai/cgv" style="color: #475569;">CGV</a>
          </p>
        </div>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('contact email error:', err.message);
    // On répond quand même OK pour ne pas bloquer l'UX
    res.json({ success: true, warning: 'Email non envoyé mais message reçu' });
  }
});

module.exports = router;
