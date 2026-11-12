import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewDwdmLinks, importDwdmLinks, importConfirmedEciRing, applyConfirmedEciMonitoring, connectConfirmedIrece, importConfirmedPadtecRings } from "@/lib/network.functions";
import type { DwdmKind } from "@/lib/dwdm-discovery";

export default function DwdmImport({ onChange }: { onChange: () => void }) {
  const reviewFn = useServerFn(reviewDwdmLinks);
  const importFn = useServerFn(importDwdmLinks);
  const ringFn = useServerFn(importConfirmedEciRing);
  const monitoringFn = useServerFn(applyConfirmedEciMonitoring);
  const ireceFn = useServerFn(connectConfirmedIrece);
  const padtecRingsFn = useServerFn(importConfirmedPadtecRings);
  const [kind, setKind] = useState<DwdmKind>("padtec");
  const [review, setReview] = useState<Awaited<ReturnType<typeof reviewDwdmLinks>> | null>(null);
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const choices = (review?.references ?? []).filter((r) => selected[r.key] && destinations[r.key]).map((r) => ({ key: r.key, to: destinations[r.key] ?? "" }));
  async function savePadtecRings() {
    setBusy(true); setMsg("");
    try {
      const r = await padtecRingsFn();
      setMsg(`Anéis Padtec: ${r.added} ligações criadas · ${r.existed} já existentes · novas ligações sem monitoramento`);
      onChange();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Não foi possível importar os anéis Padtec"); }
    finally { setBusy(false); }
  }
  async function addIrece() {
    setBusy(true); setMsg("");
    try {
      const r = await ireceFn();
      setMsg(`Irecê ↔ Cafarnaum: ${r.added} ligação criada · ${r.applied} monitoramento OSC aplicado · ${r.unchanged} já configurado · ${r.preserved} outro monitoramento preservado`);
      onChange();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Não foi possível conectar Irecê"); }
    finally { setBusy(false); }
  }
  async function applyMonitoring() {
    setBusy(true); setMsg("");
    try {
      const r = await monitoringFn();
      setMsg(`Estado OSC: ${r.applied} aplicadas · ${r.unchanged} já configuradas · ${r.preserved} com outro monitoramento preservado · ${r.missing} trechos não cadastrados. Não inclui potência óptica nem tráfego.`);
      onChange();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Não foi possível aplicar o monitoramento ECI"); }
    finally { setBusy(false); }
  }
  async function saveRing() {
    setBusy(true); setMsg("");
    try {
      const r = await ringFn();
      setMsg(`Anel ECI: ${r.added} ligações criadas · ${r.existed} já existentes · novas ligações sem monitoramento`);
      onChange();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Não foi possível importar o anel ECI"); }
    finally { setBusy(false); }
  }
  async function consult(k: DwdmKind) {
    setBusy(true); setMsg(""); setReview(null); setConfirmed(false); setKind(k);
    try {
      const r = await reviewFn({ data: { kind: k } });
      setReview(r); setDestinations(Object.fromEntries(r.references.map((x) => [x.key, x.suggestedTo]))); setSelected({});
    } catch (e) { setMsg(e instanceof Error ? e.message : "Não foi possível consultar o Zabbix"); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!confirmed || !choices.length) return;
    setBusy(true); setMsg("");
    try {
      const r = await importFn({ data: { kind, choices, confirmed: true } });
      setMsg(`${r.added} ligações criadas · ${r.existed} já existentes · ${r.unmonitored} sem monitoramento`);
      setSelected({}); setConfirmed(false); onChange();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Não foi possível importar"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={saveRing}><Download />Importar anel ECI (11 ligações)</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={savePadtecRings}><Download />Importar anéis Padtec (25 ligações)</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={applyMonitoring}><Activity />Aplicar monitoramento OSC do anel ECI</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={addIrece}><Activity />Conectar Irecê a Cafarnaum com OSC</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => consult("padtec")}><Search />Consultar todas as saídas Padtec</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => consult("eci")}><Search />Consultar todas as ligações ECI</Button>
    </div>
    {busy && <p role="status" className="text-xs text-muted-foreground">Consultando…</p>}
    {review && <section role="dialog" aria-modal="true" className="fixed inset-4 z-50 overflow-auto rounded-lg border bg-background p-4 shadow-xl md:inset-8 md:p-6" aria-label="Revisão DWDM">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{kind === "padtec" ? "Padtec" : "ECI"} · {review.itemCount} itens · {review.references.length} referências</h3>
        <Button type="button" variant="ghost" size="icon" aria-label="Fechar revisão" onClick={() => setReview(null)}><X /></Button>
      </div>
      <p className="text-xs text-destructive">Referências de circuito não confirmam trechos físicos diretos. Padtec e OSC entram sem monitoramento de tráfego.</p>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-left text-xs"><thead><tr className="border-b"><th className="p-2">Importar</th><th className="p-2">Origem / referência Zabbix</th><th className="p-2">Destino confirmado</th><th className="p-2">Monitoramento</th></tr></thead>
          <tbody>{review.references.map((r) => {
            const sourceExists = review.pops.some((p) => p.name === r.from);
            return <tr key={r.key} className="border-b">
              <td className="p-2"><input type="checkbox" aria-label={`Importar ${r.key}`} disabled={busy || !sourceExists || !destinations[r.key]} checked={!!selected[r.key]} onChange={(e) => setSelected({ ...selected, [r.key]: e.target.checked })} /></td>
              <td className="min-w-48 p-2"><strong>{r.from}</strong>{!sourceExists && <span className="block text-destructive">POP não cadastrado</span>}<details><summary className="cursor-pointer text-muted-foreground">{r.destination || "Sem destino no nome"} · {r.evidence.length} itens</summary>{r.evidence.map((name) => <p key={name} className="max-w-md break-words py-1">{name}</p>)}</details></td>
              <td className="p-2"><select aria-label={`Destino ${r.key}`} className="max-w-56 rounded-md border bg-background p-2" value={destinations[r.key] ?? ""} disabled={busy} onChange={(e) => { setDestinations({ ...destinations, [r.key]: e.target.value }); setSelected({ ...selected, [r.key]: false }); }}><option value="">Pendente de confirmação</option>{review.pops.filter((p) => p.name !== r.from).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</select></td>
              <td className="p-2">{r.monitorable ? `ODU · ID ${r.item}` : "Sem monitoramento"}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />Confirmo os destinos e os trechos físicos das ligações selecionadas.</label>
      <Button type="button" size="sm" disabled={busy || !confirmed || !choices.length} onClick={save}><Download />Importar selecionadas ({choices.length})</Button>
    </section>}
    {msg && <p role="status" className="text-xs text-muted-foreground">{msg}</p>}
  </div>;
}