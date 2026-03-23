# Kịch bản test — Incident Response Bot

> **Mục tiêu:** Hiểu cách bot hoạt động và chạy thử toàn bộ flow từ khi phát hiện incident đến khi resolved + tạo report.
> **Người test:** PO (Nguyen Duc Ban)
> **Thời gian ước tính:** ~10 phút

---

## Vai trò trong incident

| Vai trò | Người | Trách nhiệm |
|---|---|---|
| **IC** (Incident Commander) | Kien (DevOps) | Điều phối: nhận thông tin từ team, cập nhật trạng thái lên Slack, communicate ra ngoài. **IC không phải người trực tiếp fix — đó là việc của cả team.** |
| **Team** | Dev-Be, DevOps | Người trực tiếp debug và fix lỗi, báo cáo tiến độ lại cho IC |
| **PO** | Ban | Nhận thông báo, theo dõi tiến độ, review và xác nhận action items phòng ngừa |

---

## Tổng quan — Bot kích hoạt khi nào?

Bot có **2 cách kích hoạt**, hoàn toàn độc lập nhau:

---

### Cách 1 — Thủ công: IC gõ lệnh `/incident`

**Khi nào dùng:**
Ai đó trong team (thường là DevOps / Dev) phát hiện lỗi bằng mắt — nhìn thấy app crash, user báo cáo không vào được, hoặc tự test thấy lỗi — rồi **chủ động báo vào Slack**.

**Cách kích hoạt:**
Vào channel **#incidents-lumi_ai**, gõ:
```
/incident <mô tả ngắn về lỗi>
```

Ví dụ:
```
/incident Login bị sập — user không đăng nhập được
/incident Payment timeout — giao dịch không xử lý được
/incident App crash trên Android — 500 error liên tục
```

**Bot phản hồi ngay lập tức** (trong vòng 3 giây) bằng một tin nhắn riêng chỉ IC thấy:
```
⏳ Opening incident... Check #incidents-lumi_ai in a moment.
```

Và đồng thời tạo thread incident trong **#incidents-lumi_ai**.

---

### Cách 2 — Tự động: Có cảnh báo lỗi trong `#infra-noti-ai-team`

**Khi nào xảy ra:**
Hệ thống monitoring (Grafana, UptimeRobot, Sentry...) tự động gửi cảnh báo vào channel **#infra-noti-ai-team** khi phát hiện lỗi trên production — ví dụ:

```
🔥 500 Error - PRODUCTION
Status Code: 500
Request: POST https://api.lumilink.vn/auth/login
Environment: production
Error Message: DB connection pool exhausted
```

**Bot tự động phân tích tin nhắn này.** Nếu phát hiện có mã lỗi 4xx/5xx và là môi trường production → **tự động kích hoạt incident** mà không cần ai gõ lệnh.

**Điều kiện để bot kích hoạt tự động:**
- ✅ Tin nhắn chứa mã lỗi HTTP (ví dụ: `500 Error`, `Status Code: 503`)
- ✅ Không phải tin nhắn tóm tắt/lặp lại (`Error Update: X Additional Occurrence` → **bị bỏ qua**)
- ✅ Chưa có incident nào được tạo cho cùng lỗi đó trong vòng **5 phút** gần nhất (chống spam)

**Nếu đủ điều kiện:** Bot tự tạo thread incident trong **#incidents-lumi_ai** với mô tả lấy từ nội dung cảnh báo (status code, endpoint, error message).

> **Lưu ý:** Cả hai cách đều dẫn đến **cùng một flow** từ bước 1 trở đi bên dưới.

---

## Flow sau khi incident được kích hoạt

Dù kích hoạt theo cách nào, bot đều:
1. Tạo thread mới trong **#incidents-lumi_ai**
2. Cập nhật status page ngay lập tức → hiện thông báo "đang điều tra"
3. Hiện nút **"🚨 Classify Incident"** trong thread để IC phân loại

---

## Kịch bản test cụ thể

**Tình huống:** Login bị sập, 50 user không vào được app.

---

