# Incident Response Solution — High-level Flow Design

**Author**: Kiên
**Date**: 2026-04-06
**Status**: Draft — pending team review
**Scope**: Multi-team (Engineering, HR, Marketing) — generic framework

---

## 1. Mục tiêu

| Mục tiêu | Mô tả |
|---|---|
| **Chuẩn hóa quy trình** | Một framework duy nhất cho mọi phòng ban — Engineering, HR, Marketing, và bất kỳ team nào trong tương lai |
| **Hữu hình & tự động hóa** | Kết quả phải nhìn thấy được: Slack notification, status update, audit log — không chỉ nằm trên tài liệu |
| **AI xử lý intermediate steps** | Human chỉ trigger ban đầu và ra quyết định tại các gate quan trọng — AI làm phần còn lại |
| **Tối ưu chi phí AI** | Light model cho simple tasks, heavy model cho analysis/decision |
| **SLA đo được** | Mỗi phase có SLA rõ ràng, breach được escalate tự động |

---

## 2. Requirements

**When shit happens, we need a response workflow to reduce cost and manageable SLA to provide a fast problem resolution E2E processing time.**

### Acceptance Criteria

- Visualize the process of Incident Handling: OPs Team → Event → Trigger → Communicate → Analyze → Decision → Short term/Long term
- AI system capable of automatically performing intermediate steps
- High accuracy and acceptable SLA

### Expected Outcome

```
High-level Flow: Any Team (Ops/HR/MKT/...) → Response Gateway → AI/Automation Implementation
```
> "Ops Team" = bất kỳ team nào đang "vận hành" công việc của họ.
> Engineering vận hành hệ thống. HR vận hành nhân sự. Marketing vận hành campaigns.

---

## 3. High-level Flow (Tổng quan)

> **Nguyên tắc cốt lõi**: AI tự động xử lý tất cả intermediate steps.
> Trigger có thể đến từ **bất kỳ nguồn nào** — Human, System monitoring, CI/CD, webhook — không phải chỉ từ người.
> Human chỉ **bắt buộc xuất hiện tại 1 điểm**: **Decision** (quyết định hướng xử lý).
> Mọi thứ ở giữa — Communicate, Analyze — là AI làm tự động.

