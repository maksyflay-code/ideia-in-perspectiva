import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { meQuery, networkQuery } from "@/lib/network.queries";
import { PENDING_NOTE, deleteItem, importZabbixHosts, login, logout, saveChannel, saveLink, savePop } from "@/lib/network.functions";
import { missingHops, type Channel, type Link as FiberLink, type Network, type Pop } from "@/lib/network.types";
import LinkMonitorFields from "@/components/LinkMonitorFields";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Rede IVI Telecom" },
      { name: "description", content: "Cadastro de POPs, ligações de fibra e canais DWDM." },
      { property: "og:title", content: "Admin — Rede IVI Telecom" },
      { property: "og:description", content: "Cadastro de POPs, ligações de fibra e canais DWDM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me.user) await context.queryClient.ensureQueryData(networkQuery);
  },
  component: AdminPage,
});

const input = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const btn = "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";
const ghost = "rounded-md border px-3 py-1.5 text-xs hover:bg-muted";

function AdminPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  return me.user ? <Panel user={me.user} /> : <LoginForm />;
}

function LoginForm() {
  const qc = useQueryClient();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr("");
    const r = await login({ data: { user: String(f.get("user")), password: String(f.get("password")) } });
    setBusy(false);
    if (!r.ok) return setErr("Usuário ou senha inválidos");
    if (r.role !== "admin") return setErr("Este usuário só tem acesso ao mapa");
    await qc.invalidateQueries();
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6">
        <h1 className="font-mono text-sm font-bold tracking-widest text-primary">MAPA DWDM · ADMIN</h1>
        <input name="user" placeholder="Usuário" className={input} required />
        <input name="password" type="password" placeholder="Senha" className={input} required />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <button className={`${btn} w-full`} disabled={busy}>Entrar</button>
        <Link to="/" className="block text-center text-xs text-muted-foreground hover:text-foreground">← Voltar ao mapa</Link>
      </form>
    </div>
  );
}

type Tab = "pops" | "links" | "channels";

