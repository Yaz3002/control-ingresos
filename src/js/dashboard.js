import { supabase } from './supabase.js';
import { requireAuth } from './auth.js';

const incomeForm = document.getElementById('income-form');
const tableBody = document.querySelector('#income-table tbody');
const filterBtn = document.getElementById('filter-btn');
const filterMonth = document.getElementById('filter-month-select');
const logoutBtn = document.getElementById('logout-btn');
const chartCanvas = document.getElementById('weekly-chart');
const analysisResult = document.getElementById('analysis-result');
const formMsg = document.getElementById('form-msg');
const submitBtn = document.getElementById('submit-income');
const incomeDateInput = document.getElementById('income-date');
const incomeAmountInput = document.getElementById('income-amount');
const incomeNotesInput = document.getElementById('income-notes');
const currentPageSpan = document.getElementById('current-page');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const totalMonthSpan = document.getElementById('total-month');
const totalYearSpan = document.getElementById('total-year');

let chart;
let currentPage = 1;
const pageSize = 10;
let totalCount = 0;

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = '/login.html';
});

incomeDateInput.addEventListener('change', async () => {
  const session = await requireAuth();
  if (!session) return;

  const date = incomeDateInput.value;
  if (!date) return;

  const { data: existing } = await supabase
    .from('ingresos')
    .select('*')
    .eq('fecha', date)
    .limit(1)
    .single();

  if (existing) {
    submitBtn.textContent = 'Editar Ingreso';
    incomeAmountInput.value = existing.monto;
    incomeNotesInput.value = existing.notas || '';
    submitBtn.dataset.id = existing.id;
    if (existing.user_id !== session.user.id) {
      submitBtn.disabled = true;
      formMsg.style.color = 'red';
      formMsg.textContent = 'No puedes editar un ingreso registrado por otro usuario.';
    } else {
      submitBtn.disabled = false;
      formMsg.textContent = '';
    }
  } else {
    submitBtn.textContent = 'Agregar';
    incomeAmountInput.value = '';
    incomeNotesInput.value = '';
    submitBtn.removeAttribute('data-id');
    submitBtn.disabled = false;
    formMsg.textContent = '';
  }
});

incomeForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const date = incomeDateInput.value;
  const amount = parseFloat(incomeAmountInput.value);
  const notes = incomeNotesInput.value.trim();
  const id = submitBtn.dataset.id;

  formMsg.textContent = '';
  if (!date) {
    formMsg.textContent = 'Por favor selecciona una fecha.';
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    formMsg.textContent = 'Ingrese un monto válido mayor que cero.';
    return;
  }

  const session = await requireAuth();
  if (!session) return;

  submitBtn.disabled = true;

  try {
    if (id) {
      const { data: existing } = await supabase
        .from('ingresos')
        .select('*')
        .eq('id', id)
        .single();

      if (!existing) {
        formMsg.style.color = 'red';
        formMsg.textContent = 'Ingreso no encontrado.';
        return;
      }

      if (existing.user_id !== session.user.id) {
        formMsg.style.color = 'red';
        formMsg.textContent = 'No puedes modificar un ingreso registrado por otro usuario.';
        return;
      }

      await supabase.from('ingresos_historial').insert({
        ingreso_id: id,
        monto_anterior: existing.monto,
        user_id: session.user.id,
      });

      await supabase
        .from('ingresos')
        .update({
          monto: amount,
          notas: notes,
          modificaciones: existing.modificaciones + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    } else {
      await supabase.from('ingresos').insert({
        user_id: session.user.id,
        fecha: date,
        monto: amount,
        notas: notes,
        modificaciones: 0,
      });
    }

    formMsg.style.color = 'green';
    formMsg.textContent = id ? 'Ingreso actualizado correctamente.' : 'Ingreso guardado correctamente.';
    incomeForm.reset();
    submitBtn.removeAttribute('data-id');
    submitBtn.textContent = 'Agregar';
    await loadIngresos(currentPage);
  } catch (error) {
    formMsg.style.color = 'red';
    formMsg.textContent = 'Error: ' + error.message;
  } finally {
    submitBtn.disabled = false;
  }
});

filterBtn.addEventListener('click', () => {
  currentPage = 1;
  loadIngresos(currentPage);
});

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    loadIngresos(currentPage);
  }
});

nextPageBtn.addEventListener('click', () => {
  if (currentPage * pageSize < totalCount) {
    currentPage++;
    loadIngresos(currentPage);
  }
});

