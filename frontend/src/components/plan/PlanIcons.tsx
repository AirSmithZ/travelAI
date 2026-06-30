/** 16px 描边图标，对齐 design-taste-frontend：克制、统一尺寸 */

export function IconEdit({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L5.62 12.78a1 1 0 0 1-.447.26l-2.667.89.89-2.667a1 1 0 0 1 .26-.447L11.333 2Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 3.333 12.667 6"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconTrash({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M2.667 4.667h10.666M6.667 7.333v3.334M9.333 7.333v3.334M3.333 4.667l.667 8a1.333 1.333 0 0 0 1.334 1.233h5.332a1.333 1.333 0 0 0 1.334-1.233l.666-8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 4.667V3.333a.667.667 0 0 1 .667-.666h2.666a.667.667 0 0 1 .667.666V4.667"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
