const express = require('express');
const cors = require('cors');
const { getPool, sql } = require('../../shared/database');
const { initService } = require('../../shared/db-service');
const { protectService } = require('../../shared/auth');
const { AREA_PERMISSIONS, SERVICE_HOST } = require('../../shared/permissions');
const { check, str, num, oneOf, date, routeId, badRequest } = require('../../shared/validate');
const { sendError } = require('../../shared/http');
const { zonedToday } = require('../../shared/app-time');
const { pageParams, listPage } = require('../../shared/paginate');
const { withTransaction, conflict, notFound, postJournal, reverseJournal, cashAccount } = require('../../shared/ledger');

const app = express();
const PORT = 5005;

app.use(cors());
app.use(express.json());

// Every route needs a valid token and the Expenses & Finance permission,
// enforced here as well as at the gateway.
protectService(app, { permissions: AREA_PERMISSIONS.finance });

const { requireDB, health } = initService('Finance Service');

const SELECT_COLUMNS = `
  t.TransactionID                   AS id,
  t.Type                            AS type,
  t.Amount                          AS amount,
  t.Description                     AS description,
  to_char(t.TxnDate, 'YYYY-MM-DD')  AS date,
  t.Category                        AS category,
  t.Method                          AS method,
  t.AccountCode                     AS accountCode,
  a.Name                            AS accountName,
  t.SourceType                      AS sourceType,
  t.SourceID                        AS sourceId,
  t.EntryID                         AS entryId,
  (t.SourceType IS NULL)            AS editable`;
const FROM = 'FROM FinanceTransactions t LEFT JOIN Accounts a ON a.Code = t.AccountCode';

const RULES = (creating) => ({
  type: oneOf(['income', 'expense'], { required: creating }),
  amount: num({ required: creating, min: 0.01, max: 1e12 }),
  description: str({ max: 300 }),
  category: str({ max: 50 }),
  date: date(),
  method: oneOf(['bank', 'cash']),
  accountCode: str({ max: 10, pattern: /^\d{4,6}$/, message: 'accountCode must be an account code' })
});

/** Optional ?from=&to= filter, validated. */
const range = (q) => check(q, { from: date(), to: date() });

/**
 * Every cash-book line is also a journal entry: income is Dr Bank/Cash,
 * Cr an income account (default Other Income); an expense is Dr an expense
 * account (default General Expenses), Cr Bank/Cash.
 */
const DEFAULT_ACCOUNT = { income: '4100', expense: '5200' };

const checkAccount = async (tx, code, type) => {
  const r = await tx.request().input('Code', sql.NVarChar(10), code).query('SELECT Type FROM Accounts WHERE Code = @Code');
  const t = r.recordset[0]?.Type;
  if (!t) throw Object.assign(new Error(`Account ${code} does not exist`), { status: 400 });
  if (t !== type) throw Object.assign(new Error(`Account ${code} is an ${t} account; choose an ${type} account`), { status: 400 });
};

const post = (tx, row, userId) => postJournal(tx, {
  date: row.TxnDate, reference: row.Description || row.Category || (row.Type === 'income' ? 'Income' : 'Expense'),
  sourceType: 'finance', sourceId: row.TransactionID, narration: row.Category || (row.Type === 'income' ? 'Income' : 'Expense'), userId,
  lines: row.Type === 'income'
    ? [{ account: cashAccount(row.Method), debit: row.Amount }, { account: row.AccountCode, credit: row.Amount }]
    : [{ account: row.AccountCode, debit: row.Amount }, { account: cashAccount(row.Method), credit: row.Amount }]
});

const loadTxn = async (id) => {
  const r = await getPool().request().input('ID', sql.Int, id).query(`SELECT ${SELECT_COLUMNS} ${FROM} WHERE t.TransactionID = @ID`);
  return r.recordset[0] || null;
};