```
  WHO / SOURCE        WHAT                          AI DOES / OUTPUT
  ────────────────    ──────────────────────────    ────────────────────────────────

  Any Team ──────┐
  (Human)        │    ┌────────────────────────┐
                 ├───▶│        TRIGGER          │
  System ────────┘    │                        │
  (tự động)           │  Engineering:          │    output:
                      │  • User thấy app chậm  │    event object
                      │  • Engineer phát hiện  │    {source, type,
                      │  • Error spike alert   │     priority_hint,
                      │  • Health check fail   │     payload,
                      │  • CI/CD fail          │     reporter}
                      │                        │
                      │  HR:                   │
                      │  • Nhân viên nghỉ việc │
                      │  • Onboard mới         │
                      │                        │
                      │  Marketing:            │
                      │  • Campaign fail       │
                      │  • Content stuck       │
                      │                        │
                      │  → bất kỳ nguồn nào   │
                      └──────────┬─────────────┘
                                 │
                                 ▼
                      ┌────────────────────────┐
                      │    RESPONSE GATEWAY    │    AI: classify type
                      │                        │    AI: determine priority
                      │  Nhận event            │        (2D matrix)
                      │  → classify            │    AI: load workflow
                      │  → route đúng workflow │    AI: start SLA timer
                      │  → track SLA           │    AI: assign responder
                      └──────────┬─────────────┘
                                 │
                                 ▼
  ╔════════════════════════════════════════════════════════╗
  ║           AI / AUTOMATION IMPLEMENTATION               ║
  ║                                                        ║
  ║  ┌──────────────────────────────────────────────────┐  ║
  ║  │ COMMUNICATE                                      │  ║
  ║  │                                                  │  ║  • Slack thread posted
  ║  │ AI: post Slack incident thread                   │  ║  • Right people notified
  ║  │ AI: tag + call right people (P0/P1 → phone)      │  ║  • Status Page:
  ║  │ AI: update Status Page → INVESTIGATING           │  ║    INVESTIGATING
  ║  │ AI: create war room (nếu P0/P1)                  │  ║  • War room ready
  ║  └──────────────────────┬───────────────────────────┘  ║
  ║                         │                              ║
  ║                         ▼                              ║
  ║  ┌──────────────────────────────────────────────────┐  ║
  ║  │ ANALYZE                                          │  ║
  ║  │                                                  │  ║  • Incident type identified
  ║  │ AI: classify type (AVAIL/PERF/DATA/SECURITY)     │  ║  • Business impact assessed
  ║  │ AI: assess business impact                       │  ║  • Root cause hypothesis
  ║  │ AI: correlate logs + recent deploys              │  ║  • 2-3 options prepared
  ║  │ AI: prepare 2-3 options với trade-offs           │  ║  • Recommendation ready
  ║  │ AI: recommend best option                        │  ║
  ║  └──────────────────────┬───────────────────────────┘  ║
  ║                         │                              ║
  ║                         ▼                              ║
  ║  ┌──────────────────────────────────────────────────┐  ║
  ║  │ DECISION                          ← Human vào   │  ║
  ║  │                                                  │  ║  Human chọn:
  ║  │ AI presents: options + risks + recommendation    │  ║  • Rollback
  ║  │ Human decides (< 5 phút)                         │  ║  • Hotfix
  ║  │                                                  │  ║  • Feature flag off
  ║  └──────────────────────┬───────────────────────────┘  ║  • Defer
  ║                         │                              ║
  ║           ┌─────────────┴─────────────┐               ║
  ║           ▼                           ▼               ║
  ║  ┌─────────────────┐       ┌─────────────────────┐    ║
  ║  │   SHORT TERM    │       │      LONG TERM       │    ║
  ║  │                 │       │                      │    ║
  ║  │ AI execute:     │       │ AI propose:          │    ║
  ║  │ • Rollback      │       │ • Post-mortem draft  │    ║
  ║  │ • Hotfix deploy │       │ • Prevention plan    │    ║
  ║  │ • Flag off      │       │ • Template update    │    ║
  ║  │ • Status:       │       │                      │    ║
  ║  │   RESOLVED      │       │ Human own:           │    ║
  ║  └─────────────────┘       │ • Assign owner + ETA │    ║
  ║                            │ • Track to closure   │    ║
  ║                            └─────────────────────┘    ║
  ╚════════════════════════════════════════════════════════╝
```

### AI làm gì ở từng bước

| Bước | Actor | AI tự động | Human làm |
|---|---|---|---|
| **Trigger** | Human hoặc System | Nhận + normalize event | Phát hiện / báo cáo *(nếu human)* |
| **Response Gateway** | AI | Classify, route, start SLA timer | Không cần làm gì |
| **Communicate** | AI | Post Slack, gọi điện, update Status Page | Không cần làm gì |
| **Analyze** | AI | Correlate logs, assess impact, prepare options | Không cần làm gì |
| **Decision** | Human | Present options + recommendation | **Ra quyết định cuối** |
| **Short term** | AI | Execute action được approve | Confirm khi cần |
| **Long term** | AI + Human | Draft post-mortem, propose prevention | **Own action items** |

---

## 4. Layer 1 — Event Sources

**Mô tả**: Nơi events được sinh ra. Bất kỳ team nào, bất kỳ nguồn nào. Tất cả đều normalize về cùng 1 format trước khi gửi vào Gateway.

### Các loại event theo team

| Team | Event | Trigger mechanism |
|---|---|---|
| **Engineering** | API lỗi, deploy fail, error spike, health check fail | Monitoring webhook, CI/CD pipeline, Slack command, engineer tự phát hiện |
| **HR** | Nhân viên nghỉ việc (offboard) | Form submit, HR system webhook |
| **HR** | Onboard nhân viên mới | Form submit, HR system webhook |
| **Marketing** | Campaign underperform | Platform webhook, manual report |
| **Marketing** | Content approval stuck | Slack command, manual trigger |

### Standard Event Format

