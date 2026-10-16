/**
 * Helpers for services that post to the accounting ledger (migration 005).
 * Every function takes the caller's transaction, so a document and its
 * journal entry are saved together or not at all.
 */
const { getPool, sql } = require('./database');
const { documentNumber } = require('./gst');

/** Run fn(tx) in a transaction; commits on success, rolls back on any error. */
const withTransaction = async (fn) => {
  const tx = new sql.Transaction(getPool());
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
};

/** An error that sendError() turns into a 409 with this message. */
const conflict = (message) => Object.assign(new Error(message), { code: 'P0001' });

/** An error that becomes a 404. */
const notFound = (message) => Object.assign(new Error(message), { status: 404 });

/**
 * Post a balanced entry. lines: [{ account: '1100', debit: 118 }, { account: '4000', credit: 100 }, ...]
 * Returns the entry id. Zero lines are dropped by the database.
 */
const postJournal = async (tx, { date, reference, sourceType, sourceId, narration, userId, lines }) => {
  const r = await tx.request()
    .input('Date', sql.Date, date)
    .input('Reference', sql.NVarChar(100), reference || null)
    .input('SourceType', sql.NVarChar(30), sourceType || null)
    .input('SourceID', sql.Int, sourceId || null)
    .input('Narration', sql.NVarChar(300), narration || null)
    .input('CreatedBy', sql.Int, userId || null)
    .input('Lines', null, JSON.stringify(lines))
    .query('SELECT EntryID FROM sp_PostJournal(@Date, @Reference, @SourceType, @SourceID, @Narration, @CreatedBy, @Lines::jsonb)');
  return r.recordset[0].EntryID;
};

const reverseJournal = async (tx, entryId, { date, userId, narration }) => {
  const r = await tx.request()
    .input('EntryID', sql.Int, entryId)
    .input('Date', sql.Date, date)
    .input('UserID', sql.Int, userId || null)
    .input('Narration', sql.NVarChar(300), narration || null)
    .query('SELECT EntryID FROM sp_ReverseJournal(@EntryID, @Date, @UserID, @Narration)');
  return r.recordset[0].EntryID;
};

/**
 * The next gapless number for a document type in the date's financial year,
 * e.g. INV/26-27/00001. The counter stays locked until the transaction ends,
 * so a document that fails to save never uses up a number.
 */
const nextNumber = async (tx, docType, date, prefix = docType) => {
  const r = await tx.request()
    .input('DocType', sql.NVarChar(10), docType)
    .input('Date', sql.Date, date)
    .query('SELECT FinancialYear, Number FROM sp_NextDocNumber(@DocType, @Date)');
  const { FinancialYear, Number } = r.recordset[0];
  return { number: documentNumber(prefix, FinancialYear, Number), financialYear: FinancialYear, sequence: Number };
};

/** The organisation settings row (seller details, GST and payroll settings). */
const loadSettings = async (requester = getPool()) => {
  const r = await requester.request().query('SELECT * FROM OrganizationSettings WHERE SettingsID = 1');
  return r.recordset[0];
};

/** Bank or cash account for a payment method. */
const cashAccount = (method) => (method === 'cash' ? '1000' : '1010');

/** Round to paise. */
const money = (n) => Math.round(Number(n) * 100) / 100;

const addDays = (ymd, days) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

module.exports = { withTransaction, conflict, notFound, postJournal, reverseJournal, nextNumber, loadSettings, cashAccount, money, addDays };
