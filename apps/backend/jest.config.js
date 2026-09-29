module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  // Bind supertest's ephemeral servers to 127.0.0.1 (the address it dials)
  // so they can't share a port with another process's IPv4 listener.
  setupFiles: ['<rootDir>/src/testUtils/supertestLoopback.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
};
