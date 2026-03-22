/**
 * Slack Block Kit message and modal builders
 */

const PHASE_LABEL: Record<string, string> = {
  investigating: "🔴 Investigating",
  identified:    "🟡 Root Cause Identified",
  monitoring:    "🟠 Fix In Progress",
  resolved:      "🟢 Resolved",
};

// ── B0: Classify button ──────────────────────────────────────────────────────

/**
 * Posted in thread after B0 — IC clicks to open the classify modal.
 */
export function build_classify_button(incident_id: string): object[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "👇 *IC — please classify this incident:*",
      },
    },
    {
      type: "actions",
      block_id: `classify_${incident_id}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "🚨 Classify Incident", emoji: true },
          value: incident_id,
          action_id: "incident_classify_open",
          style: "danger",
        },
      ],
    },
  ];
}

// ── Classify modal ───────────────────────────────────────────────────────────

/**
 * Modal for IC to fill in incident type + business impact.
 * private_metadata: JSON string with incident_id, thread_ts, description.
 */
export function build_classify_modal(private_metadata: string, description: string): object {
  return {
    type: "modal",
    callback_id: "classify_incident",
    private_metadata,
    title: { type: "plain_text", text: "Classify Incident" },
    submit: { type: "plain_text", text: "Classify" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Trigger:* ${description}` },
      },
      { type: "divider" },
      {
        type: "input",
        block_id: "type_block",
        label: { type: "plain_text", text: "Incident Type" },
        element: {
          type: "static_select",
          action_id: "incident_type",
          placeholder: { type: "plain_text", text: "Select type" },
          options: [
            { text: { type: "plain_text", text: "🔴 AVAILABILITY" }, value: "AVAILABILITY" },
            { text: { type: "plain_text", text: "🟡 PERFORMANCE" }, value: "PERFORMANCE" },
            { text: { type: "plain_text", text: "🔵 DATA" }, value: "DATA" },
            { text: { type: "plain_text", text: "🟣 INTEGRATION" }, value: "INTEGRATION" },
            { text: { type: "plain_text", text: "🔒 SECURITY" }, value: "SECURITY" },
          ],
        },
      },
      {
        type: "input",
        block_id: "users_block",
        label: { type: "plain_text", text: "Users affected (approx.)" },
        element: {
          type: "number_input",
          action_id: "users_affected",
          is_decimal_allowed: false,
          min_value: "0",
        },
      },
      {
        type: "input",
        block_id: "impact_block",
        optional: true,
        label: { type: "plain_text", text: "Business Impact" },
        element: {
          type: "checkboxes",
          action_id: "impact_flags",
          options: [
            { text: { type: "plain_text", text: "💳 Payment affected", emoji: true }, value: "payment" },
            { text: { type: "plain_text", text: "🗃️ Data integrity risk", emoji: true }, value: "data_integrity" },
            { text: { type: "plain_text", text: "🔐 Login/Register broken", emoji: true }, value: "login_register" },
            { text: { type: "plain_text", text: "⚠️ Enterprise SLA breach", emoji: true }, value: "sla_breach" },
          ],
        },
      },
      {
        type: "input",
        block_id: "severity_block",
        label: { type: "plain_text", text: "Technical Severity" },
        element: {
          type: "static_select",
          action_id: "severity",
          options: [
            { text: { type: "plain_text", text: "🟢 Minor" }, value: "minor" },
            { text: { type: "plain_text", text: "🟡 Degraded" }, value: "degraded" },
            { text: { type: "plain_text", text: "🔴 Critical" }, value: "critical" },
            { text: { type: "plain_text", text: "💀 Full Down" }, value: "full_down" },
          ],
        },
      },
    ],
  };
}

// ── Status buttons (posted after B1, and every ping) ────────────────────────

/**
 * 3 status buttons. The button matching `phase` is highlighted (primary style).
 */
export function build_status_buttons(incident_id: string, phase: string): object[] {
  const label = PHASE_LABEL[phase] ?? phase.toUpperCase();

  const btn = (
    text: string,
    action_id: string,
    value_phase: string
  ) => ({
    type: "button",
    text: { type: "plain_text", text, emoji: true },
    value: incident_id,
    action_id,
    ...(value_phase === phase ? { style: "primary" } : {}),
  });

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Incident \`${incident_id}\`* — Status: *${label}*`,
      },
    },
    {
      type: "actions",
      block_id: `status_${incident_id}_${Date.now()}`,
      elements: [
        btn("🔍 Root Cause Identified", "incident_identified", "identified"),
        btn("🔧 Fix In Progress",       "incident_monitoring", "monitoring"),
        btn("✅ Resolved",              "incident_resolved",   "resolved"),
      ],
    },
  ];
}

/** Static "resolved" block — replaces buttons on the clicked message. */
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

// ── Root cause modal ─────────────────────────────────────────────────────────

export function build_root_cause_modal(incident_id: string): object {
  return {
    type: "modal",
    callback_id: "root_cause_submit",
    private_metadata: incident_id,
    title: { type: "plain_text", text: "Root Cause" },
    submit: { type: "plain_text", text: "Submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "root_cause_block",
        label: { type: "plain_text", text: "Root cause description" },
        hint: { type: "plain_text", text: "What caused this incident?" },
        element: {
          type: "plain_text_input",
          action_id: "root_cause",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "E.g. DB connection pool exhausted due to a slow query spike...",
          },
        },
      },
    ],
  };
}

// ── Fix description modal ────────────────────────────────────────────────────

export function build_fix_modal(incident_id: string): object {
  return {
    type: "modal",
    callback_id: "fix_description_submit",
    private_metadata: incident_id,
    title: { type: "plain_text", text: "Fix In Progress" },
    submit: { type: "plain_text", text: "Submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "fix_block",
        label: { type: "plain_text", text: "Fix / Action taken" },
        hint: { type: "plain_text", text: "What fix or mitigation is being applied?" },
        element: {
          type: "plain_text_input",
          action_id: "fix_description",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "E.g. Increased DB pool size, restarted payment service, rolled back deploy...",
          },
        },
      },
    ],
  };
}
