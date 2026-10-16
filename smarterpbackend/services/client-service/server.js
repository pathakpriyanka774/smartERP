const express = require('express');
const cors = require('cors');
const { getPool, sql } = require('../../shared/database');
const { initService } = require('../../shared/db-service');
const { protectService } = require('../../shared/auth');
const { AREA_PERMISSIONS, SERVICE_HOST } = require('../../shared/permissions');
const { check, str, int, email, oneOf, routeId, badRequest } = require('../../shared/validate');
const { sendError } = require('../../shared/http');
const { pageParams, listPage } = require('../../shared/paginate');
const { isValidGSTIN, isStateCode } = require('../../shared/gst');

const app = express();
const PORT = 5006;

app.use(cors());
app.use(express.json());

// Every route needs a valid token. Applied in the service itself, not only at
// the gateway, so a request sent straight to this port is refused too.
protectService(app, { permissions: AREA_PERMISSIONS.clients });

// Customers and suppliers share one table; suppliers are type 'supplier'.
const TYPES = ['manufacturing-unit', 'wholesale', 'retail', 'designer', 'supplier', 'other'];
const RULES = (creating) => ({
  name: str({ required: creating, max: 150 }),
  type: oneOf(TYPES),
  email: email({ max: 150 }),
  phone: str({ max: 30, pattern: /^[+0-9 ()-]{6,30}$/, message: 'phone may contain only digits, spaces, +, - and brackets' }),
  status: oneOf(['active', 'inactive']),
  // Tax details: a registered buyer's GSTIN decides the place of supply on invoices.
  gstin: str({ max: 15 }),
  stateCode: str({ max: 2, pattern: /^\d{2}$/, message: 'stateCode must be a two-digit GST state code' }),
  address: str({ max: 300 }),
  city: str({ max: 100 }),
  pincode: str({ max: 10, pattern: /^\d{6}$/, message: 'pincode must be 6 digits' }),
  paymentTermsDays: int({ min: 0, max: 365 })
});

/** GSTIN checked (format, state, check digit) and the state code taken from it. Returns an error or null. */
const normaliseTax = (v) => {
  if (v.gstin) {
    v.gstin = v.gstin.toUpperCase();
    if (!isValidGSTIN(v.gstin)) return 'GSTIN is not valid (format, state code or check digit)';
    if (v.stateCode && v.stateCode !== v.gstin.slice(0, 2)) return 'stateCode must match the first two digits of the GSTIN';
    v.stateCode = v.gstin.slice(0, 2);
  }
  if (v.stateCode && !isStateCode(v.stateCode)) return 'stateCode is not a GST state code';
  return null;
};

const { requireDB, health } = initService('Client Service');

const SELECT_COLUMNS = `
  ClientID AS id,
  Name     AS name,
  Type     AS type,
  Email    AS email,
  Phone    AS phone,
  Status   AS status,
  GSTIN    AS gstin,
  StateCode AS "stateCode",
  Address  AS address,
  City     AS city,
  Pincode  AS pincode,
  PaymentTermsDays AS "paymentTermsDays"`;

