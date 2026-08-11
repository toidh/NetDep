import { AppConfig } from './config.js';
import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { DataService } from './data.js';
import { Projects } from './projects.js';
/**
 * NetDep - Map Module (Leaflet.js)
 */

// Khoá riêng của dropdown "Trạng thái" — không phải tên cột nào trong sheet, nên đặt
// tiền tố __ để không đụng cột thật khi lọc trong matchesFilters().
const STATUS_FILTER_KEY = '__status';

// 3 mức trạng thái dùng chung mọi dự án, đúng bộ màu marker trong chú thích bản đồ.
const STATUS_FILTER_OPTIONS = [
  { value: 'completed', label: '🟢 Hoàn thành' },
  { value: 'in_progress', label: '🔴 Đang thực hiện' },
  { value: 'not_started', label: '⚪ Chưa thực hiện' }
];

/**
 * Quy trạng thái của trạm về đúng 3 mức trên.
 * getSiteStatus() còn trả 'trien_khai'/'du_phong' (giá trị cột 'Danh sách' của riêng
 * dự án 5G) — với bộ lọc thì cả hai đều là "chưa chạy xong", gom vào 'not_started'.
 */
function statusBucket(site) {
  const s = DataService.getSiteStatus(site);
  if (s === 'completed' || s === 'in_progress') return s;
  return 'not_started';
}

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

