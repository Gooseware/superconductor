# StyleSeed Color Rules Reference

This document defines the mathematical constraints and rules for color usage, ensuring that generated user interfaces maintain a clean, professional, and unified aesthetic.

---

## 1. Core Color Principles

### 1.1 Single Accent for Unity (Scarcity Rule)
- Choose **exactly one** functional accent color (the brand color).
- Use this color **exclusively** for active, selected, or focused states (e.g., active navigation items, selected chart elements, progress bar fills, highlighted icons).
- Keep all other interface elements in **grayscale** to preserve the visual impact of the accent color.

```
✓ Allowed: Active tab icon, selected period toggle, progress fill, primary focus rings.
✗ Forbidden: Large background blocks, body text, general borders, card backdrops.
```

### 1.2 Grayscale Text Hierarchy
Never use pure black (`#000000`) for typography. Instead, use a gentle grayscale progression to establish clear reading priority:

| Role | Hex Value | Contrast Ratio (vs. White Background) | Usage |
| :--- | :--- | :--- | :--- |
| **Strong** | `#2A2A2A` | ~15:1 (WCAG AAA) | Primary values (e.g. `$48.2K`), dashboard KPI values, hero headings. |
| **Primary** | `#3C3C3C` | ~10:1 (WCAG AAA) | Sub-headings, section titles, card labels, primary list text. |
| **Secondary** | `#6A6A6A` | ~5.8:1 (WCAG AA) | Muted labels, chart axes, uppercase category identifiers. |
| **Tertiary** | `#7A7A7A` | ~4.7:1 (WCAG AA) | Annotations, dates, subtext (e.g., "vs last month"). |
| **Disabled** | `#9B9B9B` | ~3.1:1 (WCAG UI) | Inactive tabs, placeholder text, disabled states. |

### 1.3 Depth backgrounds
Use subtle depth contrasts for layout containers rather than pure white page backdrops:

| Background Layer | Hex Value | Description & Intent |
| :--- | :--- | :--- |
| **Page Backdrop** | `#FAFAFA` | Page body background (gives a soft, off-white feel). |
| **Card Container** | `#FFFFFF` | Card interior (stands out against the `#FAFAFA` backdrop). |
| **List Row** | `#FAFAF9` | Muted row background with a subtle warm/beige undertone. |
| **Track / Inactive** | `#E8E6E1` | Muted divider borders, progress tracks, unselected tab fills. |
| **Accent Tint** | `#F0E8FF` | Very light tint of active row backdrops (matches accent color theme). |

---

## 2. Impact & Status Colors

Use urgent or status-related colors **exclusively for small areas** (dots, icons, short status text). Never apply status colors to large container backgrounds.

### 2.1 Muted Status Palette

| Status | Color Hex | Size | Design Rules |
| :--- | :--- | :--- | :--- |
| **Completed / Up** | `#6B9B7A` | Dot: `6px`, Text: `13px` | Muted green (not neon/vivid). Used for positive trend arrows (`+12.4%`). |
| **Urgent / Error** | `#C85A54` | Icon: `16px`, Text: `12px` | Muted crimson. Used for error notices and critical badges. |
| **In Progress** | `#3B82F6` | Dot: `6px`, Text: `11px` | Standard accent blue. Indicates active processing. |
| **Pending / Warn** | `#F59E0B` | Dot: `6px`, Text: `11px` | Muted amber. Represents awaiting state or soft warning. |
| **Notification** | `#FF4444` | Dot: `6px` | Alert dot only. Never repeat across rows. |

### 2.2 Dual-Signaling Requirement
Status indicators MUST pair color with another cue:
- **Same-color dot + same-color text:** e.g., a `#6B9B7A` green dot paired directly with the green text `Completed`.
- Never convey a status difference using color alone (ensures accessibility for color-blind users).

---

## 3. Dark Mode Adaptations

When adapting to dark mode, invert the spatial depth relationship: **cards should be brighter than the page background** (retains source-of-light consistency).

| Layer | Light Mode | Dark Mode | Rationale |
| :--- | :--- | :--- | :--- |
| **Page Backdrop** | `#FAFAFA` | `#0D0D0D` | Darkest surface. |
| **Card Container** | `#FFFFFF` | `#161616` | Slightly lighter to pop forward. |
| **Text Primary** | `#2A2A2A` | `#ECECEC` | High-contrast off-white. |
| **Text Secondary** | `#6A6A6A` | `#8C8C8C` | Muted gray. |
| **Border / Divider** | `#E8E6E1` | `#2D2D2D` | Dark border for isolation. |
