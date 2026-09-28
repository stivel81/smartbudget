// Route param lists for the navigators in App.tsx.

// Signed-out stack. VerifyEmail's `sendCode` asks the screen to email a fresh
// code on open (used when an unconfirmed user tries to sign in); after signup
// Supabase has just sent one, so it's omitted.
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: { email?: string } | undefined;
  VerifyEmail: { email: string; sendCode?: boolean };
};

// Routes of the signed-in root stack (App.tsx). Tabs live under "Main";
// Settings / Privacy Policy / Help & Support are pushed over the tabs.
export type SignedInStackParamList = {
  Main: undefined;
  Settings: undefined;
  PrivacyPolicy: undefined;
  HelpSupport: undefined;
};

// Bottom tabs inside "Main".
export type MainTabParamList = {
  Dashboard: undefined;
  Scan: undefined;
  Budget: undefined;
  Profile: undefined;
};
