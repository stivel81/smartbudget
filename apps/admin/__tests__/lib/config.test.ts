import { parsePositiveInt, parsePositiveNumber } from '../../lib/config';

const ENV_KEYS = [
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_CLAUDE_MONTHLY_BUDGET_USD',
  'NEXT_PUBLIC_CLAUDE_DAILY_CALL_LIMIT',
] as const;

function loadConfig(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, env);
  let config!: typeof import('../../lib/config');
  jest.isolateModules(() => {
    config = require('../../lib/config');
  });
  ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
  return config;
}

describe('parsePositiveNumber', () => {
  it.each([
    [undefined, 50],
    ['', 50],
    ['   ', 50],
    ['abc', 50],
    ['0', 50],
    ['-5', 50],
    ['Infinity', 50],
    ['75', 75],
    ['12.5', 12.5],
  ])('parses %p → %p', (raw, expected) => {
    expect(parsePositiveNumber(raw, 50)).toBe(expected);
  });
});

describe('parsePositiveInt', () => {
  it.each([
    [undefined, 2000],
    ['500', 500],
    ['12.5', 2000],
    ['-1', 2000],
    ['nope', 2000],
  ])('parses %p → %p', (raw, expected) => {
    expect(parsePositiveInt(raw, 2000)).toBe(expected);
  });
});

describe('config values', () => {
  it('uses the spec sample defaults when env vars are unset', () => {
    const config = loadConfig({});
    expect(config.API_BASE_URL).toBe('http://localhost:3000');
    expect(config.CLAUDE_MONTHLY_BUDGET_USD).toBe(50);
    expect(config.CLAUDE_DAILY_CALL_LIMIT).toBe(2000);
  });

  it('reads overrides from NEXT_PUBLIC_* env vars', () => {
    const config = loadConfig({
      NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com',
      NEXT_PUBLIC_CLAUDE_MONTHLY_BUDGET_USD: '120.5',
      NEXT_PUBLIC_CLAUDE_DAILY_CALL_LIMIT: '5000',
    });
    expect(config.API_BASE_URL).toBe('https://api.example.com');
    expect(config.CLAUDE_MONTHLY_BUDGET_USD).toBe(120.5);
    expect(config.CLAUDE_DAILY_CALL_LIMIT).toBe(5000);
  });

  it('falls back to defaults for invalid values', () => {
    const config = loadConfig({
      NEXT_PUBLIC_API_BASE_URL: '',
      NEXT_PUBLIC_CLAUDE_MONTHLY_BUDGET_USD: 'lots',
      NEXT_PUBLIC_CLAUDE_DAILY_CALL_LIMIT: '0',
    });
    expect(config.API_BASE_URL).toBe('http://localhost:3000');
    expect(config.CLAUDE_MONTHLY_BUDGET_USD).toBe(50);
    expect(config.CLAUDE_DAILY_CALL_LIMIT).toBe(2000);
  });
});
