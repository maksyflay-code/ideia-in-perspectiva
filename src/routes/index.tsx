import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { networkQuery, zabbixQuery } from "@/lib/network.queries";
import { pathDistance } from "@/lib/network.types";

const NetworkMap = lazy(() => import("@/components/NetworkMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rede IVI Telecom" },
      { name: "description", content: "Mapa interativo da rede DWDM com POPs, ligações e rotas de canais." },
      { property: "og:title", content: "Rede IVI Telecom" },
      { property: "og:description", content: "Mapa interativo da rede DWDM com POPs, ligações e rotas de canais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(networkQuery),
  component: MapPage,
});

function MapPage() {
  const { data: net } = useSuspenseQuery(networkQuery);
  const [channelId, setChannelId] = useState<number | null>(null);
  const { data: zbx } = useQuery(zabbixQuery);
  const zc = { ok: 0, warn: 0, down: 0, unknown: 0 };
  if (zbx?.enabled) for (const p of net.pops) zc[zbx.byName[p.name]?.state ?? "unknown"]++;
  const ch = net.channels.find((c) => c.id === channelId);
  const name = (id: number) => net.pops.find((p) => p.id === id)?.name ?? "?";

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <aside className="flex w-full flex-col border-b bg-card md:w-80 md:border-b-0 md:border-r">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h1 className="font-mono text-sm font-bold tracking-widest text-primary">REDE IVI TELECOM</h1>
            <p className="text-xs text-muted-foreground">
              {net.pops.length} POPs · {net.links.length} ligações
            </p>
          </div>
          <Link to="/admin" className="text-xs text-muted-foreground hover:text-foreground">
            Admin →
          </Link>
        </header>
        {zbx?.enabled && (
          <div className="border-b px-4 py-2 text-xs">
            {zbx.error ? (
              <p className="text-destructive">Zabbix indisponível: {zbx.error}</p>
            ) : (
              <p className="flex flex-wrap gap-3 text-muted-foreground">
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-online" />{zc.ok} ok</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-standby" />{zc.warn} alerta</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-destructive" />{zc.down} crítico</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-muted-foreground" />{zc.unknown} sem host</span>
              </p>
            )}
          </div>
        )}
        <div className="flex-1 overflow-auto p-3">
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
      </aside>
      <main className="relative min-h-[60vh] flex-1">
        <ClientOnly fallback={<div className="h-full w-full bg-muted" />}>
          <Suspense fallback={<div className="h-full w-full bg-muted" />}>
            <NetworkMap network={net} channelId={channelId} zabbix={zbx} />
          </Suspense>
        </ClientOnly>
      </main>
    </div>
  );
}
