import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = () => {
    const Icon = ({ name }: { name: string }) => React.createElement(View, { testID: `icon-${name}` });
    Icon.glyphMap = {};
    return Icon;
  };
  return { Feather: makeIcon(), MaterialCommunityIcons: makeIcon(), FontAwesome: makeIcon() };
});

/** App (and lib/api) loaded fresh with the given env var and __DEV__. */
function loadApp(env: string | undefined, isDev: boolean): React.ComponentType {
  if (env === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = env;
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = isDev;
  let App!: React.ComponentType;
  jest.isolateModules(() => {
    App = require('../App').default;
  });
  return App;
}

describe('App startup with a misconfigured backend URL', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_API_BASE_URL;
  const ORIGINAL_DEV = (globalThis as unknown as { __DEV__: boolean }).__DEV__;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL_ENV;
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = ORIGINAL_DEV;
  });

  it('shows the config error screen (not the login screen) in a production build without the variable', () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const App = loadApp(undefined, false);
    render(<App />);

    expect(screen.getByTestId('config-error-screen')).toBeTruthy();
    expect(screen.getByTestId('config-error-message').props.children).toContain('EXPO_PUBLIC_API_BASE_URL');
    expect(screen.queryByTestId('login-email-input')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the config error screen for an invalid value', () => {
    const App = loadApp('localhost:3000', true);
    render(<App />);
    expect(screen.getByTestId('config-error-message').props.children).toContain('absolute http(s) URL');
  });
});
