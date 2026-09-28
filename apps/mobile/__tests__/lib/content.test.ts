import fs from 'fs';
import path from 'path';
import {
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_STATUS,
  PRIVACY_POLICY_TITLE,
} from '../../lib/content/privacyPolicy';
import { FAQ_ITEMS, HELP_TITLE } from '../../lib/content/helpFaq';
import { ALERT_THRESHOLD_PCT, DANGER_THRESHOLD_PCT } from '../../lib/theme';

const policyText = PRIVACY_POLICY_SECTIONS.flatMap((s) => [s.heading, ...s.paragraphs]).join('\n');

describe('lib/content/privacyPolicy', () => {
  it('is clearly marked as a draft pending legal review', () => {
    expect(PRIVACY_POLICY_TITLE).toBe('Privacy Policy');
    expect(PRIVACY_POLICY_STATUS).toBe('Draft — pending legal review');
  });

  it('has a real "last updated" date', () => {
    expect(Number.isNaN(Date.parse(PRIVACY_POLICY_LAST_UPDATED))).toBe(false);
  });

  it('has non-empty, uniquely-headed sections', () => {
    expect(PRIVACY_POLICY_SECTIONS.length).toBeGreaterThan(3);
    const headings = PRIVACY_POLICY_SECTIONS.map((s) => s.heading);
    expect(new Set(headings).size).toBe(headings.length);
    for (const section of PRIVACY_POLICY_SECTIONS) {
      expect(section.heading.trim()).not.toBe('');
      expect(section.paragraphs.length).toBeGreaterThan(0);
      section.paragraphs.forEach((p) => expect(p.trim()).not.toBe(''));
    }
  });

  it.each([
    ['email/password auth via Supabase', /Supabase Auth/],
    ['receipt photos stored in Supabase Storage', /Supabase Storage/],
    ["photos sent to Anthropic's Claude API", /Anthropic's Claude API/],
    ['via our server, never directly from the app', /never sends it to any third party directly/],
    ['data in Supabase PostgreSQL', /PostgreSQL/],
    ['row-level security', /[Rr]ow-level security/],
    ['no ads or tracking SDKs', /no advertising, and no analytics or tracking SDKs/],
    ['export on request', /Export:.*request/],
    ['deletion on request', /Deletion:.*request/],
    ['requests processed by an administrator', /processed by an administrator/],
    ['contact via support', /Contact support/],
    ['IP logged for rate limiting', /IP address/],
    ['token kept on device', /On your device/],
  ])('discloses: %s', (_label, pattern) => {
    expect(policyText).toMatch(pattern);
  });

  it('does not offer self-service account deletion (right-to-erasure is admin-only)', () => {
    expect(policyText).not.toMatch(/delete your account (in|from) (the app|Settings)/i);
  });

  describe('the "no ads / tracking SDKs" claim matches the mobile dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const TRACKING = /analytics|segment|amplitude|mixpanel|firebase|sentry|bugsnag|appsflyer|adjust|branch|facebook|admob|ads|tracking|posthog|datadog/i;

    it('reads the dependency list', () => {
      expect(deps).toContain('expo');
    });

    it('has no analytics / ads / tracking packages', () => {
      expect(deps.filter((d) => TRACKING.test(d))).toEqual([]);
    });
  });
});

describe('lib/content/helpFaq', () => {
  const byId = Object.fromEntries(FAQ_ITEMS.map((i) => [i.id, i]));

  it('has a title and unique ids', () => {
    expect(HELP_TITLE).toBe('Help & Support');
    expect(new Set(FAQ_ITEMS.map((i) => i.id)).size).toBe(FAQ_ITEMS.length);
  });

  it.each(['scanning', 'scan-failed', 'budgets', 'password', 'data-requests'])('covers %s', (id) => {
    expect(byId[id]).toBeDefined();
    expect(byId[id].question.trim()).not.toBe('');
    expect(byId[id].answer.trim()).not.toBe('');
  });

  it('explains scanning goes through Claude via our server', () => {
    expect(byId.scanning.answer).toMatch(/Claude/);
    expect(byId.scanning.answer).toMatch(/server/);
  });

  it('states the banner thresholds from the same constants the Budget screen uses', () => {
    expect(ALERT_THRESHOLD_PCT).toBe(90);
    expect(DANGER_THRESHOLD_PCT).toBe(100);
    expect(byId.budgets.answer).toContain(`${ALERT_THRESHOLD_PCT}% of its limit an amber banner`);
    expect(byId.budgets.answer).toContain(`${DANGER_THRESHOLD_PCT}% or more the banner turns red`);
  });

  it('covers both password paths (Settings when signed in, emailed code when signed out)', () => {
    expect(byId.password.answer).toMatch(/Settings/);
    expect(byId.password.answer).toMatch(/6-digit code/);
  });

  it('routes export/deletion through support (admin-processed), not self-service', () => {
    expect(byId['data-requests'].answer).toMatch(/Contact support/);
    expect(byId['data-requests'].answer).toMatch(/administrator/);
  });
});
