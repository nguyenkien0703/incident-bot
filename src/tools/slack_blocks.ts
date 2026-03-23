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
            { text: { type: "plain_text", text: "🔴 AVAILABILITY" }, description: { type: "plain_text", text: "App down, 503, Worker crash, API không respond" }, value: "AVAILABILITY" },
            { text: { type: "plain_text", text: "🟡 PERFORMANCE" }, description: { type: "plain_text", text: "p99 > 5s sustained, error rate đột biến, hệ thống chậm" }, value: "PERFORMANCE" },
            { text: { type: "plain_text", text: "🔵 DATA" },         description: { type: "plain_text", text: "Migration fail, data loss / corruption, data sai lệch" }, value: "DATA" },
            { text: { type: "plain_text", text: "🟣 INTEGRATION" }, description: { type: "plain_text", text: "3rd party fail: Jira, Confluence, AI provider down" },   value: "INTEGRATION" },
            { text: { type: "plain_text", text: "🔒 SECURITY" },    description: { type: "plain_text", text: "Unauthorized access, data leak, exposed secrets" },       value: "SECURITY" },
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
            { text: { type: "plain_text", text: "🟢 Minor" },     description: { type: "plain_text", text: "Error rate nhẹ, integration fail không critical, perf giảm nhẹ" }, value: "minor" },
            { text: { type: "plain_text", text: "🟡 Degraded" },  description: { type: "plain_text", text: "Core feature broken, 5xx > 5%, p99 > 5s sustained" },              value: "degraded" },
            { text: { type: "plain_text", text: "🔴 Critical" },  description: { type: "plain_text", text: "Service partial down, data inconsistency, nhiều features ảnh hưởng" }, value: "critical" },
            { text: { type: "plain_text", text: "💀 Full Down" }, description: { type: "plain_text", text: "Service hoàn toàn down, data loss / corruption, security breach" },  value: "full_down" },
          ],
        },
      },
    ],
  };
}

// ── Status buttons (posted after B1, and every ping) ────────────────────────

/**
 * Sequential step buttons — guides IC through the 3-step flow.
 * Only the NEXT logical step is highlighted (primary/green).
 * Completed steps are shown as plain text checkmarks above the buttons.
 */
