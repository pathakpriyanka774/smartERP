import { canOpen, landingPath } from './menuConfig';

test('admins can open everything', () => {
  expect(canOpen({ role: 'Admin', permissions: [] }, 'payroll')).toBe(true);
});

test('others can open only what they were granted', () => {
  const user = { role: 'Employee', permissions: ['attendance'] };
  expect(canOpen(user, 'attendance')).toBe(true);
  expect(canOpen(user, 'payroll')).toBe(false);
});

test('a user lands on the first screen they may open', () => {
  expect(landingPath({ role: 'Employee', permissions: ['attendance'] })).toBe('/attendance');
  expect(landingPath({ role: 'Employee', permissions: [] })).toBeNull();
});
