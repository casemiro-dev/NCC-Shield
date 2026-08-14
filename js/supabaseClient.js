const SUPABASE_CONFIGURADO = !!(SUPABASE_URL && SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('SEU_') && !SUPABASE_ANON_KEY.includes('SUA_') && window.supabase);

const supabaseClient = SUPABASE_CONFIGURADO
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!SUPABASE_CONFIGURADO) {
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('config-error');
    if (el) {
      const msg = el.querySelector('span');
      if (msg && !window.supabase) {
        msg.textContent = 'Biblioteca do Supabase não carregou (js/vendor/supabase.min.js). Verifique os arquivos da pasta e recarregue.';
      }
      el.classList.remove('hidden');
    }
  });
}