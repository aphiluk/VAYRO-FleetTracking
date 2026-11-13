import { sql } from "../src/db";
import { hashPassword } from "../src/security";
import { audit } from "../src/audit";

// Operator-only bootstrap: credentials are read from the environment, never committed or logged.
try {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const fullName = process.env.ADMIN_FULL_NAME?.trim() ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150 || !fullName || fullName.length > 150 || password.length < 10 || password.length > 128) {
    throw new Error("Set ADMIN_EMAIL, ADMIN_FULL_NAME (1-150 characters), ADMIN_PASSWORD (10-128 characters)");
  }
  const hash = await hashPassword(password);
  const row = await sql.begin(async tx => {
    const [created] = await tx`INSERT INTO users (full_name, email, password_hash, role, company_id)
      VALUES (${fullName}, ${email}, ${hash}, 'platform_admin', NULL)
      ON CONFLICT (email) DO NOTHING RETURNING user_id`;
    if (!created) throw new Error("Email already exists; no account was changed");
    await audit({ userId: created.user_id, action: "user.bootstrap", entityType: "user", entityId: created.user_id, newValue: { role: "platform_admin" } }, tx);
    return created;
  });
  console.log(`Platform Admin created: user_id=${row.user_id}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Bootstrap failed");
  process.exitCode = 1;
} finally {
  await sql.close();
}
