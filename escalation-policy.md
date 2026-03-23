# Escalation Policy

**Owner**: IT Team
**Last Updated**: 2026-03-02


---

## 1. Incident Types

| Type | Mô tả | Ví dụ |
|------|-------|-------|
| **AVAILABILITY** | Service/API không respond | App down, 503, Worker crash |
| **PERFORMANCE** | Hệ thống chậm hoặc error rate cao | p99 > 5s, error rate tăng đột biến |
| **DATA** | Mất / sai / corrupt data | Migration fail, data loss (xem ADR-002, ADR-004) |
| **INTEGRATION** | 3rd party fail | Jira / Confluence / AI provider down |
| **SECURITY** | Truy cập trái phép, data leak | Unauthorized access, exposed secrets |

---

## 2. Incident Levels (P0–P3)

| Level | Tên | SLA | Điều kiện trigger |
|-------|-----|-----|-------------------|
| **P3** | Minor | 1h | Error rate nhẹ tăng, integration fail không critical, performance giảm nhẹ |
| **P2** | High | 30 min | Core feature broken, 5xx > 5%, p99 > 5s sustained, integration critical fail |
| **P1** | Critical | 15 min | Service partial down, data inconsistency, nhiều features bị ảnh hưởng |
| **P0** | Emergency | Ngay lập tức | Service hoàn toàn down, data loss / corruption, security breach |

> ⚠️ **Priority cuối cùng = MAX(Technical Severity, Business Override).** Xem Section 2B để biết cách tính Business Override.

---

## 2B. Business Impact Classification (2D Matrix)

**Bảng này trả lời câu hỏi: "Issue này thực sự cần xử lý gấp cỡ nào?"**

Có 2 yếu tố:
- **Hàng** = kỹ thuật hỏng nặng cỡ nào
- **Cột** = cái đó hỏng thì ảnh hưởng business thế nào

**Priority cuối cùng = lấy cái nào cao hơn trong 2 yếu tố đó** (Business Override Rule).

> Lý do cần bảng này: kỹ sư hay classify theo "cái này nhỏ, để sau". Nhưng "nhỏ" về kỹ thuật không có nghĩa là nhỏ về business. Một cái form đăng ký bị lỗi 500 trông rất nhỏ, nhưng nó đang chặn toàn bộ user mới không vào được — đó là P1, không phải P3.

### Business Impact Dimensions — 4 loại "hỏng cái này thì ảnh hưởng gì?"

**Revenue Impact** — *Tiền đang bị mất*

Lỗi này đang trực tiếp cản trở việc thu tiền: payment fail, checkout không hoàn tất được, hoá đơn không gửi được. Mỗi phút để lâu = thêm giao dịch bị mất.

Ví dụ: Bấm "Thanh toán" → báo lỗi; payment gateway trả về 500; subscription không gia hạn được.

---

**User Acquisition Impact** — *Người mới muốn vào dùng nhưng không vào được*

"Acquisition" = quá trình có được user mới. Impact ở đây là luồng đó bị gián đoạn: người ta nghe về sản phẩm, muốn thử, nhưng đăng ký / đăng nhập lần đầu bị lỗi → bỏ đi và thường không quay lại.

Ví dụ: Form đăng ký lỗi 500; OTP không gửi được; đăng nhập lần đầu bị redirect sai; invite link broken.

---

**Data Integrity Impact** — *Dữ liệu bị sai hoặc bị mất*

"Integrity" ở đây không phải liêm chính — mà là "còn nguyên vẹn, không bị hỏng". Impact là dữ liệu của user đang bị ghi sai, bị thiếu, hoặc bị mất. Nguy hiểm vì càng để lâu càng nhiều record bị hỏng theo, và nhiều khi không khôi phục được.

Ví dụ: Tin nhắn gửi đi nhưng không lưu được; migration chạy sai làm số liệu bị ghi nhầm; sync job fail khiến hai nơi hiển thị dữ liệu khác nhau.

---

**Reputation Impact** — *Mất uy tín với người quan trọng*