Mọi source đều normalize về format này trước khi gửi vào Gateway:

```json
{
  "event_id": "uuid",
  "source": "engineering | hr | marketing | ...",
  "type": "api_down | employee_offboard | employee_onboard | campaign_fail | approval_stuck | ...",
  "priority_hint": "P0 | P1 | P2 | P3 | null",
  "payload": { "...context data specific to event type..." },
  "reporter": {
    "name": "Nguyen Van A",
    "team": "engineering",
    "contact": "slack_user_id | phone"
  },
  "timestamp": "ISO8601"
}
```

**Nguyên tắc**: Event Sources không cần biết workflow xử lý là gì — chỉ cần fire event đúng format về Gateway.

---

## 5. Layer 2 — Response Gateway

**Mô tả**: Trung tâm orchestration của toàn hệ thống. Nhận event → classify → route đúng workflow template. **Không execute action** — chỉ orchestrate và track.

### 3 nhiệm vụ chính

**1. Classify**
```
Event vào → AI phân tích:
  ├── Event type là gì?
  ├── Team nào chịu trách nhiệm?
  ├── Priority thực sự là bao nhiêu?
  │   (Engineering: dùng 2D matrix Technical Severity × Business Impact)
  │   (HR/Marketing: dùng urgency × business impact)
  └── Có workflow template phù hợp không?
```

**2. Route**
```
Có template phù hợp?
  YES → load template → pass sang AI Automation Layer
  NO  → Human-in-the-loop gate → human define workflow → save as new template
```

**3. Track SLA & Escalate**
```
Mỗi phase có SLA timer:
  Timer breach → tự động escalate lên tier cao hơn
  AI thông báo Slack khi SLA sắp breach (warning tại 80%)
```

### Routing Map

```
event.source + event.type
  ├── "engineering" + "api_down|deploy_fail|error_spike"  → Engineering Incident Template (B0–B5)
  ├── "hr" + "employee_offboard"                          → HR Offboard Template
  ├── "hr" + "employee_onboard"                           → HR Onboard Template
  ├── "marketing" + "campaign_fail"                       → Marketing Campaign Template
  ├── "marketing" + "approval_stuck"                      → Marketing Approval Template
  └── (anything else)                                     → Human Gate → define new template
```

### Workflow Template Structure

```json
{
  "template_id": "hr_offboard_v1",
  "trigger": { "source": "hr", "type": "employee_offboard" },
  "priority": "P2",
  "sla": {
    "aware": "15m",
    "resolve": "4h"
  },
  "steps": [
    { "id": "step_1", "actor": "AI", "action": "notify_manager", "timeout": "5m" },
    { "id": "step_2", "actor": "AI", "action": "revoke_accounts", "timeout": "30m", "requires_approval": true },
    { "id": "step_3", "actor": "AI", "action": "create_handover_checklist", "timeout": "15m" },
    { "id": "step_4", "actor": "Human", "action": "confirm_handover_complete", "timeout": "24h" }
  ],
  "escalation_path": ["team_lead", "hr_manager", "cto"],
  "human_gate_conditions": ["revoke_accounts", "data_deletion"]
}
```

---

## 6. Layer 3 — AI Automation Layer

**Mô tả**: Nơi thực thi mọi intermediate steps. Nhận workflow từ Gateway → decompose → execute từng step. Chạy trong **Sandbox (Docker container)** để đảm bảo isolation và security.

### Model Tiers

| Tier | Model | Dùng cho | Ví dụ |
|---|---|---|---|
| **Rule-based** | No AI | Fully predictable, deterministic | Revoke API key, disable endpoint, trigger webhook |
| **Light model** | Small/fast LLM | Simple, structured tasks | Gửi Slack message, fill template, update status page |
| **Heavy model** | Large/capable LLM | Analysis, judgment, writing | Classify priority, write post-mortem, propose prevention plan |

**Nguyên tắc**: Dùng model nhẹ nhất đủ để hoàn thành job → tiết kiệm cost, giữ latency thấp.

### Sandbox Execution

