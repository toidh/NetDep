/**
 * NetDep - Project Registry (client)
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

  /** Dự án cho phép gõ toạ độ vào ô tìm kiếm để bay tới điểm đó. */
  coordSearchEnabled() {
    return this.current().coordSearch === true;
  },

  /**
   * Chu kỳ tự tải lại dữ liệu (ms) của dự án đang xem, null = dùng mặc định app.
   * Dự án dữ liệu lớn ít thay đổi (doithu) khai refreshMinutes thưa hơn trong registry.
   */
  refreshIntervalMs() {
    const m = Number(this.current().refreshMinutes);
    return (isFinite(m) && m > 0) ? m * 60 * 1000 : null;
  },

  // ============================================================
  // Cấu hình Dashboard / báo cáo
  // ============================================================
  // Mỗi dự án có bộ cột khác nhau, nên Dashboard không được giả định cột nào
  // chắc chắn tồn tại. Toàn bộ quy tắc "cột này không có thì làm gì" gom vào đây
  // để dashboard.js/chart.js chỉ việc hỏi, không tự đoán mỗi nơi một kiểu.

  dashboardConfig() {
    return this.current().dashboard || {};
  },

  /** Cột có thật trong dữ liệu không (xét vài dòng đầu là đủ). */
  hasField(sites, field) {
    if (!field || !Array.isArray(sites) || !sites.length) return false;
    return sites.slice(0, 20).some(s => s && Object.prototype.hasOwnProperty.call(s, field));
  },

  /**
   * Lọc phạm vi thống kê theo `dashboard.scope`.
   * Cột khai trong scope mà sheet không có -> TRẢ NGUYÊN danh sách thay vì mảng rỗng.
   * Đây là điểm dễ sai nhất khi thêm dự án mới: lọc theo cột không tồn tại sẽ ra 0
   * trạm, Dashboard hiện toàn số 0 mà không có lỗi nào để lần ra.
   */
  scopeSites(sites) {
    const scope = this.dashboardConfig().scope;
    if (!scope || !scope.field || !Array.isArray(sites)) return sites || [];
    if (!this.hasField(sites, scope.field)) return sites;

    const want = String(scope.equals || '').trim().toLowerCase();
    if (!want) return sites;
    return sites.filter(s => String(s[scope.field] || '').trim().toLowerCase() === want);
  },

  /** Các cột dùng để lọc/nhóm — chỉ trả về cột thực sự có trong dữ liệu. */
  groupFields(sites) {
    const cfg = this.dashboardConfig();
    const wanted = Array.isArray(cfg.groupBy) && cfg.groupBy.length
      ? cfg.groupBy
      : ['Tỉnh mới', 'Đối tác'];
    return wanted.filter(f => this.hasField(sites, f)).slice(0, 2);
  },

  /** Thẻ đếm theo giá trị cột tiến độ (vd Chưa thuê / Phát sóng). */
  valueCards() {
    const c = this.dashboardConfig().valueCards;
    return Array.isArray(c) ? c : [];
  },

  /** Tên module báo cáo riêng, nếu dự án có khai. */
  reportModule() {
    return this.current().reportModule || null;
  },
};
