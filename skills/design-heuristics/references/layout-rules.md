# StyleSeed Layout & Spacing Rules Reference

This document defines the layout types, card anatomy, spacing values, and visual rhythm constraints required to build structured, clean, and balanced interfaces.

---

## 1. Page Layout Structure

All pages are designed around a strict layout structure with a mobile viewport container:

```
┌──────────────── max-w-[430px] ────────────────┐
│  TopBar (px-6 pt-8 pb-6)                      │
│                                                │
│  ┌─ space-y-6 ─────────────────────────────┐  │
│  │  Hero Card (Type D, mx-6)                │  │
│  │  KPI Grid (Type B, px-6)                  │  │
│  │  Full Card Chart (Type A, mx-6)           │  │
│  │  Carousel Briefings (Type C, px-6)        │  │
│  │  ...                                     │  │
│  │                              ← pb-24     │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  BottomNav (fixed bottom-0)                    │
└────────────────────────────────────────────────┘
```

### 1.1 Spatial Tokens

| Token | Class / Value | Purpose |
| :--- | :--- | :--- |
| **Mobile Width** | `max-w-[430px]` | Defines the boundaries of the viewport (centered on screen). |
| **Section Gap** | `space-y-6` (24px) | The standard spacing between all sections. |
| **Footer Buffer** | `pb-24` (96px) | Scroll buffer at the bottom of pages to clear fixed bottom nav. |
| **Page Margin** | `mx-6` or `px-6` | 24px left/right grid padding matching the internal card padding. |
| **Base Grid** | 8px System | Spacing, margins, and padding MUST align to multiples of 8 (8/16/24/32px). |

---

## 2. The Four Section Types

Every piece of user-facing content (numbers, charts, lists, actions) MUST live inside a card container. Content exposed directly on the `#FAFAFA` page backdrop is strictly forbidden.

### 2.1 Type A: Full Card (Floating)
- **Class:** `mx-6 bg-card rounded-2xl p-6 shadow-card`
- **Visual:** Left/right margins create a floating appearance.
- **Use cases:** Charts, lists, recent activity tables.
- **Rules:** The title sits *inside* the card body.

### 2.2 Type B: Grid Container (Full-Width KPI)
- **Class:** `px-6 grid grid-cols-2 gap-4` (Each child card is: `bg-card rounded-2xl p-6 shadow-card`)
- **Visual:** Grid container has left/right padding so cards feel balanced and full-width.
- **Use cases:** KPI dashboards (typically 2x2 grid of metric cards).

### 2.3 Type C: Carousel (Horizontal Scroll)
- **Class:** `px-6` (Container) and `flex gap-3 overflow-x-auto scrollbar-hide`
- **Visual:** Cards extend past the grid edge. Individual cards have fixed width (`w-[280px] flex-shrink-0`).
- **Use cases:** Briefing cards, alerts, slide selectors.
- **Rules:** The section title sits *outside* the cards (above the scroll region).

### 2.4 Type D: Hero Card (Large Format)
- **Class:** `mx-6 bg-card rounded-2xl p-8 shadow-card relative overflow-hidden`
- **Visual:** More generous padding (`p-8` / 32px) and background watermarks.
- **Use cases:** Primary dashboard metrics, primary account balance.

---

## 3. Spacing & Card Anatomy

### 3.1 Card Spacing (Padding & Margins)
- **Inner Padding:** Standard container cards use exactly `p-6` (24px).
- **Whitespace breathing room:** Containers must maintain a minimum of 24px padding around text.

### 3.2 Title Spacing (Contextual Margin Bottom)
The gap between a title and its card content depends strictly on the element type to maintain grid alignment:

| Element Type | Title Margin Bottom | Spacing | Rationale |
| :--- | :--- | :--- | :--- |
| **List** | `mb-4` | 16px | Lists are dense; keep the label tight. |
| **Donut & Legend** | `mb-4` | 16px | Ensures everything fits without vertical scroll. |
| **Table** | `mb-5` | 20px | Tables need average margin-bottom to breathe. |
| **Chart** | `mb-6` | 24px | Charts have massive visual weight; give them space. |

### 3.3 Card Division (Dividers)
Dividers (`border-t border-surface-muted`) are required when a stats grid follows a chart or table:
- Spacing before divider: `mb-6` (24px)
- Spacing after divider: `pt-5` (20px)
- Divider line color: `#E8E6E1`

---

## 4. Visual Rhythm & Composition

### 4.1 Section Alternation (Rhythm Rule)
Never place the same section layout type consecutively down a page. Alternate different layouts (e.g. Hero Card → KPI Grid → Full Card Chart → Carousel) to prevent monotony.

### 4.2 Chart Alignment and Borders
- **Area Charts:** Height `h-40` (160px). Use negative margin `-mx-2` to align the area boundary closer to the card padding edge.
- **Bar Charts:** Height `h-44` (176px). Use negative margin `-mx-1`.
- **Radii:** Bar charts must round only the top corners (`radius={[8, 8, 0, 0]}`).
- **Ticks/Gridlines:** Hide all Y-axis labels and gridlines. X-axis tick lines should be hidden; labels use `10px #7A7A7A`.