"Reputation" = danh tiếng. Impact là khách hàng lớn (trả nhiều tiền, có hợp đồng) đang nhìn thấy hệ thống chạy kém — hoặc sự cố bị lan ra công khai. Thiệt hại không đo được ngay, nhưng hậu quả có thể kéo dài rất lâu (mất hợp đồng, mất tin tưởng).

Ví dụ: Enterprise customer bị ảnh hưởng trong giờ họ đang dùng; outage kéo dài > 30 phút mà không có thông báo gì; demo với đối tác mà hệ thống bị lỗi ngay lúc đó.

---

### Priority Matrix

| Kỹ thuật hỏng thế nào? | Không ảnh hưởng business | Revenue Impact | User Acquisition Impact | Data Integrity Impact | Reputation Impact |
|---|---|---|---|---|---|
| **Minor (P3)** — lỗi nhỏ, hệ thống vẫn chạy | P3 | **P1** | **P1** | **P0** | **P2** |
| **Degraded (P2)** — chạy được nhưng chậm / hay lỗi | P2 | **P0** | **P1** | **P0** | **P1** |
| **Critical (P1)** — tính năng quan trọng hỏng hoàn toàn | P1 | **P0** | **P0** | **P0** | **P0** |
| **Down (P0)** — toàn bộ hệ thống sập | P0 | P0 | P0 | P0 | P0 |

Ô in đậm = Business Override — priority thực tế cao hơn technical severity.

### Đọc từng hàng

**Hàng Minor (P3 kỹ thuật)** — "Lỗi nhỏ, không chết ai về kỹ thuật" (ví dụ: một icon không load, tooltip sai chữ)

| Ảnh hưởng gì | Priority | Vì sao |
|---|---|---|
| Không ảnh hưởng gì | P3 | Đúng rồi, nhỏ thì để sau |
| Revenue Impact | **P1** | Dù lỗi nhỏ nhưng checkout fail → mất tiền ngay |
| User Acquisition Impact | **P1** | Dù lỗi nhỏ nhưng register không được → không có user mới |
| Data Integrity Impact | **P0** | Dù lỗi nhỏ nhưng data đang bị mất → khẩn cấp nhất |
| Reputation Impact | **P2** | Khách lớn thấy → cần fix sớm hơn bình thường |

**Hàng Degraded (P2 kỹ thuật)** — "Chạy được nhưng chậm hoặc hay lỗi" (ví dụ: API response 10s thay vì 1s, error rate 20%)

| Ảnh hưởng gì | Priority | Vì sao |
|---|---|---|
| Không ảnh hưởng gì | P2 | Đúng rồi, degraded thì P2 |
| Revenue Impact | **P0** | Thanh toán chậm / lỗi → user bỏ giỏ hàng → mất tiền liên tục |
| User Acquisition Impact | **P1** | Login chậm / lỗi → user mới nản, bỏ đi |
| Data Integrity Impact | **P0** | Đang ghi dữ liệu sai → càng để lâu càng nhiều record bị hỏng |
| Reputation Impact | **P1** | Enterprise đang thấy hệ thống chạy kém |

**Hàng Critical (P1 kỹ thuật)** — "Tính năng quan trọng hỏng hoàn toàn" → tất cả đều P0 hoặc P1, không có chỗ thấp hơn.

**Hàng Down (P0 kỹ thuật)** — "Toàn bộ hệ thống sập" → tất cả P0. Không cần bàn thêm.

### Ví dụ để nhớ

| Tình huống | Kỹ thuật | Business Impact | Priority cuối | Ghi nhớ |
|---|---|---|---|---|
| Nút "Đăng ký" lỗi 500 | Minor (P3) | User Acquisition Impact | **P1** | "Lỗi nhỏ" đang chặn toàn bộ user mới |
| Payment API 500 không liên tục | Degraded (P2) | Revenue Impact | **P0** | Checkout fail = tiền đang bị mất từng giây |
| AI response chậm p99 > 10s | Degraded (P2) | Reputation Impact | **P1** | Enterprise thấy product chạy kém |
| Background sync job fail | Minor (P3) | Data Integrity Impact | **P0** | Data đang bị mất, fix ngay kẻo lan rộng |
| Icon CDN của bên thứ 3 bị down | Minor (P3) | Không có | P3 | Chỉ xấu UI, không ảnh hưởng gì thực chất |

