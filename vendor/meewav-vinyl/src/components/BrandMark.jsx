import React from 'react';

/**
 * Signature MW redessinée à partir de la petite référence fournie.
 * Aucun agrandissement du PNG : uniquement un tracé SVG modifiable.
 */
export const MW_PATH =
  'M 12 110 ' +
  'C 26 97, 39 61, 54 36 ' +
  'C 59 28, 63 29, 64 41 ' +
  'L 69 92 ' +
  'C 70 101, 73 102, 78 89 ' +
  'L 104 24 ' +
  'C 109 12, 114 15, 117 29 ' +
  'L 131 99 ' +
  'C 133 108, 136 102, 139 91 ' +
  'L 150 51 ' +
  'C 153 41, 158 43, 159 54 ' +
  'L 165 79 ' +
  'C 168 91, 176 89, 183 80 ' +
  'C 197 62, 208 35, 218 10';

export default function BrandMark({ className = '', ...props }) {
  return (
    <svg
      className={className}
      viewBox="0 0 232 126"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d={MW_PATH}
        stroke="currentColor"
        strokeWidth="10.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
