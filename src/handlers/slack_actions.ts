/**
 * Slack interactive actions + modal submissions handler.
 *
 * Block action flow:
 *   incident_classify_open  → open classify modal (B1)
 *   incident_identified     → update buttons (highlight), open root cause modal
 *   incident_monitoring     → update buttons (highlight), open fix modal
 *   incident_resolved       → run B4 + B5 prompt
 *
 * View submission flow:
 *   classify_incident       → parse fields → run B1
 *   root_cause_submit       → save root cause, confirm in thread
 *   fix_description_submit  → save fix description, confirm in thread
 */

import type { Env } from "../index";
import type { BusinessImpact, IncidentType } from "../utils/priority";
import {
  get_active_incident,
  resolve_active_incident,
  peek_incident,
  claim_incident,
} from "../state";
import {
  slack_reply_to_thread,
  slack_update_message,
  slack_open_modal,
} from "../tools/slack";
import {
  build_status_buttons,
  build_resolved_block,
  build_classify_modal,
  build_root_cause_modal,
  build_fix_modal,
} from "../tools/slack_blocks";
import { handle_b1 } from "./b1_classify";
import { handle_b4, type B4Result } from "./b4_report";
import { get_current_time } from "../utils/time";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SlackActionPayload {
  type: "block_actions";
  trigger_id: string;
  user: { id: string; name: string };
  channel: { id: string };
  message: { ts: string; thread_ts?: string };
  actions: Array<{ action_id: string; value: string; block_id?: string }>;
}

export interface ViewSubmissionPayload {
  type: "view_submission";
  user: { id: string; name: string };
  view: {
    callback_id: string;
    private_metadata: string;
    state: {
      values: Record<
        string,
        Record<
          string,
          {
            type: string;
            value?: string | null;
            selected_option?: { value: string } | null;
            selected_options?: Array<{ value: string }> | null;
          }
        >
      >;
    };
  };
}

// ── Block actions handler ────────────────────────────────────────────────────

