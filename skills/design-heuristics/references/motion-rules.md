# StyleSeed Motion Rules Reference

This document defines the animation seeds, timing guidelines, physics parameters, and accessibility requirements to ensure smooth, professional, and performance-optimized micro-interactions.

---

## 1. The Five Animation Seeds

StyleSeed defines exactly five distinct animation seeds, each with a unique visual "vibe" and specific use cases. 

| Seed | Vibe Description | Recommended Use Cases |
| :--- | :--- | :--- |
| **Spring** | Bouncy, energetic, playful | Primary buttons, success screens, task completion, notifications. |
| **Silk** | Smooth, elegant, continuous | Editorial pages, financial dashboards, page transitions, modal entries. |
| **Snap** | Snappy, instant, precise, decisive | Dropdowns, keyboard navigation, popovers, power tools. |
| **Float** | Weightless, gentle, drifting | Hero landing assets, marketing surfaces, ambient status widgets. |
| **Pulse** | Rhythmic, pulsing, repeating | Alert signals, active network connection dots, notifications. |

---

## 2. Spring Physics Parameters

Spring animations must not use arbitrary cubic-bezier or ease curves; they MUST be calculated using physical mass, stiffness, and damping to feel natural:

```js
// Reference Spring Config (Framer Motion / Spring-Physics)
const springConfig = {
  type: "spring",
  stiffness: 380, // High responsiveness
  damping: 30,    // Controlled bounce
  mass: 1         // Default mass
};
```

### 2.1 CSS Custom Property Presets

For pure CSS implementations, use the following timing and transition-property definitions:

```css
:root {
  /* Spring physics simulation equivalent */
  --transition-spring: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  
  /* Smooth / Silk transition */
  --transition-silk: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  
  /* Snappy / Instant transition */
  --transition-snap: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
```

---

## 3. Contextual Animation Rules

Animations are classified into five operational contexts, which determine the target properties and timing.

### 3.1 Entrance & Exit
- **Entrance:** Mount animations must fade and scale or slide in simultaneously. Maximum duration is `200ms` (spring) or `300ms` (silk).
- **Exit:** Unmount animations must fade out cleanly with a simpler ease-out curve, ensuring the UI remains responsive.

```tsx
// Framer Motion example for popover
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.15, ease: "easeOut" }}
/>
```

### 3.2 Hover & Press (Tactile Feedback)
- **Hover:** Limit card vertical translation (lift) to exactly `2px`.
- **Press (Tap):** Scale interactive elements (buttons, selectors) down to exactly `0.98` (98% scale) to simulate a physical button depress. Never scale below `0.95`.

```tsx
// CSS Hover & Active Pattern
.btn-interactive {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.btn-interactive:hover {
  transform: translateY(-2px);
}
.btn-interactive:active {
  transform: scale(0.98);
}
```

---

## 4. Non-Negotiable Motion Anti-Rules

To maintain visual integrity and performance, all motion implementations MUST respect these overriding principles:

### 4.1 One Seed per Product (Brand Default)
Maintain a single primary animation personality across the entire product. Do not mix springy bounces with snappy card movements:
- **Toss, Arc skins:** Default to **Spring**.
- **Stripe, Notion skins:** Default to **Silk**.
- **Linear, Vercel, Raycast skins:** Default to **Snap**.

### 4.2 Never Delay the Payload
Never animate numerical balances, prices, or search results into view. Let the text read immediately. Motion should guide navigation and interaction, not block or delay information consumption.

### 4.3 Respect User Accessibility
Always respect system-level preferences for reduced motion. When active, all scale, translate, and layout transitions must degrade to simple, instant opacity fades:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
