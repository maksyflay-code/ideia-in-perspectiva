import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";

const COOKIE = "mapa_admin";
const MAX_AGE = 60 * 60 * 12; // 12h

function secret() {
  return process.env["SESSION_SECRET"] || "troque-este-segredo";
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, "");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export type Role = "admin" | "viewer";

// MAP_USERS="nome:senha,nome2:senha2" — usuários que só visualizam o mapa.
function mapUsers(): [string, string][] {
  return (process.env["MAP_USERS"] || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.indexOf(":");
      return [x.slice(0, i), x.slice(i + 1)] as [string, string];
    })
    .filter(([u, p]) => u && p);
}

export function checkCredentials(user: string, pass: string): Role | null {
  const u = process.env["ADMIN_USER"] || "admin";
  const p = process.env["ADMIN_PASSWORD"] || "admin";
  if (safeEqual(user, u) && safeEqual(pass, p)) return "admin";
  let ok = false;
  for (const [mu, mp] of mapUsers()) if (safeEqual(user, mu) && safeEqual(pass, mp)) ok = true;
  return ok ? "viewer" : null;
}

export async function startSession(user: string, role: Role) {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `${user}.${role}.${exp}`;
  setCookie(COOKIE, `${payload}.${await hmac(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env["COOKIE_SECURE"] === "1",
  });
}

export function endSession() {
  deleteCookie(COOKIE, { path: "/" });
}

export async function currentUser(): Promise<{ user: string; role: Role } | null> {
  const raw = getCookie(COOKIE);
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [user = "", role = "", exp = "", sig = ""] = parts;
  if (role !== "admin" && role !== "viewer") return null;
  if (Number(exp) < Date.now()) return null;
  if (!safeEqual(sig, await hmac(`${user}.${role}.${exp}`))) return null;
  return { user, role };
}

export async function currentAdmin(): Promise<string | null> {
  const u = await currentUser();
  return u?.role === "admin" ? u.user : null;
}

export async function requireViewer() {
  const u = await currentUser();
  if (!u) throw new Error("Não autorizado");
  return u;
}

export async function requireAdmin() {
  const u = await currentAdmin();
  if (!u) throw new Error("Não autorizado");
  return u;
}
