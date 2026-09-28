import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  FilterPill,
  MetricCard,
  ProgressBar,
  StatusDot,
  Td,
  Th,
  pageSubtitleStyle,
  pageTitleStyle,
  tableStyle,
  tableWrapStyle,
} from '../../app/components/ui';
import { COLORS } from '../../lib/theme';

describe('Card', () => {
  it('renders children with the card surface and merges custom style', () => {
    render(
      <Card style={{ marginTop: 7 }}>
        <span>inside</span>
      </Card>
    );
    const card = screen.getByText('inside').parentElement!;
    expect(card).toHaveStyle({ background: COLORS.surface, borderRadius: '12px', marginTop: '7px' });
  });
});

describe('CardHeader', () => {
  it('renders the title without a link button by default', () => {
    render(<CardHeader title="Recent signups" />);
    expect(screen.getByRole('heading', { name: 'Recent signups' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a link button that calls onClick', async () => {
    const onClick = jest.fn();
    render(<CardHeader title="Users" link={{ label: 'View all', onClick }} />);
    await userEvent.click(screen.getByRole('button', { name: 'View all' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Badge', () => {
  it.each([
    ['purple', COLORS.purpleLight, COLORS.purple],
    ['grey', COLORS.hover, COLORS.textSecondary],
    ['warning', COLORS.warningBg, COLORS.warningText],
  ] as const)('renders the %s tone', (tone, bg, color) => {
    render(<Badge label="Label" tone={tone} />);
    expect(screen.getByText('Label')).toHaveStyle({ background: bg, color });
  });
});

describe('Avatar', () => {
  it('uses small type at the default 26px size', () => {
    render(<Avatar label="AB" />);
    expect(screen.getByText('AB')).toHaveStyle({ width: '26px', height: '26px', fontSize: '9px' });
  });

  it('uses larger type above 26px', () => {
    render(<Avatar label="CD" size={28} />);
    expect(screen.getByText('CD')).toHaveStyle({ width: '28px', fontSize: '12px' });
  });
});

describe('MetricCard', () => {
  it('renders label and value on a plain surface', () => {
    render(<MetricCard label="Total users" value="12" />);
    expect(screen.getByText('Total users')).toHaveStyle({ color: COLORS.textSecondary });
    expect(screen.getByText('12')).toHaveStyle({ color: COLORS.textPrimary });
  });

  it('renders the accent (hero) variant with white value text', () => {
    render(<MetricCard label="Spend" value="$1.00" accent />);
    expect(screen.getByText('$1.00')).toHaveStyle({ color: '#ffffff' });
    expect(screen.getByText('Spend')).toHaveStyle({ color: 'rgba(255,255,255,0.7)' });
    // jsdom's CSS parser drops gradient values, so assert the plain surface isn't used.
    expect(screen.getByText('Spend').parentElement).not.toHaveStyle({ background: COLORS.surface });
  });

  it('colours a positive change green and a negative change red', () => {
    const { rerender } = render(<MetricCard label="L" value="1" change={{ label: '+3', positive: true }} />);
    expect(screen.getByText('+3')).toHaveStyle({ color: COLORS.successText });
    rerender(<MetricCard label="L" value="1" change={{ label: '-3', positive: false }} />);
    expect(screen.getByText('-3')).toHaveStyle({ color: COLORS.dangerText });
  });

  it('uses the light-green change colour on the accent variant', () => {
    render(<MetricCard label="L" value="1" accent change={{ label: 'up', positive: false }} />);
    expect(screen.getByText('up')).toHaveStyle({ color: '#a7f3d0' });
  });

});

describe('MetricCard children', () => {
  it('renders children (e.g. a progress bar) below the value', () => {
    render(
      <MetricCard label="L" value="1">
        <span>extra</span>
      </MetricCard>
    );
    expect(screen.getByText('extra')).toBeInTheDocument();
  });
});

describe('ProgressBar', () => {
  it('fills to the given fraction as an accessible progressbar', () => {
    render(<ProgressBar value={0.25} label="Budget used" />);
    const bar = screen.getByRole('progressbar', { name: 'Budget used' });
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveStyle({ height: '4px', background: COLORS.dividerLight });
    expect(bar.firstElementChild).toHaveStyle({ width: '25%', background: COLORS.purple });
  });

  it('clamps to 0–100%', () => {
    const { rerender } = render(<ProgressBar value={3} label="p" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '100%' });
    rerender(<ProgressBar value={-1} label="p" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('uses a translucent white fill on the accent card', () => {
    render(<ProgressBar value={0.5} label="p" onAccent />);
    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ background: 'rgba(255,255,255,0.8)' });
  });
});

describe('StatusDot', () => {
  it('renders Success in green', () => {
    render(<StatusDot status="success" />);
    expect(screen.getByText('Success')).toHaveStyle({ color: COLORS.successText });
  });

  it('renders Failed in red', () => {
    render(<StatusDot status="failed" />);
    expect(screen.getByText('Failed')).toHaveStyle({ color: COLORS.dangerText });
  });
});

describe('FilterPill', () => {
  it('renders the active variant in purple', () => {
    render(<FilterPill label="All" active onClick={() => {}} />);
    const pill = screen.getByRole('button', { name: 'All' });
    expect(pill).toHaveStyle({ background: COLORS.purple, color: '#ffffff' });
    expect(pill).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the inactive variant and calls onClick', async () => {
    const onClick = jest.fn();
    render(<FilterPill label="Admins" active={false} onClick={onClick} />);
    const pill = screen.getByRole('button', { name: 'Admins' });
    expect(pill).toHaveStyle({ background: COLORS.surface, color: COLORS.textSecondary });
    expect(pill).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(pill);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Th / Td', () => {
  function Table({ align, last }: { align?: 'left' | 'right'; last?: boolean }) {
    return (
      <table>
        <thead>
          <tr>
            <Th align={align}>Head</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td align={align} last={last}>
              Cell
            </Td>
          </tr>
        </tbody>
      </table>
    );
  }

  it('defaults to left alignment and a row divider', () => {
    render(<Table />);
    expect(screen.getByText('Head')).toHaveStyle({ textAlign: 'left' });
    expect(screen.getByText('Cell')).toHaveStyle({ textAlign: 'left' });
    expect(screen.getByText('Cell').style.borderBottom).toContain('solid');
  });

  it('supports right alignment and no divider on the last row', () => {
    render(<Table align="right" last />);
    expect(screen.getByText('Head')).toHaveStyle({ textAlign: 'right' });
    expect(screen.getByText('Cell')).toHaveStyle({ textAlign: 'right' });
    expect(screen.getByText('Cell').style.borderBottom).not.toContain('solid');
  });
});

describe('style constants', () => {
  it('exposes table and page title styles', () => {
    expect(tableWrapStyle.overflowX).toBe('auto');
    expect(tableStyle.borderCollapse).toBe('collapse');
    expect(pageTitleStyle.fontWeight).toBe(700);
    expect(pageSubtitleStyle.color).toBe(COLORS.textSecondary);
  });
});