```
┌─────────────────────────────────────┐
│         Docker Container            │
│  • Isolated filesystem              │
│  • Không có access vào prod DB      │
│  • Chỉ whitelisted APIs             │
│  • Timeout per action               │
│  • Full audit log mọi action        │
└─────────────────────────────────────┘
```

### Action Types

| Category | Actions |
|---|---|
| **Communication** | Post Slack message, send email, phone call (Twilio), update Status Page |
| **Analysis** | Classify priority, summarize logs, write report, propose prevention actions |
| **Integration** | Call external APIs, create calendar event, create GitHub issue, update HR system |
| **System** | Disable endpoint, toggle feature flag, trigger rollback *(requires Human approval)* |

### Sub-tasks per Team

**Engineering — Incident (B0–B5):**
```
B0: Detect → create Slack thread → identify First Responder
B1: Classify type + priority (2D matrix) → notify right people → update Status Page
B2: Rollback (nếu safe) hoặc Stabilize + Hotfix → record recovery_time
B3: Root cause analysis → fix confirmed → owner + ETA
B4: AI write post-mortem → IC review → publish → Status Page RESOLVED
B5: AI propose prevention actions → assign owner + ETA
```

**HR — Offboard:**
```
1. Notify manager + team (Light model)
2. Revoke email, Slack, tool access (Rule-based — requires Human approval)
3. Create handover checklist (Light model)
4. Update HR system (Rule-based)
5. Archive accounts after X days (Rule-based — scheduled)
6. Confirm completion report (Light model)
```

**HR — Onboard:**
```
1. Create accounts: email, Slack, tools (Rule-based)
2. Send welcome email + first-week schedule (Light model)
3. Assign buddy (Rule-based)
4. Setup permissions theo role (Rule-based)
5. Send D1/D7/D30 reminder to manager (Light model — scheduled)
6. Confirm onboarding complete (Light model)
```

**Marketing — Campaign Underperform:**
```
1. Notify marketing team (Light model)
2. Pull performance data từ platform (Rule-based)
3. AI generate performance report + highlight issues (Heavy model)
4. Suggest adjustments: budget, targeting, creative (Heavy model)
5. Escalate budget decision → Human Gate (nếu change > threshold)
6. Log decision + outcome (Light model)
```

**Marketing — Content Approval Stuck:**
```
1. Ping reviewer lần 1 (Light model)
2. Timeout 2h → ping lần 2 + notify team lead (Light model)
3. Timeout tiếp → escalate lên manager (Light model)
4. Log delay + impact vào system (Rule-based)
5. Confirm resolved (Light model)
```

### Execution Flow

```
Nhận workflow từ Gateway
        │
        ▼
Decompose → ordered sub-task list
        │
        ▼
Với mỗi sub-task:
  ├── Rule-based?   → Execute trực tiếp
  ├── Light model?  → Execute → report result
  ├── Heavy model?  → Execute → report result
  └── High-risk?    → → Human Decision Gate (block until approved)
        │
        ▼
Aggregate results → report về Gateway
```

---

## 7. Layer 4 — Human Decision Gate

**Mô tả**: Ranh giới rõ ràng giữa AI và human. Gate này không làm chậm flow — chạy **async**, AI tiếp tục các steps khác trong khi chờ. Chỉ block khi step tiếp theo depend vào decision đó.

### Khi nào Gate được kích hoạt

| Condition | Ví dụ | Nếu timeout |
|---|---|---|
| **High-risk action** | Delete data, revoke access hàng loạt, rollback production | Block — không execute |
| **AI confidence thấp** | Event ambiguous, không rõ priority | Escalate để human classify |
| **Out-of-scope event** | Không có template phù hợp | Human define workflow mới → save template |
| **P0 bất kể template** | Toàn bộ hệ thống down | Notify all hands ngay, AI vẫn chạy song song |
| **SLA breach sắp xảy ra** | Còn 5 phút trước khi breach | Auto-escalate lên tier cao hơn |

### Escalation Path

```
AI không chắc / high-risk action
        │
        ▼
   First Responder / On-call (người phát hiện)
        │ timeout: 5 min
        ▼
   Team Lead / Tech Lead
        │ timeout: 10 min
        ▼
   IC (Incident Commander) / Manager
        │ timeout: 15 min
        ▼
   All hands (P0 only)
```

