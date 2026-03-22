/**
 * In-memory store for incidents:
 *  - pending: awaiting IC classification (B0 → B1 bridge)
 *  - active:  classified, in-progress incidents (B1 → resolution)
 */

export interface PendingIncident {
  incident_id: string;
  start_time: string;
  slack_thread_ts: string;
  description: string;
}

export interface ActiveIncident {
  incident_id: string;
  start_time: string;
  slack_thread_ts: string;
  slack_channel: string;
  description: string;
  type: string;
  priority: string;
  ic_slack_id: string;
  ic_name: string;       // Slack mention: <@UXXXXXXX>
  ic_display_name: string; // Human-readable name: Nguyen Van Kien
  users_affected: number;
  payment_affected: boolean;
  data_integrity_affected: boolean;
  /** Current phase in the incident lifecycle */
  phase: "investigating" | "identified" | "monitoring" | "resolved";
  root_cause?: string;
  fix_description?: string;
  /**
   * When set, the next thread reply from any user in this incident's thread
   * will be captured as the specified field value.
   */
  awaiting?: "root_cause" | "fix_description" | null;
  ping_count: number;
  timeline: { time: string; event: string; actor: string }[];
  ping_timer?: ReturnType<typeof setInterval>;
  /** Path of the post-mortem file written by B4 */
  report_file_path?: string;
  /** ts of the B5 interactive message (for in-place updates when buttons are clicked) */
  b5_message_ts?: string;
  /** Per-item B5 state — each item can be confirmed, adjusted, or removed */
  b5_items?: Array<{
    action: string;
    owner: string;   // human-readable name (may be updated by IC)
    eta: string;     // may be updated by IC
    status: "pending" | "confirmed" | "removed";
  }>;
}

// ── Pending incidents (B0 → B1) ─────────────────────────────────────────────
const pending = new Map<string, PendingIncident & { classified: boolean }>();

/** Register a new incident after B0 creates the Slack thread */
export function register_incident(inc: PendingIncident): void {
  pending.set(inc.slack_thread_ts, { ...inc, classified: false });
}

/** Read a pending incident without claiming it (for building modals). */
export function peek_incident(thread_ts: string): PendingIncident | null {
  const inc = pending.get(thread_ts);
  if (!inc) return null;
  return {
    incident_id: inc.incident_id,
    start_time: inc.start_time,
    slack_thread_ts: inc.slack_thread_ts,
    description: inc.description,
  };
}

/**
 * Atomically claim an incident for B1 classification.
 * Returns the incident data, or null if not found / already classified.
 */
export function claim_incident(thread_ts: string): PendingIncident | null {
  const inc = pending.get(thread_ts);
  if (!inc || inc.classified) return null;
  inc.classified = true;
  return {
    incident_id: inc.incident_id,
    start_time: inc.start_time,
    slack_thread_ts: inc.slack_thread_ts,
    description: inc.description,
  };
}

// ── Active incidents (B1 → resolution) ──────────────────────────────────────
const active = new Map<string, ActiveIncident>(); // keyed by incident_id

export function register_active_incident(inc: ActiveIncident): void {
  active.set(inc.incident_id, inc);
}

export function get_active_incident(incident_id: string): ActiveIncident | null {
  return active.get(incident_id) ?? null;
}

/** Find an active incident by its Slack thread ts */
export function get_active_by_thread(thread_ts: string): ActiveIncident | null {
  for (const inc of active.values()) {
    if (inc.slack_thread_ts === thread_ts) return inc;
  }
  return null;
}

/** Stop pings and remove from the active map */
export function resolve_active_incident(incident_id: string): void {
  const inc = active.get(incident_id);
  if (inc?.ping_timer) clearInterval(inc.ping_timer);
  active.delete(incident_id);
}

// ── Cooldown store (monitor-channel dedup) ───────────────────────────────────
const alertCooldown = new Map<string, number>();

/**
 * Check if we should trigger a new incident for this error.
 * Returns true only if no incident was triggered for the same key within cooldownMs.
 * Default cooldown: 5 minutes.
 */
export function should_trigger_incident(errorKey: string, cooldownMs = 5 * 60 * 1000): boolean {
  const last = alertCooldown.get(errorKey);
  const now = Date.now();
  if (last && now - last < cooldownMs) return false;
  alertCooldown.set(errorKey, now);
  return true;
}
