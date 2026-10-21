import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Production from './Production';
import { productionAPI } from '../../services/api';

jest.mock('../../services/api', () => ({
  productionAPI: {
    getOrders: jest.fn(), getOrderMaterials: jest.fn(), getStyles: jest.fn(), getSalesOrders: jest.fn(), createOrder: jest.fn()
  },
  qualityAPI: {}
}));
jest.mock('../ProductionPlanning/PlanningDashboard', () => () => <div>Planning board stub</div>);
jest.mock('../QualityManagement/QualityDashboard', () => () => <div>Quality stub</div>);

const order = (over) => ({
  OrderID: 1, OrderCode: 'PRD-00001', ClientName: 'Sample Retail Co', StyleName: 'Basic Cotton T-Shirt', TotalQuantity: 500,
  CompletedQuantity: 120, CompletionPercentage: 24, DeadlineDate: '2026-11-10', DaysRemaining: 20, Priority: 'High',
  OrderStatus: 'InProgress', SalesOrderID: 3, ...over
});

beforeEach(() => {
  jest.clearAllMocks();
  productionAPI.getOrders.mockResolvedValue({ data: { data: [
    order(),
    order({ OrderID: 2, OrderCode: 'PRD-00002', ClientName: 'Urban Wear Ltd', DaysRemaining: -3, DeadlineDate: '2026-10-18', Priority: 'Medium' }),
    order({ OrderID: 3, OrderCode: 'ORD003', ClientName: 'Elite Boutique', DaysRemaining: 10, CompletedQuantity: 0, CompletionPercentage: 0, OrderStatus: 'Pending', SalesOrderID: null }),
    order({ OrderID: 4, OrderCode: 'ORD000', ClientName: 'Done Co', DaysRemaining: 1, OrderStatus: 'Completed', CompletedQuantity: 500, CompletionPercentage: 100 })
  ] } });
  productionAPI.getStyles.mockResolvedValue({ data: { data: [] } });
  productionAPI.getSalesOrders.mockResolvedValue({ data: { data: [] } });
});

const renderPage = () => render(<MemoryRouter><Production /></MemoryRouter>);
const codes = () => screen.getAllByText(/^(PRD|ORD)-?\d+$/).map(e => e.textContent);

test('lists active orders most urgent first: overdue, then nearest deadline', async () => {
  renderPage();
  await screen.findByText('PRD-00002');
  expect(codes()).toEqual(['PRD-00002', 'ORD003', 'PRD-00001']);
  expect(screen.getByText('3 days overdue')).toBeInTheDocument();
});

test('the Overdue card filters the list', async () => {
  renderPage();
  await screen.findByText('PRD-00002');
  fireEvent.click(screen.getByRole('button', { name: /Past the deadline/ }));
  expect(codes()).toEqual(['PRD-00002']);
});

test('completed orders appear under the Completed filter', async () => {
  renderPage();
  await screen.findByText('PRD-00002');
  fireEvent.click(screen.getByRole('button', { name: /^Completed 1$/ }));
  expect(codes()).toEqual(['ORD000']);
});

test('new production order opens in a drawer', async () => {
  renderPage();
  await screen.findByText('PRD-00002');
  fireEvent.click(screen.getByRole('button', { name: '+ New production order' }));
  expect(await screen.findByRole('dialog', { name: 'New production order' })).toBeInTheDocument();
  await waitFor(() => expect(productionAPI.getStyles).toHaveBeenCalled());
});
