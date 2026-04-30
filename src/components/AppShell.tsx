import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import {
  Search,
  PhoneCall,
  Layers,
  Database,
  Megaphone,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Menu,
  LogOut,
} from "lucide-react";

const allNav = [
  { to: "/", label: "Search", icon: Search },
  { to: "/queue", label: "Queue", icon: PhoneCall },
  { to: "/sets", label: "Sets", icon: Layers },
  { to: "/data", label: "Data", icon: Database },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/history", label: "History", icon: HistoryIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

// Mobile primary tabs (5 max, last one is "More")
const primaryTabs = allNav.slice(0, 4);
const moreTabs = allNav.slice(4);

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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

  const isActive = (to: string) =>
    location.pathname === to || (to !== "/" && location.pathname.startsWith(to));

  const moreActive = moreTabs.some((t) => isActive(t.to));

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header — desktop has full nav; mobile is compact */}
      <header
        className="border-b bg-card/80 backdrop-blur sticky top-0 z-30"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 h-14">
          <div className="flex items-center gap-6 min-w-0">
            <Link to="/" className="font-bold tracking-tight text-foreground truncate">
              EdSetu <span className="text-primary">Lead Scraper</span>
            </Link>
            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {allNav.map((n) => {
                const active = isActive(n.to);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={
                      "px-3 py-1.5 rounded-md text-sm transition-colors " +
                      (active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent")
                    }
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground hidden lg:inline truncate max-w-[180px]">
              {email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="hidden md:inline-flex"
            >
              Sign out
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="md:hidden h-9 w-9"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main
        className="container mx-auto px-4 py-6 md:py-8"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 80px)",
        }}
      >
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5 h-14">
          {primaryTabs.map((n) => {
            const Icon = n.icon;
            const active = isActive(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={
                  "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors " +
                  (active ? "text-primary" : "text-muted-foreground")
                }
              >
                <Icon className={"h-5 w-5 " + (active ? "scale-110" : "")} />
                <span>{n.label}</span>
              </Link>
            );
          })}
          <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
            <DrawerTrigger asChild>
              <button
                className={
                  "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors " +
                  (moreActive ? "text-primary" : "text-muted-foreground")
                }
              >
                <Menu className="h-5 w-5" />
                <span>More</span>
              </button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>More</DrawerTitle>
              </DrawerHeader>
              <div className="px-4 pb-6 space-y-1">
                {moreTabs.map((n) => {
                  const Icon = n.icon;
                  const active = isActive(n.to);
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      onClick={() => setMoreOpen(false)}
                      className={
                        "flex items-center gap-3 rounded-lg px-3 py-3 text-sm " +
                        (active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-accent")
                      }
                    >
                      <Icon className="h-5 w-5" />
                      {n.label}
                    </Link>
                  );
                })}
                {email && (
                  <div className="pt-4 mt-2 border-t text-xs text-muted-foreground px-3">
                    Signed in as <span className="text-foreground">{email}</span>
                  </div>
                )}
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </nav>
    </div>
  );
}
