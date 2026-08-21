import { useState } from "react";

import AdminSidebar, { type NavItem } from "../app/layout/AdminSidebar";
import AdminTopbar from "../app/layout/AdminTopbar";
import { ActionMenu, Badge, Button, PageHeader, StatCard } from "../ui";
import "../ui/ui.css";

/**
 * Vitrina de los primitivos de la Etapa 1A. Ruta oculta /_ui-preview.
 *
 * NO forma parte del panel: no toca Supabase, no pide sesión y ninguna vista
 * real la importa. Existe para revisar el sistema visual aislado antes de
 * aplicarlo a Salas en la Etapa 1B. Se puede borrar sin consecuencias.
 */

const NAV_ITEMS: NavItem[] = [
  // `to` apunta a la propia preview para poder clickear sin salir de la página.
  { key: "salas", label: "Salas", to: "/_ui-preview", icon: "rooms" },
  { key: "novedades", label: "Novedades", to: "/_ui-preview", icon: "news" },
  { key: "usuarios", label: "Usuarios", to: "/_ui-preview", icon: "users" },
  { key: "golden", label: "Golden Ticket", to: "/_ui-preview", icon: "ticket" },
  { key: "progreso", label: "Progreso usuarios", to: "/_ui-preview", icon: "progress" },
];

const SURFACE_TOKENS = [
  "--eg-bg",
  "--eg-sidebar",
  "--eg-surface",
  "--eg-surface-2",
  "--eg-surface-3",
];

const COLOR_TOKENS = ["--eg-accent", "--eg-success", "--eg-danger", "--eg-warning", "--eg-info"];

function Swatch({ token }: { token: string }) {
  return (
    <div className="eg-preview__swatch">
      <div className="eg-preview__chip" style={{ background: `var(${token})` }} />
      <code>{token}</code>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="eg-preview__section">
      <h2 className="eg-preview__h">{title}</h2>
      <p className="eg-preview__note">{note}</p>
      {children}
    </section>
  );
}

