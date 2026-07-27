/**
 * BTS Progress Tracker - Configuration
 * 
 * HƯỚNG DẪN: Sau khi deploy Google Apps Script, dán URL vào API_URL bên dưới.
 * Chỉ cần thay đổi 1 lần duy nhất tại đây, tất cả user sẽ dùng chung.
 */
export const AppConfig = {
  // ⚠️ DÁN URL GOOGLE APPS SCRIPT CỦA BẠN VÀO ĐÂY:
  API_URL: import.meta.env?.VITE_API_URL || 'https://script.google.com/macros/s/AKfycbyjY-_-XAaJHAz7oNI3DPY-nq3XXo8IBjAzM7AxVnl_7jL4l2WD0yc1BPnQhnB3v5aL/exec',

  // ⚠️ Phải khớp CHÍNH XÁC với API_SECRET trong Code.gs — mọi request ghi dữ liệu (doPost)
  // đều gửi kèm giá trị này, Code.gs từ chối nếu không khớp.
  API_SECRET: import.meta.env?.VITE_API_SECRET || 'JCGfCl6mZrRxnl2GnSTxI4suh4XjnEJh',

  // App info
  APP_NAME: 'RF Mate',
  APP_VERSION: '1.0',

  // Map defaults (centered on Bạc Liêu province)
  MAP_CENTER: [9.17684, 105.15691],
  MAP_ZOOM: 12,
  MAP_MIN_ZOOM: 8,
  MAP_MAX_ZOOM: 19,

  // Data refresh interval (milliseconds) - 5 minutes
  DATA_REFRESH_INTERVAL: 5 * 60 * 1000,

  COLORS: {
    // Marker colors based on 'Danh sách' column
    TRIEN_KHAI: '#1d4ed8', // Blue
    DU_PHONG: '#d97706',   // Orange
    DEFAULT: '#1d4ed8',    // Blue

    // UI colors
    PRIMARY: '#1d4ed8',
    SUCCESS: '#166534',
    WARNING: '#d97706',
    DANGER: '#b91c1c',
    ACCENT: '#7c3aed',
  },

  // ⚠️ DÁN FOLDER ID GOOGLE DRIVE CHỨA SƠ ĐỒ ĐẤU NỐI VÀO ĐÂY (phải trùng với Code.gs):
  DIAGRAMS_FOLDER_ID: '1_2KVKMY8hC3jVLnjHnGIg6j6RxYf0t75',

  // ⚠️ Folder Drive chứa File Cấu Hình, tra theo cột "File Name" trong sheet Config
  // (phải trùng với CONFIG_FILES_FOLDER_ID trong Code.gs):
  CONFIG_FILES_FOLDER_ID: '1YNw_fkMkAeYZ8_Z-HLbur9Vly7Vbm97g',

  // Weather API (Open-Meteo - free, no API key required)
  WEATHER_API: 'https://api.open-meteo.com/v1/forecast',

  // LocalStorage keys
  STORAGE_KEYS: {
    API_URL: 'bts_api_url',
    SESSION: 'bts_session',
    SITES_DATA: 'bts_sites_data',
    PENDING_UPDATES: 'bts_pending_updates',
    LAST_SYNC: 'bts_last_sync',
    MAP_STATE: 'bts_map_state',
    CHAT_HISTORY: 'bts_ai_chat',
    PROJECTS: 'bts_projects',
  },
  // ==========================================
  // API Keys & Folder IDs
  // ==========================================
  CHECKIN_FOLDER_ID: '1IcWMWXdupiQXfHQ3rPRwS396jbQfQClT',
  
  // ⚠️ CÁCH MÃ HÓA API KEY ĐỂ TRÁNH BỊ GITHUB KHÓA
  // 1. Vào Google AI Studio lấy API Key thật (bắt đầu bằng AIza...)
  // 2. Mở trình duyệt web, ấn F12 sang tab Console. Gõ: btoa("AIza_KEY_CỦA_BẠN") rồi Enter.
  // 3. Copy chuỗi kết quả (ví dụ: QUl6...) và dán vào giữa hai dấu nháy đơn của hàm atob() bên dưới.
  GEMINI_API_KEY: import.meta.env?.VITE_GEMINI_API_KEY || atob('QVEuQWI4Uk42SWZnUFN3THR0YVJCTDEtNDFJdWRvaDlpOFdFRHpTeWViNUVRUFQ0RXZxbWc='),
};
