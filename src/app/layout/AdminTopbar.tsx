import Breadcrumb from "../../ui/Breadcrumb";
import Icon from "../../ui/icons";
import AdminUserBar from "./AdminUserBar";
import ChatTopbarButton from "../../components/chat/ChatTopbarButton";

export type Crumb = {
  label: string;
  /** Sin `to` se renderiza como texto plano (última miga). */
  to?: string;
};

type Props = {
  crumbs: Crumb[];
  /** Identidad del usuario. Sin nombre no se dibuja la barra (vitrina de UI). */
  userName?: string;
  userRole?: string;
  /** Solo se muestra en mobile, para abrir el sidebar como drawer. */
  onOpenMenu?: () => void;
};

/**
 * Barra superior compacta (62px): breadcrumb a la izquierda y, a la derecha,
 * la identidad del usuario junto a las acciones (mensajes y notificaciones).
 */
export default function AdminTopbar({ crumbs, userName, userRole, onOpenMenu }: Props) {
  return (
    <header className="eg-topbar">
      {onOpenMenu && (
        <button
          type="button"
          className="eg-topbar__menu"
          onClick={onOpenMenu}
          aria-label="Abrir menú"
        >
          <span className="eg-burger" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      )}

      <Breadcrumb items={crumbs} />

      <div className="eg-topbar__right">
        {userName && <AdminUserBar userName={userName} userRole={userRole} />}

        {/* Se dibuja solo si hay <ChatProvider> arriba. Eso cubre dos casos:
            la vitrina de UI (monta esta misma topbar fuera del panel) y el GM
            con la sección `chat` apagada — AdminLayout no monta el provider,
            así que el globo y su contador desaparecen con él. */}
        <ChatTopbarButton />

        {/* Notificaciones: por ahora es solo el lugar reservado. No hay panel,
            ni contador, ni nada conectado — llega cuando exista el backend. */}
        <button
          type="button"
          className="eg-topbar__action"
          aria-label="Notificaciones"
          title="Notificaciones (próximamente)"
        >
          <Icon name="bell" size={18} />
        </button>
      </div>
    </header>
  );
}
