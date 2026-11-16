import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Save, RotateCw } from "lucide-react";
import { trafficSettingsQuery } from "@/lib/traffic.queries";
import { saveTrafficSettings } from "@/lib/traffic.functions";
import type { TrafficSelection } from "@/lib/traffic";
import { Button } from "@/components/ui/button";

export default function TrafficSettings() {
  const { data, isPending, refetch } = useQuery(trafficSettingsQuery);
  const save = useServerFn(saveTrafficSettings);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<TrafficSelection[] | null>(null);
  const [search, setSearch] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected = draft ?? data?.selected ?? [];
  const ports = (data?.ports ?? []).filter(p => `${p.host} ${p.label}`.toLowerCase().includes(search.toLowerCase()));
  async function submit() {
    setBusy(true); setMessage("");
    try {
      await save({ data: { selections: selected, confirmed: true } });
      await qc.invalidateQueries({ queryKey: ["traffic-settings"] });
      await qc.invalidateQueries({ queryKey: ["traffic"] });
      setDraft(null); setConfirmed(false); setMessage("Portas salvas para os medidores do mapa SW.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Portas dos medidores de tráfego</h2><Button variant="outline" size="icon" title="Recarregar portas" aria-label="Recarregar portas" onClick={() => refetch()}><RotateCw className="h-4 w-4" /></Button></div>
    <p className="text-sm text-muted-foreground">Internet / IX: conexões externas. Clientes: entrega aos clientes. Exclua transporte entre switches e escolha o LAG ou suas portas físicas, nunca ambos.</p>
    <input aria-label="Buscar porta de tráfego" placeholder="Buscar switch ou porta" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
    {isPending && <p>Consultando portas…</p>}{data?.error && <p role="status" className="text-destructive">{data.error}</p>}
    <div className="max-h-[480px] overflow-auto border">
      <table className="w-full text-sm"><thead className="sticky top-0 bg-card"><tr><th className="p-2 text-left">Switch / porta</th><th className="p-2 text-left">Grupo</th></tr></thead><tbody>
        {ports.map(p => <tr key={p.id} className="border-t"><td className="p-2"><p className="font-mono text-xs">{p.host}</p><p className="break-words text-xs text-muted-foreground">{p.label}</p></td><td className="p-2"><select aria-label={`Grupo de ${p.host} ${p.label}`} className="max-w-full rounded-md border bg-background p-2 text-xs" value={selected.find(s => s.portId === p.id)?.group ?? ""} onChange={e => { const group = e.target.value; setDraft([...selected.filter(s => s.portId !== p.id), ...(group === "external" || group === "clients" ? [{ portId: p.id, group }] as TrafficSelection[] : [])]); setConfirmed(false); }}><option value="">Não somar</option><option value="external">Internet / IX</option><option value="clients">Clientes</option></select></td></tr>)}
      </tbody></table>
      {!isPending && !ports.length && <p className="p-3 text-xs text-muted-foreground">Nenhuma porta encontrada.</p>}
    </div>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo que excluí transporte interno e não contei LAG e portas físicas do mesmo circuito juntos.</label>
    <Button disabled={!confirmed || busy || !!data?.error || isPending} onClick={submit}><Save className="mr-2 h-4 w-4" />{busy ? "Salvando…" : `Salvar ${selected.length} portas`}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}