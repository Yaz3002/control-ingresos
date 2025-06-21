import { supabase } from './supabase.js';
import { requireAuth } from './auth.js';

export class ChartsManager {
  constructor() {
    this.charts = new Map();
    this.activeFilters = {
      dateRange: { start: null, end: null },
      period: 'current-month',
      chartType: 'bar',
      comparison: false,
      category: 'all'
    };
    this.chartColors = {
      primary: '#58508d',
      secondary: '#bc5090',
      accent: '#ffa600',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      neutral: '#6b7280'
    };
    this.cache = new Map();
  }

  // Initialize charts system
  async initialize() {
    const session = await requireAuth();
    if (!session) return;

    this.bindFilterEvents();
    await this.loadInitialData();
    this.createDefaultCharts();
  }

  bindFilterEvents() {
    // Period filter
    const periodFilter = document.getElementById('chart-period-filter');
    periodFilter?.addEventListener('change', this.handlePeriodChange.bind(this));

    // Date range filters
    const startDateFilter = document.getElementById('chart-start-date');
    const endDateFilter = document.getElementById('chart-end-date');
    startDateFilter?.addEventListener('change', this.handleDateRangeChange.bind(this));
    endDateFilter?.addEventListener('change', this.handleDateRangeChange.bind(this));

    // Chart type selector
    const chartTypeSelector = document.getElementById('chart-type-selector');
    chartTypeSelector?.addEventListener('change', this.handleChartTypeChange.bind(this));

    // Comparison toggle
    const comparisonToggle = document.getElementById('comparison-toggle');
    comparisonToggle?.addEventListener('change', this.handleComparisonToggle.bind(this));

    // Export button
    const exportBtn = document.getElementById('export-chart-data');
    exportBtn?.addEventListener('click', this.handleExportData.bind(this));

    // Apply filters button
    const applyFiltersBtn = document.getElementById('apply-chart-filters');
    applyFiltersBtn?.addEventListener('click', this.applyFilters.bind(this));

    // Reset filters button
    const resetFiltersBtn = document.getElementById('reset-chart-filters');
    resetFiltersBtn?.addEventListener('click', this.resetFilters.bind(this));
  }

  async loadInitialData() {
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    this.activeFilters.dateRange = {
      start: startOfMonth.toISOString().split('T')[0],
      end: endOfMonth.toISOString().split('T')[0]
    };

    await this.loadAvailableDateRanges();
    await this.refreshChartsData();
  }

