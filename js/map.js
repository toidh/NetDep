import { AppConfig } from './config.js';
import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { DataService } from './data.js';
/**
 * NetDep - Map Module (Leaflet.js)
 */
export const MapManager = {
  map: null,
  markers: {},
  markerLayer: null,
  sectorLayer: null,
  sectorsVisible: true,
  sectorData: [],
  filterDistrict: '',
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

      if (this.filterDistrict && String(site['Tỉnh mới'] || '').trim() !== this.filterDistrict) continue;
      
      if (this.filterStatus) {
        const isDailyPlan = DataService.isDailyPlan(site);
        if (this.filterStatus === 'daily_plan' && !isDailyPlan) continue;
        if (this.filterStatus !== 'daily_plan') {
          // Use 'Danh sách' column so completed sites still appear
          const danhSach = String(site['Danh sách'] || '').trim().toLowerCase();
          if (this.filterStatus === 'trien_khai' && danhSach !== 'triển khai') continue;
          if (this.filterStatus === 'du_phong' && danhSach !== 'dự phòng') continue;
        }
      }

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

  toggleFilterBar() {
    const bar = document.getElementById('map-filter-bar');
    if (bar) bar.classList.toggle('active');
  },

  applyFilters() {
    this.filterDistrict = document.getElementById('filter-district')?.value || '';
    this.filterStatus = document.getElementById('filter-status')?.value || '';
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
      const filterStatus = document.getElementById('filter-status');
      
      if (filterDistrict && filterDistrict.value !== '') {
        filterDistrict.value = '';
        this.filterDistrict = '';
      }
      if (filterStatus && filterStatus.value !== '') {
        filterStatus.value = '';
        this.filterStatus = '';
      }
      
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
  addLegend() {
    const legend = L.control({ position: 'bottomleft' });

    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = `
        <div class="legend-title">Chú thích</div>
        <div class="legend-item"><span class="legend-dot" style="background:${AppConfig.COLORS.TRIEN_KHAI}"></span> Triển khai</div>
        <div class="legend-item"><span class="legend-dot" style="background:${AppConfig.COLORS.DU_PHONG}"></span> Dự phòng</div>
        <div class="legend-item"><span class="legend-dot" style="background:#16a34a"></span> Hoàn thành</div>
        <div class="legend-item"><span class="legend-dot" style="background:#dc2626"></span> Đang thực hiện</div>
        <div style="border-top:1px solid rgba(255,255,255,0.15);margin:4px 0;"></div>
        <div class="legend-item"><span class="legend-dot" style="background:#00C853"></span> Sector 5G</div>
        <div class="legend-item"><span class="legend-dot" style="background:#FFD600"></span> Sector 4G</div>
      `;
      return div;
    };

    legend.addTo(this.map);
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

    if (tech.includes('5G')) return '5g';
    if (tech.includes('4G')) return '4g';
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
      case '5g': return '#00C853'; 
      case '4g': return '#FF2D78'; 
      default: return '#FFEE00'; 
    }
  },

  setSectorData(sectors) {
    const data = sectors || [];
    const getOrder = (type) => {
      if (type === '5g') return 1;
      if (type === '4g700') return 2;
      return 3;
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
      L.popup({ autoPan: false, maxWidth: 260 })
        .setLatLng(anchor)
        .setContent(popupHtml)
        .openOn(this.map);
    };
    layers.forEach(layer => layer.on('click', openAtAnchor));
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

      if (this.filterDistrict) {
        const siteName = String(sector['Site'] || sector['Mã trạm'] || sector['Mã Trạm'] || '').trim();
        const siteObj = siteMap.get(siteName) || null;
        if (siteObj && String(siteObj['Tỉnh mới'] || '').trim() !== this.filterDistrict) continue;
      }

      if (this.filterStatus) {
        const siteName = String(sector['Site'] || sector['Mã trạm'] || sector['Mã Trạm'] || '').trim();
        if (siteName) {
          // Look up site by name in allSites
          const siteObj = siteMap.get(siteName);
          if (siteObj) {
            const isDailyPlan = DataService.isDailyPlan(siteObj);
            if (this.filterStatus === 'daily_plan') {
              if (!isDailyPlan) continue;
            } else {
              // Use 'Danh sách' column so completed sites' sectors still show
              const danhSach = String(siteObj['Danh sách'] || '').trim().toLowerCase();
              if (this.filterStatus === 'trien_khai' && danhSach !== 'triển khai') continue;
              if (this.filterStatus === 'du_phong' && danhSach !== 'dự phòng') continue;
            }
          }
          // If siteObj not found, still render the sector (don't skip)
        }
      }
      const siteName = String(sector['Site'] || sector['Mã trạm'] || sector['Mã Trạm'] || '').trim();


      const lat = parseFloat(sector['Lat']);
      const lng = parseFloat(sector['Long']);
      const azimuth = parseFloat(sector['Azimuth']) || 0;
      
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;
      if (!bounds.contains([lat, lng])) continue;

      const type = this.getSectorType(sector);
      if (type === 'other') continue;

      let color = this.getSectorColor(type);
      let fOpacity = 0.2;
      let beamWidth = 30;
      let length = 130;
      
      if (type === '4g700') {
        length = 200;
        fOpacity = 0.3;
      }
      if (type === '5g') {
        length = 171; // Giảm 10% (190 * 0.9)
        beamWidth = 24; // Giảm 20% (30 * 0.8)
        color = '#00C853'; // Sắc nét hơn
        fOpacity = 0.55; // Đậm hơn
      } else if (type === '4g') {
        beamWidth = 24; // Giảm 20%
        color = '#FFD600'; // Yellow sắc nét
        fOpacity = 0.45; // Đậm hơn
      }

      // Static length reduction to 60%
      length *= 0.6;

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
      const popupHtml = `
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
      const azimuth = parseFloat(sector['Azimuth']) || 0;
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

      const type = this.getSectorType(sector);
      if (type === 'other') return; // Bỏ qua sector khác

      const color = this.getSectorColor(type);
      const origin = [lat, lng];

      const beamWidth = 30;
      let length = 130;
      if (type === '4g700') length = 200;
      if (type === '5g') length = 190;

      const arcPts = [origin];
      for (let a = azimuth - beamWidth; a <= azimuth + beamWidth; a += 5) {
        arcPts.push(this.destinationPoint(lat, lng, a, length));
      }
      arcPts.push(origin);
      
      const fOpacity = type === '5g' ? 0.35 : 0.18;
      const shape = L.polygon(arcPts, {
        color: color, fillColor: color,
        fillOpacity: fOpacity, weight: 1.5, opacity: 0.7,
      });

      const val = (v) => (v !== undefined && v !== null && String(v).trim() !== '') ? v : '-';
      const sectorName = sector['Sector'] || 'Unknown';
      const popupHtml = `
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
