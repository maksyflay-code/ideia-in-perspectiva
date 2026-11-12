import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { login } from "@/lib/network.functions";
import Brand from "@/components/Brand";
import { Button } from "@/components/ui/button";
import loginBackground from "@/assets/ivi-login-network.jpg";
import { ArrowRight, LockKeyhole } from "lucide-react";

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
    <div className="relative isolate flex min-h-svh items-center justify-center overflow-hidden p-5 sm:p-8 lg:justify-end lg:px-24">
      <img src={loginBackground} alt="" width={1920} height={1088} fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover object-left" />
      <div className="absolute inset-0 -z-10 bg-login-shade" />
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-lg border border-card/70 bg-card/95 p-7 backdrop-blur-sm sm:p-8">
        <div className="-mx-7 -mt-7 mb-7 rounded-t-lg bg-primary px-7 py-6 text-primary-foreground sm:-mx-8 sm:-mt-8 sm:px-8"><Brand /></div>
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" /> Acesso restrito</div>
          <h1 className="text-xl font-semibold text-primary">Rede IVI Telecom</h1>
        </div>
        <div className="space-y-2"><label htmlFor="login-user" className="text-sm font-medium">Usuário</label><input id="login-user" name="user" aria-label="Usuário" placeholder="Seu usuário" autoComplete="username" className={input} required /></div>
        <div className="space-y-2"><label htmlFor="login-password" className="text-sm font-medium">Senha</label><input id="login-password" name="password" aria-label="Senha" type="password" placeholder="Sua senha" autoComplete="current-password" className={input} required /></div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button className="h-10 w-full" disabled={busy}>Entrar <ArrowRight className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
