import { render, screen, within } from '@testing-library/react';
import SettingsView from '../../app/views/SettingsView';

jest.mock('../../lib/config', () => ({
  API_BASE_URL: 'https://api.example.com',
  CLAUDE_MONTHLY_BUDGET_USD: 1234.5,
  CLAUDE_DAILY_CALL_LIMIT: 2000,
}));

describe('SettingsView', () => {
  it('lists the current configuration with its env var and makes clear it is read-only', () => {
    render(<SettingsView />);
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText(/Read-only/)).toBeInTheDocument();

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);

    expect(within(rows[0]).getByText('API base URL')).toBeInTheDocument();
    expect(within(rows[0]).getByText('https://api.example.com')).toBeInTheDocument();
    expect(within(rows[0]).getByText('NEXT_PUBLIC_API_BASE_URL')).toBeInTheDocument();

    expect(within(rows[1]).getByText('$1,234.50')).toBeInTheDocument();
    expect(within(rows[1]).getByText('NEXT_PUBLIC_CLAUDE_MONTHLY_BUDGET_USD')).toBeInTheDocument();
    expect(within(rows[1]).getByText(/not enforced/)).toBeInTheDocument();

    expect(within(rows[2]).getByText('2,000')).toBeInTheDocument();
    expect(within(rows[2]).getByText('NEXT_PUBLIC_CLAUDE_DAILY_CALL_LIMIT')).toBeInTheDocument();
    expect(within(rows[2]).getByText(/not enforced/)).toBeInTheDocument();
  });

  it('has no inputs or buttons (nothing pretends to be editable)', () => {
    render(<SettingsView />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
