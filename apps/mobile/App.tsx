import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, NavigationProp } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { logout as logoutApi, refreshSession as refreshSessionApi } from './lib/api';
import { COLORS } from './lib/theme';
import { AuthContext } from './lib/auth';

// Import screens
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import DashboardScreen from './screens/DashboardScreen';
import ScanScreen from './screens/ScanScreen';
import BudgetScreen from './screens/BudgetScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import HelpSupportScreen from './screens/HelpSupportScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: { email?: string } | undefined;
  Main: undefined;
};

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
                <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen as any} />
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
