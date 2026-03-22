/**
 * B5 — PREVENTION (AI-Driven via OpenRouter)
 *
 * Calls OpenRouter (OpenAI-compatible API) to:
 *  1. Write a 2-3 sentence incident summary
 *  2. Propose 3-5 concrete prevention actions with suggested owner + ETA
 *
 * Model: google/gemini-2.0-flash-lite  (cheap + fast, good for structured JSON)
 * Swap to any model at OPENROUTER_MODEL env var.
 */

import type { IncidentData } from "./b4_report";

export interface PreventionAction {
  action: string;
  suggested_owner: string; // DevOps | TechLead | PM | QA
  suggested_eta: string;   // 3 days | 1 week | 2 weeks | 1 month
}

export interface B5Analysis {
  summary: string;
  actions: PreventionAction[];
}

const DEFAULT_MODEL = "google/gemini-2.0-flash-lite";

export async function generate_b5_analysis(
  api_key: string,
  incident: IncidentData & {
    root_cause?: string;
    fix_description?: string;
    ic_display_name?: string;
  }
): Promise<B5Analysis> {
  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

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

Return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "summary": "...",
  "actions": [
    { "action": "...", "suggested_owner": "DevOps", "suggested_eta": "1 week" }
  ]
}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${api_key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/DefikitTeam/incident-response-bot",
      "X-Title": "Incident Response Bot",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const raw = data.choices[0]?.message?.content?.trim() ?? "";
  // Strip markdown code fences if model wraps in ```json ... ```
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  return JSON.parse(json) as B5Analysis;
}
