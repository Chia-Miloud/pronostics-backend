const router = require('express').Router();
const { query } = require('../db');
const { authRequired } = require('../middleware/auth');

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
};

const PLANS = {
  ai_plus: {
    priceId: () => process.env.STRIPE_AI_PLUS_PRICE_ID || 'price_1Tnk6MPNX6Vp60cTwSuCJjqo',
    name: 'AI Plus',
  },
  ai_premium: {
    priceId: () => process.env.STRIPE_AI_PREMIUM_PRICE_ID || 'price_1Tnk7MPNX6Vp60cTLAuAwYkO',
    name: 'AI Premium',
  },
};

const getFrontendUrl = () =>
  (process.env.FRONTEND_URL || 'https://pronostics.coupedumonde.ai').split(',')[0].trim();

// ─── POST /api/subscription/checkout ─────────────────────────────────────────
router.post('/checkout', authRequired, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Paiement non configuré' });

    const { plan } = req.body;
    const planConfig = PLANS[plan];
    if (!planConfig) return res.status(400).json({ error: 'Plan invalide' });

    const frontendUrl = getFrontendUrl();

    // Récupérer ou créer le customer Stripe
    let customerId = req.user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.pseudo,
        metadata: { user_id: String(req.user.id) },
      });
      customerId = customer.id;
      await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.user.id]);
    }

    const session = await stripe.checkout.Session.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.priceId(), quantity: 1 }],
      success_url: `${frontendUrl}/abonnement?success=true&plan=${plan}`,
      cancel_url: `${frontendUrl}/abonnement?canceled=true`,
      metadata: { user_id: String(req.user.id), plan },
      subscription_data: {
        metadata: { user_id: String(req.user.id), plan },
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('checkout error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la création de la session de paiement' });
  }
});

// ─── POST /api/subscription/portal ───────────────────────────────────────────
// Portail Client Stripe : gérer abonnement, factures, carte bancaire
router.post('/portal', authRequired, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Paiement non configuré' });

    const customerId = req.user.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'Aucun abonnement actif' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getFrontendUrl()}/abonnement`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('portal error:', err.message);
    res.status(500).json({ error: 'Erreur portail client' });
  }
});

// ─── GET /api/subscription/status ────────────────────────────────────────────
router.get('/status', authRequired, async (req, res) => {
  try {
    const r = await query(
      'SELECT plan, stripe_subscription_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = r.rows[0];
    res.json({
      plan: user?.plan || 'free',
      hasSubscription: !!user?.stripe_subscription_id,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur statut' });
  }
});

// ─── POST /api/subscription/cancel ───────────────────────────────────────────
router.post('/cancel', authRequired, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Paiement non configuré' });

    const r = await query('SELECT stripe_subscription_id FROM users WHERE id = $1', [req.user.id]);
    const subId = r.rows[0]?.stripe_subscription_id;
    if (!subId) return res.status(400).json({ error: 'Aucun abonnement actif' });

    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    res.json({ message: 'Abonnement annulé à la fin de la période en cours' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur annulation' });
  }
});

module.exports = router;