async function loadIngresos(page = 1, selectedMonthParam = '') {
  const session = await requireAuth();
  if (!session) return;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('ingresos')
    .select('*', { count: 'exact' })
    .order('fecha', { ascending: false })
    .range(from, to);

  const selectedMonthValue = selectedMonthParam || filterMonth.value;
  if (selectedMonthValue) {
    const [year, month] = selectedMonthValue.split('-');
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    query = query.gte('fecha', `${year}-${month}-01`).lte('fecha', `${year}-${month}-${lastDay}`);
  }

  const { data: ingresos, error, count } = await query;

  if (error) {
    formMsg.style.color = 'red';
    formMsg.textContent = 'Error cargando ingresos: ' + error.message;
    return;
  }

  totalCount = count || 0;

  tableBody.innerHTML = '';
  ingresos.forEach((ingreso) => {
    const canEdit = ingreso.user_id === session.user.id;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${ingreso.fecha}</td>
      <td>S/. ${ingreso.monto.toFixed(2)}</td>
      <td>${ingreso.notas || '-'}</td>
      <td>
        ${canEdit ? `<button onclick="editIngreso('${ingreso.id}', ${ingreso.monto}, '${ingreso.notas || ''}')" aria-label="Editar ingreso">✏️</button>` : ''}
        <span title="Modificaciones: ${ingreso.modificaciones}">📝${ingreso.modificaciones}</span>
        <button onclick="cargarHistorial('${ingreso.id}')" aria-label="Ver historial">📜</button>
      </td>
    `;
    tableBody.appendChild(row);
  });

  currentPageSpan.textContent = `${page} de ${Math.ceil(totalCount / pageSize)}`;
  prevPageBtn.disabled = page === 1;
  nextPageBtn.disabled = page * pageSize >= totalCount;

  drawChart(ingresos);
  showAnalysis(ingresos);
  calculateTotals(ingresos, selectedMonthValue);
}

window.editIngreso = async (id, monto, notas) => {
  incomeDateInput.value = '';
  incomeAmountInput.value = monto;
  incomeNotesInput.value = notas;
  submitBtn.textContent = 'Editar Ingreso';
  submitBtn.dataset.id = id;
  formMsg.textContent = '';
  submitBtn.disabled = false;
};

window.cargarHistorial = async (ingresoId) => {
  const { data: historial, error } = await supabase
    .from('ingresos_historial')
    .select('monto_anterior, fecha_modificacion, user_id')
    .eq('ingreso_id', ingresoId)
    .order('fecha_modificacion', { ascending: false });

  if (error) {
    alert('Error cargando historial: ' + error.message);
    return;
  }

  const historialDiv = document.createElement('div');
  historialDiv.className = 'historial-modal';
  historialDiv.innerHTML = `
    <h3>Historial de Modificaciones</h3>
    <ul>
      ${historial.length ? historial.map(h => `
        <li>
          ${new Date(h.fecha_modificacion).toLocaleString()}: S/. ${h.monto_anterior.toFixed(2)} (Usuario: ${h.user_id})
        </li>
      `).join('') : '<li>No hay modificaciones.</li>'}
    </ul>
    <button onclick="this.parentElement.remove()">Cerrar</button>
  `;
  document.body.appendChild(historialDiv);
};

function drawChart(ingresos) {
  const currentDate = new Date();
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const dailyData = Array(daysInMonth).fill(0);

  ingresos.forEach(i => {
    const day = new Date(i.fecha).getDate() - 1;
    dailyData[day] += i.monto;
  });

  if (chart) chart.destroy();
  chart = new Chart(chartCanvas, {
    type: 'bar',
    data: {
      labels: Array.from({ length: daysInMonth }, (_, i) => i + 1),
      datasets: [{
        label: 'Ingresos por día',
        data: dailyData,
        backgroundColor: '#bc6c25',
        borderColor: '#99582a',
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

function showAnalysis(ingresos) {
  const totals = Array(7).fill(0);
  ingresos.forEach(i => {
    const day = new Date(i.fecha).getDay();
    totals[day] += i.monto;
  });

  const days = [ 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado','domingo'];
  const sortedDays = totals
    .map((total, index) => ({ day: days[index], total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const resultText = sortedDays
    .map(({ day, total }, i) => `${i + 1}º: ${day} (S/. ${total.toFixed(2)})`)
    .join(', ');

  analysisResult.textContent = `📊 Los 3 días con mayores ingresos son: ${resultText}.`;
}

function calculateTotals(ingresos, selectedMonth) {
  const currentYear = new Date().getFullYear();
  let monthTotal = 0;
  let yearTotal = 0;

  ingresos.forEach(({ monto, fecha }) => {
    const date = new Date(fecha);
    if (!selectedMonth || fecha.startsWith(selectedMonth)) {
      monthTotal += monto;
    }
    if (date.getFullYear() === currentYear) {
      yearTotal += monto;
    }
  });

  if (totalMonthSpan) {
    totalMonthSpan.textContent = `Total mes: S/. ${monthTotal.toFixed(2)}`;
  }
  if (totalYearSpan) {
    totalYearSpan.textContent = `Total año ${currentYear}: S/. ${yearTotal.toFixed(2)}`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  incomeDateInput.value = new Date().toISOString().split('T')[0];
  loadIngresos(currentPage);
});

