/**
 * Turn an error into the right HTTP answer.
 *
 * Expected failures become 4xx with a message the user can act on; anything
 * else is logged and answered with a generic 500 that leaks no internals.
 * PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const sendError = (res, error, fallback, context = '') => {
  const code = error && error.code;
  // Errors raised by our own code with an explicit status (e.g. notFound()).
  if (error && Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  if (code === '23505') {
    return res.status(409).json({ success: false, message: 'A record with these details already exists' });
  }
  // RAISE EXCEPTION in our functions (business rules such as insufficient stock).
  if (code === 'P0001') return res.status(409).json({ success: false, message: error.message });
  if (code === '23503') return res.status(400).json({ success: false, message: 'A referenced record does not exist' });
  if (code === '23514') return res.status(400).json({ success: false, message: 'The values break a business rule (e.g. negative quantity or invalid status)' });
  if (code === '23502') return res.status(400).json({ success: false, message: 'A required field is missing' });
  if (code === '22001') return res.status(400).json({ success: false, message: 'A value is longer than allowed' });
  if (code === '22P02' || code === '22003' || code === '22007' || code === '22008') {
    return res.status(400).json({ success: false, message: 'A value has the wrong format or is out of range' });
  }
  console.error(`${context || fallback}:`, error && error.message);
  return res.status(500).json({ success: false, message: fallback });
};

module.exports = { sendError };
