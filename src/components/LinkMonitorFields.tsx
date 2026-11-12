import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPadtecOpticalItems } from "@/lib/network.functions";
import type { Link } from "@/lib/network.types";
import { PADTEC_MONITOR_HOST } from "@/lib/optical-status";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const input = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export default function LinkMonitorFields({ link }: { link: Link | null }) {
  const [kind, setKind] = useState(link?.monitor_kind ?? "interface");
  const [items, setItems] = useState<Awaited<ReturnType<typeof getPadtecOpticalItems>>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadItems = useServerFn(getPadtecOpticalItems);
  const [itemId, setItemId] = useState(link?.zabbix_item ?? "");
  const [downValue, setDownValue] = useState(link?.optical_down_value ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const selected = items.find((i) => i.itemid === itemId);
  async function load() {
    setBusy(true);
    setError("");
    try { setItems(await loadItems()); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível consultar o Zabbix"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <label htmlFor="link-monitor" className="block text-xs text-muted-foreground">Monitoramento</label>
    <select id="link-monitor" name="monitor_kind" className={input} value={kind} onChange={(e) => {
      setKind(e.target.value === "padtec_loss" ? "padtec_loss" : "interface");
      setItemId(""); setDownValue(""); setConfirmed(false);
    }}>
      <option value="interface">Porta de switch / ECI · ifOperStatus</option>
      <option value="padtec_loss">Padtec · perda de sinal óptico da Line</option>
    </select>
    <label className="block text-xs text-muted-foreground" htmlFor="link-host">Host Zabbix</label>
    <input key={kind} id="link-host" name="zh" className={input} readOnly={kind === "padtec_loss"}
      defaultValue={kind === "padtec_loss" ? PADTEC_MONITOR_HOST : link?.zabbix_host ?? ""} placeholder="Ex: sw-serrinha" />
    {kind === "interface" ? <>
      <label className="block text-xs text-muted-foreground" htmlFor="link-item">Item ID · estado operacional (ifOperStatus)</label>
      <input id="link-item" name="zi" inputMode="numeric" pattern="[0-9]*" className={input} value={itemId}
        onChange={(e) => setItemId(e.target.value)} placeholder="ID do item da porta deste enlace" />
    </> : <>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={load}>
        <RefreshCw className={busy ? "animate-spin motion-reduce:animate-none" : ""} />
        {busy ? "Consultando…" : "Consultar Lines no Zabbix"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <label htmlFor="link-optical-item" className="block text-xs text-muted-foreground">Alarme Loss · equipamento / placa / Line</label>
      <select id="link-optical-item" name="zi" className={input} required value={itemId} onChange={(e) => {
        setItemId(e.target.value); setDownValue(""); setConfirmed(false);
      }}>
        <option value="">Selecione a Line…</option>
        {link?.monitor_kind === "padtec_loss" && link.zabbix_item && !items.some((i) => i.itemid === link.zabbix_item) &&
          <option value={link.zabbix_item}>Item cadastrado · {link.zabbix_item}</option>}
        {items.map((i) => <option key={i.itemid} value={i.itemid}>{i.name} · ID {i.itemid}</option>)}
      </select>
      {selected?.valuemap?.mappings?.length ? <dl className="text-xs text-muted-foreground">
        {selected.valuemap.mappings.map((m, index) => <div key={index}><dt className="inline">{m.value}: </dt><dd className="inline">{m.newvalue}</dd></div>)}
      </dl> : null}
      <label htmlFor="link-loss-value" className="block text-xs text-muted-foreground">Valor que significa perda de sinal</label>
      <select id="link-loss-value" name="optical_down_value" required value={downValue} className={input}
        onChange={(e) => { setDownValue(e.target.value); setConfirmed(false); }}>
        <option value="">Não confirmado</option><option value="1">1 = perda de sinal · 0 = sem alarme</option>
        <option value="0">0 = perda de sinal · 1 = sem alarme</option>
      </select>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Confirmei que esta Line corresponde ao trecho e que o valor escolhido significa perda de sinal.
      </label>
    </>}
  </div>;
}