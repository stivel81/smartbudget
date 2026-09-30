const path = require('path');

// npm-workspaces monorepo: `next` and friends are hoisted to the repo-root
// node_modules, so tracing (and Turbopack's resolver) must start there or
// the standalone output would miss them.
const monorepoRoot = path.join(__dirname, '../../');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server (.next/standalone) for the Cloud Run image — see
  // apps/admin/Dockerfile. `next dev` / `next start` are unaffected.
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

module.exports = nextConfig;
