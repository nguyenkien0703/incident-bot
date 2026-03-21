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
import { is_business_hours, get_current_time } from "../utils/time";
import { slack_reply_to_thread, slack_post_message, slack_tag_user } from "../tools/slack";
import { initiate_escalation } from "../escalation/initiate_escalation";
import { status_page_update } from "../tools/statuspage";
import { calendar_create_meeting } from "../tools/calendar";
import type { Env } from "../index";

export interface ClassifyInput {
  incident_id: string;
  start_time: string;
  slack_thread_ts: string;
  type: IncidentType;
  description: string;
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

  // 2. Create Google Meet and post link to thread (best-effort)
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN) {
    const contacts = await get_team_contacts(env.db).catch(() => []);
    const emails = contacts.map((c) => c.email).filter(Boolean);

    const meeting = await calendar_create_meeting(
      `[${priority}] Incident Response — ${input.incident_id}`,
      emails,
      `Incident: ${input.description}\nPriority: ${priority}\nIC: ${input.ic_name}`,
      {
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REFRESH_TOKEN: env.GOOGLE_REFRESH_TOKEN,
      }
    ).catch((err) => {
      console.warn("[b1] calendar skipped:", err.message);
      return null;
    });

    if (meeting) {
      await slack_reply_to_thread(
        env.SLACK_INCIDENTS_CHANNEL,
        input.slack_thread_ts,
        `📹 *War Room* — Join the incident call:\n${meeting.meeting_link}`,
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

  const businessHours = is_business_hours(now);

  for (const contact of uniqueNotify) {
    // Always send Slack DM
    const dm = `${slack_tag_user(contact.slack_id)} 🚨 *Incident ${priority} — ${input.incident_id}* requires your attention. Please check <#${env.SLACK_INCIDENTS_CHANNEL}> immediately.`;
    await slack_post_message(contact.slack_id, dm, env.SLACK_BOT_TOKEN);

    // Off-hours: escalate via Slack Call (with phone fallback after 1 min)
    if (!businessHours) {
      const shouldEscalate =
        priority === "P0" ||
        (priority === "P1" && (contact.role === "TechLead" || contact.role === "DevOps"));

      if (shouldEscalate) {
        const message = `Incident ${input.incident_id} severity ${priority} on lumilink-be. Please join Slack incidents channel immediately.`;
        await initiate_escalation(
          { slack_id: contact.slack_id, phone: contact.phone, name: contact.name },
          message,
          input.incident_id,
          env
        );
      }
    }
  }

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

  return priority;
}
