/**
 * In-memory rate limiting for the login and signup endpoints.
 *
 * Counts attempts per key in a sliding window. The auth service is a single
 * process, so memory is enough; a restart clears the counters, which errs on
 * the side of letting legitimate users back in. Keys are never logged:
 * they are e-mail addresses and IP addresses (personal data).
 */
const createLimiter = ({ windowMs, max }) => {
  const hits = new Map();       // key -> [timestamps]

  const recent = (key, now) => {
    const list = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  };

  return {
    /** Seconds until the key may try again, or 0 if it may now. */
    retryAfter(key, now = Date.now()) {
      const list = recent(key, now);
      return list.length >= max ? Math.ceil((windowMs - (now - list[0])) / 1000) : 0;
    },
    hit(key, now = Date.now()) {
      const list = recent(key, now);
      list.push(now);
      hits.set(key, list);
      if (hits.size > 50000) hits.clear();   // bound memory under a flood of distinct keys
    },
    reset(key) { hits.delete(key); }
  };
};

module.exports = { createLimiter };
