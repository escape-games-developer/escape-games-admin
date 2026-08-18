import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
};

export default function Card({ children, padding = "md", className = "", ...props }: Props) {
  return (
    <div className={`eg-card eg-card--${padding} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
