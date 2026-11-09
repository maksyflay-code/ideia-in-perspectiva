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

export function checkCredentials(user: string, pass: string) {
  const u = process.env["ADMIN_USER"] || "admin";
  const p = process.env["ADMIN_PASSWORD"] || "admin";
  return safeEqual(user, u) && safeEqual(pass, p);
}

export async function startSession(user: string) {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `${user}.${exp}`;
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

export async function currentAdmin(): Promise<string | null> {
  const raw = getCookie(COOKIE);
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [user = "", exp = "", sig = ""] = parts;
  if (Number(exp) < Date.now()) return null;
  if (!safeEqual(sig, await hmac(`${user}.${exp}`))) return null;
  return user;
}

export async function requireAdmin() {
  const u = await currentAdmin();
  if (!u) throw new Error("Não autorizado");
  return u;
}
