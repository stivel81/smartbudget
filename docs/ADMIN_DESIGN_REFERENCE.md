# SmartBudget — Admin Panel Design Reference
# Version 1.0 — August 2026
# Stack: Next.js + Vercel

---

## Design Philosophy
- Stripe / Vercel inspired — clean, data-dense, professional
- White & grey base with purple accent (#7c3aed)
- Purple used sparingly — only on key actions and highlights
- System font, tight spacing, high information density

---

## Color Palette
| Role | Color | Usage |
|---|---|---|
| Background | #fafafa | App background |
| Surface | #ffffff | Cards, sidebar, topbar |
| Border | #e5e7eb | All borders and dividers |
| Divider light | #f3f4f6 | Table row dividers |
| Hover | #f9fafb | Row hover, nav hover |
| Primary text | #000000 | Titles, values |
| Secondary text | #6b7280 | Subtitles, labels |
| Muted text | #9ca3af | Table headers, hints |
| Placeholder | #c7c7cc | Empty search text |
| Purple (accent) | #7c3aed | Logo, active nav, buttons, hero metric |
| Purple mid | #8b5cf6 | Hover states on purple |
| Purple dark | #5b21b6 | Gradient end on hero card |
| Purple light | #ede9fe | Badge bg, avatar bg, nav active bg |
| Purple border | #ddd6fe | Badge borders |
| Success | #10b981 | Positive trends |
| Success text | #16a34a | Success status, positive badges |
| Danger | #ef4444 | Negative trends, error status |
| Danger text | #dc2626 | Failed status |
| Warning bg | #fef3c7 | Suspended badge bg |
| Warning text | #d97706 | Suspended badge text |
| Warning border | #fde68a | Suspended badge border |

---

## Typography
| Style | Size | Weight | Color |
|---|---|---|---|
| Page title | 18–20px | 700 | #000 |
| Card title | 12–13px | 600 | #000 |
| Nav item | 12px | 400 active:600 | #6b7280 active:#7c3aed |
| Table value | 12px | 400–500 | #374151 |
| Table header | 10px | 500 uppercase | #9ca3af |
| Metric value | 22–24px | 700 | #000 or #fff on purple |
| Metric label | 10px | 500 uppercase | #6b7280 |
| Badge | 10px | 500 | varies |
| Caption | 10–11px | 400 | #6b7280 |
- Font: -apple-system, BlinkMacSystemFont, 'SF Pro Display'
- Letter spacing: -0.4px on titles, 0.04em on uppercase labels

---

## Layout
```
┌─────────────────────────────────────────┐
│  Topbar (50px height)                   │
├──────────┬──────────────────────────────┤
│ Sidebar  │  Content area               │
│ (175px)  │  padding: 18px              │
│          │                             │
└──────────┴──────────────────────────────┘
```

### Topbar
- Height: 50px
- Background: #ffffff
- Border bottom: 0.5px solid #e5e7eb
- Left: logo icon (26px purple square radius 7px) + "SmartBudget" + "Admin" badge
- Right: search box (180px) + bell icon (with red dot) + avatar (28px purple circle)

### Sidebar
- Width: 175px
- Background: #ffffff
- Border right: 0.5px solid #e5e7eb
- Padding: 14px 0
- Nav item: 12px, padding 7px 12px, border radius 8px, margin 1px 8px
- Active nav: background #ede9fe, color #7c3aed, font weight 600
- Hover nav: background #f9fafb, color #000
- Section labels: 10px uppercase, #9ca3af, padding 0 12px

### Content
- Padding: 18px
- Max width: fluid

---

## Components

### Metric card
- Background: #ffffff
- Border: 0.5px solid #e5e7eb
- Border radius: 12px
- Padding: 14px
- Label: 10px uppercase #6b7280
- Value: 22px weight 700 #000
- Change: 10px with trending icon (green up / red down)

### Metric card (accent / hero)
- Background: #7c3aed (solid) or linear-gradient(135deg, #7c3aed, #5b21b6)
- Label color: rgba(255,255,255,0.7)
- Value color: #ffffff
- Change color: #a7f3d0 (light green on purple)
- Use for: most important metric (revenue)

### Card container
- Background: #ffffff
- Border: 0.5px solid #e5e7eb
- Border radius: 12px
- Overflow: hidden
- Card header: padding 12px 14px, border bottom 0.5px #f3f4f6
  - Title: 12px weight 600 #000
  - Link: 11px #7c3aed weight 500

### Table
- Header row: background #f9fafb, padding 7–8px 14px
- Header text: 10px uppercase #9ca3af letter-spacing 0.04em
- Data row: padding 9–10px 14px, border bottom 0.5px #f9fafb
- Row hover: background #fafafa
- Last row: no border

### User cell
- Avatar: 26px circle, background #ede9fe, font 9px weight 600 color #7c3aed
- Name: 12px weight 500 #000
- Email: 10px #9ca3af

### Badges
| Type | Background | Color | Border |
|---|---|---|---|
| Premium | #ede9fe | #7c3aed | #ddd6fe |
| Free | #f9fafb | #6b7280 | #e5e7eb |
| Suspended | #fef3c7 | #d97706 | #fde68a |
- Padding: 2px 7px, border radius 20px, font 10px weight 500

### Filter buttons
- Default: border 0.5px #e5e7eb, bg #fff, color #6b7280
- Active: bg #7c3aed, color #fff, border #7c3aed
- Border radius: 20px, padding 4px 12px, font 11px weight 500

### Action button (⋮)
- Size: 24x24px, border radius 6px
- Hover: background #f3f4f6
- Icon: 13px #6b7280

### Status indicators
- Success: green dot (#16a34a) + "Success" text #16a34a
- Failed: red dot (#dc2626) + "Failed" text #dc2626
- Dot size: 6x6px circle

### Bar chart
- Bar default: #e5e7eb
- Bar highlight (peak): #7c3aed
- Bar border radius: 4px 4px 0 0
- Chart height: 70px

### Donut chart
- Track: #ede9fe
- Fill: #7c3aed
- Center %: 13px weight 700 #7c3aed
- Center label: 9px #9ca3af

### Usage progress bar
- Height: 3–4px
- Background: #f3f4f6
- Fill: #7c3aed
- On purple card fill: rgba(255,255,255,0.8)
- Border radius: 2px

---

## Screen 1 — Dashboard
Metrics row (4 columns):
1. Monthly revenue → ACCENT CARD (purple gradient) ₪639
2. Total users → 1,284
3. Premium users → 128
4. AI scans today → 847

Charts row (2 columns, 2:1 ratio):
- Bar chart: new users last 7 days (peak bars in purple)
- Donut: free vs premium split (purple fill)

Recent signups table:
- Columns: User | Plan | Scans | Joined
- Shows last 4 signups with badge and avatar

---

## Screen 2 — User Management
Filter row: All | Premium | Free | Suspended + search box (right)

Users table:
- Columns: User | Plan | Scans | Last active | ⋮ actions
- Grid: 2.5fr 1fr 1fr 1fr 0.5fr
- Rows are clickable (hover highlight)
- ⋮ opens dropdown: View, Suspend, Delete

---

## Screen 3 — AI Monitor
Subtitle: "Claude Haiku 4.5 — live usage & costs"

Usage cards (3 columns):
1. Month cost → ACCENT CARD (purple gradient) $28.40 of $50 budget
2. API calls today → 847 of 2,000 daily limit
3. Cost today → $1.69 avg $0.002 per scan

API log table:
- Columns: Time | User | Tokens | Cost | Status
- Grid: 1.2fr 2fr 1fr 1fr 1fr
- Token count: purple text (#7c3aed) to draw attention
- Status: colored dot + text

---

## Navigation
Sidebar items:
- Dashboard (ti-layout-dashboard)
- Users (ti-users)
- AI Monitor (ti-robot) — red dot when errors exist
- Settings (ti-settings)
- Sign out (ti-logout)

Active state: purple bg + purple text
Red notification dot: 6px circle #ef4444, border 1.5px #fff

---

## Notification bell
- Bell icon top right
- Red dot overlay (top-right of icon): 7px circle #ef4444
- Border: 1.5px solid #fff (to separate from topbar bg)
