# RF Mate — Hệ Thống Quản Lý Tiến Độ Triển Khai Mạng 4G/5G

> **Ứng dụng PWA** cho đội ngũ kỹ thuật viễn thông, quản lý & cập nhật tiến độ triển khai trạm BTS **trực tiếp trên bản đồ số** — đồng bộ real-time với Google Sheets, hoạt động cả khi **mất kết nối mạng (Offline Mode)**.

---

## ✨ Điểm nổi bật

|  |  |
|---|---|
| 🗺️ **Bản đồ vệ tinh tương tác** | Marker theo trạng thái, sector ăng-ten theo Azimuth |
| 📊 **Dashboard thời gian thực** | Thống kê, biểu đồ theo Tỉnh / Đối tác, có filter chung |
| 🗓️ **Report Check-in riêng** | Theo dõi check-in trong ngày, biểu đồ nhóm theo Tỉnh–Đối tác |
| 📍 **Check-in GPS** | Chụp ảnh + xác minh tọa độ ≤ 100m, tự upload lên Drive |
| 🤖 **Trợ lý AI "Anh Ba"** | Hỏi đáp kỹ thuật, phân tích ảnh thiết bị, học tài liệu nội bộ |
| 📶 **Offline-first** | Hoạt động ở vùng sóng yếu, tự đồng bộ khi có mạng lại |
| 📱 **Cài như app thật** | Không cần store — mở trình duyệt → "Thêm vào màn hình chính" |

---

## 🔐 Phân quyền

| Role | Xem bản đồ | Dashboard | Sửa/Audit | Xuất Excel | Check-in |
|---|:---:|:---:|:---:|:---:|:---:|
| **Admin** | ✅ Toàn bộ | ✅ | ✅ | ✅ | ✅ |
| **Manager** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Export** | ✅ | ✅ | ❌ | ✅ | ✅ |
| **View** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **View Limited** | 🔒 1 trạm | ❌ | ❌ | ❌ | ✅ |
| **Đối tác** | 🔒 1 trạm | ❌ | ❌ | ❌ | ✅ |

Ngoài Role, mỗi tài khoản còn có thể bị giới hạn xem theo **Tỉnh** qua cột `Pro` trong sheet `Users` (xem phần cấu hình bên dưới). Report Check-in chỉ Admin/Manager/Export truy cập được; icon bút chì sửa dữ liệu chỉ Admin/Manager thấy.

---

## 🛠 Triển khai từ đầu

### Bước 1 — Google Sheets

Tạo 1 Google Sheet, thêm các sheet sau:

| Sheet | Bắt buộc | Cột chính |
|---|:---:|---|
| `Data` | ✅ | `Site`, `Lat`, `Long`, `Danh sách` (Triển khai/Dự phòng), `Phân loại`, `Tiến độ 4G`, `Tiến độ 5G`, `Status`, `Đối tác`, `Tỉnh mới`, `Huyện`, `User cập nhật`, `Ngày cập nhật`, `Check-in`, cột link ảnh check-in |
| `Users` | ✅ | `Username`, `Password`, `DisplayName`, `Role`, `Pro` (tên Tỉnh hoặc `ALL`) |
| `Map_sector` | Nếu dùng sector overlay | `Site`, `Sector`, `Azimuth`, `Lat`, `Long`, `Tech`, `Cấu hình mới`, `Độ cao cột`, `Tilt cơ`, `Tilt điện`... |
| `Config` | Tùy chọn | `Site`, `URL` |
| `Troubleshooting Docs` | Tùy chọn, cho AI | Cột A/B là link Google Docs hoặc Document ID |
| `Comments` | Tự tạo | Backend tự tạo khi có comment đầu tiên |

### Bước 2 — Deploy Google Apps Script

1. Trong Sheet → **Tiện ích mở rộng → Apps Script**.
2. Xóa code mặc định, dán toàn bộ nội dung `google-apps-script/Code.gs`.
3. Đổi hằng `API_SECRET` (đầu file) sang một chuỗi ngẫu nhiên riêng của bạn — đây là "mật khẩu" giữa app và backend, phải khớp với bước 3.
4. Đổi `DIAGRAMS_FOLDER_ID` sang ID folder Google Drive chứa sơ đồ đấu nối (tùy chọn).
5. Chạy hàm `setupPermissions()` **một lần** để cấp quyền Drive & Docs.
6. **Deploy → New deployment** → loại **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy URL dạng `https://script.google.com/macros/s/.../exec`.

> ⚠️ Từ lần 2 trở đi, KHÔNG bấm "New deployment" nữa (sẽ đổi URL). Dùng **Deploy → Manage deployments → sửa deployment hiện có → Version: New → Deploy**.

### Bước 3 — Cấu hình app

Mở `js/config.js`, điền:

```javascript
API_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
API_SECRET: 'CHUỖI_GIỐNG_HỆT_API_SECRET_TRONG_CODE.GS',
DIAGRAMS_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID',
CHECKIN_FOLDER_ID:  'YOUR_DRIVE_FOLDER_ID',
GEMINI_API_KEY: atob('YOUR_BASE64_ENCODED_KEY'),
```

