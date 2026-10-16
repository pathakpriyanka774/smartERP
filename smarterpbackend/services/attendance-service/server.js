const express = require('express');
const cors = require('cors');
const { getPool, sql } = require('../../shared/database');
const { initService } = require('../../shared/db-service');
const { protectService } = require('../../shared/auth');
const { AREA_PERMISSIONS, SERVICE_HOST } = require('../../shared/permissions');
const { routeId } = require('../../shared/validate');
const { pageParams, listPage } = require('../../shared/paginate');
const { zonedNow, zonedToday, dateOnly, wallClock } = require('../../shared/app-time');

const app = express();
const PORT = 5011;

app.use(cors());
app.use(express.json());

// Every route needs a valid token. Applied in the service itself, not only at
// the gateway, so a request sent straight to this port is refused too.
protectService(app, { permissions: AREA_PERMISSIONS.attendance });

const { requireDB, health } = initService('Attendance Service');

// Times are returned as HH:MM and dates as YYYY-MM-DD, so the UI never has to
// deal with timezone-shifted ISO strings.
const DETAIL_COLUMNS = `
  AttendanceID                             AS id,
  EmployeeID                               AS employeeId,
  EmployeeCode                             AS employeeCode,
  EmployeeName                             AS employeeName,
  Department                               AS department,
  Position                                 AS position,
  to_char(AttendanceDate, 'YYYY-MM-DD')    AS date,
  to_char(CheckInTime, 'HH24:MI')          AS checkIn,
  to_char(CheckOutTime, 'HH24:MI')         AS checkOut,
  Status                                   AS status,
  TotalHours                               AS totalHours,
  Notes                                    AS notes`;

const VALID_STATUSES = ['present', 'absent', 'half-day', 'leave', 'late'];

// Arrivals after this time are recorded as 'late'. Configurable because shift
// start is a business policy, not a property of the code.
const LATE_AFTER = (() => {
  const v = process.env.ATTENDANCE_LATE_AFTER || '10:30';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
    console.warn(`⚠️  ATTENDANCE_LATE_AFTER="${v}" is not HH:MM; falling back to 10:30`);
    return '10:30';
  }
  return v;
})();

const parseDate = (v) => {
  if (!v) return null;
  // Reject anything that is not a plain calendar date, so a malformed value
  // cannot silently become "today".
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return isNaN(d.getTime()) ? undefined : d;
};

// --- Reads ------------------------------------------------------------------

// List attendance, optionally filtered by date, date range, employee or status.
app.get('/attendance', requireDB, async (req, res) => {
  const { date, from, to, employeeId, status } = req.query;
  const fromDate = parseDate(from || date);
  const toDate = parseDate(to || date);
  if (fromDate === undefined || toDate === undefined) {
    return res.status(400).json({ success: false, message: 'Dates must be YYYY-MM-DD' });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }
  if (employeeId && !routeId(employeeId)) {
    return res.status(400).json({ success: false, message: 'employeeId must be a positive whole number' });
  }

  try {
    const request = getPool().request()
      .input('From', sql.Date, fromDate)
      .input('To', sql.Date, toDate)
      .input('EmployeeID', sql.Int, employeeId ? routeId(employeeId) : null)
      .input('Status', sql.NVarChar(20), status || null);
    const result = await listPage(request, `
        SELECT ${DETAIL_COLUMNS}, AttendanceDate AS "_sortDate", EmployeeName AS "_sortName"
        FROM vw_AttendanceDetail
        WHERE (@From       IS NULL OR AttendanceDate >= @From)
          AND (@To         IS NULL OR AttendanceDate <= @To)
          AND (@EmployeeID IS NULL OR EmployeeID = @EmployeeID)
          AND (@Status     IS NULL OR Status = @Status)
          AND (@Q          IS NULL OR EmployeeName ILIKE @Q OR EmployeeCode ILIKE @Q OR Department ILIKE @Q)`,
      '"_sortDate" DESC, "_sortName"', pageParams(req.query, { defaultSize: 100 }));
    res.json({ success: true, data: result.data.map(({ _sortDate, _sortName, ...row }) => row), pagination: result.pagination });
  } catch (error) {
    console.error('Error fetching attendance:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance' });
  }
});

