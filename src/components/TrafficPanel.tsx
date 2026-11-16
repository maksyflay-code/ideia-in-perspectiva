import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { trafficQuery } from "@/lib/traffic.queries";
import type { TrafficData } from "@/lib/traffic";
import { Button } from "@/components/ui/button";

export function TrafficReadout({ data }: { data?: TrafficData }) {
  const [group, setGroup] = useState<"external" | "clients">("external");
  const value = data?.[group];
  const format = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasHistory = value?.series.some(p => p.download !== null);
  return <section aria-label="Tráfego dos switches" className="mb-3 space-y-3 border-b pb-4">
    <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Tráfego da rede</h2><span className="font-mono text-[11px] text-muted-foreground">Gbps</span></div>
    <div className="grid grid-cols-2 gap-1" role="group" aria-label="Grupo de tráfego">
      <Button size="sm" variant={group === "external" ? "secondary" : "ghost"} onClick={() => setGroup("external")} aria-pressed={group === "external"}>Internet / IX</Button>
      <Button size="sm" variant={group === "clients" ? "secondary" : "ghost"} onClick={() => setGroup("clients")} aria-pressed={group === "clients"}>Clientes</Button>
    </div>
    <dl className="grid grid-cols-2 gap-3">
      <div><dt className="flex items-center gap-1 text-xs text-signal"><ArrowDown className="h-3 w-3" />Download</dt><dd className="mt-1 font-mono text-xl tabular-nums text-signal">{format(value?.download)}</dd></div>
      <div><dt className="flex items-center gap-1 text-xs text-online"><ArrowUp className="h-3 w-3" />Upload</dt><dd className="mt-1 font-mono text-xl tabular-nums text-online">{format(value?.upload)}</dd></div>
    </dl>
    <div className="h-36 min-w-0" aria-label="Gráfico de tráfego da última hora">
      {hasHistory ? <ResponsiveContainer width="100%" height="100%"><LineChart data={value?.series} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
        <XAxis dataKey="clock" minTickGap={32} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickFormatter={n => new Date(Number(n) * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} />
        <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} width={42} />
        <Tooltip labelFormatter={n => new Date(Number(n) * 1000).toLocaleTimeString("pt-BR")} formatter={(n: number) => `${format(n)} Gbps`} contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
        <Line dataKey="download" name="Download" stroke="var(--signal)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line dataKey="upload" name="Upload" stroke="var(--online)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center border-y border-dashed text-xs text-muted-foreground">{!value?.count ? "Nenhuma porta configurada" : "Histórico indisponível"}</div>}
    </div>
    <p className="text-[11px] text-muted-foreground">Última hora · {value?.count ?? 0} portas{data?.at ? ` · ${new Date(data.at * 1000).toLocaleTimeString("pt-BR")}` : ""}</p>
    {data?.error && <p role="status" className="text-xs text-destructive">{data.error}</p>}
    {!!value?.missing && <p role="status" className="text-xs text-standby">{value.missing} porta(s) sem leitura válida; total indisponível.</p>}
    {data?.historyError && <p className="text-xs text-standby">Histórico indisponível no Zabbix.</p>}
  </section>;
}
export default function TrafficPanel() {
  const { data, isPending, isError } = useQuery(trafficQuery);
  return <>{isPending && <p className="mb-2 text-xs text-muted-foreground">Consultando tráfego…</p>}{isError && <p className="mb-2 text-xs text-destructive">Tráfego indisponível.</p>}<TrafficReadout data={data} /></>;
}