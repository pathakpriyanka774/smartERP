import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Inventory from './Inventory';
import { inventoryAPI } from '../../services/api';

jest.mock('../../services/api', () => ({
  inventoryAPI: {
    getAll: jest.fn(), getStats: jest.fn(), getCategories: jest.fn(), archive: jest.fn(), restore: jest.fn(),
    getRecentMovements: jest.fn(), getMovements: jest.fn(), addMovement: jest.fn(), create: jest.fn(), update: jest.fn()
  }
}));

const item = (over) => ({
  id: 1, itemName: 'Cotton Fabric 60s', sku: 'FAB-60', category: 'Raw Material', quantity: 4200, reservedQuantity: 0,
  availableQuantity: 4200, unit: 'm', reorderLevel: 1000, unitCost: 92.5, totalValue: 388500, hsnCode: '5208', gstRate: 5,
  status: 'in-stock', isActive: true, lastMovementAt: new Date().toISOString(), ...over
});

beforeEach(() => {
  jest.clearAllMocks();
  inventoryAPI.getAll.mockResolvedValue({ data: { data: [item(), item({ id: 2, itemName: 'Woven Labels', unitCost: 0, totalValue: 0, quantity: 3000, availableQuantity: 3000, unit: 'pcs' })],
    pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 } } });
  inventoryAPI.getStats.mockResolvedValue({ data: { totalItems: 2, totalValue: 388500, reservedValue: 0, lowStock: 0, outOfStock: 0, missingCost: 1, archived: 0 } });
  inventoryAPI.getCategories.mockResolvedValue({ data: { data: { categories: ['Raw Material'], units: ['m', 'pcs'] } } });
});

const renderPage = () => render(<MemoryRouter><Inventory /></MemoryRouter>);

test('shows value with average cost, and flags items without a cost', async () => {
  renderPage();
  expect(await screen.findByText('Cotton Fabric 60s')).toBeInTheDocument();
  expect(screen.getByText('@ ₹92.50 / m avg')).toBeInTheDocument();
  expect(screen.getByText('No cost')).toBeInTheDocument();
  expect(await screen.findByText(/1 item has stock but no unit cost/)).toBeInTheDocument();
});

test('the missing-cost card filters the list on the server', async () => {
  renderPage();
  await screen.findByText('Cotton Fabric 60s');
  fireEvent.click(screen.getByRole('button', { name: /Missing cost/ }));
  await waitFor(() => expect(inventoryAPI.getAll).toHaveBeenLastCalledWith(expect.objectContaining({ missingCost: 'true' })));
});

test('sorting by stock value asks the server for that order', async () => {
  renderPage();
  await screen.findByText('Cotton Fabric 60s');
  fireEvent.click(screen.getByRole('button', { name: /Stock value/ }));
  await waitFor(() => expect(inventoryAPI.getAll).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'value', dir: 'desc' })));
});

test('archiving goes through the menu after a confirmation', async () => {
  window.confirm = jest.fn(() => true);
  inventoryAPI.archive.mockResolvedValue({ data: { data: item({ isActive: false }) } });
  renderPage();
  await screen.findByText('Cotton Fabric 60s');
  fireEvent.click(screen.getByRole('button', { name: 'More actions for Cotton Fabric 60s' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Archive item' }));
  await waitFor(() => expect(inventoryAPI.archive).toHaveBeenCalledWith(1));
  expect(window.confirm).toHaveBeenCalled();
});
