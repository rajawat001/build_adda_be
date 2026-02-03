const axios = require('axios');

const clientId = process.env.PHONEPE_CLIENT_ID;
const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
const clientVersion = process.env.PHONEPE_CLIENT_VERSION || '1';
const env = process.env.PHONEPE_ENV || 'sandbox';
const redirectBaseUrl = process.env.PHONEPE_REDIRECT_BASE_URL || 'http://localhost:3000';
const backendPublicUrl = process.env.BACKEND_PUBLIC_URL || 'http://localhost:5000';

const baseUrl = env === 'production'
  ? 'https://api.phonepe.com/apis/pg'
  : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

const authUrl = env === 'production'
  ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
  : `${baseUrl}/v1/oauth/token`;

// Webhook callback URL (must be publicly accessible — use ngrok for local dev)
const callbackUrl = `${backendPublicUrl}/api/payments/phonepe`;

// ─── OAuth Token Management ───
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get a valid OAuth access token.
 * Caches the token and refreshes 60s before expiry.
 */
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && tokenExpiresAt > now + 60) {
    return cachedToken;
  }

  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_version', clientVersion);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'client_credentials');

  const response = await axios.post(authUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const data = response.data;
  cachedToken = data.access_token;
  tokenExpiresAt = data.expires_at || (now + 1800); // default 30min if not provided

  console.log('PhonePe OAuth token obtained, expires at:', new Date(tokenExpiresAt * 1000).toISOString());
  return cachedToken;
}

module.exports = {
  clientId,
  clientSecret,
  clientVersion,
  baseUrl,
  redirectBaseUrl,
  backendPublicUrl,
  callbackUrl,
  getAccessToken
};
