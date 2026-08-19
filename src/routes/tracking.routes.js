const router = require('express').Router();

// Les clés privées Meta CAPI restent exclusivement dans les variables serveur.
router.get('/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    metaPixelId: process.env.META_PIXEL_ID || null,
    gaMeasurementId: process.env.GA_MEASUREMENT_ID || null,
  });
});

module.exports = router;
