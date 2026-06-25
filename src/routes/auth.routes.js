const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { authRequired, JWT_SECRET } = require('../middleware/auth');

// ─── INSCRIPTION ──────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, prenom, nom, telephone } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min)' });

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'Cet email est déjà utilisé' });

    const pseudo = (prenom && nom)
      ? `${prenom}${nom}`.replace(/\s/g, '').toLowerCase().slice(0, 20)
      : email.split('@')[0].slice(0, 20);

    const password_hash = await bcrypt.hash(password, 12);
    const r = await query(
      `INSERT INTO users (email, pseudo, password_hash, prenom, nom, telephone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, pseudo, plan`,
      [email.toLowerCase(), pseudo, password_hash, prenom || null, nom || null, telephone || null]
    );
    const user = r.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, pseudo: user.pseudo, plan: user.plan } });
  } catch (err) {
    console.error('register error:', err.message);
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
    res.json({ token, user: { id: user.id, email: user.email, pseudo: user.pseudo, plan: user.plan } });
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PROFIL ───────────────────────────────────────────────────────────────────
router.get('/me', authRequired, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const quotaR = await query(
      `SELECT COUNT(*) FROM pronostics WHERE user_id = $1 AND DATE(created_at) = $2`,
      [req.user.id, today]
    );
    res.json({
      user: req.user,
      quota: { used: parseInt(quotaR.rows[0].count), limit: req.user.plan === 'free' ? 1 : 999 }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
