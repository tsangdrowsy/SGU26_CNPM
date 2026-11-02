#  GuideFriends - Smart Tourism App (Linh Ung Pagoda)

**GuideFriends** là một hệ sinh thái du lịch thông minh dành cho Chùa Linh Ứng (Bán đảo Sơn Trà, Đà Nẵng). Dự án được thiết kế nhằm nâng cao trải nghiệm của du khách thông qua bản đồ tương tác, tự động thuyết minh (TTS) khi đến gần địa điểm (Geofencing), và Chatbot AI đa ngôn ngữ.

Dự án áp dụng chiến lược **"On-the-fly Translation & TTS"** (Dịch và đọc trực tiếp) thay vì pre-generate file âm thanh, giúp tiết kiệm chi phí lưu trữ (không cần AWS S3) và tối ưu hóa trải nghiệm người dùng.

---

##  Tính Năng Chính

###  1. Mobile App (Dành cho Du khách)
- **Bản đồ tương tác (OpenStreetMap/Leaflet):** Hiển thị vị trí POIs, các quán ăn xung quanh (chấm xanh) và vị trí hiện tại của người dùng (chấm xanh dương).
- **Geofencing (Định vị):** Tự động kích hoạt thuyết minh (Audio Guide) khi du khách bước vào bán kính quy định của POI.
- **AI Translation & TTS (Text-to-Speech):** Tự động dịch văn bản sang ngôn ngữ người dùng chọn (Anh, Nhật, Hàn, Trung, Việt) bằng Gemini AI và đọc to bằng giọng của thiết bị.
- **AI Chatbot (RAG):** Hỏi đáp trực tiếp về địa điểm dựa trên ngữ cảnh (Context) lấy từ Database.
- **Gallery Ảnh:** Trượt ngang xem nhiều ảnh của POI/Quán ăn.
- **Unlock Flow:** Đăng nhập bằng mã Token (6 ký tự) mua từ quầy hoặc thanh toán trực tuyến qua VNPAY.

###  2. Web App (Dành cho Quản trị viên, Nhân viên & Chủ quán)
- **Clerk Portal:** Tạo mã kích hoạt (Token 24h) cho khách du lịch.
- **Admin Dashboard:** 
  - Xem thống kê (Tổng Token, Người dùng đang hoạt động, Tổng POIs).
  - Quản lý POIs (Thêm/Sửa/Xóa, upload nhiều ảnh, chọn ảnh chính).
  - Duyệt các cửa hàng đăng ký mới (Tiền mặt hoặc VNPAY).
- **Shopkeeper Portal:** 
  - Chủ quán đăng ký cửa hàng, chọn vị trí trên bản đồ.
  - Thanh toán phí đăng ký qua VNPAY.
  - Sử dụng "Claim Code" để vào trang quản lý, cập nhật thông tin và hình ảnh quán.

---

##  Tech Stack

- **Frontend Mobile:** React Native (Expo), Expo Router, Expo Location, Expo Speech, React Native WebView.
- **Frontend Web:** React.js (Vite), TailwindCSS, React-Leaflet, Lucide Icons.
- **Backend:** Node.js, Express.js.
- **Database:** SQL Server (MSSQL).
- **AI API:** Google Gemini API (`@google/genai`).
- **Payment Gateway:** VNPAY Sandbox.
- **Công cụ khác:** Ngrok (để test VNPAY và kết nối Mobile với Localhost), Multer (upload ảnh).

---

##  Cấu Trúc Thư Mục

```text
GuideFriends/
├── src/                  # Mã nguồn ứng dụng Mobile (React Native/Expo)
│   ├── app/              # Các màn hình (Expo Router)
│   ├── api/              # Cấu hình Axios/Fetch gọi API
│   ├── components/       # Các UI components dùng chung
│   ├── features/map/     # Logic bản đồ (WebView & Web Iframe)
│   ├── services/         # AI Translation, TTS, Chatbot Service
│   |── types/            # Định nghĩa TypeScript Interfaces
    └──sql/sql1.sql   # Script khởi tạo Database SQL Server



├── server/               # Mã nguồn Backend (Node.js Express)
│   ├── uploads/          # Thư mục chứa ảnh upload từ người dùng
│   ├── server.js         # File chạy chính của API
│   └── aiService.js      # Logic gọi Gemini API

 
web/                  # Mã nguồn Web Portal (React Vite)
│  └── src/pages/        # Admin, Clerk, Shopkeeper Pages

```
## Hướng Dẫn Cài Đặt & Chạy Dự Án
### 1. Chuẩn bị Database (SQL Server)
Mở SQL Server Management Studio (SSMS).

