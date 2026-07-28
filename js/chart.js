import { DataService } from './data.js';

/**
 * NetDep - Chart Module
 * Handles all Chart.js rendering for the dashboard.
 */
export const ChartManager = {

  renderCharts(sites) {
    if (!window.Chart) return;
    try {
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

      // Calculate Province Totals for sorting
      const provTotals = {};
      sites.forEach(s => {
        if (String(s['Danh sách'] || '').trim().toLowerCase() === 'triển khai') {
          const t = String(s['Tỉnh mới'] || 'Khác').trim();
          provTotals[t] = (provTotals[t] || 0) + 1;
        }
      });

      renderCombo(
        'chart-partners',
        s => String(s['Tỉnh mới'] || 'Khác').trim(),
        'chartPartInstance',
        null,
        'Tiến độ theo Tỉnh',
        s => String(s['Danh sách'] || '').trim().toLowerCase() === 'triển khai'
      );

      renderCombo(
        'chart-class',
        s => {
          const t = String(s['Tỉnh mới'] || 'Khác').trim();
          const d = String(s['Đối tác'] || 'Khác').trim();
          return `${t} - ${d}`;
        },
        'chartClassInstance',
        (a, b, groups) => {
          const tA = a.split(' - ')[0];
          const tB = b.split(' - ')[0];
          if (tA !== tB) return (provTotals[tA] || 0) - (provTotals[tB] || 0);
          return groups[a].total - groups[b].total;
        },
        'Tiến độ theo Đối tác (Tỉnh)',
        s => String(s['Danh sách'] || '').trim().toLowerCase() === 'triển khai'
      );

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
      const ctxDaily = document.getElementById('chart-daily-line');
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

      this.renderDailyCompletedByPartnerTinh(sites, parseDate, today);

    } catch (err) {
      console.error('Lỗi khi vẽ biểu đồ:', err);
    }
  },

  // ----- Tiến độ ngày theo Đối tác (Tỉnh): số trạm hoàn thành trong ngày -----
  // Grouped bar chart: x-axis = Tỉnh, một dataset (màu) riêng cho mỗi Đối tác
  renderDailyCompletedByPartnerTinh(sites, parseDate, today) {
    const ctx = document.getElementById('chart-daily-partner-tinh');
    if (!ctx) return;
    if (window.chartDailyPartnerTinhInstance) window.chartDailyPartnerTinhInstance.destroy();

    const byProvPartner = {}; // { [tinh]: { [doiTac]: count } }
    sites.forEach(s => {
      if (DataService.getSiteStatus(s) !== 'completed') return;
      const d = parseDate(s['Ngày cập nhật']);
      if (!d || d.getDate() !== today.getDate() || d.getMonth() !== today.getMonth() || d.getFullYear() !== today.getFullYear()) return;

      const tinh = String(s['Tỉnh mới'] || s['Tỉnh'] || 'Khác').trim() || 'Khác';
      const doiTac = String(s['Đối tác'] || 'Khác').trim() || 'Khác';
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
