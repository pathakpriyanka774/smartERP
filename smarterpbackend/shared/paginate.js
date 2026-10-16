/**
 * Pagination for list endpoints.
 *
 *   GET /orders?page=2&pageSize=50&q=acme
 *   → { success, data: [...], pagination: { page, pageSize, total, totalPages } }
 *
 * Lists were unbounded: every row went to the browser on every load. A page
 * is now at most MAX_PAGE_SIZE rows, PAGE_SIZE by default.
 */
const { sql } = require('./database');

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

/** Read ?page, ?pageSize and ?q. Invalid values fall back to defaults rather than failing. */
const pageParams = (query = {}, { defaultSize = PAGE_SIZE } = {}) => {
  const page = Math.max(1, Math.min(1e6, parseInt(query.page, 10) || 1));
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, parseInt(query.pageSize, 10) || defaultSize));
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  return { page, pageSize, offset: (page - 1) * pageSize, q, like: q ? `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%` : null };
};

/**
 * Run `select` (a full SELECT without ORDER BY / LIMIT) one page at a time.
 * `request` carries the query's inputs; @Q (the search pattern, or NULL) is
 * added for use in the WHERE clause, as `(@Q IS NULL OR col ILIKE @Q)`.
 */
const listPage = async (request, select, orderBy, p) => {
  request.input('Q', sql.NVarChar(102), p.like)
    .input('PageLimit', sql.Int, p.pageSize)
    .input('PageOffset', sql.Int, p.offset);
  const r = await request.query(`
    SELECT q.*, COUNT(*) OVER () AS _total FROM (${select}) q
    ORDER BY ${orderBy} LIMIT @PageLimit OFFSET @PageOffset`);
  let total = r.recordset.length ? r.recordset[0]._total : 0;
  if (!r.recordset.length && p.offset > 0) {
    total = (await request.query(`SELECT COUNT(*) AS n FROM (${select}) q`)).recordset[0].n;
  }
  const rows = r.recordset.map(({ _total, ...row }) => row);
  return {
    data: rows,
    pagination: { page: p.page, pageSize: p.pageSize, total, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) }
  };
};

module.exports = { pageParams, listPage, PAGE_SIZE, MAX_PAGE_SIZE };
