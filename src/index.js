require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || process.env.CC_APP_PORT || 8080;

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'https://pronostics.coupedumonde.ai')
  .split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS non autorisé'));
  },
  credentials: true,
}));

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));

// Webhook Stripe (raw body avant express.json)
const stripeRoutes = require('./routes/stripe.routes');
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeRoutes);

app.use(express.json());

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/matches', require('./routes/matches.routes'));
app.use('/api/pronostics', require('./routes/pronostics.routes'));
app.use('/api/subscription', require('./routes/subscription.routes'));
app.use('/api/stats', require('./routes/stats.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/articles', require('./routes/articles.routes'));
app.use('/api/contact', require('./routes/contact.routes'));
app.use('/api/analytics', require('./routes/analytics.routes'));
app.use('/api/retention', require('./routes/retention.routes'));

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ─── INIT DB + START ──────────────────────────────────────────────────────────
const { initDB } = require('./db');
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Pronostics API démarrée sur le port ${PORT}`));
}).catch(err => {
  console.error('Erreur init DB:', err);
  process.exit(1);
});
