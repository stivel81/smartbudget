// In-app Privacy Policy text. Kept separate from the UI (PrivacyPolicyScreen)
// so it can be replaced wholesale once legal review is done.
//
// DRAFT: written from what the code actually does as of the date below —
// re-check it against the code whenever data handling changes.

export const PRIVACY_POLICY_TITLE = 'Privacy Policy';
export const PRIVACY_POLICY_STATUS = 'Draft — pending legal review';
export const PRIVACY_POLICY_LAST_UPDATED = '28 September 2026';

export interface PolicySection {
  heading: string;
  paragraphs: string[];
}

export const PRIVACY_POLICY_SECTIONS: PolicySection[] = [
  {
    heading: 'About this policy',
    paragraphs: [
      'SmartBudget helps you track spending by photographing receipts. This policy explains what information the app collects, how it is used, who processes it on our behalf, and the choices you have.',
    ],
  },
  {
    heading: 'Information we collect',
    paragraphs: [
      'Account details: your email address, the name you enter when signing up, and your password. Sign-in is handled by Supabase Auth; passwords are stored by Supabase in hashed form, never in plain text.',
      'Receipt photos: the images you take or choose from your photo library when scanning a receipt.',
      'Receipt data: the details extracted from each receipt — merchant, date, total, line items and their spending categories — including any corrections you make.',
      'Budgets: the monthly spending limits you set per category.',
      'Service records: the amount of AI processing used per scan, error details when a scan fails, and the IP address of requests that exceed our rate limits. These are used to run the service, troubleshoot problems and prevent abuse.',
      'On your device: the app stores a sign-in token and your email address so you stay signed in between launches. Signing out removes them.',
    ],
  },
  {
    heading: 'How receipts are processed',
    paragraphs: [
      "When you scan a receipt, the app resizes the photo and sends it to the SmartBudget server. The app never sends it to any third party directly.",
      "Our server sends the image to Anthropic's Claude API, an AI service, to read the receipt and return the extracted details. Anthropic processes the image to provide this service under its own commercial terms.",
      'The photo is then stored in a private Supabase Storage bucket and the extracted details are saved to your account. When you view a receipt image, the app receives a short-lived link to it.',
      'If you press Cancel on the scan result, the receipt and its photo are deleted.',
    ],
  },
  {
    heading: 'Where your data is stored',
    paragraphs: [
      'Your account, receipt data and budgets are stored in a Supabase-hosted PostgreSQL database, and receipt photos in Supabase Storage.',
      'Row-level security is enabled on these tables so that each signed-in user can access only their own records.',
      'A small number of authorised SmartBudget administrators can access account data to provide support — for example to export or delete an account at your request, or to suspend an account that is misusing the service. Administrative actions are recorded in an audit log.',
    ],
  },
  {
    heading: 'Service providers',
    paragraphs: [
      'Supabase — authentication, database and file storage.',
      'Anthropic — AI analysis of receipt images (Claude API).',
      'We do not sell your data. The app contains no advertising, and no analytics or tracking SDKs.',
    ],
  },
  {
    heading: 'Your choices and rights',
    paragraphs: [
      'Export: you can request a copy of your account data (profile, receipts and budgets).',
      'Deletion: you can request deletion of your account, which removes your profile, receipts, receipt photos and budgets.',
      'Export and deletion requests are made through support and are processed by an administrator; we may need to confirm the request comes from the account owner.',
      'You can change your password at any time in Settings, or reset it from the sign-in screen.',
    ],
  },
  {
    heading: 'Retention',
    paragraphs: [
      'We keep your data for as long as your account exists. Receipts you discard are deleted immediately; your profile, receipts, receipt photos, budgets and scan-error records are deleted when your account is deleted.',
      'Rate-limit records are stored by IP address only and are not linked to your account.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'We will update this policy when the way we handle data changes, and revise the "Last updated" date above.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      'Questions, export or deletion requests: use "Contact support" on the Help & Support screen in the app.',
    ],
  },
];
