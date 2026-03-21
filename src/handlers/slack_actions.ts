/**
 * Slack interactive actions handler
 * Triggered when IC clicks a button in a Block Kit message.
 *
 * Supported action_ids:
 *   incident_identified  → phase: identifying → ask for root cause in thread
 *   incident_monitoring  → phase: monitoring  → ask for fix description in thread
 *   incident_resolved    → run B4 (post-mortem + statuspage) + B5 prompt
 */

import type { Env } from "../index";
import { get_active_incident, resolve_active_incident } from "../state";
import {
  slack_reply_to_thread,
  slack_update_message,
} from "../tools/slack";
import { build_status_buttons, build_resolved_block } from "../tools/slack_blocks";
import { handle_b4 } from "./b4_report";
import { get_current_time } from "../utils/time";

export interface SlackActionPayload {
  type: string;
  user: { id: string; name: string };
  channel: { id: string };
  /** The message that contained the button */
  message: { ts: string; thread_ts?: string };
  actions: Array<{ action_id: string; value: string; block_id?: string }>;
}

export async function handle_slack_action(
  env: Env,
  payload: SlackActionPayload
): Promise<void> {
  const action = payload.actions[0];
  if (!action) return;

  const incident_id = action.value;
  const inc = get_active_incident(incident_id);
  if (!inc) {
    console.warn(`[actions] no active incident for id=${incident_id}`);
    return;
  }

  const now = get_current_time();
  const actor = `<@${payload.user.id}>`;
  const channel = payload.channel.id;
  const button_msg_ts = payload.message.ts;

  // ── Root Cause Identified ───────────────────────────────────────────────
  if (action.action_id === "incident_identified") {
    if (inc.phase === "resolved") return;
    inc.phase = "identified";
    inc.awaiting = "root_cause";
    inc.timeline.push({ time: now, event: "Root cause identified (IC acknowledged)", actor });

    await Promise.all([
      // Ask IC to type the root cause in the thread
      slack_reply_to_thread(
        channel,
        inc.slack_thread_ts,
        `🔍 *Root cause identified* — ${actor}\nPlease reply in this thread with a brief root cause description.`,
        env.SLACK_BOT_TOKEN
      ).catch(console.error),
      // Update the button message to reflect the new phase
      slack_update_message(
        channel,
        button_msg_ts,
        build_status_buttons(incident_id, inc.phase),
        `Incident ${incident_id} — Root Cause Identified`,
        env.SLACK_BOT_TOKEN
      ).catch(console.error),
    ]);
  }

  // ── Fix In Progress ─────────────────────────────────────────────────────
  else if (action.action_id === "incident_monitoring") {
    if (inc.phase === "resolved") return;
    inc.phase = "monitoring";
    inc.awaiting = "fix_description";
    inc.timeline.push({ time: now, event: "Fix in progress", actor });

    await Promise.all([
      slack_reply_to_thread(
        channel,
        inc.slack_thread_ts,
        `🔧 *Fix in progress* — ${actor}\nPlease reply in this thread with a brief description of the fix / action taken.`,
        env.SLACK_BOT_TOKEN
      ).catch(console.error),
      slack_update_message(
        channel,
        button_msg_ts,
        build_status_buttons(incident_id, inc.phase),
        `Incident ${incident_id} — Fix In Progress`,
        env.SLACK_BOT_TOKEN
      ).catch(console.error),
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

    // Replace buttons with a resolved status block
    await slack_update_message(
      channel,
      button_msg_ts,
      build_resolved_block(incident_id, actor),
      `Incident ${incident_id} RESOLVED`,
      env.SLACK_BOT_TOKEN
    ).catch(console.error);

    // Run B4: write post-mortem to GitHub + update statuspage
    const reportUrl = await handle_b4(env, {
      incident_id: inc.incident_id,
      start_time: inc.start_time,
      type: inc.type,
      priority: inc.priority,
      ic: inc.ic_name,
      slack_thread_ts: inc.slack_thread_ts,
      users_affected: inc.users_affected,
      payment_affected: inc.payment_affected,
      data_integrity_affected: inc.data_integrity_affected,
      timeline: inc.timeline,
    }).catch(async (err) => {
      console.error("[actions] B4 error:", err.message);
      await slack_reply_to_thread(
        channel,
        inc.slack_thread_ts,
        `⚠️ Post-mortem report skipped: ${err.message}`,
        env.SLACK_BOT_TOKEN
      ).catch(console.error);
      return null;
    });

    // B5: Ask IC for action items (prevention)
    const b5msg = [
      `📋 *B5 — Action Items (Prevention)*`,
      reportUrl ? `Post-mortem: ${reportUrl}` : "",
      ``,
      `${actor} please reply in this thread with action items to prevent recurrence.`,
      `Format: one item per line starting with \`-\``,
      `Example:\n- Add circuit breaker to payment service\n- Alert threshold lowered to 1% error rate`,
    ].filter(Boolean).join("\n");

    await slack_reply_to_thread(
      channel,
      inc.slack_thread_ts,
      b5msg,
      env.SLACK_BOT_TOKEN
    ).catch(console.error);

    // Remove from active state (pings stopped, resolution handled)
    resolve_active_incident(incident_id);
  }
}
