/**
 * B1 — NOTIFY & CLASSIFY
 * Triggered when IC provides incident type + business impact.
 * 1. Determine final priority
 * 2. Post full incident thread
 * 3. Notify the right people (Slack DM + Slack Call with phone fallback)
 * 4. Update status page
 */

import {
  determinePriority,
  isHighSeverity,
  type BusinessImpact,
  type Priority,
  type IncidentType,
} from "../utils/priority";
import { get_team_contacts, get_by_role } from "../utils/contacts";
import { get_current_time, format_duration } from "../utils/time";
import {
  slack_reply_to_thread,
  slack_post_message,
  slack_tag_user,
  slack_open_dm,
  slack_reply_blocks,
} from "../tools/slack";
import { build_status_buttons } from "../tools/slack_blocks";
import { phone_call } from "../tools/twilio";
import { status_page_update } from "../tools/statuspage";
import { calendar_create_meeting } from "../tools/calendar";
import { register_active_incident, type ActiveIncident } from "../state";
import type { Env } from "../index";

export interface ClassifyInput {
  incident_id: string;
  start_time: string;
  slack_thread_ts: string;
  type: IncidentType;
  description: string;
  ic_slack_id: string;
  ic_name: string;
  users_affected: number;
  impact: BusinessImpact;
}

