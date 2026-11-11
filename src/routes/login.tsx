import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { login } from "@/lib/network.functions";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar · Rede IVI Telecom" },
      { name: "description", content: "Acesso restrito ao mapa da Rede IVI Telecom." },
      { property: "og:title", content: "Entrar · Rede IVI Telecom" },
      { property: "og:description", content: "Acesso restrito ao mapa da Rede IVI Telecom." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

const input = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function LoginPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr("");
    const r = await login({ data: { user: String(f.get("user")).trim(), password: String(f.get("password")) } });
    setBusy(false);
    if (!r.ok) return setErr("Usuário ou senha inválidos");
    qc.clear();
    navigate({ to: "/" });
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6">
        <h1 className="font-mono text-sm font-bold tracking-widest text-primary">REDE IVI TELECOM</h1>
        <p className="text-xs text-muted-foreground">Acesso restrito. Entre com seu usuário e senha.</p>
        <input name="user" aria-label="Usuário" placeholder="Usuário" autoComplete="username" className={input} required />
        <input name="password" aria-label="Senha" type="password" placeholder="Senha" autoComplete="current-password" className={input} required />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <button className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50" disabled={busy}>Entrar</button>
      </form>
    </div>
  );
}
