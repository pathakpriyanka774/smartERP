/**
 * The seller details printed on invoices and document templates.
 *
 * PLACEHOLDERS ONLY. Real company identifiers (GSTIN, bank account, IFSC,
 * phone, e-mail) must not live in source code: they were previously
 * hard-coded here from a real third party's invoice, which put that party's
 * data in every copy of the code. Fill these in per deployment from the
 * environment (REACT_APP_COMPANY_*), and until then documents show the
 * bracketed placeholders, so a missing value is obvious rather than wrong.
 *
 * A server-side organisation settings record is the long-term home for this.
 */
const env = (name, fallback) => process.env[`REACT_APP_COMPANY_${name}`] || fallback;

export const COMPANY = {
  name: env('NAME', '[Your Company Name]'),
  addressLines: env('ADDRESS', '[Address line 1]|[City, State PIN]|India').split('|'),
  gstin: env('GSTIN', '[Your GSTIN]'),
  phone: env('PHONE', '[Phone]'),
  email: env('EMAIL', '[E-mail]'),
  website: env('WEBSITE', ''),
  // GST place of supply, e.g. "Uttar Pradesh (09)".
  placeOfSupply: env('PLACE_OF_SUPPLY', '[State (code)]'),
  bank: {
    name: env('BANK_NAME', '[Bank name]'),
    account: env('BANK_ACCOUNT', '[Account number]'),
    ifsc: env('BANK_IFSC', '[IFSC]')
  }
};

/** Buyer GSTIN is per customer; until customers store one, print a blank to fill in. */
export const BUYER_GSTIN_PLACEHOLDER = '[Buyer GSTIN]';
