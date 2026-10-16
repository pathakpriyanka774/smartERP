import { render, screen } from '@testing-library/react';
import { renderWidget } from './PageRenderer';
import { builderAPI } from '../services/api';

jest.mock('../services/api', () => ({
  builderAPI: { embedChart: jest.fn(), page: jest.fn() }
}));

const chartWidget = (chartId) => ({ id: 'w1', type: 'savedChart', props: { chartId, title: '', showDescription: true } });
const formWidget = (formKey) => ({ id: 'w2', type: 'form', props: { formKey, title: '' } });

afterEach(() => jest.clearAllMocks());

test('picking a saved chart shows Loading, then the chart — not a crash', async () => {
  builderAPI.embedChart.mockResolvedValue({
    data: { data: { id: 7, title: 'Inventory', type: 'bar', labels: ['A', 'B'],
                    series: [{ name: 'Qty', values: [3, 5] }], options: {} } }
  });

  // Nothing chosen yet, then a chart is picked: the render in between used to
  // read the previous "not loading, no data" state and throw on chart.title.
  const { rerender } = render(renderWidget(chartWidget(null)));
  expect(screen.getByText('Choose a saved chart')).toBeInTheDocument();

  rerender(renderWidget(chartWidget(7)));
  expect(screen.getByText('Loading…')).toBeInTheDocument();
  expect(await screen.findByText('Inventory')).toBeInTheDocument();
  expect(builderAPI.embedChart).toHaveBeenCalledWith(7);
});

test('a deleted chart shows a message instead of failing', async () => {
  builderAPI.embedChart.mockRejectedValue({ response: { status: 404, data: { message: 'Chart not found' } } });
  render(renderWidget(chartWidget(99)));
  expect(await screen.findByText(/no longer available/)).toBeInTheDocument();
});

test('a form widget renders the fields of the chosen Form Builder form', async () => {
  builderAPI.page.mockResolvedValue({
    data: { data: {
      pageKey: 'feedback', kind: 'form', title: 'Feedback', status: 'Active',
      layout: { rows: [{ id: 'r1', columns: [{ id: 'c1', width: 12, widgets: [{
        id: 'w1', type: 'form',
        props: { title: 'Feedback', submitLabel: 'Send', fields: [
          { id: 'f1', label: 'Comments', name: 'comments', type: 'textarea', required: true, options: [] }
        ] }
      }] }] }] }
    } }
  });

  const { rerender } = render(renderWidget(formWidget('')));
  expect(screen.getByText('Choose a form')).toBeInTheDocument();

  rerender(renderWidget(formWidget('feedback')));
  expect(await screen.findByText('Comments')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  expect(builderAPI.page).toHaveBeenCalledWith('feedback');
});

test('an inactive form is not offered for input', async () => {
  builderAPI.page.mockResolvedValue({
    data: { data: { pageKey: 'old', kind: 'form', title: 'Old', status: 'Inactive',
                    layout: { rows: [{ id: 'r', columns: [{ id: 'c', width: 12, widgets: [
                      { id: 'w', type: 'form', props: { fields: [] } }] }] }] } } }
  });
  render(renderWidget(formWidget('old')));
  expect(await screen.findByText('This form is inactive.')).toBeInTheDocument();
});

test('inline fields still render, for Form Builder previews and older pages', () => {
  render(renderWidget({ id: 'w3', type: 'form', props: {
    title: 'Legacy', submitLabel: 'Go',
    fields: [{ id: 'f', label: 'Name', name: 'name', type: 'text', required: false, options: [] }]
  } }));
  expect(screen.getByText('Name')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
});
