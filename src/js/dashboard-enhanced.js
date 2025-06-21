import { supabase } from './supabase.js';
import { requireAuth } from './auth.js';
import { reportsManager } from './reports.js';
import { chartsManager } from './charts.js';

class DashboardManager {
  constructor() {
    this.currentPage = 1;
    this.pageSize = 10;
    this.totalCount = 0;
    this.chart = null;
    this.currentFilters = {};
    this.initializeElements();
    this.bindEvents();
  }

  initializeElements() {
    // Form elements
    this.incomeForm = document.getElementById('income-form');
    this.incomeDateInput = document.getElementById('income-date');
    this.incomeAmountInput = document.getElementById('income-amount');
    this.incomeNotesInput = document.getElementById('income-notes');
    this.submitBtn = document.getElementById('submit-income');
    this.formMsg = document.getElementById('form-msg');

    // Display elements
    this.tableBody = document.querySelector('#income-table tbody');
    this.chartCanvas = document.getElementById('weekly-chart');
    this.analysisResult = document.getElementById('analysis-result');
    this.totalMonthSpan = document.getElementById('total-month');
    this.totalYearSpan = document.getElementById('total-year');

    // Filter elements
    this.filterBtn = document.getElementById('filter-btn');
    this.filterMonth = document.getElementById('filter-month-select');
    this.customDateStart = document.getElementById('custom-date-start');
    this.customDateEnd = document.getElementById('custom-date-end');

    // Pagination elements
    this.currentPageSpan = document.getElementById('current-page');
    this.prevPageBtn = document.getElementById('prev-page');
    this.nextPageBtn = document.getElementById('next-page');

    // Control elements
    this.logoutBtn = document.getElementById('logout-btn');

    // Report elements
    this.monthlyReportContainer = document.getElementById('monthly-report');
    this.annualReportContainer = document.getElementById('annual-report');
    this.projectionContainer = document.getElementById('projection-container');
  }

  bindEvents() {
    // Authentication
    this.logoutBtn?.addEventListener('click', this.handleLogout.bind(this));

    // Form events
    this.incomeForm?.addEventListener('submit', this.handleFormSubmit.bind(this));
    this.incomeDateInput?.addEventListener('change', this.handleDateChange.bind(this));

    // Filter events
    this.filterBtn?.addEventListener('click', this.handleFilter.bind(this));
    this.customDateStart?.addEventListener('change', this.handleCustomDateFilter.bind(this));
    this.customDateEnd?.addEventListener('change', this.handleCustomDateFilter.bind(this));

    // Pagination events
    this.prevPageBtn?.addEventListener('click', this.handlePrevPage.bind(this));
    this.nextPageBtn?.addEventListener('click', this.handleNextPage.bind(this));

    // Initialize on load
    window.addEventListener('DOMContentLoaded', this.initialize.bind(this));
  }

  async initialize() {
    const session = await requireAuth();
    if (!session) return;

    // Set default date to today
    if (this.incomeDateInput) {
      this.incomeDateInput.value = new Date().toISOString().split('T')[0];
    }

    // Load available date ranges for filters
    await this.loadDateRanges();

    // Initialize charts system
    await chartsManager.initialize();

    // Load initial data
    await this.loadDashboardData();
  }

  async loadDateRanges() {
    const ranges = await reportsManager.getAvailableDateRanges();
    if (!ranges || !this.filterMonth) return;

    // Clear existing options except the first one
    this.filterMonth.innerHTML = '<option value="">-- Selecciona mes y año --</option>';

    // Add available ranges
    ranges.monthRanges.forEach(range => {
      const option = document.createElement('option');
      option.value = range.value;
      option.textContent = range.label;
      this.filterMonth.appendChild(option);
    });

    // Set custom date range limits
    if (this.customDateStart) {
      this.customDateStart.min = ranges.minDate;
      this.customDateStart.max = ranges.maxDate;
    }
    if (this.customDateEnd) {
      this.customDateEnd.min = ranges.minDate;
      this.customDateEnd.max = ranges.maxDate;
    }
  }

