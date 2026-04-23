export class TimelineChart {
  constructor() {
    this.canvas      = document.getElementById('price-chart');
    this.chartSection= document.querySelector('.chart-section');
    this.priceSummary= document.querySelector('.price-summary');
    this.chart       = null;
  }

  render(correlatedDays) {
    if (!correlatedDays?.length || !this.canvas) return;

    this._updatePriceSummary(correlatedDays);
    this._renderChart(correlatedDays);

    this.chartSection?.classList.add('visible');
    this.priceSummary?.classList.add('visible');
  }

  reset() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    this.chartSection?.classList.remove('visible');
    this.priceSummary?.classList.remove('visible');
  }

  // ── Private ────────────────────────────────────────────────────

  _updatePriceSummary(days) {
    const last     = days[days.length - 1];
    const first    = days[0];
    const weekChg  = first.close
      ? ((last.close - first.close) / first.close * 100).toFixed(2)
      : 0;
    const dir      = weekChg > 0 ? 'up' : weekChg < 0 ? 'down' : 'flat';
    const arrow    = weekChg > 0 ? '▲' : weekChg < 0 ? '▼' : '—';

    const tickerEl = this.priceSummary?.querySelector('.price-ticker');
    const valueEl  = this.priceSummary?.querySelector('.price-value');
    const changeEl = this.priceSummary?.querySelector('.price-change');

    if (tickerEl) tickerEl.textContent = '';
    if (valueEl)  valueEl.textContent  = `$${last.close.toFixed(2)}`;
    if (changeEl) {
      changeEl.textContent = `${arrow} ${Math.abs(weekChg)}% this period`;
      changeEl.className = `price-change ${dir}`;
    }
  }

  _renderChart(days) {
    const Chart = window.Chart;
    if (!Chart) return;

    const labels  = days.map(d => d.date.slice(5));
    const prices  = days.map(d => d.close);
    const colors  = days.map(d => {
      if (d.direction === 'Up')   return '#16A34A';
      if (d.direction === 'Down') return '#DC2626';
      return '#6B7280';
    });

    const newsAnnotations = days
      .filter(d => d.news.length > 0)
      .map(d => {
        const idx = days.indexOf(d);
        return { idx, headlines: d.news.map(n => n.headline).join('\n') };
      });

    if (this.chart) this.chart.destroy();

    const ctx = this.canvas.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Close Price',
          data: prices,
          borderColor: '#059669',
          backgroundColor: 'rgba(5,150,105,0.08)',
          borderWidth: 2,
          pointBackgroundColor: colors,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `$${ctx.parsed.y.toFixed(2)}`,
              afterBody: (items) => {
                const idx = items[0]?.dataIndex;
                const ann = newsAnnotations.find(a => a.idx === idx);
                return ann ? ann.headlines.split('\n').map(h => `📰 ${h.slice(0, 40)}…`) : [];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { font: { size: 10 } }
          },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { font: { size: 10 }, callback: v => `$${v}` }
          }
        },
        animation: { duration: 600, easing: 'easeOutQuart' }
      },
      plugins: [{
        id: 'newsMarkers',
        afterDraw(chart) {
          const { ctx: c, chartArea, scales } = chart;
          newsAnnotations.forEach(({ idx }) => {
            const x = scales.x.getPixelForValue(idx);
            c.save();
            c.strokeStyle = 'rgba(245,158,11,0.6)';
            c.lineWidth   = 1.5;
            c.setLineDash([4, 3]);
            c.beginPath();
            c.moveTo(x, chartArea.top);
            c.lineTo(x, chartArea.bottom);
            c.stroke();
            c.restore();
          });
        }
      }]
    });
  }
}
