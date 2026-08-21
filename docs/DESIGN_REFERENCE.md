# SmartBudget — UI Design Reference

## Design decisions
- Brand color: #1D9E75 (teal green)
- Currency: ₪ (Israeli Shekel)
- Border radius: 12px for cards, 10px for items
- Font: system default (San Francisco on iOS)

## Color palette
| Role | Color |
|---|---|
| Primary brand | #1D9E75 |
| Primary dark | #0F6E56 |
| Alert / danger | #EF4444 |
| Warning | #F59E0B |
| Background | #f5f5f7 |
| Card | #ffffff |
| Border | #e5e5e5 |
| Text primary | #1a1a1a |
| Text secondary | #666666 |

## Screen 1 — Login
Layout (top to bottom):
- Status bar
- Logo area: teal square icon (wallet icon) + app name + tagline "Track every shekel effortlessly"
- Email field
- Password field (with show/hide toggle)
- Forgot password link (right aligned, teal)
- Sign in button (teal, full width, 48px height)
- Divider: "or continue with"
- Social buttons row: Google | Apple (side by side)
- Footer: "Don't have an account? Sign up" link

## Screen 2 — Sign up
Layout (top to bottom):
- Status bar
- Logo area: same icon + "Create account" + tagline
- Name row: First name | Last name (2 columns side by side)
- Email field
- Password field with strength indicator (4 bars, green when strong)
- Create account button (teal, full width)
- Divider: "or sign up with"
- Social buttons row: Google | Apple
- Footer: "Already have an account? Sign in" link
- Terms text (small, gray): "By signing up you agree to our Terms of Service and Privacy Policy"

## Auth design rules
- No bottom navigation on auth screens
- Logo icon: 64x64px, border radius 20px, teal background (#1D9E75), white wallet icon
- Input fields: 44px height, border radius 10px, background #fafafa, border #e5e5e5
- Primary button: 48px height, border radius 12px, background #1D9E75
- Password strength bars: 4 bars, filled bars = #1D9E75, empty = #e5e5e5
- Social buttons: equal width, border #e5e5e5, white background
- Google icon color: #EA4335, Apple icon color: #1a1a1a

## Screen 3 — Dashboard
Layout (top to bottom):
- Status bar (system)
- Header: greeting + user avatar (initials)
- Balance card (teal gradient): total spent, week amount, receipt count, budget %
- Category grid (2 columns): icon + name + amount + progress bar
- Recent receipts list: icon + merchant + date + amount
- Bottom nav: Home (active), Scan, Budget, Profile

## Screen 2 — Receipt scanner
Layout (top to bottom):
- Status bar (dark)
- Camera viewfinder: full screen, dark bg, green corner guides, animated scan line
- Camera controls: gallery icon | capture button (teal circle) | flash icon
- AI result card (slides up): merchant, category, date, total extracted by Claude

## Screen 3 — Budget limits
Layout (top to bottom):
- Status bar
- Header: month + title + add button
- Alert banner (amber): warns when category > 90% of limit
- Budget items list: icon + name + spent/limit + percentage + color bar
  - Green bar: under 70%
  - Amber bar: 70–89%
  - Red bar: 90%+

## Bottom navigation (all screens)
4 tabs: Home | Scan | Budget | Profile
Active tab: teal color, inactive: gray

## Category icons & colors
| Category | Icon | Background | Color |
|---|---|---|---|
| Groceries | shopping-cart | #E1F5EE | #0F6E56 |
| Dining | tools-kitchen-2 | #FEF3C7 | #D97706 |
| Transport | bus | #EEF2FF | #4F46E5 |
| Entertainment | device-tv | #FEE2E2 | #DC2626 |
| Health | heart | #F0FDF4 | #16A34A |

## Sample data (use for dev/testing)
- User: Adrian S.
- Monthly spend: ₪2,847
- Budget: ₪4,200 total (68% used)
- Recent merchants: Rami Levy, Café Aroma, Rav-Kav

## Alert thresholds
- 80% → push notification
- 90% → amber banner in app
- 100% → red banner + push notification