export default function UiPreview() {
  const [activeKey, setActiveKey] = useState("salas");
  const [collapsed, setCollapsed] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const noop = () => {};

  return (
    <div className="eg-preview">
      <div className="eg-preview__inner">
        <PageHeader
          title="UI Preview — Etapa 1A"
          subtitle="Primitivos aislados. Ninguna vista del panel usa todavía este sistema."
        />

        {/* ------------------------------ 1 ------------------------------ */}
        <Section
          title="1 · Design tokens"
          note="Definidos en src/styles/tokens.css con prefijo --eg-. Ningún componente usa colores literales."
        >
          <div className="eg-preview__row">
            <span className="eg-preview__tag">Superficies (de más oscura a más clara)</span>
          </div>
          <div className="eg-preview__swatches">
            {SURFACE_TOKENS.map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </div>

          <div className="eg-preview__row" style={{ marginTop: 20 }}>
            <span className="eg-preview__tag">Marca y semánticos</span>
          </div>
          <div className="eg-preview__swatches">
            {COLOR_TOKENS.map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </div>
        </Section>

        {/* ------------------------------ 2 ------------------------------ */}
        <Section
          title="2 · Sidebar — expandido y contraído"
          note="Mismo componente, prop collapsed. Los links apuntan a esta misma página, así que podés clickear sin salir. Item activo: fondo más claro + barra naranja izquierda + icono naranja + texto blanco."
        >
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div className="eg-preview__frame" style={{ width: 252 }}>
              <AdminSidebar
                items={NAV_ITEMS}
                activeKey={activeKey}
                collapsed={false}
                onToggleCollapse={noop}
                onLogout={noop}
              />
            </div>

            <div className="eg-preview__frame" style={{ width: 76 }}>
              <AdminSidebar
                items={NAV_ITEMS}
                activeKey={activeKey}
                collapsed
                onToggleCollapse={noop}
                onLogout={noop}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="eg-preview__tag">Cambiar item activo</span>
              {NAV_ITEMS.map((i) => (
                <Button
                  key={i.key}
                  size="sm"
                  variant={i.key === activeKey ? "primary" : "secondary"}
                  onClick={() => setActiveKey(i.key)}
                >
                  {i.label}
                </Button>
              ))}
            </div>
          </div>
        </Section>

        {/* ------------------------------ 3 ------------------------------ */}
        <Section
          title="3 · Topbar"
          note="62px de alto. Breadcrumb a la izquierda, estado online y usuario a la derecha. El logo ya no está acá: vive en el sidebar."
        >
          <div style={{ border: "1px solid var(--eg-border)", borderRadius: 10, overflow: "hidden" }}>
            <AdminTopbar
              crumbs={[{ label: "Salas" }, { label: "Nueva sala" }]}
              userName="Magdiaz"
            />
          </div>
        </Section>

        {/* ------------------------------ 4 ------------------------------ */}
        <Section
          title="4 · PageHeader"
          note="Título, subtítulo y acción primaria. Los textos son los que pediste para cada sección."
        >
          <PageHeader
            title="Salas"
            subtitle="Administrá las salas disponibles en todas las sucursales."
            action={
              <Button variant="primary" icon="plus">
                Nueva sala
              </Button>
            }
          />
        </Section>

        {/* ------------------------------ 5 ------------------------------ */}
        <Section
          title="5 · Botones"
          note="Naranja solo para la acción importante. Alto 42px (34px en size sm)."
        >
          <div className="eg-preview__row">
            <span className="eg-preview__tag">Variantes — size md</span>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
          </div>

          <div className="eg-preview__row">
            <span className="eg-preview__tag">Variantes — size sm</span>
            <Button size="sm" variant="primary">
              Primary
            </Button>
            <Button size="sm" variant="secondary">
              Secondary
            </Button>
            <Button size="sm" variant="danger">
              Danger
            </Button>
            <Button size="sm" variant="ghost">
              Ghost
            </Button>
          </div>

          <div className="eg-preview__row">
            <span className="eg-preview__tag">Con icono, solo icono, y estados</span>
            <Button variant="primary" icon="plus">
              Nueva sala
            </Button>
            <Button variant="secondary" iconRight="chevronRight">
              Siguiente
            </Button>
            <Button variant="secondary" icon="refresh" title="Actualizar" />
            <Button variant="secondary" disabled>
              Deshabilitado
            </Button>
            <Button
              variant="primary"
              loading={loadingDemo}
              onClick={() => {
                setLoadingDemo(true);
                window.setTimeout(() => setLoadingDemo(false), 1500);
              }}
            >
              {loadingDemo ? "Guardando…" : "Probar loading"}
            </Button>
          </div>
        </Section>

        {/* ------------------------------ 6 ------------------------------ */}
        <Section
          title="6 · Badges"
          note="Un solo componente para estado, categoría y nivel. Cambia el tone, no el estilo por pantalla."
        >
          <div className="eg-preview__row">
            <span className="eg-preview__tag">Estado</span>
            <Badge tone="success" dot>
              Activa
            </Badge>
            <Badge tone="neutral" dot>
              Inactiva
            </Badge>
            <Badge tone="danger" dot>
              Eliminada
            </Badge>
          </div>

          <div className="eg-preview__row">
            <span className="eg-preview__tag">Categoría</span>
            <Badge tone="accent">WOW</Badge>
            <Badge tone="info">CLÁSICO</Badge>
            <Badge tone="warning">GOLDEN</Badge>
            <Badge tone="accent">DESTACADO</Badge>
          </div>

          <div className="eg-preview__row">
            <span className="eg-preview__tag">Nivel</span>
            <Badge tone="neutral">Inicial</Badge>
            <Badge tone="info">Intermedio</Badge>
            <Badge tone="warning">Avanzado</Badge>
          </div>

          <div className="eg-preview__row">
            <span className="eg-preview__tag">Versión small (para celdas densas)</span>
            <Badge tone="success" small dot>
              Activa
            </Badge>
            <Badge tone="accent" small>
              WOW
            </Badge>
            <Badge tone="info" small>
              Intermedio
            </Badge>
          </div>
        </Section>

        {/* ------------------------------ 7 ------------------------------ */}
        <Section
          title="7 · StatCard"
          note="Mismo tile para las 5 secciones. Los ejemplos usan los números reales de tus capturas."
        >
          <div className="eg-stat-grid">
            <StatCard value={58} label="Salas visibles" icon="rooms" />
            <StatCard value={57} label="Salas activas" icon="toggle" tone="success" />
            <StatCard value={1} label="Salas inactivas" icon="eye" tone="danger" />
            <StatCard value="0 / 100" label="Golden otorgados" icon="ticket" tone="warning" />
          </div>

          <div className="eg-stat-grid" style={{ marginTop: 16 }}>
            <StatCard value={22} label="Usuarios visibles" icon="users" tone="accent" />
            <StatCard value={0} label="Sin icono" />
            <StatCard value={0} label="Cargando…" icon="progress" loading />
          </div>
        </Section>

        {/* ------------------------------ 8 ------------------------------ */}
        <Section
          title="8 · ActionMenu"
          note="El ⋯ compartido por todas las tablas. Cierra con click afuera y con Escape. Estos son los menús reales de Salas y Usuarios — acá los onSelect no hacen nada."
        >
          <div className="eg-preview__row">
            <span className="eg-preview__tag">Menú de Salas (7 acciones)</span>
            <ActionMenu
              align="left"
              items={[
                { key: "edit", label: "Editar", icon: "edit", onSelect: noop },
                { key: "desc", label: "Ver descripción", icon: "eye", onSelect: noop },
                { key: "qr", label: "Ver QR", icon: "qr", onSelect: noop },
                { key: "reserva", label: "Abrir reserva", icon: "link", onSelect: noop },
                { key: "records", label: "Editar récords", icon: "records", onSelect: noop },
                {
                  key: "toggle",
                  label: "Desactivar",
                  icon: "toggle",
                  separatorBefore: true,
                  onSelect: noop,
                },
                { key: "del", label: "Borrar", icon: "trash", danger: true, onSelect: noop },
              ]}
            />
          </div>

          <div className="eg-preview__row">
            <span className="eg-preview__tag">Menú de Usuarios (con una opción deshabilitada)</span>
            <ActionMenu
              align="left"
              items={[
                { key: "gm", label: "Código GM", icon: "copy", onSelect: noop },
                { key: "perms", label: "Permisos", icon: "edit", onSelect: noop },
                { key: "pass", label: "Resetear contraseña", icon: "refresh", disabled: true, onSelect: noop },
                {
                  key: "del",
                  label: "Eliminar usuario",
                  icon: "trash",
                  danger: true,
                  separatorBefore: true,
                  onSelect: noop,
                },
              ]}
            />
          </div>
        </Section>

        {/* ------------------------------ 9 ------------------------------ */}
        <Section
          title="9 · Sidebar interactivo"
          note="Probá el botón 'Contraer menú' del pie para ver la transición entre los dos anchos (252px ↔ 76px)."
        >
          <div className="eg-preview__frame" style={{ width: collapsed ? 76 : 252 }}>
            <AdminSidebar
              items={NAV_ITEMS}
              activeKey={activeKey}
              collapsed={collapsed}
              onToggleCollapse={() => setCollapsed((v) => !v)}
              onLogout={noop}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
