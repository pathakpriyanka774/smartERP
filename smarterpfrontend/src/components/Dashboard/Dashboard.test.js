import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { reportsAPI } from '../../services/api';

jest.mock('../../services/api', () => ({ reportsAPI: { getDashboard: jest.fn() } }));

const payload = {
  asOf: '2026-10-09',
  kpis: {
    incomeThisMonth: 150000, incomeLastMonth: 100000, incomeChangePct: 50, expensesThisMonth: 40000,
    openOrders: 7, openOrdersValue: 250000, ordersThisMonth: 3, salesThisMonth: 90000,
    activeProduction: 4, overdueProduction: 1, piecesToday: 320, pendingInspections: 2,
    stockValue: 85625, lowStock: 1, outOfStock: 1, inventoryItems: 5, activeEmployees: 12, presentToday: 10, pendingPayrolls: 3
  },
  lowStockItems: [{ id: 1, itemName: 'Polyester Thread', quantity: 150, reorderLevel: 200, unit: 'spools', status: 'low-stock' }],
  recentActivity: [],
  charts: { monthly: [], orderStatus: [] }
};

const renderIt = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);

test('shows the figures the server returns, not sample numbers', async () => {
  reportsAPI.getDashboard.mockResolvedValue({ data: { data: payload } });
  renderIt();
  expect(await screen.findByText('₹1.50L')).toBeInTheDocument();      // income this month
  expect(screen.getByText('₹85.6k')).toBeInTheDocument();             // stock value
  expect(screen.getByText('7')).toBeInTheDocument();                  // open orders
  expect(screen.getByText('Polyester Thread')).toBeInTheDocument();
  expect(screen.getByText(/1 past deadline/)).toBeInTheDocument();
  expect(screen.queryByText(/245,800/)).not.toBeInTheDocument();      // the old hard-coded figure
});

test('explains a failure and offers a retry', async () => {
  reportsAPI.getDashboard.mockRejectedValueOnce({ response: { data: { message: 'You do not have access to reports' } } });
  renderIt();
  expect(await screen.findByText('You do not have access to reports')).toBeInTheDocument();
  reportsAPI.getDashboard.mockResolvedValue({ data: { data: payload } });
  fireEvent.click(screen.getByRole('button', { name: /try again/i }));
  expect(await screen.findByText('₹1.50L')).toBeInTheDocument();
});