Chạy toàn bộ script trong file GuideFriendsDB.sql (hoặc file .sql chứa Schema mới nhất).

Đảm bảo Database GuideFriendsDB đã được tạo và có dữ liệu mẫu (POIs, Shopkeepers).

### 2. Cài đặt Backend (server)
Mở terminal, di chuyển vào thư mục server:

```
cd server
npm install
```
Tạo file .env trong thư mục server/ với nội dung sau (thay thế bằng thông tin của bạn):

env
PORT=3000
DB_SERVER=localhost
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=YourStrong!Passw0rd
DB_NAME=GuideFriendsDB

 Gemini API
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash

 VNPAY Sandbox
VNPAY_TMN_CODE=your_tmn_code
VNPAY_HASH_SECRET=your_hash_secret
VNPAY_RETURN_URL=https://your-ngrok-url.ngrok-free.dev/api/payment/vnpay-return
Khởi động Server:

```

npm start
```
(Server sẽ chạy ở http://localhost:3000)

### 3. Cài đặt Web Portal (web)
Mở terminal mới, di chuyển vào thư mục web:
```

cd web
npm install
```
Chạy giao diện web:
```

npm run dev
```
Truy cập http://localhost:5173/admin hoặc /clerk để test.

### 4. Cài đặt Mobile App
Cập nhật đường dẫn API trong file src/api/pois.ts:

Nếu chạy Emulator Android: http://10.0.2.2:3000

Nếu chạy iOS Simulator/Web: http://localhost:3000

Nếu test trên điện thoại thật: Dùng IP LAN (VD: http://192.168.1.x:3000) hoặc link Ngrok.

## Khởi động app:
```

npx expo start
```
Bấm a (Android) hoặc i (iOS) để mở app trên máy ảo.

 Các Luồng Nghiệp Vụ (Flows) Để Test
### Flow 1: Mở khóa App (Clerk)
Vào web /clerk, bấm Tạo mã 24H để lấy một mã 6 ký tự (VD: A1B2C3).

Mở Mobile App, nhập mã đó vào màn hình Unlock.

App sẽ lưu mã vào AsyncStorage, tự động đăng nhập vào bản đồ.

### Flow 2: Thuyết minh tự động (Geofencing & AI)
Trong App Mobile, bấm vào thanh Simulator Chips ở dưới cùng (VD: chọn "Chùa Linh Ứng").

Vị trí GPS sẽ nhảy đến POI đó.

App sẽ gọi Gemini API để dịch mô tả sang ngôn ngữ đã chọn (mặc định là tiếng Anh).

Giao diện hiện chữ và phát âm thanh qua expo-speech.

### Flow 3: Chatbot AI
Tại màn hình POI, bấm nút Chat.

Hỏi một câu hỏi (VD: "Chùa xây năm nào?").

AI sẽ trả lời dựa trên dữ liệu lấy từ DB.

### Flow 4: Thanh toán VNPAY
Mở App Mobile -> Bấm Exit -> Chọn Thanh toán VNPAY.

Trình duyệt mở ra cổng VNPAY Sandbox. Dùng thẻ test (NCB: 9704198526191432198, OTP: 123456) để thanh toán.

Hệ thống nhận IPN -> Tự động chuyển hướng vào bản đồ.

## Lưu ý quan trọng khi phát triển
Ngrok: Nếu test thanh toán VNPAY, bắt buộc phải bật Ngrok (ngrok http 3000) và cập nhật link Ngrok mới vào file .env và cấu hình trên trang Merchant của VNPAY.

Gemini API Rate Limit: Gói Free Tier có giới hạn (thường là 15 RPM). Nếu gặp lỗi 429, hãy chờ 1 phút hoặc đổi model sang gemini-1.5-flash / gemini-2.0-flash.

Lỗi ảnh trắng: Khi chạy trên Web qua Ngrok, nếu ảnh không hiển thị, hãy thêm param ?ngrok-skip-browser-warning=true vào URL của ảnh (đã được xử lý sẵn trong code).