// Every active employee with their record for the day, present or not — this is
// what the daily marking screen renders, so employees with no row must appear.
app.get('/attendance/today', requireDB, async (req, res) => {
  const onDate = parseDate(req.query.date);
  if (onDate === undefined) {
    return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD' });
  }
  try {
    const result = await getPool().request()
      .input('OnDate', sql.Date, onDate || dateOnly(zonedToday()))
      .query(`
        SELECT
          e.EmployeeID                          AS employeeId,
          e.EmployeeCode                        AS employeeCode,
          e.Name                                AS employeeName,
          e.Department                          AS department,
          e.Position                            AS position,
          a.AttendanceID                        AS id,
          to_char(a.CheckInTime, 'HH24:MI')     AS checkIn,
          to_char(a.CheckOutTime, 'HH24:MI')    AS checkOut,
          a.Status                              AS status,
          a.TotalHours                          AS totalHours,
          a.Notes                               AS notes
        FROM Employees e
        LEFT JOIN EmployeeAttendance a
               ON a.EmployeeID = e.EmployeeID AND a.AttendanceDate = @OnDate
        WHERE e.IsActive = TRUE
        ORDER BY e.Name
      `);
    res.json({
      success: true,
      date: req.query.date || zonedToday(),
      data: result.recordset
    });
  } catch (error) {
    console.error('Error fetching daily attendance:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch daily attendance' });
  }
});

// Counters for one day, including how many active employees are unmarked.
app.get('/attendance/stats', requireDB, async (req, res) => {
  const onDate = parseDate(req.query.date);
  if (onDate === undefined) {
    return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD' });
  }
  try {
    const result = await getPool().request()
      .input('OnDate', sql.Date, onDate || dateOnly(zonedToday()))
      .query(`
        SELECT
          (SELECT COUNT(*) FROM Employees WHERE IsActive = TRUE) AS totalEmployees,
          COALESCE(s.PresentCount, 0)  AS present,
          COALESCE(s.AbsentCount, 0)   AS absent,
          COALESCE(s.HalfDayCount, 0)  AS halfDay,
          COALESCE(s.LeaveCount, 0)    AS onLeave,
          COALESCE(s.LateCount, 0)     AS late,
          COALESCE(s.TotalRecords, 0)  AS marked,
          COALESCE(s.TotalHours, 0)    AS totalHours,
          (SELECT COUNT(*) FROM Employees WHERE IsActive = TRUE) - COALESCE(s.TotalRecords, 0) AS unmarked
        FROM (SELECT 1 AS x) dummy
        LEFT JOIN vw_AttendanceDailySummary s ON s.AttendanceDate = @OnDate
      `);
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error fetching attendance stats:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance stats' });
  }
});

// Per-employee totals over a range, for payroll and performance review.
app.get('/attendance/summary', requireDB, async (req, res) => {
  const fromDate = parseDate(req.query.from);
  const toDate = parseDate(req.query.to);
  if (fromDate === undefined || toDate === undefined) {
    return res.status(400).json({ success: false, message: 'from/to must be YYYY-MM-DD' });
  }
  try {
    const result = await getPool().request()
      .input('From', sql.Date, fromDate)
      .input('To', sql.Date, toDate)
      .query(`
        SELECT
          e.EmployeeID   AS employeeId,
          e.EmployeeCode AS employeeCode,
          e.Name         AS employeeName,
          e.Department   AS department,
          COUNT(a.AttendanceID)                                        AS daysRecorded,
          SUM(CASE WHEN a.Status IN ('present','late') THEN 1 ELSE 0 END) AS daysPresent,
          SUM(CASE WHEN a.Status = 'absent'   THEN 1 ELSE 0 END)       AS daysAbsent,
          SUM(CASE WHEN a.Status = 'half-day' THEN 1 ELSE 0 END)       AS daysHalf,
          SUM(CASE WHEN a.Status = 'leave'    THEN 1 ELSE 0 END)       AS daysLeave,
          SUM(CASE WHEN a.Status = 'late'     THEN 1 ELSE 0 END)       AS daysLate,
          CAST(COALESCE(SUM(a.TotalHours), 0) AS DECIMAL(10,2))        AS totalHours,
          CAST(SUM(CASE WHEN a.Status IN ('present','late') THEN 1 ELSE 0 END) * 100.0
               / NULLIF(COUNT(a.AttendanceID), 0) AS DECIMAL(5,2))     AS attendanceRate
        FROM Employees e
        LEFT JOIN EmployeeAttendance a
               ON a.EmployeeID = e.EmployeeID
              AND (@From IS NULL OR a.AttendanceDate >= @From)
              AND (@To   IS NULL OR a.AttendanceDate <= @To)
        WHERE e.IsActive = TRUE
        GROUP BY e.EmployeeID, e.EmployeeCode, e.Name, e.Department
        ORDER BY e.Name
      `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching attendance summary:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance summary' });
  }
});

// Active employees, for the check-in dropdown.
app.get('/employees', requireDB, async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT EmployeeID AS id, EmployeeCode AS code, Name AS name,
             Department AS department, Position AS position
      FROM Employees WHERE IsActive = TRUE ORDER BY Name
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching employees:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch employees' });
  }
});

