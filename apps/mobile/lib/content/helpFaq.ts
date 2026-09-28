// Help & Support FAQ text. Kept separate from HelpSupportScreen so the copy
// can change without touching UI. Numbers come from the same constants the
// app uses, so the answers can't drift from the behaviour.
import { ALERT_THRESHOLD_PCT, DANGER_THRESHOLD_PCT } from '../theme';

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const HELP_TITLE = 'Help & Support';

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'scanning',
    question: 'How does receipt scanning work?',
    answer:
      "Open the Scan tab and take a photo, or pick one from your gallery. The photo is sent to SmartBudget's server, which uses Anthropic's Claude AI to read the merchant, date, total and line items and sort each item into a category. Check the result card, fix the merchant or total if needed, and tap Save Receipt. Tap Cancel to discard the scan.",
  },
  {
    id: 'scan-failed',
    question: 'Why did my receipt fail to scan?',
    answer:
      'Scans usually fail when the text is hard to read: the photo is blurry, dark or has glare, the receipt is crumpled or cut off, or the image isn\'t a receipt. Lay the receipt flat in good light, fit the whole receipt inside the frame and try again. A lost internet connection or scanning many receipts in a short time can also cause a temporary failure — wait a moment and retry.',
  },
  {
    id: 'budgets',
    question: 'How do budgets and alerts work?',
    answer:
      `On the Budget tab, tap + to set a monthly limit for a category. Spending from this month's receipts counts toward each limit. Progress bars turn from green to amber at 70% and red at 90%. When a category reaches ${ALERT_THRESHOLD_PCT}% of its limit an amber banner appears, and at ${DANGER_THRESHOLD_PCT}% or more the banner turns red.`,
  },
  {
    id: 'password',
    question: 'How do I reset my password?',
    answer:
      'If you are signed in, go to Profile → Settings → Change password. If you are signed out, tap "Forgot password?" on the sign-in screen: we email you a 6-digit code to enter in the app along with your new password.',
  },
  {
    id: 'data-requests',
    question: 'How do I export or delete my data?',
    answer:
      'Tap "Contact support" below and tell us whether you want a copy of your data or want your account deleted, from the email address you use to sign in. An administrator processes the request; deletion removes your profile, receipts, receipt photos and budgets.',
  },
];
