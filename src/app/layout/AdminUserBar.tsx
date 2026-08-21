import { useState } from "react";
import Icon from "../../ui/icons";

type Props = {
  userName: string;
  userRole?: string;
};

/**
 * Identidad del usuario en la topbar: avatar, nombre, puesto y código GM.
 *
 * Antes vivía como tarjeta arriba del sidebar (`.eg-sidebar__profile`) y comía
 * espacio vertical al menú. Es la MISMA información y la misma función de
 * copiado: se mudó de lugar, no se duplicó. Los datos siguen llegando por props
 * desde AdminLayout, que es el único que habla con Supabase.
 */
export default function AdminUserBar({ userName, userRole }: Props) {
  const [copied, setCopied] = useState(false);
  const initial = (userName.trim()[0] || "A").toUpperCase();
  const gmCode = String(localStorage.getItem("eg_admin_gm_code") || "").trim();

  const copyGmCode = async () => {
    if (!gmCode) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(gmCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      const field = document.createElement("textarea");
      field.value = gmCode;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const didCopy = document.execCommand("copy");
      field.remove();
      setCopied(didCopy);
      if (didCopy) window.setTimeout(() => setCopied(false), 1400);
    }
  };

  return (
    <div className="eg-userbar" title={userRole ? `${userName} — ${userRole}` : userName}>
      <span className="eg-avatar eg-avatar--sm" aria-hidden="true">
        {initial}
      </span>

      <span className="eg-userbar__name">{userName}</span>

      {/* Cada bloque lleva su propio separador adentro: al ocultarse en
          pantallas angostas no queda una barrita suelta. */}
      {userRole && (
        <span className="eg-userbar__role">
          <i className="eg-userbar__sep" aria-hidden="true" />
          {userRole}
        </span>
      )}

      {gmCode && (
        <span className="eg-userbar__gm">
          <i className="eg-userbar__sep" aria-hidden="true" />
          <span className="eg-userbar__gm-label">GM:</span>
          <strong>{gmCode}</strong>
          <button type="button" onClick={copyGmCode} aria-label="Copiar código GM" title="Copiar código GM">
            <Icon name="copy" size={13} />
          </button>
          {copied && <span className="eg-userbar__gm-copied" role="status">Copiado</span>}
        </span>
      )}
    </div>
  );
}
