const form = document.getElementById('login-form');
const emailInput = document.getElementById('login-email');
const senhaInput = document.getElementById('login-senha');
const errorBox = document.getElementById('login-error');
const submitBtn = document.getElementById('login-submit');
const spinner = document.getElementById('login-spinner');
const label = document.getElementById('login-label');

function setLoading(carregando) {
  submitBtn.disabled = carregando;
  spinner.classList.toggle('hidden', !carregando);
  label.textContent = carregando ? 'Entrando...' : 'Entrar';
}

function showError(mensagem) {
  errorBox.textContent = mensagem;
  errorBox.classList.remove('hidden');
}

function clearError() {
  errorBox.classList.add('hidden');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  if (!supabaseClient) {
    showError('Configuração pendente: preencha as chaves do Supabase em js/config.js.');
    return;
  }

  const email = emailInput.value.trim();
  const senha = senhaInput.value;

  if (!email || !senha) {
    showError('Informe e-mail e senha.');
    return;
  }

  setLoading(true);

  let erro = null;
  try {
    const res = await comTimeout(
      supabaseClient.auth.signInWithPassword({ email, password: senha }),
      20000,
      'o login'
    );
    erro = res.error;
  } catch (e) {
    setLoading(false);
    showError(mensagemAmigavel(e, 'Erro ao entrar'));
    return;
  }

  setLoading(false);

  if (erro) {
    showError('E-mail ou senha incorretos. Verifique e tente novamente.');
    senhaInput.value = '';
    senhaInput.focus();
    return;
  }

  window.location.replace('dashboard.html');
});