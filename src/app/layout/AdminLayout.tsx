import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Drawer from "./Drawer";
import Header from "./Header";
import { supabase } from "../../lib/supabase";

type AdminInfo = {
  userName: string;
};

export default function AdminLayout() {
  const nav = useNavigate();
  const loc = useLocation();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState<AdminInfo>({ userName: "Administrador" });

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        nav("/login", { replace: true });
        return;
      }

      const { data: adminRow } = await supabase
        .from("admins")
        .select("mail, branch_id")
        .eq("user_id", data.session.user.id)
        .maybeSingle();

      if (!adminRow) {
        await supabase.auth.signOut();
        nav("/login", { replace: true });
        return;
      }

      if (mounted) {
        setAdmin({ userName: adminRow.mail || "Administrador" });
        setReady(true);
      }
    };

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      boot();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [nav]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [loc.pathname]);

  // ✅ FULL WIDTH solo en ciertas páginas
  useEffect(() => {
    // 👇 sumo NOTIFICACIONES
    const widePaths = ["/salas", "/novedades", "/usuarios", "/notificaciones"];
    const isWide = widePaths.includes(loc.pathname);

    const cls = "adminWide";
    if (isWide) document.body.classList.add(cls);
    else document.body.classList.remove(cls);

    return () => {
      document.body.classList.remove(cls);
    };
  }, [loc.pathname]);

  if (!ready) return null;

  return (
    <div className="shell">
      <Header onOpenMenu={() => setDrawerOpen(true)} />
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} userName={admin.userName} />
      <main className="main">
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}