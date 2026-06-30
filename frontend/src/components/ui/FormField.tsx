import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

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

export function FormSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="form-select-wrap">
      <select className="form-control form-control--select" {...props} />
    </div>
  );
}

export function FormDateInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const { className = '', ...rest } = props;
  return (
    <div className="form-date-wrap">
      <input
        type="date"
        className={`form-control form-control--date ${className}`.trim()}
        {...rest}
      />
    </div>
  );
}

export function FormTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="form-control form-control--textarea" {...props} />;
}
