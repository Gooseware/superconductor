import React from 'react';

/**
 * A highly reusable button component using Design-OS tokens via Tailwind.
 * @param {object} props 
 */
export function MockButton({ children, className = '', ...props }) {
  return (
    <button 
      className={`bg-primary rounded-radius p-4 ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
}
