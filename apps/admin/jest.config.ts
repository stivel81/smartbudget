import type { Config } from 'jest';
import nextJest from 'next/jest.js';

// next/jest wires up the Next.js SWC transform, loads next.config.js and
// .env files, and ignores node_modules/.next — see
// node_modules/next/dist/docs/01-app/02-guides/testing/jest.md.
const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jsdom',
  coverageProvider: 'v8',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}'],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    // Root <html>/<body> server layout — nothing to unit test.
    '!app/layout.tsx',
  ],
  coverageReporters: ['text', 'text-summary', 'lcov'],
};

export default createJestConfig(config);
