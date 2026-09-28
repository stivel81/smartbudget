# SmartBudget — UI Design Reference (Apple Style)
# Version 2.0 — August 2026

---

## Design Philosophy
- Apple Human Interface Guidelines (HIG)
- Clean, minimal, white/grey palette
- No heavy colors — let content breathe
- System fonts and iOS-native feel
- Black as the only accent color

---

## Color Palette
| Role | Color | Usage |
|---|---|---|
| Background | #f2f2f7 | App background, all screens |
| Surface | #ffffff | Cards, inputs, nav bar |
| Primary text | #000000 | Titles, amounts, labels |
| Secondary text | #8e8e93 | Subtitles, hints, dates |
| Placeholder | #c7c7cc | Empty input text |
| Border | #e5e5ea | Dividers, input borders |
| Hero card | #000000 | Dashboard balance card bg |
| Button | #000000 | Primary action button |
| Button text | #ffffff | Text on black buttons |
| Success (green) | #30d158 | Budget bars under 70% |
| Warning (amber) | #ff9f0a | Budget bars 70–89% |
| Danger (red) | #ff3b30 | Budget bars 90%+ |
| Alert bg | #fff3cd | Warning banner background |
| Alert border | #ffd60a | Warning banner border |

---

## Typography
| Style | Size | Weight | Color |
|---|---|---|---|
| Screen title | 20px | 700 | #000 |
| Hero amount | 34px | 700 | #fff (on black card) |
| Card title | 15px | 600 | #000 |
| Body | 13–14px | 400 | #000 |
| Label | 12px | 500 | #8e8e93 (uppercase) |
| Caption | 11px | 400 | #8e8e93 |
| Tiny | 10px | 400 | #c7c7cc |
- Font: -apple-system, BlinkMacSystemFont, 'SF Pro Display'

---

## Spacing & Radius
| Element | Border radius |
|---|---|
| Cards | 14px |
| Inputs | 10px |
| Buttons | 12px |
| Category icons | 8–10px |
| Bottom nav | 0 (full width) |
| Screen corners | 44px (device frame) |
- Screen padding: 16px horizontal
- Card gap: 8px
- Section margin: 12px

---

## Components

### Input field
- Height: 46px
- Background: #f2f2f7
- Border: none
- Border radius: 10px
- Padding: 0 14px
- Placeholder color: #c7c7cc
- Show/hide toggle icon on password fields

### Primary button
- Height: 50px
- Background: #000000
- Border radius: 12px
- Font: 15px, weight 600, color #fff
- Full width

### Category icon
- Size: 30–34px square
- Background: #f2f2f7
- Icon color: #000000
- Border radius: 8–10px

### Budget progress bar
- Height: 4px
- Background: #f2f2f7
- Fill color: green / amber / red based on threshold
- Border radius: 2px

### Bottom navigation
- Background: rgba(255,255,255,0.95)
- Backdrop blur: 10px
- Border top: 0.5px solid #e5e5ea
- Padding bottom: 20px (safe area)
- Active: #000, Inactive: #c7c7cc

---

## Screen 1 — Login
No bottom navigation.
Layout (top to bottom):
- iOS status bar (white bg, black icons)
- Logo area:
  - Icon: 52x52px black square (radius 14px), white wallet icon
  - Title: "Welcome back" — 26px, weight 700
  - Subtitle: "Sign in to SmartBudget" — 14px, #8e8e93
