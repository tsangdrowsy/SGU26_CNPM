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

