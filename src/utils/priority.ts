/**
 * Priority determination logic
 *
 * Final Priority = MAX across all applicable cells in the 2D matrix:
 *   rows    = technical severity (minor / degraded / critical / full_down)
 *   columns = business impact dimensions (revenue / user_acquisition / data_integrity / reputation / none)
 *
 * Source: docs/devops/escalation-policy.md — Section 2B
 */

// ── Priority Levels ───────────────────────────────────────────────────────────
// P3 = Minor     — SLA 1h    — Error rate nhẹ, perf giảm nhẹ, integration fail không critical
// P2 = High      — SLA 30m   — Core feature broken, 5xx > 5%, p99 > 5s sustained
// P1 = Critical  — SLA 15m   — Service partial down, data inconsistency, nhiều features ảnh hưởng
// P0 = Emergency — SLA ngay  — Service hoàn toàn down, data loss/corruption, security breach
export type Priority = "P0" | "P1" | "P2" | "P3";

// ── Incident Types ────────────────────────────────────────────────────────────
// AVAILABILITY — Service/API không respond         (App down, 503, Worker crash)
// PERFORMANCE  — Hệ thống chậm hoặc error rate cao (p99 > 5s, error rate đột biến)
// DATA         — Mất / sai / corrupt data           (Migration fail, data loss)
// INTEGRATION  — 3rd party fail                     (Jira / Confluence / AI provider down)
// SECURITY     — Truy cập trái phép, data leak      (Unauthorized access, exposed secrets)
export type IncidentType =
  | "AVAILABILITY"
  | "PERFORMANCE"
  | "DATA"
  | "INTEGRATION"
  | "SECURITY";

export interface BusinessImpact {
  payment_affected: boolean;          // Revenue Impact
  data_integrity_affected: boolean;   // Data Integrity Impact
  login_register_broken: boolean;     // User Acquisition Impact
  enterprise_sla_breach: boolean;     // Reputation Impact
  // Technical Severity — mức độ kỹ thuật của sự cố:
  //   minor     — lỗi nhỏ, ảnh hưởng không đáng kể
  //   degraded  — hệ thống vẫn chạy nhưng bị suy giảm (chậm, một số feature lỗi)
  //   critical  — service bị down một phần, nhiều user bị ảnh hưởng
  //   full_down — service hoàn toàn không hoạt động
  technical_severity: "minor" | "degraded" | "critical" | "full_down";
}

// ── 2D Priority Matrix ────────────────────────────────────────────────────────
// Rows = technical severity | Cols = business impact dimension
// Source: escalation-policy.md Section 2B

type BusinessDimension = "none" | "revenue" | "user_acquisition" | "data_integrity" | "reputation";

const MATRIX: Record<BusinessImpact["technical_severity"], Record<BusinessDimension, Priority>> = {
  //              none   revenue  user_acq  data_int  reputation
  minor:    { none:"P3", revenue:"P1", user_acquisition:"P1", data_integrity:"P0", reputation:"P2" },
  degraded: { none:"P2", revenue:"P0", user_acquisition:"P1", data_integrity:"P0", reputation:"P1" },
  critical: { none:"P1", revenue:"P0", user_acquisition:"P0", data_integrity:"P0", reputation:"P0" },
  full_down:{ none:"P0", revenue:"P0", user_acquisition:"P0", data_integrity:"P0", reputation:"P0" },
};

const PRIORITY_RANK: Record<Priority, number> = { P3: 0, P2: 1, P1: 2, P0: 3 };

function higher(a: Priority, b: Priority): Priority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

export function determinePriority(impact: BusinessImpact): Priority {
  const row = MATRIX[impact.technical_severity];

  // Start with no-business-impact baseline
  let result: Priority = row.none;

  // Apply each active business dimension and take the highest
  if (impact.payment_affected)        result = higher(result, row.revenue);
  if (impact.login_register_broken)   result = higher(result, row.user_acquisition);
  if (impact.data_integrity_affected) result = higher(result, row.data_integrity);
  if (impact.enterprise_sla_breach)   result = higher(result, row.reputation);

  return result;
}

export function isHighSeverity(priority: Priority): boolean {
  return priority === "P0" || priority === "P1";
}
