import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Badge, Button, Card, DataTable, EmptyState, Modal, PageHeader, SearchInput, StatCard, type DataTableColumn } from "../ui";

type UserRoom = {
  id: string;
  name: string;
  completedAt: string;
};

type UserProgressItem = {
  id: string;
  alias: string;
  nombre: string;
  apellido: string;
  mail: string;
  photoUrl?: string;
  role: "CLIENT" | "GM" | "ADMIN";
  handicap: number;
  totalKeys: number;
  completedRoomsCount: number;
  rooms: UserRoom[];
};

function formatFullName(user: UserProgressItem) {
  return `${user.nombre} ${user.apellido}`.trim() || "Sin nombre";
}

function getHandicapLabel(value: number) {
  if (value <= 0) return "Hall of Fame";
  if (value <= 30) return "Avanzado";
  if (value <= 70) return "Intermedio";
  return "Inicial";
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-";

  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return String(dateString);

  return d.toLocaleString("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UserProgressPage() {
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProgressItem | null>(null);
  const [items, setItems] = useState<UserProgressItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsersProgress();
  }, []);

  async function fetchUsersProgress() {
    setLoading(true);

    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,nombre,apellido,alias,mail,photo_url,role,handicap,keys,is_active")
        .eq("role", "CLIENT")
        .eq("is_active", true)
        .order("updated_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: completions, error: completionsError } = await supabase
        .from("room_completions")
        .select("id,user_id,room_id,completed_at,points,verified")
        .order("completed_at", { ascending: false });

      if (completionsError) throw completionsError;

      const roomIds = Array.from(
        new Set((completions ?? []).map((c: any) => c.room_id).filter(Boolean))
      );

      const roomsMap = new Map<string, string>();

      if (roomIds.length > 0) {
        const { data: roomsV2, error: roomsV2Error } = await supabase
          .from("rooms_v2")
          .select("id,name")
          .in("id", roomIds);

        if (roomsV2Error) {
          console.warn("No pude leer rooms_v2:", roomsV2Error.message);
        }

        (roomsV2 ?? []).forEach((r: any) => {
          roomsMap.set(String(r.id), String(r.name || "Sala"));
        });

        const missingIds = roomIds.filter((id) => !roomsMap.has(String(id)));

        if (missingIds.length > 0) {
          const { data: legacyRooms, error: legacyRoomsError } = await supabase
            .from("rooms")
            .select("id,name")
            .in("id", missingIds);

          if (legacyRoomsError) {
            console.warn("No pude leer rooms:", legacyRoomsError.message);
          }

          (legacyRooms ?? []).forEach((r: any) => {
            roomsMap.set(String(r.id), String(r.name || "Sala"));
          });
        }
      }

      const roomsByUser = new Map<string, UserRoom[]>();

      (completions ?? []).forEach((c: any) => {
        const userId = String(c.user_id);
        const current = roomsByUser.get(userId) || [];

        current.push({
          id: String(c.id),
          name: roomsMap.get(String(c.room_id)) || "Sala",
          completedAt: formatDate(c.completed_at),
        });

        roomsByUser.set(userId, current);
      });

      const mapped: UserProgressItem[] = (profiles ?? []).map((p: any) => {
        const userRooms = roomsByUser.get(String(p.id)) || [];

        return {
          id: String(p.id),
          alias: String(p.alias || ""),
          nombre: String(p.nombre || ""),
          apellido: String(p.apellido || ""),
          mail: String(p.mail || ""),
          photoUrl: String(p.photo_url || ""),
          role: "CLIENT",
          handicap: Number(p.handicap ?? 100),
          totalKeys: Number(p.keys ?? 0),
          completedRoomsCount: userRooms.length,
          rooms: userRooms,
        };
      });

      setItems(mapped);
    } catch (err: any) {
      console.error("USER PROGRESS ERROR:", err);
      alert(err?.message || "No se pudo cargar el progreso de usuarios.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((user) => {
      const fullName = formatFullName(user).toLowerCase();
      return (
        fullName.includes(q) ||
        user.alias.toLowerCase().includes(q) ||
        user.mail.toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  const totals = useMemo(() => {
    const totalUsers = filteredUsers.length;
    const totalKeys = filteredUsers.reduce((acc, item) => acc + item.totalKeys, 0);
    const totalRooms = filteredUsers.reduce((acc, item) => acc + item.completedRoomsCount, 0);
    const hallOfFame = filteredUsers.filter((item) => item.handicap <= 0).length;

    return {
      totalUsers,
      totalKeys,
      totalRooms,
      hallOfFame,
    };
  }, [filteredUsers]);

  const progressColumns: DataTableColumn<UserProgressItem>[] = [
    {
      key: "user",
      header: "Usuario",
      className: "eg-progress-table__user-col",
      render: (user) => <div className="eg-progress-user"><ProgressAvatar user={user} /><span><strong>{formatFullName(user)}</strong><small>{user.mail || "—"}</small></span></div>,
    },
    { key: "alias", header: "Alias", render: (user) => <span className="eg-progress-muted">{user.alias ? `@${user.alias}` : "—"}</span> },
    { key: "rooms", header: "Salas realizadas", align: "center", render: (user) => <strong className="eg-progress-number">{user.completedRoomsCount}</strong> },
    { key: "keys", header: "Llaves", align: "center", render: (user) => <span className="eg-progress-keys">{user.totalKeys}</span> },
    { key: "handicap", header: "Handicap", align: "center", render: (user) => <Badge tone={user.handicap <= 0 ? "warning" : user.handicap <= 30 ? "success" : user.handicap <= 70 ? "info" : "neutral"} small>{user.handicap}</Badge> },
    { key: "level", header: "Nivel", align: "center", render: (user) => <span className="eg-progress-level"><Badge tone={user.handicap <= 0 ? "warning" : "neutral"} small>{getHandicapLabel(user.handicap)}</Badge>{user.handicap <= 0 && <Badge tone="accent" small>Hall of Fame</Badge>}</span> },
    { key: "actions", header: "Acciones", align: "center", render: (user) => <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => setSelectedUser(user)}>Ver progreso</Button> },
  ];

  return (
    <div className="eg-progress-page">
      <PageHeader title="Progreso de Usuarios" subtitle="Seguimiento del avance y rendimiento de los usuarios." />

      <Card padding="sm" className="eg-progress-filters">
        <SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, alias o email..." aria-label="Buscar progreso de usuarios" />
      </Card>

      <div className="eg-progress-stats">
        <StatCard value={totals.totalUsers} label="Usuarios visibles" loading={loading} />
        <StatCard value={totals.totalKeys} label="Llaves acumuladas" tone="accent" loading={loading} />
        <StatCard value={totals.totalRooms} label="Salas registradas" loading={loading} />
        <StatCard value={totals.hallOfFame} label="Hall of Fame" tone="warning" loading={loading} />
      </div>

      <Card padding="none" className="eg-progress-table-card">
        <DataTable
          columns={progressColumns}
          rows={filteredUsers}
          rowKey={(user) => user.id}
          loading={loading}
          loadingLabel="Cargando usuarios..."
          empty={<EmptyState icon="progress" title="No se encontraron usuarios" description="Probá modificando la búsqueda." />}
        />
      </Card>

      <Modal
        open={Boolean(selectedUser)}
        title="Detalle del usuario"
        description="Información general y progreso registrado."
        size="lg"
        panelClassName="eg-user-progress-modal"
        onClose={() => setSelectedUser(null)}
      >
        {selectedUser && <>
          <div className="eg-user-progress__identity">
            <ProgressAvatar user={selectedUser} large />
            <div className="eg-user-progress__identity-copy">
              <strong>{formatFullName(selectedUser)}</strong>
              <span>{selectedUser.alias ? `@${selectedUser.alias}` : "sin alias"} · {selectedUser.mail || "sin email"}</span>
              <div><Badge tone={selectedUser.handicap <= 0 ? "warning" : "neutral"} small>{getHandicapLabel(selectedUser.handicap)}</Badge>{selectedUser.handicap <= 0 && <Badge tone="accent" small>Hall of Fame</Badge>}</div>
            </div>
          </div>

          <div className="eg-user-progress__stats">
            <StatCard value={selectedUser.handicap} label="Handicap" tone={selectedUser.handicap <= 0 ? "warning" : "neutral"} />
            <StatCard value={selectedUser.totalKeys} label="Llaves" tone="accent" />
            <StatCard value={selectedUser.completedRoomsCount} label="Salas realizadas" />
            <StatCard value={getHandicapLabel(selectedUser.handicap)} label="Nivel" />
          </div>

          <section className="eg-user-progress__history">
            <div className="eg-user-progress__history-head"><h3>Salas realizadas</h3><span>{selectedUser.rooms.length} registradas</span></div>
            {selectedUser.rooms.length === 0 ? (
              <EmptyState icon="rooms" title="Todavía no tiene salas registradas" description="Las salas completadas aparecerán acá." />
            ) : (
              <div className="eg-user-progress__rooms">
                {selectedUser.rooms.map((room) => <div key={room.id} className="eg-user-progress__room">
                  <span className="eg-user-progress__room-thumb" aria-hidden="true">EG</span>
                  <span className="eg-user-progress__room-copy"><strong>{room.name}</strong><small>Completada {room.completedAt}</small></span>
                  <Badge tone="success" small>Completada</Badge>
                </div>)}
              </div>
            )}
          </section>
        </>}
      </Modal>
    </div>
  );
}

function ProgressAvatar({ user, large = false }: { user: UserProgressItem; large?: boolean }) {
  const initial = user.alias?.slice(0, 1) || user.nombre?.slice(0, 1) || "U";
  return <span className={`eg-progress-avatar${large ? " eg-progress-avatar--large" : ""}`}>{user.photoUrl ? <img src={user.photoUrl} alt="" /> : initial.toUpperCase()}</span>;
}
