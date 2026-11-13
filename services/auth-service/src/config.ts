function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");

function ttl(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 31536000) {
    throw new Error(`${name} must be an integer between 1 and 31536000 seconds`);
  }
  return value;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret,
  accessTtlSeconds: ttl("ACCESS_TOKEN_TTL_SECONDS", 15 * 60),
  refreshTtlSeconds: ttl("REFRESH_TOKEN_TTL_SECONDS", 7 * 24 * 60 * 60),
};
