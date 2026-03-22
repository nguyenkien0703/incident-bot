/**
 * Slack interactive actions + modal submissions handler.
 *
 * Block actions:
 *   incident_classify_open  → open classify modal
 *   incident_identified     → highlight buttons, open root cause modal
 *   incident_monitoring     → highlight buttons, open fix modal
 *   incident_resolved       → run B4 + post B5 interactive blocks
 *   b5_confirm              → mark item confirmed, auto-finalize when all done
 *   b5_remove               → mark item removed, auto-finalize when all done
 *   b5_owner                → open owner-picker modal
 *   b5_eta                  → open ETA-picker modal
 *
 * View submissions:
 *   classify_incident       → run B1
 *   root_cause_submit       → save root cause
 *   fix_description_submit  → save fix description
 *   b5_owner_submit         → update item owner
 *   b5_eta_submit           → update item ETA
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
  slack_reply_blocks,
  slack_get_user_name,
} from "../tools/slack";
import {
  build_status_buttons,
  build_resolved_block,
  build_classify_modal,
  build_root_cause_modal,
  build_fix_modal,
  build_b5_blocks,
  build_b5_owner_modal,
  build_b5_eta_modal,
} from "../tools/slack_blocks";
import { handle_b1 } from "./b1_classify";
import { handle_b4, type B4Result } from "./b4_report";
import { update_action_items } from "../tools/github";
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
            selected_user?: string | null;
          }
        >
      >;
    };
  };
}

// ── B5 helpers ───────────────────────────────────────────────────────────────

/** Refresh the B5 message in-place after any item change */
async function refresh_b5(env: Env, inc: NonNullable<ReturnType<typeof get_active_incident>>): Promise<void> {
  if (!inc.b5_items || !inc.b5_message_ts) return;
  await slack_update_message(
    inc.slack_channel,
    inc.b5_message_ts,
    build_b5_blocks(inc.incident_id, inc.b5_items),
    `B5 Prevention Plan — ${inc.incident_id}`,
    env.SLACK_BOT_TOKEN
  ).catch(console.error);
}

