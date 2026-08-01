export const SKELETON_STYLES = {
  shimmer: `
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .skeleton-shimmer {
      background: linear-gradient(90deg, var(--muted) 25%, var(--muted-foreground) 50%, var(--muted) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }
  `,
  pulse: `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .5; }
    }
    .skeleton-pulse {
      background: var(--muted);
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
  `
};

export const getSkeletonTemplate = (style: 'shimmer' | 'pulse', className: string) => {
  const animationClass = style === 'shimmer' ? 'skeleton-shimmer' : 'skeleton-pulse';
  return `
export const Skeleton = () => {
  return (
    <div className="${className} ${animationClass} rounded-lg" />
  );
};
`;
};
