import Fastify from "fastify";
import type { Pool } from "pg";
import { db } from "./db/client";
import { seed_contacts } from "./db/seed";
import { handle_b0 } from "./handlers/b0_trigger";
import {
  register_incident,
  should_trigger_incident,
  get_active_by_thread,
  resolve_active_incident,
} from "./state";
import { update_action_items } from "./tools/github";
import {
  handle_slack_action,
  handle_view_submission,
  type SlackActionPayload,
  type ViewSubmissionPayload,
} from "./handlers/slack_actions";
import { slack_reply_to_thread } from "./tools/slack";
import { get_current_time } from "./utils/time";

export interface Env {
  // Slack
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  SLACK_INCIDENTS_CHANNEL: string;
  SLACK_MONITOR_CHANNEL: string; // channel ID of infra-noti-ai-team
  SLACK_TEAM_ID: string;         // workspace team ID (e.g. T051U708XN3)

  // Twilio
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM_NUMBER: string;

  // Server (own domain — used for TwiML callback URL)
  SERVER_URL: string;

  // Statuspage.io
  STATUSPAGE_API_KEY: string;
  STATUSPAGE_PAGE_ID: string;
  STATUSPAGE_COMPONENT_ID: string;

  // Google Calendar
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;

  // GitHub (incident report file write)
  GITHUB_TOKEN: string;
  GITHUB_REPO_OWNER: string;
  GITHUB_REPO_NAME: string;

  // Anthropic
  ANTHROPIC_API_KEY: string;

  // PostgreSQL pool (injected at startup)
  db: Pool;
}

function buildEnv(): Env {
  const required = [
    "SLACK_BOT_TOKEN",
    "SLACK_INCIDENTS_CHANNEL",
  ];

  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }

  return {
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN!,
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET!,
    SLACK_INCIDENTS_CHANNEL: process.env.SLACK_INCIDENTS_CHANNEL!,
    SLACK_MONITOR_CHANNEL: process.env.SLACK_MONITOR_CHANNEL ?? "",
    SLACK_TEAM_ID: process.env.SLACK_TEAM_ID ?? "",
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID!,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN!,
    TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER!,
    SERVER_URL: process.env.SERVER_URL!,
    STATUSPAGE_API_KEY: process.env.STATUSPAGE_API_KEY!,
    STATUSPAGE_PAGE_ID: process.env.STATUSPAGE_PAGE_ID!,
    STATUSPAGE_COMPONENT_ID: process.env.STATUSPAGE_COMPONENT_ID!,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN!,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN!,
    GITHUB_REPO_OWNER: process.env.GITHUB_REPO_OWNER!,
    GITHUB_REPO_NAME: process.env.GITHUB_REPO_NAME!,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    db,
  };
}

/**
 * Parse a message from the infra monitoring channel (infra-noti-ai-team).
 * Returns a short incident description, or null if the message should be ignored.
 *
 * Triggers on: "🔥 500 Error - PRODUCTION" style messages
 * Ignores: "Error Update: X Additional Occurrence" (repeat/summary alerts)
 */
function parse_monitor_alert(text: string): string | null {
  // Ignore repeat/summary alerts — these are just noise
  if (/error update|additional occurrence/i.test(text)) return null;

  // Only process messages that look like an error alert
  if (!/\d{3}\s*error|status code[:\s]+[45]\d{2}/i.test(text)) return null;

  const statusMatch = text.match(/Status Code[:\s]+(\d+)/i);
  const requestMatch = text.match(/Request[:\s]+([A-Z]+)\s+(https?:\/\/\S+)/i);
  const envMatch = text.match(/Environment[:\s]+(\w+)/i);
  const errorMsgMatch = text.match(/Error Message[:\s]+(.+)/i);

  const status = statusMatch?.[1] ?? "5xx";
  const env = envMatch?.[1] ?? "production";
  const errorMsg = errorMsgMatch?.[1]?.trim();

  let description = `${status} error`;

  if (requestMatch) {
    const method = requestMatch[1];
    try {
      const path = new URL(requestMatch[2]).pathname;
      description += ` on ${method} ${path}`;
    } catch {
      description += ` on ${requestMatch[1]} ${requestMatch[2]}`;
    }
  }

  if (errorMsg) description += ` — ${errorMsg}`;
  description += ` [${env}]`;

  return description;
}

