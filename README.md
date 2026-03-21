# Incident Response Bot — lumilink-be

AI-powered Incident Communicator for lumilink-be (Cloudflare Workers backend).

## Role

This bot handles **all communication & documentation** during incidents so the engineering team can focus on fixing the problem:
- Slack notifications & thread management
- Phone escalations (Twilio)
- Status page updates (Statuspage.io)
- Meeting creation (Google Calendar / Zoom)
- Incident report writing (GitHub file write)

The bot does **NOT** diagnose issues, write code, or make technical decisions.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers |
| State | Cloudflare Durable Objects (incident state) + KV (team contacts) |
| Trigger | Slack slash command `/incident start`, monitoring webhook, DM |
| Slack | Slack Bolt / Web API |
| Phone | Twilio Voice API |
| Status Page | Statuspage.io API |
| Calendar | Google Calendar API |
| File write | GitHub REST API |

---

## Project Structure

```
src/
  handlers/         # Step handlers: B0 trigger, B1 classify, B2 handle, B3 root-cause, B4 report, B5 prevention
  tools/            # Tool implementations (Slack, Twilio, Statuspage, Calendar, GitHub)
  state/            # Durable Object for incident state
  utils/            # Priority logic, team contact lookup, time helpers
docs/               # Architecture docs, escalation policy, runbooks
tests/              # Unit + integration tests
```

---

## Incident Flow

```
B0 TRIGGER  →  B1 CLASSIFY  →  B2 HANDLE  →  B3 ROOT CAUSE  →  B4 REPORT  →  B5 PREVENTION
(detected)     (priority)      (rollback or    (fix confirmed)   (post-mortem)   (action items)
                                hotfix)
```

### Priority Matrix

| Level | Condition |
|-------|-----------|
| P3 | Minor degradation, no user impact |
| P2 | Core feature affected, workaround exists |
| P1 | Partial down, core feature broken, 5xx > 5% |
| P0 | Full down, data loss, security breach |

Business overrides always escalate: data loss → P0, payment fail → P0, login broken → P1.

---

## Environment Variables

```env
# Slack
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_INCIDENTS_CHANNEL=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# Statuspage.io
STATUSPAGE_API_KEY=
STATUSPAGE_PAGE_ID=
STATUSPAGE_COMPONENT_ID=

# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# GitHub (for incident report file write)
GITHUB_TOKEN=
GITHUB_REPO_OWNER=
GITHUB_REPO_NAME=

# Claude (AI brain)
ANTHROPIC_API_KEY=
```

---

## Getting Started

```bash
npm install
cp .env.example .env   # fill in your keys
npx wrangler dev       # local dev
npx wrangler deploy    # deploy to Cloudflare Workers
```
