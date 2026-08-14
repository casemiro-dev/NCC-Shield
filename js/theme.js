// ============================================================================
// TEMA (CLARO/ESCURO) — padrão: sempre claro; usuário pode alternar.
// Escolha persistida em localStorage ('ncc-theme') e aplicada como classe
// 'dark' na raiz <html> (estrategia darkMode:'class' do Tailwind).
// O evento 'ncc-theme' é disparado para que os gráficos se repintem.
// ============================================================================

function aplicarTema(dark) {
  document.documentElement.classList.toggle('dark', dark);
  try { localStorage.setItem('ncc-theme', dark ? 'dark' : 'light'); } catch (e) {}
  window.dispatchEvent(new CustomEvent('ncc-theme', { detail: { dark } }));
}

function setupTemaToggle() {
  const btn = document.getElementById('btn-tema');
  if (!btn) return;

  const atualizarIcones = () => {
    const dark = document.documentElement.classList.contains('dark');
    document.querySelectorAll('[data-tema-sol]').forEach((el) => el.classList.toggle('hidden', dark));
    document.querySelectorAll('[data-tema-lua]').forEach((el) => el.classList.toggle('hidden', !dark));
    btn.setAttribute('aria-pressed', String(dark));
    btn.title = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
  };

  btn.addEventListener('click', () => aplicarTema(!document.documentElement.classList.contains('dark')));
  atualizarIcones();
  window.addEventListener('ncc-theme', atualizarIcones);
}