### Bước 1 — IC kích hoạt incident (thủ công)

**Ai làm:** Kien (IC / DevOps)

Kien vào channel **#incidents-lumi_ai**, gõ:

```
/incident Login bị sập — user không đăng nhập được
```

**Điều xảy ra:**
- Bot tạo thread trong **#incidents-lumi_ai**:
  ```
  🚨 Incident Detected | ID: INC-20260323-0001
  Time: 2026-03-23 09:15:00 +07
  Trigger: Login bị sập — user không đăng nhập được

  Awaiting IC classification...
  ```
- Bot hiện nút **"🚨 Classify Incident"** ngay bên dưới
- Status page cập nhật tại **https://lumiai1.statuspage.io/** — incident mới **luôn xuất hiện đầu trang**, ai vào link này cũng thấy ngay

> **Tương đương nếu dùng auto-trigger:** Monitoring tự gửi cảnh báo `500 error on POST /auth/login` vào **#infra-noti-ai-team** → bot tự phát hiện và tạo thread tương tự.

---

### Bước 2 — IC phân loại mức độ incident

**Ai làm:** Kien (IC) — click nút **"🚨 Classify Incident"** trong thread

Popup (modal) hiện ra. Kien điền:

| Trường | Giá trị | Lý do |
|---|---|---|
| **Incident Type** | 🔴 AVAILABILITY | Service không respond — user không login được |
| **Users affected** | 50 | Ước tính số user đang bị ảnh hưởng |
| **Business Impact** | ✅ Login/Register broken | User Acquisition bị ảnh hưởng — không đăng nhập được |
| **Technical Severity** | 🟡 High | Core feature (login) broken hoàn toàn, 5xx liên tục |

Kien bấm **"Classify"**.

**Bot làm ngay lập tức (song song):**

| Hành động | Chi tiết |
|---|---|
| Tính priority | **P1 — Critical** (High severity + Login/Register broken = P1 theo escalation matrix) |
| Post vào thread | Thông tin đầy đủ: priority, loại incident, business impact, IC phụ trách |
| Tạo Google Meet | Link war room được gửi vào thread để cả team vào họp |
| Gửi DM cho | **TechLead (An)**, **PO (Ban)** — theo Departments Involved Matrix: P1 AVAILABILITY |
| Cập nhật status page | Chuyển sang "Investigating" — hiện **ngay đầu trang** tại https://lumiai1.statuspage.io/ |
| Bắt đầu ping | Cứ **3 phút** bot nhắc IC cập nhật trạng thái nếu chưa có update |

> **Ban (PO) sẽ nhận DM:**
> ```
> @Ban 🚨 Incident P1 — INC-20260323-0001
> Description: Login bị sập — user không đăng nhập được
> Please check #incidents-lumi_ai immediately.
> 📹 War Room (Meet): https://meet.google.com/xxx-xxxx-xxx
> ```

---

### Bước 3 — IC xác định được nguyên nhân

**Ai làm:** Kien (IC) — trong thread **#incidents-lumi_ai**

Bot đang hiện nút bấm flow tuần tự. Kien click:

> **"🔍 1. Root Cause Identified"**

Popup hiện ra. Kien điền:
```
DB connection pool bị exhausted do query chậm spike đột ngột,
khiến auth service không lấy được DB connection → login fail toàn bộ.
```

Bấm **"Submit"**.

**Bot làm:**
- Update thread: `🟡 Root Cause Identified — DB connection pool exhausted...`
- Cập nhật status page → "Root cause identified, fix đang được triển khai"

---

### Bước 4 — Team bắt đầu fix, IC cập nhật trạng thái

> **Vai trò IC:** IC **không phải người fix**. IC chịu trách nhiệm nhận thông tin từ team đang xử lý, rồi cập nhật trạng thái lên Slack để mọi người theo dõi.

**Ai làm:** Kien (IC) — click nút tiếp theo sau khi team báo đã bắt đầu fix

> **"🔧 2. Fix In Progress"**

