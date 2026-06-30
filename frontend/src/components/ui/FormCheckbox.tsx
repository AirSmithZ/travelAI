import type { InputHTMLAttributes } from 'react';

interface FormCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function FormCheckbox({ label, className = '', id, ...rest }: FormCheckboxProps) {
  return (
    <label className={`form-checkbox ${className}`.trim()} htmlFor={id}>
      <input type="checkbox" className="form-checkbox__input" id={id} {...rest} />
      <span className="form-checkbox__box" aria-hidden="true">
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="form-checkbox__label">{label}</span>
    </label>
  );
}
