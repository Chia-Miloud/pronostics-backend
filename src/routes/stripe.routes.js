const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { query } = require('../db');

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan;
        if (userId && plan) {
          await query(
            'UPDATE users SET plan = $1, stripe_subscription_id = $2 WHERE id = $3',
            [plan, session.subscription, userId]
          );
        }
        break;
      }
      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        if (sub.status === 'canceled' || sub.status === 'unpaid') {
          await query(
            'UPDATE users SET plan = $1 WHERE stripe_subscription_id = $2',
            ['free', sub.id]
          );
        }
        break;
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('webhook error:', err.message);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

module.exports = router;
