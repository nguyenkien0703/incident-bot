/**
 * Seed team_contacts from team_contacts.json
 * Runs on app startup — safe to run multiple times (upsert by slack_id)
 */

import fs from "node:fs";
import path from "node:path";
import type { Pool } from "pg";

interface ContactRow {
  name: string;
  role: string;
  slack_id: string;
  phone?: string | null;
  email: string;
  timezone?: string;
}

export async function seed_contacts(pool: Pool): Promise<void> {
  const filePath = path.resolve(process.cwd(), "team_contacts.json");

  if (!fs.existsSync(filePath)) {
    console.warn("[seed] team_contacts.json not found — skipping contact seed");
    return;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const contacts: ContactRow[] = JSON.parse(raw);

  let upserted = 0;
  let skipped = 0;

  for (const c of contacts) {
    const result = await pool.query(
      `INSERT INTO team_contacts (name, role, slack_id, phone, email, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         name     = EXCLUDED.name,
         role     = EXCLUDED.role,
         slack_id = EXCLUDED.slack_id,
         phone    = EXCLUDED.phone,
         timezone = EXCLUDED.timezone
       WHERE
         team_contacts.name     IS DISTINCT FROM EXCLUDED.name     OR
         team_contacts.role     IS DISTINCT FROM EXCLUDED.role     OR
         team_contacts.slack_id IS DISTINCT FROM EXCLUDED.slack_id OR
         team_contacts.phone    IS DISTINCT FROM EXCLUDED.phone    OR
         team_contacts.timezone IS DISTINCT FROM EXCLUDED.timezone
       RETURNING id`,
      [c.name, c.role, c.slack_id, c.phone ?? null, c.email, c.timezone ?? "Asia/Ho_Chi_Minh"]
    );

    if (result.rowCount && result.rowCount > 0) {
      upserted++;
    } else {
      skipped++;
    }
  }

  console.log(`[seed] ${upserted} upserted, ${skipped} unchanged`);
}
