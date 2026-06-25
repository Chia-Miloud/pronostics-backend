const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { query } = require('../db');
const { authRequired } = require('../middleware/auth');

const PLANS = {
  ai_plus: process.env.STRIPE_AI_PLUS_PRICE_ID,
  ai_premium: process.env.STRIPE_AI_PREMIUM_PRICE_ID,
};

// ─── CRÉER SESSION DE PAIEMENT ────────────────────────────────────────────────
router.post('/checkout', authRequired, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Plan invalide' });

    const priceId = PLANS[plan];
    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0] || 'https://pronostics.coupedumonde.ai';

    // Créer ou récupérer le customer Stripe
    let customerId = req.user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { user_id: String(req.user.id) },
      });
      customerId = customer.id;
      await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.user.id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/?subscription=success`,
      cancel_url: `${frontendUrl}/abonnement`,
      metadata: { user_id: String(req.user.id), plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('checkout error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la création de la session de paiement' });
  }
});

// ─── STATUT ABONNEMENT ────────────────────────────────────────────────────────
router.get('/status', authRequired, async (req, res) => {
  res.json({ plan: req.user.plan });
});

// ─── ANNULER ABONNEMENT ───────────────────────────────────────────────────────
router.post('/cancel', authRequired, async (req, res) => {
  try {
    const r = await query('SELECT stripe_subscription_id FROM users WHERE id = $1', [req.user.id]);
    const subId = r.rows[0]?.stripe_subscription_id;
    if (!subId) return res.status(400).json({ error: 'Aucun abonnement actif' });

    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    res.json({ message: 'Abonnement annulé à la fin de la période' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur annulation' });
  }
});

module.exports = router;
