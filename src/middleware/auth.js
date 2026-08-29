const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { jwtSecret: JWT_SECRET } = require('../config/env');

const authRequired = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const r = await query('SELECT id, email, pseudo, plan FROM users WHERE id = $1', [decoded.id]);
    if (!r.rows.length) return res.status(401).json({ error: 'Utilisateur introuvable' });
    req.user = r.rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
};

const authOptional = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const r = await query('SELECT id, email, pseudo, plan FROM users WHERE id = $1', [decoded.id]);
    if (r.rows.length) req.user = r.rows[0];
  } catch {}
  next();
};

module.exports = { authRequired, authOptional, JWT_SECRET };