  async loadAvailableDateRanges() {
    try {
      const { data, error } = await supabase
        .from('ingresos')
        .select('fecha')
        .order('fecha', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return;

      const dates = data.map(item => new Date(item.fecha));
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      this.populateDateRangeOptions(minDate, maxDate);
      this.setDateRangeLimits(minDate, maxDate);
    } catch (error) {
      console.error('Error loading date ranges:', error);
    }
  }

  populateDateRangeOptions(minDate, maxDate) {
    const periodFilter = document.getElementById('chart-period-filter');
    if (!periodFilter) return;

    // Clear existing options except defaults
    const defaultOptions = Array.from(periodFilter.children).slice(0, 5);
    periodFilter.innerHTML = '';
    defaultOptions.forEach(option => periodFilter.appendChild(option));

    // Add year options
    const startYear = minDate.getFullYear();
    const endYear = maxDate.getFullYear();

    for (let year = endYear; year >= startYear; year--) {
      const option = document.createElement('option');
      option.value = `year-${year}`;
      option.textContent = `Año ${year}`;
      periodFilter.appendChild(option);
    }

    // Add month options for current and previous years
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    for (let year = endYear; year >= Math.max(startYear, endYear - 2); year--) {
      const startMonth = year === startYear ? minDate.getMonth() : 0;
      const endMonth = year === endYear ? maxDate.getMonth() : 11;

      for (let month = endMonth; month >= startMonth; month--) {
        const option = document.createElement('option');
        option.value = `month-${year}-${month + 1}`;
        option.textContent = `${monthNames[month]} ${year}`;
        periodFilter.appendChild(option);
      }
    }
  }

  setDateRangeLimits(minDate, maxDate) {
    const startDateInput = document.getElementById('chart-start-date');
    const endDateInput = document.getElementById('chart-end-date');

    if (startDateInput) {
      startDateInput.min = minDate.toISOString().split('T')[0];
      startDateInput.max = maxDate.toISOString().split('T')[0];
    }

    if (endDateInput) {
      endDateInput.min = minDate.toISOString().split('T')[0];
      endDateInput.max = maxDate.toISOString().split('T')[0];
    }
  }

  async handlePeriodChange(event) {
    const period = event.target.value;
    this.activeFilters.period = period;

    // Calculate date range based on period
    const dateRange = this.calculateDateRangeFromPeriod(period);
    if (dateRange) {
      this.activeFilters.dateRange = dateRange;
      this.updateDateRangeInputs(dateRange);
    }

    await this.applyFilters();
  }

  calculateDateRangeFromPeriod(period) {
    const now = new Date();
    let start, end;

    switch (period) {
      case 'current-month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;

      case 'last-month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;

      case 'current-year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;

      case 'last-3-months':
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;

      case 'last-6-months':
        start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;

      default:
        if (period.startsWith('year-')) {
          const year = parseInt(period.split('-')[1]);
          start = new Date(year, 0, 1);
          end = new Date(year, 11, 31);
        } else if (period.startsWith('month-')) {
          const [, year, month] = period.split('-').map(Number);
          start = new Date(year, month - 1, 1);
          end = new Date(year, month, 0);
        } else {
          return null;
        }
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  }

  updateDateRangeInputs(dateRange) {
    const startDateInput = document.getElementById('chart-start-date');
    const endDateInput = document.getElementById('chart-end-date');

    if (startDateInput) startDateInput.value = dateRange.start;
    if (endDateInput) endDateInput.value = dateRange.end;
  }

  async handleDateRangeChange() {
    const startDate = document.getElementById('chart-start-date')?.value;
    const endDate = document.getElementById('chart-end-date')?.value;

    if (startDate && endDate) {
      this.activeFilters.dateRange = { start: startDate, end: endDate };
      this.activeFilters.period = 'custom';
      
      // Update period selector
      const periodFilter = document.getElementById('chart-period-filter');
      if (periodFilter) periodFilter.value = 'custom';

      await this.applyFilters();
    }
  }

  async handleChartTypeChange(event) {
    this.activeFilters.chartType = event.target.value;
    await this.refreshCharts();
  }

  async handleComparisonToggle(event) {
    this.activeFilters.comparison = event.target.checked;
    await this.refreshCharts();
  }

  async applyFilters() {
    this.updateFilterSummary();
    await this.refreshChartsData();
    await this.refreshCharts();
  }

  async resetFilters() {
    // Reset to current month
    const now = new Date();
    this.activeFilters = {
      dateRange: {
        start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      },
      period: 'current-month',
      chartType: 'bar',
      comparison: false,
      category: 'all'
    };

    // Update UI elements
    this.updateFilterInputs();
    await this.applyFilters();
  }

  updateFilterInputs() {
    const periodFilter = document.getElementById('chart-period-filter');
    const startDateInput = document.getElementById('chart-start-date');
    const endDateInput = document.getElementById('chart-end-date');
    const chartTypeSelector = document.getElementById('chart-type-selector');
    const comparisonToggle = document.getElementById('comparison-toggle');

    if (periodFilter) periodFilter.value = this.activeFilters.period;
    if (startDateInput) startDateInput.value = this.activeFilters.dateRange.start;
    if (endDateInput) endDateInput.value = this.activeFilters.dateRange.end;
    if (chartTypeSelector) chartTypeSelector.value = this.activeFilters.chartType;
    if (comparisonToggle) comparisonToggle.checked = this.activeFilters.comparison;
  }

  updateFilterSummary() {
    const summaryElement = document.getElementById('filter-summary');
    if (!summaryElement) return;

    const { dateRange, period, chartType, comparison } = this.activeFilters;
    
    const startDate = new Date(dateRange.start).toLocaleDateString('es-ES');
    const endDate = new Date(dateRange.end).toLocaleDateString('es-ES');
    
    const periodText = this.getPeriodDisplayText(period);
    const chartTypeText = this.getChartTypeDisplayText(chartType);
    
    summaryElement.innerHTML = `
      <div class="filter-summary-content">
        <h4>Filtros Activos</h4>
        <div class="filter-tags">
          <span class="filter-tag">📅 ${periodText}</span>
          <span class="filter-tag">📊 ${chartTypeText}</span>
          <span class="filter-tag">📈 ${startDate} - ${endDate}</span>
          ${comparison ? '<span class="filter-tag">🔄 Comparación activa</span>' : ''}
        </div>
      </div>
    `;
  }

  getPeriodDisplayText(period) {
    const periodMap = {
      'current-month': 'Mes Actual',
      'last-month': 'Mes Anterior',
      'current-year': 'Año Actual',
      'last-3-months': 'Últimos 3 Meses',
      'last-6-months': 'Últimos 6 Meses',
      'custom': 'Período Personalizado'
    };

    if (period.startsWith('year-')) {
      return `Año ${period.split('-')[1]}`;
    }
    
    if (period.startsWith('month-')) {
      const [, year, month] = period.split('-');
      const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    }

    return periodMap[period] || period;
  }

  getChartTypeDisplayText(chartType) {
    const typeMap = {
      'bar': 'Barras',
      'line': 'Líneas',
      'pie': 'Circular',
      'doughnut': 'Dona',
      'area': 'Área'
    };
    return typeMap[chartType] || chartType;
  }

  async refreshChartsData() {
    const { start, end } = this.activeFilters.dateRange;
    
    try {
      const { data: incomes, error } = await supabase
        .from('ingresos')
        .select('fecha, monto, notas, user_id')
        .gte('fecha', start)
        .lte('fecha', end)
        .order('fecha', { ascending: true });

      if (error) throw error;

      this.currentData = incomes || [];
      this.processChartData();
      this.updateMonthlyTotal();

      // Load comparison data if needed
      if (this.activeFilters.comparison) {
        await this.loadComparisonData();
      }

    } catch (error) {
      console.error('Error loading chart data:', error);
      this.currentData = [];
    }
  }

  processChartData() {
    if (!this.currentData) return;

    // Process data based on the selected period
    const { period } = this.activeFilters;
    
    if (period === 'current-year' || period.startsWith('year-')) {
      this.processedData = this.groupByMonth(this.currentData);
    } else {
      this.processedData = this.groupByDay(this.currentData);
    }
  }

  groupByMonth(data) {
    const monthlyData = {};
    const monthNames = [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
    ];

    data.forEach(income => {
      const date = new Date(income.fecha);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      const monthLabel = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          label: monthLabel,
          total: 0,
          count: 0,
          entries: []
        };
      }

      monthlyData[monthKey].total += parseFloat(income.monto);
      monthlyData[monthKey].count++;
      monthlyData[monthKey].entries.push(income);
    });

    return Object.values(monthlyData).sort((a, b) => 
      new Date(a.entries[0].fecha) - new Date(b.entries[0].fecha)
    );
  }

