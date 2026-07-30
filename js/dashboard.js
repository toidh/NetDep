import { DataService } from './data.js';
import { ChartManager } from './chart.js';
import { Projects } from './projects.js';
import { CustomReports } from './reports/index.js';

/**
 * NetDep - Dashboard Module
 * Handles all dashboard rendering: cards, tables, reports.
 */
export const DashboardManager = {

  filterTinh: '',
  filterDoiTac: '',

  // 2 cột đang dùng cho 2 dropdown lọc của dự án hiện tại (do registry quyết định)
  groupFieldA: '',
  groupFieldB: '',

  /** Giá trị của 1 cột nhóm, có dự phòng 'Tỉnh mới' -> 'Tỉnh' như dữ liệu cũ. */
  groupValue(site, field) {
    if (!field) return '';
    let v = site[field];
    if ((v === undefined || v === '') && field === 'Tỉnh mới') v = site['Tỉnh'];
    return String(v || '').trim();
  },

  populateDashboardFilters(sites) {
    const setA = new Set();
    const setB = new Set();
    sites.forEach(s => {
      const a = this.groupValue(s, this.groupFieldA);
      const b = this.groupValue(s, this.groupFieldB);
      if (a) setA.add(a);
      if (b) setB.add(b);
    });

    const fillSelect = (id, values, currentVal, label) => {
      const el = document.getElementById(id);
      if (!el) return;
      // Dự án không có cột này thì ẩn hẳn dropdown thay vì để một ô rỗng vô nghĩa
      const wrap = el.closest('.dash-filter-item') || el;
      if (!label) {
        wrap.style.display = 'none';
        return;
      }
      wrap.style.display = '';
      const lbl = document.querySelector(`label[for="${id}"]`);
      if (lbl) lbl.textContent = label + ':';
      const sorted = Array.from(values).sort((a, b) => a.localeCompare(b, 'vi'));
      el.innerHTML = '<option value="">Tất cả</option>' +
        sorted.map(v => `<option value="${v}"${v === currentVal ? ' selected' : ''}>${v}</option>`).join('');
    };

    fillSelect('dash-filter-tinh', setA, this.filterTinh, this.groupFieldA);
    fillSelect('dash-filter-doitac', setB, this.filterDoiTac, this.groupFieldB);
  },

  renderDashboard(rawSites) {
    if (!rawSites || !Array.isArray(rawSites)) { rawSites = []; }

    // Cột nào dùng để lọc/nhóm là do registry của dự án quyết định, và chỉ giữ
    // những cột thực sự có trong dữ liệu (xem Projects.groupFields).
    const fields = Projects.groupFields(rawSites);
    this.groupFieldA = fields[0] || '';
    this.groupFieldB = fields[1] || '';

    // Capture the current selection BEFORE rebuilding the <select> options,
    // otherwise populateDashboardFilters() would overwrite it with the stale value.
    const filterTinhEl = document.getElementById('dash-filter-tinh');
    const filterDoiTacEl = document.getElementById('dash-filter-doitac');
    this.filterTinh = filterTinhEl ? filterTinhEl.value : '';
    this.filterDoiTac = filterDoiTacEl ? filterDoiTacEl.value : '';

    this.populateDashboardFilters(rawSites);

    const sites = (this.filterTinh || this.filterDoiTac)
      ? rawSites.filter(s => {
          if (this.filterTinh && this.groupValue(s, this.groupFieldA) !== this.filterTinh) return false;
          if (this.filterDoiTac && this.groupValue(s, this.groupFieldB) !== this.filterDoiTac) return false;
          return true;
        })
      : rawSites;

    // Dự án cần báo cáo khác hẳn thì tự render, phần dưới không chạy nữa
    if (CustomReports.renderDashboard(Projects.reportModule(), sites, this)) return;

    // Phạm vi thống kê do registry quyết định (5G: chỉ 'Triển khai'; dự án khác:
    // toàn bộ). Cột lọc không tồn tại thì lấy tất cả, không cho ra 0 trạm.
    const scoped = Projects.scopeSites(sites);
    const total = scoped.length;
    const completed = scoped.filter(s => DataService.getSiteStatus(s) === 'completed').length;
    const notUpdated = total - completed;
    const pct = total > 0 ? ((completed / total) * 100).toFixed(2) : '0.00';

    // === Summary Cards ===
    let cardsHtml = `
      <div class="dash-card card-total clickable-card" onclick="App.showSiteList('total', 'Tổng trạm')"><div class="dash-card-value">${total}</div><div class="dash-card-label">Tổng trạm</div></div>
      <div class="dash-card card-completed clickable-card" onclick="App.showSiteList('completed', 'Hoàn thành')"><div class="dash-card-value">${completed}</div><div class="dash-card-label">Hoàn thành</div></div>
      <div class="dash-card card-pending clickable-card" onclick="App.showSiteList('pending', 'Chưa hoàn thành')"><div class="dash-card-value">${notUpdated}</div><div class="dash-card-label">Chưa hoàn thành</div></div>
    `;

    // Thẻ đếm theo từng mốc tiến độ riêng của dự án (vd Newsite: Chưa thuê / Phát sóng)
    const field = Projects.progressField();
    Projects.valueCards().forEach(card => {
      const want = String(card.value || '').trim().toLowerCase();
      const n = scoped.filter(s => String(s[field] || '').trim().toLowerCase() === want).length;
      cardsHtml += `
      <div class="dash-card clickable-card" onclick="App.showSiteList('progress:${encodeURIComponent(card.value)}', '${card.label}')"><div class="dash-card-value">${n}</div><div class="dash-card-label">${card.label}</div></div>`;
    });
    document.getElementById('dash-summary').innerHTML = cardsHtml;

    // === Progress Bar ===
    document.getElementById('dash-progress-fill').style.width = pct + '%';
    document.getElementById('dash-progress-pct').textContent = pct + '%';

    // === Cumulative Report ===
    if (this.groupFieldA) {
      this.renderPlanByGroup(scoped, this.groupFieldA, "dash-cumulative-content");
    }

    this.renderSummaryDelayed(sites);

    // === Recent Updates ===
    this.renderRecentUpdates(sites);
    ChartManager.renderCharts(sites);
  },



  renderSummaryDelayed(sites) {
    const el = document.getElementById('dash-summary-delayed');
    if (!el) return;

    // Khối này đếm trạm chậm tiến độ dựa trên 2 cột ngày. Dự án không có cột ngày
    // thì bảng luôn rỗng — ẩn hẳn thay vì để một khung trống gây tưởng là lỗi.
    const hasDates = Projects.hasField(sites, 'Ngày đăng ký') || Projects.hasField(sites, 'Ngày cập nhật');
    if (!hasDates) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';

    // Nhóm theo cột thứ 2 của dự án (5G là 'Đối tác')
    const groupField = this.groupFieldB || this.groupFieldA || 'Đối tác';

    const todayDate = new Date();
    todayDate.setHours(0,0,0,0);

    const partners = {};

    sites.forEach(s => {
      const p = this.groupValue(s, groupField) || 'Khác';
      if (!partners[p]) partners[p] = { dk: 0, exe: 0 };
      
      if (DataService.getSiteStatus(s) !== 'completed') {
        const strDk = String(s['Ngày đăng ký'] || '');
        const mDk = strDk.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (mDk) {
          const dDk = new Date(parseInt(mDk[3]), parseInt(mDk[2]) - 1, parseInt(mDk[1]));
          dDk.setHours(0,0,0,0);
          if (Math.floor((todayDate - dDk) / 86400000) > 2) partners[p].dk++;
        }
      }
      
      if (DataService.getSiteStatus(s) === 'in_progress') {
        const strExe = String(s['Ngày cập nhật'] || '');
        const mExe = strExe.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (mExe) {
          const dExe = new Date(parseInt(mExe[3]), parseInt(mExe[2]) - 1, parseInt(mExe[1]));
          dExe.setHours(0,0,0,0);
          if (Math.floor((todayDate - dExe) / 86400000) > 2) partners[p].exe++;
        }
      }
    });
    
    const pKeys = Object.keys(partners).sort((a,b) => a.localeCompare(b, 'vi'));
    let totalDk = 0;
    let totalExe = 0;
    
    let html = `
      <div class="dash-charts-container" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; align-items: stretch;">
        <div class="dash-chart-box" style="height:auto; min-height:100%; display:block; padding:0; align-items:flex-start; justify-content:flex-start;">
          <div class="table-responsive" style="height:100%; margin:0; overflow-y:auto; padding: 20px;">
            <table class="dash-table">
              <thead>
                <tr>
                  <th style="font-size:12px; font-weight:700">Đối tác</th>
                  <th class="num wrap-text" style="font-size:12px; font-weight:700; white-space:normal">Số trạm đk > 2 ngày chưa hoàn thành</th>
                  <th class="num wrap-text" style="font-size:12px; font-weight:700; white-space:normal">Số trạm đang thực hiện chưa swap/ vướng / lỗi</th>
                </tr>
              </thead>
              <tbody>
    `;
    
    pKeys.forEach(p => {
      if (partners[p].dk === 0 && partners[p].exe === 0) return;
      totalDk += partners[p].dk;
      totalExe += partners[p].exe;
      html += `
        <tr>
          <td>${p}</td>
          <td class="num" style="color:var(--color-blue);font-weight:bold">${partners[p].dk > 0 ? partners[p].dk : ''}</td>
          <td class="num" style="color:var(--color-red);font-weight:bold">${partners[p].exe > 0 ? partners[p].exe : ''}</td>
        </tr>
      `;
    });
    
    if (totalDk === 0 && totalExe === 0) {
      el.innerHTML = '<div class="dash-empty" style="color:var(--text-muted);font-style:italic">Chưa có dữ liệu</div>';
      return;
    }
    
    html += `
              <tr style="font-weight:700;border-top:2px solid var(--border-glass);background:rgba(255,255,255,0.02)">
                <td>Tổng</td>
                <td class="num" style="color:var(--color-blue)">${totalDk > 0 ? totalDk : ''}</td>
                <td class="num" style="color:var(--color-red)">${totalExe > 0 ? totalExe : ''}</td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="dash-chart-box" style="height:auto; min-height:100%; display:block; padding:20px;">
          <canvas id="chart-summary-delayed-canvas"></canvas>
        </div>
      </div>
    `;
    
    el.innerHTML = html;

    const ctx = document.getElementById('chart-summary-delayed-canvas');
    if (ctx) {
      if (window.chartSummaryDelayedInstance) window.chartSummaryDelayedInstance.destroy();
      
      const labels = [];
      const dataDk = [];
      const dataExe = [];
      
      pKeys.forEach(p => {
        if (partners[p].dk > 0 || partners[p].exe > 0) {
          labels.push(p);
          dataDk.push(partners[p].dk);
          dataExe.push(partners[p].exe);
        }
      });
      
      const dlPlugin = window.ChartDataLabels ? [window.ChartDataLabels] : [];
      window.chartSummaryDelayedInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'ĐK > 2 ngày',
              data: dataDk,
              backgroundColor: '#3b82f6',
              datalabels: { display: true, color: '#fff', font: { weight: 'bold', size: 11 }, formatter: v => v || '' }
            },
            {
              label: 'Đang TH > 2 ngày',
              data: dataExe,
              backgroundColor: '#ef4444',
              datalabels: { display: true, color: '#fff', font: { weight: 'bold', size: 11 }, formatter: v => v || '' }
            }
          ]
        },
        plugins: dlPlugin,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top', labels: { color: '#e2e8f0', usePointStyle: true, font: { size: 11 } } }
          },
          scales: {
            x: { ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: '#94a3b8', font: { size: 11 } } }
          }
        }
      });
    }
  },



  renderDelayedSites(sites) {
    const el = document.getElementById('dash-delayed-sites');
    if (!el) return;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const delayed = sites.filter(s => {
      const dStr = String(s['Ngày cập nhật'] || '');
      const m = dStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (!m) return false;
      const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
      d.setHours(0, 0, 0, 0);
      const diff = Math.floor((now - d) / 86400000);
      if (diff > 2 && DataService.getSiteStatus(s) === 'in_progress') {
        s._daysDelayed = diff;
        return true;
      }
      return false;
    });

    if (delayed.length === 0) {
      el.innerHTML = '<div class="dash-empty" style="color:var(--text-muted);font-style:italic">Không có trạm thi công kéo dài > 2 ngày</div>';
      return;
    }

    let html = `
      <div style="margin-bottom: 10px;">Tổng số: <strong style="color:var(--color-red);">${delayed.length}</strong> trạm</div>
      <div class="table-responsive">
        <table class="dash-table">
          <thead><tr><th>Trạm</th><th>Phân loại</th><th>Đối tác</th><th>TKTU</th><th>Ngày cập nhật</th><th>Nguyên nhân</th><th class="num">Chậm (ngày)</th></tr></thead>
          <tbody>
    `;
    delayed.sort((a, b) => (b._daysDelayed || 0) - (a._daysDelayed || 0)).forEach(s => {
      const status = DataService.getSiteStatus(s);
      const color = DataService.getStatusColor(status, s);
      html += `<tr>
        <td><span class="status-dot" style="background:${color}"></span><a href="#" class="clickable-site" style="color:${color}" onclick="App.openMapPopup('${s['Site']}'); return false;">${s['Site']}</a></td>
        <td>${s['Phân loại'] || '-'}</td>
        <td>${s['Đối tác'] || '-'}</td>
        <td>${s['TKTU ONSITE'] || s['TKTU'] || '-'}</td>
        <td>${s['Ngày cập nhật'] || '-'}</td>
        <td class="wrap-text">${s['Nguyên nhân chưa hoàn thành'] || '-'}</td>
        <td class="num" style="color:var(--color-red);font-weight:bold">${s._daysDelayed}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    el.innerHTML = html;
  },


  renderPlanByGroup(sites, title, unused) {
    // We only use the trienKhai ones for luỹ kế
    const el = document.getElementById('dash-cumulative-content');
    if (!el) return;
    const trienKhai = sites.filter(s => String(s['Danh sách']||'').trim().toLowerCase() === 'triển khai');
    const groups = {};
    trienKhai.forEach(s => {
      const p = String(s['Tỉnh mới'] || 'Khác').trim();
      if (!groups[p]) groups[p] = { total: 0, comp: 0 };
      groups[p].total++;
      if (DataService.getSiteStatus(s) === 'completed') groups[p].comp++;
    });
    
    let html = `<div class="table-responsive"><table class="dash-table">
      <thead><tr><th>Tỉnh</th><th class="num">Hoàn thành</th><th class="num">Khối lượng</th><th class="num">Tỷ lệ</th></tr></thead>
      <tbody>`;
    const keys = Object.keys(groups).sort((a,b) => groups[a].total - groups[b].total);
    keys.forEach(p => {
      const g = groups[p];
      const rate = g.total > 0 ? (g.comp / g.total * 100).toFixed(1) + '%' : '0%';
      html += `<tr><td>${p}</td><td class="num">${g.comp}</td><td class="num">${g.total}</td><td class="num">${rate}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    el.innerHTML = html;
  },


  renderRecentUpdates(sites) {
    const el = document.getElementById('dash-recent-updates');
    if (!el) return;
    
    const parseDate = str => { 
        const m = String(str || '').match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); 
        return m ? new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])) : new Date(0); 
    };

    const sorted = [...sites].filter(s => s['Ngày cập nhật']).sort((a, b) => {
      return parseDate(b['Ngày cập nhật']) - parseDate(a['Ngày cập nhật']);
    }).slice(0, 10);
    
    let html = `<div class="table-responsive"><table class="dash-table">
      <thead><tr><th>Trạm</th><th>User</th><th>Thời gian</th></tr></thead>
      <tbody>`;
    sorted.forEach(s => {
      const status = DataService.getSiteStatus(s);
      const color = DataService.getStatusColor(status, s);
      html += `<tr>
        <td><span class="status-dot" style="background:${color}"></span><a href="#" class="clickable-site" style="color:${color}" onclick="App.openMapPopup('${s['Site']}'); return false;">${s['Site']}</a></td>
        <td>${s['User cập nhật'] || '-'}</td>
        <td style="font-size:11px;color:var(--text-muted)">${s['Ngày cập nhật']}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    el.innerHTML = html;
  },

};
