import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

export const ChevronRight: React.FC<IconProps> = ({ className, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="currentColor"
    className={className}
  >
    <path d="M6 4l4 4-4 4V4z" />
  </svg>
);

export const ChevronDown: React.FC<IconProps> = ({ className, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="currentColor"
    className={className}
  >
    <path d="M4 6l4 4 4-4H4z" />
  </svg>
);

export const Dot: React.FC<IconProps> = ({ className, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="currentColor"
    className={className}
  >
    <circle cx="8" cy="8" r="3" />
  </svg>
);

export const Diamond: React.FC<IconProps> = ({ className, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="currentColor"
    className={className}
  >
    <path d="M8 2l4 6-4 6-4-6 4-6z" />
  </svg>
);