  groupByDay(data) {
    const dailyData = {};

    data.forEach(income => {
      const date = income.fecha;
      const displayDate = new Date(date).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit'
      });

      if (!dailyData[date]) {
        dailyData[date] = {
          label: displayDate,
          total: 0,
          count: 0,
          entries: []
        };
      }

      dailyData[date].total += parseFloat(income.monto);
      dailyData[date].count++;
      dailyData[date].entries.push(income);
    });

    return Object.values(dailyData).sort((a, b) => 
      new Date(a.entries[0].fecha) - new Date(b.entries[0].fecha)
    );
  }

  updateMonthlyTotal() {
    const totalElement = document.getElementById('filtered-period-total');
    if (!totalElement || !this.currentData) return;

    const total = this.currentData.reduce((sum, income) => sum + parseFloat(income.monto), 0);
    const count = this.currentData.length;
    
    const { start, end } = this.activeFilters.dateRange;
    const startDate = new Date(start).toLocaleDateString('es-ES');
    const endDate = new Date(end).toLocaleDateString('es-ES');
    
    totalElement.innerHTML = `
      <div class="period-total-card">
        <h3>Total del Período Seleccionado</h3>
        <div class="total-amount">S/. ${total.toFixed(2)}</div>
        <div class="total-details">
          <p><strong>Período:</strong> ${startDate} - ${endDate}</p>
          <p><strong>Registros:</strong> ${count} ingresos</p>
          <p><strong>Promedio:</strong> S/. ${count > 0 ? (total / count).toFixed(2) : '0.00'} por registro</p>
        </div>
      </div>
    `;
  }

  async loadComparisonData() {
    const { start, end } = this.activeFilters.dateRange;
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // Calculate comparison period (same duration, previous period)
    const duration = endDate - startDate;
    const comparisonEnd = new Date(startDate.getTime() - 1);
    const comparisonStart = new Date(comparisonEnd.getTime() - duration);

    try {
      const { data: comparisonIncomes, error } = await supabase
        .from('ingresos')
        .select('fecha, monto, notas, user_id')
        .gte('fecha', comparisonStart.toISOString().split('T')[0])
        .lte('fecha', comparisonEnd.toISOString().split('T')[0])
        .order('fecha', { ascending: true });

      if (error) throw error;

      this.comparisonData = comparisonIncomes || [];
      this.processComparisonData();

    } catch (error) {
      console.error('Error loading comparison data:', error);
      this.comparisonData = [];
    }
  }

  processComparisonData() {
    if (!this.comparisonData) return;

    const { period } = this.activeFilters;
    
    if (period === 'current-year' || period.startsWith('year-')) {
      this.processedComparisonData = this.groupByMonth(this.comparisonData);
    } else {
      this.processedComparisonData = this.groupByDay(this.comparisonData);
    }
  }

  createDefaultCharts() {
    this.createMainChart();
    this.createTrendChart();
    this.createDistributionChart();
  }

  createMainChart() {
    const canvas = document.getElementById('main-income-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart
    if (this.charts.has('main')) {
      this.charts.get('main').destroy();
    }

    const chart = new Chart(ctx, {
      type: this.activeFilters.chartType,
      data: this.getMainChartData(),
      options: this.getMainChartOptions()
    });

    this.charts.set('main', chart);
  }

  getMainChartData() {
    if (!this.processedData) return { labels: [], datasets: [] };

    const labels = this.processedData.map(item => item.label);
    const data = this.processedData.map(item => item.total);

    const datasets = [{
      label: 'Ingresos',
      data: data,
      backgroundColor: this.activeFilters.chartType === 'pie' || this.activeFilters.chartType === 'doughnut'
        ? this.generateColorPalette(data.length)
        : this.chartColors.primary,
      borderColor: this.chartColors.primary,
      borderWidth: 2,
      fill: this.activeFilters.chartType === 'area'
    }];

    // Add comparison dataset if enabled
    if (this.activeFilters.comparison && this.processedComparisonData) {
      const comparisonData = this.processedComparisonData.map(item => item.total);
      datasets.push({
        label: 'Período Anterior',
        data: comparisonData,
        backgroundColor: this.chartColors.secondary,
        borderColor: this.chartColors.secondary,
        borderWidth: 2,
        fill: false
      });
    }

    return { labels, datasets };
  }

  getMainChartOptions() {
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'Ingresos por Período',
          font: { size: 16, weight: 'bold' }
        },
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed.y || context.parsed;
              return `${context.dataset.label}: S/. ${value.toFixed(2)}`;
            }
          }
        }
      }
    };

    // Add scales for bar and line charts
    if (['bar', 'line', 'area'].includes(this.activeFilters.chartType)) {
      baseOptions.scales = {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Monto (S/.)'
          },
          ticks: {
            callback: (value) => `S/. ${value.toFixed(0)}`
          }
        },
        x: {
          title: {
            display: true,
            text: 'Período'
          }
        }
      };
    }

    return baseOptions;
  }

  createTrendChart() {
    const canvas = document.getElementById('trend-chart');
    if (!canvas || !this.processedData) return;

    const ctx = canvas.getContext('2d');
    
    if (this.charts.has('trend')) {
      this.charts.get('trend').destroy();
    }

    // Calculate cumulative data for trend
    let cumulative = 0;
    const cumulativeData = this.processedData.map(item => {
      cumulative += item.total;
      return cumulative;
    });

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.processedData.map(item => item.label),
        datasets: [{
          label: 'Acumulado',
          data: cumulativeData,
          borderColor: this.chartColors.accent,
          backgroundColor: this.chartColors.accent + '20',
          borderWidth: 3,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Tendencia Acumulada',
            font: { size: 14, weight: 'bold' }
          },
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Acumulado (S/.)'
            },
            ticks: {
              callback: (value) => `S/. ${value.toFixed(0)}`
            }
          }
        }
      }
    });

    this.charts.set('trend', chart);
  }

  createDistributionChart() {
    const canvas = document.getElementById('distribution-chart');
    if (!canvas || !this.processedData) return;

    const ctx = canvas.getContext('2d');
    
    if (this.charts.has('distribution')) {
      this.charts.get('distribution').destroy();
    }

    // Create distribution ranges
    const amounts = this.currentData.map(income => parseFloat(income.monto));
    const max = Math.max(...amounts);
    const ranges = this.createAmountRanges(max);
    
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ranges.labels,
        datasets: [{
          data: ranges.counts,
          backgroundColor: this.generateColorPalette(ranges.labels.length),
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Distribución por Rangos',
            font: { size: 14, weight: 'bold' }
          },
          legend: {
            position: 'right'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((context.parsed / total) * 100).toFixed(1);
                return `${context.label}: ${context.parsed} (${percentage}%)`;
              }
            }
          }
        }
      }
    });

    this.charts.set('distribution', chart);
  }

  createAmountRanges(maxAmount) {
    const rangeSize = Math.ceil(maxAmount / 5);
    const ranges = [];
    const counts = [];

    for (let i = 0; i < 5; i++) {
      const min = i * rangeSize;
      const max = (i + 1) * rangeSize;
      const label = `S/. ${min} - ${max}`;
      
      const count = this.currentData.filter(income => {
        const amount = parseFloat(income.monto);
        return amount >= min && (i === 4 ? amount <= max : amount < max);
      }).length;

      ranges.push(label);
      counts.push(count);
    }

    return { labels: ranges, counts };
  }

  generateColorPalette(count) {
    const colors = [
      this.chartColors.primary,
      this.chartColors.secondary,
      this.chartColors.accent,
      this.chartColors.success,
      this.chartColors.warning,
      this.chartColors.error,
      this.chartColors.neutral
    ];

    const palette = [];
    for (let i = 0; i < count; i++) {
      palette.push(colors[i % colors.length]);
    }

    return palette;
  }

  async refreshCharts() {
    this.createMainChart();
    this.createTrendChart();
    this.createDistributionChart();
  }

  async handleExportData() {
    if (!this.currentData || this.currentData.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const exportData = this.prepareExportData();
    this.downloadCSV(exportData);
  }

  prepareExportData() {
    const headers = ['Fecha', 'Monto', 'Notas', 'Usuario'];
    const rows = this.currentData.map(income => [
      income.fecha,
      parseFloat(income.monto).toFixed(2),
      income.notas || '',
      income.user_id
    ]);

    // Add summary row
    const total = this.currentData.reduce((sum, income) => sum + parseFloat(income.monto), 0);
    rows.push(['', '', '', '']);
    rows.push(['TOTAL', total.toFixed(2), '', '']);

    return [headers, ...rows];
  }

  downloadCSV(data) {
    const csvContent = data.map(row => 
      row.map(field => `"${field}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `ingresos_${this.activeFilters.dateRange.start}_${this.activeFilters.dateRange.end}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  // Clear cache when data changes
  clearCache() {
    this.cache.clear();
  }

  // Destroy all charts
  destroy() {
    this.charts.forEach(chart => chart.destroy());
    this.charts.clear();
  }
}

// Export singleton instance
export const chartsManager = new ChartsManager();