function Panel({ user }: { user: string }) {
  const qc = useQueryClient();
  const { data: net } = useSuspenseQuery(networkQuery);
  const [tab, setTab] = useState<Tab>("pops");
  const refresh = () => qc.invalidateQueries({ queryKey: ["network"] });

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-sm font-bold tracking-widest text-primary">PAINEL ADMIN</h1>
          <p className="text-xs text-muted-foreground">Conectado como {user}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/" className={ghost}>Ver mapa</Link>
          <button
            className={ghost}
            onClick={async () => {
              await logout();
              qc.invalidateQueries({ queryKey: ["me"] });
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <nav className="mb-6 flex gap-1 border-b">
        {([
          ["pops", `POPs (${net.pops.length})`],
          ["links", `Ligações (${net.links.length})`],
          ["channels", `Canais (${net.channels.length})`],
        ] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "pops" && <PopsTab net={net} onChange={refresh} />}
      {tab === "links" && <LinksTab net={net} onChange={refresh} />}
      {tab === "channels" && <ChannelsTab net={net} onChange={refresh} />}
    </div>
  );
}

function useSaver(onChange: () => void) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      onChange();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { err, busy, run };
}

function Layout({ form, list }: { form: ReactNode; list: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="rounded-lg border bg-card p-4">{form}</div>
      <div className="overflow-x-auto rounded-lg border bg-card">{list}</div>
    </div>
  );
}

function Del({ kind, id, onChange }: { kind: Tab; id: number; onChange: () => void }) {
  return (
    <button
      className="text-xs text-destructive hover:underline"
      onClick={async () => {
        if (!confirm("Excluir este item?")) return;
        await deleteItem({ data: { kind, id } });
        onChange();
      }}
    >
      Excluir
    </button>
  );
}

const th = "px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground";
const td = "border-t px-3 py-2 text-sm";

function PopsTab({ net, onChange }: { net: Network; onChange: () => void }) {
  const [edit, setEdit] = useState<Pop | null>(null);
  const s = useSaver(onChange);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await s.run(() =>
      savePop({
        data: {
          id: edit?.id,
          name: String(f.get("name")),
          city: String(f.get("city")),
          lat: Number(String(f.get("lat")).replace(",", ".")),
          lng: Number(String(f.get("lng")).replace(",", ".")),
          notes: String(f.get("notes") ?? ""),
        },
      }),
    );
    if (ok) {
      form.reset();
      setEdit(null);
    }
  }
  return (
    <Layout
      form={
        <form key={edit?.id ?? "new"} onSubmit={submit} className="space-y-3">
          <h2 className="text-sm font-semibold">{edit ? "Editar POP" : "Novo POP"}</h2>
          <input name="name" placeholder="Nome (ex: POP-SSA-01)" defaultValue={edit?.name} className={input} required />
          <input name="city" placeholder="Cidade" defaultValue={edit?.city} className={input} required />
          <div className="grid grid-cols-2 gap-2">
            <input name="lat" placeholder="Latitude" defaultValue={edit?.lat} className={input} required />
            <input name="lng" placeholder="Longitude" defaultValue={edit?.lng} className={input} required />
          </div>
          <textarea name="notes" placeholder="Observações" defaultValue={edit?.notes} className={input} rows={2} />
          {s.err && <p className="text-sm text-destructive">{s.err}</p>}
          <div className="flex gap-2">
            <button className={btn} disabled={s.busy}>Salvar</button>
            {edit && <button type="button" className={ghost} onClick={() => setEdit(null)}>Cancelar</button>}
          </div>
          <p className="text-xs text-muted-foreground">Dica: copie as coordenadas clicando com o botão direito no Google Maps.</p>
          <ZabbixImport onChange={onChange} />
        </form>
      }
      list={
        <table className="w-full">
          <thead><tr><th className={th}>Nome</th><th className={th}>Cidade</th><th className={th}>Lat, Lng</th><th className={th} /></tr></thead>
          <tbody>
            {net.pops.map((p) => (
              <tr key={p.id}>
                <td className={`${td} font-mono`}>
                  {p.name}
                  {p.notes === PENDING_NOTE && <span className="ml-2 rounded bg-standby/20 px-1.5 py-0.5 font-sans text-[10px] text-standby">sem localização</span>}
                </td>
                <td className={td}>{p.city}</td>
                <td className={`${td} font-mono text-xs text-muted-foreground`}>{p.lat}, {p.lng}</td>
                <td className={`${td} space-x-3 text-right`}>
                  <button className="text-xs text-primary hover:underline" onClick={() => setEdit(p)}>Editar</button>
                  <Del kind="pops" id={p.id} onChange={onChange} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

function ZabbixImport({ onChange }: { onChange: () => void }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  async function run(prefix: string, label: string) {
    setBusy(prefix);
    setMsg("");
    try {
      const r = await importZabbixHosts({ data: { prefix } });
      setMsg(`${r.found} ${label} no Zabbix · ${r.added} novos cadastrados`);
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao importar");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-xs font-semibold">Importar do Zabbix</p>
      <p className="text-xs text-muted-foreground">Cria um POP para cada equipamento que ainda não está cadastrado. Depois edite a latitude/longitude de cada um.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={ghost} disabled={!!busy} onClick={() => run("sw-", "switches")}>
          {busy === "sw-" ? "Importando…" : "Importar switches (sw-)"}
        </button>
        <button type="button" className={ghost} disabled={!!busy} onClick={() => run("eci-", "DWDM ECI")}>
          {busy === "eci-" ? "Importando…" : "Importar DWDM ECI (eci-)"}
        </button>
        <button type="button" className={ghost} disabled={!!busy} onClick={() => run("padtec-", "sites Padtec")}>
          {busy === "padtec-" ? "Importando…" : "Importar DWDM Padtec"}
        </button>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

function PopSelect({ name, net, value }: { name: string; net: Network; value?: number | undefined }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={input} required>
      <option value="" disabled>Selecione…</option>
      {net.pops.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.city}</option>)}
    </select>
  );
}

function LinksTab({ net, onChange }: { net: Network; onChange: () => void }) {
  const [edit, setEdit] = useState<FiberLink | null>(null);
  const s = useSaver(onChange);
  const name = (id: number) => net.pops.find((p) => p.id === id)?.name ?? "?";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const from = Number(f.get("from"));
    const to = Number(f.get("to"));
    if (from === to) {
      await s.run(async () => { throw new Error("Origem e destino devem ser diferentes"); });
      return;
    }
    const ok = await s.run(() =>
      saveLink({
        data: {
          id: edit?.id,
          from_pop: from,
          to_pop: to,
          distance_km: Number(String(f.get("km")).replace(",", ".")),
          zabbix_host: String(f.get("zh") ?? ""),
          zabbix_item: String(f.get("zi") ?? ""),
          monitor_kind: f.get("monitor_kind") === "padtec_loss" ? "padtec_loss" : "interface",
          optical_down_value: f.get("optical_down_value") === "1" ? "1" : f.get("optical_down_value") === "0" ? "0" : "",
        },
      }),
    );
    if (ok) {
      form.reset();
      setEdit(null);
    }
  }
  return (
    <Layout
      form={
        <form key={edit?.id ?? "new"} onSubmit={submit} className="space-y-3">
          <h2 className="text-sm font-semibold">{edit ? "Editar ligação" : "Nova ligação de fibra"}</h2>
          <label className="block text-xs text-muted-foreground">Origem</label>
          <PopSelect name="from" net={net} value={edit?.from_pop} />
          <label className="block text-xs text-muted-foreground">Destino</label>
          <PopSelect name="to" net={net} value={edit?.to_pop} />
          <input name="km" placeholder="Distância (km)" defaultValue={edit?.distance_km} className={input} required />
          <LinkMonitorFields link={edit} />
          {s.err && <p className="text-sm text-destructive">{s.err}</p>}
          <div className="flex gap-2">
            <button className={btn} disabled={s.busy || net.pops.length < 2}>Salvar</button>
            {edit && <button type="button" className={ghost} onClick={() => setEdit(null)}>Cancelar</button>}
          </div>
        </form>
      }
      list={
        <table className="w-full">
          <thead><tr><th className={th}>Trecho</th><th className={th}>km</th><th className={th}>Zabbix</th><th className={th} /></tr></thead>
          <tbody>
            {net.links.map((l) => (
              <tr key={l.id}>
                <td className={`${td} font-mono`}>{name(l.from_pop)} ↔ {name(l.to_pop)}</td>
                <td className={td}>{l.distance_km}</td>
                <td className={`${td} text-xs text-muted-foreground`}>{l.zabbix_host || "—"}{l.monitor_kind === "padtec_loss" && <div>Loss · ID {l.zabbix_item}</div>}</td>
                <td className={`${td} space-x-3 text-right`}>
                  <button className="text-xs text-primary hover:underline" onClick={() => setEdit(l)}>Editar</button>
                  <Del kind="links" id={l.id} onChange={onChange} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

function PathBuilder({ label, net, path, setPath }: { label: string; net: Network; path: number[]; setPath: (p: number[]) => void }) {
  const [pick, setPick] = useState("");
  const name = (id: number) => net.pops.find((p) => p.id === id)?.name ?? "?";
  const gaps = missingHops(path, net.links);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex min-h-9 flex-wrap gap-1 rounded-md border bg-background p-2">
        {path.length === 0 && <span className="text-xs text-muted-foreground">Adicione os POPs na ordem</span>}
        {path.map((id, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs">
            {name(id)}
            <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setPath(path.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className={input}>
          <option value="">Selecione um POP…</option>
          {net.pops.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" className={ghost} disabled={!pick} onClick={() => { setPath([...path, Number(pick)]); setPick(""); }}>+</button>
      </div>
      {gaps.length > 0 && (
        <p className="text-xs text-standby">
          Sem ligação cadastrada: {gaps.map(([a, b]) => `${name(a)}→${name(b)}`).join(", ")}
        </p>
      )}
    </div>
  );
}

function ChannelsTab({ net, onChange }: { net: Network; onChange: () => void }) {
  const [edit, setEdit] = useState<Channel | null>(null);
  const [nameV, setName] = useState("");
  const [primary, setPrimary] = useState<number[]>([]);
  const [secondary, setSecondary] = useState<number[]>([]);
  const s = useSaver(onChange);
  const popName = (id: number) => net.pops.find((p) => p.id === id)?.name ?? "?";
  function load(c: Channel | null) {
    setEdit(c);
    setName(c?.name ?? "");
    setPrimary(c?.primary_path ?? []);
    setSecondary(c?.secondary_path ?? []);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (primary.length < 2) {
      await s.run(async () => { throw new Error("A rota principal precisa de pelo menos 2 POPs"); });
      return;
    }
    const ok = await s.run(() => saveChannel({ data: { id: edit?.id, name: nameV, primary_path: primary, secondary_path: secondary } }));
    if (ok) load(null);
  }
  return (
    <Layout
      form={
        <form onSubmit={submit} className="space-y-4">
          <h2 className="text-sm font-semibold">{edit ? "Editar canal" : "Novo canal DWDM"}</h2>
          <input value={nameV} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex: CH-01 SSA-VDC)" className={input} required />
          <PathBuilder label="Rota principal" net={net} path={primary} setPath={setPrimary} />
          <PathBuilder label="Rota reserva (opcional)" net={net} path={secondary} setPath={setSecondary} />
          {s.err && <p className="text-sm text-destructive">{s.err}</p>}
          <div className="flex gap-2">
            <button className={btn} disabled={s.busy}>Salvar</button>
            {edit && <button type="button" className={ghost} onClick={() => load(null)}>Cancelar</button>}
          </div>
        </form>
      }
      list={
        <table className="w-full">
          <thead><tr><th className={th}>Canal</th><th className={th}>Principal</th><th className={th}>Reserva</th><th className={th} /></tr></thead>
          <tbody>
            {net.channels.map((c) => (
              <tr key={c.id}>
                <td className={`${td} font-mono`}>{c.name}</td>
                <td className={`${td} font-mono text-xs`}>{c.primary_path.map(popName).join(" → ")}</td>
                <td className={`${td} font-mono text-xs text-muted-foreground`}>{c.secondary_path.map(popName).join(" → ") || "—"}</td>
                <td className={`${td} space-x-3 text-right`}>
                  <button className="text-xs text-primary hover:underline" onClick={() => load(c)}>Editar</button>
                  <Del kind="channels" id={c.id} onChange={onChange} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}
