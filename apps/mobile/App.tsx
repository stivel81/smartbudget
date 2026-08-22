import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, NavigationProp } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logout as logoutApi, refreshSession as refreshSessionApi } from './lib/api';

// Import screens
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import DashboardScreen from './screens/DashboardScreen';
import ScanScreen from './screens/ScanScreen';
import BudgetScreen from './screens/BudgetScreen';
import ProfileScreen from './screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Main: undefined;
};

function BottomTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#1D9E75',
        tabBarInactiveTintColor: '#9ca3af',
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          title: 'Scan Receipt',
          tabBarLabel: 'Scan',
        }}
      />
      <Tab.Screen
        name="Budget"
        component={BudgetScreen}
        options={{
          title: 'Budget',
          tabBarLabel: 'Budget',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
}

export interface AuthContextType {
  isAuthenticated: boolean;
  setIsAuthenticated: (value: boolean) => void;
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  refreshToken: string | null;
  setRefreshToken: (token: string | null) => void;
  userEmail: string | null;
  setUserEmail: (email: string | null) => void;
  logout: () => Promise<void>;
}

export const AuthContext = React.createContext<AuthContextType>({
  isAuthenticated: false,
  setIsAuthenticated: () => {},
  accessToken: null,
  setAccessToken: () => {},
  refreshToken: null,
  setRefreshToken: () => {},
  userEmail: null,
  setUserEmail: () => {},
  logout: async () => {},
});

// Mobile never talks to Supabase directly — access tokens are exchanged
// for a new session via POST /api/v1/auth/refresh (see lib/api.ts). Only
// the long-lived refresh token (and email) are persisted; the access
// token lives in memory only and is re-derived by refreshing on launch,
// so a session restored from storage is never stale.
const STORAGE_KEY_REFRESH_TOKEN = '@smartbudget/refreshToken';
const STORAGE_KEY_EMAIL = '@smartbudget/userEmail';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

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
        setUserEmail(session.user.email);
        setIsAuthenticated(true);
      } catch {
        // Stored refresh token is invalid/expired/revoked — stay logged
        // out and clear it so future launches don't keep retrying it.
        await AsyncStorage.multiRemove([STORAGE_KEY_REFRESH_TOKEN, STORAGE_KEY_EMAIL]);
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

  const logout = async () => {
    if (accessToken) {
      try {
        await logoutApi(accessToken);
      } catch {
        // Best-effort — the token may already be expired/revoked server-side.
        // Clear the local session regardless.
      }
    }
    setAccessToken(null);
    setRefreshToken(null);
    setUserEmail(null);
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
              </Stack.Group>
            ) : (
              // Main App Stack
              <Stack.Screen
                name="Main"
                component={BottomTabNavigator}
              />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </AuthContext.Provider>
      <StatusBar style="auto" />
    </View>
  );
}