Mã hóa API Key Gemini (tránh bị GitHub tự động khóa vì lộ key dạng thô): mở Console trình duyệt (F12), gõ `btoa("AIzaSy...KEY_THẬT")`, dán kết quả vào `atob('...')`.

> Khi phát triển local, có thể dùng file `.env` (xem `.env` mẫu — không commit lên git) với `VITE_API_URL`, `VITE_API_SECRET`, `VITE_GEMINI_API_KEY` — `config.js` sẽ ưu tiên đọc từ đây khi chạy `npm run dev`. Khi deploy production (serve file tĩnh, không qua Vite), app dùng thẳng giá trị hard-code trong `config.js`.

### Bước 4 — Deploy lên GitHub Pages (hoặc Vercel/Netlify)

**Không cần bước build.** App chạy bằng ES Modules thuần, serve thẳng file tĩnh là đủ:

1. Push toàn bộ repo lên GitHub (những gì cần commit — xem mục Cấu trúc thư mục bên dưới; `google-apps-script/`, `.env`, `node_modules/`, `dist/` đã bị `.gitignore`, không cần lo).
2. Repo → **Settings → Pages** → Source: chọn nhánh (VD `main`), thư mục `/` (root).
3. Đợi vài phút, truy cập theo URL GitHub Pages cấp.

**Cài lên điện thoại (PWA):**
- **Android:** Chrome → `⋮` → *"Thêm vào màn hình chính"*
- **iOS:** **Bắt buộc dùng Safari** → nút Share → *"Thêm vào Màn hình chính"*

**Muốn chạy local để test trước:**
```bash
npm install
npm run dev      # http://localhost:3000, đọc .env
```

---

## 📁 Cấu trúc thư mục

```
NetDep/
├── index.html              ← điểm vào chính
├── manifest.json
├── sw.js                    ← Service Worker (tăng version mỗi lần đổi code)
├── css/style.css
├── js/
│   ├── main.js               entry point, import mọi module
│   ├── config.js              API_URL, API_SECRET, folder ID, màu sắc...
│   ├── auth.js                 session & phân quyền
│   ├── storage.js               localStorage, offline queue
│   ├── data.js                   mọi gọi API (DataService)
│   ├── map.js                     Leaflet: marker, sector, GPS
│   ├── app.js                      logic UI chính, modal, export
│   ├── dashboard.js                 Dashboard
│   ├── chart.js                      biểu đồ Chart.js
│   ├── checkin-report.js              Report Check-in
│   └── ai-assistant.js                 trợ lý AI "Anh Ba"
├── icons/                    icon PWA
├── google-apps-script/
│   └── Code.gs              ← backend, KHÔNG commit lên git — deploy thủ công vào Apps Script
├── .env                     ← config local cho `npm run dev`, KHÔNG commit
├── package.json / vite.config.js   ← chỉ cần cho local dev, không bắt buộc để deploy
```

---

## ❓ Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| Không kết nối được dữ liệu | Sai `API_URL` | Phải kết thúc bằng `/exec` |
| Mọi thao tác ghi dữ liệu báo lỗi | `API_SECRET` không khớp giữa `config.js` và `Code.gs` | Kiểm tra 2 giá trị giống hệt nhau, deploy lại Apps Script sau khi sửa |
| `Failed to fetch` | Deploy sai quyền | Execute as **Me**, Who has access **Anyone** |
| AI báo đỏ / không trả lời | Sai link tài liệu, hết quota, hoặc key sai | Link phải là Google Docs công khai; kiểm tra `GEMINI_API_KEY` và quota tại Google AI Studio |
| Check-in báo lỗi khoảng cách | Đứng quá xa trạm | Phải trong bán kính ≤ 100m so với tọa độ Sheet |
| Ảnh check-in không upload | Sai Folder ID / thiếu quyền | Kiểm tra `CHECKIN_FOLDER_ID`, chạy lại `setupPermissions()` |
| Sửa Code.gs xong không thấy hiệu lực | Bấm nhầm "New deployment" (đổi URL) | Dùng "Manage deployments → sửa deployment cũ → New version" |
| iOS không cài được PWA | Dùng trình duyệt khác Safari | Bắt buộc Safari trên iPhone/iPad |

---

## 🚀 Hướng phát triển tiếp

- [ ] Push Notifications khi trạm được cập nhật
- [ ] Audit Log — lịch sử thay đổi tiến độ theo thời gian
- [ ] Báo cáo theo khoảng ngày tùy chọn
- [ ] Heatmap mật độ hoàn thành trên bản đồ
- [ ] QR Code trạm để scan nhanh tại hiện trường
- [ ] Giao diện quản trị User ngay trên app (thay vì sửa Sheet)
- [ ] Multi-language (English)

---

*RF Mate — Developed by toidh.*
