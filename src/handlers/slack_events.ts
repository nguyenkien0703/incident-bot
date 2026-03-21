/**
 * Slack Events handler — parses IC reply to classify incident (B1)
 *
 * IC can reply in any format. Parser looks for keywords:
 *
 *   AVAILABILITY         → incident type
 *   critical             → technical severity
 *   payment: yes/no      → payment affected
 *   data: yes/no         → data integrity
 *   core: yes/no         → core feature broken
 *   sla: yes/no          → enterprise SLA breach
 *   200 users            → users affected
 */

import type { IncidentType, BusinessImpact } from "../utils/priority";

export interface ParsedICReply {
  type: IncidentType | null;
  impact: BusinessImpact;
  users_affected: number;
}

function yesAfter(text: string, ...keywords: string[]): boolean {
  for (const kw of keywords) {
    if (new RegExp(`${kw}[^\\n]{0,20}?yes`, "i").test(text)) return true;
  }
  return false;
}

function noAfter(text: string, ...keywords: string[]): boolean {
  for (const kw of keywords) {
    if (new RegExp(`${kw}[^\\n]{0,20}?no`, "i").test(text)) return true;
  }
  return false;
}

export function parse_ic_reply(text: string): ParsedICReply {
  const TYPES: IncidentType[] = [
    "AVAILABILITY",
    "PERFORMANCE",
    "DATA",
    "INTEGRATION",
    "SECURITY",
  ];
  const type = TYPES.find((t) => text.toUpperCase().includes(t)) ?? null;

  const SEVERITIES = ["full_down", "critical", "degraded", "minor"] as const;
  const technical_severity =
    SEVERITIES.find((s) => text.toLowerCase().includes(s)) ?? "minor";

  const usersMatch = text.match(/(\d+)\s*user/i);
  const users_affected = usersMatch ? parseInt(usersMatch[1], 10) : 0;

  // For each boolean field: if "keyword: yes" → true, "keyword: no" → false, missing → false
  const payment_affected =
    yesAfter(text, "payment") && !noAfter(text, "payment")
      ? true
      : noAfter(text, "payment")
      ? false
      : false;

  const data_integrity_affected =
    yesAfter(text, "data") && !noAfter(text, "data")
      ? true
      : noAfter(text, "data")
      ? false
      : false;

  const login_register_broken =
    yesAfter(text, "core", "login") && !noAfter(text, "core", "login")
      ? true
      : false;

  const enterprise_sla_breach =
    yesAfter(text, "sla", "enterprise") && !noAfter(text, "sla", "enterprise")
      ? true
      : false;

  return {
    type,
    users_affected,
    impact: {
      payment_affected,
      data_integrity_affected,
      login_register_broken,
      enterprise_sla_breach,
      technical_severity,
    },
  };
}