- Email input field
- Password input field (with show/hide toggle)
- Forgot password link — right aligned, 12px, black, weight 500
- Sign in button (black, full width)
- ~~Divider: "OR" with lines~~ / ~~Social row: Google | Apple~~ — removed: social sign-in is out of scope for Phase 1
- Footer: "No account? Sign up" — 12px, link in black bold
- Page background: white (#ffffff), so the #f2f2f7 input fields stand out

---

## Screen 2 — Sign up
No bottom navigation.
Layout (top to bottom):
- iOS status bar
- Logo area:
  - Same icon as login
  - Title: "Create account"
  - Subtitle: "Start tracking your budget"
- Name row: First name | Last name (2 equal columns, 10px gap)
- Email input field
- Password input field with strength indicator:
  - 4 bars below the field
  - Filled bars: #30d158
  - Empty bars: #e5e5ea
  - Label: "Strong" in #30d158 at 10px
- Create account button (black, full width)
- ~~Divider: "OR"~~ / ~~Social row: Google | Apple~~ — removed: social sign-in is out of scope for Phase 1
- Footer: "Have an account? Sign in"
- Terms: 10px, #c7c7cc — "By continuing you agree to our Terms & Privacy Policy"

---

## Screen 3 — Dashboard
Layout (top to bottom):
- iOS status bar (white)
- Header (white bg):
  - Greeting: "Good morning, [name]" — 12px, #8e8e93
  - Title: "My Finances" — 20px, weight 700
  - Avatar: 34px circle, #f2f2f7 bg, initials in black
- Hero card (black bg, radius 20px, margin 12px):
  - Label: "SPENT THIS MONTH" — 11px uppercase, white 50% opacity
  - Amount: ₪2,847 — 34px, weight 700, white
  - Subtitle: "of ₪4,200 budget" — 12px, white 40% opacity
  - Stats row (3 equal cols, white 8% bg, radius 10px):
    - This week amount | Receipt count | Budget % used
- Categories section (2-column grid):
  - Each card: white bg, radius 14px
  - Icon (30px, #f2f2f7 bg) + name + amount + progress bar
- Recent section:
  - White card, radius 14px
  - Each row: icon + merchant + date | amount (right)
  - Divider: 0.5px #f2f2f7 between rows
- Bottom navigation (4 tabs: Home | Scan | Budget | Profile)

---

## Screen 4 — Receipt Scanner
Full screen camera — dark theme.
Layout (top to bottom):
- iOS status bar (black bg, white icons)
- Top bar (black):
  - Title: "Scan Receipt" — 16px, weight 600, white
  - Cancel button — right, 13px, white 60% opacity
- Camera viewfinder (black bg, fills most of screen):
  - White corner guides (22px, 2px border)
  - Animated scan line: white 40% opacity, moves top to bottom loop
  - Hint text: "Align receipt within the frame" — 12px, white 40% opacity
- Camera controls row (dark bg):
  - Left: gallery icon (42px circle, white 8% bg)
  - Center: capture button (64px circle, WHITE bg, black camera icon)
  - Right: flash icon (42px circle, white 8% bg)
- AI result card (white, slides up, radius 20px top only):
  - Drag pill: 36px wide, 4px tall, #e5e5ea
  - Header: sparkles icon + "AI Extracted" — 14px, weight 600
  - Rows: Merchant | Category | Date | Total
  - Save Receipt button (black, full width, radius 12px)

---

## Screen 5 — Budget Limits
Layout (top to bottom):
- iOS status bar (white)
- Header (white bg):
  - Month: "August 2026" — 12px, #8e8e93
  - Title: "Budget" — 20px, weight 700
  - Add button: 30px circle, #f2f2f7 bg, black plus icon
- Alert banner (when any category > 90%):
  - Background: #fff3cd, border: #ffd60a
  - Warning icon (orange) + alert text
  - Radius: 12px, margin: 12px
- Budget cards list (margin 12px, gap 8px):
  - Each card: white bg, radius 14px, padding 12px 14px
  - Top row: icon + name + spent/limit | percentage
  - Progress bar: 4px height, radius 2px
  - Color rules:
    - Under 70% → #30d158 (green)
    - 70–89% → #ff9f0a (amber)
    - 90%+ → #ff3b30 (red)
- Bottom navigation (Budget tab active)

---

## Alert Thresholds
- 80% → push notification sent
- 90% → amber banner appears in app
- 100% → red banner + push notification

---

## Sample Data (for dev/testing)
- User: Adrian S.
- Monthly spend: ₪2,847
- Total budget: ₪4,200 (68% used)
- Week spend: ₪340
- Receipt count: 23
- Recent merchants: Rami Levy, Café Aroma, Rav-Kav

## Categories
| Name | Icon | Spent | Limit | % |
|---|---|---|---|---|
| Groceries | shopping-cart | ₪820 | ₪1,000 | 82% |
| Dining | tools-kitchen-2 | ₪368 | ₪400 | 92% |
| Transport | bus | ₪210 | ₪300 | 70% |
| Entertainment | device-tv | ₪180 | ₪500 | 36% |
| Health | heart | ₪95 | ₪300 | 32% |

---

## Navigation Flow
Unauthenticated:
  Login ↔ Sign up
  Login → Forgot password (email → 6-digit code + new password → signed in)

Authenticated (bottom nav):
  Home (Dashboard) | Scan (Scanner) | Budget | Profile
