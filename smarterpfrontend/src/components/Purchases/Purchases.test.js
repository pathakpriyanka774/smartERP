import { render, screen, fireEvent, within } from '@testing-library/react';
import Purchases from './Purchases';
import { MemoryRouter } from 'react-router-dom';
import { purchasesAPI, accountingAPI } from '../../services/api';

jest.mock('../../services/api', () => ({
  purchasesAPI: {
    getSuppliers: jest.fn(), createSupplier: jest.fn(), getItems: jest.fn(),
    getOrders: jest.fn(), getOrder: jest.fn(), createOrder: jest.fn(), updateOrder: jest.fn(), step: jest.fn(),
    receive: jest.fn(), getReceipts: jest.fn(), getReceipt: jest.fn(),
    createBill: jest.fn(), getBills: jest.fn(), getBill: jest.fn(), cancelBill: jest.fn()
  },
  accountingAPI: { gstReference: jest.fn() }
}));

const page = (data) => ({ data: { data, pagination: { page: 1, pageSize: 25, total: data.length, totalPages: 1 } } });

const po = {
  id: 7, poNumber: 'PO/26-27/00007', supplierId: 3, supplierName: 'Acme Yarns', orderDate: '2026-10-01',
  expectedDate: '2026-10-15', status: 'submitted', notes: null, subtotal: '1000.00', taxAmount: '180.00', total: '1180.00',
  createdById: 5, createdBy: 'asha', approvedBy: null, pendingQuantity: 10
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('currentUser', JSON.stringify({ id: 5, role: 'Staff' }));
  accountingAPI.gstReference.mockResolvedValue({ data: { data: { states: [{ code: '27', name: 'Maharashtra' }], rates: [0, 5, 18] } } });
  purchasesAPI.getOrders.mockResolvedValue(page([po]));
});

test('lists purchase orders with rupee totals and status', async () => {
  render(<MemoryRouter><Purchases /></MemoryRouter>);
  expect(await screen.findByRole('button', { name: 'PO/26-27/00007' })).toBeInTheDocument();
  expect(screen.getByText('₹1,180.00')).toBeInTheDocument();
  const row = screen.getAllByRole('row').find(r => within(r).queryByText('Acme Yarns'));
  expect(within(row).getByText('Awaiting approval')).toBeInTheDocument();
});

test('the requester of a submitted order is told they cannot approve it', async () => {
  purchasesAPI.getOrder.mockResolvedValue({
    data: {
      data: {
        ...po, canApprove: false, receipts: [], bills: [],
        items: [{ id: 11, itemId: 2, description: 'Cotton yarn', quantity: 10, unitPrice: '100.00', gstRate: '18.00', lineTotal: '1000.00',
          receivedQuantity: 0, rejectedQuantity: 0, billedQuantity: 0, pendingQuantity: 10, unbilledQuantity: 0, unit: 'kg', sku: 'CY-1' }]
      }
    }
  });
  render(<MemoryRouter><Purchases /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'PO/26-27/00007' }));
  expect(await screen.findByText(/you cannot approve your own order/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Return to draft' })).toBeInTheDocument();
});

test('shows a load failure with a retry', async () => {
  purchasesAPI.getOrders.mockRejectedValueOnce({ response: { data: { message: 'You do not have access to purchases' } } });
  render(<MemoryRouter><Purchases /></MemoryRouter>);
  expect(await screen.findByText('You do not have access to purchases')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /try again/i }));
  expect(await screen.findByRole('button', { name: 'PO/26-27/00007' })).toBeInTheDocument();
});
