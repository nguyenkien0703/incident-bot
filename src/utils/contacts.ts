/**
 * Team contacts helper — reads from PostgreSQL
 */

import type { Pool } from "pg";

export interface TeamContact {
  name: string;
  role: "TechLead" | "DevOps" | "PM" | "CEO" | "Legal" | "IC" | string;
  slack_id: string;
  phone?: string; // optional — E.164: +84xxxxxxxxx
  email: string;
  timezone: string;
}

export async function get_team_contacts(pool: Pool): Promise<TeamContact[]> {
  const result = await pool.query<TeamContact>(
    `SELECT name, role, slack_id, phone, email, timezone FROM team_contacts`
  );
  return result.rows;
}

export function get_by_role(contacts: TeamContact[], role: string): TeamContact[] {
  return contacts.filter((c) => c.role === role);
}