Popup hiện ra. Kien điền tóm tắt những gì team đang thực hiện:
```
Team đang tăng DB connection pool size từ 10 lên 50.
Restart auth service để clear stale connections.
```

Bấm **"Submit"**.

**Bot làm:**
- Update thread: `🟠 Fix In Progress — Tăng DB pool size, restart auth service...`
- Cập nhật status page → "Fix đang được triển khai, monitoring closely"

---

### Bước 5 — IC xác nhận đã resolved

**Ai làm:** Kien (IC) — click nút cuối

> **"✅ 3. Resolved"**

**Bot làm:**
- Update thread: `🟢 Resolved`
- Cập nhật status page → "Resolved — service hoạt động bình thường"
- Dừng ping timer
- Gọi AI phân tích toàn bộ incident → tạo danh sách action items phòng ngừa
- Post danh sách action items vào thread để team review

---

### Bước 6 — Team review action items phòng ngừa

**Ai làm:** Kien + Ban (cùng review trong thread)

Bot post message kiểu:

```
📋 B5 — AI Prevention Plan
🤖 Review each item — confirm, adjust owner/ETA, or remove:

⏳ 1. Set up DB connection pool alert khi usage > 80%
   👤 Owner: Kien  |  ⏱ ETA: 1 week
   [✅ Confirm] [👤 Owner] [⏱ ETA] [🗑 Remove]

⏳ 2. Thêm circuit breaker cho auth service
   👤 Owner: An  |  ⏱ ETA: 2 weeks
   [✅ Confirm] [👤 Owner] [⏱ ETA] [🗑 Remove]

⏳ 3. Load test định kỳ DB pool hàng tháng
   👤 Owner: Kien  |  ⏱ ETA: 1 month
   [✅ Confirm] [👤 Owner] [⏱ ETA] [🗑 Remove]
```

**PO (Ban) có thể tương tác:**
- ✅ **Confirm** — đồng ý với item này
- 👤 **Owner** — đổi người chịu trách nhiệm
- ⏱ **ETA** — điều chỉnh deadline (3 days / 1 week / 2 weeks / 1 month / 3 months)
- 🗑 **Remove** — loại bỏ item không cần thiết

**Sau khi tất cả items được confirm hoặc remove:**
Bot tự động tạo file **incident report trên GitHub** với đầy đủ nội dung: timeline, root cause, fix đã thực hiện, action items đã được team xác nhận.

---

## Checklist verify sau khi test

**IC (Kien) verify:**
- [ ] `/incident` tạo được thread trong **#incidents-lumi_ai**
- [ ] Modal classify hiện đúng options kèm mô tả
- [ ] Sau classify: thread có đủ info (priority P1, loại incident, business impact)
- [ ] Nhận được link Google Meet trong thread
- [ ] Nút Step 1 → 2 → 3 chạy đúng thứ tự, không bị skip

**PO (Ban) verify:**
- [ ] Nhận DM ngay khi incident P1 được classified (không cần vào channel mới biết)
- [ ] DM có: mức độ, mô tả, link channel, link Meet
- [ ] Thấy thread trong **#incidents-lumi_ai** cập nhật theo từng bước
- [ ] Có thể tương tác với action items (confirm / đổi owner / đổi ETA / remove)

**Chung:**
- [ ] Status page tại **https://lumiai1.statuspage.io/** cập nhật đúng theo từng bước (Investigating → Identified → Fix In Progress → Resolved) — incident mới luôn hiện đầu trang
- [ ] GitHub incident report được tạo sau khi resolve, action items phản ánh đúng lựa chọn của team

---

## Lưu ý khi test

- Không cần incident thật — kịch bản giả này đủ để test toàn bộ flow
- Auto-trigger chỉ hoạt động khi có message đúng format trong **#infra-noti-ai-team** (không trigger khi test thủ công trong channel đó)
- Nếu bot không gửi DM cho Ban → kiểm tra `team_contacts.json` có đúng `slack_id` của Ban chưa
- Status page / Google Meet chỉ hoạt động khi đã cấu hình đủ biến môi trường (`.env`)
