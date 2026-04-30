import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "Search" },
  { to: "/queue", label: "Queue" },
  { to: "/sets", label: "Sets" },
  { to: "/data", label: "Data Centre" },
  { to: "/campaigns", label: "Campaigns" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
      if (!session) navigate({ to: "/auth" });
    });
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
      if (!data.session) navigate({ to: "/auth" });
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (!ready) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 h-14">
          <div className="flex items-center gap-6">
            <div className="font-bold tracking-tight text-foreground">
              EdSetu <span className="text-primary">Lead Scraper</span>
            </div>
            <nav className="flex items-center gap-1">
              {navItems.map((n) => {
                const active = location.pathname === n.to || (n.to !== "/" && location.pathname.startsWith(n.to));
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={
                      "px-3 py-1.5 rounded-md text-sm transition-colors " +
                      (active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent")
                    }
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground hidden sm:inline">{email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
