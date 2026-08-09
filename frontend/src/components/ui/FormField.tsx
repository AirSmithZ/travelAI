import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { DateField, type DateFieldProps } from './DateField';

interface FormSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function FormSection({ title, children, className = '' }: FormSectionProps) {
  return (
    <fieldset className={`form-section ${className}`.trim()}>
      <legend className="form-section__title">{title}</legend>
      <div className="form-section__body">{children}</div>
    </fieldset>
  );
}

interface FormFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, children, className = '' }: FormFieldProps) {
  return (
    <label className={`form-field ${className}`.trim()}>
      <span className="form-field__label">{label}</span>
      {children}
    </label>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="form-row">{children}</div>;
}

export function FormInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="form-control" {...props} />;
}

export function FormNumberInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const { className = '', ...rest } = props;
  return (
    <input
      type="number"
      className={`form-control form-control--number ${className}`.trim()}
      {...rest}
    />
  );
}

export function FormSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="form-select-wrap">
      <select className="form-control form-control--select" {...props} />
    </div>
  );
}

/** Custom calendar date field (replaces native `input[type=date]`). */
export function FormDateInput({
  value = '',
  onChange,
  min,
  max,
  disabled,
  placeholder,
  id,
  className,
  allowClear,
}: DateFieldProps) {
  return (
    <DateField
      id={id}
      className={className}
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      disabled={disabled}
      placeholder={placeholder}
      allowClear={allowClear}
    />
  );
}

export function FormTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="form-control form-control--textarea" {...props} />;
}