---

## 3. Departments Involved Matrix

| Incident Type | P3 | P2 | P1 | P0 |
|---|---|---|---|---|
| **AVAILABILITY** | DevOps | DevOps + Tech Lead | Tech Lead + PO/PM | All team |
| **PERFORMANCE** | DevOps | DevOps + Tech Lead | Tech Lead + PO/PM | All team |
| **DATA** | DevOps + Tech Lead | Tech Lead + PO/PM | Tech Lead + PO/PM + CEO | All team |
| **INTEGRATION** | DevOps | DevOps | DevOps + Tech Lead | Tech Lead + PO/PM |
| **SECURITY** | DevOps + Tech Lead | Tech Lead + PO/PM | Tech Lead + PO/PM + Legal | All team |

### Vai trò từng người khi được kéo vào incident

| Role | Làm gì trong incident | Không làm gì |
|---|---|---|
| **DevOps / Dev on-call** | Điều tra log · reproduce · implement fix · thực hiện rollback theo lệnh | Ra quyết định business |
| **Tech Lead** | Xác nhận severity · quyết định hướng kỹ thuật (hotfix vs rollback) · review fix | Gửi thông báo ra ngoài |
| **PO / PM** | Approve rollback · đánh giá business impact · quyết định có notify user không · chuẩn bị communication ra ngoài · ký xác nhận để đóng incident | Sửa code · điều tra log |
| **CEO** | Được notify khi DATA P1+ — nhận thông tin, quyết định escalate ra ngoài nếu cần | Tham gia điều tra kỹ thuật |
| **Legal** | Được notify khi SECURITY P1+ — đánh giá nghĩa vụ pháp lý (GDPR, disclosure) | Tham gia điều tra kỹ thuật |

> **Tại sao PO/PM phải có mặt từ P1/P2?**
> Kỹ sư classify incident theo kỹ thuật — nhưng "lỗi nhỏ về kỹ thuật" có thể là P0 về business (ví dụ: form đăng ký lỗi 500 trông rất nhỏ nhưng đang chặn toàn bộ user mới). PO/PM là người duy nhất có đủ context để đánh giá điều đó và ra quyết định business tương ứng.

---

## 4. Escalation Flowchart

```
[Alert triggered]
       │
       ▼
[DevOps on-call xác nhận] ─── > 5 min không phản hồi? ──→ [Check alert rules / re-alert]
       │
       ▼
[Phân loại: Type? Technical Level?]
       │
       ▼
[Business Impact Assessment ← BẮT BUỘC, < 2 phút]
   Payment/billing? → Revenue Impact
   Login/register?  → User Acquisition Impact
   Data sai/mất?    → Data Integrity Impact
   SLA breach?      → Reputation Impact
       │
       ▼
[Apply 2D Matrix → Final Priority]  ← Section 2B
       │
       ├─── P3 ──→ [P3: DevOps tự xử lý (1h SLA)]
       │                        │
       │               Resolved?│
       │            yes ──┤── no (timeout 1h)
       │             ▼    ▼
       │           [Done] │
       │                  │ Handoff → P2
       │                  ▼
       ├─── P2 ──→ [P2: Tech Lead (30 min SLA)] ◄──────────────┘
       │                        │
       │               Resolved?│
       │            yes ──┤── no (timeout 30 min)
       │             ▼    ▼
       │           [Done] │
       │                  │ Handoff → P1
       │                  ▼
       ├─── P1 ──→ [P1: Tech Lead + PO/PM (15 min SLA)] ◄──────┘
       │                        │
       │               Resolved?│
       │            yes ──┤── no (timeout 15 min)
       │             ▼    ▼
       │           [Done] │
       │                  │ Upgrade → P0
       │                  ▼
       └─── P0 ──→ [P0: All hands — no timeout] ◄─────────────┘
                           │
                           ▼
              [Execute rollback + Notify toàn team]
                           │
                           ▼
              [Resolved → Post-mortem bắt buộc]
```

