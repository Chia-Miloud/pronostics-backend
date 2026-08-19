const axios = require('axios');
const crypto = require('crypto');

const normalise = (value) => String(value || '').trim().toLowerCase();
const hash = (value) => value ? crypto.createHash('sha256').update(normalise(value)).digest('hex') : undefined;

async function sendMetaEvent({ eventName, eventId, eventSourceUrl, email, userAgent, ip, attribution = {}, customData = {}, consent = false }) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN;
  if (!consent || !pixelId || !accessToken || !eventId) return { sent: false, reason: 'not_configured_or_not_consented' };

  const userData = {
    em: hash(email),
    client_user_agent: userAgent || undefined,
    client_ip_address: ip || undefined,
    fbp: attribution.fbp || undefined,
    fbc: attribution.fbc || undefined,
  };
  Object.keys(userData).forEach(key => userData[key] === undefined && delete userData[key]);

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: eventSourceUrl,
      action_source: 'website',
      user_data: userData,
      custom_data: customData,
    }],
  };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events`,
      payload,
      { params: { access_token: accessToken }, timeout: 10000 }
    );
    return { sent: true, response: response.data };
  } catch (error) {
    console.error('Meta CAPI error:', error.response?.data || error.message);
    return { sent: false, reason: 'request_failed' };
  }
}

module.exports = { sendMetaEvent };
