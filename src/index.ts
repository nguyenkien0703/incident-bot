import Fastify from "fastify";
import type { Pool } from "pg";
import { db } from "./db/client";
import { seed_contacts } from "./db/seed";
import { handle_b0 } from "./handlers/b0_trigger";

export interface Env {
  // Slack
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  SLACK_INCIDENTS_CHANNEL: string;

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
    "SLACK_SIGNING_SECRET",
    "SLACK_INCIDENTS_CHANNEL",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_NUMBER",
    "SERVER_URL",
    "STATUSPAGE_API_KEY",
    "STATUSPAGE_PAGE_ID",
    "STATUSPAGE_COMPONENT_ID",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "GITHUB_TOKEN",
    "GITHUB_REPO_OWNER",
    "GITHUB_REPO_NAME",
    "ANTHROPIC_API_KEY",
  ];

  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }

  return {
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN!,
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET!,
    SLACK_INCIDENTS_CHANNEL: process.env.SLACK_INCIDENTS_CHANNEL!,
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

async function start() {
  const env = buildEnv();

  // Seed team contacts from team_contacts.json
  await seed_contacts(db);

  const app = Fastify({ logger: true });

  // ── Slack slash command: /incident start <description> ──────────────────
  app.post("/slack/slash", async (req, reply) => {
    const params = new URLSearchParams(req.body as string);
    const text = params.get("text") ?? "";

    if (text.startsWith("start")) {
      const description =
        text.replace(/^start\s*/i, "").trim() || "Incident reported via slash command";
      const result = await handle_b0(env, env.SLACK_INCIDENTS_CHANNEL, description);
      return reply.send({
        response_type: "in_channel",
        text: `🚨 Incident \`${result.incident_id}\` opened. Check <#${env.SLACK_INCIDENTS_CHANNEL}> for updates.`,
      });
    }

    return reply.send({
      response_type: "ephemeral",
      text: "Usage: `/incident start <description>`",
    });
  });

  // ── Monitoring alert webhook (Grafana, UptimeRobot, etc.) ───────────────
  app.post<{ Body: { title?: string; message?: string } }>(
    "/webhook/alert",
    async (req, reply) => {
      const description = req.body?.title ?? req.body?.message ?? "Automated monitoring alert";
      const result = await handle_b0(env, env.SLACK_INCIDENTS_CHANNEL, description);
      return reply.send({ ok: true, incident_id: result.incident_id });
    }
  );

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
