import { render, screen, fireEvent } from '@testing-library/react';
import CompanySettings from './CompanySettings';
import { accountingAPI } from '../../services/api';

jest.mock('../../services/api', () => ({
  accountingAPI: { getSettings: jest.fn(), updateSettings: jest.fn(), gstReference: jest.fn() }
}));

const settings = {
  companyName: 'Demo Pvt Ltd', gstin: null, stateCode: null, stateName: null, addressLine1: null, addressLine2: null, city: 'Pune',
  pincode: null, phone: null, email: null, website: null, bankName: null, bankAccount: null, bankIfsc: null, bankBranch: null,
  invoicePrefix: 'INV', defaultGstRate: 18, paymentTermsDays: 30, invoiceTerms: null,
  pfEnabled: false, pfRate: 12, pfWageCeiling: 15000, esiEnabled: false, esiRate: 0.75, esiWageLimit: 21000, professionalTax: 200,
  readyToInvoice: false
};

beforeEach(() => {
  jest.clearAllMocks();
  accountingAPI.getSettings.mockResolvedValue({ data: { data: settings } });
  accountingAPI.gstReference.mockResolvedValue({ data: { data: { states: [{ code: '27', name: 'Maharashtra' }], rates: [0, 5, 12, 18, 28] } } });
});

test('warns that invoices are blocked and sends only changed fields', async () => {
  render(<CompanySettings />);
  expect(await screen.findByText(/Invoices cannot be issued until a valid GSTIN is saved/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'No changes' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Mumbai' } });
  fireEvent.click(screen.getByLabelText('Deduct Provident Fund (PF)'));
  accountingAPI.updateSettings.mockResolvedValue({ data: { data: { ...settings, city: 'Mumbai', pfEnabled: true } } });
  fireEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }));
  expect(await screen.findByText('Saved 2 changes')).toBeInTheDocument();
  expect(accountingAPI.updateSettings).toHaveBeenCalledWith({ city: 'Mumbai', pfEnabled: true });
});

test('shows server validation errors', async () => {
  render(<CompanySettings />);
  fireEvent.change(await screen.findByLabelText('GSTIN'), { target: { value: '27aaaaa0000a1z1' } });
  expect(screen.getByLabelText('State (from GSTIN)').value).toMatch(/Maharashtra/);
  accountingAPI.updateSettings.mockRejectedValue({ response: { status: 400, data: { message: 'x', errors: ['GSTIN is not valid (format, state code or check digit)'] } } });
  fireEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
  expect(await screen.findByText(/GSTIN is not valid/)).toBeInTheDocument();
  expect(accountingAPI.updateSettings).toHaveBeenCalledWith({ gstin: '27AAAAA0000A1Z1' });
});