### Human Interaction Channels

| Channel | Dùng khi | Ví dụ |
|---|---|---|
| **Slack button/modal** | Giờ làm việc, non-critical | "Approve rollback?" button trong incident thread |
| **Phone call (Twilio)** | Ngoài giờ làm việc, P0/P1 | Auto-call on-call engineer |
| **Email** | Async, low urgency | Prevention plan review, onboarding confirmation |

### Audit Trail

Mọi decision đều được log — không exception:

```json
{
  "decision_id": "uuid",
  "event_id": "ref to parent event",
  "action": "rollback_production | revoke_accounts | ...",
  "requested_by": "AI Layer",
  "decided_by": "Nguyen Van A",
  "decision": "approved | rejected | timeout",
  "timestamp": "ISO8601",
  "reason": "optional free text"
}
```

---

## 8. Layer 5 — Outcomes

**Mô tả**: Kết quả cuối cùng sau khi workflow hoàn tất. Chia 2 loại: **Short-term** (xử lý ngay trong event) và **Long-term** (cải thiện process để không tái diễn).

### Short-term Outcomes

| Team / Event | "Done" trông như thế nào |
|---|---|
| **Engineering — Incident** | Service ổn định ≥ 15 phút · Error rate về baseline · Status Page = RESOLVED · Slack "All Clear" posted · PO/PM confirmed |
| **HR — Offboard** | Tất cả accounts bị revoke trong 4h · Manager nhận handover checklist · HR system updated · Exit confirmation logged |
| **HR — Onboard** | Tất cả accounts active trước D1 · Welcome email sent · Buddy assigned · Manager nhận D1/D7/D30 reminder schedule |
| **Marketing — Campaign** | Team notified · Report generated · Budget decision made (human) hoặc escalated với deadline rõ ràng |
| **Marketing — Approval** | Reviewer responded hoặc manager escalated · Delay logged · Content unblocked hoặc deprioritized |

### Long-term Outcomes

| Output | Actor | Deadline |
|---|---|---|
| **Post-mortem / Process Report** | AI draft → Human review | P0/P1 Engineering: bắt buộc trong 2 tuần. Các team khác: optional nhưng recommended |
| **Prevention Plan** | AI propose → Human approve | Assign owner + ETA cụ thể |
| **Template improvement** | AI suggest dựa trên gaps | Next sprint sau incident |
| **New template** | Human define (từ out-of-scope cases) | Khi có use case mới phát sinh |

### End State — Process kết thúc khi

```
✅ Short-term actions đã thực thi và confirmed
✅ Human decision gate cleared (nếu required)
✅ Audit trail đầy đủ — mọi action đều có log
✅ Long-term items có owner + ETA và đang được tracked
✅ Template được update nếu phát hiện gaps
```

---

## 9. SLA Summary

| Team / Event | Aware | Resolve | Report |
|---|---|---|---|
| Engineering P0 | < 5 min | < 1h | < 2 tuần |
| Engineering P1 | < 5 min | < 1h | < 2 tuần |
| Engineering P2/P3 | < 15 min | < 4h | Optional |
| HR Offboard | < 15 min | < 4h | Optional |
| HR Onboard | < 1h (trước D1) | Before D1 | Optional |
| Marketing Campaign | < 30 min | < 24h | Optional |
| Marketing Approval | < 2h | < 8h | Optional |

---

## 10. Open Questions (cần align với team)

- [ ] **HR system**: Hệ thống HR hiện tại là gì? Có API không hay manual?
- [ ] **Marketing platform**: Campaign data lấy từ đâu? Google Ads, Facebook Ads, hay internal tool?
- [ ] **On-call schedule**: Ai on-call cho từng team? Có rotation không?
- [ ] **Approval threshold**: Marketing budget change bao nhiêu thì cần Human approval?
- [ ] **Template ownership**: Ai được phép define/edit workflow templates cho từng team?
- [ ] **Data retention**: Audit logs giữ bao lâu?
