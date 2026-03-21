/**
 * Priority determination logic
 * Final Priority = MAX(Technical Level, Business Override)
 */

export type Priority = "P0" | "P1" | "P2" | "P3";
export type IncidentType =
  | "AVAILABILITY"
  | "PERFORMANCE"
  | "DATA"
  | "INTEGRATION"
  | "SECURITY";

export interface BusinessImpact {
  payment_affected: boolean;
  data_integrity_affected: boolean;
  login_register_broken: boolean;
  enterprise_sla_breach: boolean;
  technical_severity: "minor" | "degraded" | "critical" | "full_down";
}

function technicalPriority(severity: BusinessImpact["technical_severity"]): Priority {
  switch (severity) {
    case "full_down":
      return "P0";
    case "critical":
      return "P1";
    case "degraded":
      return "P2";
    case "minor":
      return "P3";
  }
}

function businessOverride(impact: BusinessImpact): Priority | null {
  if (impact.data_integrity_affected) return "P0";

  if (
    impact.payment_affected &&
    (impact.technical_severity === "critical" || impact.technical_severity === "full_down")
  )
    return "P0";

  if (impact.payment_affected && impact.technical_severity === "degraded") return "P1";
  if (impact.payment_affected && impact.technical_severity === "minor") return "P1";

  if (impact.login_register_broken) return "P1";

  if (
    impact.enterprise_sla_breach &&
    (impact.technical_severity === "critical" || impact.technical_severity === "full_down")
  )
    return "P0";

  if (impact.enterprise_sla_breach && impact.technical_severity === "degraded") return "P1";

  return null;
}

const PRIORITY_ORDER: Priority[] = ["P3", "P2", "P1", "P0"];

function maxPriority(a: Priority, b: Priority | null): Priority {
  if (!b) return a;
  return PRIORITY_ORDER.indexOf(a) > PRIORITY_ORDER.indexOf(b) ? a : b;
}

export function determinePriority(impact: BusinessImpact): Priority {
  const technical = technicalPriority(impact.technical_severity);
  const override = businessOverride(impact);
  return maxPriority(technical, override);
}

export function isHighSeverity(priority: Priority): boolean {
  return priority === "P0" || priority === "P1";
}
