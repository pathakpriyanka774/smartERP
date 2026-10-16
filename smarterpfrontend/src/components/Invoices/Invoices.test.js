import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Invoices from './Invoices';
import { accountingAPI, ordersAPI } from '../../services/api';

jest.mock('../../services/api', () => ({
  accountingAPI: {
    invoiceableOrders: jest.fn(),
    previewInvoice: jest.fn(),
    createInvoice: jest.fn(),
    getInvoices: jest.fn(),
    getInvoice: jest.fn(),
    cancelInvoice: jest.fn(),
    createPayment: jest.fn(),
    getPayments: jest.fn(),
    voidPayment: jest.fn(),
    getSettings: jest.fn(),
    gstReference: jest.fn()
  },
  ordersAPI: { get: jest.fn() }
}));

const page = (data, total = data.length) => ({ data: { success: true, data, pagination: { page: 1, pageSize: 25, total, totalPages: 1 } } });

const row = {
  id: 7, invoiceNumber: 'INV/26-27/00007', invoiceDate: '2026-10-01', dueDate: '2026-10-08', buyerName: 'Acme Textiles',
  buyerGstin: '09AAACA1234A1Z5', placeOfSupply: '09', supplyType: 'intra', taxableValue: '10000.00', cgst: '600.00',
  sgst: '600.00', igst: '0.00', roundOff: '0.00', grandTotal: '11200.00', amountPaid: '0.00', balanceDue: '11200.00',
  status: 'issued', overdue: true
};

const full = {
  ...row,
  orderId: 3,
  placeOfSupplyName: 'Uttar Pradesh',
  seller: { name: 'Seller Pvt Ltd', gstin: '09AAACS0000A1Z1', stateCode: '09', stateName: 'Uttar Pradesh', address: 'Noida', bank: null, terms: 'Pay in 7 days' },
  amountInWords: 'Rupees Eleven Thousand Two Hundred Only',
  taxSummary: [{ hsnCode: '6109', gstRate: 12, taxableValue: 10000, cgst: 600, sgst: 600, igst: 0, totalTax: 1200 }],
  lines: [{ id: 1, orderItemId: 11, description: 'Cotton T-shirt', hsnCode: '6109', quantity: 100, unit: 'pcs', unitPrice: 100, taxableValue: 10000, gstRate: 12, cgst: 600, sgst: 600, igst: 0, lineTotal: 11200 }],
  payments: []
};

const preview = (qty) => ({
  data: {
    data: {
      ...full, invoiceNumber: null, status: undefined, invoiceDate: '2026-10-10',
      taxableValue: qty * 100, cgst: qty * 6, sgst: qty * 6, grandTotal: qty * 112,
      lines: [{ ...full.lines[0], id: undefined, quantity: qty, taxableValue: qty * 100, cgst: qty * 6, sgst: qty * 6, lineTotal: qty * 112 }]
    }
  }
});

const renderIt = () => render(<MemoryRouter><Invoices /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  accountingAPI.getInvoices.mockImplementation(params => Promise.resolve(params.pageSize === 1 ? page([], params.status === 'overdue' ? 4 : 9) : page([row])));
  accountingAPI.getSettings.mockResolvedValue({ data: { data: { readyToInvoice: true } } });
  accountingAPI.gstReference.mockResolvedValue({ data: { data: { states: [{ code: '09', name: 'Uttar Pradesh' }, { code: '27', name: 'Maharashtra' }], rates: [0, 5, 12, 18, 28] } } });
  accountingAPI.getPayments.mockResolvedValue(page([]));
});

test('lists invoices from the server with status counts and an overdue flag', async () => {
  renderIt();
  expect(await screen.findByText('INV/26-27/00007')).toBeInTheDocument();
  expect(screen.getAllByText('₹11,200.00', { selector: 'td' })).toHaveLength(2); // total and balance due
  expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);
  expect(await screen.findByText('4')).toBeInTheDocument();
});

test('opens a printable GST tax invoice with server figures', async () => {
  accountingAPI.getInvoice.mockResolvedValue({ data: { data: full } });
  renderIt();
  fireEvent.click(await screen.findByRole('button', { name: 'INV/26-27/00007' }));
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('TAX INVOICE')).toBeInTheDocument();
  expect(within(dialog).getByText('Rupees Eleven Thousand Two Hundred Only', { exact: false })).toBeInTheDocument();
  expect(within(dialog).getAllByRole('columnheader', { name: 'CGST' }).length).toBeGreaterThan(0);
  expect(within(dialog).queryByRole('columnheader', { name: 'IGST' })).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Record receipt' })).toBeEnabled();
});

test('points an admin to Company Settings when GSTIN is missing', async () => {
  accountingAPI.getSettings.mockResolvedValue({ data: { data: { readyToInvoice: false } } });
  renderIt();
  expect(await screen.findByRole('link', { name: 'Company Settings' })).toHaveAttribute('href', '/company-settings');
  expect(screen.getByRole('button', { name: '+ New invoice' })).toBeDisabled();
});

test('new invoice: previews on the server, re-previews on change and issues the same body', async () => {
  accountingAPI.invoiceableOrders.mockResolvedValue(page([{ id: 3, clientName: 'Acme Textiles', status: 'confirmed', orderDate: '2026-10-01', totalAmount: 10000, uninvoicedValue: 10000 }]));
  ordersAPI.get.mockResolvedValue({ data: { data: { items: [{ id: 11, quantity: 100, invoicedQuantity: 0 }] } } });
  accountingAPI.previewInvoice.mockImplementation(body => Promise.resolve(preview(body.lines ? body.lines[0].quantity : 100)));
  accountingAPI.createInvoice.mockResolvedValue({ data: { data: { ...full, quantity: 40 } } });
  renderIt();
  fireEvent.click(await screen.findByRole('button', { name: '+ New invoice' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Invoice order #3' }));
  expect(await screen.findByRole('button', { name: /Issue invoice for ₹11,200.00/ })).toBeEnabled();

  fireEvent.change(screen.getByLabelText('Quantity for line 1'), { target: { value: '40' } });
  expect(await screen.findByRole('button', { name: /Issue invoice for ₹4,480.00/ }, { timeout: 2000 })).toBeEnabled();
  const sent = accountingAPI.previewInvoice.mock.calls.at(-1)[0];
  expect(sent.lines).toEqual([{ orderItemId: 11, quantity: 40, hsnCode: '6109', gstRate: 12 }]);

  fireEvent.click(screen.getByRole('button', { name: /Issue invoice for/ }));
  await waitFor(() => expect(accountingAPI.createInvoice).toHaveBeenCalledWith(sent));
  expect(await screen.findByText('TAX INVOICE')).toBeInTheDocument();
});

test('blocks a quantity above what is left to invoice', async () => {
  accountingAPI.invoiceableOrders.mockResolvedValue(page([{ id: 3, clientName: 'Acme Textiles', status: 'confirmed', orderDate: '2026-10-01', totalAmount: 10000, uninvoicedValue: 10000 }]));
  ordersAPI.get.mockResolvedValue({ data: { data: { items: [{ id: 11, quantity: 100, invoicedQuantity: 0 }] } } });
  accountingAPI.previewInvoice.mockResolvedValue(preview(100));
  renderIt();
  fireEvent.click(await screen.findByRole('button', { name: '+ New invoice' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Invoice order #3' }));
  fireEvent.change(await screen.findByLabelText('Quantity for line 1'), { target: { value: '150' } });
  expect(await screen.findByText(/only 100 left to invoice/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Issue invoice for/ })).toBeDisabled();
});
