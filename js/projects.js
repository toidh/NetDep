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

  /**
   * Các dropdown lọc trên bản đồ (ngoài dropdown Tỉnh) — danh sách TÊN CỘT.
   * Tên đặc biệt 'Status' = lọc theo Trạng thái tính được (Hoàn thành / Đang thực
   * hiện / Chưa thực hiện), không phải theo cột nào trong sheet.
   *
   * Không khai = ['Danh sách'] để dự án 5G giữ nguyên bộ lọc Triển khai / Dự phòng.
   * Cột không có trong dữ liệu thì dropdown tự ẩn (xem MapManager.buildFilterControls),
   * nên dự án khác không còn hiện bộ lọc trống vô nghĩa như trước.
   */
  mapFilters() {
    const f = this.current().mapFilters;
    return Array.isArray(f) ? f : ['Danh sách'];
  },

  /**
   * Tên cột THẬT trong dữ liệu ứng với `name`, hoặc null nếu không có.
   *
   * Sheet tiêu đề 2 tầng (Newsite khai groupRow) bị ghép tên thành "Nhóm - Tên cột",
   * nên tra thẳng site['Tình trạng thuê'] luôn ra rỗng dù sheet có cột đó. Khớp
   * theo hậu tố để khai trong registry vẫn viết tên cột như người dùng nhìn thấy.
   */
  resolveField(sites, name) {
    if (!name) return null;
    const rows = Array.isArray(sites) ? sites.slice(0, 20) : [sites];
    const norm = (s) => String(s).toLowerCase().normalize('NFC').replace(/\s+/g, '');
    const want = norm(name);

    for (const row of rows) {
      if (!row) continue;
      const keys = Object.keys(row);
      const hit = keys.find(k => norm(k) === want)
               || keys.find(k => norm(k).endsWith('-' + want));
      if (hit) return hit;
    }
    return null;
  },

  /** Mọi cột tiến độ cập nhật được của dự án (1 dropdown mỗi cột trong modal). */
  progressFields() {
    const f = this.current().progressFields;
    return (Array.isArray(f) && f.length) ? f : [this.progressField()];
  },

  checkinEnabled() {
    return this.current().checkinEnabled !== false;
  },

  /** Dự án có dùng khối Liên hệ (Đội/FT/TKTU) trong modal chi tiết trạm không. */
  contactEnabled() {
    return this.current().contactEnabled !== false;
  },

  /**
   * Khối `name` trong modal chi tiết trạm có hiện không (registry `modalSections`).
   * Mặc định hiện; chỉ khai `false` cho khối mà dự án không dùng — CSDL chỉ cần dropdown
   * tiến độ nên ẩn gần hết. Khối Liên hệ vẫn dùng `contactEnabled` riêng như trước.
   */
  modalSection(name) {
    const cfg = this.current().modalSections;
    return !cfg || cfg[name] !== false;
  },

  /** Danh sách ảnh nên chụp khi đi kiểm tra, hiện trong modal chi tiết trạm. */
  photoHints() {
    const h = this.current().photoHints;
    return Array.isArray(h) ? h.filter(x => String(x || '').trim()) : [];
  },

  /** Cột trong sheet để lưu link ảnh FT tải lên; '' = dự án không dùng. */
  photoColumn() {
    return String(this.current().photoColumn || '').trim();
  },

  /**
   * Role `role` có được sửa dữ liệu của dự án đang xem không.
   * admin/manager sửa mọi dự án; role khác chỉ khi dự án khai trong `editRoles`
   * (FT sửa được ở CSDL nhưng không đụng được dự án khác).
   * ⚠️ Đây chỉ để ẩn/hiện nút — backend kiểm tra lại theo Users, đừng bỏ bước đó.
   */
  canEdit(role) {
    const r = String(role || '').trim().toLowerCase();
    if (r === 'admin' || r === 'manager') return true;
    const extra = this.current().editRoles;
    return Array.isArray(extra) && extra.some(x => String(x).trim().toLowerCase() === r);
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