export function build_status_buttons(incident_id: string, phase: string): object[] {
  const label = PHASE_LABEL[phase] ?? phase.toUpperCase();

  // Step completion markers shown as text above buttons
  const step1done = phase === "identified" || phase === "monitoring" || phase === "resolved";
  const step2done = phase === "monitoring" || phase === "resolved";

  const stepLine = [
    step1done ? "✅ ~~Step 1: Root Cause~~" : "⬜ Step 1: Root Cause Identified",
    step2done ? "✅ ~~Step 2: Fix In Progress~~" : "⬜ Step 2: Fix In Progress",
    "⬜ Step 3: Resolved",
  ].join("  →  ");

  // Guide text tells IC exactly what to click next
  const guide: Record<string, string> = {
    investigating: "👇 *Bắt đầu từ Step 1* — click khi đã xác định được nguyên nhân",
    identified:    "👇 *Tiếp theo Step 2* — click khi đã bắt đầu fix",
    monitoring:    "👇 *Cuối cùng Step 3* — click khi incident đã hoàn toàn resolved",
  };

  // Next-step button is primary (green); others are default (gray)
  const nextStep: Record<string, string> = {
    investigating: "identified",
    identified:    "monitoring",
    monitoring:    "resolved",
  };
  const highlighted = nextStep[phase] ?? "";

  const btn = (text: string, action_id: string, value_phase: string) => ({
    type: "button",
    text: { type: "plain_text", text, emoji: true },
    value: incident_id,
    action_id,
    ...(value_phase === highlighted ? { style: "primary" } : {}),
  });

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Incident \`${incident_id}\`* — ${label}\n${stepLine}`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: guide[phase] ?? "" },
    },
    {
      type: "actions",
      block_id: `status_${incident_id}_${Date.now()}`,
      elements: [
        btn("🔍 1. Root Cause Identified", "incident_identified", "identified"),
        btn("🔧 2. Fix In Progress",        "incident_monitoring", "monitoring"),
        btn("✅ 3. Resolved",               "incident_resolved",   "resolved"),
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

// ── B5 interactive blocks ────────────────────────────────────────────────────

export interface B5Item {
  action: string;
  owner: string;
  eta: string;
  status: "pending" | "confirmed" | "removed";
}

/**
 * Per-item interactive B5 message.
 * Each pending item shows: ✅ Confirm | 👤 Change Owner | ⏱ Change ETA | 🗑 Remove
 */
export function build_b5_blocks(incident_id: string, items: B5Item[]): object[] {
  const rows: object[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📋 B5 — AI Prevention Plan*\n🤖 Review each item — confirm, adjust owner/ETA, or remove:",
      },
    },
    { type: "divider" },
  ];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const val = `${incident_id}:${i}`;
    const icon = item.status === "confirmed" ? "✅" : item.status === "removed" ? "❌" : "⏳";
    const actionText = item.status === "removed" ? `~${item.action}~` : item.action;

    rows.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${icon} *${i + 1}. ${actionText}*\n👤 Owner: *${item.owner}*  |  ⏱ ETA: *${item.eta}*`,
      },
    });

    if (item.status === "pending") {
      rows.push({
        type: "actions",
        block_id: `b5_${incident_id}_${i}_${Date.now()}`,
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Confirm", emoji: true },
            value: val,
            action_id: "b5_confirm",
            style: "primary",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "👤 Owner", emoji: true },
            value: val,
            action_id: "b5_owner",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "⏱ ETA", emoji: true },
            value: val,
            action_id: "b5_eta",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "🗑 Remove", emoji: true },
            value: val,
            action_id: "b5_remove",
            style: "danger",
          },
        ],
      });
    }

    rows.push({ type: "divider" });
  }

  const pending = items.filter((i) => i.status === "pending").length;
  rows.push(
    pending > 0
      ? {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_${pending} item(s) pending — confirm or remove all to finalize the report_`,
            },
          ],
        }
      : {
          type: "section",
          text: { type: "mrkdwn", text: "✅ *All items reviewed! Finalizing report...*" },
        }
  );

  return rows;
}

/** Modal to pick a new owner (Slack user picker) */
export function build_b5_owner_modal(metadata: string): object {
  return {
    type: "modal",
    callback_id: "b5_owner_submit",
    private_metadata: metadata,
    title: { type: "plain_text", text: "Change Owner" },
    submit: { type: "plain_text", text: "Update" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "owner_block",
        label: { type: "plain_text", text: "Select new owner" },
        element: {
          type: "users_select",
          action_id: "owner_user",
          placeholder: { type: "plain_text", text: "Choose a team member" },
        },
      },
    ],
  };
}

/** Modal to pick a new ETA */
export function build_b5_eta_modal(metadata: string): object {
  return {
    type: "modal",
    callback_id: "b5_eta_submit",
    private_metadata: metadata,
    title: { type: "plain_text", text: "Change ETA" },
    submit: { type: "plain_text", text: "Update" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "eta_block",
        label: { type: "plain_text", text: "New ETA" },
        element: {
          type: "static_select",
          action_id: "eta_value",
          options: [
            { text: { type: "plain_text", text: "3 days" },   value: "3 days" },
            { text: { type: "plain_text", text: "1 week" },   value: "1 week" },
            { text: { type: "plain_text", text: "2 weeks" },  value: "2 weeks" },
            { text: { type: "plain_text", text: "1 month" },  value: "1 month" },
            { text: { type: "plain_text", text: "3 months" }, value: "3 months" },
          ],
        },
      },
    ],
  };
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
