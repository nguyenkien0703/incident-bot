/**
 * B4 — INCIDENT REPORT
 * Triggered when IC confirms all close criteria are met.
 */

import { get_current_time, format_duration } from "../utils/time";
import { slack_reply_to_thread } from "../tools/slack";
import { status_page_update } from "../tools/statuspage";
import { file_write } from "../tools/github";
import type { Env } from "../index";

export interface IncidentData {
  incident_id: string;
  start_time: string;
  end_time?: string | null;
  type: string;
  priority: string;
  ic: string;
  slack_thread_ts: string;
  statuspage_incident_id?: string | null;
  users_affected?: number;
  payment_affected?: boolean;
  data_integrity_affected?: boolean;
  timeline: { time: string; event: string; actor: string }[];
}

export async function handle_b4(env: Env, incident: IncidentData): Promise<string> {
  const end_time = get_current_time();
  const duration = format_duration(incident.start_time, end_time);

  const date = end_time.slice(0, 10);
  const short_title = incident.type.toLowerCase().replace(/_/g, "-");
  const filePath = `docs/devops/post-mortems/${date}-${incident.incident_id}-${short_title}.md`;

  const timeline_md = incident.timeline
    .map((e) => `| ${e.time} | ${e.event} | ${e.actor} |`)
    .join("\n");

  const reportContent = `# Incident Report: ${incident.incident_id}

**Date**: ${date}
**Duration**: ${incident.start_time} → ${end_time} (${duration})
**Priority**: ${incident.priority}
**Type**: ${incident.type}
**IC**: ${incident.ic}
**Status**: RESOLVED

## Summary

<!-- 2-3 sentence summary of the incident -->

## Timeline

| Time | Event | Actor |
|------|-------|-------|
${timeline_md}

## Root Cause

<!-- Root cause description -->

## Resolution

<!-- What was done: rollback / hotfix / feature flag -->

## Business Impact

- Users affected: ~${incident.users_affected ?? "unknown"}
- Downtime: ${duration}
- Payment affected: ${incident.payment_affected ? "yes" : "no"}
- Data integrity: ${incident.data_integrity_affected ? "yes" : "no"}

## Action Items (Prevention)

<!-- To be filled in B5 -->
`;

  const fileUrl = await file_write(filePath, reportContent, {
    GITHUB_TOKEN: env.GITHUB_TOKEN,
    GITHUB_REPO_OWNER: env.GITHUB_REPO_OWNER,
    GITHUB_REPO_NAME: env.GITHUB_REPO_NAME,
  });

  // Post resolved message to thread
  const resolvedMsg = `✅ *[RESOLVED - ${end_time}]*
Service: lumilink-be
Duration: ${duration}
IC: ${incident.ic}
Incident Report: ${fileUrl}

Next step: See B5 prevention plan coming up.`;

  await slack_reply_to_thread(
    env.SLACK_INCIDENTS_CHANNEL,
    incident.slack_thread_ts,
    resolvedMsg,
    env.SLACK_BOT_TOKEN
  );

  // Update status page
  await status_page_update(
    "resolved",
    `✅ [RESOLVED] ${end_time} — The incident has been fully resolved. Service is operating normally.`,
    {
      STATUSPAGE_API_KEY: env.STATUSPAGE_API_KEY,
      STATUSPAGE_PAGE_ID: env.STATUSPAGE_PAGE_ID,
      STATUSPAGE_COMPONENT_ID: env.STATUSPAGE_COMPONENT_ID,
      STATUSPAGE_INCIDENT_ID: incident.statuspage_incident_id ?? undefined,
    }
  );

  return fileUrl;
}
