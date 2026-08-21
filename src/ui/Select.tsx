import { forwardRef, type SelectHTMLAttributes } from "react";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className = "", children, ...props },
  ref
) {
  const control = (
    <select
      ref={ref}
      id={id}
      className={`eg-select ${error ? "is-invalid" : ""} ${className}`.trim()}
      aria-invalid={!!error}
      aria-describedby={error || hint ? `${id}-help` : undefined}
      {...props}
    >
      {children}
    </select>
  );

  if (!label && !hint && !error) return control;
  return (
    <label className="eg-field" htmlFor={id}>
      {/* `title`: donde el layout recorta el texto con puntos suspensivos, el
          contenido completo sigue disponible en el tooltip nativo. */}
      {label && <span className="eg-field__label" title={label}>{label}</span>}
      {control}
      {(error || hint) && (
        <span id={`${id}-help`} className={`eg-field__help${error ? " is-error" : ""}`} title={error || hint}>
          {error || hint}
        </span>
      )}
    </label>
  );
});

export default Select;
