import { AppConfig } from './config.js';
import { Storage } from './storage.js';
import { Projects } from './projects.js';
/**
 * BTS Progress Tracker - Data & API Module
 */
export const DataService = {
  // ============================================================
  // API Communication
  // ============================================================
  async apiCall(params, method = 'GET', body = null) {
    const apiUrl = Storage.getApiUrl();
    if (!apiUrl) {
      throw new Error('API URL chưa được cấu hình');
    }

    try {
      let response;
      if (method === 'GET') {
        const queryString = new URLSearchParams(params).toString();
        response = await fetch(`${apiUrl}?${queryString}`, {
          method: 'GET',
          redirect: 'follow',
        });
      } else {
        response = await fetch(apiUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ ...body, apiSecret: AppConfig.API_SECRET }),
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[DataService] API call failed:', error);
      throw error;
    }
  },

  // ============================================================
  // Authentication
  // ============================================================
  async login(username, password) {
    const result = await this.apiCall({
      action: 'login',
      username: username,
      password: password,
    });
    return result;
  },

  /**
   * Lấy danh sách dự án user được phép vào. Backend là nơi quyết định (đọc cột
   * "Phân quyền dự án" ở sheet Users), client không tự suy ra.
   * Trả mảng rỗng nếu backend cũ chưa hỗ trợ — Projects.setList() sẽ tự fallback.
   */
  async fetchProjects() {
    try {
      const result = await this.apiCall({
        action: 'getProjects',
        username: Storage.getSession()?.username,
      });
      return (result && result.success && Array.isArray(result.projects)) ? result.projects : [];
    } catch (error) {
      console.warn('[DataService] fetchProjects failed:', error.message);
      return [];
    }
  },

  // ============================================================
  // Fetch Sites
  // ============================================================
  async fetchSites() {
    try {
      const result = await this.apiCall({
        action: 'getSites',
        project: Projects.currentId,
        username: Storage.getSession()?.username,
        pro: Storage.getSession()?.pro,
        role: Storage.getSession()?.role,
      });
      if (result.success) {
        Storage.setSitesData(result.sites);
        Storage.setLastSync();
        return result.sites;
      }
      throw new Error(result.error || 'Failed to fetch sites');
    } catch (error) {
      // Fallback to cached data
      console.warn('[DataService] Fetch failed, using cache:', error.message);
      const cached = Storage.getSitesData();
      if (cached && cached.sites) {
        return cached.sites;
      }
      throw error;
    }
  },

  // ============================================================
  // Fetch Sectors
  // ============================================================
  async fetchSectors() {
    try {
      const result = await this.apiCall({ action: 'getSectors', pro: Storage.getSession()?.pro, role: Storage.getSession()?.role });
      if (result.success) {
        return result.sectors || [];
      }
      return [];
    } catch (error) {
      console.warn('[DataService] Fetch sectors failed:', error.message);
      return [];
    }
  },

  async updateSector(sectorData) {
    try {
      const result = await this.apiCall(null, 'POST', {
        action: 'updateSector',
        site: sectorData.site,
        cell: sectorData.cell,
        tech: sectorData.tech,
        azimuth: sectorData.azimuth,
        tiltCo: sectorData.tiltCo,
        tiltDien: sectorData.tiltDien,
        doCaoCot: sectorData.doCaoCot,
        doCaoChanCot: sectorData.doCaoChanCot,
        cauHinhMoi: sectorData.cauHinhMoi,
        doCaoMatDat: sectorData.doCaoMatDat,
        doCaoGPSChanCot: sectorData.doCaoGPSChanCot,
        username: sectorData.username
      });
      return result;
    } catch (e) {
      console.error('Update sector failed', e);
      return {success: false, message: e.message};
    }
  },

  async updateSiteField(siteData) {
    try {
      const result = await this.apiCall(null, 'POST', {
        action: 'updateSiteField',
        site: siteData.site,
        field: siteData.field,
        value: siteData.value,
        username: siteData.username
      });
      return result;
    } catch (e) {
      console.error('Update site field failed', e);
      return { success: false, message: e.message };
    }
  },

  // ============================================================
  // Update Progress
  // ============================================================
  async updateProgress(siteData) {
    try {
      const result = await this.apiCall(null, 'POST', {
        action: 'updateProgress',
        project: Projects.currentId,
        site: siteData.site,
        progressValue: siteData.progressValue,
        note: siteData.note,
        username: siteData.username,
      });

      if (result.success) {
        // Remove from pending if exists
        Storage.removePendingUpdate(siteData.site);

        // Update local cache
        this.updateLocalCache(siteData);
      }

      return result;
    } catch (error) {
      console.warn('[DataService] Update failed, saving offline:', error.message);
      // Save for offline sync — kèm project để khi đồng bộ lại backend biết ghi vào
      // sheet nào (user có thể đã đổi sang dự án khác trước khi có mạng trở lại).
      Storage.addPendingUpdate({
        ...siteData,
        project: Projects.currentId,
        savedAt: new Date().toISOString(),
      });

      // Still update local cache
      this.updateLocalCache(siteData);

      return {
        success: true,
        offline: true,
        message: 'Đã lưu offline. Sẽ đồng bộ khi có mạng.',
      };
    }
  },

  // ============================================================
  // Sync Pending Updates
  // ============================================================
  async syncPendingUpdates() {
    const pending = Storage.getPendingUpdates();
    if (pending.length === 0) return { synced: 0 };

    try {
      const result = await this.apiCall(null, 'POST', {
        action: 'batchUpdate',
        updates: pending,
      });

      if (result.success) {
        Storage.clearPendingUpdates();
        return { synced: pending.length, ...result };
      }
      return { synced: 0, error: result.message };
    } catch (error) {
      return { synced: 0, error: error.message };
    }
  },

  // ============================================================
  // Status — NGUỒN DUY NHẤT phía client
  // ============================================================
  // Suy ra cột Status từ giá trị tiến độ của dự án đang xem. Phải khớp computeStatus()
  // trong Code.gs. Trước đây quy tắc này bị chép ra 4 nơi (2 trong Code.gs, app.js,
  // data.js) và đã lệch nhau, gây lỗi "marker đỏ rồi mất". Sửa quy tắc chỉ sửa ở đây.
  computeStatus(progressValue) {
    const v = String(progressValue || '').trim();
    if (v === 'Hoàn thành') return 'Hoàn thành';
    if (v === 'Đang thực hiện') return 'Đang thực hiện';
    return 'Chưa thực hiện';
  },

  // ============================================================
  // Local Cache Management
  // ============================================================
  updateLocalCache(siteData) {
    const cached = Storage.getSitesData();
    if (!cached || !cached.sites) return;

    const sites = cached.sites;
    const index = sites.findIndex(s => s['Site'] === siteData.site);
    if (index < 0) return;

    const field = Projects.progressField();
    sites[index][field] = siteData.progressValue;
    sites[index]['Ghi chú (TKTU ONSITE)'] = siteData.note || '';
    sites[index]['User cập nhật'] = siteData.username || '';
    sites[index]['Ngày cập nhật'] = new Date().toLocaleString('vi-VN');
    sites[index]['Status'] = this.computeStatus(siteData.progressValue);

    Storage.setSitesData(sites);
  },

  // ============================================================
  // Helper: Get site status for coloring
  // ============================================================
  getSiteStatus(site) {
    if (!site) return 'default';

    let statusCol = site['status'] || site['Status'] || site['STATUS'] || site['Trạng thái'];
    if (statusCol) {
      statusCol = String(statusCol).trim().toLowerCase();
      if (statusCol === 'hoàn thành' || statusCol === 'completed') {
        return 'completed';
      }
      if (statusCol === 'đang thực hiện' || statusCol === 'in_progress') {
        return 'in_progress';
      }
    }

    const danhSach = String(site['Danh sách'] || '').trim().toLowerCase();
    if (danhSach === 'triển khai') return 'trien_khai';
    if (danhSach === 'dự phòng') return 'du_phong';

    return 'default';
  },

  // ============================================================
  // Helper: Check if site is in today's daily plan
  // ============================================================
  isDailyPlan(site) {
    const dateVal = site['Kế hoạch ngày'];
    if (!dateVal) return false;
    const str = String(dateVal).trim();
    if (!str) return false;

    const today = new Date();
    const todayDay = today.getDate();
    const todayMonth = today.getMonth();
    const todayYear = today.getFullYear();

    // Try dd/MM/yyyy
    let m1 = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (m1) {
      return parseInt(m1[1]) === todayDay && parseInt(m1[2]) === (todayMonth + 1) && parseInt(m1[3]) === todayYear;
    }

    // Try yyyy-MM-dd
    let m2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m2) {
      return parseInt(m2[3]) === todayDay && parseInt(m2[2]) === (todayMonth + 1) && parseInt(m2[1]) === todayYear;
    }

    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.getDate() === todayDay && d.getMonth() === todayMonth && d.getFullYear() === todayYear;
      }
    } catch (e) {}

    return false;
  },

  getStatusColor(status, site) {
    // Completed = green
    if (status === 'completed') return '#16a34a';
    // In progress = red
    if (status === 'in_progress') return '#dc2626';

    if (site) {
      const danhSach = String(site['Danh sách'] || '').trim().toLowerCase();
      if (danhSach === 'triển khai') return AppConfig.COLORS.TRIEN_KHAI;
      if (danhSach === 'dự phòng') return AppConfig.COLORS.DU_PHONG;
    }
    switch (status) {
      case 'trien_khai': return AppConfig.COLORS.TRIEN_KHAI;
      case 'du_phong': return AppConfig.COLORS.DU_PHONG;
      default: return AppConfig.COLORS.DEFAULT;
    }
  },

  getStatusLabel(status, site) {
    if (status === 'completed' && site) return site['Danh sách'] || 'Hoàn thành';
    if (status === 'in_progress' && site) return site['Danh sách'] || 'Đang thực hiện';
    switch (status) {
      case 'trien_khai': return 'Triển khai';
      case 'du_phong': return 'Dự phòng';
      case 'completed': return 'Hoàn thành';
      case 'in_progress': return 'Đang thực hiện';
      default: return 'Khác';
    }
  },

  // ============================================================
  // Test API connection
  // ============================================================
  async testConnection() {
    try {
      const result = await this.apiCall({ action: 'ping' });
      return result.success === true;
    } catch (error) {
      return false;
    }
  },

  // ============================================================
  // SEARCH SITE ONLINE & DICTIONARY
  // ============================================================
  async searchSiteOnline(siteName) {
    try {
      const result = await this.apiCall({ action: 'searchSiteOnline', site: siteName, pro: Storage.getSession()?.pro, role: Storage.getSession()?.role });
      return result;
    } catch (e) {
      console.error('Lỗi khi tìm kiếm trạm online:', e);
      return { success: false, error: e.message };
    }
  },

  async fetchSiteDictionary() {
    try {
      const result = await this.apiCall({ action: 'getSiteDictionary', pro: Storage.getSession()?.pro, role: Storage.getSession()?.role });
      if (result.success && result.dictionary) {
        return result.dictionary;
      } else {
        console.error('API Error in getSiteDictionary:', result.error);
        alert('Lỗi lấy từ điển trạm từ máy chủ: ' + (result.error || result.message || 'Lỗi không xác định. Vui lòng kiểm tra lại tên Sheet "Map_data" và cột "Site".'));
        return [];
      }
    } catch (e) {
      console.error('Network Error in getSiteDictionary:', e);
      alert('Lỗi mạng khi lấy từ điển: ' + e.message);
      return [];
    }
  },

  async getFileImage(fileId) {
    try {
      return await this.apiCall({ action: 'getFileImage', fileId });
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // ============================================================
  // CHECK-IN, COMMENTS, AND AI
  // ============================================================
  async checkinSite(data) {
    try {
      const result = await this.apiCall(null, 'POST', { action: 'checkinSite', project: Projects.currentId, ...data });
      return result;
    } catch (error) {
      console.error('[DataService] checkinSite failed:', error);
      return { success: false, error: error.message };
    }
  },

  async getComments(siteName) {
    try {
      const result = await this.apiCall({ action: 'getComments', site: siteName });
      return result.success ? result.comments : [];
    } catch (error) {
      console.error('[DataService] getComments failed:', error);
      return [];
    }
  },

  async addComment(data) {
    try {
      const result = await this.apiCall(null, 'POST', { action: 'addComment', ...data });
      return result;
    } catch (error) {
      console.error('[DataService] addComment failed:', error);
      return { success: false, error: error.message };
    }
  },

  async uploadPhoto(data) {
    try {
      const result = await this.apiCall(null, 'POST', { action: 'uploadPhoto', ...data });
      return result;
    } catch (error) {
      console.error('[DataService] uploadPhoto failed:', error);
      return { success: false, error: error.message };
    }
  },

  async getAIKnowledge() {
    try {
      const cachedText = localStorage.getItem('bts_ai_knowledge_text');
      const cachedHash = cachedText ? (localStorage.getItem('bts_ai_knowledge_hash') || '') : '';
      const result = await Promise.race([
        this.apiCall({ action: 'getAIKnowledge', cachedHash: cachedHash }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout: Server xử lý quá lâu (có thể do đang đọc file PDF lớn)")), 15000))
      ]);
      return result;
    } catch (error) {
      console.error('[DataService] getAIKnowledge failed:', error);
      return { success: false, error: error.message };
    }
  }
};

window.DataService = DataService;
