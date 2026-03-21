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

function isYes(s: string): boolean {
  return /^\s*yes\s*$/i.test(s);
}

function isNo(s: string): boolean {
  return /^\s*no\s*$/i.test(s);
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

  // Users affected — look for standalone number or "200 users"
  const usersMatch = text.match(/(\d+)\s*(?:user)?/i);
  const users_affected = usersMatch ? parseInt(usersMatch[1], 10) : 0;

  // Strategy 1: keyword-based  ("payment: yes", "data: no")
  const hasKeywords =
    /payment|data.*integrity|core|sla|enterprise/i.test(text);

  let payment_affected = false;
  let data_integrity_affected = false;
  let login_register_broken = false;
  let enterprise_sla_breach = false;

  if (hasKeywords) {
    payment_affected = yesAfter(text, "payment");
    data_integrity_affected = yesAfter(text, "data");
    login_register_broken = yesAfter(text, "core", "login");
    enterprise_sla_breach = yesAfter(text, "sla", "enterprise");
  } else {
    // Strategy 2: ordered lines (bot asked questions in fixed order)
    // Line 1: type (already parsed above)
    // Line 2: users affected
    // Line 3: payment (yes/no)
    // Line 4: data integrity (yes/no)
    // Line 5: core feature (yes/no)
    // Line 6: enterprise SLA (yes/no)
    // Line 7: severity (already parsed above)
    const lines = text
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Find the boolean lines (yes/no) in order
    const boolLines = lines.filter((l) => isYes(l) || isNo(l));
    payment_affected = boolLines[0] ? isYes(boolLines[0]) : false;
    data_integrity_affected = boolLines[1] ? isYes(boolLines[1]) : false;
    login_register_broken = boolLines[2] ? isYes(boolLines[2]) : false;
    enterprise_sla_breach = boolLines[3] ? isYes(boolLines[3]) : false;
  }

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
