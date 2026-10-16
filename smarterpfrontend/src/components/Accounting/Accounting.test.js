import { render, screen, fireEvent, within } from '@testing-library/react';
import Accounting from './Accounting';
import { accountingAPI } from '../../services/api';

jest.mock('../../services/api', () => ({
  accountingAPI: {
    summary: jest.fn(), getAccounts: jest.fn(), getJournal: jest.fn(), postJournal: jest.fn(), reverseJournal: jest.fn(),
    trialBalance: jest.fn(), receivables: jest.fn(), getPayments: jest.fn(), payableBills: jest.fn(), createPayment: jest.fn()
  }
}));

const accounts = [
  { id: 1, code: '1010', name: 'Bank', type: 'asset', isSystem: true, debit: 5000, credit: 0, balance: 5000, controlAccount: false },
  { id: 2, code: '1100', name: 'Trade receivables', type: 'asset', isSystem: true, debit: 0, credit: 0, balance: 0, controlAccount: true },
  { id: 3, code: '5100', name: 'Rent', type: 'expense', isSystem: false, debit: 0, credit: 0, balance: 0, controlAccount: false }
];

beforeEach(() => {
  jest.clearAllMocks();
  accountingAPI.summary.mockResolvedValue({ data: { data: {
    receivables: 123456.5, overdueReceivables: 0, payables: 1000, overduePayables: 0, cashAndBank: 5000, inventoryValue: 0, goodsNotBilled: 0
  } } });
  accountingAPI.getAccounts.mockResolvedValue({ data: { data: accounts } });
  accountingAPI.getJournal.mockResolvedValue({ data: {
    data: [{ id: 7, entryDate: '2026-10-01', reference: 'ACR-1', sourceType: 'manual', narration: 'Accrual', amount: 500, reversedBy: null, reversalOf: null,
      lines: [{ account: '5100', accountName: 'Rent', debit: 500, credit: 0 }, { account: '1010', accountName: 'Bank', debit: 0, credit: 500 }] }],
    pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 }
  } });
});

test('overview shows the server figures in rupees', async () => {
  render(<Accounting />);
  expect(await screen.findByText('₹1,23,456.50')).toBeInTheDocument();
});

test('journal entries expand and only manual entries can be reversed', async () => {
  render(<Accounting />);
  fireEvent.click(screen.getByRole('tab', { name: 'Journal' }));
  expect(await screen.findByText('Accrual')).toBeInTheDocument();
  const expander = screen.getByRole('button', { name: /show lines of entry 7/i });
  expect(expander).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(expander);
  expect(screen.getByRole('button', { name: /hide lines of entry 7/i })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Reverse' })).toBeInTheDocument();
});

test('the journal form excludes control accounts and needs a balanced entry', async () => {
  render(<Accounting />);
  fireEvent.click(screen.getByRole('tab', { name: 'Journal' }));
  fireEvent.click(await screen.findByRole('button', { name: /new journal entry/i }));
  const dialog = screen.getByRole('dialog');
  const acct1 = within(dialog).getByLabelText('Line 1 account');
  expect(within(acct1).queryByText(/Trade receivables/)).not.toBeInTheDocument();
  const submit = within(dialog).getByRole('button', { name: 'Post entry' });
  expect(submit).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText(/Narration/), { target: { value: 'Rent accrual' } });
  fireEvent.change(acct1, { target: { value: '5100' } });
  fireEvent.change(within(dialog).getByLabelText('Line 1 debit'), { target: { value: '750' } });
  fireEvent.change(within(dialog).getByLabelText('Line 2 account'), { target: { value: '1010' } });
  fireEvent.change(within(dialog).getByLabelText('Line 2 credit'), { target: { value: '700' } });
  expect(submit).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('Line 2 credit'), { target: { value: '750' } });
  expect(submit).toBeEnabled();
  accountingAPI.postJournal.mockResolvedValue({ data: { data: { id: 8 } } });
  fireEvent.click(submit);
  expect(await screen.findByText('Journal entry posted')).toBeInTheDocument();
  expect(accountingAPI.postJournal).toHaveBeenCalledWith(expect.objectContaining({
    narration: 'Rent accrual',
    lines: [{ account: '5100', debit: 750 }, { account: '1010', credit: 750 }]
  }));
});

test('trial balance shows totals and the balanced indicator', async () => {
  accountingAPI.trialBalance.mockResolvedValue({ data: { data: {
    asOf: '2026-10-10', accounts: [{ code: '1010', name: 'Bank', type: 'asset', debit: 500, credit: 0 }, { code: '3000', name: 'Capital', type: 'equity', debit: 0, credit: 500 }],
    totalDebit: 500, totalCredit: 500, balanced: true
  } } });
  render(<Accounting />);
  fireEvent.click(screen.getByRole('tab', { name: 'Trial balance' }));
  expect(await screen.findByText('Capital')).toBeInTheDocument();
  expect(screen.getByText(/✓ Balanced/)).toBeInTheDocument();
});

test('a failed report explains itself and retries', async () => {
  accountingAPI.receivables.mockRejectedValueOnce({ response: { data: { message: 'You do not have access' } } });
  render(<Accounting />);
  fireEvent.click(screen.getByRole('tab', { name: 'Receivables ageing' }));
  expect(await screen.findByText('You do not have access')).toBeInTheDocument();
  accountingAPI.receivables.mockResolvedValue({ data: { data: {
    asOf: '2026-10-10', parties: [{ partyId: 1, party: 'Acme Textiles', current: 0, d1_30: 100, d31_60: 0, d61_90: 0, d90_plus: 0, total: 100, documents: [] }],
    totals: { current: 0, d1_30: 100, d31_60: 0, d61_90: 0, d90_plus: 0, total: 100 }
  } } });
  fireEvent.click(screen.getByRole('button', { name: /try again/i }));
  expect(await screen.findByText('Acme Textiles')).toBeInTheDocument();
});


test('supplier payments lists bills awaiting payment and Pay opens the form for that bill', async () => {
  accountingAPI.getPayments.mockResolvedValue({ data: { data: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } } });
  const bill = { id: 7, billRef: 'BILL/26-27/00001', supplierBillNo: 'SUP-11', supplierName: 'Sample Yarn Mills', poNumber: 'PO/26-27/00001',
    billDate: '2026-10-10', dueDate: '2026-11-09', total: 530, amountPaid: 0, balanceDue: 530, status: 'open', overdue: false, daysOverdue: 0 };
  accountingAPI.payableBills.mockResolvedValue({ data: { data: [bill], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 }, totals: { outstanding: 530, overdue: 0 } } });
  render(<Accounting />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Supplier payments' }));
  expect(await screen.findByText('BILL/26-27/00001')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pay BILL/26-27/00001' }));
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByDisplayValue('530')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Record payment' })).toBeEnabled();
});
