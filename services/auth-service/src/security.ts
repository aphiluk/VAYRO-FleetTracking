import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config";

// Passwords: Bun's built-in argon2id.
export const hashPassword = (password: string) => Bun.password.hash(password);
export const verifyPassword = (password: string, hash: string) => Bun.password.verify(password, hash);

// Verified against when the email is unknown, so unknown emails cost the same time as wrong passwords.
export const DUMMY_HASH = await Bun.password.hash("dummy-password-for-timing");

const b64u = (input: Buffer | string) => Buffer.from(input).toString("base64url");
const sign = (data: string) => createHmac("sha256", config.jwtSecret).update(data).digest();
const HEADER = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export interface AccessClaims {
  sub: string;
  role: string;
  cid: string | null;
  sid: string;
}

export function signAccessToken(claims: AccessClaims): string {
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(JSON.stringify({ ...claims, iat: now, exp: now + config.accessTtlSeconds }));
  return `${HEADER}.${body}.${b64u(sign(`${HEADER}.${body}`))}`;
}

export function verifyAccessToken(token: string): AccessClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== HEADER) return null; // pins alg: rejects "none"/other algs
  const given = Buffer.from(parts[2]!, "base64url");
  const expected = sign(`${parts[0]}.${parts[1]}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= Date.now() / 1000) return null;
    if (typeof payload.sub !== "string" || !/^[1-9]\d{0,18}$/.test(payload.sub)) return null;
    if (typeof payload.sid !== "string" || !/^[1-9]\d{0,18}$/.test(payload.sid)) return null;
    if (!["platform_admin", "company_admin", "dispatcher", "driver"].includes(payload.role)) return null;
    if (payload.cid !== null && (typeof payload.cid !== "string" || !/^[1-9]\d{0,18}$/.test(payload.cid))) return null;
    return { sub: payload.sub, role: payload.role, cid: payload.cid, sid: payload.sid };
  } catch {
    return null;
  }
}

// Refresh tokens are 256-bit random, so a plain SHA-256 is enough for storage.
export const newRefreshToken = () => b64u(randomBytes(32));
export const hashRefreshToken = (token: string) => createHash("sha256").update(token).digest("hex");
