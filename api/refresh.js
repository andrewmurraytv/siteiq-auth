/**
 * SEOMedic — GSC OAuth Proxy
 * POST /api/refresh
 * Body: { refresh_token: "..." }
 *
 * Exchanges a refresh token for a new access token server-side,
 * keeping the client_secret off the WordPress site.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { refresh_token } = req.body || {};

  if (!refresh_token) {
    return res.status(400).json({ error: 'Missing refresh_token' });
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Proxy not configured' });
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        refresh_token,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type:    'refresh_token',
      }),
    });

    const data = await tokenRes.json();

    if (data.error) {
      return res.status(401).json({
        error:   data.error,
        message: data.error_description || 'Token refresh failed',
      });
    }

    return res.status(200).json({
      access_token: data.access_token,
      expires_in:   data.expires_in || 3600,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Token refresh request failed' });
  }
}
