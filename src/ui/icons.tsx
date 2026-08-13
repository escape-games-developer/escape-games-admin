/**
 * Set de iconos SVG inline del panel.
 *
 * Los 11 primeros (`dots` … `image`) están promovidos tal cual desde el
 * componente `Icon` que vivía en Rooms.tsx:835. Los paths son idénticos, así
 * que la iconografía del listado de Salas no cambia al migrar.
 *
 * El resto son los de navegación y chrome que el sidebar/topbar necesitan.
 * Sin dependencias externas a propósito.
 */

export type IconName =
  // Promovidos desde Rooms.tsx
  | "dots"
  | "edit"
  | "eye"
  | "toggle"
  | "trash"
  | "qr"
  | "records"
  | "link"
  | "refresh"
  | "copy"
  | "image"
  // Navegación
  | "rooms"
  | "news"
  | "users"
  | "ticket"
  | "progress"
  | "logout"
  // Chrome
  | "chevronLeft"
  | "chevronRight"
  | "close"
  | "plus"
  | "search";

type Props = {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

const S = 2;

export default function Icon({ name, size = 16, className, style }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    className,
    style,
    "aria-hidden": true,
    focusable: false,
  } as const;

  switch (name) {
    /* ---------- Promovidos desde Rooms.tsx (paths sin cambios) ---------- */

    case "dots":
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.8" fill="currentColor" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" />
          <circle cx="19" cy="12" r="1.8" fill="currentColor" />
        </svg>
      );

    case "edit":
      return (
        <svg {...common}>
          <path d="M12 20h9" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
          <path
            d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"
            stroke="currentColor"
            strokeWidth={S}
            strokeLinejoin="round"
          />
        </svg>
      );

    case "eye":
      return (
        <svg {...common}>
          <path
            d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z"
            stroke="currentColor"
            strokeWidth={S}
          />
          <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth={S} />
        </svg>
      );

    case "toggle":
      return (
        <svg {...common}>
          <path
            d="M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7Z"
            stroke="currentColor"
            strokeWidth={S}
            strokeLinejoin="round"
          />
          <circle cx="10" cy="12" r="3" fill="currentColor" />
        </svg>
      );

    case "qr":
      return (
        <svg {...common}>
          <path d="M4 4h6v6H4V4Z" stroke="currentColor" strokeWidth={S} />
          <path d="M14 4h6v6h-6V4Z" stroke="currentColor" strokeWidth={S} />
          <path d="M4 14h6v6H4v-6Z" stroke="currentColor" strokeWidth={S} />
          <path d="M14 14h2v2h-2v-2Z" fill="currentColor" />
          <path d="M18 14h2v2h-2v-2Z" fill="currentColor" />
          <path d="M14 18h2v2h-2v-2Z" fill="currentColor" />
          <path d="M18 18h2v2h-2v-2Z" fill="currentColor" />
        </svg>
      );

    case "records":
      return (
        <svg {...common}>
          <path d="M6 20V8" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
          <path d="M12 20V4" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
          <path d="M18 20v-9" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
        </svg>
      );

    case "link":
      return (
        <svg {...common}>
          <path d="M10.5 13.5 13.5 10.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
          <path
            d="M8 14a4 4 0 0 1 0-6l1.5-1.5a4 4 0 0 1 6 0"
            stroke="currentColor"
            strokeWidth={S}
            strokeLinecap="round"
          />
          <path
            d="M16 10a4 4 0 0 1 0 6L14.5 17.5a4 4 0 0 1-6 0"
            stroke="currentColor"
            strokeWidth={S}
            strokeLinecap="round"
          />
        </svg>
      );

    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 1 0 2 5.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
          <path
            d="M20 4v6h-6"
            stroke="currentColor"
            strokeWidth={S}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "copy":
      return (
        <svg {...common}>
          <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth={S} />
          <path
            d="M15 9V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h2"
            stroke="currentColor"
            strokeWidth={S}
            strokeLinecap="round"
          />
        </svg>
      );

    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth={S} />
          <circle cx="9" cy="10" r="1.6" fill="currentColor" />
          <path
            d="M21 16l-4.8-4.8a1.5 1.5 0 0 0-2.1 0L8 17.3"
            stroke="currentColor"
            strokeWidth={S}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    /* ---------------------------- Navegación ---------------------------- */

    case "rooms":
      return (
        <svg {...common}>
          <path
            d="M4 9.5 12 4l8 5.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1V9.5Z"
            stroke="currentColor"
            strokeWidth={S}
            strokeLinejoin="round"
          />
        </svg>
      );

    case "news":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth={S} />
          <path d="M7 9.5h6" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
          <path d="M7 13h10" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
          <path d="M7 16h10" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
        </svg>
      );

    case "users":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth={S} />
          <path
            d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"
            stroke="currentColor"
            strokeWidth={S}
            strokeLinecap="round"
          />
        </svg>
      );

    case "ticket":
      return (
        <svg {...common}>
          <path
            d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v2a2 2 0 0 0 0 3.9v2A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.4v-2a2 2 0 0 0 0-3.9v-2Z"
            stroke="currentColor"
            strokeWidth={S}
            strokeLinejoin="round"
          />
          <path d="M14 7v11" stroke="currentColor" strokeWidth={S} strokeDasharray="2 2.5" />
        </svg>
      );

    case "progress":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={S} />
          <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case "logout":
      return (
        <svg {...common}>
          <path
            d="M14 5h4a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19h-4"
            stroke="currentColor"
            strokeWidth={S}
            strokeLinecap="round"
          />
          <path d="M10 8.5 6.5 12 10 15.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.5 12H15" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
        </svg>
      );

    /* ------------------------------ Chrome ------------------------------ */

    case "chevronLeft":
      return (
        <svg {...common}>
          <path d="M14.5 6.5 9 12l5.5 5.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case "chevronRight":
      return (
        <svg {...common}>
          <path d="M9.5 6.5 15 12l-5.5 5.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case "close":
      return (
        <svg {...common}>
          <path d="M6.5 6.5 17.5 17.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
          <path d="M17.5 6.5 6.5 17.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
        </svg>
      );

    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5.5v13" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
          <path d="M5.5 12h13" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
        </svg>
      );

    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth={S} />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
        </svg>
      );

    /* Fallback: papelera, igual que el default original de Rooms.tsx */
    case "trash":
    default:
      return (
        <svg {...common}>
          <path d="M4 7h16" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
          <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
          <path d="M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth={S} strokeLinejoin="round" />
          <path d="M9 7V4h6v3" stroke="currentColor" strokeWidth={S} strokeLinejoin="round" />
        </svg>
      );
  }
}
