import { AppConfig } from './config.js';
import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { DataService } from './data.js';
import { Projects } from './projects.js';
import { MapManager } from './map.js';
import { DashboardManager } from './dashboard.js';
import { ChartManager } from './chart.js';

/**
 * BTS Progress Tracker - Main Application Controller
 */
export const App = {
  sites: [],
  refreshInterval: null,
  isOnline: navigator.onLine,

  // ============================================================
  // Initialize App
  // ============================================================
  async init() {
    if (window.AIAssistant) { window.AIAssistant.init(); }

    // Register service worker
    this.registerSW();

    // Online/offline detection
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // API URL được cấu hình sẵn trong config.js, vào thẳng app
    // Check login status
    if (Auth.isLoggedIn()) {
      // Phiên cũ khôi phục từ localStorage — nạp lại danh sách dự án được phép,
      // phòng trường hợp quyền đã bị đổi trên sheet Users kể từ lần đăng nhập trước.
      Projects.setList(Storage.getProjects());
      DataService.fetchProjects().then(list => {
        if (list.length) {
          Projects.setList(list);
          Storage.setProjects(list);
          this.renderProjectChip();
        }
      });
      await this.enterAfterAuth();
    } else {
      this.showScreen('login-screen');
    }

    // Setup event listeners
    this.setupEventListeners();
  },

  // ============================================================
  // Điều hướng sau khi xác thực
  // ============================================================
  // Nhiều dự án → vào màn Tổng quan để chọn. Chỉ 1 dự án → vào thẳng bản đồ,
  // không bắt người dùng bấm thừa một bước.
  async enterAfterAuth() {
    if (Projects.hasMultiple()) {
      this.showOverviewScreen();
    } else {
      await this.enterMainScreen();
    }
  },

  // ============================================================
  // Chuyển dự án (chip + bottom sheet)
  // ============================================================
  renderProjectChip() {
    const chip = document.getElementById('project-chip');
    if (!chip) return;

    const p = Projects.current();
    document.getElementById('project-chip-icon').textContent = p.icon || '📁';
    // Tên ngắn trên chip để ô tìm kiếm còn đủ rộng dùng được trên điện thoại
    document.getElementById('project-chip-name').textContent = p.short || p.name || '';
    // Chỉ 1 dự án thì chip vô nghĩa, ẩn đi để nhường chỗ cho ô tìm kiếm
    chip.classList.toggle('single', !Projects.hasMultiple());
  },

  openProjectSheet() {
    const list = document.getElementById('project-sheet-list');
    if (!list) return;

    list.innerHTML = Projects.list.map(p => {
      const active = p.id === Projects.currentId;
      return `<button type="button" class="project-item${active ? ' active' : ''}" onclick="App.switchProject('${p.id}')">
        <span class="project-item-icon">${p.icon || '📁'}</span>
        <span class="project-item-name">${p.name}</span>
        ${active ? '<span class="project-item-check">✓</span>' : ''}
      </button>`;
    }).join('');

    document.getElementById('project-sheet-overlay').classList.add('visible');
  },

  closeProjectSheet() {
    const el = document.getElementById('project-sheet-overlay');
    if (el) el.classList.remove('visible');
  },

  /** Đổi dự án: tải lại toàn bộ dữ liệu vì mỗi dự án là một sheet riêng. */
  async switchProject(projectId) {
    this.closeProjectSheet();
    if (projectId === Projects.currentId) return;
    if (!Projects.setCurrent(projectId)) return;

    this.renderProjectChip();

    // Dữ liệu của dự án cũ không còn đúng nữa — xoá trước khi tải cái mới để
    // không có khoảnh khắc bản đồ hiện trạm của dự án cũ dưới tên dự án mới.
    this.sites = [];
    Storage.setSitesData([]);

    this.showLoading('Đang tải dự án ' + Projects.current().name + '...');
    try {
      await this.loadProjectData();
      this.showToast(Projects.current().icon + ' ' + Projects.current().name, 'success');
    } catch (error) {
      this.showToast('Không tải được dự án: ' + error.message, 'error');
    }
    this.hideLoading();
  },

  // ============================================================
  // Màn hình Tổng quan dự án
  // ============================================================
  showOverviewScreen() {
    // Chỉ 1 dự án thì màn này không có gì để chọn — bỏ qua
    if (!Projects.hasMultiple()) return;

    const nameEl = document.getElementById('overview-user-name');
    if (nameEl) nameEl.textContent = Auth.getDisplayName();

    const grid = document.getElementById('overview-grid');
    if (grid) {
      grid.innerHTML = Projects.list.map(p => `
        <button type="button" class="overview-card" onclick="App.enterProject('${p.id}')">
          <span class="overview-card-icon">${p.icon || '📁'}</span>
          <span class="overview-card-name">${p.name}</span>
        </button>
      `).join('');
    }

    this.showScreen('overview-screen');
  },

  /** Bấm thẻ ở màn Tổng quan → vào bản đồ của dự án đó. */
  async enterProject(projectId) {
    Projects.setCurrent(projectId);
    await this.enterMainScreen();
  },

  // ============================================================
  // Service Worker Registration
  // ============================================================
  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
        console.log('[App] Service Worker registered');
        
        // Auto check for updates when page becomes visible
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update();
          }
        });
      }).catch((err) => {
        console.warn('[App] SW registration failed:', err);
      });

      // Reload page when new service worker takes over
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          this.showToast('🔄 Đã phát hiện phiên bản mới, đang tự động xóa cache và tải lại...', 'success');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        }
      });
    }
  },

  // ============================================================
  // Event Listeners
  // ============================================================
  setupEventListeners() {
    // === Setup Screen ===
    const setupForm = document.getElementById('setup-form');
    if (setupForm) {
      setupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSetup();
      });
    }

    // === Login Form ===
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // === Search ===
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
      
      searchInput.addEventListener('focus', () => {
        document.getElementById('search-results').classList.add('visible');
      });
      // Close search on outside click
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#search-container')) {
          document.getElementById('search-results').classList.remove('visible');
        }
      });
    }

    // === GPS Button ===
    const gpsBtn = document.getElementById('gps-btn');
    if (gpsBtn) {
      gpsBtn.addEventListener('click', () => this.handleGPS());
    }

    // === Layer Toggle ===
    const layerBtn = document.getElementById('layer-btn');
    if (layerBtn) {
      layerBtn.addEventListener('click', () => this.handleLayerToggle());
    }

    // === Refresh Button ===
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.handleRefresh());
    }

    // === Dashboard Button ===
    const dashBtn = document.getElementById('dashboard-btn');
    if (dashBtn) {
      dashBtn.addEventListener('click', () => this.openDashboard());
    }

    const dashCloseBtn = document.getElementById('dashboard-close-btn');
    if (dashCloseBtn) {
      dashCloseBtn.addEventListener('click', () => this.closeDashboard());
    }

    // === Checkin Report Feature ===
    const checkinReportBtn = document.getElementById('checkin-report-btn');
    if (checkinReportBtn) {
      checkinReportBtn.addEventListener('click', () => {
        if (['doitac', 'view', 'view_limited'].includes(Auth.getRole())) {
          return this.showToast('Tài khoản của bạn không có quyền xem Report Check-in', 'error');
        }
        if (window.CheckinReport) {
          window.CheckinReport.openCheckinReport();
        }
      });
    }

    // === Checkin Feature (in popup) ===
    const detailCheckinBtn = document.getElementById('detail-checkin-btn');
    if (detailCheckinBtn) {
      detailCheckinBtn.addEventListener('click', () => {
        const cameraInput = document.getElementById('checkin-camera');
        if (cameraInput) cameraInput.click();
      });
    }
    const checkinCamera = document.getElementById('checkin-camera');
    if (checkinCamera) {
      checkinCamera.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.processCheckinPhoto(e.target.files[0]);
        }
      });
    }

    // === User Menu ===
    const userMenuBtn = document.getElementById('user-menu-btn');
    if (userMenuBtn) {
      userMenuBtn.addEventListener('click', () => this.toggleUserMenu());
    }

    // === Logout ===
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }
    const overviewLogoutBtn = document.getElementById('overview-logout-btn');
    if (overviewLogoutBtn) {
      overviewLogoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // === Modal Close ===
    const modalOverlay = document.getElementById('site-modal-overlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) this.closeSiteModal();
      });
    }

    // Modals
    document.getElementById('modal-close-btn')?.addEventListener('click', () => this.closeSiteDetail());
    document.getElementById('navigate-btn')?.addEventListener('click', () => this.handleNavigate());
    document.getElementById('update-form')?.addEventListener('submit', (e) => this.handleUpdateProgress(e));

    document.getElementById('compass-btn')?.addEventListener('click', () => {
      if (window.CompassAR && this.currentSiteSectors) {
        window.CompassAR.openCompass(this.currentSiteSectors, this.currentSite);
      } 
    });

    document.getElementById('comment-submit')?.addEventListener('click', () => this.submitComment());

    document.getElementById('ai-assistant-btn')?.addEventListener('click', () => {
      if (window.AIAssistant) window.AIAssistant.openChat();
    });

    // === Settings ===
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.showSettings());
    }

    // Close user menu on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#user-menu-container')) {
        const menu = document.getElementById('user-dropdown');
        if (menu) menu.classList.remove('visible');
      }
    });
  },

  // ============================================================
  // Screen Management
  // ============================================================
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
  },

  // ============================================================
  // Setup Handler
  // ============================================================
  async handleSetup() {
    const urlInput = document.getElementById('api-url-input');
    const url = urlInput.value.trim();
    const errorEl = document.getElementById('setup-error');

    if (!url) {
      errorEl.textContent = 'Vui lòng nhập URL';
      errorEl.classList.add('visible');
      return;
    }

    this.showLoading('Đang kiểm tra kết nối...');
    Storage.setApiUrl(url);

    try {
      const connected = await DataService.testConnection();
      if (connected) {
        this.hideLoading();
        this.showScreen('login-screen');
        this.showToast('Kết nối thành công!', 'success');
      } else {
        throw new Error('Server không phản hồi');
      }
    } catch (error) {
      this.hideLoading();
      errorEl.textContent = 'Không thể kết nối: ' + error.message;
      errorEl.classList.add('visible');
      Storage.setApiUrl('');
    }
  },

  // ============================================================
  // Login Handler
  // ============================================================
  async handleLogin() {
    const username = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value.trim();
    const errorEl = document.getElementById('login-error');

    if (!username || !password) {
      errorEl.textContent = 'Vui lòng nhập đầy đủ thông tin';
      errorEl.classList.add('visible');
      return;
    }

    this.showLoading('Đang đăng nhập...');
    errorEl.classList.remove('visible');

    try {
      const result = await Auth.login(username, password);
      this.hideLoading();

      if (result.success) {
        if (!result.user || result.user.backendVersion !== 'v31') {
          alert('CẢNH BÁO: Ứng dụng đang gọi đến phiên bản Code.gs cũ! Bạn CẦN Deploy phiên bản Code mới nhất trên Apps Script VÀ đảm bảo bạn không tạo New Deployment mới khiến URL thay đổi.');
        }
        // Danh sách dự án được phép do backend quyết định và gửi kèm ngay khi đăng nhập
        Projects.setList(result.projects);
        Storage.setProjects(result.projects || []);

        this.showToast(`Xin chào, ${Auth.getDisplayName()}!`, 'success');
        await this.enterAfterAuth();
      } else {
        errorEl.textContent = result.message || 'Đăng nhập thất bại';
        errorEl.classList.add('visible');
        this.shakeElement(document.getElementById('login-form'));
      }
    } catch (error) {
      this.hideLoading();
      errorEl.textContent = 'Lỗi kết nối: ' + error.message;
      errorEl.classList.add('visible');
    }
  },

  // ============================================================
  // Enter Main Screen
  // ============================================================
  async enterMainScreen() {
    document.body.dataset.role = Auth.getRole();
    this.showScreen('main-screen');

    // Update user display
    const userNameEl = document.getElementById('user-display-name');
    if (userNameEl) {
      userNameEl.textContent = Auth.getDisplayName();
    }
    this.renderProjectChip();

    // Mục "Tổng quan dự án" trong menu chỉ có nghĩa khi có nhiều hơn 1 dự án
    const overviewBtn = document.getElementById('overview-btn');
    if (overviewBtn) overviewBtn.style.display = Projects.hasMultiple() ? '' : 'none';

    // Initialize map
    if (!MapManager.map) {
      MapManager.init();
    }

    // Load data
    this.showLoading('Đang tải dữ liệu...');
    try {
      await this.loadProjectData();
      this.hideLoading();
    } catch (error) {
      this.hideLoading();
      console.error('[App] Failed to load data:', error);
      this.showToast('Lỗi tải dữ liệu: ' + error.message, 'error');
    }

    // Auto refresh
    this.startAutoRefresh();

    // Start GPS watch
    MapManager.startWatchingPosition();
  },

  // Tải dữ liệu của dự án đang chọn. Tách riêng để dùng lại khi đổi dự án
  // (switchProject) thay vì chép lại toàn bộ luồng.
  async loadProjectData() {
    if (!['view_limited', 'doitac'].includes(Auth.getRole())) {
      this.sites = await DataService.fetchSites();
      MapManager.loadSites(this.sites);
      this.updateStats();
      DataService.fetchSectors().then(sectors => MapManager.loadSectors(sectors));
    } else {
      // Online-only view limited
      this.sites = [];
      this.siteDictionary = await DataService.fetchSiteDictionary();
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.placeholder = 'Nhập mã trạm để tìm kiếm...';
      }
    }

    // Sync pending updates
    const pending = Storage.getPendingUpdates();
    if (pending.length > 0 && this.isOnline) {
      const syncResult = await DataService.syncPendingUpdates();
      if (syncResult.synced > 0) {
        this.showToast(`Đã đồng bộ ${syncResult.synced} cập nhật offline`, 'success');
        this.sites = await DataService.fetchSites();
        if (!['view_limited', 'doitac'].includes(Auth.getRole())) {
          MapManager.loadSites(this.sites);
        }
      }
    }
  },

  // ============================================================
  // Search Handlers
  // ============================================================
  async searchOnline(query) {
    query = query.trim();
    if (!query) return;
    this.showLoading('Đang tìm kiếm online...');
    try {
      const result = await DataService.searchSiteOnline(query);
      this.hideLoading();
      if (result.success && result.site) {
        this.sites = [result.site];
        MapManager.loadSingleSite(result.site);
        if (result.sectors) {
          MapManager.setSectorData(result.sectors);
          MapManager.loadSectorsForSite(result.site['Site']);
        }
        document.getElementById('search-results').classList.remove('visible');
        this.showToast('Đã tìm thấy trạm', 'success');
      } else {
        this.showToast(result.error || 'Không tìm thấy trạm', 'error');
      }
    } catch (e) {
      this.hideLoading();
      this.showToast('Lỗi tìm kiếm: ' + e.message, 'error');
    }
  },

  handleSearch(query) {
    const resultsEl = document.getElementById('search-results');
    if (!query || query.length < 1) {
      resultsEl.innerHTML = '';
      resultsEl.classList.remove('visible');
      return;
    }

    const q = query.toLowerCase();
    
    // View Limited Role uses Site Dictionary for fast autocomplete
    if (['view_limited', 'doitac'].includes(Auth.getRole())) {
      const dict = this.siteDictionary || [];
      const matches = dict.filter(name => name.toLowerCase().includes(q)).slice(0, 10);
      
      if (matches.length === 0) {
        resultsEl.innerHTML = '<div class="search-no-result">Không tìm thấy trạm nào</div>';
        resultsEl.classList.add('visible');
        return;
      }
      
      resultsEl.innerHTML = matches.map(siteName => {
        return `
          <div class="search-result-item" onclick="App.selectSearchResult('${siteName}')">
            <div class="search-result-dot" style="background:var(--color-blue)"></div>
            <div class="search-result-info">
              <div class="search-result-name">${siteName}</div>
              <div class="search-result-detail">Nhấn để tải dữ liệu trạm này</div>
            </div>
          </div>
        `;
      }).join('');
      resultsEl.classList.add('visible');
      return;
    }

    // Admin/Manager Role uses local full data
    const matches = this.sites.filter((s) => {
      const siteName = (s['Site'] || '').toLowerCase();
      const huyen = (s['Huyện'] || '').toLowerCase();
      const doiTac = (s['Đối tác'] || '').toLowerCase();
      return siteName.includes(q) || huyen.includes(q) || doiTac.includes(q);
    }).slice(0, 10);

    if (matches.length === 0) {
      resultsEl.innerHTML = '<div class="search-no-result">Không tìm thấy trạm nào</div>';
      resultsEl.classList.add('visible');
      return;
    }

    resultsEl.innerHTML = matches.map((site) => {
      const status = DataService.getSiteStatus(site);
      const color = DataService.getStatusColor(status, site);
      const danhSach = site['Danh sách'] || 'Khác';
      return `
        <div class="search-result-item" onclick="App.selectSearchResult('${site['Site']}')">
          <div class="search-result-dot" style="background:${color}"></div>
          <div class="search-result-info">
            <div class="search-result-name">${site['Site']}</div>
            <div class="search-result-detail">${site['Huyện'] || ''} - ${danhSach}</div>
          </div>
        </div>
      `;
    }).join('');
    resultsEl.classList.add('visible');
  },

  selectSearchResult(siteName) {
    document.getElementById('search-input').value = siteName;
    document.getElementById('search-results').classList.remove('visible');

    // view_limited: fetch full data online and load it
    if (['view_limited', 'doitac'].includes(Auth.getRole())) {
      this.searchOnline(siteName);
    } else {
      MapManager.flyToSite(siteName);
    }
  },

  // ============================================================
  // GPS Handler
  // ============================================================
  async handleGPS() {
    const btn = document.getElementById('gps-btn');
    btn.classList.add('loading');

    try {
      await MapManager.getCurrentLocation();
      btn.classList.remove('loading');
      btn.classList.add('active');
      this.showToast('Đã xác định vị trí của bạn', 'success');
    } catch (error) {
      btn.classList.remove('loading');
      if (error.message !== 'Hết thời gian chờ vị trí') {
        this.showToast(error.message, 'error');
      }
    }
  },

  // ============================================================
  // Layer Toggle
  // ============================================================
  handleLayerToggle() {
    const layer = MapManager.toggleLayer();
    const btn = document.getElementById('layer-btn');
    const icon = btn.querySelector('.layer-icon');

    if (layer === 'satellite') {
      btn.classList.add('satellite');
      if (icon) icon.textContent = '🗺️';
    } else {
      btn.classList.remove('satellite');
      if (icon) icon.textContent = '🛰️';
    }
  },

  // ============================================================
  // Show Site Detail Modal
  // ============================================================
  showSiteDetail(site) {
    const modal = document.getElementById('site-modal-overlay');
    const status = DataService.getSiteStatus(site);
    const color = DataService.getStatusColor(status, site);
    const statusLabel = DataService.getStatusLabel(status, site);

    // Populate modal
    document.getElementById('modal-site-name').textContent = site['Site'] || '';
    document.getElementById('modal-site-name').style.color = color;
    document.getElementById('modal-status-badge').textContent = statusLabel;
    document.getElementById('modal-status-badge').style.background = color + '20';
    document.getElementById('modal-status-badge').style.color = color;

    // Info fields
    const canEdit = ['admin', 'manager'].includes(Auth.getRole());
    
    // Only Phân loại is editable as requested
    const phanLoaiVal = site['Danh sách'] || site['Phân loại'] || '-';
    const phanLoaiEl = document.getElementById('modal-phan-loai');
    if (phanLoaiEl) {
      if (canEdit) {
        phanLoaiEl.innerHTML = `${phanLoaiVal} <span id="btn-edit-phanloai" style="cursor:pointer;opacity:0.8;font-size:12px;margin-left:4px;" title="Sửa Phân loại">✏️</span>`;
        document.getElementById('btn-edit-phanloai')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.editSiteField(site['Site'], 'Danh sách', 'Phân loại', phanLoaiVal);
        });
      } else {
        phanLoaiEl.textContent = phanLoaiVal;
      }
    }

    document.getElementById('modal-huyen').textContent = site['Phường xã'] || site['Huyện'] || '-';
    document.getElementById('modal-doi-tac').textContent = site['Đối tác'] || '-';
    document.getElementById('modal-doi-thuc-hien').textContent = site['Đội thực hiện'] || '-';
    document.getElementById('modal-sdt').textContent = site['SĐT'] || '-';
    document.getElementById('modal-ft').textContent = site['FT'] || '-';
    document.getElementById('modal-sdt-ft').textContent = site['SĐT FT'] || '-';
    document.getElementById('modal-tktu').textContent = site['TKTU'] || site['TKTU ONSITE'] || '-';
    document.getElementById('modal-sdt-tktu').textContent = site['SĐT TKTU'] || site['SĐT TKTU ONSITE'] || '-';
    const noteValTktu = site['NOTE'] || site['NOTE TKTU'] || '-';
    document.getElementById('modal-note-tktu').textContent = noteValTktu;
    
    const editSpan = document.getElementById('modal-note-edit');
    if (editSpan) {
      if (canEdit) {
        editSpan.style.display = 'inline-block';
        editSpan.onclick = () => window.App.editNote(site['Site'], noteValTktu === '-' ? '' : noteValTktu);
      } else {
        editSpan.style.display = 'none';
      }
    }

    // Integration Info
    document.getElementById('modal-srt').textContent = site['SRT'] || '-';
    document.getElementById('modal-port').textContent = site['Port'] || '-';

    // Last update info
    const lastUser = site['User cập nhật'] || '-';
    const lastDate = site['Ngày cập nhật'] || '-';
    document.getElementById('modal-last-update').textContent = `${lastUser} - ${lastDate}`;

    // Form values — nhãn/lựa chọn/các cột phụ đều theo dự án đang xem
    this.renderProgressField(site);
    document.getElementById('update-note').value = '';

    // 5. Setup Action Buttons
    const lat = site['Lat'];
    const lng = site['Long'];
    const siteName = site['Site'];
    const navigateBtn = document.getElementById('navigate-btn');
    if (navigateBtn) {
      navigateBtn.onclick = () => MapManager.navigateToSite(lat, lng);
    }

    // Save current site
    this.currentSite = site;
    this.currentDetailSite = site;
    const role = Auth.getRole();

    const noteVal = String(site['Ghi chú (TKTU ONSITE)'] || '').trim();
    const historyEl = document.getElementById('update-note-history');
    if (historyEl) {
      historyEl.textContent = noteVal;
      historyEl.style.display = noteVal ? 'block' : 'none';
      setTimeout(() => historyEl.scrollTop = historyEl.scrollHeight, 10);
    }

    // Check-in: mọi role đều được phép, nhưng dự án không cần ra hiện trường
    // (ví dụ Kiểm tra CSDL) thì ẩn hẳn nút.
    const detailCheckinBtn = document.getElementById('detail-checkin-btn');
    if (detailCheckinBtn) {
      detailCheckinBtn.style.display = Projects.checkinEnabled() ? 'flex' : 'none';
    }

    // Save site to context for checkin/compass
    this.currentSiteSectors = MapManager.sectorData.filter(s => 
      String(s['Site'] || '').trim().toUpperCase() === String(site['Site'] || '').trim().toUpperCase()
    );

    // 6. Async Data Loads
    this.loadWeatherForecast(lat, lng);
      this.loadDiagrams(siteName);
      this.loadCheckinImage(site);
    this.loadSiteConfig(siteName);
    this.loadComments(siteName);

    // Store current site for update
    document.getElementById('update-form').dataset.siteName = site['Site'];
    document.getElementById('update-form').dataset.siteLat = site['Lat'];
    document.getElementById('update-form').dataset.siteLng = site['Long'];

    // Call buttons
    this.setupCallButtons(site);

    // Show modal
    this.showOverlay('site-modal-overlay');
  },

  // ============================================================
  // Khối "Cập nhật tiến độ" — render theo dự án đang xem
  // ============================================================
  // Nhãn, các lựa chọn trong dropdown và những cột phụ hiển thị đều lấy từ
  // registry. Thêm dự án mới chỉ cần khai báo trong PROJECTS của Code.gs,
  // không phải sửa hàm này.
  renderProgressField(site) {
    const project = Projects.current();
    const field = Projects.progressField();
    const options = Projects.progressOptions();

    const label = document.getElementById('update-progress-label');
    if (label) label.textContent = field;

    const select = document.getElementById('update-progress');
    if (select) {
      const current = String(site[field] || '').trim();
      select.innerHTML = options
        .map(o => `<option value="${o}">${o}</option>`)
        .join('');
      // Giá trị lạ (hoặc trống) → về lựa chọn đầu tiên thay vì để select rỗng
      select.value = options.indexOf(current) >= 0 ? current : options[0];
    }

    // Các cột phụ của dự án (chỉ đọc). Bỏ qua cột tiến độ vì đã có dropdown ở trên.
    const extra = document.getElementById('project-extra-fields');
    if (extra) {
      const rows = (project.detailFields || [])
        .filter(f => f !== field)
        .map(f => {
          const val = String(site[f] || '').trim() || '-';
          return `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;">
            <span style="color:var(--text-muted);">${f}</span>
            <span style="font-weight:600;text-align:right;">${val}</span>
          </div>`;
        });
      extra.innerHTML = rows.join('');
      extra.style.display = rows.length ? '' : 'none';
    }
  },

  setupCallButtons(site) {
    const callSdt = document.getElementById('call-sdt');
    const callFt = document.getElementById('call-sdt-ft');
    const callTktu = document.getElementById('call-sdt-tktu');

    if (callSdt) {
      const sdt = site['SĐT'] || '';
      callSdt.style.display = sdt ? '' : 'none';
      callSdt.onclick = () => window.open(`tel:${sdt}`);
    }
    if (callFt) {
      const sdt = site['SĐT FT'] || '';
      callFt.style.display = sdt ? '' : 'none';
      callFt.onclick = () => window.open(`tel:${sdt}`);
    }
    if (callTktu) {
      const sdt = site['SĐT TKTU'] || site['SĐT TKTU ONSITE'] || '';
      callTktu.style.display = sdt ? '' : 'none';
      callTktu.onclick = () => window.open(`tel:${sdt}`);
    }
  },

  closeSiteModal() {
    document.getElementById('site-modal-overlay').classList.remove('visible');
    document.body.classList.remove('modal-open');
  },

  closeSiteDetail() {
    this.closeSiteModal();
  },

  // ============================================================
  // CHECK-IN & COMMENTS
  // ============================================================
  async processCheckinPhoto(file) {
    if (!this.currentSite) return;
    this.showLoading('Đang lấy tọa độ và xử lý ảnh...');
    
    try {
      // 1. Get GPS
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      
      // 2. Draw watermark and compress
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise(r => img.onload = r);
      
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 1280;
      
      if (width > height && width > MAX_SIZE) {
        height = Math.round(height * MAX_SIZE / width);
        width = MAX_SIZE;
      } else if (height >= width && height > MAX_SIZE) {
        width = Math.round(width * MAX_SIZE / height);
        height = MAX_SIZE;
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      const fontSize = Math.max(16, Math.floor(canvas.width / 30));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(10, canvas.height - (fontSize * 4.5), canvas.width - 20, fontSize * 4);
      
      ctx.fillStyle = '#FFD700';
      const timeStr = new Date().toLocaleString('vi-VN');
      const userStr = Auth.getDisplayName();
      const siteStr = this.currentSite['Site'];
      
      ctx.fillText(`📍 Trạm: ${siteStr} | GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, 20, canvas.height - (fontSize * 3));
      ctx.fillText(`🕐 ${timeStr}`, 20, canvas.height - (fontSize * 1.8));
      ctx.fillText(`👤 User: ${userStr}`, 20, canvas.height - (fontSize * 0.6));
      
      // Compress
      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      
      this.showLoading('Đang tải ảnh lên và check-in...');
      const result = await DataService.checkinSite({
        site: siteStr,
        lat: lat,
        lng: lng,
        imageBase64: base64,
        username: Auth.getUsername(),
        timestamp: Date.now()
      });
      
      this.hideLoading();
      if (result.success) {
        // Log checkin for partner dashboard tracking
        if (!window._checkinLog) window._checkinLog = [];
        window._checkinLog.push({
          site: siteStr,
          user: Auth.getUsername(),
          partner: this.currentSite['Đối tác'] || '',
          team: this.currentSite['Đội thực hiện'] || '',
          sdt: this.currentSite['SĐT'] || '',
          timestamp: Date.now()
        });
        
        const siteIndex = this.sites.findIndex(s => String(s['Site']).trim().toUpperCase() === String(siteStr).trim().toUpperCase());
        if (siteIndex >= 0) {
          // Update local 'Check-in' timestamp column for immediate dashboard display
          const now = new Date();
          const checkinTimeStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
          this.sites[siteIndex]['Check-in'] = checkinTimeStr;
          // Dùng thẳng giá trị backend đã ghi vào Sheet, không tự tính lại. Trước đây
          // client tự suy ra Status theo quy tắc riêng, lệch với backend nên marker
          // đỏ lên rồi bị lần tải dữ liệu kế tiếp đè về màu cũ.
          if (result.progressValue) {
            const field = result.progressField || Projects.progressField();
            const trangThai = result.status || DataService.computeStatus(result.progressValue);
            const nowStr = new Date().toLocaleString('vi-VN');

            this.sites[siteIndex][field] = result.progressValue;
            this.sites[siteIndex]['Status'] = trangThai;
            this.sites[siteIndex]['Ngày cập nhật'] = nowStr;
            Storage.setSitesData(this.sites);

            if (this.currentDetailSite && this.currentDetailSite['Site'] === siteStr) {
              this.currentDetailSite[field] = result.progressValue;
              this.currentDetailSite['Status'] = trangThai;
              this.currentDetailSite['Ngày cập nhật'] = nowStr;
              this.showSiteDetail(this.currentDetailSite);
            }
          }
          if (result.imageUrl) {
            let linkKey = Object.keys(this.sites[siteIndex]).find(k => {
              let n = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\-]/g,'');
              return n.includes('linkanhcheckin') || n.includes('anhcheckin') || n === 'linkanh';
            });
            if (!linkKey) linkKey = 'Link Ảnh Check-in';
            this.sites[siteIndex][linkKey] = result.imageUrl;
            
            if (this.currentDetailSite && this.currentDetailSite['Site'] === siteStr) {
              this.currentDetailSite[linkKey] = result.imageUrl;
              this.loadCheckinImage(this.currentDetailSite);
            }
          }
          
          if (result.progressValue || result.imageUrl) {
            MapManager.loadSites(this.sites);
            this.updateStats();
            DashboardManager.renderDashboard(this.sites);
          }
        }
        this.showToast(result.message, 'success');
      } else {
        this.showToast('Lỗi Check-in: ' + result.error, 'error');
      }
    } catch (e) {
      this.hideLoading();
      if (e.code === 1) this.showToast('Vui lòng cấp quyền vị trí GPS', 'error');
      else this.showToast('Lỗi xử lý ảnh: ' + e.message, 'error');
    }
  },

  async loadComments(siteName) {
    const list = document.getElementById('comments-list');
    if (!list) return;
    list.innerHTML = '<div class="loading-spinner"></div>';
    
    const comments = await DataService.getComments(siteName);
    list.innerHTML = '';
    
    if (comments.length === 0) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">Chưa có bình luận nào</div>';
      return;
    }
    
    comments.forEach(c => {
      list.innerHTML += `
        <div class="comment-bubble">
          <div class="comment-header">
            <span class="comment-user">${c.user}</span>
            <span>${c.timestamp}</span>
          </div>
          <div class="comment-msg">${c.message}</div>
        </div>
      `;
    });
    list.scrollTop = list.scrollHeight;
  },

  async submitComment() {
    const input = document.getElementById('comment-input');
    const msg = input.value.trim();
    if (!msg || !this.currentSite) return;
    
    input.value = '';
    this.showToast('Đang gửi bình luận...', 'info');
    
    const result = await DataService.addComment({
      site: this.currentSite['Site'],
      message: msg,
      username: Auth.getUsername(),
      role: Auth.getRole()
    });
    
    if (result.success) {
      this.loadComments(this.currentSite['Site']);
    } else {
      this.showToast('Lỗi gửi bình luận: ' + result.error, 'error');
    }
  },

  // ============================================================
  // Sector Field Update
  // ============================================================

  editNote(siteName, currentVal) {
    if (!['admin', 'manager'].includes(Auth.getRole())) return;
    this._showTextInputPicker('NOTE', siteName, currentVal || '', (newVal) => {
      if (newVal === null || newVal === currentVal) return;

      DataService.apiCall(null, 'POST', {
        action: 'updateNote',
        site: siteName,
        note: newVal,
        username: Auth.getUsername()
      }).then(res => {
        if (res.success) {
          // Update in-memory data
          const idx = this.sites.findIndex(s => s.Site === siteName);
          if (idx !== -1) {
            this.sites[idx]['NOTE'] = newVal;
            this.sites[idx]['NOTE TKTU'] = newVal;
          }
          if (this.currentDetailSite && this.currentDetailSite.Site === siteName) {
            this.currentDetailSite['NOTE'] = newVal;
            this.currentDetailSite['NOTE TKTU'] = newVal;
          }
          // Update DOM immediately without reopening popup
          const noteEl = document.getElementById('modal-note-tktu');
          if (noteEl) noteEl.textContent = newVal || '-';
          this.showToast('Đã lưu NOTE thành công', 'success');
        } else {
          this.showToast('Lỗi: ' + (res.error || 'Không cập nhật được'), 'error');
        }
      }).catch(err => {
        this.showToast('Lỗi mạng: ' + err.message, 'error');
      });
    });
  },

  editSiteField(siteName, fieldName, fieldDisplayName, currentValue) {
    if (!['admin', 'manager'].includes(Auth.getRole())) {
      return this.showToast('Tài khoản không có quyền chỉnh sửa', 'error');
    }
    // For 'Danh sách' / 'Phân loại', show dropdown overlay
    if (fieldName === 'Danh sách' || fieldName === 'Phân loại') {
      this._showDropdownPicker(siteName, fieldName, fieldDisplayName, currentValue, ['Triển khai', 'Dự phòng']);
    } else {
      this._showTextInputPicker(fieldDisplayName, siteName, currentValue === '-' ? '' : currentValue, (newVal) => {
        if (newVal === null || newVal === currentValue) return;
        this._saveSiteField(siteName, fieldName, fieldDisplayName, newVal);
      });
    }
  },

  // Custom text-input overlay replacing window.prompt(), which browsers/WebViews
  // silently block or no-op when the PWA runs in standalone display mode.
  _showTextInputPicker(fieldDisplayName, siteName, currentValue, onConfirm) {
    const oldPicker = document.getElementById('site-field-picker');
    if (oldPicker) oldPicker.remove();

    const overlay = document.createElement('div');
    overlay.id = 'site-field-picker';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'background:rgba(0,0,0,0.65)', 'z-index:99999',
      'display:flex', 'align-items:center', 'justify-content:center'
    ].join(';');

    const safeValue = String(currentValue).replace(/"/g, '&quot;');
    overlay.innerHTML = `
      <div style="background:#0f172a;border:1px solid #334155;border-radius:16px;padding:24px 28px;min-width:280px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.7);">
        <div style="font-size:13px;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">${fieldDisplayName}</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:14px;">Trạm: <strong style="color:#fff">${siteName}</strong></div>
        <input id="site-field-input" type="text" value="${safeValue}"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1.5px solid #334155;background:#1e293b;color:#fff;font-size:14px;margin-bottom:16px;">
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button id="site-field-cancel" style="padding:8px 18px;border-radius:8px;background:transparent;border:1px solid #334155;color:#94a3b8;cursor:pointer;font-size:13px;">Huỷ</button>
          <button id="site-field-save" style="padding:8px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:#1d4ed8;color:#fff;">Lưu</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const input = document.getElementById('site-field-input');
    input.focus();
    input.select();

    const close = () => overlay.remove();
    const confirm = () => { const newVal = input.value; close(); onConfirm(newVal); };
    const cancel = () => { close(); onConfirm(null); };

    document.getElementById('site-field-save').addEventListener('click', confirm);
    document.getElementById('site-field-cancel').addEventListener('click', cancel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') cancel();
    });
  },

  _showDropdownPicker(siteName, fieldName, fieldDisplayName, currentValue, options) {
    const oldPicker = document.getElementById('site-field-picker');
    if (oldPicker) oldPicker.remove();

    const overlay = document.createElement('div');
    overlay.id = 'site-field-picker';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'background:rgba(0,0,0,0.65)', 'z-index:99999',
      'display:flex', 'align-items:center', 'justify-content:center'
    ].join(';');

    const optionBtns = options.map(opt => {
      const isActive = opt.toLowerCase() === String(currentValue).toLowerCase();
      const bg = isActive ? '#1d4ed8' : '#1e293b';
      const border = isActive ? '#3b82f6' : '#334155';
      return `<button
        onclick="App._saveSiteField('${siteName}', '${fieldName}', '${fieldDisplayName}', '${opt}'); document.getElementById('site-field-picker').remove();"
        style="padding:12px 32px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;border:2px solid ${border};background:${bg};color:#fff;margin:0 6px;transition:all 0.2s;">
        ${opt}
      </button>`;
    }).join('');

    overlay.innerHTML = `
      <div style="background:#0f172a;border:1px solid #334155;border-radius:16px;padding:30px 36px;min-width:300px;box-shadow:0 20px 60px rgba(0,0,0,0.7);text-align:center;">
        <div style="font-size:13px;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">${fieldDisplayName}</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:20px;">Trạm: <strong style="color:#fff">${siteName}</strong></div>
        <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">${optionBtns}</div>
        <div style="margin-top:18px;">
          <button onclick="document.getElementById('site-field-picker').remove()" style="padding:7px 22px;border-radius:8px;background:transparent;border:1px solid #334155;color:#94a3b8;cursor:pointer;font-size:13px;">Huỷ</button>
        </div>
      </div>`;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  },

  async _saveSiteField(siteName, fieldName, fieldDisplayName, newValue) {
    App.showLoading('Đang cập nhật...');
    try {
      // Use window.DataService to be safe with inline onclick context
      const ds = window.DataService || DataService;
      const result = await ds.updateSiteField({
        site: siteName,
        field: fieldName,
        value: newValue,
        username: Auth.getUsername()
      });
      App.hideLoading();
      if (result.success) {
        const idx = this.sites.findIndex(s => s['Site'] === siteName);
        if (idx !== -1) this.sites[idx][fieldName] = newValue;
        if (this.currentDetailSite && this.currentDetailSite['Site'] === siteName) {
          this.currentDetailSite[fieldName] = newValue;
          this.showSiteDetail(this.currentDetailSite);
        }
        this.showToast(`Đã cập nhật ${fieldDisplayName} thành "${newValue}"`, 'success');
      } else {
        this.showToast('Lỗi: ' + (result.message || 'Không thể cập nhật'), 'error');
      }
    } catch (e) {
      App.hideLoading();
      this.showToast('Lỗi kết nối: ' + e.message, 'error');
    }
  },

  editSectorField(siteName, cellName, fieldName, currentValue, techValue) {
    if (!['admin', 'manager'].includes(Auth.getRole())) {
      return App.showToast('Tài khoản của bạn không có quyền cập nhật thông tin này', 'error');
    }
    const fieldNamesMap = {
      'cauHinhMoi': 'Cấu hình mới',
      'doCaoCot': 'Độ cao cột',
      'doCaoChanCot': 'Cao/chân cột',
      'doCaoMatDat': 'Cao/mặt đất',
      'doCaoGPSChanCot': 'Độ cao GPS/chân cột',
      'azimuth': 'Azimuth',
      'tiltCo': 'Tilt cơ',
      'tiltDien': 'Tilt điện'
    };
    const displayName = fieldNamesMap[fieldName] || fieldName;
    this._showTextInputPicker(displayName, siteName, currentValue === '-' ? '' : currentValue, async (newValue) => {
      if (newValue === null || newValue === currentValue) return; // User cancelled or unchanged

      App.showLoading('Đang cập nhật sector...');
      try {
        const data = { site: siteName, cell: cellName, username: Auth.getUsername(), tech: techValue };
        data[fieldName] = newValue;
        const result = await DataService.updateSector(data);
        if (result.success) {
          App.showToast('Cập nhật sector thành công!', 'success');
          // Fetch new sectors and update map
          const sectors = await DataService.fetchSectors();
          MapManager.setSectorData(sectors);
          MapManager.renderSectors();
        } else {
          App.showToast('Lỗi: ' + result.message, 'error');
        }
      } catch (e) {
        App.showToast('Lỗi khi cập nhật sector', 'error');
      }
      App.hideLoading();
    });
  },

  // ============================================================
  // Update Progress Handler
  // ============================================================
  async handleUpdateProgress(e) {
    if (e) e.preventDefault();
    if (!['admin', 'manager'].includes(Auth.getRole())) return App.showToast('Tài khoản của bạn không có quyền cập nhật tiến độ', 'error');
    const form = document.getElementById('update-form');
    const siteName = form.dataset.siteName;
    const progressField = Projects.progressField();
    const progressValue = document.getElementById('update-progress').value;
    const note = document.getElementById('update-note').value.trim();

    const submitBtn = document.getElementById('update-submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-small"></span> Đang cập nhật...';

    try {
      const result = await DataService.updateProgress({
        site: siteName,
        progressValue: progressValue,
        note: note,
        username: Auth.getUsername(),
      });

      if (result.success) {
        // Update local data
        const siteIndex = this.sites.findIndex((s) => s['Site'] === siteName);
        if (siteIndex >= 0) {
          this.sites[siteIndex][progressField] = progressValue;
          if (result.updatedNote !== undefined) {
            this.sites[siteIndex]['Ghi chú (TKTU ONSITE)'] = result.updatedNote;
            if (this.currentDetailSite && this.currentDetailSite['Site'] === siteName) {
              this.currentDetailSite['Ghi chú (TKTU ONSITE)'] = result.updatedNote;
            }
          } else {
            // fallback for offline
            const oldNote = String(this.sites[siteIndex]['Ghi chú (TKTU ONSITE)'] || '').trim();
            if (note.trim() !== '') {
              const tz = 'Asia/Ho_Chi_Minh';
              const now = new Date();
              const nowStr = `[${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth()+1).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}]`;
              const newNoteText = `${nowStr} ${Auth.getUsername()}: ${note.trim()}`;
              const appended = oldNote ? (oldNote + '\n' + newNoteText) : newNoteText;
              this.sites[siteIndex]['Ghi chú (TKTU ONSITE)'] = appended;
            }
          }
          
          document.getElementById('update-note').value = '';
          const historyEl = document.getElementById('update-note-history');
          if (historyEl && this.sites[siteIndex]['Ghi chú (TKTU ONSITE)']) {
            historyEl.textContent = this.sites[siteIndex]['Ghi chú (TKTU ONSITE)'];
            historyEl.style.display = 'block';
            setTimeout(() => historyEl.scrollTop = historyEl.scrollHeight, 10);
          }
          this.sites[siteIndex]['User cập nhật'] = Auth.getUsername();
          const now = new Date();
          this.sites[siteIndex]['Ngày cập nhật'] = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth()+1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

          // Status ưu tiên giá trị backend trả về; offline thì tính bằng hàm dùng chung.
          const trangThai = result.status || DataService.computeStatus(progressValue);
          this.sites[siteIndex]['Status'] = trangThai;
          this.sites[siteIndex]['status'] = trangThai;
          if (this.currentDetailSite && this.currentDetailSite['Site'] === siteName) {
            this.currentDetailSite['Status'] = trangThai;
            this.currentDetailSite['status'] = trangThai;
          }

          // Update marker on map
          MapManager.updateMarker(this.sites[siteIndex]);

          // Update stats
          this.updateStats();
          DashboardManager.renderDashboard(this.sites);
        }

        const msg = result.offline
          ? '⚡ Đã lưu offline. Sẽ đồng bộ khi có mạng.'
          : '✅ Cập nhật thành công!';
        this.showToast(msg, result.offline ? 'warning' : 'success');
        this.closeSiteModal();
      } else {
        this.showToast('❌ ' + (result.message || 'Cập nhật thất bại'), 'error');
      }
    } catch (error) {
      this.showToast('❌ Lỗi: ' + error.message, 'error');
    }

    submitBtn.disabled = false;
    submitBtn.innerHTML = '💾 Cập nhật tiến độ';
  },

  // ============================================================
  // Stats Dashboard
  // ============================================================
  updateStats() {
    if (!this.sites || !Array.isArray(this.sites)) return;
    // Only count 'Triển khai' sites for stats bar
    const trienKhaiSites = this.sites.filter(s =>
      String(s['Danh sách'] || '').trim().toLowerCase() === 'triển khai'
    );
    const total = trienKhaiSites.length;
    const completed = trienKhaiSites.filter((s) => DataService.getSiteStatus(s) === 'completed').length;
    const notUpdated = total - completed;

    const el = document.getElementById('stats-bar');
    if (el) {
      el.innerHTML = `
        <span class="stat-item" title="Tổng"><span class="stat-icon">📡</span>${total}</span>
        <span class="stat-item stat-completed" title="Hoàn thành"><span class="stat-icon">✅</span>${completed}</span>
        <span class="stat-item stat-pending" title="Chưa cập nhật"><span class="stat-icon">⏳</span>${notUpdated}</span>
      `;
    }

    // Update pending badge
    const pendingCount = Storage.getPendingUpdates().length;
    const badge = document.getElementById('pending-badge');
    if (badge) {
      badge.textContent = pendingCount;
      badge.style.display = pendingCount > 0 ? '' : 'none';
    }
  },

  // ============================================================
  // Refresh Data
  // ============================================================
  async handleRefresh() {
    const btn = document.getElementById('refresh-btn');
    btn.classList.add('spinning');

    try {
      // Sync pending first
      const pending = Storage.getPendingUpdates();
      if (pending.length > 0 && this.isOnline) {
        await DataService.syncPendingUpdates();
      }

      this.sites = await DataService.fetchSites();
      
      if (!['view_limited', 'doitac'].includes(Auth.getRole())) {
        MapManager.loadSites(this.sites);
        this.updateStats();
        // Reload sectors
        DataService.fetchSectors().then(sectors => MapManager.loadSectors(sectors));
      } else {
        DataService.fetchSectors().then(sectors => MapManager.setSectorData(sectors));
      }

      this.showToast('Đã cập nhật dữ liệu', 'success');
    } catch (error) {
      this.showToast('Lỗi: ' + error.message, 'error');
    }

    btn.classList.remove('spinning');
  },

  // ============================================================
  // Toggle Sectors
  // ============================================================
  toggleSectors() {
    const visible = MapManager.toggleSectors();
    const btn = document.getElementById('sector-toggle-btn');
    if (btn) {
      btn.style.opacity = visible ? '1' : '0.4';
    }
  },

  // ============================================================
  // Auto Refresh
  // ============================================================
  startAutoRefresh() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(async () => {
      if (this.isOnline) {
        try {
          this.sites = await DataService.fetchSites();
          if (!['view_limited', 'doitac'].includes(Auth.getRole())) {
            MapManager.loadSites(this.sites);
            this.updateStats();
            DashboardManager.renderDashboard(this.sites);
          }
        } catch (e) {}
      }
    }, AppConfig.DATA_REFRESH_INTERVAL);
  },

  // ============================================================
  // Online/Offline Handlers
  // ============================================================
  handleOnline() {
    this.isOnline = true;
    document.body.classList.remove('offline');
    this.showToast('🌐 Đã kết nối mạng', 'success');

    // Sync pending updates
    setTimeout(async () => {
      const pending = Storage.getPendingUpdates();
      if (pending.length > 0) {
        const result = await DataService.syncPendingUpdates();
        if (result.synced > 0) {
          this.showToast(`Đã đồng bộ ${result.synced} cập nhật offline`, 'success');
          this.sites = await DataService.fetchSites();
          if (!['view_limited', 'doitac'].includes(Auth.getRole())) {
            MapManager.loadSites(this.sites);
            this.updateStats();
            DashboardManager.renderDashboard(this.sites);
          }
        }
      }
    }, 2000);
  },

  handleOffline() {
    this.isOnline = false;
    document.body.classList.add('offline');
    this.showToast('📴 Mất kết nối mạng - Chế độ offline', 'warning');
  },

  // ============================================================
  // User Menu
  // ============================================================
  toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('visible');
  },

  handleLogout() {
    Auth.logout();
    MapManager.destroy();
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.showScreen('login-screen');
    this.showToast('Đã đăng xuất', 'success');

    // Reset login form
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
  },

  showSettings() {
    const currentUrl = Storage.getApiUrl();
    alert('API URL hiện tại:\n' + currentUrl + '\n\nĐể thay đổi, sửa file js/config.js → API_URL');
    document.getElementById('user-dropdown').classList.remove('visible');
  },

  // ============================================================
  // UI Utilities
  // ============================================================
  showLoading(message) {
    const overlay = document.getElementById('loading-overlay');
    const text = document.getElementById('loading-text');
    if (text) text.textContent = message || 'Đang xử lý...';
    overlay.classList.add('visible');
  },

  hideLoading() {
    document.getElementById('loading-overlay').classList.remove('visible');
  },

  showOverlay(id) {
    document.getElementById(id).classList.add('visible');
    document.body.classList.add('modal-open');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('visible'));

    // Auto remove
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  shakeElement(el) {
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 600);
  },

  // ============================================================
  // DASHBOARD
  // ============================================================
  openDashboard() {
    if (['view_limited', 'doitac'].includes(Auth.getRole())) return this.showToast('Tài khoản của bạn không có quyền xem Dashboard', 'error');
    DashboardManager.renderDashboard(this.sites);
    document.getElementById('dashboard-overlay').classList.add('visible');
  },

  closeDashboard() {
    document.getElementById('dashboard-overlay').classList.remove('visible');
  },




  showSiteList(filterId, title) {
    this.currentListFilter = filterId;
    this.currentListTitle = title;
    
    let filtered = [];
    if (filterId === 'total') filtered = this.sites;
    else if (filterId === 'completed') filtered = this.sites.filter(s => DataService.getSiteStatus(s) === 'completed');
    else if (filterId === 'in_progress') filtered = this.sites.filter(s => DataService.getSiteStatus(s) === 'in_progress');
    else if (filterId === 'pending') filtered = this.sites.filter(s => { const st = DataService.getSiteStatus(s); return st !== 'completed' && st !== 'in_progress'; });

      else if (filterId === 'delayed_sites') {
        const parseDate = str => { const m = String(str || '').match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); return m ? new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])) : null; };
        const todayDate = new Date();
        todayDate.setHours(0,0,0,0);
        filtered = this.sites.filter(s => {
          if (DataService.getSiteStatus(s) !== 'in_progress') return false;
          const d = parseDate(s['Ngày cập nhật']);
          if (!d) return false;
          d.setHours(0,0,0,0);
          const diff = Math.floor((todayDate - d) / 86400000);
          if (diff > 2) {
              s._daysDelayed = diff;
              return true;
          }
          return false;
        });
      }
      else if (filterId === 'delayed_sites_dk') {
        const parseDate = str => { const m = String(str || '').match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); return m ? new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])) : null; };
        const todayDate = new Date();
        todayDate.setHours(0,0,0,0);
        filtered = this.sites.filter(s => {
          if (DataService.getSiteStatus(s) === 'completed') return false;
          const d = parseDate(s['Ngày đăng ký']);
          if (!d) return false;
          d.setHours(0,0,0,0);
          const diff = Math.floor((todayDate - d) / 86400000);
          if (diff > 2) {
              s._daysDelayedDk = diff;
              return true;
          }
          return false;
        });
      }
      else if (filterId === 'delayed_sites_dk') {
        const todayDate = new Date();
        filtered = this.sites.filter(s => {
          if (DataService.getSiteStatus(s) !== 'in_progress') return false;
          const str = String(s['Ngày đăng ký'] || '');
          const parts = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/);
          let d = null;
          if (parts) {
            d = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]), parseInt(parts[4]) || 0, parseInt(parts[5]) || 0, parseInt(parts[6]) || 0);
          }
          if (!d) return false;
          const diffHours = (todayDate - d) / 3600000;
          if (diffHours > 48) {
              s._daysDelayedDk = Math.floor(diffHours / 24);
              return true;
          }
          return false;
        });
      }

    else if (filterId.startsWith('daily_plan_')) {
      const planSites = this.sites.filter(s => DataService.isDailyPlan(s));
      if (filterId === 'daily_plan_all') filtered = planSites;
      if (filterId === 'daily_plan_completed') filtered = planSites.filter(s => DataService.getSiteStatus(s) === 'completed');
      if (filterId === 'daily_plan_in_progress') filtered = planSites.filter(s => DataService.getSiteStatus(s) === 'in_progress');
      if (filterId === 'daily_plan_pending') filtered = planSites.filter(s => { const st = DataService.getSiteStatus(s); return st !== 'completed' && st !== 'in_progress'; });
      if (filterId === 'daily_plan_checkin') {
        const checkinLog = window._checkinLog || [];
        const now = new Date();
        const tDay = now.getDate(), tMonth = now.getMonth(), tYear = now.getFullYear();
        const isCheckinTodayFilter = (val) => {
          const str = String(val || '').trim();
          if (!str) return false;
          const m1 = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          if (m1) return parseInt(m1[1]) === tDay && (parseInt(m1[2]) - 1) === tMonth && parseInt(m1[3]) === tYear;
          const m2 = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
          if (m2) return parseInt(m2[3]) === tDay && (parseInt(m2[2]) - 1) === tMonth && parseInt(m2[1]) === tYear;
          try { const d = new Date(str); if (!isNaN(d.getTime())) return d.getDate() === tDay && d.getMonth() === tMonth && d.getFullYear() === tYear; } catch(e) {}
          return false;
        };
        filtered = planSites.filter(s => {
          for (const k in s) {
            let n = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\-]/g,'');
            if (n.includes('checkin') && !n.includes('linkanh') && !n.includes('anhcheckin') && s[k] && String(s[k]).trim() !== '') {
              if (isCheckinTodayFilter(s[k])) return true;
            }
          }
          return checkinLog.some(c => c.site === s['Site']);
        });
      }
    } else if (filterId.startsWith('cat_')) {
      const parts = filterId.split('_');
      let cat = 'Khác';
      if (parts[1] === '5g4g') cat = '5G_4G Z';
      if (parts[1] === '5g') cat = '5G Z';
      if (parts[1] === '4g') cat = '4G Z';
      
      const catSites = this.sites.filter(s => String(s['Phân loại']).trim() === cat);
      if (parts[2] === 'all') filtered = catSites;
      if (parts[2] === 'completed') filtered = catSites.filter(s => DataService.getSiteStatus(s) === 'completed');
      if (parts[2] === 'in') filtered = catSites.filter(s => DataService.getSiteStatus(s) === 'in_progress');
      if (parts[2] === 'pending') filtered = catSites.filter(s => { const st = DataService.getSiteStatus(s); return st !== 'completed' && st !== 'in_progress'; });
    } else if (filterId.startsWith('group_')) {
      const regex = /^group_([^_]+)_(.+)_(all|completed|in_progress|pending)$/;
      const m = filterId.match(regex);
      if (m) {
        const groupKey = m[1];
        const groupName = m[2];
        const status = m[3];
        const groupSites = this.sites.filter(s => String(s[groupKey] || 'Khác').trim() === groupName);
        if (status === 'all') filtered = groupSites;
        if (status === 'completed') filtered = groupSites.filter(s => DataService.getSiteStatus(s) === 'completed');
        if (status === 'in_progress') filtered = groupSites.filter(s => DataService.getSiteStatus(s) === 'in_progress');
        if (status === 'pending') filtered = groupSites.filter(s => { const st = DataService.getSiteStatus(s); return st !== 'completed' && st !== 'in_progress'; });
      }
    } else if (filterId.startsWith('partner_')) {
      // partner_{partnerName}_{status}
      const prefixLen = 'partner_'.length;
      const rest = filterId.slice(prefixLen); // e.g. "Viettel_completed"
      const lastUs = rest.lastIndexOf('_');
      const partnerName = rest.slice(0, lastUs);
      const status = rest.slice(lastUs + 1);
      // Only plan sites for today
      const today = new Date();
      const isToday = (val) => {
        const s = String(val || '');
        const m1 = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (m1) { const d=parseInt(m1[1]), mo=parseInt(m1[2])-1, y=parseInt(m1[3]); return d===today.getDate()&&mo===today.getMonth()&&y===today.getFullYear(); }
        return false;
      };
      const partnerSites = this.sites.filter(s => String(s['Đối tác'] || '').trim() === partnerName && isToday(s['Kế hoạch ngày']));
      if (status === 'all') filtered = partnerSites;
      else if (status === 'completed') filtered = partnerSites.filter(s => DataService.getSiteStatus(s) === 'completed');
      else if (status === 'in_progress') filtered = partnerSites.filter(s => DataService.getSiteStatus(s) === 'in_progress');
      else if (status === 'pending') filtered = partnerSites.filter(s => { const st = DataService.getSiteStatus(s); return st !== 'completed' && st !== 'in_progress'; });
      else if (status === 'checkin') {
        const checkinLog = window._checkinLog || [];
        const tDay = today.getDate(), tMonth = today.getMonth(), tYear = today.getFullYear();
        const isCheckinTodayPartner = (val) => {
          const str = String(val || '').trim();
          if (!str) return false;
          const m1 = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          if (m1) return parseInt(m1[1]) === tDay && (parseInt(m1[2]) - 1) === tMonth && parseInt(m1[3]) === tYear;
          const m2 = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
          if (m2) return parseInt(m2[3]) === tDay && (parseInt(m2[2]) - 1) === tMonth && parseInt(m2[1]) === tYear;
          try { const d = new Date(str); if (!isNaN(d.getTime())) return d.getDate() === tDay && d.getMonth() === tMonth && d.getFullYear() === tYear; } catch(e) {}
          return false;
        };
        filtered = partnerSites.filter(s => {
          for (const k in s) {
            let n = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\-]/g,'');
            if (n.includes('checkin') && !n.includes('linkanh') && !n.includes('anhcheckin') && s[k] && String(s[k]).trim() !== '') {
              if (isCheckinTodayPartner(s[k])) return true;
            }
          }
          return checkinLog.some(c => c.site === s['Site']);
        });
      }
      else filtered = partnerSites;
    } else if (filterId === 'checkin_report_checkin') {
      const trienKhaiSites = this.sites.filter(s => String(s['Danh sách'] || '').trim().toLowerCase() === 'triển khai');
      const checkedIn = trienKhaiSites.filter(s => window.CheckinReport && window.CheckinReport.isCheckinToday(s));
      const cr = window.CheckinReport;
      filtered = cr ? checkedIn.filter(s => {
        const prov = String(s['Tỉnh mới'] || s['Tỉnh'] || '').trim();
        const partner = String(s['Đối tác'] || '').trim();
        if (cr.filterTinh && prov !== cr.filterTinh) return false;
        if (cr.filterDoiTac && partner !== cr.filterDoiTac) return false;
        return true;
      }) : checkedIn;
    }

    this.currentListData = filtered;

    document.getElementById('list-modal-title').textContent = title + " (" + filtered.length + " trạm)";
    const tbody = document.querySelector('#list-modal-table tbody');
    const thead = document.querySelector('#list-modal-table thead');

    const isCheckinReportList = filterId === 'checkin_report_checkin';
    const isCheckinMode = filterId && filterId.includes('checkin');

    if (isCheckinReportList) {
      // Popup hiển thị đúng các cột sẽ được xuất Excel
      thead.innerHTML = '<tr><th>Tỉnh</th><th>Site</th><th>Phân loại</th><th>Đối tác</th><th>Status</th><th>User cập nhật</th><th>Thời gian Check-in</th></tr>';
      tbody.innerHTML = filtered.map(s => {
        const row = this.cleanCheckinReportSiteForExport(s);
        return `<tr>
          <td>${row['Tỉnh'] || '-'}</td>
          <td><a href="#" class="clickable-site" style="color:var(--color-green);text-decoration:none;" onclick="App.openMapPopup('${s['Site']}'); return false;">${row['Site']}</a></td>
          <td>${row['Phân loại'] || '-'}</td>
          <td>${row['Đối tác'] || '-'}</td>
          <td>${row['Status'] || '-'}</td>
          <td>${row['User cập nhật'] || '-'}</td>
          <td>${row['Thời gian Check-in'] || '-'}</td>
        </tr>`;
      }).join('');
      document.getElementById('list-modal').classList.add('visible');
      return;
    }

    // Một cột tiến độ duy nhất, tên cột theo dự án đang xem
    const progressField = Projects.progressField();
    const lastCol = isCheckinMode ? 'Checkin' : 'TKTU';
    thead.innerHTML = `<tr><th>Mã trạm</th><th>Phân loại</th><th>Tiến độ</th><th>Đối tác</th><th>${lastCol}</th></tr>`;

    const formatProgress = (p) => {
      const str = String(p || '').trim();
      if (str === 'Hoàn thành') return '✅';
      if (str === 'Đang thực hiện') return '🔄';
      return '—';
    };

    tbody.innerHTML = filtered.map(s => {
      const status = DataService.getSiteStatus(s);
      const color = DataService.getStatusColor(status, s);
      return `<tr>
        <td><span class="status-dot" style="background:${color}"></span><a href="#" class="clickable-site" style="color:${color}" onclick="App.openMapPopup('${s['Site']}'); return false;">${s['Site']}</a></td>
        <td>${s['Phân loại'] || '-'}</td>
        <td class="num">${formatProgress(s[progressField])}</td>
        <td>${s['Đối tác'] || '-'}</td>
                <td>${(() => {
          if (isCheckinMode) {
            for (const k in s) {
              if (k.replace(/[- ]/g, '').toLowerCase() === 'checkin' && s[k]) return s[k];
            }
            return '-';
          }
          return s['TKTU ONSITE'] || '-';
        })()}</td>
      </tr>`;
    }).join('');

    document.getElementById('list-modal').classList.add('visible');
  },
  
  closeListModal() {
    document.getElementById('list-modal').classList.remove('visible');
  },

  openMapPopup(siteName) {
    try {
      const site = App.sites.find(s => s['Site'] === siteName);
      if (!site) {
        alert('Không tìm thấy trạm: ' + siteName);
        return;
      }
      this.showSiteDetail(site);
    } catch(e) {
      alert('Lỗi khi mở popup: ' + e.message);
    }
  },

  showSiteDetails(siteName) {
    const site = App.sites.find(s => s['Site'] === siteName);
    if (!site) return;

    this.currentDetailSite = site;
    document.getElementById('detail-modal-title').textContent = "Chi tiết: " + siteName;
    
    const tbody = document.getElementById('detail-modal-content');
    
    let html = '';
    Object.keys(site).forEach(key => {
      if (key === 'Site' || key === 'rowIdx') return;
      let val = site[key];
      if (val === undefined || val === null) val = '';
      if (key.includes('Ngày') || key.includes('Thời gian')) val = String(val);
      
      html += `<tr>
        <th>${key}</th>
        <td>${val}</td>
      </tr>`;
    });

    tbody.innerHTML = `<tbody>${html}</tbody>`;
    document.getElementById('detail-modal').classList.add('visible');
  },

  closeDetailModal() {
    document.getElementById('detail-modal').classList.remove('visible');
  },

  // ============================================================
  // Exports
  // ============================================================
    cleanSiteForExport(site, isCheckinMode = false, isDelayedMode = false, isDelayedDkMode = false) {
    
      const ordered = {};

      // Cột tiến độ xuất ra Excel theo dự án đang xem
      const progressField = Projects.progressField();
      const progressValue = site[progressField] || '';

      if (isDelayedMode || isDelayedDkMode) {
        ordered['Trạm'] = site['Site'] || '';
        ordered['Phân loại'] = site['Phân loại'] || '';
        ordered[progressField] = progressValue;
        ordered['Đối tác'] = site['Đối tác'] || '';
        ordered['TKTU'] = site['TKTU ONSITE'] || '';
        
        let ghiChu = '';
        for (const k in site) {
          if (k.trim() === 'Ghi chú (TKTU ONSITE)') {
            ghiChu = site[k] || '';
            break;
          }
        }
        ordered['Ghi chú'] = ghiChu;
        if (isDelayedDkMode) {
          ordered['Ngày đăng ký'] = site['Ngày đăng ký'] || '';
        } else {
          ordered['Ngày thực hiện'] = site['Ngày cập nhật'] || '';
        }
        ordered['Nguyên nhân'] = site['Nguyên nhân chưa hoàn thành'] || '';
        ordered['Số ngày chưa hoàn thành'] = isDelayedDkMode ? (site._daysDelayedDk || '') : (site._daysDelayed || '');
        return ordered;
      }

    ordered['Site'] = site['Site'] || '';
    ordered['Phân loại'] = site['Phân loại'] || '';
    ordered['Huyện'] = site['Huyện'] || '';
    ordered['Phương án Swap'] = site['Phương án Swap'] || '';
    ordered[progressField] = progressValue;

    // Ghi chú (TKTU ONSITE) only
    let ghiChu = '';
    for (const k in site) {
      if (k.trim() === 'Ghi chú (TKTU ONSITE)') {
        ghiChu = site[k] || '';
        break;
      }
    }
    ordered['Ghi chú'] = ghiChu;

    ordered['Status'] = DataService.getStatusLabel(DataService.getSiteStatus(site), site) || '';
    ordered['User cập nhật'] = site['User cập nhật'] || '';
    ordered['Ngày cập nhật'] = site['Ngày cập nhật'] || '';

    if (isCheckinMode) {
      let checkinVal = '';
      let linkVal = '';
      for (const k in site) {
        let n = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\-]/g,'');
        if (n === 'checkin' && site[k]) {
          checkinVal = site[k];
        }
        if ((n.includes('linkanhcheckin') || n.includes('anhcheckin') || n === 'linkanh') && site[k]) {
          linkVal = site[k];
        }
      }
      if (checkinVal) ordered['Thời gian Check-in'] = checkinVal;
    }

    return ordered;
  },

  // Export dùng riêng cho flash card "Đã Check-in hôm nay" ở Report Check-in
  cleanCheckinReportSiteForExport(site) {
    const checkinVal = window.CheckinReport ? window.CheckinReport.getCheckinValue(site) : null;
    return {
      'Tỉnh': site['Tỉnh mới'] || site['Tỉnh'] || '',
      'Site': site['Site'] || '',
      'Phân loại': site['Danh sách'] || '',
      'Đối tác': site['Đối tác'] || '',
      'Status': site['Status'] || '',
      'User cập nhật': site['User cập nhật'] || '',
      'Thời gian Check-in': checkinVal || ''
    };
  },

  refreshDashboardFilter() {
    DashboardManager.renderDashboard(this.sites);
  },

  exportDashboardExcel() {
    const role = Auth.getRole();
    if (!['admin', 'manager', 'export'].includes(role)) return App.showToast('Tài khoản của bạn không được xuất dữ liệu', 'error');
    if (!window.XLSX) return App.showToast('Lỗi: Thư viện Excel chưa tải', 'error');
    
    const wb = XLSX.utils.book_new();
    
    // Only completed and in_progress sites
    const activeSites = App.sites.filter(s => {
      const st = DataService.getSiteStatus(s);
      return st === 'completed' || st === 'in_progress';
    });

    const pendingSites = App.sites.filter(s => {
      const st = DataService.getSiteStatus(s);
      return st !== 'completed' && st !== 'in_progress';
    });

    const allActive = activeSites.map(s => this.cleanSiteForExport(s, false));
    const wsAll = XLSX.utils.json_to_sheet(allActive);
    XLSX.utils.book_append_sheet(wb, wsAll, "Hoàn thành - Đang TH");

    if (pendingSites.length > 0) {
      const allPending = pendingSites.map(s => this.cleanSiteForExport(s, false));
      const wsPending = XLSX.utils.json_to_sheet(allPending);
      XLSX.utils.book_append_sheet(wb, wsPending, "Chưa hoàn thành");
    }

    XLSX.writeFile(wb, "Bao_Cao_Tien_Do_SWAP.xlsx");
  },

  exportListExcel() {
    const role = Auth.getRole();
    if (!['admin', 'manager', 'export', 'partner_view_limited'].includes(role)) return App.showToast('Tài khoản của bạn không được xuất dữ liệu', 'error');
    if (!window.XLSX) return App.showToast('Lỗi: Thư viện Excel chưa tải', 'error');
    if (!this.currentListData || this.currentListData.length === 0) return App.showToast('Không có dữ liệu', 'error');

    const exportData = this.currentListData;

    const isCheckinReportList = this.currentListFilter === 'checkin_report_checkin';
    if (isCheckinReportList) {
      const cleanData = exportData.map(s => this.cleanCheckinReportSiteForExport(s));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(cleanData);
      XLSX.utils.book_append_sheet(wb, ws, "Check-in");
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      XLSX.writeFile(wb, `checked_in_${dd}${mm}${yyyy}.xlsx`);
      return;
    }

    const isCheckinMode = this.currentListFilter && this.currentListFilter.includes('checkin');

      const isDelayedMode = this.currentListFilter === 'delayed_sites';
      const isDelayedDkMode = this.currentListFilter === 'delayed_sites_dk';
      const cleanData = exportData.map(s => this.cleanSiteForExport(s, isCheckinMode, isDelayedMode, isDelayedDkMode));


    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(cleanData);
    XLSX.utils.book_append_sheet(wb, ws, "Danh sách");
    
    let safeName = (this.currentListTitle || 'Danh_sach').replace(/[\\/:*?"<>|]/g, '_');
    XLSX.writeFile(wb, safeName + ".xlsx");
  },

  exportDetailExcel() {
    const role = Auth.getRole();
    if (!['admin', 'manager', 'export'].includes(role)) return App.showToast('Tài khoản của bạn không được xuất dữ liệu', 'error');
    if (!window.XLSX) return App.showToast('Lỗi: Thư viện Excel chưa tải', 'error');
    if (!this.currentDetailSite) return;

    const data = Object.keys(this.currentDetailSite)
      .filter(k => k !== 'rowIdx' && k !== 'Long' && k !== 'Lat' && k !== 'Ghi chú (TKTU ONSITE)' && k !== 'NOTE TKTU' && k !== 'SĐT TKTU ONSITE')
      .map(k => {
        const val = this.currentDetailSite[k];
        return { "Trường thông tin": k, "Giá trị": val };
      });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Chi tiết trạm");
    XLSX.writeFile(wb, `Chi_tiet_${this.currentDetailSite['Site']}.xlsx`);
  },

  exportDetailPDF() {
    const role = Auth.getRole();
    if (!['admin', 'manager', 'export'].includes(role)) return App.showToast('Tài khoản của bạn không được xuất dữ liệu', 'error');
    if (!window.html2pdf) return App.showToast('Lỗi: Thư viện PDF chưa tải', 'error');
    const element = document.querySelector('#detail-modal .modal-body');
    const opt = {
      margin:       10,
      filename:     `Chi_tiet_${this.currentDetailSite['Site']}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  },

  // ============================================================
  // Weather Forecast (Open-Meteo API)
  // ============================================================
  async loadWeatherForecast(lat, lng) {
    const container = document.getElementById('weather-content');
    const section = document.getElementById('weather-section');
    if (!container || !section) return;

    // Reset
    container.innerHTML = '<div class="weather-loading"><div class="spinner-small"></div><span>Đang tải thời tiết...</span></div>';
    const labelEl = document.getElementById('weather-active-label');
    if (labelEl) labelEl.textContent = '';

    if (!navigator.onLine) {
      container.innerHTML = '<div class="weather-offline">📴 Không thể tải thời tiết (offline)</div>';
      return;
    }

    if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
      container.innerHTML = '<div class="weather-offline">Không có tọa độ trạm</div>';
      return;
    }

    try {
      const url = `${AppConfig.WEATHER_API}?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m&forecast_hours=24&timezone=Asia/Ho_Chi_Minh`;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('API error');
      const data = await response.json();

      if (!data.hourly || !data.hourly.time) {
        container.innerHTML = '<div class="weather-offline">Không có dữ liệu thời tiết</div>';
        return;
      }

      const times = data.hourly.time;
      const temps = data.hourly.temperature_2m;
      const precips = data.hourly.precipitation;
      const codes = data.hourly.weather_code;
      const winds = data.hourly.wind_speed_10m;

      let html = '<div class="weather-scroll"><div class="weather-grid">';
      for (let i = 0; i < times.length; i++) {
        const time = new Date(times[i]);
        const hour = String(time.getHours()).padStart(2, '0') + ':00';
        let rainClass = '';
        if (precips[i] > 0) {
          if (codes[i] >= 51 && codes[i] <= 57) {
            rainClass = 'weather-drizzle';
          } else {
            rainClass = 'weather-rain';
          }
        }
        const icon = this.getWeatherIcon(codes[i]);
        const label = this.getWeatherLabel(codes[i]);

        html += `
          <div class="weather-hour ${rainClass}" title="${label}" onclick="document.getElementById('weather-active-label').textContent = '${hour} - ${label}'">
            <div class="weather-time">${hour}</div>
            <div class="weather-icon">${icon}</div>
            <div class="weather-temp">${Math.round(temps[i])}°</div>
            <div class="weather-precip">${precips[i] > 0 ? precips[i].toFixed(1) + 'mm' : '-'}</div>
            <div class="weather-wind">${Math.round(winds[i])}km/h</div>
          </div>
        `;
      }
      html += '</div></div>';
      container.innerHTML = html;
    } catch (error) {
      console.error('[Weather] Error:', error);
      container.innerHTML = '<div class="weather-offline">⚠️ Không thể tải thời tiết</div>';
    }
  },

  getWeatherIcon(code) {
    // WMO Weather interpretation codes
    if (code === 0) return '☀️';
    if (code === 1) return '🌤️';
    if (code === 2) return '⛅';
    if (code === 3) return '☁️';
    if (code >= 45 && code <= 48) return '🌫️';
    if (code >= 51 && code <= 55) return '🌦️';
    if (code >= 56 && code <= 57) return '🌧️';
    if (code >= 61 && code <= 65) return '🌧️';
    if (code >= 66 && code <= 67) return '🌨️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 80 && code <= 82) return '🌧️';
    if (code >= 85 && code <= 86) return '🌨️';
    if (code >= 95) return '⛈️';
    return '🌡️';
  },

  getWeatherLabel(code) {
    if (code === 0) return 'Trời quang';
    if (code === 1) return 'Ít mây';
    if (code === 2) return 'Mây rải rác';
    if (code === 3) return 'Nhiều mây';
    if (code >= 45 && code <= 48) return 'Sương mù';
    if (code >= 51 && code <= 55) return 'Mưa phùn';
    if (code >= 56 && code <= 57) return 'Mưa phùn đóng băng';
    if (code >= 61 && code <= 63) return 'Mưa nhỏ';
    if (code >= 64 && code <= 65) return 'Mưa lớn';
    if (code >= 66 && code <= 67) return 'Mưa đóng băng';
    if (code >= 71 && code <= 77) return 'Tuyết';
    if (code >= 80 && code <= 82) return 'Mưa rào';
    if (code >= 85 && code <= 86) return 'Mưa tuyết';
    if (code >= 95) return 'Giông bão';
    return 'Không rõ';
  },

  // ============================================================
  // Diagrams (Google Drive auto-lookup)
  // ============================================================
    loadCheckinImage(site) {
    const container = document.getElementById('checkin-media-content');
    if (!container) return;

    let linkKey = Object.keys(site).find(k => {
      let n = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\-]/g,'');
      return n.includes('linkanhcheckin') || n.includes('anhcheckin') || n === 'linkanh';
    });

    const imageUrl = linkKey ? String(site[linkKey] || '').trim() : '';

    if (!imageUrl || (!imageUrl.includes('drive.google.com') && !imageUrl.includes('http'))) {
      container.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px;text-align:center;">Chưa có ảnh check-in.</div>';
      return;
    }

    // Extract file ID — try known URL shapes first, then fall back to the
    // longest ID-looking token anywhere in the string (Drive URL formats vary).
    let fileId = '';
    const m1 = imageUrl.match(/\/d\/([-\w]+)/);
    const m2 = imageUrl.match(/[?&]id=([-\w]+)/);
    const m3 = imageUrl.match(/([-\w]{20,})/);
    if (m1) fileId = m1[1];
    else if (m2) fileId = m2[1];
    else if (m3) fileId = m3[1];

    if (fileId) {
      const thumbUrl = `https://lh3.googleusercontent.com/d/${fileId}=w400`;
      container.innerHTML = `<div class="diagram-grid">
        <div class="diagram-item" id="checkin-image-item">
          <img id="checkin-image-thumb" src="${thumbUrl}" alt="Ảnh Check-in" loading="lazy">
          <div class="diagram-name">Ảnh Check-in</div>
        </div>
      </div>`;

      const itemEl = document.getElementById('checkin-image-item');
      const imgEl = document.getElementById('checkin-image-thumb');
      // Cả item lẫn ảnh đều mở modal zoom lớn khi bấm (modal đó tự fallback sang backend nếu ảnh lỗi)
      if (itemEl) itemEl.addEventListener('click', () => this.openDiagramViewer(fileId, 'image'));
      // Ảnh check-in (file mới tạo bằng Apps Script) thường không load được qua endpoint thumbnail
      // không chính thức (lh3.googleusercontent.com). Fallback: đọc bytes thật qua backend (đáng tin
      // cậy) rồi gán lại làm data URL — vẫn là <img> thật, không dùng iframe (nuốt click, kẹt UI Drive).
      if (imgEl) imgEl.addEventListener('error', () => {
        DataService.getFileImage(fileId).then(res => {
          if (res.success && res.dataUrl) {
            imgEl.src = res.dataUrl;
          } else {
            imgEl.replaceWith(Object.assign(document.createElement('div'), {
              style: 'width:100%;height:100px;display:flex;align-items:center;justify-content:center;font-size:28px;background:rgba(255,255,255,0.05);',
              textContent: '📷'
            }));
          }
        });
      }, { once: true });
    } else {
      container.innerHTML = `<div style="padding:12px;text-align:center;"><a href="${imageUrl}" target="_blank" style="color:var(--color-blue);text-decoration:none;">Xem ảnh Check-in</a></div>`;
    }
  },

  async loadDiagrams(siteName) {
    const section = document.getElementById('diagram-section');
    const container = document.getElementById('diagram-content');
    if (!section || !container) return;

    // Always show the section now
    section.style.display = '';
    container.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px;">Đang tải sơ đồ...</div>';

    if (!navigator.onLine) {
      container.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px;">📴 Offline</div>';
      return;
    }

    try {
      const result = await DataService.apiCall({ action: 'getDiagrams', site: siteName });
      
      if (!result.success) {
        console.error('[Diagrams API Error]:', result.error || result.message);
        container.innerHTML = `<div style="padding:12px;color:var(--color-danger);font-size:13px;">Lỗi: ${result.error || result.message || 'Lý do không xác định (Vui lòng cấp quyền DriveApp trong Apps Script)'}</div>`;
        return;
      }

      if (!result.diagrams || result.diagrams.length === 0) {
        container.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px;">Chưa có sơ đồ đấu nối cho trạm này.</div>';
        return;
      }

      let html = '<div class="diagram-grid">';

      result.diagrams.forEach((diag, idx) => {
        const isImage = diag.mimeType && diag.mimeType.startsWith('image/');
        const isPDF = diag.mimeType && diag.mimeType === 'application/pdf';

        if (isImage) {
          html += `
            <div class="diagram-item" id="diagram-item-${idx}">
              <img id="diagram-thumb-${idx}" loading="lazy">
              <div class="diagram-name">${diag.name}</div>
            </div>
          `;
        } else {
          html += `
            <div class="diagram-item" id="diagram-item-${idx}">
              <div class="diagram-file-icon">${isPDF ? '📄' : '📎'}</div>
              <div class="diagram-name">${diag.name}</div>
            </div>
          `;
        }
      });

      html += '</div>';
      container.innerHTML = html;

      // Gắn ảnh + sự kiện bằng JS (tránh escaping lỗi khi tên file có dấu nháy, xem quy tắc 10 trong .ai-context.md)
      result.diagrams.forEach((diag, idx) => {
        const isImage = diag.mimeType && diag.mimeType.startsWith('image/');
        const isPDF = diag.mimeType && diag.mimeType === 'application/pdf';
        const itemEl = document.getElementById(`diagram-item-${idx}`);
        if (itemEl) itemEl.addEventListener('click', () => this.openDiagramViewer(diag.id, isImage ? 'image' : (isPDF ? 'pdf' : 'other')));

        if (isImage) {
          const thumbUrl = `https://lh3.googleusercontent.com/d/${diag.id}=w400`;
          const imgEl = document.getElementById(`diagram-thumb-${idx}`);
          if (!imgEl) return;
          imgEl.addEventListener('error', () => {
            imgEl.replaceWith(Object.assign(document.createElement('div'), {
              className: 'diagram-file-icon',
              textContent: '🖼️'
            }));
          }, { once: true });
          imgEl.src = thumbUrl;
        }
      });
    } catch (error) {
      console.error('[Diagrams] Error:', error);
    }
  },

  openDiagramViewer(fileId, type) {
    const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;

    // Create fullscreen overlay
    const overlay = document.createElement('div');
    overlay.className = 'diagram-viewer-overlay';
    overlay.innerHTML = `
      <div class="diagram-viewer-header">
        <button class="diagram-viewer-close" onclick="App.closeDiagramViewer()">✕</button>
        <a href="https://drive.google.com/file/d/${fileId}/view" target="_blank" class="diagram-viewer-open">↗ Mở trong Drive</a>
      </div>
      <div class="diagram-viewer-content" id="diagram-viewer-content" style="overflow: hidden; display: flex; align-items: center; justify-content: center; height: 90vh;">
        ${type === 'image'
          ? `<img id="diagram-zoom-img" src="${directUrl}" alt="Sơ đồ đấu nối" style="max-width:100%;max-height:100%;object-fit:contain;">`
          : `<iframe src="${previewUrl}" style="width:100%;height:100%;border:none;border-radius:8px;"></iframe>`
        }
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      // Only close if clicking outside the image/iframe
      if (e.target === overlay || e.target.className === 'diagram-viewer-content') App.closeDiagramViewer();
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('visible');

      if (type === 'image') {
        const img = document.getElementById('diagram-zoom-img');
        const content = document.getElementById('diagram-viewer-content');
        if (img && content) {
          // Nếu ảnh trực tiếp (endpoint không chính thức lh3.googleusercontent.com) lỗi
          // (rất hay gặp với ảnh check-in mới tạo), đọc bytes thật qua backend (đáng tin cậy)
          // rồi gán lại src — vẫn là <img> thật nên Panzoom hoạt động y hệt trường hợp bình thường.
          // Chỉ dùng iframe /preview làm phương án cuối nếu backend cũng không đọc được.
          img.onerror = () => {
            img.onerror = null;
            DataService.getFileImage(fileId).then(res => {
              if (res.success && res.dataUrl) {
                img.src = res.dataUrl;
              } else {
                content.innerHTML = `<iframe src="${previewUrl}" style="width:100%;height:100%;border:none;border-radius:8px;"></iframe>`;
              }
            });
          };
          img.onload = () => {
            if (!window.Panzoom) return;
            // Thư viện chỉ tự bind kéo-để-pan (drag), KHÔNG tự bind wheel/pinch — 2 việc đó
            // phải tự wire thủ công (xem bên dưới), nên không có xung đột. Zoom luôn gọi
            // panzoom.zoom(scale) KHÔNG kèm điểm focal, nên chỉ phóng to/nhỏ tại chỗ, không
            // tự dịch chuyển ảnh sang trái/phải như zoomWithWheel/zoomToPoint mặc định.
            const panzoom = Panzoom(img, {
              maxScale: 10,
              minScale: 1,
              startScale: 1,
              step: 0.3
            });

            // Cuộn chuột: chỉ đổi scale, không pan theo vị trí con trỏ
            content.addEventListener('wheel', (e) => {
              e.preventDefault();
              const factor = e.deltaY < 0 ? 1.2 : 0.8;
              panzoom.zoom(panzoom.getScale() * factor, { animate: false });
            }, { passive: false });

            // Pinch 2 ngón: Panzoom tự xử lý sẵn (bind pointerdown/pointermove nội bộ),
            // tự tính đúng theo khoảng cách 2 ngón VÀ neo đúng vào điểm giữa 2 ngón
            // (zoomToPoint) — đây là cảm giác pinch-zoom "bình thường". Trước đây có thêm
            // 1 lớp touchstart/touchmove tự viết ở đây gọi panzoom.zoom() KHÔNG kèm điểm
            // focal, chạy song song và ghi đè lên kết quả zoom (có điểm neo) của thư viện
            // mỗi frame — đó là nguyên nhân ảnh "nhảy" liên tục khi pinch trên điện thoại.
            // Đã bỏ lớp tự viết này, để thư viện tự xử lý pinch là đủ.

            let lastTap = 0;
            img.addEventListener('click', (e) => {
              const currentTime = new Date().getTime();
              const tapLength = currentTime - lastTap;
              if (tapLength < 500 && tapLength > 0) {
                const scale = panzoom.getScale();
                panzoom.zoom(scale > 1 ? 1 : 3, { animate: true });
                e.preventDefault();
              }
              lastTap = currentTime;
            });
          };
          // Fallback if image is already cached
          if (img.complete && img.naturalWidth > 0) {
            img.onload();
          }
        }
      }
    });
  },

  closeDiagramViewer() {
    const overlay = document.querySelector('.diagram-viewer-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 300);
    }
  },

  // ============================================================
  // Configuration File (Google Drive)
  // ============================================================
  async loadSiteConfig(siteName) {
    const btnContainer = document.getElementById('config-btn-container');
    const btn = document.getElementById('modal-config-btn');
    if (!btnContainer || !btn) return;

    btnContainer.style.display = 'none';
    if (!navigator.onLine) return;

    try {
      const result = await DataService.apiCall({ action: 'getConfig', site: siteName });
      if (result.success && result.url) {
        btn.href = result.url;
        btnContainer.style.display = 'block';
      }
    } catch (error) {
      console.error('[Config] Error:', error);
    }
  }

  // ============================================================
  // Checkin Feature
  // ============================================================
,
  showCheckinModal() {
    const modal = document.getElementById('checkin-modal');
    if (modal) {
      modal.classList.add('visible');
      // If a site is currently viewed, pre-fill it
      if (this.currentDetailSite && this.currentDetailSite.Site) {
        document.getElementById('checkin-site-input').value = this.currentDetailSite.Site;
      }
    }
  },

  hideCheckinModal() {
    const modal = document.getElementById('checkin-modal');
    if (modal) {
      modal.classList.remove('visible');
      // Reset form
      document.getElementById('checkin-site-input').value = '';
      document.getElementById('checkin-photo').value = '';
      document.getElementById('checkin-photo-preview').src = '';
      document.getElementById('checkin-photo-preview').style.display = 'none';
      this.checkinBase64 = null;
    }
  },

  handleCheckinPhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Compress image
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Add timestamp watermark
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, height - 30, width, 30);
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        const timeStr = new Date().toLocaleString('vi-VN');
        ctx.fillText(timeStr, 10, height - 10);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        this.checkinBase64 = dataUrl;
        
        const preview = document.getElementById('checkin-photo-preview');
        preview.src = dataUrl;
        preview.style.display = 'block';
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  },

  async submitCheckin() {
    const site = document.getElementById('checkin-site-input').value.trim();
    if (!site) {
      return this.showToast('Vui lòng nhập mã trạm', 'error');
    }
    if (!this.checkinBase64) {
      return this.showToast('Vui lòng chụp ảnh checkin', 'error');
    }

    this.showLoading('Đang định vị...');
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });
      
      this.showLoading('Đang gửi báo cáo Checkin...');
      
      const payload = {
        action: 'checkinSite',
        site: site,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        imageBase64: this.checkinBase64,
        username: Auth.getUsername(),
        timestamp: Date.now()
      };
      
      const res = await DataService.apiCall(null, 'POST', payload);
      this.hideLoading();
      
      if (res.success) {
        this.showToast(res.message || 'Checkin thành công', 'success');
        this.hideCheckinModal();
      } else {
        this.showToast('Lỗi: ' + res.error, 'error');
      }
    } catch (e) {
      this.hideLoading();
      if (e.code === 1) {
        this.showToast('Vui lòng cấp quyền vị trí để Checkin', 'error');
      } else {
        this.showToast('Lỗi checkin: ' + e.message, 'error');
      }
    }
  },

};

// ============================================================
// Start App
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

