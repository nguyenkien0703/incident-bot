/**
 * Slack-first escalation with 1-minute phone fallback.
 *
 * Flow:
 * 1. Create a Slack Call and invite the contact → they get a "ring" notification
 * 2. Store the escalation in DB
 * 3. After 60 seconds, check if anyone joined:
 *    - Joined → clean up, done
 *    - Not joined → end the Slack Call, fall back to Twilio phone call (if phone set)
 */

import { db } from "../db/client";
import {
  slack_calls_add,
  slack_calls_invite,
  slack_calls_info,
  slack_calls_end,
} from "../tools/slack_calls";
import { phone_call } from "../tools/twilio";

export interface EscalationContact {
  slack_id: string;
  phone?: string;
  name: string;
}

export interface EscalationEnv {
  SLACK_BOT_TOKEN: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM_NUMBER: string;
  SERVER_URL: string;
}

export async function initiate_escalation(
  contact: EscalationContact,
  message: string,
  incident_id: string,
  env: EscalationEnv
): Promise<void> {
  const external_unique_id = `${incident_id}-${contact.slack_id}`;
  const join_url = `${env.SERVER_URL}/call-join`;

  // 1. Create Slack Call and invite the contact
  const { call_id } = await slack_calls_add(external_unique_id, join_url, env.SLACK_BOT_TOKEN);
  await slack_calls_invite(call_id, [contact.slack_id], env.SLACK_BOT_TOKEN);

  // 2. Persist escalation record
  await db.query(
    `INSERT INTO escalations (incident_id, contact_slack_id, slack_call_id, message)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (incident_id, contact_slack_id) DO NOTHING`,
    [incident_id, contact.slack_id, call_id, message]
  );

  // 3. After 60 seconds, check if contact joined — if not, fall back to phone
  setTimeout(async () => {
    try {
      const { participants } = await slack_calls_info(call_id, env.SLACK_BOT_TOKEN);

      if (participants.length === 0) {
        // No one joined — end the Slack Call and call the phone if available
        await slack_calls_end(call_id, env.SLACK_BOT_TOKEN).catch(() => {});

        if (contact.phone) {
          await phone_call(contact.phone, message, {
            TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
            TWILIO_FROM_NUMBER: env.TWILIO_FROM_NUMBER,
            SERVER_URL: env.SERVER_URL,
          });
        }
      }
    } catch (err) {
      console.error(`[escalation] timeout handler error for ${contact.slack_id}:`, err);
    } finally {
      await db
        .query(
          `UPDATE escalations SET done = TRUE
           WHERE incident_id = $1 AND contact_slack_id = $2`,
          [incident_id, contact.slack_id]
        )
        .catch(() => {});
    }
  }, 60_000);
}
