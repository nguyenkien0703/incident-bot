Hướng dẫn lấy giá trị các biến môi trường

---                                                                                                                                            
1. Slack — SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_INCIDENTS_CHANNEL
                                                                                                                                                
Bước 1: Vào https://api.slack.com/apps → Create New App → From scratch
                                                                                                                                                
Bước 2: Đặt tên app (ví dụ Incident Bot), chọn workspace của team                                                                              
                                                                                                                                                
Bước 3: Lấy SLACK_SIGNING_SECRET                                                                                                               
- Vào Basic Information → App Credentials → copy Signing Secret
                                                                                                                                                
Bước 4: Thêm permissions — vào OAuth & Permissions → Scopes → Bot Token Scopes, thêm:
calls:write                                                                                                                                    
calls:read                                                                                                                                     
chat:write                                                                                                                                     
im:write                                                                                                                                       
channels:read                                                                                                                                  
                                                                                                                                                
Bước 5: Vào Install App → Install to Workspace → copy Bot User OAuth Token                                                                     
- Đây là SLACK_BOT_TOKEN (bắt đầu bằng xoxb-)                                                                                                  
                                                                                                                                                
Bước 6: SLACK_INCIDENTS_CHANNEL                                                                                                                
- Tạo channel #incidents trong Slack nếu chưa có                                                                                               
- Invite bot vào channel: gõ /invite @Incident Bot trong channel đó                                                                            
- Giá trị là tên channel không có #: incidents                                                                                                 
                                                                                                                                                
---                                                                                                                                            
2. Twilio — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER                                                                          
                                                                                                                                                
Bước 1: Đăng ký tại https://www.twilio.com/try-twilio (free trial được)                                                                        
                                                                                                                                                
Bước 2: Vào Console Dashboard (https://console.twilio.com)
- Copy Account SID → TWILIO_ACCOUNT_SID                                                                                                        
- Copy Auth Token (click icon mắt để hiện) → TWILIO_AUTH_TOKEN                                                                                 
                                                            
Bước 3: Lấy số điện thoại gọi đi (TWILIO_FROM_NUMBER)                                                                                          
- Vào Phone Numbers → Manage → Buy a number                                                                                                    
- Twilio không có số +84 Việt Nam — mua số US (+1) là được, Twilio vẫn gọi ra số +84 bình thường                                               
- Copy số đó (format E.164, ví dụ +15551234567) → TWILIO_FROM_NUMBER                                                                           
                                                                                                                                                
▎ Nếu dùng trial account, phải verify số +84 của từng thành viên trước tại Verified Caller IDs                                                 
                                                                                                                                                
---                                                                                                                                            
3. Statuspage.io — STATUSPAGE_API_KEY, STATUSPAGE_PAGE_ID, STATUSPAGE_COMPONENT_ID                                                             
                                                                                                                                                
Bước 1: Đăng ký tại https://www.atlassian.com/software/statuspage (có free plan)
                                                                                                                                                
Bước 2: Tạo một Page (ví dụ "Lumilink Status")                                                                                                 
                                                                                                                                                
Bước 3: Lấy STATUSPAGE_API_KEY                                                                                                                 
- Click avatar góc trên phải → API info                   
- Copy API key                                                                                                                                 
                                                        
Bước 4: Lấy STATUSPAGE_PAGE_ID                                                                                                                 
- Vào Page Settings → URL sẽ có dạng manage.statuspage.io/pages/XXXXXX                                                                         
- XXXXXX chính là STATUSPAGE_PAGE_ID                                                                                                           
                                                                                                                                                
Bước 5: Lấy STATUSPAGE_COMPONENT_ID                                                                                                            
- Vào Components → tạo component "lumilink-be API" nếu chưa có                                                                                 
- Click vào component → URL có dạng .../components/YYYYYY                                                                                      
- YYYYYY là STATUSPAGE_COMPONENT_ID                                                                                                            
                                                                                                                                                
---                                                       
4. Google Calendar — GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN                                                              
                                                                                                                                                
Bước 1: Vào https://console.cloud.google.com → tạo project mới
                                                                                                                                                
Bước 2: Bật API                                                                                                                                
- Vào APIs & Services → Enable APIs → tìm Google Calendar API → Enable                                                                         
                                                                                                                                                
Bước 3: Tạo OAuth credentials                             
- Vào APIs & Services → Credentials → Create Credentials → OAuth client ID                                                                     
- Application type: Web application                                                                                                            
- Thêm Authorized redirect URI: https://developers.google.com/oauthplayground                                                                  
- Copy Client ID → GOOGLE_CLIENT_ID                                                                                                            
- Copy Client Secret → GOOGLE_CLIENT_SECRET                                                                                                    
                                                                                                                                                
Bước 4: Lấy Refresh Token qua OAuth Playground                                                                                                 
- Vào https://developers.google.com/oauthplayground                                                                                            
- Click gear icon ⚙️  → tick Use your own OAuth credentials → nhập Client ID + Secret                                                           
- Ở bảng bên trái, tìm Google Calendar API v3 → chọn https://www.googleapis.com/auth/calendar                                                  
- Click Authorize APIs → đăng nhập Google account của bot                                                                                      
- Click Exchange authorization code for tokens                                                                                                 
- Copy Refresh token → GOOGLE_REFRESH_TOKEN                                                                                                    
                                                                                                                                                
---                                                                                                                                            
5. GitHub — GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME
                                                                                                                                                
Bước 1: Lấy GITHUB_TOKEN                                  
- Vào GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token                               
- Repository access: chọn repo lumilink-be                                                                                                     
- Permissions: Contents → Read and write (để write file post-mortem)                                                                           
- Click Generate token → copy ngay (chỉ hiện 1 lần)                                                                                            
                                                                                                                                                
Bước 2: GITHUB_REPO_OWNER và GITHUB_REPO_NAME                                                                                                  
- URL repo của mày là github.com/<owner>/<repo>                                                                                                
- Ví dụ: github.com/defikit/lumilink-be → GITHUB_REPO_OWNER=defikit, GITHUB_REPO_NAME=lumilink-be                                              
                                                                                                                                                
---                                                                                                                                            
Checklist nhanh                                           
                                                                                                                                                
┌──────────────────────────┬─────────────────────────────────────────────┬────────────────────┐
│           Biến           │                    Nguồn                    │ Thời gian ước tính │                                                
├──────────────────────────┼─────────────────────────────────────────────┼────────────────────┤                                                
│ Slack (3 biến)           │ api.slack.com                               │ ~10 phút           │
├──────────────────────────┼─────────────────────────────────────────────┼────────────────────┤                                                
│ Twilio (3 biến)          │ console.twilio.com                          │ ~5 phút            │                                                
├──────────────────────────┼─────────────────────────────────────────────┼────────────────────┤                                                
│ Statuspage (3 biến)      │ manage.statuspage.io                        │ ~5 phút            │                                                
├──────────────────────────┼─────────────────────────────────────────────┼────────────────────┤                                                
│ Google Calendar (3 biến) │ console.cloud.google.com + OAuth Playground │ ~15 phút           │
├──────────────────────────┼─────────────────────────────────────────────┼────────────────────┤                                                
│ GitHub (3 biến)          │ github.com/settings                         │ ~3 phút            │
└──────────────────────────┴─────────────────────────────────────────────┴────────────────────┘   