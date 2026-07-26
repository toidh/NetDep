class CheckinReport {
  constructor() {
    this.modal = document.getElementById('checkin-report-modal');
    if (!this.modal) return;

    this.closeBtn = document.getElementById('close-checkin-report-btn');
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.closeCheckinReport());
    }

    this.filterTinhEl = document.getElementById('checkin-filter-tinh');
    this.filterDoiTacEl = document.getElementById('checkin-filter-doitac');
    if (this.filterTinhEl) this.filterTinhEl.addEventListener('change', () => this.generateReport());
    if (this.filterDoiTacEl) this.filterDoiTacEl.addEventListener('change', () => this.generateReport());

    this.provinceChart = null;
    this.partnerChart = null;
    this.comboChart = null;
  }

  openCheckinReport() {
    if (!this.modal) return;
    this.modal.classList.add('visible');

    const todayStr = new Date().toLocaleDateString('vi-VN');
    const el = document.getElementById('checkin-report-date');
    if (el) el.textContent = todayStr;

    this.generateReport();
  }

  closeCheckinReport() {
    if (this.modal) this.modal.classList.remove('visible');
  }

  get filterTinh() {
    return this.filterTinhEl ? this.filterTinhEl.value : '';
  }

  get filterDoiTac() {
    return this.filterDoiTacEl ? this.filterDoiTacEl.value : '';
  }

  // Find the Check-in column value (flexible key matching)
  getCheckinValue(site) {
    for (const key of Object.keys(site)) {
      const norm = key.replace(/[\s\-_]/g, '').toLowerCase();
      if (norm === 'checkin' || norm === 'check-in') {
        return site[key];
      }
    }
    return null;
  }

  // Parse "dd/MM/yyyy HH:mm:ss" (or similar) into a Date, for today-check and sorting
  parseCheckinDate(checkinVal) {
    const str = String(checkinVal || '').trim();
    if (!str || str === '0') return null;

    const m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})[\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/);
    if (m) {
      return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), parseInt(m[4]) || 0, parseInt(m[5]) || 0, parseInt(m[6]) || 0);
    }
    const m2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m2) {
      return new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));
    }
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d;
    } catch (e) {}
    return null;
  }

  // Detect if the Check-in column contains a date equal to today.
  // Format stored in sheet: "24/07/2026 8:45:40"
  isCheckinToday(site) {
    const d = this.parseCheckinDate(this.getCheckinValue(site));
    if (!d) return false;

    const today = new Date();
    return d.getDate() === today.getDate() &&
           d.getMonth() === today.getMonth() &&
           d.getFullYear() === today.getFullYear();
  }

  populateFilterOptions(targetSites) {
    const tinhSet = new Set();
    const doiTacSet = new Set();
    targetSites.forEach(site => {
      const prov = String(site['Tỉnh mới'] || site['Tỉnh'] || '').trim();
      const partner = String(site['Đối tác'] || '').trim();
      if (prov) tinhSet.add(prov);
      if (partner) doiTacSet.add(partner);
    });

    const fillSelect = (selectEl, values, currentVal) => {
      if (!selectEl) return;
      const sorted = Array.from(values).sort((a, b) => a.localeCompare(b));
      selectEl.innerHTML = '<option value="">Tất cả</option>' +
        sorted.map(v => `<option value="${v}"${v === currentVal ? ' selected' : ''}>${v}</option>`).join('');
    };

    fillSelect(this.filterTinhEl, tinhSet, this.filterTinh);
    fillSelect(this.filterDoiTacEl, doiTacSet, this.filterDoiTac);
  }

  generateReport() {
    const sites = window.App && window.App.sites ? window.App.sites : [];

    const targetSites = sites.filter(s => {
      const danhSach = String(s['Danh sách'] || '').trim().toLowerCase();
      return danhSach === 'triển khai';
    });

    this.populateFilterOptions(targetSites);

    const filterTinh = this.filterTinh;
    const filterDoiTac = this.filterDoiTac;
    const filteredSites = targetSites.filter(site => {
      const prov = String(site['Tỉnh mới'] || site['Tỉnh'] || '').trim();
      const partner = String(site['Đối tác'] || '').trim();
      if (filterTinh && prov !== filterTinh) return false;
      if (filterDoiTac && partner !== filterDoiTac) return false;
      return true;
    });

    let totalCheckins = 0;
    const byProv = {};
    const byPartner = {};
    const byProvPartner = {}; // { [tinh]: { [doiTac]: count } }
    const checkedInList = [];

    filteredSites.forEach(site => {
      const prov = String(site['Tỉnh mới'] || site['Tỉnh'] || 'Khác').trim() || 'Khác';
      const partner = String(site['Đối tác'] || 'Khác').trim() || 'Khác';

      if (this.isCheckinToday(site)) {
        totalCheckins++;
        byProv[prov] = (byProv[prov] || 0) + 1;
        byPartner[partner] = (byPartner[partner] || 0) + 1;
        if (!byProvPartner[prov]) byProvPartner[prov] = {};
        byProvPartner[prov][partner] = (byProvPartner[prov][partner] || 0) + 1;

        const checkinVal = this.getCheckinValue(site);
        checkedInList.push({
          tinh: prov,
          tram: String(site['Site'] || '').trim(),
          doiTac: partner,
          user: String(site['User cập nhật'] || '').trim(),
          checkin: String(checkinVal || '').trim(),
          checkinDate: this.parseCheckinDate(checkinVal)
        });
      }
    });

    // Most recent checkins first
    checkedInList.sort((a, b) => (b.checkinDate ? b.checkinDate.getTime() : 0) - (a.checkinDate ? a.checkinDate.getTime() : 0));
    this.checkedInList = checkedInList;
    const recentList = checkedInList.slice(0, 10);

    // --- Update counter ---
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('checkin-total-checkins', totalCheckins);

    // --- Table: Checkin gần đây (10 trạm gần nhất) ---
    const tbody = document.getElementById('checkin-report-tbody');
    let html = recentList.length === 0
      ? `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">Chưa có trạm nào check-in hôm nay</td></tr>`
      : recentList.map(row => `
          <tr>
            <td>${row.tinh}</td>
            <td style="font-weight:600;"><a href="#" class="clickable-site" style="color:var(--color-green);text-decoration:none;" onclick="App.openMapPopup('${row.tram}'); return false;">${row.tram}</a></td>
            <td>${row.doiTac}</td>
            <td>${row.user || '-'}</td>
            <td>${row.checkin || '-'}</td>
          </tr>`).join('');
    if (tbody) tbody.innerHTML = html;

    // --- Charts ---
    this.drawProvinceChart(byProv);
    this.drawPartnerChart(byPartner);
    this.drawComboChart(byProvPartner);
  }

  // -------------------------------------------------------
  // Bar chart helper — numbers INSIDE bars
  // -------------------------------------------------------
  _buildBarChart(canvasId, chartRef, labels, dataVals, color, pluginId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    if (chartRef) chartRef.destroy();

    const drawInsideVals = {
      id: pluginId,
      afterDatasetsDraw: (chart) => {
        const cCtx = chart.ctx;
        chart.data.datasets.forEach((ds, i) => {
          chart.getDatasetMeta(i).data.forEach((bar, idx) => {
            const v = ds.data[idx];
            if (v > 0) {
              const barHeight = bar.base - bar.y;
              const midY = bar.y + barHeight / 2;
              cCtx.fillStyle = '#fff';
              cCtx.textAlign = 'center';
              cCtx.textBaseline = 'middle';
              cCtx.font = 'bold 12px Inter, sans-serif';
              // Only draw inside if bar is tall enough
              if (barHeight > 18) {
                cCtx.fillText(v, bar.x, midY);
              } else {
                // Draw just above bar if too short
                cCtx.fillStyle = '#cbd5e1';
                cCtx.textBaseline = 'bottom';
                cCtx.fillText(v, bar.x, bar.y - 2);
              }
            }
          });
        });
      }
    };

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Đã Check-in',
          data: dataVals,
          backgroundColor: color,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8', maxRotation: 45 } },
          y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8', stepSize: 1, precision: 0 } }
        }
      },
      plugins: [drawInsideVals]
    });
  }

  drawProvinceChart(byProv) {
    const entries = Object.entries(byProv).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(([k]) => k);
    const vals   = entries.map(([, v]) => v);
    this.provinceChart = this._buildBarChart(
      'checkin-province-chart', this.provinceChart, labels, vals, '#3b82f6', 'drawValsProv'
    );
  }

  drawPartnerChart(byPartner) {
    const entries = Object.entries(byPartner).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(([k]) => k);
    const vals   = entries.map(([, v]) => v);
    this.partnerChart = this._buildBarChart(
      'checkin-partner-chart', this.partnerChart, labels, vals, '#10b981', 'drawValsPartner'
    );
  }

  // Grouped bar chart: x-axis = Tỉnh, one dataset (color) per Đối tác
  drawComboChart(byProvPartner) {
    const ctx = document.getElementById('checkin-combo-chart');
    if (!ctx) return;
    if (this.comboChart) this.comboChart.destroy();

    // Nhóm theo tỉnh, tỉnh có tổng số check-in cao nhất đứng trước
    const provTotal = (prov) => Object.values(byProvPartner[prov]).reduce((sum, v) => sum + v, 0);
    const provinces = Object.keys(byProvPartner).sort((a, b) => provTotal(b) - provTotal(a));

    const partnerTotals = {};
    provinces.forEach(prov => {
      Object.entries(byProvPartner[prov]).forEach(([p, v]) => {
        partnerTotals[p] = (partnerTotals[p] || 0) + v;
      });
    });
    const partners = Object.keys(partnerTotals).sort((a, b) => partnerTotals[b] - partnerTotals[a]);

    if (provinces.length === 0 || partners.length === 0) {
      this.comboChart = new Chart(ctx, { type: 'bar', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false } });
      return;
    }

    const colors = partners.map((_, i) => `hsl(${(i * 47 + 200) % 360}, 70%, 55%)`);

    const drawValsCombo = {
      id: 'drawValsCombo',
      afterDatasetsDraw: (chart) => {
        const cCtx = chart.ctx;
        chart.data.datasets.forEach((ds, di) => {
          chart.getDatasetMeta(di).data.forEach((bar, idx) => {
            const v = ds.data[idx];
            if (v > 0) {
              const barHeight = bar.base - bar.y;
              const midY = bar.y + barHeight / 2;
              cCtx.textAlign = 'center';
              cCtx.font = 'bold 11px Inter, sans-serif';
              if (barHeight > 16) {
                cCtx.fillStyle = '#fff';
                cCtx.textBaseline = 'middle';
                cCtx.fillText(v, bar.x, midY);
              } else {
                cCtx.fillStyle = '#cbd5e1';
                cCtx.textBaseline = 'bottom';
                cCtx.fillText(v, bar.x, bar.y - 2);
              }
            }
          });
        });
      }
    };

    this.comboChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: provinces,
        datasets: partners.map((partner, i) => ({
          label: partner,
          data: provinces.map(prov => (byProvPartner[prov] && byProvPartner[prov][partner]) || 0),
          backgroundColor: colors[i],
          borderRadius: 4
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} trạm check-in`
            }
          }
        },
        scales: {
          x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8', maxRotation: 45 } },
          y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8', stepSize: 1, precision: 0 } }
        }
      },
      plugins: [drawValsCombo]
    });
  }
}

window.CheckinReport = new CheckinReport();
