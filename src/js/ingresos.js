import { supabase } from './supabase.js';
import { requireAuth } from './auth.js';

const logoutBtn = document.getElementById('logout-btn');
const formIngreso = document.getElementById('income-form'); // Asumiendo que usas el mismo formulario del dashboard
const totalMesSpan = document.getElementById('total-mes');
const formMsg = document.getElementById('form-msg');

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = '/login.html';
});

// Carga ingresos para mostrar resumen y total mensual
export async function cargarIngresos() {
  const session = await requireAuth();
  if (!session) return;

  try {
    // Traer todos los ingresos (sin filtrar por usuario para que todos vean lo mismo)
    const { data, error } = await supabase
      .from('ingresos')
      .select('*')
      .order('fecha', { ascending: false });

    if (error) throw error;

    renderIngresos(data);
    calcularTotalMes(data);
  } catch (error) {
    alert('Error al cargar ingresos: ' + error.message);
  }
}

function renderIngresos(ingresos) {
  const listaIngresos = document.getElementById('lista-ingresos');
  if (!listaIngresos) return;

  listaIngresos.innerHTML = '';

  ingresos.forEach(({ monto, notas, fecha }) => {
    const li = document.createElement('li');
    li.classList.add('list-group-item');
    li.innerHTML = `
      <span>${fecha} - ${notas || '-'}</span>
      <strong>S/ ${monto.toFixed(2)}</strong>
      <small style="margin-left: 1rem;">Modificaciones: ${modificaciones}</small>
    `;
    listaIngresos.appendChild(li);
  });
}

function calcularTotalMes(ingresos) {
  const now = new Date();
  const mesActual = now.getMonth();
  const anioActual = now.getFullYear();

  const total = ingresos.reduce((acc, { monto, fecha }) => {
    const date = new Date(fecha);
    if (date.getMonth() === mesActual && date.getFullYear() === anioActual) {
      return acc + monto;
    }
    return acc;
  }, 0);

  if (totalMesSpan) {
    totalMesSpan.textContent = `S/ ${total.toFixed(2)}`;
  }
}

// Función para agregar o editar ingreso (usa lógica similar a dashboard.js)
export async function guardarIngreso(fecha, monto, notas = '') {
  const session = await requireAuth();
  if (!session) return;

  try {
    // Verificar si ya existe ingreso para la fecha
    const { data: existing } = await supabase
      .from('ingresos')
      .select('*')
      .eq('fecha', fecha)
      .limit(1)
      .single();

    if (existing) {
      // Guardar historial
      await supabase.from('ingresos_historial').insert({
        ingreso_id: existing.id,
        monto_anterior: existing.monto,
        user_id: session.user.id,
      });

      // Actualizar ingreso y contador modificaciones
      await supabase
        .from('ingresos')
        .update({
          monto,
          notas,
          modificaciones: existing.modificaciones + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      // Insertar nuevo ingreso
      await supabase.from('ingresos').insert({
        user_id: session.user.id,
        fecha,
        monto,
        notas,
        modificaciones: 0,
      });
    }

    await cargarIngresos();
  } catch (error) {
    alert('Error al guardar ingreso: ' + error.message);
  }
}

// Escuchar submit del formulario si está presente
if (formIngreso) {
  formIngreso.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fecha = document.getElementById('income-date').value;
    const monto = parseFloat(document.getElementById('income-amount').value);
    const notas = document.getElementById('income-notes')?.value.trim() || '';

    if (!fecha) {
      formMsg.textContent = 'Por favor selecciona una fecha.';
      return;
    }
    if (isNaN(monto) || monto <= 0) {
      formMsg.textContent = 'Ingrese un monto válido mayor que cero.';
      return;
    }

    formMsg.textContent = '';
    await guardarIngreso(fecha, monto, notas);
    formIngreso.reset();
  });
}

// Cargar ingresos al cargar la página
window.addEventListener('DOMContentLoaded', cargarIngresos);
