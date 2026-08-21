import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';

import ProfileScreen from '../../screens/ProfileScreen';
import { AuthContext, AuthContextType } from '../../App';

function renderProfile(overrides: Partial<AuthContextType> = {}) {
  const value: AuthContextType = {
    isAuthenticated: true,
    setIsAuthenticated: () => {},
    accessToken: 'test-token',
    setAccessToken: () => {},
    userEmail: 'adrian@example.com',
    setUserEmail: () => {},
    logout: jest.fn(async () => {}),
    ...overrides,
  };

  return { ...render(
    <AuthContext.Provider value={value}>
      <ProfileScreen />
    </AuthContext.Provider>
  ), value };
}

describe('ProfileScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows the signed-in user's email", () => {
    renderProfile({ userEmail: 'adrian@example.com' });

    expect(screen.getByText('adrian@example.com')).toBeTruthy();
  });

  it('calls auth.logout() when Sign Out is pressed', async () => {
    const { value } = renderProfile();

    fireEvent.press(screen.getByTestId('profile-sign-out-button'));

    await waitFor(() => expect(value.logout).toHaveBeenCalledTimes(1));
  });
});
