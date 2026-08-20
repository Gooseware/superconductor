# Design OS Kernel Dogma

This document defines the core standards for components included in the `superconductor-kernel`.

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

## UI Layer Hit-Testing Dogma
- Floating overlays, fixed toolbars, HUDs, and modal views must explicitly configure pointer event hit-testing (`pointer-events: auto;`, `HitTestBehavior.opaque`, `.allowsHitTesting(true)`, `Modifier.pointerInput`, `mouse_filter = STOP`) so interactive subcomponents remain clickable and do not swallow background events unintentionally.
- Automated tests must verify pointer/touch interactions against overlay subcomponents.
