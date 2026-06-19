import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

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

function getHandicapBadgeStyle(value: number): React.CSSProperties {
  if (value <= 0) return styles.badgeHof;
  if (value <= 30) return styles.badgeAvanzado;
  if (value <= 70) return styles.badgeIntermedio;
  return styles.badgeInicial;
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

  return (
    <div style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerWrap}>
          <div style={styles.headerText}>
            <h1 style={styles.title}>Progreso de Usuarios</h1>
            <p style={styles.subtitle}></p>
          </div>

          <div style={styles.searchBox}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, alias o mail"
              style={styles.searchInput}
            />
          </div>
        </div>

        <div style={styles.cardsGrid}>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Usuarios visibles</span>
            <strong style={styles.cardValue}>{totals.totalUsers}</strong>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>Llaves acumuladas</span>
            <strong style={styles.cardValue}>{totals.totalKeys}</strong>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>Salas registradas</span>
            <strong style={styles.cardValue}>{totals.totalRooms}</strong>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>Hall of Fame</span>
            <strong style={styles.cardValue}>{totals.hallOfFame}</strong>
          </div>
        </div>

        <div style={styles.tableOuter}>
          <div style={styles.tableWrap}>
            <div style={styles.tableHeader}>
              <div style={styles.th}>Nombre</div>
              <div style={styles.th}>Mail</div>
              <div style={styles.th}>Alias</div>
              <div style={styles.thCenter}>Salas realizadas</div>
              <div style={styles.thCenter}>Llaves</div>
              <div style={styles.thCenter}>Handicap</div>
              <div style={styles.thCenter}>Detalle</div>
            </div>

            <div style={styles.tableBody}>
              {loading ? (
                <div style={styles.emptyState}>Cargando usuarios...</div>
              ) : filteredUsers.length === 0 ? (
                <div style={styles.emptyState}>No se encontraron usuarios.</div>
              ) : (
                filteredUsers.map((user, index) => (
                  <div
                    key={user.id}
                    style={{
                      ...styles.row,
                      ...(index === filteredUsers.length - 1 ? styles.lastRow : {}),
                    }}
                  >
                    <div style={styles.td}>
                      <div style={styles.userCell}>
                        <div style={styles.avatar}>
                          {user.photoUrl ? (
                            <img
                              src={user.photoUrl}
                              alt={formatFullName(user)}
                              style={styles.avatarImg}
                            />
                          ) : (
                            user.alias?.slice(0, 1).toUpperCase() ||
                            user.nombre?.slice(0, 1).toUpperCase() ||
                            "U"
                          )}
                        </div>

                        <div style={styles.userTextWrap}>
                          <div style={styles.userName}>{formatFullName(user)}</div>
                        </div>
                      </div>
                    </div>

                    <div style={styles.td}>{user.mail || "-"}</div>

                    <div style={styles.td}>
                      <div style={styles.userAlias}>@{user.alias || "-"}</div>
                    </div>

                    <div style={styles.tdCenter}>{user.completedRoomsCount}</div>

                    <div style={styles.tdCenter}>{user.totalKeys}</div>

                    <div style={styles.tdCenter}>
                      <span style={getHandicapBadgeStyle(user.handicap)}>
                        {user.handicap}
                      </span>
                    </div>

                    <div style={styles.tdCenter}>
                      <button
                        style={styles.actionBtn}
                        onClick={() => setSelectedUser(user)}
                      >
                        Ver detalle
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedUser && (
        <div style={styles.overlay} onClick={() => setSelectedUser(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>Detalle del usuario</h2>
                <p style={styles.modalSubtitle}>
                  Información general, llaves y salas realizadas.
                </p>
              </div>

              <button
                style={styles.closeBtn}
                onClick={() => setSelectedUser(null)}
              >
                ×
              </button>
            </div>

            <div style={styles.detailUserTop}>
              <div style={styles.detailAvatarWrap}>
                <div style={styles.detailAvatar}>
                  {selectedUser.photoUrl ? (
                    <img
                      src={selectedUser.photoUrl}
                      alt={formatFullName(selectedUser)}
                      style={styles.detailAvatarImg}
                    />
                  ) : (
                    selectedUser.alias?.slice(0, 1).toUpperCase() ||
                    selectedUser.nombre?.slice(0, 1).toUpperCase() ||
                    "U"
                  )}
                </div>
              </div>

              <div style={styles.detailTop}>
                <div style={styles.detailBlock}>
                  <span style={styles.detailLabel}>Nombre</span>
                  <strong style={styles.detailValue}>
                    {formatFullName(selectedUser)}
                  </strong>
                </div>

                <div style={styles.detailBlock}>
                  <span style={styles.detailLabel}>Alias</span>
                  <strong style={styles.detailValue}>@{selectedUser.alias || "-"}</strong>
                </div>

                <div style={styles.detailBlock}>
                  <span style={styles.detailLabel}>Salas realizadas</span>
                  <strong style={styles.detailValue}>
                    {selectedUser.completedRoomsCount}
                  </strong>
                </div>

                <div style={styles.detailBlock}>
                  <span style={styles.detailLabel}>Llaves</span>
                  <strong style={styles.detailValue}>{selectedUser.totalKeys}</strong>
                </div>

                <div style={styles.detailBlock}>
                  <span style={styles.detailLabel}>Handicap</span>
                  <strong style={styles.detailValue}>{selectedUser.handicap}</strong>
                </div>
              </div>
            </div>

            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>Llaves</span>
                <strong style={styles.statValue}>{selectedUser.totalKeys}</strong>
              </div>

              <div style={styles.statCard}>
                <span style={styles.statLabel}>Salas realizadas</span>
                <strong style={styles.statValue}>
                  {selectedUser.completedRoomsCount}
                </strong>
              </div>

              <div style={styles.statCard}>
                <span style={styles.statLabel}>Handicap</span>
                <strong style={styles.statValue}>{selectedUser.handicap}</strong>
              </div>

              <div style={styles.statCard}>
                <span style={styles.statLabel}>Nivel</span>
                <strong style={styles.statValue}>
                  {getHandicapLabel(selectedUser.handicap)}
                </strong>
              </div>
            </div>

            <div style={styles.roomsSection}>
              <div style={styles.roomsHeader}>
                <h3 style={styles.roomsTitle}>Salas realizadas</h3>
                <span style={styles.roomsCount}>
                  {selectedUser.rooms.length} registradas
                </span>
              </div>

              {selectedUser.rooms.length === 0 ? (
                <div style={styles.noRooms}>
                  Este usuario todavía no tiene salas registradas.
                </div>
              ) : (
                <div style={styles.roomsList}>
                  {selectedUser.rooms.map((room) => (
                    <div key={room.id} style={styles.roomItem}>
                      <div>
                        <div style={styles.roomName}>{room.name}</div>
                        <div style={styles.roomMeta}>{room.completedAt}</div>
                      </div>
                      <span style={styles.roomTag}>Completada</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: "100%",
    minHeight: "100vh",
    height: "100vh",
    background: "#0f172a",
    color: "#e5e7eb",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxSizing: "border-box",
  },

  pageInner: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    padding: "14px 18px 18px",
    boxSizing: "border-box",
    overflow: "hidden",
  },

  headerWrap: {
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    marginBottom: 24,
    width: "100%",
    flexShrink: 0,
  },

  headerText: {
    flex: "1 1 420px",
    minWidth: 280,
  },

  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 800,
    color: "#ffffff",
    lineHeight: 1.1,
  },

  subtitle: {
    margin: "8px 0 0 0",
    fontSize: 14,
    color: "#94a3b8",
    maxWidth: 760,
  },

  searchBox: {
    minWidth: 300,
    width: "100%",
    maxWidth: 460,
    flex: "0 1 460px",
  },

  searchInput: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    border: "1px solid #334155",
    background: "#111827",
    color: "#ffffff",
    padding: "0 14px",
    outline: "none",
    fontSize: 14,
    boxSizing: "border-box",
  },

  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 18,
    width: "100%",
    flexShrink: 0,
  },

  card: {
    background: "linear-gradient(180deg, #111827 0%, #0b1220 100%)",
    border: "1px solid #1f2937",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 10px 24px rgba(0,0,0,0.16)",
    minHeight: 82,
    boxSizing: "border-box",
  },

  cardLabel: {
    display: "block",
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 8,
  },

  cardValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#ffffff",
    lineHeight: 1,
  },

  tableOuter: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    borderRadius: 18,
  },

  tableWrap: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    height: "100%",
    border: "1px solid #1f2937",
    borderRadius: 18,
    overflow: "hidden",
    background: "#0b1220",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
  },

  tableHeader: {
    display: "grid",
    gridTemplateColumns: "2.2fr 2fr 1.4fr 1fr 0.9fr 1fr 1fr",
    gap: 12,
    padding: "16px 18px",
    background: "#111827",
    borderBottom: "1px solid #1f2937",
    boxSizing: "border-box",
    alignItems: "center",
    flexShrink: 0,
  },

  tableBody: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    background: "#0b1220",
  },

  th: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
    fontWeight: 700,
    minWidth: 0,
  },

  thCenter: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
    fontWeight: 700,
    textAlign: "center",
    minWidth: 0,
  },

  row: {
    display: "grid",
    gridTemplateColumns: "2.2fr 2fr 1.4fr 1fr 0.9fr 1fr 1fr",
    gap: 12,
    padding: "16px 18px",
    borderBottom: "1px solid #172033",
    alignItems: "center",
    boxSizing: "border-box",
    background: "#0b1220",
    flexShrink: 0,
  },

  lastRow: {
    borderBottom: "none",
  },

  td: {
    fontSize: 14,
    color: "#e5e7eb",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  tdCenter: {
    fontSize: 14,
    color: "#e5e7eb",
    textAlign: "center",
    minWidth: 0,
  },

  userCell: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },

  userTextWrap: {
    minWidth: 0,
    overflow: "hidden",
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 800,
    fontSize: 16,
    flexShrink: 0,
    overflow: "hidden",
  },

  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  userName: {
    fontWeight: 700,
    color: "#fff",
    marginBottom: 2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  userAlias: {
    fontSize: 13,
    color: "#94a3b8",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  actionBtn: {
    border: "1px solid rgba(249,115,22,0.35)",
    borderRadius: 12,
    background:
      "linear-gradient(180deg, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0.12) 100%)",
    color: "#fff",
    fontWeight: 700,
    padding: "10px 12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    width: "100%",
    maxWidth: 150,
    boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
    fontSize: 13,
  },

  badgeHof: {
    display: "inline-flex",
    alignItems: "center",
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 12,
    background: "rgba(250,199,117,0.15)",
    color: "#fac775",
    border: "1px solid rgba(250,199,117,0.35)",
  },

  badgeAvanzado: {
    display: "inline-flex",
    alignItems: "center",
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 12,
    background: "rgba(133,183,235,0.15)",
    color: "#85b7eb",
    border: "1px solid rgba(133,183,235,0.35)",
  },

  badgeIntermedio: {
    display: "inline-flex",
    alignItems: "center",
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 12,
    background: "rgba(93,202,165,0.15)",
    color: "#5dcaa5",
    border: "1px solid rgba(93,202,165,0.35)",
  },

  badgeInicial: {
    display: "inline-flex",
    alignItems: "center",
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 12,
    background: "#1e293b",
    color: "#94a3b8",
    border: "1px solid #334155",
  },

  emptyState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 15,
    background: "#0b1220",
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(2,6,23,0.72)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 1000,
    boxSizing: "border-box",
  },

  modal: {
    width: "100%",
    maxWidth: 1180,
    maxHeight: "92vh",
    overflowY: "auto",
    borderRadius: 22,
    background: "#0b1220",
    border: "1px solid #1f2937",
    boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
    padding: 22,
    boxSizing: "border-box",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 22,
  },

  modalTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    color: "#fff",
  },

  modalSubtitle: {
    margin: "6px 0 0 0",
    color: "#94a3b8",
    fontSize: 14,
  },

  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "0.5px solid #334155",
    background: "#111827",
    color: "#94a3b8",
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  detailUserTop: {
    display: "grid",
    gridTemplateColumns: "140px minmax(0,1fr)",
    gap: 18,
    marginBottom: 20,
    alignItems: "start",
  },

  detailAvatarWrap: {
    display: "flex",
    justifyContent: "center",
  },

  detailAvatar: {
    width: 120,
    height: 120,
    borderRadius: "50%",
    overflow: "hidden",
    background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 36,
    fontWeight: 800,
  },

  detailAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  detailTop: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginBottom: 20,
  },

  detailBlock: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 16,
    padding: 16,
  },

  detailLabel: {
    display: "block",
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: 700,
  },

  detailValue: {
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    wordBreak: "break-word",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginBottom: 20,
  },

  statCard: {
    background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
    border: "1px solid #1f2937",
    borderRadius: 18,
    padding: 18,
  },

  statLabel: {
    display: "block",
    fontSize: 13,
    color: "#94a3b8",
    marginBottom: 10,
  },

  statValue: {
    fontSize: 26,
    fontWeight: 800,
    color: "#fff",
  },

  roomsSection: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 18,
    padding: 18,
  },

  roomsHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 14,
    flexWrap: "wrap",
  },

  roomsTitle: {
    margin: 0,
    color: "#fff",
    fontSize: 18,
    fontWeight: 800,
  },

  roomsCount: {
    fontSize: 13,
    color: "#94a3b8",
  },

  roomsList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  roomItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    background: "#0b1220",
    border: "1px solid #1f2937",
    borderRadius: 14,
    padding: 14,
    flexWrap: "wrap",
  },

  roomName: {
    color: "#fff",
    fontWeight: 700,
    marginBottom: 4,
  },

  roomMeta: {
    color: "#94a3b8",
    fontSize: 13,
  },

  roomTag: {
    display: "inline-flex",
    alignItems: "center",
    height: 30,
    padding: "0 12px",
    borderRadius: 999,
    background: "rgba(34,197,94,0.12)",
    color: "#4ade80",
    border: "1px solid rgba(34,197,94,0.3)",
    fontSize: 12,
    fontWeight: 700,
  },

  noRooms: {
    color: "#94a3b8",
    fontSize: 14,
    padding: "8px 0",
  },
};