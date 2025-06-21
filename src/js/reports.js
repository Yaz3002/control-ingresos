import { supabase } from './supabase.js';
import { requireAuth } from './auth.js';

export class ReportsManager {
  constructor() {
    this.currentYear = new Date().getFullYear();
    this.currentMonth = new Date().getMonth() + 1;
    this.cache = new Map();
  }

  // Cache management for performance
  getCacheKey(type, params) {
    return `${type}_${JSON.stringify(params)}`;
  }

  setCache(key, data, ttl = 300000) { // 5 minutes TTL
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  getCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  // Fetch optimized income data
  async fetchIncomeData(startDate, endDate, useCache = true) {
    const cacheKey = this.getCacheKey('income', { startDate, endDate });
    
    if (useCache) {
      const cached = this.getCache(cacheKey);
      if (cached) return cached;
    }

    const session = await requireAuth();
    if (!session) return null;

    try {
      const { data, error } = await supabase
        .from('ingresos')
        .select('fecha, monto, notas, user_id, created_at')
        .gte('fecha', startDate)
        .lte('fecha', endDate)
        .order('fecha', { ascending: true });

      if (error) throw error;

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching income data:', error);
      return [];
    }
  }

  // Generate monthly report with daily breakdown
  async generateMonthlyReport(year = this.currentYear, month = this.currentMonth) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month.toString().padStart(2, '0')}-${daysInMonth}`;
    
    const incomes = await this.fetchIncomeData(startDate, endDate);
    if (!incomes) return null;

    // Daily breakdown
    const dailyBreakdown = this.generateDailyBreakdown(incomes, year, month);
    
    // Previous month comparison
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const previousMonthData = await this.getPreviousMonthTotal(prevYear, prevMonth);
    
    // Projections
    const projection = this.calculateMonthProjection(dailyBreakdown, daysInMonth);
    
    return {
      year,
      month,
      dailyBreakdown,
      monthTotal: dailyBreakdown.reduce((sum, day) => sum + day.total, 0),
      previousMonthTotal: previousMonthData.total,
      comparison: this.calculateComparison(
        dailyBreakdown.reduce((sum, day) => sum + day.total, 0),
        previousMonthData.total
      ),
      projection,
      averageDaily: projection.averageDaily,
      daysRemaining: projection.daysRemaining
    };
  }

  generateDailyBreakdown(incomes, year, month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyData = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      date: `${year}-${month.toString().padStart(2, '0')}-${(i + 1).toString().padStart(2, '0')}`,
      total: 0,
      count: 0,
      entries: [],
      accumulated: 0
    }));

    // Group incomes by day
    incomes.forEach(income => {
      const day = new Date(income.fecha).getDate() - 1;
      if (day >= 0 && day < daysInMonth) {
        dailyData[day].total += parseFloat(income.monto);
        dailyData[day].count++;
        dailyData[day].entries.push({
          monto: parseFloat(income.monto),
          notas: income.notas,
          user_id: income.user_id
        });
      }
    });

    // Calculate accumulated totals
    let accumulated = 0;
    dailyData.forEach(day => {
      accumulated += day.total;
      day.accumulated = accumulated;
    });

    return dailyData;
  }

  async getPreviousMonthTotal(year, month) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month.toString().padStart(2, '0')}-${daysInMonth}`;
    
    const incomes = await this.fetchIncomeData(startDate, endDate);
    const total = incomes.reduce((sum, income) => sum + parseFloat(income.monto), 0);
    