export async function handle_slack_action(
  env: Env,
  payload: SlackActionPayload
): Promise<void> {
  const action = payload.actions[0];
  if (!action) return;

  const channel = payload.channel.id;
  const button_msg_ts = payload.message.ts;
  // Use display name for report readability; fall back to Slack mention for non-IC actors
  const now = get_current_time();

  // ── Open classify modal ─────────────────────────────────────────────────
  if (action.action_id === "incident_classify_open") {
    const thread_ts = payload.message.thread_ts ?? payload.message.ts;
    const inc = peek_incident(thread_ts);
    if (!inc) {
      console.warn("[actions] classify clicked but no pending incident for thread:", thread_ts);
      return;
    }
    const metadata = JSON.stringify({
      incident_id: inc.incident_id,
      thread_ts: inc.slack_thread_ts,
      description: inc.description,
    });
    await slack_open_modal(
      payload.trigger_id,
      build_classify_modal(metadata, inc.description),
      env.SLACK_BOT_TOKEN
    ).catch((err) => console.error("[actions] open modal failed:", err.message));
    return;
  }

  // All other actions require an active incident
  const incident_id = action.value;
  const inc = get_active_incident(incident_id);
  if (!inc) {
    console.warn(`[actions] no active incident for id=${incident_id}`);
    return;
  }

  // Resolve actor name: use display name if user is the IC, else Slack mention
  const actor = payload.user.id === inc.ic_slack_id
    ? inc.ic_display_name
    : `<@${payload.user.id}>`;

  // ── Root Cause Identified ───────────────────────────────────────────────
  if (action.action_id === "incident_identified") {
    if (inc.phase === "resolved") return;
    inc.phase = "identified";
    inc.timeline.push({ time: now, event: "Root cause being identified", actor });

    await Promise.all([
      // Update this button message: highlight "Root Cause Identified" button
      slack_update_message(
        channel,
        button_msg_ts,
        build_status_buttons(incident_id, "identified"),
        `Incident ${incident_id} — Root Cause Identified`,
        env.SLACK_BOT_TOKEN
      ).catch(console.error),
      // Open modal to collect root cause text
      slack_open_modal(
        payload.trigger_id,
        build_root_cause_modal(incident_id),
        env.SLACK_BOT_TOKEN
      ).catch((err) => console.error("[actions] root cause modal failed:", err.message)),
    ]);
  }

  // ── Fix In Progress ─────────────────────────────────────────────────────
  else if (action.action_id === "incident_monitoring") {
    if (inc.phase === "resolved") return;
    inc.phase = "monitoring";
    inc.timeline.push({ time: now, event: "Fix in progress", actor });

    await Promise.all([
      slack_update_message(
        channel,
        button_msg_ts,
        build_status_buttons(incident_id, "monitoring"),
        `Incident ${incident_id} — Fix In Progress`,
        env.SLACK_BOT_TOKEN
      ).catch(console.error),
      slack_open_modal(
        payload.trigger_id,
        build_fix_modal(incident_id),
        env.SLACK_BOT_TOKEN
      ).catch((err) => console.error("[actions] fix modal failed:", err.message)),
    ]);
  }

  // ── Resolved ────────────────────────────────────────────────────────────
  else if (action.action_id === "incident_resolved") {
    if (inc.phase === "resolved") return;
    inc.phase = "resolved";
    inc.timeline.push({ time: now, event: "Incident resolved", actor });

    // Stop proactive pings immediately
    if (inc.ping_timer) {
      clearInterval(inc.ping_timer);
      inc.ping_timer = undefined;
    }

    // Replace buttons with resolved block
    await slack_update_message(
      channel,
      button_msg_ts,
      build_resolved_block(incident_id, actor),
      `Incident ${incident_id} RESOLVED`,
      env.SLACK_BOT_TOKEN
    ).catch(console.error);

    // Run B4: write post-mortem to GitHub + update statuspage + AI analysis
    const b4: B4Result | null = await handle_b4(env, {
      incident_id: inc.incident_id,
      start_time: inc.start_time,
      type: inc.type,
      priority: inc.priority,
      ic: inc.ic_name,
      ic_display_name: inc.ic_display_name,
      slack_thread_ts: inc.slack_thread_ts,
      users_affected: inc.users_affected,
      payment_affected: inc.payment_affected,
      data_integrity_affected: inc.data_integrity_affected,
      root_cause: inc.root_cause,
      fix_description: inc.fix_description,
      timeline: inc.timeline,
    }).catch(async (err) => {
      console.error("[actions] B4 error:", err.message);
      await slack_reply_to_thread(
        inc.slack_channel,
        inc.slack_thread_ts,
        `⚠️ Post-mortem report skipped: ${err.message}`,
        env.SLACK_BOT_TOKEN
      ).catch(console.error);
      return null;
    });

    // Store file path for B5 update
    inc.report_file_path = b4?.filePath;

    // B5: Post AI-proposed prevention actions to Slack
    // IC/IT team replies to confirm owner + ETA per item
    if (b4 && b4.b5_actions.length > 0) {
      inc.b5_proposals = b4.b5_actions;
      inc.awaiting_b5 = true;

      const actionsText = b4.b5_actions
        .map(
          (a, i) =>
            `*${i + 1}. ${a.action}*\n   • Suggested owner: *${a.suggested_owner}*  |  ETA: *${a.suggested_eta}*`
        )
        .join("\n\n");

      const b5msg = [
        `📋 *B5 — AI Prevention Plan*`,
        `Post-mortem: ${b4.fileUrl}`,
        ``,
        `🤖 Based on root cause analysis, the AI proposes:`,
        ``,
        actionsText,
        ``,
        `${actor} please reply to *confirm or adjust* each item.`,
        `Format: \`1: @owner, 1 week / 2: @devops, 3 days / 3: confirmed\``,
        `Or reply \`confirmed\` to accept all as-is.`,
      ].join("\n");

      await slack_reply_to_thread(
        inc.slack_channel,
        inc.slack_thread_ts,
        b5msg,
        env.SLACK_BOT_TOKEN
      ).catch(console.error);
    } else {
      // No AI proposals (API key missing or no actions generated) — close immediately
      resolve_active_incident(incident_id);
    }

    // NOTE: resolve_active_incident is called by index.ts after IC confirms B5.
  }
}

