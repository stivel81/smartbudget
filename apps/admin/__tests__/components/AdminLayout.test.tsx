import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminLayout, { NavItemId } from '../../app/components/AdminLayout';
import { COLORS } from '../../lib/theme';

function renderLayout(overrides: Partial<Parameters<typeof AdminLayout>[0]> = {}) {
  const props = {
    active: 'dashboard' as NavItemId,
    onNavigate: jest.fn(),
    onSearch: jest.fn(),
    onSignOut: jest.fn(),
    userEmail: 'admin@example.com',
    hasScanAlerts: false,
    children: <p>page content</p>,
    ...overrides,
  };
  render(<AdminLayout {...props} />);
  return props;
}

describe('AdminLayout', () => {
  it('renders brand, admin badge, user initials and children', () => {
    renderLayout();
    expect(screen.getByText('SmartBudget')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('AD')).toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it.each([
    ['Dashboard', 'dashboard'],
    ['Users', 'users'],
    ['AI Monitor', 'aiMonitor'],
    ['Audit log', 'auditLog'],
    ['Rate limits', 'rateLimits'],
    ['Settings', 'settings'],
  ])('navigates to %s', async (label, id) => {
    const props = renderLayout();
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(props.onNavigate).toHaveBeenCalledWith(id);
  });

  it('highlights only the active nav item', () => {
    renderLayout({ active: 'users' });
    expect(screen.getByRole('button', { name: 'Users' })).toHaveStyle({ color: COLORS.purple, fontWeight: '600' });
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveStyle({ color: COLORS.textSecondary, fontWeight: '400' });
  });

  it('applies and clears the hover style on inactive items', () => {
    renderLayout();
    const item = screen.getByRole('button', { name: 'Users' });
    fireEvent.mouseEnter(item);
    expect(item).toHaveStyle({ color: COLORS.textPrimary, background: COLORS.hover });
    fireEvent.mouseLeave(item);
    expect(item).toHaveStyle({ color: COLORS.textSecondary });
  });

  it('signs out', async () => {
    const props = renderLayout();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(props.onSignOut).toHaveBeenCalled();
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it('bell navigates to the AI Monitor', async () => {
    const props = renderLayout();
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(props.onNavigate).toHaveBeenCalledWith('aiMonitor');
  });

  describe('scan alert dots', () => {
    it('are hidden when there are no scan alerts', () => {
      renderLayout({ hasScanAlerts: false });
      expect(screen.queryByTestId('bell-alert-dot')).not.toBeInTheDocument();
      expect(screen.queryByTestId('nav-alert-dot-AI Monitor')).not.toBeInTheDocument();
    });

    it('show on the bell and only the AI Monitor nav item when there are alerts', () => {
      renderLayout({ hasScanAlerts: true });
      expect(screen.getByTestId('bell-alert-dot')).toHaveStyle({ background: COLORS.danger });
      expect(screen.getByTestId('nav-alert-dot-AI Monitor')).toHaveStyle({ background: COLORS.danger });
      expect(screen.getAllByTestId(/^nav-alert-dot-/)).toHaveLength(1);
    });

    it('uses the active background for the dot border when AI Monitor is active', () => {
      renderLayout({ hasScanAlerts: true, active: 'aiMonitor' });
      expect(screen.getByTestId('nav-alert-dot-AI Monitor').style.border).toContain('solid');
    });
  });

  describe('topbar search', () => {
    it('hands the trimmed query to onSearch on Enter', async () => {
      const props = renderLayout();
      await userEvent.type(screen.getByPlaceholderText('Search users…'), '  alice  {Enter}');
      expect(props.onSearch).toHaveBeenCalledWith('alice');
    });

    it('ignores Enter on a blank query and other keys', async () => {
      const props = renderLayout();
      const input = screen.getByPlaceholderText('Search users…');
      await userEvent.type(input, '   {Enter}');
      await userEvent.type(input, 'bob');
      expect(props.onSearch).not.toHaveBeenCalled();
    });
  });
});
