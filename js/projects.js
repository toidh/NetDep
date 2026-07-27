/**
 * RF Mate - Project Registry (client)
 *
 * Danh sách dự án do BACKEND quyết định (Code.gs giữ registry gốc + phân quyền),
 * client chỉ lưu lại để render UI. Không khai báo dự án ở đây để tránh 2 nguồn sự thật.
 *
 * Thêm dự án mới = thêm 1 khối trong PROJECTS của Code.gs, không cần sửa file này.
 */

const CURRENT_KEY = 'bts_current_project';

// Dùng khi backend chưa deploy bản mới (chưa trả về danh sách dự án). Giữ app chạy
// đúng như trước thay vì hỏng trắng — quan trọng vì frontend (GitHub Pages) và
// backend (Apps Script) được deploy riêng, không cùng lúc.
const FALLBACK = {
  id: '5g',
  name: 'Triển khai 5G',
  short: '5G',
  icon: '🚀',
  progressField: 'Tiến độ 5G',
  progressOptions: ['Chưa hoàn thành', 'Đang thực hiện', 'Hoàn thành'],
  detailFields: ['Tiến độ 5G'],
  checkinEnabled: true,
};

export const Projects = {
  list: [FALLBACK],
  currentId: FALLBACK.id,

  /** Nhận danh sách dự án user được phép (từ login hoặc getProjects). */
  setList(projects) {
    this.list = (Array.isArray(projects) && projects.length) ? projects : [FALLBACK];

    // Giữ lại lựa chọn cũ nếu vẫn còn quyền, ngược lại về dự án đầu tiên.
    const saved = localStorage.getItem(CURRENT_KEY);
    const stillAllowed = saved && this.list.some(p => p.id === saved);
    this.currentId = stillAllowed ? saved : this.list[0].id;
    localStorage.setItem(CURRENT_KEY, this.currentId);
  },

  get(id) {
    return this.list.find(p => p.id === id) || this.list[0] || FALLBACK;
  },

  current() {
    return this.get(this.currentId);
  },

  setCurrent(id) {
    if (!this.list.some(p => p.id === id)) return false;
    this.currentId = id;
    localStorage.setItem(CURRENT_KEY, id);
    return true;
  },

  /** Chỉ có 1 dự án thì bỏ qua màn Tổng quan, vào thẳng bản đồ. */
  hasMultiple() {
    return this.list.length > 1;
  },

  // --- Đường tắt hay dùng, tránh rải `Projects.current().x` khắp code ---
  progressField() {
    return this.current().progressField || FALLBACK.progressField;
  },

  progressOptions() {
    const opts = this.current().progressOptions;
    return (Array.isArray(opts) && opts.length) ? opts : FALLBACK.progressOptions;
  },

  detailFields() {
    const f = this.current().detailFields;
    return Array.isArray(f) ? f : [];
  },

  checkinEnabled() {
    return this.current().checkinEnabled !== false;
  },
};
