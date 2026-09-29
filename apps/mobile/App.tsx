import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { NavigationContainer, NavigationProp } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import {
  logout as logoutApi,
  refreshSession as refreshSessionApi,
  setAccessTokenProvider,
  SESSION_EXPIRED_MESSAGE,
} from './lib/api';
import { COLORS } from './lib/theme';
import { AuthContext } from './lib/auth';
import { createSessionManager, sessionExpiresAtMs, SessionManager, SessionPayload } from './lib/session';
import type { AuthStackParamList, SignedInStackParamList } from './lib/navigation';

// Import screens
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import DashboardScreen from './screens/DashboardScreen';
import ScanScreen from './screens/ScanScreen';
import BudgetScreen from './screens/BudgetScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import HelpSupportScreen from './screens/HelpSupportScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<AuthStackParamList & SignedInStackParamList>();

function BottomTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        // Every tab screen draws its own V2 header (title, greeting/month, actions).
        headerShown: false,
        tabBarActiveTintColor: COLORS.textPrimary,
        tabBarInactiveTintColor: COLORS.placeholder,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          title: 'Scan Receipt',
          tabBarLabel: 'Scan',
          tabBarIcon: ({ color, size }) => (
            <Feather name="camera" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Budget"
        component={BudgetScreen}
        options={{
          title: 'Budget',
          tabBarLabel: 'Budget',
          tabBarIcon: ({ color, size }) => (
            <Feather name="bar-chart-2" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Mobile never talks to Supabase directly — access tokens are exchanged
// for a new session via POST /api/v1/auth/refresh (see lib/api.ts). Only
// the long-lived refresh token (and email, display name) are persisted; the access
// token lives in memory only and is re-derived by refreshing on launch,
// so a session restored from storage is never stale.
const STORAGE_KEY_REFRESH_TOKEN = '@smartbudget/refreshToken';
const STORAGE_KEY_EMAIL = '@smartbudget/userEmail';
const STORAGE_KEY_NAME = '@smartbudget/userName';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  // Keeps the access token valid while the app runs (lib/session.ts): renews
  // it shortly before expiry, on return to the foreground, and on any 401
  // (lib/api.ts retries the request once). Its callbacks only use state
  // setters, which are stable, so one manager serves the App's lifetime.
  const sessionManagerRef = useRef<SessionManager | null>(null);
  if (!sessionManagerRef.current) {
    sessionManagerRef.current = createSessionManager({
      refresh: async (token) => (await refreshSessionApi(token)).session,
      onRefreshed: (session: SessionPayload, sessionExpiresAt: number | null) => {
        setAccessToken(session.access_token);
        // Supabase rotates refresh tokens: the new one is persisted by the
        // storage effect below (the old one no longer works).
        setRefreshToken(session.refresh_token);
        setExpiresAt(sessionExpiresAt);
        setUserEmail(session.user.email);
        // An older backend sends no name — keep the one we have.
        if (session.user.name) setUserName(session.user.name);
      },
      onExpired: () => {
        // The refresh token was rejected: sign out locally (storage effects
        // clear what was persisted) and explain why on the Login screen.
        setAccessToken(null);
        setRefreshToken(null);
        setExpiresAt(null);
        setUserEmail(null);
        setUserName(null);
        setSessionNotice(SESSION_EXPIRED_MESSAGE);
        setIsAuthenticated(false);
      },
    });
  }
  const sessionManager = sessionManagerRef.current;

  // Layout effect for the same reason as the session sync below: lib/api
  // must have its token source before any screen's first load runs.
  useLayoutEffect(() => {
    setAccessTokenProvider(sessionManager);
    const subscription = AppState.addEventListener('change', (state) =>
      sessionManager.handleAppStateChange(state)
    );
    return () => {
      subscription.remove();
      setAccessTokenProvider(null);
      sessionManager.dispose();
    };
  }, [sessionManager]);

  // The manager tracks whatever session the auth state holds — however it
  // got there (login, signup verify, password reset, launch restore, or the
  // manager's own renewal, which it recognizes and ignores). A layout
  // effect: those all run before any passive effect, so a screen's first
  // load (useFocusEffect, a passive effect in a child — which would run
  // before this App's own passive effects) already finds the session here.
  useLayoutEffect(() => {
    sessionManager.setSession(
      accessToken && refreshToken ? { accessToken, refreshToken, expiresAt } : null
    );
  }, [sessionManager, accessToken, refreshToken, expiresAt]);

  // Restore a persisted session once on launch by exchanging the stored
  // refresh token for a fresh access token, so the app doesn't drop back
  // to the login screen every time it's closed and reopened.
  useEffect(() => {
    (async () => {
      try {
        const storedRefreshToken = await AsyncStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);
        if (!storedRefreshToken) return;

        const { session } = await refreshSessionApi(storedRefreshToken);
        setAccessToken(session.access_token);
        setRefreshToken(session.refresh_token);
        setExpiresAt(sessionExpiresAtMs(session));
        setUserEmail(session.user.email);
        // The refreshed session carries the current name; an older backend
        // doesn't send one, so fall back to the name persisted last time.
        setUserName(session.user.name ?? (await AsyncStorage.getItem(STORAGE_KEY_NAME)));
        setIsAuthenticated(true);
      } catch {
        // Stored refresh token is invalid/expired/revoked — stay logged
        // out and clear it so future launches don't keep retrying it.
        await AsyncStorage.multiRemove([STORAGE_KEY_REFRESH_TOKEN, STORAGE_KEY_EMAIL, STORAGE_KEY_NAME]);
      } finally {
        setIsRestoring(false);
      }
    })();
  }, []);

  // Keep storage in sync with auth state. Skipped until the initial restore
  // finishes, so it can't race and immediately erase what was just loaded.
  useEffect(() => {
    if (isRestoring) return;
    if (refreshToken) {
      AsyncStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, refreshToken);
    } else {
      AsyncStorage.removeItem(STORAGE_KEY_REFRESH_TOKEN);
    }
  }, [refreshToken, isRestoring]);

  useEffect(() => {
    if (isRestoring) return;
    if (userEmail) {
      AsyncStorage.setItem(STORAGE_KEY_EMAIL, userEmail);
    } else {
      AsyncStorage.removeItem(STORAGE_KEY_EMAIL);
    }
  }, [userEmail, isRestoring]);

  useEffect(() => {
    if (isRestoring) return;
    if (userName) {
      AsyncStorage.setItem(STORAGE_KEY_NAME, userName);
    } else {
      AsyncStorage.removeItem(STORAGE_KEY_NAME);
    }
  }, [userName, isRestoring]);

  const logout = async () => {
    // Use the manager's tokens: they are the newest (a renewal may have
    // landed after this render). Detach first so no timer/renewal runs
    // during or after sign-out.
    const tokens = sessionManager.getSession() ?? { accessToken, refreshToken };
    sessionManager.setSession(null);
    try {
      // Sends the refresh token too, so the backend revokes the session
      // even when the access token has already expired.
      await logoutApi({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    } catch {
      // Best-effort — the backend logs what it couldn't revoke. Clear the
      // local session regardless.
    }
    setAccessToken(null);
    setRefreshToken(null);
    setExpiresAt(null);
    setUserEmail(null);
    setUserName(null);
    setIsAuthenticated(false);
  };

  if (isRestoring) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <AuthContext.Provider
        value={{
          isAuthenticated,
          setIsAuthenticated,
          accessToken,
          setAccessToken,
          refreshToken,
          setRefreshToken,
          userEmail,
          setUserEmail,
          userName,
          setUserName,
          expiresAt,
          setExpiresAt,
          sessionNotice,
          setSessionNotice,
          logout,
        }}
      >
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
            }}
          >
            {!isAuthenticated ? (
              // Auth Stack
              <Stack.Group>
                <Stack.Screen name="Login" component={LoginScreen as any} />
                <Stack.Screen name="Signup" component={SignupScreen as any} />
                <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen as any} />
                <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen as any} />
              </Stack.Group>
            ) : (
              // Main App Stack: tabs, plus screens pushed from Profile. Each
              // draws its own V2 header with a back button (headerShown: false).
              <Stack.Group>
                <Stack.Screen name="Main" component={BottomTabNavigator} />
                <Stack.Screen name="Settings" component={SettingsScreen} />
                <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
                <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
              </Stack.Group>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </AuthContext.Provider>
      <StatusBar style="auto" />
    </View>
  );
}
