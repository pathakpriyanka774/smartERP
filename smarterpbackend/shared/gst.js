/**
 * GST arithmetic for tax invoices and supplier bills.
 *
 * All amounts are worked in integer paise, so a total can never disagree with
 * the sum of its rows by a floating-point fraction (the old invoice screen
 * printed CGST 2.5 % + SGST 2.5 % but added 8 %).
 *
 *   * Tax is computed per line and rounded per line; invoice totals are sums
 *     of the line figures, so every total equals its rows exactly.
 *   * Intra-state supply (seller state = place of supply): CGST + SGST, each
 *     half the rate. Inter-state: IGST at the full rate.
 *   * The grand total is rounded to the rupee; the difference is shown as
 *     "Round off" (always under ₹1).
 */

// GST state and union-territory codes (first two digits of a GSTIN).
const STATES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory'
};

const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The check character for the first 14 characters of a GSTIN. */
const gstinCheckChar = (first14) => {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
};

/** Format, a real state code, and the check digit. */
const isValidGSTIN = (gstin) => {
  if (typeof gstin !== 'string') return false;
  const g = gstin.trim().toUpperCase();
  return GSTIN_PATTERN.test(g) && Boolean(STATES[g.slice(0, 2)]) && gstinCheckChar(g.slice(0, 14)) === g[14];
};

const isStateCode = (code) => typeof code === 'string' && Boolean(STATES[code]);

const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paise) => paise / 100;

/**
 * Compute an invoice or bill.
 *   lines: [{ quantity, unitPrice, gstRate, ...anything else is passed through }]
 *   supplyType: 'intra' | 'inter'
 * Returns rupee amounts (two decimals, exact) per line and in total, plus a
 * summary by rate and HSN code for the tax table.
 */
const computeTax = (lines, supplyType) => {
  if (!['intra', 'inter'].includes(supplyType)) throw new Error('supplyType must be intra or inter');
  const out = [];
  const t = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
  const summary = new Map();
  for (const line of lines) {
    const rate = Number(line.gstRate);
    // Quantity is a whole number, so qty × price in paise is exact.
    const taxable = Math.round(line.quantity * toPaise(line.unitPrice));
    let cgst = 0; let sgst = 0; let igst = 0;
    if (supplyType === 'intra') {
      cgst = Math.round(taxable * rate / 200);
      sgst = cgst;
    } else {
      igst = Math.round(taxable * rate / 100);
    }
    t.taxable += taxable; t.cgst += cgst; t.sgst += sgst; t.igst += igst;
    const key = `${line.hsnCode || ''}|${rate}`;
    const s = summary.get(key) || { hsnCode: line.hsnCode || null, gstRate: rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    s.taxable += taxable; s.cgst += cgst; s.sgst += sgst; s.igst += igst;
    summary.set(key, s);
    out.push({
      ...line,
      gstRate: rate,
      taxableValue: toRupees(taxable),
      cgst: toRupees(cgst), sgst: toRupees(sgst), igst: toRupees(igst),
      lineTotal: toRupees(taxable + cgst + sgst + igst)
    });
  }
  const beforeRounding = t.taxable + t.cgst + t.sgst + t.igst;
  const grand = Math.round(beforeRounding / 100) * 100;
  return {
    supplyType,
    lines: out,
    taxableValue: toRupees(t.taxable),
    cgst: toRupees(t.cgst), sgst: toRupees(t.sgst), igst: toRupees(t.igst),
    totalTax: toRupees(t.cgst + t.sgst + t.igst),
    roundOff: toRupees(grand - beforeRounding),
    grandTotal: toRupees(grand),
    taxSummary: [...summary.values()].map(s => ({
      hsnCode: s.hsnCode, gstRate: s.gstRate, taxableValue: toRupees(s.taxable),
      cgst: toRupees(s.cgst), sgst: toRupees(s.sgst), igst: toRupees(s.igst),
      totalTax: toRupees(s.cgst + s.sgst + s.igst)
    }))
  };
};

/** Intra-state when the seller's state is the place of supply. */
const supplyTypeFor = (sellerState, placeOfSupply) => (sellerState === placeOfSupply ? 'intra' : 'inter');

// --- Amount in words (Indian numbering: thousand, lakh, crore) ---------------

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n) => {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ');
};

const integerInWords = (n) => {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  if (crore) parts.push(`${integerInWords(crore)} Crore`);
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return parts.join(' ');
};

/** 118000.5 → "Rupees One Lakh Eighteen Thousand and Fifty Paise Only" */
const amountInWords = (amount) => {
  const paise = Math.round(Math.abs(Number(amount)) * 100);
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${integerInWords(rupees)}${p ? ` and ${below100(p)} Paise` : ''} Only`;
};

/** INV/26-27/00001 */
const documentNumber = (prefix, financialYear, n) => `${prefix}/${financialYear}/${String(n).padStart(5, '0')}`;

module.exports = {
  STATES, GST_RATES, isValidGSTIN, gstinCheckChar, isStateCode,
  computeTax, supplyTypeFor, amountInWords, documentNumber, toPaise
};
