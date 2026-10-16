/**
 * Application timezone helpers.
 *
 * Database sessions run in UTC (see shared/database.js), so CURRENT_DATE is
 * not the local wall clock. Anything user-facing — the time on an attendance
 * record, and the calendar date that record belongs to — must be derived here
 * and passed explicitly, rather than left to the database default.
 */
const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

const partsIn = (date = new Date()) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
    .formatToParts(date)
    .reduce((acc, p) => (acc[p.type] = p.value, acc), {});

/**
 * A Date whose UTC components are the wall clock in TIMEZONE.
 *
 * shared/database.js serialises a Date parameter from its UTC components, so
 * this stores the local wall clock exactly, without depending on the timezone
 * of either the Node process or the database server.
 */
const zonedNow = (date = new Date()) => {
  const p = partsIn(date);
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second));
};

/** Today's calendar date in TIMEZONE, as YYYY-MM-DD. */
const zonedToday = (date = new Date()) => {
  const p = partsIn(date);
  return `${p.year}-${p.month}-${p.day}`;
};

/** A YYYY-MM-DD string as a Date suitable for a sql.Date parameter. */
const dateOnly = (ymd) => new Date(`${ymd}T00:00:00Z`);

/** A YYYY-MM-DD plus HH:MM (or HH:MM:SS) as a wall-clock DATETIME value. */
const wallClock = (ymd, time) => {
  const t = time.length === 5 ? `${time}:00` : time;
  const d = new Date(`${ymd}T${t}Z`);
  if (isNaN(d.getTime())) throw new Error('Invalid time');
  return d;
};

module.exports = { TIMEZONE, zonedNow, zonedToday, dateOnly, wallClock };
