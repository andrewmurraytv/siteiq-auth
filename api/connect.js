/**
 * SEOMedic — GSC OAuth Proxy
 * GET /api/connect?site_url={wp_admin_callback_url}&state={nonce}
 *
 * Encodes site_url + nonce into Google's state param,
 * then redirects the user to the Google consent screen.
 */
export default function handler(req, res) {
  const { site_url, state: nonce } = req.query;

  if (!site_url) {
    return res.status(400).json({ error: 'Missing required parameter: site_url' });
  }

  const proxyBase = process.env.PROXY_URL;
  if (!proxyBase) {
    return res.status(500).json({ error: 'Proxy not configured (missing PROXY_URL env var)' });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Proxy not configured (missing GOOGLE_CLIENT_ID env var)' });
  }

  // Encode site_url + nonce into the state param so /api/callback knows where to redirect
  const statePayload = Buffer.from(
    JSON.stringify({ site_url, nonce: nonce || '' })
  ).toString('base64');

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${proxyBase}/api/callback`,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/webmasters.readonly',
    access_type:   'offline',
    prompt:        'consent',   // force refresh_token on every connect
    state:         statePayload,
  });

  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
