const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { authRequired, JWT_SECRET } = require('../middleware/auth');
const { sendMetaEvent } = require('../services/metaCapi');
const { getDailyQuota } = require('../services/quota');

const isDatabaseRecovery = (error) =>
  error?.code === '57P03' || /database system is in recovery mode/i.test(error?.message || '');

// ─── INSCRIPTION ──────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, pseudo, password, prenom, nom, telephone, tracking = {} } = req.body;
    if (!email || !pseudo || !password) {
      return res.status(400).json({ error: 'Email, pseudonyme et mot de passe requis' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min)' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPseudo = String(pseudo).trim().toLowerCase();
    if (!/^[\p{L}\p{N}._-]{3,20}$/u.test(normalizedPseudo)) {
      return res.status(400).json({ error: 'Le pseudonyme doit contenir 3 à 20 lettres, chiffres, points, tirets ou underscores.' });
    }

    const existing = await query(
      'SELECT email, pseudo FROM users WHERE email = $1 OR pseudo = $2',
      [normalizedEmail, normalizedPseudo]
    );
    if (existing.rows.some(row => row.email === normalizedEmail)) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }
    if (existing.rows.some(row => row.pseudo === normalizedPseudo)) {
      return res.status(409).json({ error: 'Ce pseudonyme est déjà utilisé' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const r = await query(
      `INSERT INTO users (email, pseudo, password_hash, prenom, nom, telephone, attribution)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email, pseudo, plan`,
      [
        normalizedEmail, normalizedPseudo, password_hash, prenom || null, nom || null, telephone || null,
        tracking?.consent ? JSON.stringify(tracking.attribution || {}) : null,
      ]
    );
    const user = r.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: '30d' });

    // L'inscription est confirmée par la base avant tout événement de conversion.
    if (tracking?.eventId) {
      await query(
        `INSERT INTO conversion_events (event_id, event_name, user_id, payload)
         VALUES ($1, 'CompleteRegistration', $2, $3)
         ON CONFLICT (event_id) DO NOTHING`,
        [tracking.eventId, user.id, JSON.stringify({ attribution: tracking.attribution || {} })]
      );
      void sendMetaEvent({
        eventName: 'CompleteRegistration', eventId: tracking.eventId, eventSourceUrl: tracking.pageUrl,
        email: user.email, userAgent: req.headers['user-agent'],
        ip: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(),
        attribution: tracking.attribution || {}, consent: tracking.consent === true,
        customData: { content_name: 'Création de compte Prono Sport' },
      });
    }

    res.json({ token, user: { id: user.id, email: user.email, pseudo: user.pseudo, plan: user.plan } });
  } catch (err) {
    console.error('register error:', err.message);
    if (isDatabaseRecovery(err)) {
      return res.status(503).json({ error: 'Le service redémarre, réessayez dans quelques secondes.' });
    }
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Cet email ou ce pseudonyme est déjà utilisé' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── CONNEXION ────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const r = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!r.rows.length) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const user = r.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: '30d' });
    // Tracker la connexion
    await query('UPDATE users SET last_login = NOW(), nb_logins = COALESCE(nb_logins, 0) + 1 WHERE id = $1', [user.id]);
    res.json({ token, user: { id: user.id, email: user.email, pseudo: user.pseudo, plan: user.plan } });
  } catch (err) {
    console.error('login error:', err.message);
    if (isDatabaseRecovery(err)) {
      return res.status(503).json({ error: 'Le service redémarre, réessayez dans quelques secondes.' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PROFIL ───────────────────────────────────────────────────────────────────
router.get('/me', authRequired, async (req, res) => {
  try {
    // Recharger le profil complet depuis la BDD (pas juste le token JWT)
    const userR = await query(
      'SELECT id, email, pseudo, prenom, nom, telephone, plan, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!userR.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const fullUser = userR.rows[0];
    const quota = fullUser.plan === 'free'
      ? await getDailyQuota(req.user.id)
      : { used: 0, limit: 999, remaining: 999, unlimited: true };
    res.json({ user: fullUser, quota });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── MODIFIER PROFIL ─────────────────────────────────────────────────────────────────────────────────
router.put('/profile', authRequired, async (req, res) => {
  const { prenom, nom, telephone } = req.body;
  try {
    await query(
      'UPDATE users SET prenom=$1, nom=$2, telephone=$3 WHERE id=$4',
      [prenom, nom, telephone, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── CHANGER MOT DE PASSE ─────────────────────────────────────────────────────────────────────────────────
router.put('/password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Mot de passe trop court' });
  try {
    const r = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, r.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
