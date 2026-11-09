import logo from "../../assets/escape-logo.png";
import Icon from "../../ui/icons";
import CalendarView from "../../components/calendar/CalendarView";
import "../../components/calendar/calendar.css";
import ThemeMenu from "./ThemeMenu";

type Props = {
  userName: string;
  onLogout: () => void;
};

/**
 * App instalada del GM: una sola pantalla con las reservas de su sucursal,
 * día por día. Sin menú lateral ni otras secciones.
 *
 * La elige AdminLayout cuando el usuario es GM y el panel corre como app
 * instalada (src/lib/pwa.ts → isStandalone). Desde el navegador, el GM sigue
 * viendo el panel normal. La sucursal la filtra la base
 * (admin_reservations_range usa la sucursal del GM en sesión).
 */
export default function GmAppShell({ userName, onLogout }: Props) {
  return (
    <div className="eg-gmapp">
      <header className="eg-gmapp__bar">
        <img className="eg-gmapp__logo" src={logo} alt="Escape Games" />
        <span className="eg-gmapp__user" title={userName}>{userName}</span>
        <ThemeMenu />
        <button type="button" className="eg-topbar__action" onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
          <Icon name="logout" size={18} />
        </button>
      </header>
      <main className="eg-gmapp__content">
        <CalendarView dayOnly heading="Reservas" />
      </main>
    </div>
  );
}