app.get('/clients', requireDB, async (req, res) => {
  const { errors, value } = check(req.query, { type: oneOf([...TYPES, 'customer']), status: oneOf(['active', 'inactive']) });
  if (errors) return badRequest(res, errors);
  const p = pageParams(req.query);
  try {
    const request = getPool().request()
      .input('Type', sql.NVarChar(50), value.type || null)
      .input('Status', sql.NVarChar(20), value.status || null);
    const result = await listPage(request, `
      SELECT ${SELECT_COLUMNS},
        (SELECT COUNT(*) FROM Orders o WHERE o.ClientID = c.ClientID AND o.Status <> 'cancelled') AS "orderCount",
        (SELECT COALESCE(SUM(o.TotalAmount), 0) FROM Orders o WHERE o.ClientID = c.ClientID AND o.Status <> 'cancelled') AS "orderValue"
      FROM Clients c
      WHERE (@Type IS NULL OR c.Type = @Type OR (@Type = 'customer' AND c.Type IS DISTINCT FROM 'supplier'))
        AND (@Status IS NULL OR c.Status = @Status)
        AND (@Q IS NULL OR c.Name ILIKE @Q OR c.Email ILIKE @Q OR c.Phone ILIKE @Q OR c.GSTIN ILIKE @Q)`, 'name', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to fetch clients');
  }
});

app.post('/clients', requireDB, async (req, res) => {
  const { errors, value: v } = check(req.body, RULES(true));
  if (errors) return badRequest(res, errors);
  const taxError = normaliseTax(v);
  if (taxError) return badRequest(res, [taxError]);
  try {
    const result = await getPool().request()
      .input('Name',  sql.NVarChar(150), v.name)
      .input('Type',  sql.NVarChar(50), v.type || null)
      .input('Email', sql.NVarChar(150), v.email || null)
      .input('Phone', sql.NVarChar(30), v.phone || null)
      .input('GSTIN', sql.NVarChar(15), v.gstin || null)
      .input('State', sql.NVarChar(2), v.stateCode || null)
      .input('Address', sql.NVarChar(300), v.address || null)
      .input('City', sql.NVarChar(100), v.city || null)
      .input('Pincode', sql.NVarChar(10), v.pincode || null)
      .input('Terms', sql.Int, v.paymentTermsDays ?? null)
      .query(`
        INSERT INTO Clients (Name, Type, Email, Phone, Status, GSTIN, StateCode, Address, City, Pincode, PaymentTermsDays)
        VALUES (@Name, @Type, @Email, @Phone, 'active', @GSTIN, @State, @Address, @City, @Pincode, @Terms)
        RETURNING ${SELECT_COLUMNS}
      `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to create client');
  }
});

app.put('/clients/:id', requireDB, async (req, res) => {
  const id = routeId(req.params.id);
  if (!id) return badRequest(res, ['Invalid client id']);
  const { errors, value: v } = check(req.body, RULES(false));
  if (errors) return badRequest(res, errors);
  const taxError = normaliseTax(v);
  if (taxError) return badRequest(res, [taxError]);
  try {
    const result = await getPool().request()
      .input('ClientID', sql.Int, id)
      .input('GSTIN', sql.NVarChar(15), v.gstin ?? null)
      .input('State', sql.NVarChar(2), v.stateCode ?? null)
      .input('Address', sql.NVarChar(300), v.address ?? null)
      .input('City', sql.NVarChar(100), v.city ?? null)
      .input('Pincode', sql.NVarChar(10), v.pincode ?? null)
      .input('Terms', sql.Int, v.paymentTermsDays ?? null)
      .input('Name',     sql.NVarChar(150), v.name ?? null)
      .input('Type',     sql.NVarChar(50), v.type ?? null)
      .input('Email',    sql.NVarChar(150), v.email ?? null)
      .input('Phone',    sql.NVarChar(30), v.phone ?? null)
      .input('Status',   sql.NVarChar(20), v.status ?? null)
      .query(`
        UPDATE Clients SET
          Name   = COALESCE(@Name, Name),
          Type   = COALESCE(@Type, Type),
          Email  = COALESCE(@Email, Email),
          Phone  = COALESCE(@Phone, Phone),
          Status = COALESCE(@Status, Status),
          GSTIN  = COALESCE(@GSTIN, GSTIN),
          StateCode = COALESCE(@State, StateCode),
          Address = COALESCE(@Address, Address),
          City = COALESCE(@City, City),
          Pincode = COALESCE(@Pincode, Pincode),
          PaymentTermsDays = COALESCE(@Terms, PaymentTermsDays)
        WHERE ClientID = @ClientID
        RETURNING ${SELECT_COLUMNS}
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to update client');
  }
});

app.get('/clients/stats', requireDB, async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT
        COUNT(*) FILTER (WHERE Type IS DISTINCT FROM 'supplier')                      AS customers,
        COUNT(*) FILTER (WHERE Type = 'supplier')                                     AS suppliers,
        COUNT(*) FILTER (WHERE Status = 'active' AND Type IS DISTINCT FROM 'supplier') AS active,
        COUNT(*) FILTER (WHERE Status = 'inactive')                                   AS inactive,
        COUNT(*)                                                                      AS total
      FROM Clients
    `);
    const byType = await getPool().request().query(`
      SELECT COALESCE(Type, 'unspecified') AS type, COUNT(*) AS count FROM Clients GROUP BY 1 ORDER BY 2 DESC`);
    res.json({ ...result.recordset[0], byType: byType.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch client stats');
  }
});

app.get('/health', health);

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`👥 Client Service running on http://${SERVICE_HOST}:${PORT}`);
});
