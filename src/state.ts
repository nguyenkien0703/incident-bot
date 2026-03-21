/**
 * In-memory store for incidents awaiting IC classification (B0 → B1 bridge)
 * Keyed by slack thread_ts (unique per thread)
 */

export interface PendingIncident {
  incident_id: string;
  start_time: string;
  slack_thread_ts: string;
  description: string;
}

const pending = new Map<string, PendingIncident & { classified: boolean }>();

/** Register a new incident after B0 creates the Slack thread */
export function register_incident(inc: PendingIncident): void {
  pending.set(inc.slack_thread_ts, { ...inc, classified: false });
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
