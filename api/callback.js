/**
 * WP Link Auditor — GSC OAuth Proxy
 * GET /api/callback?code=...&state=...
 *
 * Called by Google after the user grants consent.
 * Exchanges the code for tokens server-side (client_secret stays here),
 * then redirects back to the WordPress site with the tokens.
 */
export default async function handler(req, res) {
  const { code, state, error } = req.query;

  // Google sent an error (e.g. user denied access)
  if (error) {
    return redirectWithError(res, null, `Google authorization error: ${error}`);
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state parameter' });
  }

  // Decode state to recover site_url + nonce
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  const { site_url, nonce } = decoded;

  if (!site_url) {
    return res.status(400).json({ error: 'Missing site_url in state' });
  }

  const proxyBase = process.env.PROXY_URL;
  if (!proxyBase || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return redirectWithError(res, site_url, 'Proxy is not fully configured.');
  }

  // Exchange authorization code for access + refresh tokens
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  `${proxyBase}/api/callback`,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return redirectWithError(
        res,
        site_url,
        tokens.error_description || tokens.error
      );
    }

    // Redirect back to the WP site with tokens as query params
    const callbackUrl = new URL(site_url);
    callbackUrl.searchParams.set('gsc_access_token',  tokens.access_token);
    callbackUrl.searchParams.set('gsc_refresh_token', tokens.refresh_token || '');
    callbackUrl.searchParams.set('gsc_expires_in',    String(tokens.expires_in || 3600));
    callbackUrl.searchParams.set('gsc_nonce',         nonce || '');

    return res.redirect(302, callbackUrl.toString());
  } catch (err) {
    return redirectWithError(res, site_url, 'Token exchange request failed.');
  }
}

function redirectWithError(res, siteUrl, message) {
  if (!siteUrl) {
    return res.status(500).json({ error: message });
  }
  try {
    const url = new URL(siteUrl);
    url.searchParams.set('gsc_error', message);
    return res.redirect(302, url.toString());
  } catch {
    return res.status(500).json({ error: message });
  }
}
