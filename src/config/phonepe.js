const crypto = require('crypto');

const merchantId = process.env.PHONEPE_MERCHANT_ID;
const saltKey = process.env.PHONEPE_SALT_KEY;
const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';
const env = process.env.PHONEPE_ENV || 'sandbox';
const redirectBaseUrl = process.env.PHONEPE_REDIRECT_BASE_URL || 'http://localhost:3000';

const baseUrl = env === 'production'
  ? 'https://api.phonepe.com/apis/hermes'
  : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

const callbackUrl = `${process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(':3000', ':5000') : 'http://localhost:5000'}/api/payments/phonepe`;

/**
 * Generate X-VERIFY checksum for PhonePe API requests
 * Format: SHA256(base64Payload + apiEndpoint + saltKey) + "###" + saltIndex
 */
function generateChecksum(base64Payload, apiEndpoint) {
  const string = base64Payload + apiEndpoint + saltKey;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  return sha256 + '###' + saltIndex;
}

/**
 * Generate checksum for status check (GET requests)
 * Format: SHA256(apiEndpoint + saltKey) + "###" + saltIndex
 */
function generateStatusChecksum(apiEndpoint) {
  const string = apiEndpoint + saltKey;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  return sha256 + '###' + saltIndex;
}

/**
 * Verify webhook checksum from PhonePe callback
 */
function verifyChecksum(receivedChecksum, base64ResponsePayload, apiEndpoint) {
  const expectedChecksum = generateChecksum(base64ResponsePayload, apiEndpoint);
  return receivedChecksum === expectedChecksum;
}

module.exports = {
  merchantId,
  saltKey,
  saltIndex,
  baseUrl,
  redirectBaseUrl,
  callbackUrl,
  generateChecksum,
  generateStatusChecksum,
  verifyChecksum
};
