import { render, screen, fireEvent } from '@testing-library/react';
import AuditLog from './AuditLog';
import { auditAPI } from '../../services/api';

jest.mock('../../services/api', () => ({ auditAPI: { list: jest.fn(), tables: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  auditAPI.tables.mockResolvedValue({ data: { data: ['clients', 'users'] } });
  auditAPI.list.mockResolvedValue({ data: {
    data: [
      { id: 2, occurredAt: '2026-10-09T08:35:00Z', userId: 1, userName: 'admin', action: 'UPDATE', tableName: 'clients', recordId: '14',
        oldData: { city: 'Pune' }, newData: { city: 'Mumbai' } },
      { id: 1, occurredAt: '2026-10-09T08:00:00Z', userId: null, userName: null, action: 'INSERT', tableName: 'clients', recordId: '14', oldData: null, newData: { name: 'X' } }
    ],
    pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 }
  } });
});

test('shows IST times, the DPDP note and before → after changes', async () => {
  render(<AuditLog />);
  expect(screen.getByText(/Contains personal data\. Admins only\./)).toBeInTheDocument();
  expect(await screen.findByText('09 Oct 2026, 14:05')).toBeInTheDocument();
  expect(screen.getByText('system')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /show changes for event 2/i }));
  expect(screen.getByText('Pune')).toBeInTheDocument();
  expect(screen.getByText('Mumbai')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /export|csv/i })).not.toBeInTheDocument();
});

test('filters are sent to the server', async () => {
  render(<AuditLog />);
  await screen.findByText('09 Oct 2026, 14:05');
  fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'DELETE' } });
  await screen.findByText('09 Oct 2026, 14:05');
  expect(auditAPI.list).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'DELETE', page: 1 }));
});
