import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => localStorage.clear());

test('shows the login form when nobody is signed in', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /sign in to your workspace/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
});
