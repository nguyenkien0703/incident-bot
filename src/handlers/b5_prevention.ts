/**
 * B5 — PREVENTION (AI-Driven)
 *
 * Uses Claude to:
 *  1. Write a 2-3 sentence incident summary
 *  2. Propose 3-5 concrete prevention actions with suggested owner role + ETA
 *
 * The bot posts the proposals to Slack. IC/IT team confirms/adjusts
 * owner + ETA per item by replying in the thread.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { IncidentData } from "./b4_report";

export interface PreventionAction {
  action: string;
  suggested_owner: string; // DevOps | TechLead | PM | QA | CEO
  suggested_eta: string;   // 3 days | 1 week | 2 weeks | 1 month
}

export interface B5Analysis {
  summary: string;
  actions: PreventionAction[];
}

export async function generate_b5_analysis(
  api_key: string,
  incident: IncidentData & {
    root_cause?: string;
    fix_description?: string;
    ic_display_name?: string;
  }
): Promise<B5Analysis> {
  const client = new Anthropic({ apiKey: api_key });

  const timeline_text = incident.timeline
    .map((e) => `  ${e.time}: ${e.event}`)
    .join("\n");

  const prompt = `You are an incident response expert helping a software team write a post-mortem.

Incident data:
- ID: ${incident.incident_id}
- Type: ${incident.type}
- Priority: ${incident.priority}
- Root cause: ${incident.root_cause ?? "not specified"}
- Fix applied: ${incident.fix_description ?? "not specified"}
- Users affected: ~${incident.users_affected ?? 0}
- Payment affected: ${incident.payment_affected ? "yes" : "no"}
- Data integrity affected: ${incident.data_integrity_affected ? "yes" : "no"}
- IC: ${incident.ic_display_name ?? incident.ic}

Timeline:
${timeline_text}

Tasks:
1. Write a clear 2-3 sentence SUMMARY of what happened, the impact, and how it was resolved.
2. Propose 3-5 concrete PREVENTION actions to avoid recurrence. Each action must have:
   - A specific, actionable description
   - suggested_owner: one of DevOps | TechLead | PM | QA
   - suggested_eta: one of 3 days | 1 week | 2 weeks | 1 month

Return ONLY valid JSON in this exact shape:
{
  "summary": "...",
  "actions": [
    { "action": "...", "suggested_owner": "DevOps", "suggested_eta": "1 week" }
  ]
}`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (msg.content[0] as { type: string; text: string }).text.trim();

  // Strip markdown code fences if present
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  return JSON.parse(json) as B5Analysis;
}