  async loadDashboardData() {
    await Promise.all([
      this.loadIngresos(this.currentPage),
      this.loadMonthlyReport(),
      this.loadAnnualSummary()
    ]);
  }

  async handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
  }

  async handleDateChange() {
    const session = await requireAuth();
    if (!session) return;

    const date = this.incomeDateInput.value;
    if (!date) return;

    try {
      const { data: existing } = await supabase
        .from('ingresos')
        .select('*')
        .eq('fecha', date)
        .limit(1)
        .single();

      if (existing) {
        this.submitBtn.textContent = 'Editar Ingreso';
        this.incomeAmountInput.value = existing.monto;
        this.incomeNotesInput.value = existing.notas || '';
        this.submitBtn.dataset.id = existing.id;
        
        if (existing.user_id !== session.user.id) {
          this.submitBtn.disabled = true;
          this.formMsg.style.color = 'red';
          this.formMsg.textContent = 'No puedes editar un ingreso registrado por otro usuario.';
        } else {
          this.submitBtn.disabled = false;
          this.formMsg.textContent = '';
        }
      } else {
        this.resetForm();
      }
    } catch (error) {
      // No existing record found, reset form
      this.resetForm();
    }
  }

  resetForm() {
    this.submitBtn.textContent = 'Agregar';
    this.incomeAmountInput.value = '';
    this.incomeNotesInput.value = '';
    this.submitBtn.removeAttribute('data-id');
    this.submitBtn.disabled = false;
    this.formMsg.textContent = '';
  }

  async handleFormSubmit(e) {
    e.preventDefault();

    const date = this.incomeDateInput.value;
    const amount = parseFloat(this.incomeAmountInput.value);
    const notes = this.incomeNotesInput.value.trim();
    const id = this.submitBtn.dataset.id;

    // Validation
    this.formMsg.textContent = '';
    if (!date) {
      this.formMsg.textContent = 'Por favor selecciona una fecha.';
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      this.formMsg.textContent = 'Ingrese un monto válido mayor que cero.';
      return;
    }

    const session = await requireAuth();
    if (!session) return;

    this.submitBtn.disabled = true;

    try {
      if (id) {
        await this.updateIncome(id, amount, notes, session);
      } else {
        await this.createIncome(date, amount, notes, session);
      }

      this.formMsg.style.color = 'green';
      this.formMsg.textContent = id ? 'Ingreso actualizado correctamente.' : 'Ingreso guardado correctamente.';
      
      this.incomeForm.reset();
      this.resetForm();
      
      // Clear caches and reload data
      reportsManager.clearCache();
      chartsManager.clearCache();
      await this.loadDashboardData();
      await chartsManager.refreshChartsData();
      
    } catch (error) {
      this.formMsg.style.color = 'red';
      this.formMsg.textContent = 'Error: ' + error.message;
    } finally {
      this.submitBtn.disabled = false;
    }
  }

  async updateIncome(id, amount, notes, session) {
    const { data: existing } = await supabase
      .from('ingresos')
      .select('*')
      .eq('id', id)
      .single();

    if (!existing) {
      throw new Error('Ingreso no encontrado.');
    }

    if (existing.user_id !== session.user.id) {
      throw new Error('No puedes modificar un ingreso registrado por otro usuario.');
    }

    // Save to history
    await supabase.from('ingresos_historial').insert({
      ingreso_id: id,
      monto_anterior: existing.monto,
      user_id: session.user.id,
    });

    // Update income
    await supabase
      .from('ingresos')
      .update({
        monto: amount,
        notas: notes,
        modificaciones: existing.modificaciones + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  }

  async createIncome(date, amount, notes, session) {
    await supabase.from('ingresos').insert({
      user_id: session.user.id,
      fecha: date,
      monto: amount,
      notas: notes,
      modificaciones: 0,
    });
  }

  async handleFilter() {
    this.currentPage = 1;
    await this.loadIngresos(this.currentPage);
  }

  async handleCustomDateFilter() {
    if (this.customDateStart?.value && this.customDateEnd?.value) {
      this.currentPage = 1;
      await this.loadIngresos(this.currentPage);
    }
  }

  async handlePrevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      await this.loadIngresos(this.currentPage);
    }
  }

  async handleNextPage() {
    if (this.currentPage * this.pageSize < this.totalCount) {
      this.currentPage++;
      await this.loadIngresos(this.currentPage);
    }
  }

  async loadIngresos(page = 1) {
    const session = await requireAuth();
    if (!session) return;

    const from = (page - 1) * this.pageSize;
    const to = from + this.pageSize - 1;

    try {
      let query = supabase
        .from('ingresos')
        .select('*', { count: 'exact' })
        .order('fecha', { ascending: false })
        .range(from, to);

      // Apply filters
      const filters = this.getActiveFilters();
      query = this.applyFilters(query, filters);

      const { data: ingresos, error, count } = await query;

      if (error) throw error;

      this.totalCount = count || 0;
      this.renderIncomeTable(ingresos, session);
      this.updatePagination(page);
      this.drawChart(ingresos);
      this.showAnalysis(ingresos);

    } catch (error) {
      this.formMsg.style.color = 'red';
      this.formMsg.textContent = 'Error cargando ingresos: ' + error.message;
    }
  }

  getActiveFilters() {
    const filters = {};

    // Month filter
    if (this.filterMonth?.value) {
      const [year, month] = this.filterMonth.value.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      filters.startDate = `${year}-${month}-01`;
      filters.endDate = `${year}-${month}-${lastDay}`;
    }

    // Custom date range
    if (this.customDateStart?.value && this.customDateEnd?.value) {
      filters.startDate = this.customDateStart.value;
      filters.endDate = this.customDateEnd.value;
    }

    return filters;
  }

  applyFilters(query, filters) {
    if (filters.startDate) {
      query = query.gte('fecha', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('fecha', filters.endDate);
    }
    return query;
  }

  renderIncomeTable(ingresos, session) {
    if (!this.tableBody) return;

    this.tableBody.innerHTML = '';
    ingresos.forEach((ingreso) => {
      const canEdit = ingreso.user_id === session.user.id;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${new Date(ingreso.fecha).toLocaleDateString('es-ES')}</td>
        <td>S/. ${parseFloat(ingreso.monto).toFixed(2)}</td>
        <td>${ingreso.notas || '-'}</td>
        <td>
          ${canEdit ? `<button onclick="dashboard.editIngreso('${ingreso.id}', ${ingreso.monto}, '${ingreso.notas || ''}')" aria-label="Editar ingreso" class="btn-edit">✏️</button>` : ''}
          <span title="Modificaciones: ${ingreso.modificaciones}" class="modification-count">📝${ingreso.modificaciones}</span>
          <button onclick="dashboard.loadHistory('${ingreso.id}')" aria-label="Ver historial" class="btn-history">📜</button>
        </td>
      `;
      this.tableBody.appendChild(row);
    });
  }

  updatePagination(page) {
    if (this.currentPageSpan) {
      this.currentPageSpan.textContent = `${page} de ${Math.ceil(this.totalCount / this.pageSize)}`;
    }
    if (this.prevPageBtn) {
      this.prevPageBtn.disabled = page === 1;
    }
    if (this.nextPageBtn) {
      this.nextPageBtn.disabled = page * this.pageSize >= this.totalCount;
    }
  }

  async loadMonthlyReport() {
    const currentDate = new Date();
    const report = await reportsManager.generateMonthlyReport(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1
    );

    if (!report || !this.monthlyReportContainer) return;

    this.renderMonthlyReport(report);
    this.renderProjection(report);
  }

  renderMonthlyReport(report) {
    const container = this.monthlyReportContainer;
    if (!container) return;

    const comparisonText = report.comparison.trend === 'up' 
      ? `↗️ +${report.comparison.percentage.toFixed(1)}%`
      : `↘️ -${report.comparison.percentage.toFixed(1)}%`;

    container.innerHTML = `
      <div class="report-header">
        <h3>Reporte Mensual - ${reportsManager.getMonthName(report.month - 1)} ${report.year}</h3>
      </div>
      
      <div class="report-summary">
        <div class="summary-card">
          <h4>Total del Mes</h4>
          <p class="amount">S/. ${report.monthTotal.toFixed(2)}</p>
        </div>
        
        <div class="summary-card">
          <h4>Mes Anterior</h4>
          <p class="amount">S/. ${report.previousMonthTotal.toFixed(2)}</p>
          <p class="comparison ${report.comparison.trend}">${comparisonText}</p>
        </div>
        
        <div class="summary-card">
          <h4>Promedio Diario</h4>
          <p class="amount">S/. ${report.averageDaily.toFixed(2)}</p>
        </div>
      </div>

      <div class="daily-breakdown">
        <h4>Desglose Diario</h4>
        <div class="daily-grid">
          ${this.renderDailyGrid(report.dailyBreakdown)}
        </div>
      </div>
    `;
  }

  renderDailyGrid(dailyBreakdown) {
    return dailyBreakdown
      .filter(day => day.total > 0)
      .map(day => `
        <div class="daily-item">
          <span class="day">${day.day}</span>
          <span class="amount">S/. ${day.total.toFixed(2)}</span>
          <span class="accumulated">Acum: S/. ${day.accumulated.toFixed(2)}</span>
        </div>
      `).join('');
  }

  renderProjection(report) {
    if (!this.projectionContainer || !report.projection.isProjection) return;

    const projection = report.projection;
    
    this.projectionContainer.innerHTML = `
      <div class="projection-card">
        <h4>Proyección Fin de Mes</h4>
        <div class="projection-details">
          <p><strong>Total Actual:</strong> S/. ${projection.totalSoFar.toFixed(2)}</p>
          <p><strong>Días Restantes:</strong> ${projection.daysRemaining}</p>
          <p><strong>Promedio Diario:</strong> S/. ${projection.averageDaily.toFixed(2)}</p>
          <p class="projected-total"><strong>Proyección Total:</strong> S/. ${projection.projectedTotal.toFixed(2)}</p>
        </div>
      </div>
    `;
  }

  async loadAnnualSummary() {
    const currentYear = new Date().getFullYear();
    const report = await reportsManager.generateAnnualReport(currentYear);

    if (!report || !this.annualReportContainer) return;

    this.renderAnnualReport(report);
    this.updateYearlyTotals(report);
  }

  renderAnnualReport(report) {
    const container = this.annualReportContainer;
    if (!container) return;

    const trendIcon = report.growthTrend.trend === 'up' ? '📈' : '📉';
    
    container.innerHTML = `
      <div class="annual-header">
        <h3>Reporte Anual ${report.year}</h3>
        <div class="annual-summary">
          <p><strong>Total Anual:</strong> S/. ${report.annualTotal.toFixed(2)}</p>
          <p><strong>Promedio Mensual:</strong> S/. ${report.averageMonthly.toFixed(2)}</p>
          <p><strong>Tendencia:</strong> ${trendIcon} ${report.growthTrend.rate.toFixed(1)}%</p>
        </div>
      </div>

      <div class="monthly-comparison">
        <h4>Comparación Mensual</h4>
        <div class="months-grid">
          ${this.renderMonthlyComparison(report.monthlyData)}
        </div>
      </div>

      <div class="best-worst">
        <div class="best-month">
          <h5>Mejor Mes</h5>
          <p>${report.bestMonth.monthName}: S/. ${report.bestMonth.total.toFixed(2)}</p>
        </div>
        <div class="worst-month">
          <h5>Mes Más Bajo</h5>
          <p>${report.worstMonth.monthName}: S/. ${report.worstMonth.total.toFixed(2)}</p>
        </div>
      </div>
    `;
  }

  renderMonthlyComparison(monthlyData) {
    return monthlyData.map(month => {
      const comparisonText = month.comparison 
        ? (month.comparison.trend === 'up' 
          ? `+${month.comparison.percentage.toFixed(1)}%` 
          : `-${month.comparison.percentage.toFixed(1)}%`)
        : 'N/A';

      return `
        <div class="month-item">
          <span class="month-name">${month.monthName}</span>
          <span class="month-total">S/. ${month.total.toFixed(2)}</span>
          <span class="month-comparison ${month.comparison?.trend || ''}">${comparisonText}</span>
        </div>
      `;
    }).join('');
  }

  updateYearlyTotals(report) {
    if (this.totalYearSpan) {
      this.totalYearSpan.textContent = `Total año ${report.year}: S/. ${report.annualTotal.toFixed(2)}`;
    }
  }

  drawChart(ingresos) {
    if (!this.chartCanvas) return;

    const currentDate = new Date();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const dailyData = Array(daysInMonth).fill(0);

    ingresos.forEach(i => {
      const day = new Date(i.fecha).getDate() - 1;
      if (day >= 0 && day < daysInMonth) {
        dailyData[day] += parseFloat(i.monto);
      }
    });

    if (this.chart) this.chart.destroy();
    
    this.chart = new Chart(this.chartCanvas, {
      type: 'bar',
      data: {
        labels: Array.from({ length: daysInMonth }, (_, i) => i + 1),
        datasets: [{
          label: 'Ingresos por día',
          data: dailyData,
          backgroundColor: '#58508d',
          borderColor: '#003f5c',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Monto (S/.)' }
          },
          x: {
            title: { display: true, text: 'Día del mes' }
          }
        }
      }
    });
  }

  showAnalysis(ingresos) {
    if (!this.analysisResult) return;

    const totals = Array(7).fill(0);
    ingresos.forEach(i => {
      const day = new Date(i.fecha).getDay();
      totals[day] += parseFloat(i.monto);
    });

    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const sortedDays = totals
      .map((total, index) => ({ day: days[index], total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    const resultText = sortedDays
      .map(({ day, total }, i) => `${i + 1}º: ${day} (S/. ${total.toFixed(2)})`)
      .join(', ');

    this.analysisResult.textContent = `📊 Los 3 días con mayores ingresos son: ${resultText}.`;
  }

  // Public methods for global access
  async editIngreso(id, monto, notas) {
    this.incomeDateInput.value = '';
    this.incomeAmountInput.value = monto;
    this.incomeNotesInput.value = notas;
    this.submitBtn.textContent = 'Editar Ingreso';
    this.submitBtn.dataset.id = id;
    this.formMsg.textContent = '';
    this.submitBtn.disabled = false;
  }

  async loadHistory(ingresoId) {
    try {
      const { data: historial, error } = await supabase
        .from('ingresos_historial')
        .select('monto_anterior, fecha_modificacion, user_id')
        .eq('ingreso_id', ingresoId)
        .order('fecha_modificacion', { ascending: false });

      if (error) throw error;

      this.showHistoryModal(historial);
    } catch (error) {
      alert('Error cargando historial: ' + error.message);
    }
  }

  showHistoryModal(historial) {
    const modal = document.createElement('div');
    modal.className = 'history-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Historial de Modificaciones</h3>
          <button class="close-btn" onclick="this.closest('.history-modal').remove()">×</button>
        </div>
        <div class="modal-body">
          ${historial.length ? `
            <ul class="history-list">
              ${historial.map(h => `
                <li class="history-item">
                  <div class="history-date">${new Date(h.fecha_modificacion).toLocaleString('es-ES')}</div>
                  <div class="history-amount">Monto anterior: S/. ${parseFloat(h.monto_anterior).toFixed(2)}</div>
                  <div class="history-user">Usuario: ${h.user_id}</div>
                </li>
              `).join('')}
            </ul>
          ` : '<p class="no-history">No hay modificaciones registradas.</p>'}
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }
}

// Create global instance
const dashboard = new DashboardManager();

// Export for global access
window.dashboard = dashboard;

export default dashboard;