export async function handle_b1(env: Env, input: ClassifyInput): Promise<Priority> {
  const priority = determinePriority(input.impact);
  const now = get_current_time();
  const contacts = await get_team_contacts(env.db);

  // 1. Post full incident thread
  const threadMsg = `🚨 *[INCIDENT - ${priority}]* \`#${input.incident_id}\`

*Time detected:* ${input.start_time}
*Type:* ${input.type}
*Service:* lumilink-be
*Description:* ${input.description}

*Business Impact:*
• Users affected: ~${input.users_affected}
• Payment: ${input.impact.payment_affected ? "yes ⚠️" : "no"}
• Data integrity: ${input.impact.data_integrity_affected ? "yes ⚠️" : "no"}
• Login/Register broken: ${input.impact.login_register_broken ? "yes ⚠️" : "no"}

*Priority:* ${priority}
*IC:* ${input.ic_name}
*Status:* Investigating 🔍`;

  await slack_reply_to_thread(
    env.SLACK_INCIDENTS_CHANNEL,
    input.slack_thread_ts,
    threadMsg,
    env.SLACK_BOT_TOKEN
  );

  // 2. Create Google Meet (best-effort) — link will be sent in thread + every DM
  let meetLink: string | null = null;
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN) {
    const allContacts = await get_team_contacts(env.db).catch(() => []);
    const emails = allContacts.map((c) => c.email).filter(Boolean);
    const meeting = await calendar_create_meeting(
      `[${priority}] Incident Response — ${input.incident_id}`,
      emails,
      `Incident: ${input.description}\nPriority: ${priority}\nIC: ${input.ic_name}`,
      {
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REFRESH_TOKEN: env.GOOGLE_REFRESH_TOKEN,
      }
    ).catch((err) => { console.warn("[b1] calendar skipped:", err.message); return null; });

    if (meeting) {
      meetLink = meeting.meeting_link;
      await slack_reply_to_thread(
        env.SLACK_INCIDENTS_CHANNEL,
        input.slack_thread_ts,
        `📹 *War Room* — Join the incident call:\n${meetLink}`,
        env.SLACK_BOT_TOKEN
      ).catch(console.error);
    }
  }

  // 3. Determine who to notify
  const toNotify: typeof contacts = [];
  const isHigh = isHighSeverity(priority);

  if (input.type === "DATA" || input.impact.data_integrity_affected) {
    toNotify.push(...get_by_role(contacts, "TechLead"));
  }
  if (input.type === "SECURITY") {
    toNotify.push(...get_by_role(contacts, "TechLead"));
    toNotify.push(...get_by_role(contacts, "Legal"));
  }

  toNotify.push(...get_by_role(contacts, "PM"));

  if (isHigh) {
    toNotify.push(...get_by_role(contacts, "DevOps"));
  }
  if (priority === "P0") {
    toNotify.push(...contacts); // everyone
  }
  if (input.type === "DATA" && isHigh) {
    toNotify.push(...get_by_role(contacts, "CEO"));
  }
  if (input.type === "SECURITY" && isHigh) {
    toNotify.push(...get_by_role(contacts, "Legal"));
  }

  // Deduplicate by slack_id
  const seen = new Set<string>();
  const uniqueNotify = toNotify.filter((c) => {
    if (seen.has(c.slack_id)) return false;
    seen.add(c.slack_id);
    return true;
  });

  await Promise.all(
    uniqueNotify.map(async (contact) => {
      // Build huddle link for this user's DM channel with the bot
      let huddleLink = "";
      if (env.SLACK_TEAM_ID) {
        const dmChannelId = await slack_open_dm(contact.slack_id, env.SLACK_BOT_TOKEN).catch(() => "");
        if (dmChannelId) {
          huddleLink = `https://app.slack.com/huddle/${env.SLACK_TEAM_ID}/${dmChannelId}`;
        }
      }

      const dm = [
        `${slack_tag_user(contact.slack_id)} 🚨 *Incident ${priority} — ${input.incident_id}*`,
        `Description: ${input.description}`,
        `Please check <#${env.SLACK_INCIDENTS_CHANNEL}> immediately.`,
        huddleLink ? `📞 *Join Huddle ngay:* ${huddleLink}` : "",
        meetLink ? `📹 *War Room (Meet):* ${meetLink}` : "",
      ].filter(Boolean).join("\n");

      const shouldEscalate =
        priority === "P0" ||
        (priority === "P1" && (contact.role === "TechLead" || contact.role === "DevOps"));

      const escalationMsg = `Incident ${input.incident_id} severity ${priority} on lumilink-be. Please join Slack incidents channel immediately.`;

      // Send DM + phone call simultaneously (no delay)
      await Promise.all([
        slack_post_message(contact.slack_id, dm, env.SLACK_BOT_TOKEN).catch((err) =>
          console.error(`[b1] DM failed for ${contact.slack_id}:`, err.message)
        ),
        shouldEscalate && contact.phone && env.TWILIO_ACCOUNT_SID
          ? phone_call(contact.phone, escalationMsg, {
              TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
              TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
              TWILIO_FROM_NUMBER: env.TWILIO_FROM_NUMBER,
              SERVER_URL: env.SERVER_URL,
            }).catch((err) =>
              console.error(`[b1] phone call failed for ${contact.name}:`, err.message)
            )
          : Promise.resolve(),
      ]);
    })
  );

  // 3. Update status page (best-effort)
  if (env.STATUSPAGE_API_KEY && env.STATUSPAGE_PAGE_ID && env.STATUSPAGE_COMPONENT_ID) {
    await status_page_update(
      "investigating",
      `🔴 [INVESTIGATING] ${now} — We are experiencing an issue affecting ${input.description}. Our team is investigating. Next update within 15 minutes.`,
      {
        STATUSPAGE_API_KEY: env.STATUSPAGE_API_KEY,
        STATUSPAGE_PAGE_ID: env.STATUSPAGE_PAGE_ID,
        STATUSPAGE_COMPONENT_ID: env.STATUSPAGE_COMPONENT_ID,
      }
    ).catch((err) => console.warn("[b1] statuspage skipped:", err.message));
  }

  // 4. Register active incident + post interactive status buttons
  const activeInc: ActiveIncident = {
    incident_id: input.incident_id,
    start_time: input.start_time,
    slack_thread_ts: input.slack_thread_ts,
    slack_channel: env.SLACK_INCIDENTS_CHANNEL,
    description: input.description,
    type: input.type,
    priority,
    ic_slack_id: input.ic_slack_id,
    ic_name: input.ic_name,
    users_affected: input.users_affected,
    payment_affected: input.impact.payment_affected,
    data_integrity_affected: input.impact.data_integrity_affected,
    phase: "investigating",
    awaiting: null,
    ping_count: 0,
    timeline: [
      { time: input.start_time, event: "Incident detected", actor: "system" },
      { time: now, event: `Classified as ${priority} (${input.type})`, actor: input.ic_name },
    ],
  };

  // Post the first status-button message in thread
  await slack_reply_blocks(
    env.SLACK_INCIDENTS_CHANNEL,
    input.slack_thread_ts,
    build_status_buttons(input.incident_id, "investigating"),
    `Incident ${input.incident_id} — update the status when ready`,
    env.SLACK_BOT_TOKEN
  ).catch((err) => console.error("[b1] status buttons failed:", err.message));

  // Start 15-minute proactive ping timer (stops automatically after 20 pings = 5h)
  // const PING_INTERVAL_MS = 15 * 60 * 1000;
  const PING_INTERVAL_MS =  10 * 1000;
  activeInc.ping_timer = setInterval(async () => {
    if (activeInc.phase === "resolved") {
      clearInterval(activeInc.ping_timer);
      return;
    }
    activeInc.ping_count++;
    if (activeInc.ping_count > 20) {
      clearInterval(activeInc.ping_timer);
      return;
    }
    const elapsed = format_duration(activeInc.start_time, get_current_time());
    await slack_reply_blocks(
      env.SLACK_INCIDENTS_CHANNEL,
      activeInc.slack_thread_ts,
      build_status_buttons(activeInc.incident_id, activeInc.phase),
      `⏰ Ping #${activeInc.ping_count} — ${elapsed} elapsed. Please update the incident status.`,
      env.SLACK_BOT_TOKEN
    ).catch((err) => console.error("[ping] failed:", err.message));
  }, PING_INTERVAL_MS);

  register_active_incident(activeInc);

  return priority;
}
