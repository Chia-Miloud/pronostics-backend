const router = require('express').Router();
const { query } = require('../db');
const { sendMetaEvent } = require('../services/metaCapi');

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
};

// ─── POST /api/webhooks/stripe ────────────────────────────────────────────────
// Ce endpoint doit recevoir le body RAW (pas JSON parsé)
router.post('/', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {

      // ── Paiement réussi → activer le plan ──────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan;
        if (userId && plan) {
          // Hiérarchie des plans : free < ai_plus < ai_premium
          const PLAN_RANK = { free: 0, ai_plus: 1, ai_premium: 2 };
          const currentUser = await query('SELECT plan FROM users WHERE id = $1', [userId]);
          const currentPlan = currentUser.rows[0]?.plan || 'free';
          const newRank = PLAN_RANK[plan] ?? 0;
          const currentRank = PLAN_RANK[currentPlan] ?? 0;
          // Mettre à jour seulement si le nouveau plan est supérieur ou égal
          if (newRank >= currentRank) {
            await query(
              'UPDATE users SET plan = $1, stripe_subscription_id = $2 WHERE id = $3',
              [plan, session.subscription, userId]
            );
            console.log(`✅ Plan activé: user ${userId} → ${plan}`);
          } else {
            console.log(`ℹ️ Plan ignoré (rétrogradation bloquée): user ${userId} ${currentPlan} → ${plan}`);
          }

          // Purchase CAPI : uniquement après confirmation de paiement et une seule fois par event_id.
          const eventId = session.metadata?.meta_event_id;
          const consent = session.metadata?.meta_consent === 'true';
          const isPaid = ['paid', 'no_payment_required'].includes(session.payment_status);
          if (eventId && consent && isPaid) {
            const claimed = await query(
              `INSERT INTO conversion_events (event_id, event_name, user_id, stripe_session_id, payload)
               VALUES ($1, 'Purchase', $2, $3, $4)
               ON CONFLICT (event_id) DO NOTHING
               RETURNING event_id`,
              [eventId, userId, session.id, JSON.stringify({ plan, amount_total: session.amount_total, currency: session.currency })]
            );
            if (claimed.rows.length) {
              const buyer = await query('SELECT email, attribution FROM users WHERE id = $1', [userId]);
              const attribution = buyer.rows[0]?.attribution || {};
              void sendMetaEvent({
                eventName: 'Purchase', eventId, eventSourceUrl: 'https://prono-sport.io/abonnement',
                email: buyer.rows[0]?.email, attribution, consent: true,
                customData: {
                  value: typeof session.amount_total === 'number' ? session.amount_total / 100 : undefined,
                  currency: (session.currency || 'eur').toUpperCase(),
                  content_name: plan, content_type: 'product',
                },
              });
            }
          }
        }
        break;
      }

      // ── Abonnement mis à jour (changement de plan, renouvellement) ─────────
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata?.user_id;

        if (sub.status === 'active' && userId) {
          // Déterminer le plan depuis le price ID
          const priceId = sub.items?.data?.[0]?.price?.id;
          const aiPlusId = process.env.STRIPE_AI_PLUS_PRICE_ID || 'price_1Tnk6MPNX6Vp60cTwSuCJjqo';
          const aiPremiumId = process.env.STRIPE_AI_PREMIUM_PRICE_ID || 'price_1Tnk7MPNX6Vp60cTLAuAwYkO';

          let plan = 'free';
          if (priceId === aiPlusId) plan = 'ai_plus';
          else if (priceId === aiPremiumId) plan = 'ai_premium';

          await query(
            'UPDATE users SET plan = $1, stripe_subscription_id = $2 WHERE id = $3',
            [plan, sub.id, userId]
          );
          console.log(`✅ Plan mis à jour: user ${userId} → ${plan}`);
        } else if (['canceled', 'unpaid', 'past_due'].includes(sub.status)) {
          await query(
            'UPDATE users SET plan = $1 WHERE stripe_subscription_id = $2',
            ['free', sub.id]
          );
          console.log(`⚠️ Abonnement suspendu: ${sub.id}`);
        }
        break;
      }

      // ── Abonnement annulé → repasser en free ──────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await query(
          'UPDATE users SET plan = $1, stripe_subscription_id = NULL WHERE stripe_subscription_id = $2',
          ['free', sub.id]
        );
        console.log(`✅ Abonnement annulé: ${sub.id} → free`);
        break;
      }

      // ── Paiement échoué ────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (subId) {
          await query(
            'UPDATE users SET plan = $1 WHERE stripe_subscription_id = $2',
            ['free', subId]
          );
          console.log(`⚠️ Paiement échoué, plan remis à free: ${subId}`);
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('webhook processing error:', err.message);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

module.exports = router;
