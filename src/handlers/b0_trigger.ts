/**
 * B0 — TRIGGER
 * Called when a monitoring alert, user report, or IC message arrives.
 * 1. Records start_time
 * 2. Generates incident_id
 * 3. Posts initial status page update
 * 4. Prompts IC for Type + Business Impact
 */

import { get_current_time, generate_incident_id } from "../utils/time";
import { status_page_update } from "../tools/statuspage";
import { slack_create_thread, slack_reply_blocks } from "../tools/slack";
import { build_classify_button } from "../tools/slack_blocks";
import type { Env } from "../index";

export async function handle_b0(
  env: Env,
  ic_channel: string,
  trigger_description: string
): Promise<{ incident_id: string; start_time: string; slack_thread_ts: string; description: string }> {
  const start_time = get_current_time();
  const incident_id = generate_incident_id(start_time);

  // 1. Status page: investigating (best-effort — skip if not configured)
  if (env.STATUSPAGE_API_KEY && env.STATUSPAGE_PAGE_ID && env.STATUSPAGE_COMPONENT_ID) {
    await status_page_update(
      "investigating",
      "🔵 We are investigating a potential issue. Our team is checking.",
      {
        STATUSPAGE_API_KEY: env.STATUSPAGE_API_KEY,
        STATUSPAGE_PAGE_ID: env.STATUSPAGE_PAGE_ID,
        STATUSPAGE_COMPONENT_ID: env.STATUSPAGE_COMPONENT_ID,
      }
    ).catch((err) => console.warn("[b0] statuspage skipped:", err.message));
  }

  // 2. Create Slack thread in #incidents (or reply in IC's channel)
  const initialMessage = `🚨 *Incident Detected* | ID: \`${incident_id}\`\nTime: ${start_time}\nTrigger: ${trigger_description}\n\n_Awaiting IC classification..._`;
  const thread_ts = await slack_create_thread(
    env.SLACK_INCIDENTS_CHANNEL,
    initialMessage,
    env.SLACK_BOT_TOKEN
  );

  // 3. Post interactive "Classify Incident" button in thread
  await slack_reply_blocks(
    env.SLACK_INCIDENTS_CHANNEL,
    thread_ts,
    build_classify_button(incident_id),
    "Click to classify this incident",
    env.SLACK_BOT_TOKEN
  );

  return { incident_id, start_time, slack_thread_ts: thread_ts, description: trigger_description };
}
