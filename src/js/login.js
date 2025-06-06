import { supabase } from './supabase.js';

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginMsg = document.getElementById('login-error');
const loginBtn = loginForm.querySelector('button[type="submit"]');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  loginMsg.textContent = '';
  loginBtn.disabled = true;

  if (!email || !password) {
    loginMsg.textContent = 'Por favor ingresa correo y contraseña.';
    loginBtn.disabled = false;
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      loginMsg.textContent = 'Error: ' + error.message;
      loginBtn.disabled = false;
      return;
    }

    if (data.session) {
      loginMsg.style.color = 'green';
      loginMsg.textContent = 'Login exitoso, redirigiendo...';
      setTimeout(() => {
        window.location.href = '/dashboard.html';
      }, 1500);
    }
  } catch (error) {
    loginMsg.textContent = 'Error inesperado: ' + error.message;
  } finally {
    loginBtn.disabled = false;
  }
});