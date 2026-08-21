import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, NavigationProp } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logout as logoutApi } from './lib/api';

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
  userEmail: string | null;
  setUserEmail: (email: string | null) => void;
  logout: () => Promise<void>;
}

export const AuthContext = React.createContext<AuthContextType>({
  isAuthenticated: false,
  setIsAuthenticated: () => {},
  accessToken: null,
  setAccessToken: () => {},
  userEmail: null,
  setUserEmail: () => {},
  logout: async () => {},
});

const STORAGE_KEY_TOKEN = '@smartbudget/accessToken';
const STORAGE_KEY_EMAIL = '@smartbudget/userEmail';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  // Restore a persisted session once on launch, so the app doesn't drop
  // back to the login screen every time it's closed and reopened.
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedEmail] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_TOKEN),
          AsyncStorage.getItem(STORAGE_KEY_EMAIL),
        ]);
        if (storedToken) {
          setAccessToken(storedToken);
          setUserEmail(storedEmail);
          setIsAuthenticated(true);
        }
      } finally {
        setIsRestoring(false);
      }
    })();
  }, []);

  // Keep storage in sync with auth state. Skipped until the initial restore
  // finishes, so it can't race and immediately erase what was just loaded.
  useEffect(() => {
    if (isRestoring) return;
    if (accessToken) {
      AsyncStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
    } else {
      AsyncStorage.removeItem(STORAGE_KEY_TOKEN);
    }
  }, [accessToken, isRestoring]);

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
