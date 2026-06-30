---
name: design-heuristics
description: Codified mathematical and aesthetic visual rules for UI/UX generation. Activate this skill whenever a track involves building frontend views, dashboards, layout components, pages, interfaces, or web designs.
version: 1.0
---

# Design Heuristics

This skill enforces strict, mathematical constraints on AI-generated UIs to prevent aesthetic drift and generic outputs. Follow these core rules precisely.

---

## 1. Color Discipline
1. **No Pure Black:** Never use `#000000` for text or UI elements. Use `#2A2A2A` (minimum 15:1 contrast ratio) for primary copy.
2. **Single Accent:** Restrict the interface to exactly one functional accent color.
3. **5-Level Grayscale:** Support secondary/tertiary elements with a strict 5-level grayscale progression: `#2A2A2A` (primary), `#4A4A4A` (secondary), `#6B6B6B` (placeholder), `#E0E0E0` (border), `#FAFAFA` (background).
4. **Card Contrast:** Establish elevation using background contrast rather than borders (e.g., pure white card `#FFFFFF` on page background `#FAFAFA`).
5. **Box Shadow Constraint:** Box shadows MUST NOT exceed `4%` opacity (`rgba(0, 0, 0, 0.04)`).

---

## 2. Spatial Rhythm & Layout
6. **Alternating Section Heights:** Never repeat the exact same layout height consecutively. Alternate tall and compact heights to create visual pacing.
7. **2:1 Label Ratio:** For numeric metric displays, value font size MUST be at least 2x the label description font size.
8. **Consistent Grid:** Enforce an 8px base grid system for all padding, margins, and layouts.
9. **Stagger Components:** Never align identical card styles next to each other on a dashboard; stagger component types (e.g. alternate a metric count card, chart card, and list card).
10. **Whitespace Breathing:** Maintain a minimum of 24px of outer padding on all container cards.

---

## 3. Information Hierarchy
11. **Contrast Elevation:** Differentiate visual priority using tone contrast rather than border lines.
12. **Single Focus:** Place exactly one primary call-to-action (CTA) button or focal point per screen viewport.
13. **Reading Flow:** Structure page elements to align with standard top-to-bottom, left-to-right scanning patterns.
14. **Progressive Disclosure:** Expose advanced controls only upon explicit user interaction (click/hover).

---

## 4. Interactive Feedback & Motion
15. **Spring Entry:** Entry animations MUST use a 200ms spring physics pattern (rapid onset, soft bounce).
16. **Ease-Out Exit:** Exit transitions MUST use an ease-out timing curve.
17. **Tap Scale:** Pressing/tapping interactive elements MUST scale the item to exactly `0.98`.
18. **Hover Elevation:** Hover states on cards MUST limit vertical translation to `2px` maximum.
19. **Visible Focus:** Ensure focus rings are always highly visible and custom-styled (never default browser outlines).

---

## 5. Accessibility
20. **Contrast Standard:** Ensure all text passes WCAG 2.2 AA standards (minimum 4.5:1 ratio).
21. **Keyboard Playability:** All interactive components MUST be fully operable using keyboard tab/enter keys.
22. **Dual-Signaling:** Never convey semantic meaning using color alone; always pair color with text or an icon.
23. **Tap Targets:** Make all click targets a minimum of 44px by 44px.
24. **Alt Text:** Every non-decorative image MUST have a descriptive alt tag.
25. **Visible Form Labels:** Never hide form labels in placeholders; labels must remain permanently visible.

---

## 6. On-Demand Deep Reference Guides
If a task involves advanced color theory, layout grids, or detailed motion transitions, explicitly load the relevant reference guide:
- For color scales and contrast palettes: [Color Reference](file:///superconductor/skills/design-heuristics/references/color-rules.md)
- For layout structures and stagger patterns: [Layout Reference](file:///superconductor/skills/design-heuristics/references/layout-rules.md)
- For motion physics and CSS animation custom properties: [Motion Reference](file:///superconductor/skills/design-heuristics/references/motion-rules.md)
