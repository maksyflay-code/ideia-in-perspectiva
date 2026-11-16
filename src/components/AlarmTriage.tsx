import { useMemo, useState } from "react";
import { ClipboardSearch, X } from "lucide-react";
import { filterPops, triageAlarm } from "@/lib/alarm-triage";
import type { Confidence } from "@/lib/alarm-triage";
import type { Network } from "@/lib/network.types";

const BADGE: Record<Confidence, string> = {
  alta: "bg-secondary text-secondary-foreground",
  media: "border border-standby/60 text-standby",
  baixa: "border border-border text-muted-foreground",
};

export default function AlarmTriage({ network }: { network: Network }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const result = useMemo(() => triageAlarm({ text, selected, network }), [text, selected, network]);
  const matches = useMemo(() => filterPops(query, network.pops), [query, network.pops]);

  function toggle(name: string) {
    setSelected((current) => (current.includes(name) ? current.filter((n) => n !== name) : [...current, name]));
  }

  return (
    <section className="mb-3 border-b pb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-muted"
      >
        <span className="flex items-center gap-2">
          <ClipboardSearch className="h-4 w-4 text-brand-light" />
          Alarme → trecho provável
        </span>
        <span className="text-xs text-muted-foreground">{open ? "ocultar" : "abrir"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground" htmlFor="alarm-text">
            Texto do alarme
          </label>
          <textarea
            id="alarm-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="Cole aqui o alarme do Zabbix"
            className="w-full rounded-md border bg-background p-2 font-mono text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />

          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground" htmlFor="alarm-device">
            Equipamentos
          </label>
          <input
            id="alarm-device"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar POP do mapa"
            className="w-full rounded-md border bg-background p-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {matches.length > 0 && (
            <ul className="max-h-32 overflow-auto rounded-md border">
              {matches.map((pop) => (
                <li key={pop.id}>
                  <button
                    onClick={() => {
                      toggle(pop.name);
                      setQuery("");
                    }}
                    className="w-full px-2 py-1 text-left font-mono text-xs hover:bg-muted"
                  >
                    {pop.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {selected.map((name) => (
                <li key={name}>
                  <button
                    onClick={() => toggle(name)}
                    aria-label={`Remover ${name}`}
                    className="flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 font-mono text-[11px] hover:bg-accent"
                  >
                    {name}
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {result.devices.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Reconhecidos: {result.devices.map((d) => `${d.name}${d.via === "texto" ? " (no texto)" : ""}`).join(", ")}
            </p>
          )}
          {result.signals.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Leitura do alarme: {result.signals.join(", ")}.</p>
          )}

          {result.candidates.length > 0 && (
            <ul className="space-y-1">
              {result.candidates.map((c) => (
                <li key={c.linkId} className="rounded-md border p-2">
                  <p className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">
                      {c.from} ↔ {c.to}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${BADGE[c.confidence]}`}>
                      {c.confidence}
                    </span>
                  </p>
                  {c.reasons.map((reason) => (
                    <p key={reason} className="mt-1 text-[11px] text-muted-foreground">
                      {reason}
                    </p>
                  ))}
                  <p className={`mt-1 text-[11px] ${c.monitored ? "text-muted-foreground" : "text-standby"}`}>
                    {c.monitored ? c.monitor : "Sem monitoramento — o mapa não muda sozinho"}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {result.note && <p className="text-[11px] text-muted-foreground">{result.note}</p>}
          <p className="text-[11px] text-muted-foreground">
            Nada é alterado no mapa: isto é só uma sugestão a partir das ligações cadastradas.
          </p>
        </div>
      )}
    </section>
  );
}
