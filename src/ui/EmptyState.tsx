import type { ReactNode } from "react";
import type { IconName } from "./icons";
import Icon from "./icons";

type Props = { title: string; description?: string; icon?: IconName; action?: ReactNode };

export default function EmptyState({ title, description, icon = "rooms", action }: Props) {
  return (
    <div className="eg-empty">
      <span className="eg-empty__icon" aria-hidden="true"><Icon name={icon} size={24} /></span>
      <strong className="eg-empty__title">{title}</strong>
      {description && <p className="eg-empty__description">{description}</p>}
      {action && <div className="eg-empty__action">{action}</div>}
    </div>
  );
}
