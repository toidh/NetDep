import { DataService } from './data.js';
import { Projects } from './projects.js';

/**
 * NetDep - Chart Module
 * Handles all Chart.js rendering for the dashboard.
 */
export const ChartManager = {

  renderCharts(sites) {
    if (!window.Chart) return;
    try {
      // Cột nhóm và phạm vi thống kê lấy từ registry của dự án đang xem, không
      // giả định sheet nào cũng có 'Danh sách' / 'Tỉnh mới' / 'Đối tác'.
      const gf = Projects.groupFields(sites);
      const fieldA = gf[0] || '';
      const fieldB = gf[1] || '';
      const val = (s, f) => {
        if (!f) return '';
        let v = s[f];
        if ((v === undefined || v === '') && f === 'Tỉnh mới') v = s['Tỉnh'];
        return String(v || 'Khác').trim() || 'Khác';
      };
      // Lọc phạm vi: dùng chung quy tắc với Dashboard (cột thiếu -> lấy tất cả)
      const inScope = (() => {
        const scoped = Projects.scopeSites(sites);
        if (scoped.length === sites.length) return null; // không lọc gì
        const set = new Set(scoped);
        return s => set.has(s);
      })();
      const fmt2 = n => String(n).padStart(2, '0');
      const today = new Date();
      const todayKey = `${fmt2(today.getDate())}/${fmt2(today.getMonth() + 1)}`;
      const parseDate = str => {
        const m = String(str || '').match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        return m ? new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])) : null;
      };
      const dateKey = d => `${fmt2(d.getDate())}/${fmt2(d.getMonth() + 1)}`;

      // ----- Helper: Combo Chart (Bar + Line %) -----
      const renderCombo = (ctxId, groupFn, windowKey, sortFn, titleText, siteFilterFn) => {
        const ctx = document.getElementById(ctxId);
        if (!ctx) return;
        const groups = {};
        const dataSites = siteFilterFn ? sites.filter(siteFilterFn) : sites;
        dataSites.forEach(s => {
          const key = groupFn(s);
          if (!groups[key]) groups[key] = { total: 0, comp: 0 };
          groups[key].total++;
          if (DataService.getSiteStatus(s) === 'completed') groups[key].comp++;
        });
        const keys = Object.keys(groups);
        keys.sort((a, b) => {
          if (typeof sortFn === 'function') return sortFn(a, b, groups);
          return groups[a].total - groups[b].total;
        });
        const totals = keys.map(k => groups[k].total);
        const comps  = keys.map(k => groups[k].comp);
        const rates  = keys.map(k => groups[k].total > 0 ? parseFloat((groups[k].comp / groups[k].total * 100).toFixed(1)) : 0);
        if (window[windowKey]) window[windowKey].destroy();
        const dlPlugin = window.ChartDataLabels ? [window.ChartDataLabels] : [];
        window[windowKey] = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: keys,
            datasets: [
              { type: 'line', label: 'Tỷ lệ (%)', data: rates, borderColor: '#3b82f6', backgroundColor: '#3b82f6', borderWidth: 2, pointRadius: 4, yAxisID: 'y1', datalabels: { display: true, color: '#bfdbfe', anchor: 'end', align: 'top', font: { weight: 'bold', size: 12 }, formatter: v => v > 0 ? v + '%' : '' } },
              { type: 'bar', label: 'Hoàn thành', data: comps, backgroundColor: '#10b981', borderColor: '#10b981', borderWidth: 1, yAxisID: 'y', datalabels: { display: true, color: '#fff', anchor: 'center', align: 'center', font: { weight: 'bold', size: 13 }, formatter: v => v || '' } },
              { type: 'bar', label: 'Khối lượng', data: totals, backgroundColor: 'rgba(239, 68, 68, 0.4)', borderColor: '#ef4444', borderWidth: 1, yAxisID: 'y', datalabels: { display: true, color: '#fca5a5', anchor: 'center', align: 'center', font: { weight: 'bold', size: 13 }, formatter: v => v || '' } }
            ]
          },
          plugins: dlPlugin,
          options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 60 } },
            plugins: {
              legend: { display: true, position: 'top', labels: { color: '#e2e8f0', usePointStyle: true, boxWidth: 8, font: { size: 11, weight: 'bold' } } },
              title: { display: true, text: titleText, color: '#f8fafc', font: { size: 14, weight: 'bold' } }
            },
            scales: {
              x: { ticks: { color: '#cbd5e1', font: { size: 11, weight: 'bold' }, maxRotation: 30 }, grid: { color: 'rgba(255,255,255,0.05)' } },
              y: { type: 'linear', position: 'left', beginAtZero: true, grace: '25%', grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
              y1: { type: 'linear', position: 'right', beginAtZero: true, max: 115, grid: { drawOnChartArea: false }, ticks: { color: '#3b82f6', font: { size: 11, weight: 'bold' }, callback: v => v + '%' } }
            }
          }
        });
      };

      // Tổng theo nhóm A, dùng để sắp xếp biểu đồ thứ 2
      const provTotals = {};
      sites.forEach(s => {
        if (inScope && !inScope(s)) return;
        const t = val(s, fieldA);
        provTotals[t] = (provTotals[t] || 0) + 1;
      });

      if (fieldA) {
        renderCombo(
          'chart-partners',
          s => val(s, fieldA),
          'chartPartInstance',
          null,
          'Tiến độ theo ' + fieldA,
          inScope
        );
      }

      // Biểu đồ ghép 2 cấp chỉ có nghĩa khi dự án có đủ 2 cột nhóm
      if (fieldA && fieldB) {
        // 'flex' chứ không phải '' — khối này bố cục bằng flex trong style inline,
        // trả về rỗng là mất luôn bố cục đó.
        const sec = document.getElementById('chart-class-section');
        if (sec) sec.style.display = 'flex';
        renderCombo(
          'chart-class',
          s => `${val(s, fieldA)} - ${val(s, fieldB)}`,
          'chartClassInstance',
          (a, b, groups) => {
            const tA = a.split(' - ')[0];
            const tB = b.split(' - ')[0];
            if (tA !== tB) return (provTotals[tA] || 0) - (provTotals[tB] || 0);
            return groups[a].total - groups[b].total;
          },
          `Tiến độ theo ${fieldB} (${fieldA})`,
          inScope
        );
      } else {
        // Ẩn CẢ khối, không chỉ canvas: dự án 1 cột nhóm (Newsite) mà chỉ ẩn canvas
        // thì trên Dashboard còn lại một khung viền rỗng, trông như biểu đồ lỗi.
        const sec = document.getElementById('chart-class-section');
        if (sec) sec.style.display = 'none';
      }

      // ----- Overall Donut -----
      const ctxOverall = document.getElementById('chart-overall');
      if (ctxOverall) {
        const total = sites.length;
        const completed  = sites.filter(s => DataService.getSiteStatus(s) === 'completed').length;
        const notUpdated = total - completed;
        const pctComp = total > 0 ? (completed / total * 100).toFixed(1) : 0;
        const pctNot  = total > 0 ? (notUpdated / total * 100).toFixed(1) : 0;

        if (window.chartOverallInstance) window.chartOverallInstance.destroy();
        window.chartOverallInstance = new Chart(ctxOverall, {
          type: 'doughnut',
          data: {
            labels: [`Hoàn thành: ${completed} (${pctComp}%)`, `Chưa hoàn thành: ${notUpdated} (${pctNot}%)`],
            datasets: [{ data: [completed, notUpdated], backgroundColor: ['#10b981', '#cbd5e1'], borderWidth: 0, hoverOffset: 4 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '70%',
            plugins: {
              legend: { display: true, position: 'bottom', labels: { color: '#f1f5f9', usePointStyle: true, font: { size: 13, weight: 'bold' } } },
              tooltip: { enabled: true },
              title: { display: true, text: 'Tiến độ tổng thể', color: '#f8fafc', font: { size: 15, weight: 'bold' } }
            }
          }
        });
      }

      // ----- Daily Line Chart -----
      // Hai biểu đồ "theo ngày" dựa vào 'Ngày cập nhật' + 'Đối tác' — dự án theo dõi
      // theo mốc dài ngày (Newsite) không dùng tới, khai dailyCharts:false để ẩn.
      const showDaily = Projects.dashboardConfig().dailyCharts !== false;
      const dailySec = document.getElementById('chart-daily-section');
      const partnerSec = document.getElementById('chart-daily-partner-section');
      if (dailySec) dailySec.style.display = showDaily ? '' : 'none';
      if (partnerSec) partnerSec.style.display = showDaily ? '' : 'none';

      const ctxDaily = showDaily ? document.getElementById('chart-daily-line') : null;
      if (ctxDaily) {
        const dMap = {};
        dMap[todayKey] = { date: today, count: 0 };

        sites.forEach(s => {
          if (DataService.getSiteStatus(s) !== 'completed') return;
          const d = parseDate(s['Ngày cập nhật']);
          if (!d) return;
          const k = dateKey(d);
          if (!dMap[k]) dMap[k] = { date: d, count: 0 };
          dMap[k].count++;
        });

        const sorted = Object.values(dMap).sort((a, b) => a.date - b.date);
        const labels = sorted.map(i => dateKey(i.date));
        const vals   = sorted.map(i => i.count);

        if (window.chartDailyLineInstance) { window.chartDailyLineInstance.destroy(); window.chartDailyLineInstance = null; }
        if (window.chartDailyInstance)     { window.chartDailyInstance.destroy();     window.chartDailyInstance = null; }

        const dlPlugin = window.ChartDataLabels ? [window.ChartDataLabels] : [];
        const wrapper = document.getElementById('chart-daily-wrapper');
        if (wrapper) wrapper.style.minWidth = Math.max(100, labels.length * 4) + '%';

        window.chartDailyInstance = new Chart(ctxDaily, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Hoàn thành',
              data: vals,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              fill: true, tension: 0.3, pointRadius: 5, borderWidth: 3,
              datalabels: { display: true, color: '#93c5fd', anchor: 'end', align: 'top', font: { weight: 'bold', size: 12 }, formatter: v => v > 0 ? v : '' }
            }]
          },
          plugins: dlPlugin,
          options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 16 } },
            plugins: {
              legend: { display: false },
              title: { display: true, text: 'Xu hướng hoàn thành theo ngày', color: '#f8fafc', font: { size: 14, weight: 'bold' } }
            },
            scales: {
              x: { ticks: { color: '#cbd5e1', font: { size: 11, weight: 'bold' }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.05)' } },
              y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: '#94a3b8', font: { size: 11 } } }
            }
          }
        });
      }

      this.renderMonthChart(sites, parseDate);
      if (showDaily) this.renderDailyCompletedByPartnerTinh(sites, parseDate, today);

    } catch (err) {
      console.error('Lỗi khi vẽ biểu đồ:', err);
    }
  },

  /**
   * Số trạm theo THÁNG của một cột ngày do registry chỉ định
   * (`dashboard.monthChart: { field: 'Ngày phát sóng', label: '...' }`).
   *
   * Newsite dùng để xem sản lượng phát sóng từng tháng — cột 'Ngày phát sóng' là mốc
   * thật của trạm, không suy ra được từ 'Ngày cập nhật' (ngày ai đó sửa dòng dữ liệu).
   * Dự án không khai, hoặc sheet chưa có cột đó, thì ẩn hẳn khối thay vì vẽ biểu đồ rỗng.
   */
  renderMonthChart(sites, parseDate) {
    const section = document.getElementById('chart-month-section');
    const ctx = document.getElementById('chart-month');
    if (!section || !ctx) return;

    const cfg = Projects.dashboardConfig().monthChart;
    const field = cfg && cfg.field ? Projects.resolveField(sites, cfg.field) : null;
    if (window.chartMonthInstance) { window.chartMonthInstance.destroy(); window.chartMonthInstance = null; }
    if (!field) { section.style.display = 'none'; return; }

    // Gom theo tháng, giữ mốc thời gian để sắp xếp đúng thứ tự (không sort chuỗi 'MM/yyyy')
    const months = {};
    sites.forEach(s => {
      const d = parseDate(s[field]);
      if (!d) return;
      const key = String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
      if (!months[key]) months[key] = { sort: d.getFullYear() * 12 + d.getMonth(), count: 0 };
      months[key].count++;
    });

    const keys = Object.keys(months).sort((a, b) => months[a].sort - months[b].sort);
    if (!keys.length) { section.style.display = 'none'; return; }

    section.style.display = '';
    const title = document.getElementById('chart-month-title');
    const label = cfg.label || ('Số trạm theo tháng — ' + cfg.field);
    if (title) title.textContent = label;

    // Luỹ kế đi kèm cột từng tháng: nhìn được cả sản lượng tháng lẫn tổng đã đạt
    let running = 0;
    const counts = keys.map(k => months[k].count);
    const cumulative = counts.map(n => (running += n));

    const dlPlugin = window.ChartDataLabels ? [window.ChartDataLabels] : [];
    window.chartMonthInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: keys,
        datasets: [
          {
            type: 'bar', label: 'Trong tháng', data: counts,
            backgroundColor: '#10b981', borderColor: '#10b981', borderWidth: 1, yAxisID: 'y',
            datalabels: { display: true, color: '#fff', anchor: 'center', align: 'center', font: { weight: 'bold', size: 12 }, formatter: v => v || '' }
          },
          {
            type: 'line', label: 'Luỹ kế', data: cumulative,
            borderColor: '#3b82f6', backgroundColor: '#3b82f6', borderWidth: 2, pointRadius: 4, yAxisID: 'y1',
            datalabels: { display: true, color: '#bfdbfe', anchor: 'end', align: 'top', font: { weight: 'bold', size: 11 }, formatter: v => v || '' }
          }
        ]
      },
      plugins: dlPlugin,
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#e2e8f0', usePointStyle: true, boxWidth: 8, font: { size: 11, weight: 'bold' } } },
          title: { display: false }
        },
        scales: {
          x: { ticks: { color: '#cbd5e1', font: { size: 11, weight: 'bold' }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { beginAtZero: true, grace: '20%', grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0 } },
          y1: { position: 'right', beginAtZero: true, grace: '20%', grid: { drawOnChartArea: false }, ticks: { color: '#3b82f6', font: { size: 11, weight: 'bold' }, precision: 0 } }
        }
      }
    });
  },

  // ----- Tiến độ ngày theo Đối tác (Tỉnh): số trạm hoàn thành trong ngày -----
  // Grouped bar chart: x-axis = Tỉnh, một dataset (màu) riêng cho mỗi Đối tác
  renderDailyCompletedByPartnerTinh(sites, parseDate, today) {
    const ctx = document.getElementById('chart-daily-partner-tinh');
    if (!ctx) return;
    if (window.chartDailyPartnerTinhInstance) window.chartDailyPartnerTinhInstance.destroy();

    // Biểu đồ này cần cột ngày cập nhật; dự án không có thì để trống, không lỗi
    const gf = Projects.groupFields(sites);
    const fA = gf[0] || '';
    const fB = gf[1] || '';
    const gval = (s, f, dflt) => {
      if (!f) return dflt;
      let v = s[f];
      if ((v === undefined || v === '') && f === 'Tỉnh mới') v = s['Tỉnh'];
      return String(v || dflt).trim() || dflt;
    };

    const byProvPartner = {}; // { [nhómA]: { [nhómB]: count } }
    sites.forEach(s => {
      if (DataService.getSiteStatus(s) !== 'completed') return;
      const d = parseDate(s['Ngày cập nhật']);
      if (!d || d.getDate() !== today.getDate() || d.getMonth() !== today.getMonth() || d.getFullYear() !== today.getFullYear()) return;

      const tinh = gval(s, fA, 'Khác');
      const doiTac = gval(s, fB, 'Khác');
      if (!byProvPartner[tinh]) byProvPartner[tinh] = {};
      byProvPartner[tinh][doiTac] = (byProvPartner[tinh][doiTac] || 0) + 1;
    });

    const provTotal = (tinh) => Object.values(byProvPartner[tinh]).reduce((sum, v) => sum + v, 0);
    const provinces = Object.keys(byProvPartner).sort((a, b) => provTotal(b) - provTotal(a));

    if (provinces.length === 0) {
      window.chartDailyPartnerTinhInstance = new Chart(ctx, { type: 'bar', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false } });
      return;
    }

    const partnerTotals = {};
    provinces.forEach(tinh => {
      Object.entries(byProvPartner[tinh]).forEach(([p, v]) => { partnerTotals[p] = (partnerTotals[p] || 0) + v; });
    });
    const partners = Object.keys(partnerTotals).sort((a, b) => partnerTotals[b] - partnerTotals[a]);
    const colors = partners.map((_, i) => `hsl(${(i * 47 + 140) % 360}, 65%, 55%)`);

    const dlPlugin = window.ChartDataLabels ? [window.ChartDataLabels] : [];

    window.chartDailyPartnerTinhInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: provinces,
        datasets: partners.map((p, i) => ({
          label: p,
          data: provinces.map(tinh => (byProvPartner[tinh] && byProvPartner[tinh][p]) || 0),
          backgroundColor: colors[i],
          borderRadius: 4,
          datalabels: { display: true, color: '#fff', font: { weight: 'bold', size: 11 }, formatter: v => v || '' }
        }))
      },
      plugins: dlPlugin,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#e2e8f0', usePointStyle: true, boxWidth: 8, font: { size: 11, weight: 'bold' } } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} trạm` } }
        },
        scales: {
          x: { ticks: { color: '#cbd5e1', font: { size: 11, weight: 'bold' }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: '#94a3b8', font: { size: 11 }, stepSize: 1, precision: 0 } }
        }
      }
    });
  },

};