async function start() {
  const env = buildEnv();

  // Seed team contacts from team_contacts.json
  await seed_contacts(db).catch((err) =>
    console.warn("[seed] skipped:", err.message)
  );

  const app = Fastify({ logger: true });

  // ── Parse application/x-www-form-urlencoded (Slack slash commands) ──────
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      const obj: Record<string, string> = {};
      for (const [k, v] of new URLSearchParams(body as string)) obj[k] = v;
      done(null, obj);
    }
  );

  // ── Allow empty JSON bodies (some monitoring webhooks send no body) ──────
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      if (!body) return done(null, {});
      try { done(null, JSON.parse(body as string)); }
      catch (e) { done(e as Error, undefined); }
    }
  );

  // ── Slack slash command: /incident <description> ────────────────────────
  app.post("/slack/slash", async (req, reply) => {
    const body = req.body as Record<string, string>;
    const description = (body.text ?? "").trim() || "Incident reported via slash command";

    // Respond to Slack immediately (must be within 3s or Slack times out)
    reply.send({
      response_type: "ephemeral",
      text: `⏳ Opening incident... Check <#${env.SLACK_INCIDENTS_CHANNEL}> in a moment.`,
    });

    // Run B0 in background then register so IC can click "Classify Incident"
    handle_b0(env, env.SLACK_INCIDENTS_CHANNEL, description)
      .then((result) => register_incident(result))
      .catch((err) => console.error("[b0] background error:", err));
  });

  // ── Monitoring alert webhook (Grafana, UptimeRobot, etc.) ───────────────
  app.post<{ Body: { title?: string; message?: string } }>(
    "/webhook/alert",
    async (req, reply) => {
      const description = req.body?.title ?? req.body?.message ?? "Automated monitoring alert";
      const result = await handle_b0(env, env.SLACK_INCIDENTS_CHANNEL, description);
      register_incident(result);
      return reply.send({ ok: true, incident_id: result.incident_id });
    }
  );

  // ── Slack Events API — two roles:
  //    1. Top-level message in monitor channel → auto-trigger B0
  //    2. Thread reply in incidents channel → IC classification (B1)
  app.post("/slack/events", async (req, reply) => {
    const payload = req.body as Record<string, unknown>;

    // Slack URL verification handshake (one-time setup)
    if (payload.type === "url_verification") {
      return reply.send({ challenge: payload.challenge });
    }

    // Ack immediately — Slack requires response within 3s
    reply.send({ ok: true });

    const event = payload.event as Record<string, unknown> | undefined;
    if (!event) return;

    // Ignore bot messages
    if (event.bot_id || event.subtype === "bot_message") return;
    if (event.type !== "message") return;

    const channel = event.channel as string | undefined;
    const text = (event.text as string) ?? "";
    const thread_ts = event.thread_ts as string | undefined;
    const ts = event.ts as string | undefined;
    const isThreadReply = !!thread_ts && thread_ts !== ts;

    // ── Role 1: Monitor channel → auto-trigger B0 ──────────────────────────
    if (env.SLACK_MONITOR_CHANNEL && channel === env.SLACK_MONITOR_CHANNEL && !isThreadReply) {
      const description = parse_monitor_alert(text);
      if (description) {
        // Use error description as cooldown key — same error within 5min = skip
        if (should_trigger_incident(description)) {
          console.log(`[monitor] auto-trigger B0: ${description}`);
          handle_b0(env, env.SLACK_INCIDENTS_CHANNEL, description)
            .then((result) => register_incident(result))
            .catch((err) => console.error("[monitor] B0 error:", err));
        } else {
          console.log(`[monitor] cooldown active, skipping: ${description}`);
        }
      }
      return;
    }

    // ── Role 2: Thread reply in incidents channel ───────────────────────────
    if (!isThreadReply) return;

    const user_slack_id = (event.user as string) ?? "unknown";

    // Check if there's an active incident awaiting B5 confirmation from IC
    const activeInc = get_active_by_thread(thread_ts!);
    if (activeInc && activeInc.awaiting_b5) {
      activeInc.awaiting_b5 = false;

      // Build final action items markdown:
      // If IC replied "confirmed" → use AI proposals as-is
      // Otherwise parse "1: @kien, 1 week / 2: confirmed / 3: @devops, 3 days"
      const proposals = activeInc.b5_proposals ?? [];
      let finalItems: string;

      if (/^confirmed$/i.test(text.trim()) || proposals.length === 0) {
        finalItems = proposals.length > 0
          ? proposals.map((a, i) => `${i + 1}. **${a.action}**\n   - Owner: ${a.suggested_owner}\n   - ETA: ${a.suggested_eta}`).join("\n")
          : text;
      } else {
        // Parse overrides like "1: @kien, 2 weeks / 2: confirmed / 3: @devops, 3 days"
        const overrides = new Map<number, string>();
        for (const part of text.split(/\s*\/\s*/)) {
          const m = part.match(/^(\d+)\s*:\s*(.+)$/);
          if (m) overrides.set(parseInt(m[1]), m[2].trim());
        }
        finalItems = proposals
          .map((a, i) => {
            const override = overrides.get(i + 1);
            if (!override || /^confirmed$/i.test(override)) {
              return `${i + 1}. **${a.action}**\n   - Owner: ${a.suggested_owner}\n   - ETA: ${a.suggested_eta}`;
            }
            return `${i + 1}. **${a.action}**\n   - ${override}`;
          })
          .join("\n");
      }

      // Update GitHub report file with final action items
      if (activeInc.report_file_path && env.GITHUB_TOKEN) {
        update_action_items(activeInc.report_file_path, finalItems, {
          GITHUB_TOKEN: env.GITHUB_TOKEN,
          GITHUB_REPO_OWNER: env.GITHUB_REPO_OWNER,
          GITHUB_REPO_NAME: env.GITHUB_REPO_NAME,
        })
          .then((url) =>
            slack_reply_to_thread(
              env.SLACK_INCIDENTS_CHANNEL,
              thread_ts!,
              `✅ *Incident ${activeInc.incident_id} fully closed.*\nPost-mortem updated with action items: ${url}`,
              env.SLACK_BOT_TOKEN
            )
          )
          .catch((err) => {
            console.error("[b5] update failed:", err.message);
            slack_reply_to_thread(
              env.SLACK_INCIDENTS_CHANNEL,
              thread_ts!,
              `✅ *Incident ${activeInc.incident_id} closed.* (Report update failed: ${err.message})`,
              env.SLACK_BOT_TOKEN
            ).catch(console.error);
          });
      } else {
        await slack_reply_to_thread(
          env.SLACK_INCIDENTS_CHANNEL,
          thread_ts!,
          `✅ *Incident ${activeInc.incident_id} fully closed.*`,
          env.SLACK_BOT_TOKEN
        ).catch(console.error);
      }

      resolve_active_incident(activeInc.incident_id);
      return;
    }

    if (activeInc) {
      console.log(`[events] thread reply ignored for incident ${activeInc.incident_id}`);
    }
  });

  // ── Slack interactive actions (Block Kit button clicks) ──────────────────
  app.post("/slack/actions", async (req, reply) => {
    // Slack sends payload as URL-encoded JSON in the "payload" field
    const body = req.body as Record<string, string>;
    const raw = body.payload;
    if (!raw) return reply.send({ ok: false, error: "no payload" });

    let payload: SlackActionPayload;
    try {
      payload = JSON.parse(raw) as SlackActionPayload;
    } catch {
      return reply.send({ ok: false, error: "invalid payload" });
    }

    // Ack immediately — Slack requires response within 3s
    // For view_submission: empty body {} closes the modal
    reply.send({});

    if (payload.type === "block_actions") {
      handle_slack_action(env, payload as SlackActionPayload).catch((err) =>
        console.error("[actions] error:", err)
      );
    } else if (payload.type === "view_submission") {
      handle_view_submission(env, payload as unknown as ViewSubmissionPayload).catch((err) =>
        console.error("[view] error:", err)
      );
    }
  });

  // ── TwiML endpoint — Twilio fetches this when making a phone call ───────
  app.get<{ Querystring: { msg?: string } }>("/twiml", (req, reply) => {
    const raw = req.query.msg ?? "Incident alert. Please check Slack immediately.";
    const safe = raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Response>`,
      `  <Say voice="alice">${safe}</Say>`,
      `  <Pause length="1"/>`,
      `  <Say voice="alice">${safe}</Say>`,
      `</Response>`,
    ].join("\n");
    return reply.type("text/xml").send(xml);
  });

  // ── Slack Call join redirect ─────────────────────────────────────────────
  app.get("/call-join", (_req, reply) => {
    return reply.redirect(
      302,
      `https://slack.com/app_redirect?channel=${env.SLACK_INCIDENTS_CHANNEL}`
    );
  });

  // ── Health check ─────────────────────────────────────────────────────────
  app.get("/health", (_req, reply) => reply.send({ ok: true }));

  await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
