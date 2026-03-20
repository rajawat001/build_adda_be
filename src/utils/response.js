/**
 * Standardized API response format
 * Success: { success: true, data: {...}, message?: string, meta?: { page, limit, total, totalPages } }
 * Error: { success: false, error: { code: string, message: string, details?: any } }
 */

const sendSuccess = (res, { data, message, meta, statusCode = 200 }) => {
  const response = { success: true };
  if (data !== undefined) response.data = data;
  if (message) response.message = message;
  if (meta) response.meta = meta;
  return res.status(statusCode).json(response);
};

const sendError = (res, { message, code = 'INTERNAL_ERROR', statusCode = 500, details }) => {
  const response = {
    success: false,
    error: { code, message }
  };
  if (details) response.error.details = details;
  return res.status(statusCode).json(response);
};

const sendPaginated = (res, { data, page, limit, total, message }) => {
  return sendSuccess(res, {
    data,
    message,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total),
      totalPages: Math.ceil(total / limit)
    }
  });
};

module.exports = { sendSuccess, sendError, sendPaginated };
