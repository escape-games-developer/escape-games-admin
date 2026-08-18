import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leading, id, className = "", ...props },
  ref
) {
  const input = (
    <div className={`eg-input-wrap${leading ? " has-leading" : ""}`}>
      {leading && <span className="eg-input-leading">{leading}</span>}
      <input
        ref={ref}
        id={id}
        className={`eg-input ${error ? "is-invalid" : ""} ${className}`.trim()}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-help` : undefined}
        {...props}
      />
    </div>
  );

  if (!label && !hint && !error) return input;
  return (
    <label className="eg-field" htmlFor={id}>
      {label && <span className="eg-field__label">{label}</span>}
      {input}
      {(error || hint) && (
        <span id={`${id}-help`} className={`eg-field__help${error ? " is-error" : ""}`}>
          {error || hint}
        </span>
      )}
    </label>
  );
});

export default Input;
