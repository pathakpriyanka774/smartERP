/**
 * Request validation without a dependency.
 *
 *   const { errors, value } = check(req.body, {
 *     clientName: str({ required: true, max: 150 }),
 *     totalAmount: num({ min: 0 }),
 *     status: oneOf(['pending', 'confirmed']),
 *     deliveryDate: date()
 *   });
 *   if (errors) return badRequest(res, errors);
 *
 * Every rule returns { value } or { error }. Absent optional fields come back
 * as undefined, so "not sent" stays distinguishable from "sent empty" — which
 * partial updates rely on. Limits mirror the database columns, so an over-long
 * value is a clear 400 instead of a database error.
 */
const isAbsent = (v) => v === undefined || v === null || v === '';

const rule = (fn, { required = false } = {}) => (v, field) => {
  if (isAbsent(v)) return required ? { error: `${field} is required` } : { value: undefined };
  return fn(v, field);
};

const str = ({ required, max = 255, min = 0, pattern, message } = {}) => rule((v, f) => {
  if (typeof v !== 'string' && typeof v !== 'number') return { error: `${f} must be text` };
  const s = String(v).trim();
  if (required && !s) return { error: `${f} is required` };
  if (s.length < min) return { error: `${f} must be at least ${min} characters` };
  if (s.length > max) return { error: `${f} must be at most ${max} characters` };
  if (pattern && !pattern.test(s)) return { error: message || `${f} is not valid` };
  return { value: s };
}, { required });

const num = ({ required, min, max, integer = false } = {}) => rule((v, f) => {
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return { error: `${f} must be a number` };
  if (integer && !Number.isInteger(n)) return { error: `${f} must be a whole number` };
  if (min !== undefined && n < min) return { error: `${f} must be at least ${min}` };
  if (max !== undefined && n > max) return { error: `${f} must be at most ${max}` };
  return { value: n };
}, { required });

const int = (opts = {}) => num({ ...opts, integer: true });
const id = (opts = {}) => int({ min: 1, max: 2147483647, ...opts });

const oneOf = (values, { required } = {}) => rule((v, f) =>
  values.includes(v) ? { value: v } : { error: `${f} must be one of: ${values.join(', ')}` }, { required });

const date = ({ required } = {}) => rule((v, f) => {
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: `${f} must be a date (YYYY-MM-DD)` };
  const d = new Date(`${s}T00:00:00Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return { error: `${f} is not a real date` };
  return { value: s };
}, { required });

const month = ({ required } = {}) => str({
  required, max: 7, pattern: /^\d{4}-(0[1-9]|1[0-2])$/, message: 'month must be YYYY-MM'
});

const email = ({ required, max = 100 } = {}) => str({
  required, max, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'email is not a valid address'
});

const bool = ({ required } = {}) => rule((v, f) => {
  if (v === true || v === 'true' || v === 1 || v === '1') return { value: true };
  if (v === false || v === 'false' || v === 0 || v === '0') return { value: false };
  return { error: `${f} must be true or false` };
}, { required });

/** Validate an object against a schema of rules. */
const check = (input, schema) => {
  const value = {};
  const errors = [];
  for (const [field, fn] of Object.entries(schema)) {
    const r = fn(input ? input[field] : undefined, field);
    if (r.error) errors.push(r.error);
    else if (r.value !== undefined) value[field] = r.value;
  }
  return { errors: errors.length ? errors : null, value };
};

/** A positive integer route id, or null. */
const routeId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null;
};

const badRequest = (res, errors) =>
  res.status(400).json({ success: false, message: errors.join('; '), errors });

module.exports = { check, str, num, int, id, oneOf, date, month, email, bool, routeId, badRequest };
