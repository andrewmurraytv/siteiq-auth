/**
 * SEOMedic — Affiliate Application Handler
 * POST /api/affiliate-apply
 *
 * Receives form submissions from getseomedic.com/affiliate and creates an
 * affiliate record in Freemius via their authenticated API. The Freemius
 * dashboard then shows the application as "pending moderation" so the
 * product owner can approve/decline before payouts kick in.
 *
 * Required env vars:
 *   FREEMIUS_DEVELOPER_ID    — numeric, public, from Freemius dashboard → Settings → Keys
 *   FREEMIUS_SECRET_KEY      — sensitive, starts with sk_, same dashboard
 *   FREEMIUS_PRODUCT_ID      — 26875 for SEOMedic
 *   FREEMIUS_AFFILIATE_TERMS_ID — 2884 for the current SEOMedic affiliate program
 */

const FREEMIUS_API_HOST = 'api.freemius.com';

export default async function handler(req, res) {
  // CORS — allow the marketing site to POST cross-origin
  res.setHeader('Access-Control-Allow-Origin', 'https://getseomedic.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  // Validate config
  const missing = [];
  if (!process.env.FREEMIUS_DEVELOPER_ID)        missing.push('FREEMIUS_DEVELOPER_ID');
  if (!process.env.FREEMIUS_SECRET_KEY)          missing.push('FREEMIUS_SECRET_KEY');
  if (!process.env.FREEMIUS_PRODUCT_ID)          missing.push('FREEMIUS_PRODUCT_ID');
  if (!process.env.FREEMIUS_AFFILIATE_TERMS_ID)  missing.push('FREEMIUS_AFFILIATE_TERMS_ID');
  if (missing.length) {
    return res.status(500).json({ error: `Server misconfigured. Missing: ${missing.join(', ')}` });
  }

  // Parse + validate form input
  const body = req.body || {};
  const name             = String(body.name             || '').trim();
  const email            = String(body.email            || '').trim();
  const paypalEmail      = String(body.paypal_email     || '').trim();
  const domain           = String(body.domain           || '').trim();
  const promotionMethod  = String(body.promotion_method || '').trim();
  const termsAccepted    = body.terms_accepted === 'on' || body.terms_accepted === true || body.terms_accepted === 'true';

  if (!name || !email || !paypalEmail || !domain || !promotionMethod) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!termsAccepted) {
    return res.status(400).json({ error: 'You must accept the affiliate program terms.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))       return res.status(400).json({ error: 'Invalid email address.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)) return res.status(400).json({ error: 'Invalid PayPal email.' });

  // Split the name into first/last for Freemius's expected payload shape
  const nameParts = name.split(/\s+/);
  const firstName = nameParts[0] || name;
  const lastName  = nameParts.slice(1).join(' ') || '-';

  // Build the affiliate payload per Freemius's /affiliates.json schema
  const payload = {
    email,
    first:                 firstName,
    last:                  lastName,
    paypal_email:          paypalEmail,
    domain,
    promotion_method_desc: promotionMethod,
    statistics_information: '',     // optional — audience size, traffic, etc.
    additional_domains:    '',
    promotion_methods:     'social,blogging', // basic default; Freemius accepts a CSV
  };

  // POST to Freemius with Bearer auth (Developer ID + Secret Key combined)
  const productId        = process.env.FREEMIUS_PRODUCT_ID;
  const termsId          = process.env.FREEMIUS_AFFILIATE_TERMS_ID;
  const developerId      = process.env.FREEMIUS_DEVELOPER_ID;
  const secretKey        = process.env.FREEMIUS_SECRET_KEY;
  const path             = `/v1/plugins/${productId}/aff/${termsId}/affiliates.json`;
  const url              = `https://${FREEMIUS_API_HOST}${path}`;

  try {
    const apiRes = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        // Freemius accepts Bearer-style auth with the developer credentials.
        // Developer ID identifies you; secret key authenticates the request.
        'Authorization': `FS ${developerId}:${secretKey}`,
      },
      body: JSON.stringify(payload),
    });

    const apiBody = await apiRes.json().catch(() => null);

    if (!apiRes.ok) {
      const message = apiBody?.error?.message || apiBody?.message || `HTTP ${apiRes.status}`;
      return res.status(apiRes.status).json({ error: `Freemius rejected the application: ${message}` });
    }

    return res.status(200).json({ ok: true, affiliateId: apiBody?.id || null });
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach Freemius. Try again in a few minutes.' });
  }
}