// --- Writes -----------------------------------------------------------------

app.post('/attendance/check-in', requireDB, async (req, res) => {
  const { employeeId, date, time, notes } = req.body;
  if (!employeeId) {
    return res.status(400).json({ success: false, message: 'employeeId is required' });
  }
  if (!routeId(employeeId)) {
    return res.status(400).json({ success: false, message: 'employeeId must be a positive whole number' });
  }
  if (time && isNaN(new Date(time).getTime())) {
    return res.status(400).json({ success: false, message: 'time must be a valid date-time' });
  }
  const onDate = parseDate(date);
  if (onDate === undefined) {
    return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD' });
  }
  try {
    const result = await getPool().request()
      .input('EmployeeID', sql.Int, routeId(employeeId))
      .input('AttendanceDate', sql.Date, onDate || dateOnly(zonedToday()))
      .input('CheckInTime', sql.DateTime, time ? zonedNow(new Date(time)) : zonedNow())
      .input('Notes', sql.NVarChar(500), notes || null)
      .input('LateAfter', sql.NVarChar(8), LATE_AFTER)
      .execute('sp_AttendanceCheckIn');

    const row = result.recordset[0];
    // The procedure reports business failures as a row, not an exception.
    if (row.Result === 'Error') {
      return res.status(409).json({ success: false, message: row.Message });
    }
    res.json({
      success: true,
      message: row.Message,
      data: { id: row.AttendanceID, status: row.Status, checkIn: row.CheckInTime }
    });
  } catch (error) {
    console.error('Error checking in:', error.message);
    res.status(500).json({ success: false, message: 'Failed to check in' });
  }
});

app.post('/attendance/check-out', requireDB, async (req, res) => {
  const { employeeId, date, time } = req.body;
  if (!employeeId) {
    return res.status(400).json({ success: false, message: 'employeeId is required' });
  }
  if (!routeId(employeeId)) {
    return res.status(400).json({ success: false, message: 'employeeId must be a positive whole number' });
  }
  if (time && isNaN(new Date(time).getTime())) {
    return res.status(400).json({ success: false, message: 'time must be a valid date-time' });
  }
  const onDate = parseDate(date);
  if (onDate === undefined) {
    return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD' });
  }
  try {
    const result = await getPool().request()
      .input('EmployeeID', sql.Int, routeId(employeeId))
      .input('AttendanceDate', sql.Date, onDate || dateOnly(zonedToday()))
      .input('CheckOutTime', sql.DateTime, time ? zonedNow(new Date(time)) : zonedNow())
      .execute('sp_AttendanceCheckOut');

    const row = result.recordset[0];
    if (row.Result === 'Error') {
      return res.status(409).json({ success: false, message: row.Message });
    }
    res.json({
      success: true,
      message: row.Message,
      data: {
        id: row.AttendanceID,
        totalHours: row.TotalHours,
        checkOut: row.CheckOutTime,
        status: row.Status
      }
    });
  } catch (error) {
    console.error('Error checking out:', error.message);
    res.status(500).json({ success: false, message: 'Failed to check out' });
  }
});

