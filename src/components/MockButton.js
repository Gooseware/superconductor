import React from 'react';
import { useTheme } from 'design-os';

/**
 * A highly reusable button component using Design-OS tokens.
 * @param {object} props 
 */
export const MockButton = ({ children, ...props }) => {
  const { tokens } = useTheme();
  return (
    <button style={{ backgroundColor: tokens.primary, borderRadius: tokens.radius }} {...props}>
      {children}
    </button>
  );
};