/** Called when all items are confirmed or removed — writes final report and closes incident */
async function finalize_b5(env: Env, inc: NonNullable<ReturnType<typeof get_active_incident>>): Promise<void> {
  const kept = (inc.b5_items ?? []).filter((i) => i.status !== "removed");

  const action_items_md = kept.length > 0
    ? kept.map((item, i) =>
        `${i + 1}. **${item.action}**\n   - Owner: ${item.owner}\n   - ETA: ${item.eta}`
      ).join("\n")
    : "_No action items recorded._";

  let closeMsg = `✅ *Incident \`${inc.incident_id}\` fully closed.*`;

  if (inc.report_file_path && env.GITHUB_TOKEN) {
    const url = await update_action_items(inc.report_file_path, action_items_md, {
      GITHUB_TOKEN: env.GITHUB_TOKEN,
      GITHUB_REPO_OWNER: env.GITHUB_REPO_OWNER,
      GITHUB_REPO_NAME: env.GITHUB_REPO_NAME,
    }).catch((err) => {
      console.error("[b5] update_action_items failed:", err.message);
      return null;
    });
    if (url) closeMsg += `\nPost-mortem updated: ${url}`;
  }

  await slack_reply_to_thread(
    inc.slack_channel,
    inc.slack_thread_ts,
    closeMsg,
    env.SLACK_BOT_TOKEN
  ).catch(console.error);

  resolve_active_incident(inc.incident_id);
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
  const now = get_current_time();

  // ── Open classify modal ─────────────────────────────────────────────────
  if (action.action_id === "incident_classify_open") {
    const thread_ts = payload.message.thread_ts ?? payload.message.ts;
    const inc = peek_incident(thread_ts);
    if (!inc) return;
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

  // ── B5 item actions ─────────────────────────────────────────────────────
  if (["b5_confirm", "b5_remove", "b5_owner", "b5_eta"].includes(action.action_id)) {
    const [incident_id, idxStr] = action.value.split(":");
    const idx = parseInt(idxStr, 10);
    const inc = get_active_incident(incident_id);
    if (!inc || !inc.b5_items || !inc.b5_items[idx]) return;
    const item = inc.b5_items[idx];

    if (action.action_id === "b5_confirm") {
      item.status = "confirmed";
      await refresh_b5(env, inc);
      const allDone = inc.b5_items.every((i) => i.status !== "pending");
      if (allDone) await finalize_b5(env, inc);

    } else if (action.action_id === "b5_remove") {
      item.status = "removed";
      await refresh_b5(env, inc);
      const allDone = inc.b5_items.every((i) => i.status !== "pending");
      if (allDone) await finalize_b5(env, inc);

    } else if (action.action_id === "b5_owner") {
      await slack_open_modal(
        payload.trigger_id,
        build_b5_owner_modal(action.value),
        env.SLACK_BOT_TOKEN
      ).catch(console.error);

    } else if (action.action_id === "b5_eta") {
      await slack_open_modal(
        payload.trigger_id,
        build_b5_eta_modal(action.value),
        env.SLACK_BOT_TOKEN
      ).catch(console.error);
    }
    return;
  }

  // All other actions require an active incident keyed by incident_id
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
      slack_update_message(
        channel,
        button_msg_ts,
        build_status_buttons(incident_id, "identified"),
        `Incident ${incident_id} — Root Cause Identified`,
        env.SLACK_BOT_TOKEN
      ).catch(console.error),
      slack_open_modal(
        payload.trigger_id,
        build_root_cause_modal(incident_id),
        env.SLACK_BOT_TOKEN
      ).catch(console.error),
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
      ).catch(console.error),
    ]);
  }

  // ── Resolved ────────────────────────────────────────────────────────────
  else if (action.action_id === "incident_resolved") {
    if (inc.phase === "resolved") return;
    inc.phase = "resolved";
    inc.timeline.push({ time: now, event: "Incident resolved", actor });

    if (inc.ping_timer) {
      clearInterval(inc.ping_timer);
      inc.ping_timer = undefined;
    }

    // Replace status buttons with resolved block
    await slack_update_message(
      channel,
      button_msg_ts,
      build_resolved_block(incident_id, actor),
      `Incident ${incident_id} RESOLVED`,
      env.SLACK_BOT_TOKEN
    ).catch(console.error);

    // Run B4: post-mortem to GitHub + statuspage + AI analysis
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

    inc.report_file_path = b4?.filePath;

    // B5: post interactive per-item blocks
    if (b4 && b4.b5_actions.length > 0) {
      inc.b5_items = b4.b5_actions.map((a) => ({
        action: a.action,
        owner: a.suggested_owner,
        eta: a.suggested_eta,
        status: "pending" as const,
      }));

      const b5_ts = await slack_reply_blocks(
        inc.slack_channel,
        inc.slack_thread_ts,
        build_b5_blocks(inc.incident_id, inc.b5_items),
        `B5 Prevention Plan — ${inc.incident_id}`,
        env.SLACK_BOT_TOKEN
      ).catch((err) => {
        console.error("[b5] post blocks failed:", err.message);
        return "";
      });

      inc.b5_message_ts = b5_ts || undefined;
    } else {
      // No AI proposals — close immediately
      resolve_active_incident(incident_id);
    }
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
    if (!pending) return;

    const type = vals.type_block?.incident_type?.selected_option?.value as IncidentType;
    const users_affected = parseInt(vals.users_block?.users_affected?.value ?? "0", 10);
    const flags = vals.impact_block?.impact_flags?.selected_options?.map((o) => o.value) ?? [];
    const severity =
      (vals.severity_block?.severity?.selected_option?.value as BusinessImpact["technical_severity"]) ??
      "degraded";

    const impact: BusinessImpact = {
      payment_affected:        flags.includes("payment"),
      data_integrity_affected: flags.includes("data_integrity"),
      login_register_broken:   flags.includes("login_register"),
      enterprise_sla_breach:   flags.includes("sla_breach"),
      technical_severity:      severity,
    };

    handle_b1(env, {
      incident_id:      pending.incident_id,
      start_time:       pending.start_time,
      slack_thread_ts:  pending.slack_thread_ts,
      description:      pending.description,
      type,
      ic_slack_id:      payload.user.id,
      ic_name:          `<@${payload.user.id}>`,
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

  // ── Fix description modal submitted ───────────────────────────────────
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

  // ── B5 owner change submitted ─────────────────────────────────────────
  if (callback_id === "b5_owner_submit") {
    const [incident_id, idxStr] = private_metadata.split(":");
    const idx = parseInt(idxStr, 10);
    const inc = get_active_incident(incident_id);
    if (!inc || !inc.b5_items || !inc.b5_items[idx]) return;

    const selected_user = vals.owner_block?.owner_user?.selected_user;
    if (!selected_user) return;

    // Resolve user ID → display name
    const display = await slack_get_user_name(selected_user, env.SLACK_BOT_TOKEN);
    inc.b5_items[idx].owner = display;

    await refresh_b5(env, inc);
    return;
  }

  // ── B5 ETA change submitted ───────────────────────────────────────────
  if (callback_id === "b5_eta_submit") {
    const [incident_id, idxStr] = private_metadata.split(":");
    const idx = parseInt(idxStr, 10);
    const inc = get_active_incident(incident_id);
    if (!inc || !inc.b5_items || !inc.b5_items[idx]) return;

    const new_eta = vals.eta_block?.eta_value?.selected_option?.value;
    if (!new_eta) return;

    inc.b5_items[idx].eta = new_eta;

    await refresh_b5(env, inc);
    return;
  }
}