// ── View submission handler ──────────────────────────────────────────────────

export async function handle_view_submission(
  env: Env,
  payload: ViewSubmissionPayload
): Promise<void> {
  const { callback_id, private_metadata, state } = payload.view;
  const now = get_current_time();
  const vals = state.values;

  // ── Classify modal submitted → run B1 ────────────────────────────────
  if (callback_id === "classify_incident") {
    const meta = JSON.parse(private_metadata) as {
      incident_id: string;
      thread_ts: string;
      description: string;
    };

    const pending = claim_incident(meta.thread_ts);
    if (!pending) {
      console.warn("[view] classify_incident: incident already claimed or not found");
      return;
    }

    const type = vals.type_block?.incident_type?.selected_option?.value as IncidentType;
    const users_affected = parseInt(vals.users_block?.users_affected?.value ?? "0", 10);
    const flags = vals.impact_block?.impact_flags?.selected_options?.map((o) => o.value) ?? [];
    const severity =
      (vals.severity_block?.severity?.selected_option?.value as BusinessImpact["technical_severity"]) ??
      "degraded";

    const impact: BusinessImpact = {
      payment_affected:       flags.includes("payment"),
      data_integrity_affected: flags.includes("data_integrity"),
      login_register_broken:  flags.includes("login_register"),
      enterprise_sla_breach:  flags.includes("sla_breach"),
      technical_severity:     severity,
    };

    handle_b1(env, {
      incident_id: pending.incident_id,
      start_time:  pending.start_time,
      slack_thread_ts: pending.slack_thread_ts,
      description: pending.description,
      type,
      ic_slack_id: payload.user.id,
      ic_name:     `<@${payload.user.id}>`,
      users_affected,
      impact,
    }).catch((err) => console.error("[view] B1 error:", err));
    return;
  }

  // ── Root cause modal submitted ────────────────────────────────────────
  if (callback_id === "root_cause_submit") {
    const inc = get_active_incident(private_metadata);
    if (!inc) return;
    const display = payload.user.id === inc.ic_slack_id ? inc.ic_display_name : `<@${payload.user.id}>`;
    const root_cause = vals.root_cause_block?.root_cause?.value ?? "";
    inc.root_cause = root_cause;
    inc.awaiting = null;
    inc.timeline.push({ time: now, event: `Root cause: ${root_cause}`, actor: display });
    await slack_reply_to_thread(
      inc.slack_channel,
      inc.slack_thread_ts,
      `📝 *Root cause recorded* by ${display}:\n> ${root_cause}`,
      env.SLACK_BOT_TOKEN
    ).catch(console.error);
    return;
  }

  // ── Fix description modal submitted ────────────────────────────────────
  if (callback_id === "fix_description_submit") {
    const inc = get_active_incident(private_metadata);
    if (!inc) return;
    const display = payload.user.id === inc.ic_slack_id ? inc.ic_display_name : `<@${payload.user.id}>`;
    const fix_description = vals.fix_block?.fix_description?.value ?? "";
    inc.fix_description = fix_description;
    inc.awaiting = null;
    inc.timeline.push({ time: now, event: `Fix applied: ${fix_description}`, actor: display });
    await slack_reply_to_thread(
      inc.slack_channel,
      inc.slack_thread_ts,
      `📝 *Fix recorded* by ${display}:\n> ${fix_description}`,
      env.SLACK_BOT_TOKEN
    ).catch(console.error);
    return;
  }
}
