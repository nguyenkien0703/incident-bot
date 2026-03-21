/**
 * Slack Block Kit message builders
 */

const PHASE_LABEL: Record<string, string> = {
  investigating: "🔴 Investigating",
  identified:    "🟡 Root Cause Identified",
  monitoring:    "🟠 Fix In Progress",
  resolved:      "🟢 Resolved",
};

/**
 * Returns Block Kit blocks with 3 status-update buttons.
 * Rendered in the incident Slack thread after B1 classification
 * and in every 15-minute proactive ping.
 */
export function build_status_buttons(incident_id: string, phase: string): object[] {
  const label = PHASE_LABEL[phase] ?? phase.toUpperCase();

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Incident \`${incident_id}\`* — Status: *${label}*\nIC, please update the current status:`,
      },
    },
    {
      type: "actions",
      block_id: `status_${incident_id}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "🔍 Root Cause Identified", emoji: true },
          value: incident_id,
          action_id: "incident_identified",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "🔧 Fix In Progress", emoji: true },
          value: incident_id,
          action_id: "incident_monitoring",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Resolved", emoji: true },
          value: incident_id,
          action_id: "incident_resolved",
          style: "primary",
        },
      ],
    },
  ];
}

/** Replaces the buttons with a static "resolved" section — no more clicks possible */
export function build_resolved_block(incident_id: string, actor: string): object[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ *Incident \`${incident_id}\` — RESOLVED* by ${actor}`,
      },
    },
  ];
}
