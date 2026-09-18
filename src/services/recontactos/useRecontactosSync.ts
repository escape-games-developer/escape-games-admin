import { useCallback, useEffect, useRef, useState } from "react";
import { getRecontactos, updateRecontacto } from "./recontactosService";
import type { Recontacto, RecontactoChanges } from "./types";

export function useRecontactosSync(branchId: string | null, configured: boolean) {
  const [items, setItems] = useState<Recontacto[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const requestId = useRef(0);
  const running = useRef(false);

  const refresh = useCallback(async (initial = false) => {
    if (!branchId || !configured || running.current) return;
    running.current = true;
    const id = ++requestId.current;
    if (initial) setLoading(true);
    else setSyncing(true);
    try {
      const rows = await getRecontactos(branchId);
      if (id !== requestId.current) return;
      setItems(rows); setError(null); setLastSyncedAt(new Date());
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : "No se pudo sincronizar");
    } finally {
      if (id === requestId.current) { setLoading(false); setSyncing(false); }
      running.current = false;
    }
  }, [branchId, configured]);

  useEffect(() => {
    requestId.current += 1; running.current = false; setItems([]); setError(null); setLastSyncedAt(null);
    if (!branchId || !configured) { setLoading(false); return; }
    void refresh(true);
    const interval = window.setInterval(() => void refresh(false), 5000);
    return () => { window.clearInterval(interval); requestId.current += 1; running.current = false; };
  }, [branchId, configured, refresh]);

  const save = useCallback(async (rowId: string, changes: RecontactoChanges) => {
    if (!branchId) throw new Error("No hay una sucursal seleccionada.");
    const previous = items;
    setSavingId(rowId);
    setItems((current) => current.map((item) => item.id === rowId ? { ...item, ...changes } : item));
    try {
      const saved = await updateRecontacto(branchId, rowId, changes);
      setItems((current) => current.map((item) => item.id === rowId ? saved : item));
      await refresh(false);
    } catch (cause) {
      setItems(previous);
      throw cause;
    } finally { setSavingId(null); }
  }, [branchId, items, refresh]);

  return { items, loading, syncing, savingId, error, lastSyncedAt, refresh, save };
}
