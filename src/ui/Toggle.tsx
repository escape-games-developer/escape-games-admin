import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  description?: string;
};

export default function Toggle({ label, description, className = "", ...props }: Props) {
  return (
    <label className={`eg-toggle ${className}`.trim()}>
      <input className="eg-toggle__input" type="checkbox" role="switch" {...props} />
      <span className="eg-toggle__track" aria-hidden="true"><span /></span>
      <span className="eg-toggle__copy">
        <span className="eg-toggle__label">{label}</span>
        {description && <span className="eg-toggle__description">{description}</span>}
      </span>
    </label>
  );
}
