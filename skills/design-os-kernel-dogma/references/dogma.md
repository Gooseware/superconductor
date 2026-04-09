# Design OS Kernel Dogma

This document defines the core standards for components included in the `design-os-kernel`.

## Export Requirements
- Components MUST be exported using named exports.
- `export { ComponentName };` at the end of the file is a valid pattern.
- `export function ComponentName(...) { ... }` is the preferred pattern.

## Styling Rules
- **No Inline Styles:** Do NOT use the `style` prop for layout or colors.
- **Tailwind CSS:** Use Tailwind classes for all styling.
- **Design Tokens:** Utilize `design-os` theme tokens via Tailwind classes (e.g., `bg-primary`, `rounded-radius`).

## SSR & Safety
- Components must be SSR-safe.
- Avoid direct DOM manipulation.
- Use `useEffect` for client-only logic.

## Reusability
- Components should be "atoms", "molecules", or "organisms".
- Props should be used for customization (e.g., `className`, `children`, `...props`).

## Skeleton Support
- Complex components (using `.map()` or having many JSX elements) MUST export a `Skeleton` component alongside the main component.
