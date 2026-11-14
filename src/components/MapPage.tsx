import { Link, ClientOnly, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { logout } from "@/lib/network.functions";
import { lazy, Suspense, useState } from "react";
import { networkQuery, zabbixQuery } from "@/lib/network.queries";
import { pathDistance } from "@/lib/network.types";
import { filterNetwork } from "@/lib/map-layout";
import Brand from "@/components/Brand";
import { Button } from "@/components/ui/button";

const NetworkMap = lazy(() => import("@/components/NetworkMap"));

export default function MapPage({ kind }: { kind: "sw" | "dwdm" }) {
  const { data: all } = useSuspenseQuery(networkQuery);
  const net = filterNetwork(all, kind);
  const [channelId, setChannelId] = useState<number | null>(null);
  const { data: zbx } = useQuery(zabbixQuery);
  const zc = { ok: 0, warn: 0, down: 0, unknown: 0 };
  if (zbx?.enabled) for (const p of net.pops) zc[zbx.byName[p.name]?.state ?? "unknown"]++;
  const ch = net.channels.find((c) => c.id === channelId);
  const [hidden, setHidden] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function sair() {
    await logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  }
  const name = (id: number) => net.pops.find((p) => p.id === id)?.name ?? "?";

  return (
    <div className="flex h-screen flex-col md:flex-row">
      {!hidden && <aside className="flex w-full flex-col border-b bg-card md:w-80 md:border-b-0 md:border-r">
        <header className="flex flex-wrap items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
          <div>
            <Brand compact />
            <h1 className="mt-2 text-xs font-semibold">{kind === "sw" ? "Rede IVI Telecom" : "DWDM IVI Telecom"}</h1>
            <p className="text-xs text-primary-foreground/75">
              {net.pops.length} POPs · {net.links.length} ligações
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="px-2 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><Link to="/admin">Admin</Link></Button>
            <Button onClick={sair} variant="ghost" size="sm" className="px-2 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">Sair</Button>
            <Button variant="ghost" size="icon" onClick={() => setHidden(true)} aria-label="Ocultar barra lateral" title="Ocultar barra lateral" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <nav aria-label="Mapas" className="grid grid-cols-2 gap-1 border-b p-2 text-xs">
          <Link to="/" className={`rounded-md px-3 py-2 text-center ${kind === "sw" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>Switches</Link>
          <Link to="/dwdm" className={`rounded-md px-3 py-2 text-center ${kind === "dwdm" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>DWDM Padtec / ECI / Parks</Link>
        </nav>
        {zbx?.enabled && (
          <div className="border-b px-4 py-2 text-xs">
            {zbx.error ? (
              <p className="text-destructive">Zabbix indisponível: {zbx.error}</p>
            ) : (
              <p className="flex flex-wrap gap-3 text-muted-foreground">
                <span><span className={`mr-1 inline-block h-2 w-2 rounded-full bg-online`} />{zc.ok} ok</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-standby" />{zc.warn} alerta</span>
                <span><span className={`mr-1 inline-block h-2 w-2 rounded-full bg-destructive`} />{zc.down} crítico</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-muted-foreground" />{zc.unknown} sem host</span>
              </p>
            )}
          </div>
        )}
        <div className="flex-1 overflow-auto p-3">
          {kind === "dwdm" && <div aria-label="Estado das ligações" className="mb-3 flex flex-wrap gap-3 border-b pb-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-1 w-5 bg-destructive" /> Falha confirmada</span>
            <span className="flex items-center gap-1"><span className="h-1 w-5 bg-standby" /> Suspeita nas duas pontas</span>
          </div>}
          <p className="mb-2 px-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Canais</p>
          <button
            onClick={() => setChannelId(null)}
            className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm ${channelId === null ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
          >
            Toda a rede
          </button>
          {net.channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setChannelId(c.id)}
              className={`mb-1 w-full rounded-md px-3 py-2 text-left font-mono text-sm ${channelId === c.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
            >
              {c.name}
            </button>
          ))}
          {ch && (
            <div className="mt-4 space-y-3 rounded-md border p-3 text-sm">
              <div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block h-1 w-5 rounded bg-signal" /> Principal ·{" "}
                  {pathDistance(ch.primary_path, net.links)} km
                </p>
                <p className="font-mono text-xs">{ch.primary_path.map(name).join(" → ")}</p>
              </div>
              {ch.secondary_path.length > 1 && (
                <div>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-block h-1 w-5 rounded border-t-2 border-dashed border-standby" /> Reserva ·{" "}
                    {pathDistance(ch.secondary_path, net.links)} km
                  </p>
                  <p className="font-mono text-xs">{ch.secondary_path.map(name).join(" → ")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>}
      <main className="relative min-h-[60vh] flex-1">
        {hidden && (
          <button onClick={() => setHidden(false)} aria-label="Mostrar barra lateral" title="Mostrar barra lateral" className="absolute left-3 top-3 z-10 rounded-md border bg-card p-2 text-foreground shadow hover:bg-muted">
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        <ClientOnly fallback={<div className="h-full w-full bg-muted" />}>
          <Suspense fallback={<div className="h-full w-full bg-muted" />}>
            <NetworkMap key={kind} kind={kind} network={net} channelId={channelId} zabbix={zbx} />
          </Suspense>
        </ClientOnly>
      </main>
    </div>
  );
}