export const MapManager = {
  map: null,
  markers: {},
  markerLayer: null,
  sectorLayer: null,
  sectorsVisible: true,
  sectorData: [],
  filterDistrict: '',
  // { tên cột thật (hoặc '__status') : giá trị đang chọn } — dựng theo dự án đang xem
  filterValues: {},
  userMarker: null,
  userCircle: null,
  currentTileLayer: 'satellite',
  streetLayer: null,
  satelliteLayer: null,
  watchId: null,
  mapBearing: 0,
  measureMode: false,
  measurePoints: [],
  measureLayer: null,
  measureMarkers: [],

  // ============================================================
  // Initialize Map
  // ============================================================
  init() {
    // Restore map state
    const savedState = Storage.getMapState();
    const center = savedState ? savedState.center : AppConfig.MAP_CENTER;
    const zoom = savedState ? savedState.zoom : AppConfig.MAP_ZOOM;

    // ⚠️ ĐỪNG thêm lại "fix khe hở tile" bằng cách nới kích thước tile (256 → 256.5px
    // hay +1 điểm ảnh vật lý). Đã đo bằng ảnh chụp A/B trên cùng một khung hình:
    // kéo giãn tile CHÍNH LÀ thứ tạo ra vạch kẻ — ảnh 256px bị nội suy lên kích thước
    // lẻ nên mỗi tile có một viền mờ, tile trên đè viền đó lên tile bên cạnh thành
    // đường kẻ sáng. Để nguyên 256px thì bản đồ sạch (kiểm tra ở devicePixelRatio 1.25).
    // Phòng hờ cho khe thật: nền khung bản đồ để tối trong style.css.

    this.map = L.map('map', {
      preferCanvas: true,
      rotate: true,
      touchRotate: true,
      bounceAtZoomLimits: false,
      bearing: 0,
      center: center,
      zoom: zoom,
      minZoom: AppConfig.MAP_MIN_ZOOM,
      maxZoom: AppConfig.MAP_MAX_ZOOM,
      zoomControl: false,
      zoomAnimation: false,
      attributionControl: false,
    });

    // Add zoom control to bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Tile layers - Google Maps
    this.streetLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '© Google Maps',
    });

    this.satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '© Google Maps',
    });

    // Default to satellite map
    this.satelliteLayer.addTo(this.map);

    // Marker cluster layer
    this.markerLayer = L.layerGroup().addTo(this.map);

    // Sector layer
    this.sectorLayer = L.layerGroup().addTo(this.map);

    // Save map state on move and render viewport
    this.map.on('moveend', () => {
      // Safety net: nếu zoomend không fire đúng lúc pinch-zoom trên mobile (rất hay gặp),
      // overlayPane có thể bị kẹt ở opacity 0 -> marker/sector "biến mất". moveend luôn
      // fire sau đó nên phục hồi lại ở đây.
      const overlayPane = this.map.getPane('overlayPane');
      if (overlayPane) overlayPane.style.opacity = '1';

      const c = this.map.getCenter();
      Storage.setMapState([c.lat, c.lng], this.map.getZoom());
      if (typeof Auth !== 'undefined' && !['view_limited', 'doitac'].includes(Auth.getRole())) {
        this.renderVisibleSites();
        if (this.sectorsVisible) this.renderSectors();
      }
    });
    this.map.on('rotate', () => {
      this.mapBearing = this.map.getBearing ? this.map.getBearing() : 0;
      const needle = document.getElementById('map-bearing-needle');
      if (needle) needle.style.transform = `rotate(${-this.mapBearing}deg)`;
      const bearingVal = document.getElementById('map-bearing-value');
      if (bearingVal) bearingVal.textContent = Math.round(((this.mapBearing % 360) + 360) % 360) + '°';
    });

    // Fix vector layer drifting on mobile pinch-zoom with leaflet-rotate
    this.map.on('zoomstart', () => {
      if (L.Browser.mobile || L.Browser.touch) {
        const pane = this.map.getPane('overlayPane');
        if (pane) pane.style.opacity = '0';
      }
    });
    this.map.on('zoomend', () => {
      if (L.Browser.mobile || L.Browser.touch) {
        const pane = this.map.getPane('overlayPane');
        if (pane) pane.style.opacity = '1';
      }
    });

    // Add legend
    this.addLegend();

    // Measure layer
    this.measureLayer = L.layerGroup().addTo(this.map);
    // Map click for measure
    this.map.on('click', (e) => {
      if (this.measureMode) {
        this._addMeasurePoint(e.latlng);
      }
    });

    // Two-finger touch rotation (mobile)
    
  },

  // ============================================================
  // Toggle Map Layer
  // ============================================================
  toggleLayer() {
    if (this.currentTileLayer === 'street') {
      this.map.removeLayer(this.streetLayer);
      this.satelliteLayer.addTo(this.map);
      this.currentTileLayer = 'satellite';
    } else {
      this.map.removeLayer(this.satelliteLayer);
      this.streetLayer.addTo(this.map);
      this.currentTileLayer = 'street';
    }
    return this.currentTileLayer;
  },

  // ============================================================
  // Create BTS Marker Icon (SVG)
  // ============================================================
  createBTSIcon(status, color, siteName, isDailyPlan) {
    const scale = isDailyPlan ? 1.5 : 1;
    const dotSize = Math.round(14 * scale);
    const outerR = Math.round(7 * scale);
    const midR = Math.round(5 * scale);
    const innerR = Math.round(2.5 * scale);
    const fontSize = Math.round(10 * scale);
    const iconW = Math.round(20 * scale);
    const iconH = Math.round(28 * scale);
    const dotColor = color;

    const svgHtml = `
      <div class="bts-marker-wrapper" style="position:relative;text-align:center;">
        <svg width="${dotSize}" height="${dotSize}" viewBox="0 0 ${dotSize} ${dotSize}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${outerR}" cy="${outerR}" r="${outerR}" fill="${dotColor}"/>
          <circle cx="${outerR}" cy="${outerR}" r="${midR}" fill="white"/>
          <circle cx="${outerR}" cy="${outerR}" r="${innerR}" fill="${dotColor}"/>
        </svg>
        <div style="
          position: absolute;
          top: ${dotSize + 1}px;
          left: 50%;
          transform: translateX(-50%);
          font-family: 'Inter', sans-serif;
          font-size: ${fontSize}px;
          font-weight: 900;
          color: ${dotColor};
          text-shadow: 
            -1px -1px 0 #000,
             1px -1px 0 #000,
            -1px  1px 0 #000,
             1px  1px 0 #000,
             0px  2px 4px rgba(0,0,0,0.8);
          margin-top: -3px;
          white-space: nowrap;
          pointer-events: none;
        ">${siteName}</div>
      </div>
    `;

    return L.divIcon({
      html: svgHtml,
      className: 'bts-icon-container',
      iconSize: [iconW, iconH],
      iconAnchor: [iconW / 2, outerR],
      popupAnchor: [0, -outerR],
    });
  },

  // ============================================================
  // Load Sites on Map
  // ============================================================
  allSites: [],

  loadSites(sites) {
    this.allSites = sites || [];
    if (!sites || sites.length === 0) return;
    this.populateDistrictFilter(this.allSites);
    this.buildFilterControls(this.allSites);
    this.refreshLegend();
    this.applyFilters();
  },

  renderVisibleSites() {
    this.markerLayer.clearLayers();
    this.markers = {};
    if (!this.allSites || this.allSites.length === 0) return;

    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();
    const isZoomedOut = zoom < 14;
    // When zoomed out, we can draw a lot more since they are just dots
    const maxSites = isZoomedOut ? 30000 : 1000;
    let count = 0;

    for (let i = 0; i < this.allSites.length; i++) {
      if (count >= maxSites) break;
      const site = this.allSites[i];
      const lat = parseFloat(site['Lat']);
      const lng = parseFloat(site['Long']);

      if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;

      if (!this.matchesFilters(site)) continue;

      if (!bounds.contains([lat, lng])) continue;

      const siteName = site['Site'] || 'Unknown';
      const status = DataService.getSiteStatus(site);
      const color = DataService.getStatusColor(status, site);
      const isDailyPlan = DataService.isDailyPlan(site);

      let marker;
      if (isZoomedOut) {
        // Draw simple dot without label
        marker = L.circleMarker([lat, lng], {
          radius: 3.5,
          fillColor: color,
          color: '#ffffff',
          weight: 1,
          opacity: 0.8,
          fillOpacity: 1
        });
      } else {
        // Draw full icon with label
        const icon = this.createBTSIcon(status, color, siteName, isDailyPlan);
        marker = L.marker([lat, lng], { icon: icon });
      }

      marker.on('click', () => {
        App.showSiteDetail(site);
      });

      marker.addTo(this.markerLayer);
      this.markers[siteName] = { marker, site };
      count++;
    }
  },

  // ============================================================
  // Filter System
  // ============================================================
  populateDistrictFilter(sites) {
    const districts = new Set();
    sites.forEach(s => {
      const d = String(s['Tỉnh mới'] || '').trim();
      if (d) districts.add(d);
    });

    const select = document.getElementById('filter-district');
    if (!select) return;

    const currentVal = select.value;
    // Keep first option, remove rest
    while (select.options.length > 1) select.remove(1);

    [...districts].sort((a, b) => a.localeCompare(b, 'vi')).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      select.appendChild(opt);
    });

    // Restore selection
    if (currentVal) select.value = currentVal;
  },

  /**
   * Dựng các dropdown lọc theo `mapFilters` của dự án đang xem.
   *
   * Lựa chọn trong mỗi dropdown lấy từ CHÍNH giá trị đang có trong cột đó, không ghi
   * cứng: sheet thêm giá trị mới là bộ lọc tự có, và dự án không có cột đó thì dropdown
   * không hiện (trước đây mọi dự án đều thấy 'Triển khai/Dự phòng' của riêng 5G).
   *
   * Riêng 'Status' lọc theo Trạng thái TÍNH ĐƯỢC (DataService.getSiteStatus) chứ không
   * theo cột trong sheet, để bộ lọc luôn khớp màu marker và số liệu Dashboard.
   */
  buildFilterControls(sites) {
    const bar = document.getElementById('map-filter-bar');
    if (!bar) return;

    // Giữ lại lựa chọn cũ khi đổi tỉnh/tải lại dữ liệu, bỏ lựa chọn của cột không còn nữa
    const previous = Object.assign({}, this.filterValues);
    bar.querySelectorAll('.js-dyn-filter').forEach(el => el.remove());
    this.filterValues = {};

    Projects.mapFilters().forEach(name => {
      const spec = (String(name).toLowerCase() === 'status')
        ? { key: STATUS_FILTER_KEY, label: 'Trạng thái', options: STATUS_FILTER_OPTIONS }
        : this.valueFilterSpec(sites, name);
      if (!spec || !spec.options.length) return;

      const select = document.createElement('select');
      select.className = 'map-filter-select js-dyn-filter';
      select.dataset.field = spec.key;
      select.innerHTML = [`<option value="">📍 Tất cả ${spec.label}</option>`]
        .concat(spec.options.map(o => `<option value="${escapeAttr(o.value)}">${escapeHtml(o.label)}</option>`))
        .join('');

      const keep = previous[spec.key];
      if (keep && spec.options.some(o => o.value === keep)) select.value = keep;
      this.filterValues[spec.key] = select.value;

      select.addEventListener('change', () => this.applyFilters());
      bar.appendChild(select);
    });
  },

  /** Dropdown lọc theo giá trị thật của 1 cột; null nếu dự án không có cột đó. */
  valueFilterSpec(sites, name) {
    const key = Projects.resolveField(sites, name);
    if (!key) return null;

    const values = new Set();
    sites.forEach(s => {
      const v = String(s[key] || '').trim();
      if (v) values.add(v);
    });

    // Chỉ liệt kê giá trị ĐANG CÓ trong cột: chọn một mốc chưa trạm nào đạt tới thì
    // bản đồ trống trơn, người dùng không biết là lọc đúng hay dữ liệu hỏng.
    return {
      key,
      label: name,
      options: [...values]
        .sort((a, b) => a.localeCompare(b, 'vi'))
        .map(v => ({ value: v, label: v }))
    };
  },

  /** Trạm có qua hết bộ lọc đang chọn không (dùng chung cho marker và sector). */
  matchesFilters(site) {
    if (!site) return false;
    if (this.filterDistrict && String(site['Tỉnh mới'] || '').trim() !== this.filterDistrict) return false;

    const keys = Object.keys(this.filterValues || {});
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const want = this.filterValues[key];
      if (!want) continue;

      if (key === STATUS_FILTER_KEY) {
        if (statusBucket(site) !== want) return false;
      } else if (String(site[key] || '').trim() !== want) {
        return false;
      }
    }
    return true;
  },

  toggleFilterBar() {
    const bar = document.getElementById('map-filter-bar');
    if (bar) bar.classList.toggle('active');
  },

  applyFilters() {
    this.filterDistrict = document.getElementById('filter-district')?.value || '';
    document.querySelectorAll('#map-filter-bar .js-dyn-filter').forEach(sel => {
      this.filterValues[sel.dataset.field] = sel.value;
    });
    if (this.markerClusterIndex) {
      this.updateMarkerClusterIndex();
    } else {
      this.renderVisibleSites();
    }
    if (this.sectorsVisible) {
      this.renderSectors();
    }
  },

  // ============================================================
  // Fly to Site
  // ============================================================
  flyToSite(siteName) {
    const site = this.allSites && this.allSites.find(s => s['Site'] === siteName);
    
    if (site) {
      // Always reset to show all when searching a site
      const filterDistrict = document.getElementById('filter-district');
      if (filterDistrict && filterDistrict.value !== '') {
        filterDistrict.value = '';
        this.filterDistrict = '';
      }
      document.querySelectorAll('#map-filter-bar .js-dyn-filter').forEach(sel => {
        sel.value = '';
        this.filterValues[sel.dataset.field] = '';
      });

      this.renderVisibleSites();
      
      const lat = parseFloat(site['Lat']);
      const lng = parseFloat(site['Long']);
      if (!isNaN(lat) && !isNaN(lng)) {
        this.map.flyTo([lat, lng], 17, { duration: 1 });
      }
    } else {
      // Check markers directly
      const entry = this.markers[siteName];
      if (entry) {
        this.map.flyTo(entry.marker.getLatLng(), 17, { duration: 1 });
      } else {
        console.warn('Không tìm thấy trạm:', siteName);
        App.showToast('Không tìm thấy trạm ' + siteName, 'error');
      }
    }
  },

  // ============================================================
  // GPS - Get Current Location
  // ============================================================
  getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation không được hỗ trợ'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;

          this.showUserLocation(lat, lng, accuracy);
          this.map.flyTo([lat, lng], 15, { duration: 1 });

          resolve({ lat, lng, accuracy });
        },
        (error) => {
          let msg = 'Không thể lấy vị trí';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              msg = 'Bạn cần cho phép truy cập vị trí';
              break;
            case error.POSITION_UNAVAILABLE:
              msg = 'Thông tin vị trí không khả dụng';
              break;
            case error.TIMEOUT:
              msg = 'Hết thời gian chờ vị trí';
              break;
          }
          reject(new Error(msg));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  },

  showUserLocation(lat, lng, accuracy) {
    if (this.userMarker) {
      this.map.removeLayer(this.userMarker);
    }
    if (this.userCircle) {
      this.map.removeLayer(this.userCircle);
    }

    // User position dot
    this.userMarker = L.circleMarker([lat, lng], {
      radius: 8,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 1,
      weight: 3,
      className: 'user-location-marker',
    }).addTo(this.map);

    // Accuracy circle
    this.userCircle = L.circle([lat, lng], {
      radius: accuracy,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      weight: 1,
    }).addTo(this.map);

    // Pulsing animation via CSS class
    const el = this.userMarker.getElement();
    if (el) el.classList.add('pulse-marker');
  },

  // ============================================================
  // Watch Position (continuous GPS)
  // ============================================================
  startWatchingPosition() {
    if (!navigator.geolocation) return;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.showUserLocation(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy
        );
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
  },

  stopWatchingPosition() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  },

  // ============================================================
  // Điểm toạ độ gõ tay (dự án bật coordSearch)
  // ============================================================
  coordMarker: null,

  /**
   * Đánh dấu một toạ độ người dùng gõ vào ô tìm kiếm. Dùng cho trạm đối thủ —
   * chưa có mã trạm trong hệ thống nên không thể tra theo tên, chỉ có vị trí.
   * Mỗi lần tìm chỉ giữ 1 điểm, tránh rải marker rác khắp bản đồ.
   */
  showCoordinateMarker(lat, lng) {
    if (!this.map) return;
    if (this.coordMarker) {
      this.map.removeLayer(this.coordMarker);
      this.coordMarker = null;
    }

    const icon = L.divIcon({
      className: '',
      html: `<div style="position:relative;transform:translate(-50%,-100%);">
          <svg width="30" height="40" viewBox="0 0 24 32">
            <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="#f59e0b" stroke="#fff" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="4.5" fill="#fff"/>
          </svg>
        </div>`,
      iconSize: [30, 40],
      iconAnchor: [0, 0],
    });

    this.coordMarker = L.marker([lat, lng], { icon }).addTo(this.map);
    this.coordMarker.bindPopup(`
      <div style="font-family:'Inter',sans-serif;font-size:12px;min-width:190px;">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#f59e0b;">📍 Vị trí đã nhập</div>
        <div style="color:#94a3b8;margin-bottom:8px;">${lat}, ${lng}</div>
        <button onclick="App.navigateToCoordinates(${lat}, ${lng})"
          style="width:100%;padding:8px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer;font-family:inherit;">
          Dẫn đường tới đây
        </button>
      </div>`, { maxWidth: 240 });

    // Huỷ animation đang chạy dở trước khi bay, nếu không lệnh flyTo có thể bị
    // nuốt mất và bản đồ đứng yên (hay gặp ngay sau khi bản đồ vừa khởi tạo).
    if (this.map.stop) this.map.stop();
    this.map.flyTo([lat, lng], 17, { duration: 1 });

    // Mở popup khi bay xong; kèm hẹn giờ dự phòng phòng khi moveend không kích hoạt
    let opened = false;
    const openIt = () => {
      if (opened || !this.coordMarker) return;
      opened = true;
      this.coordMarker.openPopup();
    };
    this.map.once('moveend', openIt);
    setTimeout(openIt, 1400);
  },

  // ============================================================
  // Navigate to Site (Open in Google Maps)
  // ============================================================
  navigateToSite(lat, lng) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, '_blank');
  },

  // ============================================================
  // Update single marker
  // ============================================================
  updateMarker(site) {
    const siteName = site['Site'];
    const entry = this.markers[siteName];
    if (!entry) return;

    const status = DataService.getSiteStatus(site);
    const color = DataService.getStatusColor(status, site);
    const isDailyPlan = DataService.isDailyPlan(site);
    const icon = this.createBTSIcon(status, color, siteName, isDailyPlan);

    entry.marker.setIcon(icon);
    entry.site = site;
  },

  // ============================================================
  // Legend
  // ============================================================
  legendControl: null,

  addLegend() {
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = this.legendHTML();
      return div;
    };
    legend.addTo(this.map);
    this.legendControl = legend;
  },

  /** Vẽ lại chú thích khi đổi dự án / tải xong dữ liệu (mốc tiến độ khác nhau). */
  refreshLegend() {
    const el = this.legendControl && this.legendControl.getContainer();
    if (el) el.innerHTML = this.legendHTML();
  },

  /**
   * Chú thích màu marker.
   *
   * Dự án chỉ có MỘT cột tiến độ thì liệt kê thẳng các mốc của cột đó (Newsite:
   * Chưa thuê → Phát sóng) — đúng thứ ngôn ngữ người dùng nhìn thấy trong sheet và
   * trong dropdown cập nhật, thay vì 3 chữ 'Hoàn thành/Đang thực hiện' chung chung.
   * Chỉ lấy mốc ĐANG CÓ trong dữ liệu, xếp theo thứ tự khai trong registry.
   *
   * Nhiều cột tiến độ (Swap: 4G + 5G) thì màu marker là kết luận của cả hai cột, không
   * quy được về giá trị của riêng cột nào — giữ 3 mức trạng thái chung.
   */
  legendHTML() {
    const sectorRows = `
        <div style="border-top:1px solid rgba(255,255,255,0.15);margin:4px 0;"></div>
        <div class="legend-item"><span class="legend-dot" style="background:#00C853"></span> Sector 5G</div>
        <div class="legend-item"><span class="legend-dot" style="background:#FFD600"></span> Sector 4G</div>
        <div class="legend-item"><span class="legend-dot" style="background:#FF1744"></span> Sector 4G700</div>`;

    const row = (color, text) =>
      `<div class="legend-item"><span class="legend-dot" style="background:${color}"></span> ${escapeHtml(text)}</div>`;

    const values = this.legendProgressValues();
    const rows = values.length
      ? values.map(v => row(DataService.progressValueColor(v), v)).join('')
      : [
          row(AppConfig.COLORS.DEFAULT, 'Chưa thực hiện'),
          row('#dc2626', 'Đang thực hiện'),
          row('#16a34a', 'Hoàn thành')
        ].join('');

    return `<div class="legend-title">Chú thích</div>${rows}${sectorRows}`;
  },

  /** Các mốc tiến độ có thật trong dữ liệu, theo thứ tự registry; [] nếu không dùng được. */
  legendProgressValues() {
    const fields = Projects.progressFields();
    if (fields.length !== 1) return [];

    const key = Projects.resolveField(this.allSites, fields[0]);
    if (!key || !this.allSites.length) return [];

    const present = new Set();
    this.allSites.forEach(s => {
      const v = String(s[key] || '').trim();
      if (v) present.add(v);
    });
    if (!present.size) return [];

    const ordered = Projects.progressOptions().filter(v => present.has(v));
    ordered.forEach(v => present.delete(v));
    // Giá trị lạ (gõ tay sai chính tả trong sheet) vẫn hiện, kèm màu nó đang được tô
    return ordered.concat([...present].sort((a, b) => a.localeCompare(b, 'vi')));
  },

  // ============================================================
  // Sector Rendering
  // ============================================================
  destinationPoint(lat, lng, bearing, distanceMeters) {
    const R = 6371000;
    const d = distanceMeters / R;
    const brng = bearing * Math.PI / 180;
    const lat1 = lat * Math.PI / 180;
    const lng1 = lng * Math.PI / 180;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
    );
    const lng2 = lng1 + Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
    return [lat2 * 180 / Math.PI, lng2 * 180 / Math.PI];
  },

  getSectorType(sectorObj) {
    if (!sectorObj) return 'other';
    const keys = Object.keys(sectorObj);
    const techKey = keys.find(k => {
      const norm = k.toLowerCase().normalize('NFC').replace(/\s+/g, '');
      return norm === 'côngnghệ' || norm === 'congnghe' || norm === 'tech';
    });
    
    let tech = '';
    if (techKey) {
      tech = String(sectorObj[techKey]).toUpperCase();
    } else {
      // Fallback: look at the sector name
      tech = String(sectorObj['Sector'] || '').toUpperCase();
    }

    // Thứ tự kiểm tra quan trọng: '4G700' cũng chứa '4G', nếu xét '4g' trước thì
    // sector 700 bị gom vào 4G thường và không bao giờ nhận diện được.
    const norm = tech.replace(/[\s_-]/g, '');
    if (norm.includes('4G700') || norm.includes('700')) return '4g700';
    if (norm.includes('5G')) return '5g';
    if (norm.includes('4G')) return '4g';
    return 'other';
  },

  getMarkerColor(status, site) {
    if (status === 'completed') return '#059669';    // Green
    if (status === 'in_progress') return '#d97706';  // Orange
    if (DataService.isSiteInTodayPlan(site)) return '#dc2626'; // Red for today's plan
    
    switch (status) {
      case 'type_5g_4g': return '#2563eb';   // Blue
      case 'type_5g': return '#9333ea';      // Purple
      case 'type_4g': return '#ca8a04';      // Yellow
      default: return '#64748b';             // Slate
    }
  },

  getSectorColor(type) {
    switch (type) {
      case '5g': return '#00C853';    // xanh lá
      case '4g700': return '#FF1744'; // đỏ
      case '4g': return '#FFD600';    // vàng
      default: return '#FFEE00';
    }
  },

  /**
   * Hình dạng cánh sector theo công nghệ — NGUỒN DUY NHẤT.
   * Gom về đây để bản đồ đầy đủ (renderSectors) và bản đồ 1 trạm cho role hạn chế
   * (loadSectorsForSite) vẽ giống hệt nhau; trước đây mỗi nơi một bộ số nên cùng
   * một sector 5G lại dài ngắn khác nhau tuỳ màn hình.
   *
   * 4G700 phủ xa nhất nên cánh dài hơn cả 5G, và được vẽ trước để nằm dưới cùng
   * (xem thứ tự sắp xếp trong setSectorData).
   */
  getSectorStyle(type) {
    switch (type) {
      case '4g700': return { length: 240, beamWidth: 30, fillOpacity: 0.35 };
      case '5g':    return { length: 171, beamWidth: 24, fillOpacity: 0.55 };
      case '4g':    return { length: 130, beamWidth: 24, fillOpacity: 0.45 };
      default:      return { length: 130, beamWidth: 30, fillOpacity: 0.2 };
    }
  },

  setSectorData(sectors) {
    const data = sectors || [];
    // Thứ tự vẽ = thứ tự chồng lớp: vẽ trước nằm dưới. 4G700 có cánh dài nhất nên
    // vẽ đầu tiên để nằm dưới cùng, thò ra ngoài mà không che 5G/4G bên trên.
    const getOrder = (type) => {
      if (type === '4g700') return 1;
      if (type === '5g') return 2;
      if (type === '4g') return 3;
      return 4;
    };
    data.sort((a, b) => {
      const typeA = this.getSectorType(a);
      const typeB = this.getSectorType(b);
      return getOrder(typeA) - getOrder(typeB);
    });
    this.sectorData = data;
  },

  loadSectors(sectors) {
    this.setSectorData(sectors);
    this.renderSectors();
  },

  /**
   * Xoá sạch sector đang vẽ VÀ dữ liệu sector trong bộ nhớ.
   * Dùng khi đổi dự án: sector của dự án cũ phải biến mất ngay, không đợi
   * fetch dự án mới xong — các dự án có thể có sector trùng tên nhưng thông
   * tin khác nhau, để sót lại là hiển thị sai dữ liệu dưới tên dự án mới.
   */
  clearSectors() {
    this.sectorData = [];
    if (this.sectorLayer) this.sectorLayer.clearLayers();
    if (this.map) this.map.closePopup();
  },

  /**
   * Gắn popup cho 1 sector, luôn mở tại `anchor` (giữa cánh sector) thay vì tại
   * điểm ngón tay chạm. Leaflet mặc định mở popup của Path ngay chỗ click, nên
   * chạm lệch vào rìa cánh quạt sẽ thấy popup "nhảy" ra xa khỏi sector.
   */
  bindSectorPopup(layers, popupHtml, anchor) {
    const openAtAnchor = (e) => {
      L.DomEvent.stopPropagation(e);
      // maxWidth phải đủ cho popup đối chiếu của CSDL: nhãn + số FT + ô nhập hậu kiểm
      // + cột ảnh. Để 260 như trước thì Leaflet bóp khung trắng lại, cột hậu kiểm bị
      // cắt mất một nửa và ô nhập tràn ra ngoài viền.
      L.popup({
        autoPan: false,
        maxWidth: Math.min(430, Math.max(260, window.innerWidth - 40)),
        className: 'sector-popup-wrap'
      })
        .setLatLng(anchor)
        .setContent(popupHtml)
        .openOn(this.map);
    };
    layers.forEach(layer => layer.on('click', openAtAnchor));
  },

  /**
   * Các cột số liệu của sector nằm trong nhóm mà registry chỉ định (`sectorPopup`).
   *
   * Sheet CSDL có HAI nhóm cột trùng tên nhau ("Dữ liệu FT kiểm tra" và "Dữ liệu hậu
   * kiểm": cùng có Azimuth, Tilt cơ, Loại Antenna...). Tra thẳng sector['Azimuth'] thì
   * không biết mình đang lấy số của nhóm nào — phải chốt theo tiền tố nhóm.
   *
   * Trả [] nếu dự án không khai `sectorPopup` (các dự án khác giữ popup như cũ).
   */
  sectorGroupRows(sector) {
    const cfg = Projects.current().sectorPopup;
    if (!sector || !cfg || !cfg.group) return [];

    const norm = (s) => String(s).toLowerCase().normalize('NFC').replace(/\s+/g, '');
    const prefix = norm(cfg.group) + '-';
    const keys = Object.keys(sector).filter(k => norm(k).startsWith(prefix));

    // Khai `fields` thì chỉ lấy đúng những cột đó, theo thứ tự đã khai; không khai thì
    // lấy mọi cột của nhóm, giữ nguyên thứ tự cột trong sheet.
    const wanted = Array.isArray(cfg.fields) && cfg.fields.length ? cfg.fields : null;
    let ordered = wanted
      ? wanted.map(f => keys.find(k => norm(k) === prefix + norm(f))).filter(Boolean)
      : keys;

    // `exclude`: bỏ vài cột không cần xem. Dùng danh sách LOẠI TRỪ thay vì bắt khai đủ
    // danh sách giữ lại — gõ sai một tên thì cột đó vẫn hiện (thừa, nhìn ra ngay), chứ
    // không âm thầm biến mất như khi dùng danh sách giữ lại.
    if (Array.isArray(cfg.exclude) && cfg.exclude.length) {
      const bo = cfg.exclude.map(f => prefix + norm(f));
      ordered = ordered.filter(k => !bo.includes(norm(k)));
    }

    // Nhóm đối chiếu (CSDL: "Dữ liệu hậu kiểm"): lấy cột CÙNG TÊN ở nhóm kia để hiện
    // cạnh số của FT, kèm khoá thật của cột đó để nút ✏️ biết ghi vào đâu.
    const editPrefix = cfg.editGroup ? norm(cfg.editGroup) + '-' : null;
    const allKeys = Object.keys(sector);

    return ordered
      .map(k => {
        const label = k.slice(cfg.group.length + 3).trim() || k;
        const row = { key: k, label, value: String(sector[k] ?? '').trim() };
        if (editPrefix) {
          const twin = allKeys.find(x => norm(x) === editPrefix + norm(label));
          if (twin) {
            row.editKey = twin;
            row.editValue = String(sector[twin] ?? '').trim();
          }
        }
        return row;
      })
      .filter(r => r.value !== '' || r.editValue);
  },

  /**
   * Khoá thật của cột lưu ảnh hạng mục trong object sector.
   *
   * Tra theo tên chuẩn hoá chứ không tra thẳng sector[cfg.photoColumn]: sheet 2 tầng
   * tiêu đề có thể sinh ra khoá dạng "<Nhóm> - Ảnh hạng mục" nếu người dùng đặt cột
   * nằm dưới một ô nhóm nào đó. Trả null nếu sheet chưa có cột.
   */
  sectorPhotoKey(sector) {
    const col = (Projects.current().sectorPopup || {}).photoColumn;
    if (!sector || !col) return null;
    const norm = (s) => String(s).toLowerCase().normalize('NFC').replace(/\s+/g, '');
    const want = norm(col);
    const keys = Object.keys(sector);
    return keys.find(k => norm(k) === want)
        || keys.find(k => norm(k).endsWith('-' + want))
        || null;
  },

  /**
   * Ảnh đã chụp của sector, gom theo hạng mục: { '<hạng mục chuẩn hoá>': [url, ...] }.
   *
   * Ô trong sheet là nhiều dòng "Hạng mục | link". Dòng không có dấu '|' (ảnh cũ, hoặc
   * dán tay) được xếp vào hạng mục rỗng để vẫn xem được chứ không biến mất.
   */
  sectorPhotoMap(sector) {
    const out = {};
    const key = this.sectorPhotoKey(sector);
    if (!key) return out;

    const norm = (s) => String(s).toLowerCase().normalize('NFC').replace(/\s+/g, '');
    String(sector[key] || '').split(/[\n\r]+/).forEach(line => {
      const raw = line.trim();
      if (!raw) return;
      const cut = raw.indexOf('|');
      const label = cut >= 0 ? raw.slice(0, cut).trim() : '';
      const url = (cut >= 0 ? raw.slice(cut + 1) : raw).trim();
      if (!/^https?:\/\//i.test(url)) return;
      (out[norm(label)] = out[norm(label)] || []).push(url);
    });
    return out;
  },

  /**
   * Popup sector dạng đối chiếu 2 nhóm: số đo FT (chỉ đọc) cạnh số đo hậu kiểm (sửa
   * được). FT ra hiện trường bấm ✏️ nhập luôn giá trị mới, khỏi phải mở sheet.
   */
  sectorGroupPopupHtml(sector, sectorName, siteName, type, color, rows) {
    const cfg = Projects.current().sectorPopup || {};
    const canEdit = Projects.canEdit(Auth.getRole());
    const hasEditCol = !!cfg.editGroup && rows.some(r => r.editKey);
    const dash = (v) => (v === undefined || v === null || v === '') ? '-' : escapeHtml(v);
    const attr = (v) => escapeAttr(String(v ?? ''));

    // Cột ảnh chỉ hiện khi dự án khai `photoColumn`. Người không có quyền sửa vẫn XEM
    // được ảnh (hậu kiểm mở ra đối chiếu), chỉ không thấy nút thêm ảnh.
    const hasPhotoCol = !!cfg.photoColumn;
    const photos = hasPhotoCol ? this.sectorPhotoMap(sector) : {};
    const normLbl = (s) => String(s).toLowerCase().normalize('NFC').replace(/\s+/g, '');

    // Cột nhãn phải được ưu tiên: tên cột của sheet CSDL khá dài ("Độ cao anten so với
    // chân cột"), bị bóp là xuống 3-4 dòng và popup cao gấp đôi.
    // Cột giá trị để `minmax(0, auto)` chứ không phải `auto`: mã antenna kiểu
    // "APXV18_206516S_C_4G" là một "từ" dài, track `auto` sẽ giãn theo nó và ăn hết
    // phần của cột nhãn. minmax(0,...) + overflow-wrap cho phép nó tự xuống dòng.
    // clamp cho cột nhãn: màn hình rộng thì 132px (nhãn dài nhất gọn trong 2 dòng),
    // điện thoại hẹp thì tự co lại thay vì đẩy cột ảnh tràn ra ngoài khung trắng.
    const cols = ['minmax(clamp(96px, 26vw, 132px), 1.3fr)', hasEditCol ? 'minmax(0, auto)' : '1fr']
      .concat(hasEditCol ? ['auto'] : [])
      .concat(hasPhotoCol ? ['auto'] : [])
      .join(' ');

    const headCell = (text, align) =>
      `<span style="color:#64748b;font-size:10px;text-transform:uppercase;text-align:${align};">${escapeHtml(text)}</span>`;
    const header = (hasEditCol || hasPhotoCol)
      ? `<span></span>
         ${headCell(cfg.group, 'right')}
         ${hasEditCol ? headCell(cfg.editGroup, 'center') : ''}
         ${hasPhotoCol ? headCell('Ảnh', 'center') : ''}`
      : '';

    /**
     * Ô ảnh của một hạng mục: các link ảnh đã có (đánh số 1,2,3...) + nút thêm ảnh.
     * Tên hạng mục đi qua `data-item` chứ không nhét vào chuỗi onclick — nhãn tiếng
     * Việt có dấu nháy/ngoặc sẽ làm vỡ chuỗi onclick lồng nhau.
     */
    const photoCell = (label) => {
      if (!hasPhotoCol) return '';
      const urls = photos[normLbl(label)] || [];
      const chips = urls.map((u, i) =>
        `<a href="${attr(u)}" target="_blank" rel="noopener" class="sector-photo-chip"
            title="${attr(label)} — ảnh ${i + 1}">${i + 1}</a>`).join('');
      const add = canEdit
        ? `<button type="button" class="sector-photo-add" data-item="${attr(label)}"
             title="Chụp / thêm ảnh: ${attr(label)}"
             onclick="window.App.pickSectorPhoto(this)">＋</button>`
        : '';
      return `<span class="sector-photo-cell">${chips}${add}</span>`;
    };

    // Ô nhập ngay trong popup: FT gõ hết các giá trị rồi bấm LƯU một lần, thay vì mỗi
    // dòng một hộp thoại. `data-col` giữ đúng tên cột sheet, `data-goc` để so xem ô nào
    // thật sự đổi — chỉ ghi những ô đã đổi, đỡ đụng vào sheet vô ích.
    const inputCell = (r) => {
      if (!r.editKey) return '<span></span>';
      if (!canEdit) return `<span style="font-weight:600;text-align:right;color:#38bdf8;">${dash(r.editValue)}</span>`;
      return `<input class="sector-cell-input" type="text"
                data-col="${attr(r.editKey)}" data-goc="${attr(r.editValue || '')}"
                value="${attr(r.editValue || '')}"
                style="width:clamp(56px, 17vw, 88px);padding:4px 6px;font-size:12px;font-weight:600;text-align:right;
                       color:#ffffff;background:rgba(56,189,248,0.10);
                       border:1px solid rgba(56,189,248,0.45);
                       border-radius:5px;outline:none;font-family:inherit;">`;
    };

    const body = rows.map(r => `
      <span style="color:#94a3b8;">${escapeHtml(r.label)}</span>
      <span style="font-weight:600;text-align:right;overflow-wrap:anywhere;">${dash(r.value)}</span>
      ${hasEditCol ? inputCell(r) : ''}
      ${photoCell(r.label)}
    `).join('');

    // Hạng mục CHỈ có ảnh (`photoItems`, vd "Tổng quan cột"): không gắn với cột số đo
    // nào nên xếp thành khối riêng dưới bảng, ngăn bằng một vạch mảnh cho khỏi lẫn với
    // các dòng đối chiếu FT ↔ hậu kiểm ở trên.
    const extraItems = (hasPhotoCol && Array.isArray(cfg.photoItems)) ? cfg.photoItems : [];
    const colSpan = 2 + (hasEditCol ? 1 : 0) + (hasPhotoCol ? 1 : 0);
    const extraBlock = extraItems.length ? `
      <div style="grid-column:1/-1;height:1px;background:rgba(148,163,184,0.25);margin:4px 0 2px;"></div>
      <span style="grid-column:1/-1;color:#64748b;font-size:10px;text-transform:uppercase;">Ảnh hạng mục khác</span>
      ${extraItems.map(item => `
        <span style="color:#94a3b8;grid-column:span ${colSpan - 1};">${escapeHtml(item)}</span>
        ${photoCell(item)}
      `).join('')}` : '';

    const saveBtn = (hasEditCol && canEdit) ? `
      <button type="button"
        onclick="window.App.saveSectorCells('${attr(siteName)}', '${attr(sectorName)}', this)"
        style="margin-top:10px;width:100%;padding:7px 10px;font-size:12px;font-weight:700;
               color:#fff;background:#16a34a;border:none;border-radius:6px;cursor:pointer;
               font-family:inherit;">💾 LƯU</button>` : '';

    // Leaflet co khung popup vừa khít nội dung, nên min-width ở đây mới là thứ quyết
    // định bề rộng khung trắng. Cộng đúng bề rộng mong muốn của từng cột đang hiện
    // (nhãn + số FT + ô nhập hậu kiểm + ảnh) cộng khoảng cách 8px giữa các cột — thiếu
    // là lưới tự bóp cột số liệu xuống ~50px và mọi giá trị đều xuống dòng.
    // Chặn trên theo bề rộng màn hình để trên điện thoại popup không tràn ra ngoài;
    // hẹp quá thì `.sector-popup` cuộn ngang trong khung trắng (xem style.css).
    const idealW = 132
      + (hasEditCol ? 8 + 104 + 8 + 88 : 8 + 120)
      + (hasPhotoCol ? 8 + 74 : 0);
    const minW = Math.min(idealW, Math.max(220, window.innerWidth - 56));

    // data-site/data-sector cho các nút trong popup biết mình thuộc sector nào mà không
    // phải nhét chuỗi tên trạm vào từng onclick.
    return `
      <div class="sector-popup" data-site="${attr(siteName)}" data-sector="${attr(sectorName)}"
           style="font-family:'Inter',sans-serif;font-size:12px;min-width:${minW}px;">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:${color};">${escapeHtml(sectorName)}</div>
        <div style="display:grid;grid-template-columns:${cols};gap:5px 8px;align-items:center;">
          ${header}
          <span style="color:#94a3b8;">Tech</span>
          <span style="font-weight:700;color:${color};text-align:right;">${type.toUpperCase()}</span>
          ${hasEditCol ? '<span></span>' : ''}
          ${hasPhotoCol ? '<span></span>' : ''}
          ${body}
          ${extraBlock}
        </div>
        ${saveBtn}
      </div>
    `;
  },

  /** Góc azimuth để vẽ cánh sector — ưu tiên cột trong nhóm mà registry chỉ định. */
  sectorAzimuth(sector) {
    if (!sector) return 0;
    const cfg = Projects.current().sectorPopup;
    if (cfg && cfg.group) {
      const norm = (s) => String(s).toLowerCase().normalize('NFC').replace(/\s+/g, '');
      const want = norm(cfg.group) + '-' + norm(cfg.azimuthField || 'Azimuth');
      const key = Object.keys(sector).find(k => norm(k) === want);
      if (key) return parseFloat(sector[key]) || 0;
    }
    return parseFloat(sector['Azimuth']) || 0;
  },

  renderSectors() {
    this.sectorLayer.clearLayers();
    if (!this.sectorsVisible || !this.sectorData.length) return;

    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();
    if (zoom < 13) return; // Hide sectors at low zoom for performance

    // Build a lookup map for O(1) site lookups (avoid O(n) find in loop)
    const siteMap = new Map();
    if (this.allSites) {
      this.allSites.forEach(s => siteMap.set(String(s['Site']).trim(), s));
    }

    let count = 0;
    const maxSectors = 2000;

    for (let i = 0; i < this.sectorData.length; i++) {
      if (count >= maxSectors) break;
      const sector = this.sectorData[i];

      const siteName = String(sector['Site'] || sector['Mã trạm'] || sector['Mã Trạm'] || '').trim();

      // Sector đi theo trạm của nó: trạm bị lọc thì cánh sector cũng phải biến mất.
      // Không tra được trạm (sector của dự án khác / sai tên) thì vẫn vẽ, như trước.
      const siteObj = siteMap.get(siteName) || null;
      if (siteObj && !this.matchesFilters(siteObj)) continue;


      const lat = parseFloat(sector['Lat']);
      const lng = parseFloat(sector['Long']);
      const azimuth = this.sectorAzimuth(sector);

      if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;
      if (!bounds.contains([lat, lng])) continue;

      const type = this.getSectorType(sector);
      if (type === 'other') continue;

      const color = this.getSectorColor(type);
      const style = this.getSectorStyle(type);
      const beamWidth = style.beamWidth;
      const fOpacity = style.fillOpacity;
      // Static length reduction to 60%
      const length = style.length * 0.6;

      const origin = [lat, lng];
      const arcPts = [origin];
      for (let a = azimuth - beamWidth; a <= azimuth + beamWidth; a += 5) {
        arcPts.push(this.destinationPoint(lat, lng, a, length));
      }
      arcPts.push(origin);
      
      const shape = L.polygon(arcPts, {
        color: color, fillColor: color,
        fillOpacity: fOpacity, weight: 1.5, opacity: 0.8,
      });

      const val = (v) => (v !== undefined && v !== null && String(v).trim() !== '') ? v : '-';
      const sectorName = sector['Sector'] || 'Unknown';
      const canEditSector = ['admin', 'manager'].includes(Auth.getRole());
      const editIcon = (field, fieldVal) => canEditSector
        ? `<span style="cursor:pointer;opacity:0.6;font-size:11px;margin-left:4px;" onclick="window.App.editSectorField('${siteName}', '${sectorName}', '${field}', '${String(fieldVal).replace(/'/g,"\\'")}', '${type}')">✏️</span>`
        : '';
      // Grid 2 cột (thay vì bảng 1 cột 9 dòng) để popup thấp hơn hẳn — trên mobile
      // popup cao khiến Leaflet tự pan bản đồ đi xa để "nhét vừa", tạo cảm giác
      // chọn sector là bản đồ bị nhảy sang chỗ khác.
      // Dự án khai `sectorPopup` (CSDL) thì popup dựng từ đúng nhóm cột đó — chỉ đọc,
      // không có nút sửa vì các cột này không nằm trong bộ trường mà updateSector ghi.
      const groupRows = this.sectorGroupRows(sector);
      const popupHtml = groupRows.length
        ? this.sectorGroupPopupHtml(sector, sectorName, siteName, type, color, groupRows)
        : `
        <div style="font-family:'Inter',sans-serif;font-size:12px;min-width:210px;max-width:250px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:${color};">${sectorName}</div>
          <div style="display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px 6px;">
            <span style="color:#94a3b8;">Tech</span><span style="font-weight:700;color:${color};">${type.toUpperCase()}</span>
            <span style="color:#94a3b8;">Cấu hình</span><span style="font-weight:600;">${val(sector['Cấu hình mới'])}${editIcon('cauHinhMoi', val(sector['Cấu hình mới']))}</span>
            <span style="color:#94a3b8;">Cao cột</span><span style="font-weight:600;">${val(sector['Độ cao cột'])}m${editIcon('doCaoCot', val(sector['Độ cao cột']))}</span>
            <span style="color:#94a3b8;">Cao/chân</span><span style="font-weight:600;">${val(sector['Độ cao so với chân cột'])}m${editIcon('doCaoChanCot', val(sector['Độ cao so với chân cột']))}</span>
            <span style="color:#94a3b8;">Cao/đất</span><span style="font-weight:600;">${val(sector['Độ cao so với mặt đất'])}m${editIcon('doCaoMatDat', val(sector['Độ cao so với mặt đất']))}</span>
            <span style="color:#94a3b8;">GPS/chân</span><span style="font-weight:600;">${val(sector['Độ cao GPS so với chân cột'])}m${editIcon('doCaoGPSChanCot', val(sector['Độ cao GPS so với chân cột']))}</span>
            <span style="color:#94a3b8;">Azimuth</span><span style="font-weight:600;">${val(sector['Azimuth'])}°${editIcon('azimuth', val(sector['Azimuth']))}</span>
            <span style="color:#94a3b8;">Tilt cơ</span><span style="font-weight:600;">${val(sector['Tilt cơ'])}°${editIcon('tiltCo', val(sector['Tilt cơ']))}</span>
            <span style="color:#94a3b8;">Tilt điện</span><span style="font-weight:600;">${val(sector['Tilt điện'])}°${editIcon('tiltDien', val(sector['Tilt điện']))}</span>
          </div>
        </div>
      `;
      shape.addTo(this.sectorLayer);

      // Vùng chạm ẩn, kích thước cố định theo pixel (không co lại khi zoom out) đặt
      // giữa cánh sector — cánh sector là hình quạt mỏng nên rất khó bấm trúng trên
      // mobile; vùng tròn 16px này giúp bấm trúng đúng sector, không lệch sang trạm khác.
      const hitPoint = this.destinationPoint(lat, lng, azimuth, length * 0.65);
      const hitCircle = L.circleMarker(hitPoint, {
        radius: 16,
        stroke: false,
        fillOpacity: 0,
        interactive: true,
      }).addTo(this.sectorLayer);

      // Popup neo cố định giữa cánh sector, không chạy theo điểm chạm
      this.bindSectorPopup([shape, hitCircle], popupHtml, hitPoint);

      count++;
    }
  },

  toggleSectors() {
    this.sectorsVisible = !this.sectorsVisible;
    if (this.sectorsVisible) {
      this.renderSectors();
    } else {
      this.sectorLayer.clearLayers();
    }
    return this.sectorsVisible;
  },

  // ============================================================
  // Load Single Site (for view_limited role)
  // ============================================================
  loadSingleSite(site) {
    this.markerLayer.clearLayers();
    this.markers = {};

    const lat = parseFloat(site['Lat']);
    const lng = parseFloat(site['Long']);
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

    const siteName = site['Site'] || 'Unknown';
    const status = DataService.getSiteStatus(site);
    const color = DataService.getStatusColor(status, site);
    const isDailyPlan = DataService.isDailyPlan(site);

    const icon = this.createBTSIcon(status, color, siteName, isDailyPlan);
    const marker = L.marker([lat, lng], { icon: icon });

    marker.on('click', () => {
      App.showSiteDetail(site);
    });

    marker.addTo(this.markerLayer);
    this.markers[siteName] = { marker, site };

    // Fly to the site
    this.map.flyTo([lat, lng], 17, { duration: 1 });
  },

  // ============================================================
  // Load Sectors for a specific site only (for view_limited role)
  // ============================================================
  loadSectorsForSite(siteName) {
    this.sectorLayer.clearLayers();
    if (!this.sectorData.length) return;

    const upperName = siteName.toUpperCase();
    this.sectorData.forEach(sector => {
      const sectorSiteName = String(sector['Site'] || sector['Mã trạm'] || sector['Mã Trạm'] || '').trim().toUpperCase();
      if (sectorSiteName !== upperName) return;

      const lat = parseFloat(sector['Lat']);
      const lng = parseFloat(sector['Long']);
      const azimuth = this.sectorAzimuth(sector);
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

      const type = this.getSectorType(sector);
      if (type === 'other') return; // Bỏ qua sector khác

      const color = this.getSectorColor(type);
      const origin = [lat, lng];

      // Dùng chung bộ hình dạng với renderSectors để 2 màn hình vẽ giống hệt nhau
      const style = this.getSectorStyle(type);
      const beamWidth = style.beamWidth;
      const length = style.length * 0.6;

      const arcPts = [origin];
      for (let a = azimuth - beamWidth; a <= azimuth + beamWidth; a += 5) {
        arcPts.push(this.destinationPoint(lat, lng, a, length));
      }
      arcPts.push(origin);

      const fOpacity = style.fillOpacity;
      const shape = L.polygon(arcPts, {
        color: color, fillColor: color,
        fillOpacity: fOpacity, weight: 1.5, opacity: 0.7,
      });

      const val = (v) => (v !== undefined && v !== null && String(v).trim() !== '') ? v : '-';
      const sectorName = sector['Sector'] || 'Unknown';
      // Cùng quy tắc với renderSectors: dự án khai `sectorPopup` thì lấy theo nhóm cột
      const groupRows = this.sectorGroupRows(sector);
      const popupHtml = groupRows.length
        ? this.sectorGroupPopupHtml(sector, sectorName, siteName, type, color, groupRows)
        : `
        <div style="font-family:'Inter',sans-serif;font-size:12px;min-width:210px;max-width:250px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:${color};">${sectorName}</div>
          <div style="display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px 6px;">
            <span style="color:#94a3b8;">Tech</span><span style="font-weight:700;color:${color};">${type.toUpperCase()}</span>
            <span style="color:#94a3b8;">Cấu hình</span><span style="font-weight:600;">${val(sector['Cấu hình mới'])}</span>
            <span style="color:#94a3b8;">Cao cột</span><span style="font-weight:600;">${val(sector['Độ cao cột'])}m</span>
            <span style="color:#94a3b8;">Cao/chân</span><span style="font-weight:600;">${val(sector['Độ cao so với chân cột'])}m</span>
            <span style="color:#94a3b8;">Cao/đất</span><span style="font-weight:600;">${val(sector['Độ cao so với mặt đất'])}m</span>
            <span style="color:#94a3b8;">GPS/chân</span><span style="font-weight:600;">${val(sector['Độ cao GPS so với chân cột'])}m</span>
            <span style="color:#94a3b8;">Azimuth</span><span style="font-weight:600;">${val(sector['Azimuth'])}°</span>
            <span style="color:#94a3b8;">Tilt cơ</span><span style="font-weight:600;">${val(sector['Tilt cơ'])}°</span>
            <span style="color:#94a3b8;">Tilt điện</span><span style="font-weight:600;">${val(sector['Tilt điện'])}°</span>
          </div>
        </div>
      `;
      shape.addTo(this.sectorLayer);

      const hitPoint = this.destinationPoint(lat, lng, azimuth, length * 0.65);
      const hitCircle = L.circleMarker(hitPoint, {
        radius: 16,
        stroke: false,
        fillOpacity: 0,
        interactive: true,
      }).addTo(this.sectorLayer);

      this.bindSectorPopup([shape, hitCircle], popupHtml, hitPoint);
    });
  },

  // ============================================================
  // Cleanup
  // ============================================================
  destroy() {
    this.stopWatchingPosition();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  },

  // ============================================================
  // Map Rotation
  // ============================================================
  

  adjustBearing(delta) {
    if (this.map.setBearing) {
      this.map.setBearing(this.map.getBearing() + delta);
    }
  },

  resetNorth() {
    if (this.map.setBearing) {
      this.map.setBearing(0);
    }
    App.showToast('Hướng Bắc đã được reset về 0°', 'success');
  },

  // ============================================================
  // Two-finger Touch Rotation (Mobile)
  // ============================================================
  

  // ============================================================
  // Distance Measurement
  // ============================================================
  toggleMeasure() {
    this.measureMode = !this.measureMode;
    const btn = document.getElementById('measure-btn');
    if (this.measureMode) {
      this._clearMeasure();
      if (btn) btn.classList.add('active');
      this.map.getContainer().style.cursor = 'crosshair';
      App.showToast('📏 Chế độ đo khoảng cách: Click vào bản đồ để thêm điểm. Double-click để kết thúc.', 'info', 4000);
      // Double-click to finish
      this._measureDblClickHandler = (e) => {
        if (this.measureMode) {
          L.DomEvent.stopPropagation(e);
          this.finishMeasure();
        }
      };
      this.map.on('dblclick', this._measureDblClickHandler);
    } else {
      this.finishMeasure();
    }
    return this.measureMode;
  },

  _addMeasurePoint(latlng) {
    this.measurePoints.push(latlng);
    // Draw marker
    const idx = this.measurePoints.length;
    const marker = L.circleMarker(latlng, {
      radius: 5,
      color: '#00d2ff',
      fillColor: '#00d2ff',
      fillOpacity: 1,
      weight: 2,
    }).addTo(this.measureLayer);
    // Label index
    const label = L.divIcon({
      html: `<div style="background:#00d2ff;color:#000;font-size:10px;font-weight:700;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;margin-left:6px;margin-top:-9px;">${idx}</div>`,
      className: '',
      iconSize: [18, 18],
      iconAnchor: [-3, 9],
    });
    L.marker(latlng, { icon: label, interactive: false }).addTo(this.measureLayer);
    this.measureMarkers.push(marker);

    // Draw line
    if (this.measurePoints.length >= 2) {
      const pts = this.measurePoints;
      const seg = [pts[pts.length - 2], pts[pts.length - 1]];
      L.polyline(seg, { color: '#00d2ff', weight: 2.5, dashArray: '6, 4', opacity: 0.9 }).addTo(this.measureLayer);

      // Show total distance
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        total += pts[i - 1].distanceTo(pts[i]);
      }
      const distText = total >= 1000 ? (total / 1000).toFixed(3) + ' km' : Math.round(total) + ' m';
      const el = document.getElementById('measure-distance-display');
      if (el) { el.textContent = '📏 ' + distText; el.style.display = 'block'; }
    }
  },

  finishMeasure() {
    this.measureMode = false;
    const btn = document.getElementById('measure-btn');
    if (btn) btn.classList.remove('active');
    this.map.getContainer().style.cursor = '';
    if (this._measureDblClickHandler) {
      this.map.off('dblclick', this._measureDblClickHandler);
      this._measureDblClickHandler = null;
    }
    if (this.measurePoints.length < 2) {
      this._clearMeasure();
    }
  },

  _clearMeasure() {
    this.measurePoints = [];
    this.measureMarkers = [];
    if (this.measureLayer) this.measureLayer.clearLayers();
    const el = document.getElementById('measure-distance-display');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  },

  clearMeasure() {
    this._clearMeasure();
    this.measureMode = false;
    const btn = document.getElementById('measure-btn');
    if (btn) btn.classList.remove('active');
    this.map.getContainer().style.cursor = '';
  },
};
