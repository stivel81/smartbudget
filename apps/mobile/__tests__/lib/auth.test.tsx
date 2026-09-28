import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import { AuthContext, AuthContextType, useAuth } from '../../lib/auth';

function Probe() {
  const auth = useAuth();
  return <Text testID="probe">{`${auth.isAuthenticated}|${auth.accessToken}|${auth.userEmail}`}</Text>;
}

describe('lib/auth', () => {
  it('useAuth returns the default (signed-out) value without a provider', async () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').props.children).toBe('false|null|null');
  });

  it('default context callbacks are harmless no-ops', async () => {
    let captured!: AuthContextType;
    function Capture() {
      captured = useAuth();
      return null;
    }
    render(<Capture />);
    expect(() => {
      captured.setIsAuthenticated(true);
      captured.setAccessToken('x');
      captured.setRefreshToken('x');
      captured.setUserEmail('x');
    }).not.toThrow();
    await expect(captured.logout()).resolves.toBeUndefined();
  });

  it('useAuth returns the value of the nearest provider', () => {
    const value: AuthContextType = {
      isAuthenticated: true,
      setIsAuthenticated: jest.fn(),
      accessToken: 'tok',
      setAccessToken: jest.fn(),
      refreshToken: 'ref',
      setRefreshToken: jest.fn(),
      userEmail: 'a@b.com',
      setUserEmail: jest.fn(),
      logout: jest.fn(async () => {}),
    };
    render(
      <AuthContext.Provider value={value}>
        <Probe />
      </AuthContext.Provider>
    );
    expect(screen.getByTestId('probe').props.children).toBe('true|tok|a@b.com');
  });

  describe('no require cycle through App.tsx', () => {
    const root = path.join(__dirname, '../..');
    const files = ['screens', 'components', 'lib'].flatMap((dir) => {
      const walk = (d: string): string[] =>
        fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
          const p = path.join(d, e.name);
          if (e.isDirectory()) return walk(p);
          return /\.tsx?$/.test(e.name) ? [p] : [];
        });
      return walk(path.join(root, dir));
    });

    it('scans the screen files', () => {
      expect(files.some((f) => f.includes(`${path.sep}screens${path.sep}`))).toBe(true);
    });

    files.forEach((file) => {
      it(`${path.relative(root, file)} does not import App.tsx`, () => {
        const content = fs.readFileSync(file, 'utf-8');
        expect(content).not.toMatch(/from\s+['"](\.\.\/)+App['"]/);
        expect(content).not.toMatch(/require\(\s*['"](\.\.\/)+App['"]\s*\)/);
      });
    });
  });
});