// Mark attendance directly (absent, leave, or a corrected time). Upserts, so
// the daily screen can be saved repeatedly without creating duplicates.
app.post('/attendance', requireDB, async (req, res) => {
  const { employeeId, date, status, checkIn, checkOut, notes } = req.body;
  if (!employeeId || !status) {
    return res.status(400).json({ success: false, message: 'employeeId and status are required' });
  }
  if (!routeId(employeeId)) {
    return res.status(400).json({ success: false, message: 'employeeId must be a positive whole number' });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }
  const onDate = parseDate(date);
  if (onDate === undefined) {
    return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD' });
  }
  const day = req.body.date || zonedToday();

  let inTime, outTime;
  try {
    inTime = checkIn ? wallClock(day, checkIn) : null;
    outTime = checkOut ? wallClock(day, checkOut) : null;
  } catch {
    return res.status(400).json({ success: false, message: 'checkIn/checkOut must be HH:MM' });
  }
  if (inTime && outTime && outTime < inTime) {
    return res.status(400).json({ success: false, message: 'checkOut cannot precede checkIn' });
  }

  try {
    // ON CONFLICT keeps the upsert to a single statement, so two concurrent
    // saves cannot both decide the row is missing and insert it.
    //
    // Times are COALESCEd onto whatever is already stored: marking a status
    // must never erase a check-in the employee already recorded. Hours are
    // recomputed from the resulting pair rather than from the request alone.
    const result = await getPool().request()
      .input('EmployeeID', sql.Int, routeId(employeeId))
      .input('AttendanceDate', sql.Date, onDate || dateOnly(zonedToday()))
      .input('CheckInTime', sql.DateTime, inTime)
      .input('CheckOutTime', sql.DateTime, outTime)
      .input('Status', sql.NVarChar(20), status)
      .input('Notes', sql.NVarChar(500), notes || null)
      .query(`
        INSERT INTO EmployeeAttendance AS target
          (EmployeeID, AttendanceDate, CheckInTime, CheckOutTime, Status, TotalHours, Notes)
        VALUES (@EmployeeID, @AttendanceDate, @CheckInTime, @CheckOutTime, @Status,
                CASE WHEN @CheckInTime IS NOT NULL AND @CheckOutTime IS NOT NULL
                     THEN CAST(minutes_between(@CheckInTime, @CheckOutTime) / 60.0 AS DECIMAL(5,2))
                     ELSE 0 END,
                @Notes)
        ON CONFLICT (EmployeeID, AttendanceDate) DO UPDATE SET
              CheckInTime  = COALESCE(@CheckInTime, target.CheckInTime),
              CheckOutTime = COALESCE(@CheckOutTime, target.CheckOutTime),
              Status       = @Status,
              TotalHours   = CASE
                  WHEN COALESCE(@CheckInTime, target.CheckInTime) IS NOT NULL
                   AND COALESCE(@CheckOutTime, target.CheckOutTime) IS NOT NULL
                  THEN CAST(minutes_between(
                            COALESCE(@CheckInTime, target.CheckInTime),
                            COALESCE(@CheckOutTime, target.CheckOutTime)) / 60.0 AS DECIMAL(5,2))
                  ELSE 0 END,
              Notes        = COALESCE(@Notes, target.Notes),
              UpdatedAt    = LOCALTIMESTAMP
        RETURNING AttendanceID AS id, Status AS status,
                  TotalHours AS totalHours,
                  to_char(CheckInTime, 'HH24:MI')  AS checkIn,
                  to_char(CheckOutTime, 'HH24:MI') AS checkOut;
      `);
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error marking attendance:', error.message);
    res.status(500).json({ success: false, message: 'Failed to mark attendance' });
  }
});

app.put('/attendance/:id', requireDB, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, message: 'Invalid attendance id' });
  }
  const { status, notes } = req.body;
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }
  try {
    const result = await getPool().request()
      .input('AttendanceID', sql.Int, id)
      .input('Status', sql.NVarChar(20), status ?? null)
      .input('Notes', sql.NVarChar(500), notes ?? null)
      .query(`
        UPDATE EmployeeAttendance SET
          Status    = COALESCE(@Status, Status),
          Notes     = COALESCE(@Notes, Notes),
          UpdatedAt = LOCALTIMESTAMP
        WHERE AttendanceID = @AttendanceID
        RETURNING AttendanceID AS id, Status AS status
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error updating attendance:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update attendance' });
  }
});

app.delete('/attendance/:id', requireDB, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, message: 'Invalid attendance id' });
  }
  try {
    const result = await getPool().request()
      .input('AttendanceID', sql.Int, id)
      .query('DELETE FROM EmployeeAttendance WHERE AttendanceID = @AttendanceID RETURNING AttendanceID AS id');
    if (!result.recordset.length) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }
    res.json({ success: true, message: 'Attendance record deleted' });
  } catch (error) {
    console.error('Error deleting attendance:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete attendance' });
  }
});

app.get('/policy', (req, res) => {
  res.json({ success: true, data: { lateAfter: LATE_AFTER, statuses: VALID_STATUSES } });
});

app.get('/health', health);

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`🕒 Attendance Service running on http://${SERVICE_HOST}:${PORT}`);
  console.log(`   Late after ${LATE_AFTER}`);
});
