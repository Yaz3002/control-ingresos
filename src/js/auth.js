import { supabase } from './supabase.js';

export async function requireAuth() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // Redirigir al login si no hay sesión activa
    window.location.href = '/login.html';
    return null;
  }

  return session;
}