---

## 5. Chi tiết xử lý từng tầng

### P3 — Minor (SLA: 1 giờ)

**Người xử lý**: DevOps / Dev on-call

**Khi nhận alert:**
1. Tạo GitHub Issue với các thông tin: symptom, error logs, số user bị ảnh hưởng ước tính
2. Kiểm tra recent deployments (`pnpm wrangler deployments list`)
3. Kiểm tra Cloudflare Worker logs (Workers Observability)
4. Thử reproduce và implement fix

**Nếu hết 1h chưa resolved → handoff lên P2:**
- Cập nhật ticket: đã thử gì, hypothesis hiện tại, cần gì tiếp theo
- Ping Tech Lead trong `#incidents` kèm link ticket và summary ngắn

---

### P2 — High (SLA: 30 phút)

**Người xử lý**: Tech Lead (tiếp nhận từ P3 hoặc classify trực tiếp P2)

**Khi nhận bàn giao:**
1. Đọc ticket summary từ P3 (hoặc investigate trực tiếp nếu classify P2 từ đầu)
2. Xác nhận lại severity — đây có thực sự là P2 không?
3. Quyết định hướng xử lý: hotfix hay rollback?
   - Nếu **hotfix**: guide DevOps implement, review + approve
   - Nếu **rollback**: thực hiện theo [rollback-procedure.md](./rollback-procedure.md)
4. Thông báo `#incidents`: "Đang xử lý [P2] — dự kiến resolve trong X phút"

**Nếu hết 30 min chưa resolved → handoff lên P1:**
- Viết brief ngắn: timeline, impact thực tế, options đã cân nhắc, cần quyết định gì
- Notify `#incidents` channel và ping PO/PM trực tiếp

---

### P1 — Critical (SLA: 15 phút)

**Người xử lý**: Tech Lead + PO/PM

**Khi nhận bàn giao từ P2:**
- **Tech Lead**: đọc brief từ P2, đưa ra quyết định kỹ thuật cuối (rollback / hotfix / accept degraded state)
- **PO/PM**: đánh giá business impact, quyết định có notify user không, chuẩn bị communication nếu cần

**Nếu hết 15 min chưa resolved → upgrade P0**

---

### P0 — Emergency (No timeout)

**Người xử lý**: All hands — không có handoff tiếp

**Quy trình:**
1. Execute rollback ngay — không chờ consensus nếu có nguy cơ data loss
2. Notify toàn team qua Slack `#incidents` + direct message CEO/stakeholders nếu cần
3. Tất cả available engineers tham gia điều tra song song
4. Cập nhật status liên tục (mỗi 10–15 phút) trong `#incidents`

**Sau khi resolved:**
- Post-mortem **bắt buộc** — deadline 2 tuần
- Dùng template: [Post-Mortem Template](../post-mortems/TEMPLATE.md)
- Lưu tại: `docs/devops/post-mortems/YYYY-MM-DD-<short-title>.md`

---

## 6. Slack Templates

### Alert ban đầu (P3/P2)

```
🚨 [INCIDENT - P<level>]
Time: <HH:MM DD/MM/YYYY>
Type: <AVAILABILITY / PERFORMANCE / DATA / INTEGRATION / SECURITY>
Service: lumilink-be
Symptom: <mô tả ngắn gọn>
Impact: <số users ước tính / features bị ảnh hưởng>
Status: Đang điều tra
Ticket: <link GitHub Issue>
```

### Handoff message (khi escalate)

```
⬆️ Escalating to P<next-level>
Timeline: <bắt đầu lúc nào, đã xử lý bao lâu>
Tried: <đã thử gì>
Hypothesis: <nghi ngờ gì>
Needs: <cần quyết định / action gì tiếp>
Ticket: <link>
```

### Resolved message

```
✅ [RESOLVED - P<level>]
Resolved at: <HH:MM>
Duration: <X phút>
Fix: <mô tả ngắn gọn>
Post-mortem required: <yes / no>
```