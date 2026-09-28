import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import { AuthContext, AuthContextType, applySession, useAuth } from '../../lib/auth';

function Probe() {
  const auth = useAuth();
  return <Text testID="probe">{`${auth.isAuthenticated}|${auth.accessToken}|${auth.userEmail}|${auth.userName}`}</Text>;
}

describe('lib/auth', () => {
  it('useAuth returns the default (signed-out) value without a provider', async () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').props.children).toBe('false|null|null|null');
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
      captured.setUserName('x');
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
      userName: 'Ada Lovelace',
      setUserName: jest.fn(),
      logout: jest.fn(async () => {}),
    };
    render(
      <AuthContext.Provider value={value}>
        <Probe />
      </AuthContext.Provider>
    );
    expect(screen.getByTestId('probe').props.children).toBe('true|tok|a@b.com|Ada Lovelace');
  });

  describe('applySession', () => {
    function mockAuth(): AuthContextType {
      const calls: string[] = [];
      const record = (name: string) => jest.fn(() => void calls.push(name));
      return {
        isAuthenticated: false,
        setIsAuthenticated: record('setIsAuthenticated'),
        accessToken: null,
        setAccessToken: record('setAccessToken'),
        refreshToken: null,
        setRefreshToken: record('setRefreshToken'),
        userEmail: null,
        setUserEmail: record('setUserEmail'),
        userName: null,
        setUserName: record('setUserName'),
        logout: jest.fn(async () => {}),
        // expose call order for the assertion below
        ...({ calls } as object),
      } as AuthContextType;
    }

    it('stores tokens, email and name, and flips isAuthenticated last', () => {
      const auth = mockAuth();

      applySession(auth, {
        access_token: 'acc',
        refresh_token: 'ref',
        user: { email: 'a@b.com', name: 'Adrian Schtivelmager' },
      });

      expect(auth.setAccessToken).toHaveBeenCalledWith('acc');
      expect(auth.setRefreshToken).toHaveBeenCalledWith('ref');
      expect(auth.setUserEmail).toHaveBeenCalledWith('a@b.com');
      expect(auth.setUserName).toHaveBeenCalledWith('Adrian Schtivelmager');
      expect(auth.setIsAuthenticated).toHaveBeenCalledWith(true);
      const calls = (auth as unknown as { calls: string[] }).calls;
      expect(calls[calls.length - 1]).toBe('setIsAuthenticated');
      expect(calls).toHaveLength(5);
    });

    it.each([
      ['missing', {}],
      ['null', { name: null }],
    ])('stores a null name when it is %s (older backend / no name)', (_label, extra) => {
      const auth = mockAuth();

      applySession(auth, { access_token: 'acc', refresh_token: 'ref', user: { email: 'a@b.com', ...extra } });

      expect(auth.setUserName).toHaveBeenCalledWith(null);
      expect(auth.setIsAuthenticated).toHaveBeenCalledWith(true);
    });
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
