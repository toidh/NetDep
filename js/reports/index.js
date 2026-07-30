/**
 * NetDep - Báo cáo riêng theo dự án
 *
 * Phần lớn dự án chỉ cần khai `dashboard` trong registry (scope / groupBy / valueCards)
 * là đủ — Dashboard chung sẽ tự render đúng. File này dành cho trường hợp còn lại:
 * một dự án cần báo cáo khác hẳn, không diễn đạt nổi bằng cấu hình.
 *
 * CÁCH THÊM BÁO CÁO RIÊNG:
 *   1. Tạo file js/reports/<tên>.js, export một object có hàm
 *        renderDashboard(sites, dash) -> true nếu đã tự render xong
 *      `dash` là DashboardManager, dùng lại được các hàm sẵn có của nó.
 *   2. Thêm vào MODULES bên dưới:  'tên': () => import('./tên.js')
 *   3. Khai trong Config.gs của dự án:  reportModule: 'tên'
 *
 * Không khai `reportModule` thì mọi thứ chạy như cũ — file này không ảnh hưởng gì.
 *
 * Cố ý KHÔNG dùng import động theo biến (`import('./' + name + '.js')`) vì như vậy
 * sẽ không kiểm soát được tên file nào được nạp; liệt kê tường minh ở đây thì
 * nhìn một chỗ là biết dự án nào đang có báo cáo riêng.
 */
const MODULES = {
  // 'newsite': () => import('./newsite.js'),
};

const cache = {};

export const CustomReports = {
  /** Nạp sẵn module của dự án (nếu có) để lần render sau dùng được ngay. */
  async preload(name) {
    if (!name || !MODULES[name] || cache[name] !== undefined) return;
    try {
      const mod = await MODULES[name]();
      cache[name] = mod.default || mod.report || mod;
    } catch (e) {
      // Báo cáo riêng lỗi thì vẫn phải xem được Dashboard mặc định, không để trắng màn hình
      console.warn('[CustomReports] Không nạp được báo cáo riêng "' + name + '":', e.message);
      cache[name] = null;
    }
  },

  /**
   * Trả true nếu dự án có báo cáo riêng VÀ đã render xong (bên gọi dừng lại).
   * Trả false thì Dashboard mặc định chạy tiếp như bình thường.
   */
  renderDashboard(name, sites, dash) {
    if (!name) return false;
    const mod = cache[name];
    if (!mod) {
      // Chưa nạp xong: nạp nền rồi lần mở Dashboard sau sẽ dùng được
      this.preload(name);
      return false;
    }
    if (typeof mod.renderDashboard !== 'function') return false;
    try {
      return mod.renderDashboard(sites, dash) === true;
    } catch (e) {
      console.error('[CustomReports] Lỗi trong báo cáo riêng "' + name + '":', e);
      return false; // rơi về Dashboard mặc định thay vì hỏng cả màn hình
    }
  },
};