app.get('/transactions', requireDB, async (req, res) => {
  const { errors, value } = check(req.query, { from: date(), to: date(), type: oneOf(['income', 'expense']), category: str({ max: 50 }) });
  if (errors) return badRequest(res, errors);
  const p = pageParams(req.query);
  try {
    const request = getPool().request()
      .input('From', sql.Date, value.from || null)
      .input('To', sql.Date, value.to || null)
      .input('Type', sql.NVarChar(20), value.type || null)
      .input('Category', sql.NVarChar(50), value.category || null);
    const result = await listPage(request, `SELECT ${SELECT_COLUMNS} ${FROM}
      WHERE (@From IS NULL OR t.TxnDate >= @From) AND (@To IS NULL OR t.TxnDate <= @To)
        AND (@Type IS NULL OR t.Type = @Type) AND (@Category IS NULL OR t.Category = @Category)
        AND (@Q IS NULL OR t.Description ILIKE @Q OR t.Category ILIKE @Q)`, 'date DESC, id DESC', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to fetch transactions');
  }
});

/** Income and expense accounts, for the category/account picker. */
app.get('/finance/accounts', requireDB, async (req, res) => {
  try {
    const r = await getPool().request().query(`
      SELECT Code AS code, Name AS name, Type AS type FROM Accounts
      WHERE Type IN ('income', 'expense') AND Code NOT IN ('4000', '4900', '5000', '5100', '5300', '5310')
      ORDER BY Code`);
    res.json({ success: true, data: r.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to load accounts');
  }
});

app.post('/transactions', requireDB, async (req, res) => {
  const { errors, value: v } = check(req.body, RULES(true));
  if (errors) return badRequest(res, errors);
  // The business date in India, not the server's UTC date: an entry made
  // just after midnight IST belongs to the new day (and month).
  const txnDate = v.date || zonedToday();
  const accountCode = v.accountCode || DEFAULT_ACCOUNT[v.type];
  try {
    const id = await withTransaction(async (tx) => {
      await checkAccount(tx, accountCode, v.type);
      const result = await tx.request()
        .input('Type', sql.NVarChar(20), v.type)
        .input('Amount', sql.Decimal(14, 2), v.amount)
        .input('Description', sql.NVarChar(300), v.description || null)
        .input('Category', sql.NVarChar(50), v.category || null)
        .input('TxnDate', sql.Date, txnDate)
        .input('Method', sql.NVarChar(10), v.method || 'bank')
        .input('Account', sql.NVarChar(10), accountCode)
        .query(`
          INSERT INTO FinanceTransactions (Type, Amount, Description, TxnDate, Category, Method, AccountCode)
          VALUES (@Type, @Amount, @Description, @TxnDate, @Category, @Method, @Account)
          RETURNING *`);
      const row = result.recordset[0];
      const entryId = await post(tx, row, req.user.id);
      await tx.request().input('ID', sql.Int, row.TransactionID).input('EntryID', sql.Int, entryId)
        .query('UPDATE FinanceTransactions SET EntryID = @EntryID WHERE TransactionID = @ID');
      return row.TransactionID;
    });
    res.status(201).json({ success: true, data: await loadTxn(id) });
  } catch (error) {
    sendError(res, error, 'Failed to create transaction');
  }
});

/** Lock a manual cash-book line; lines made by payments or payroll are changed through those. */
const lockManual = async (tx, txnId) => {
  const r = await tx.request().input('ID', sql.Int, txnId)
    .query('SELECT * FROM FinanceTransactions WHERE TransactionID = @ID FOR UPDATE');
  const row = r.recordset[0];
  if (!row) throw notFound('Transaction not found');
  if (row.SourceType) {
    throw conflict(row.SourceType === 'payroll'
      ? 'This line was made by a payroll payment; it cannot be edited here'
      : 'This line was made by a payment; void the payment in Accounting instead');
  }
  return row;
};

// Editing a posted line reverses its journal entry and posts the corrected one.
app.put('/transactions/:id', requireDB, async (req, res) => {
  const txnId = routeId(req.params.id);
  if (!txnId) return badRequest(res, ['Invalid transaction id']);
  const { errors, value: v } = check(req.body, RULES(false));
  if (errors) return badRequest(res, errors);
  try {
    await withTransaction(async (tx) => {
      const old = await lockManual(tx, txnId);
      const type = v.type || old.Type;
      // Changing the type without an account moves it to that type's default account.
      const accountCode = v.accountCode || (v.type && v.type !== old.Type ? DEFAULT_ACCOUNT[type] : old.AccountCode || DEFAULT_ACCOUNT[type]);
      await checkAccount(tx, accountCode, type);
      const result = await tx.request()
        .input('ID', sql.Int, txnId)
        .input('Type', sql.NVarChar(20), v.type ?? null)
        .input('Amount', sql.Decimal(14, 2), v.amount ?? null)
        .input('Description', sql.NVarChar(300), v.description ?? null)
        .input('Category', sql.NVarChar(50), v.category ?? null)
        .input('TxnDate', sql.Date, v.date ?? null)
        .input('Method', sql.NVarChar(10), v.method ?? null)
        .input('Account', sql.NVarChar(10), accountCode)
        .query(`
          UPDATE FinanceTransactions SET
            Type        = COALESCE(@Type, Type),
            Amount      = COALESCE(@Amount, Amount),
            Description = COALESCE(@Description, Description),
            Category    = COALESCE(@Category, Category),
            TxnDate     = COALESCE(@TxnDate, TxnDate),
            Method      = COALESCE(@Method, Method),
            AccountCode = @Account
          WHERE TransactionID = @ID
          RETURNING *`);
      const row = result.recordset[0];
      if (old.EntryID) await reverseJournal(tx, old.EntryID, { date: zonedToday(), userId: req.user.id, narration: 'Cash-book line corrected' });
      const entryId = await post(tx, row, req.user.id);
      await tx.request().input('ID', sql.Int, txnId).input('EntryID', sql.Int, entryId)
        .query('UPDATE FinanceTransactions SET EntryID = @EntryID WHERE TransactionID = @ID');
    });
    res.json({ success: true, data: await loadTxn(txnId) });
  } catch (error) {
    sendError(res, error, 'Failed to update transaction');
  }
});

app.delete('/transactions/:id', requireDB, async (req, res) => {
  const txnId = routeId(req.params.id);
  if (!txnId) return badRequest(res, ['Invalid transaction id']);
  try {
    await withTransaction(async (tx) => {
      const old = await lockManual(tx, txnId);
      if (old.EntryID) await reverseJournal(tx, old.EntryID, { date: zonedToday(), userId: req.user.id, narration: 'Cash-book line deleted' });
      await tx.request().input('ID', sql.Int, txnId).query('DELETE FROM FinanceTransactions WHERE TransactionID = @ID');
    });
    res.json({ success: true, message: 'Transaction deleted; its ledger entry was reversed' });
  } catch (error) {
    sendError(res, error, 'Failed to delete transaction');
  }
});

app.get('/finance/summary', requireDB, async (req, res) => {
  const { errors, value } = range(req.query);
  if (errors) return badRequest(res, errors);
  try {
    const result = await getPool().request()
      .input('From', sql.Date, value.from || null)
      .input('To', sql.Date, value.to || null)
      .query(`
        SELECT
          COALESCE(SUM(CASE WHEN Type = 'income'  THEN Amount END), 0) AS totalIncome,
          COALESCE(SUM(CASE WHEN Type = 'expense' THEN Amount END), 0) AS totalExpenses,
          COUNT(*) AS transactionCount
        FROM FinanceTransactions
        WHERE (@From IS NULL OR TxnDate >= @From) AND (@To IS NULL OR TxnDate <= @To)
      `);
    const { totalIncome, totalExpenses, transactionCount } = result.recordset[0];
    res.json({
      totalIncome,
      totalExpenses,
      netProfit: Math.round((totalIncome - totalExpenses) * 100) / 100,
      transactionCount
    });
  } catch (error) {
    sendError(res, error, 'Failed to fetch finance summary');
  }
});

// Spending and income per category, for the Expenses screen breakdown.
app.get('/finance/categories', requireDB, async (req, res) => {
  const { errors, value } = range(req.query);
  if (errors) return badRequest(res, errors);
  try {
    const result = await getPool().request()
      .input('From', sql.Date, value.from || null)
      .input('To', sql.Date, value.to || null)
      .query(`
        SELECT COALESCE(Category, 'Uncategorised') AS category, Type AS type,
               SUM(Amount) AS total, COUNT(*) AS count
        FROM FinanceTransactions
        WHERE (@From IS NULL OR TxnDate >= @From) AND (@To IS NULL OR TxnDate <= @To)
        GROUP BY 1, 2
        ORDER BY total DESC`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch category totals');
  }
});

app.get('/health', health);

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`💰 Finance Service running on http://${SERVICE_HOST}:${PORT}`);
});
