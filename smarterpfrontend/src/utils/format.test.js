import { formatMoney, formatMoneyCompact, formatNumber, formatDate, todayIST, errorMessage, formatMonth } from './format';

test('formats rupees with Indian digit grouping', () => {
  expect(formatMoney(1234567.5)).toBe('₹12,34,567.50');
  expect(formatMoney(null)).toBe('—');
  expect(formatNumber(1234567)).toBe('12,34,567');
});

test('compacts large amounts into lakh and crore', () => {
  expect(formatMoneyCompact(150000)).toBe('₹1.50L');
  expect(formatMoneyCompact(25000000)).toBe('₹2.50Cr');
  expect(formatMoneyCompact(85625)).toBe('₹85.6k');
});

test('never shifts a calendar date across a time zone', () => {
  expect(formatDate('2026-10-01')).toMatch(/01 Oct 2026/);
  expect(formatMonth('2026-09')).toMatch(/Sept? 2026/);   // en-IN abbreviates to "Sept"
});

test('todayIST returns a YYYY-MM-DD date', () => {
  expect(todayIST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('prefers the server message for errors', () => {
  expect(errorMessage({ response: { data: { message: 'Not enough stock of "Cotton"' } } })).toBe('Not enough stock of "Cotton"');
  expect(errorMessage({ message: 'Network Error' })).toMatch(/cannot reach the server/i);
  expect(errorMessage({}, 'Fallback')).toBe('Fallback');
});