    return { total, count: incomes.length };
  }

  calculateComparison(current, previous) {
    if (previous === 0) {
      return { percentage: current > 0 ? 100 : 0, trend: 'up' };
    }
    
    const percentage = ((current - previous) / previous) * 100;
    return {
      percentage: Math.abs(percentage),
      trend: percentage >= 0 ? 'up' : 'down',
      difference: current - previous
    };
  }

  calculateMonthProjection(dailyBreakdown, daysInMonth) {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    
    // Only project if we're looking at current month
    const isCurrentMonth = dailyBreakdown.length > 0 && 
      dailyBreakdown[0].date.startsWith(`${currentYear}-${currentMonth.toString().padStart(2, '0')}`);
    
    if (!isCurrentMonth) {
      return {
        projectedTotal: dailyBreakdown.reduce((sum, day) => sum + day.total, 0),
        averageDaily: dailyBreakdown.reduce((sum, day) => sum + day.total, 0) / daysInMonth,
        daysRemaining: 0,
        isProjection: false
      };
    }

    const daysWithData = Math.min(currentDay, daysInMonth);
    const totalSoFar = dailyBreakdown.slice(0, daysWithData).reduce((sum, day) => sum + day.total, 0);
    const averageDaily = daysWithData > 0 ? totalSoFar / daysWithData : 0;
    const daysRemaining = daysInMonth - daysWithData;
    const projectedTotal = totalSoFar + (averageDaily * daysRemaining);

    return {
      projectedTotal,
      averageDaily,
      daysRemaining,
      totalSoFar,
      isProjection: true
    };
  }

  // Generate annual report
  async generateAnnualReport(year = this.currentYear) {
    const monthlyData = [];
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    // Fetch data for each month
    for (let month = 1; month <= 12; month++) {
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const daysInMonth = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${daysInMonth}`;
      
      const incomes = await this.fetchIncomeData(startDate, endDate);
      const total = incomes.reduce((sum, income) => sum + parseFloat(income.monto), 0);
      
      monthlyData.push({
        month,
        monthName: monthNames[month - 1],
        total,
        count: incomes.length,
        average: incomes.length > 0 ? total / incomes.length : 0
      });
    }

    // Calculate month-to-month comparisons
    const comparisons = monthlyData.map((current, index) => {
      if (index === 0) {
        return { ...current, comparison: null };
      }
      
      const previous = monthlyData[index - 1];
      const comparison = this.calculateComparison(current.total, previous.total);
      
      return { ...current, comparison };
    });

    // Calculate growth trend
    const growthTrend = this.calculateGrowthTrend(monthlyData);
    
    // Annual totals
    const annualTotal = monthlyData.reduce((sum, month) => sum + month.total, 0);
    const averageMonthly = annualTotal / 12;
    
    return {
      year,
      monthlyData: comparisons,
      annualTotal,
      averageMonthly,
      growthTrend,
      bestMonth: monthlyData.reduce((best, current) => 
        current.total > best.total ? current : best
      ),
      worstMonth: monthlyData.reduce((worst, current) => 
        current.total < worst.total ? current : worst
      )
    };
  }

  calculateGrowthTrend(monthlyData) {
    const validMonths = monthlyData.filter(month => month.total > 0);
    if (validMonths.length < 2) {
      return { trend: 'insufficient_data', rate: 0 };
    }

    const firstMonth = validMonths[0];
    const lastMonth = validMonths[validMonths.length - 1];
    
    if (firstMonth.total === 0) {
      return { trend: 'up', rate: 100 };
    }

    const growthRate = ((lastMonth.total - firstMonth.total) / firstMonth.total) * 100;
    
    return {
      trend: growthRate >= 0 ? 'up' : 'down',
      rate: Math.abs(growthRate),
      monthsAnalyzed: validMonths.length
    };
  }

  // Dynamic date range filtering
  async getIncomesByDateRange(startDate, endDate, filters = {}) {
    let query = supabase
      .from('ingresos')
      .select('*')
      .gte('fecha', startDate)
      .lte('fecha', endDate)
      .order('fecha', { ascending: false });

    // Apply additional filters
    if (filters.minAmount) {
      query = query.gte('monto', filters.minAmount);
    }
    
    if (filters.maxAmount) {
      query = query.lte('monto', filters.maxAmount);
    }
    
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }

    if (filters.hasNotes !== undefined) {
      if (filters.hasNotes) {
        query = query.not('notas', 'is', null);
      } else {
        query = query.is('notas', null);
      }
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error filtering incomes:', error);
      return [];
    }

    return data;
  }

  // Generate available date ranges for filtering
  async getAvailableDateRanges() {
    const session = await requireAuth();
    if (!session) return null;

    try {
      const { data, error } = await supabase
        .from('ingresos')
        .select('fecha')
        .order('fecha', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const dates = data.map(item => new Date(item.fecha));
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      // Generate month/year options
      const ranges = [];
      let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

      while (current <= end) {
        ranges.push({
          value: `${current.getFullYear()}-${(current.getMonth() + 1).toString().padStart(2, '0')}`,
          label: `${this.getMonthName(current.getMonth())} ${current.getFullYear()}`,
          year: current.getFullYear(),
          month: current.getMonth() + 1
        });
        current.setMonth(current.getMonth() + 1);
      }

      return {
        minDate: minDate.toISOString().split('T')[0],
        maxDate: maxDate.toISOString().split('T')[0],
        monthRanges: ranges.reverse() // Most recent first
      };
    } catch (error) {
      console.error('Error getting date ranges:', error);
      return null;
    }
  }

  getMonthName(monthIndex) {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return months[monthIndex];
  }

  // Clear cache when data changes
  clearCache() {
    this.cache.clear();
  }
}

// Export singleton instance
export const reportsManager = new ReportsManager();