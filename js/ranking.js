const state = { de: null, ate: null };
let meunome = null;

function medalhaSvg(posicao) {
  const cores = {
    1: { cor: '#D4AF37', clara: '#F7E08A' },
    2: { cor: '#94A3B8', clara: '#E2E8F0' },
    3: { cor: '#B45309', clara: '#E7A063' }
  };
  const m = cores[posicao];
  if (!m) return `<span class="tnum font-semibold text-slate-600 dark:text-slate-300">${posicao}</span>`;
  const estrela = 'M13 4 11.12 8.41 6.34 8.84 9.96 11.99 8.89 16.66 13 14.2 17.11 16.66 16.04 11.99 19.66 8.84 14.88 8.41Z';
  return `<svg width="28" height="23" viewBox="0 0 26 21" fill="none" aria-label="${posicao}º lugar">
    <path d="${estrela}" fill="${m.cor}" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>
    <circle cx="13" cy="11" r="4" fill="${m.clara}"/>
    <text x="13" y="12.9" text-anchor="middle" font-size="6.5" font-weight="800" fill="${m.cor}" font-family="Inter, sans-serif">${posicao}</text>
  </svg>`;
}

function renderUsuario(perfil) {
  const el = document.getElementById('usuario-nome');
  if (el) {
    if (!perfil) { el.textContent = ''; return; }
    el.textContent = perfil.nome;
    el.innerHTML += perfil.role === 'admin'
      ? ' <span class="text-[10px] uppercase tracking-wide bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded px-1.5 py-0.5">Admin</span>'
      : '';
  }
}

function setupPeriodo() {
  const inputDe = document.getElementById('data-de');
  const inputAte = document.getElementById('data-ate');
  const r = hojeRange();
  state.de = r.de;
  state.ate = r.ate;
  inputDe.value = paraInputDate(r.de);
  inputAte.value = paraInputDate(r.ate);

  document.getElementById('btn-hoje').addEventListener('click', () => {
    const hoje = hojeRange();
    inputDe.value = paraInputDate(hoje.de);
    inputAte.value = paraInputDate(hoje.ate);
    aplicarPeriodo();
  });

  const btnSemana = document.getElementById('btn-semana');
  if (btnSemana) {
    btnSemana.addEventListener('click', () => {
      const s = rangeDias(7);
      inputDe.value = paraInputDate(s.de);
      inputAte.value = paraInputDate(s.ate);
      aplicarPeriodo();
    });
  }

  const btnMes = document.getElementById('btn-mes');
  if (btnMes) {
    btnMes.addEventListener('click', () => {
      const m = rangeDias(30);
      inputDe.value = paraInputDate(m.de);
      inputAte.value = paraInputDate(m.ate);
      aplicarPeriodo();
    });
  }

  document.getElementById('btn-aplicar').addEventListener('click', aplicarPeriodo);
  inputDe.addEventListener('change', aplicarPeriodo);
  inputAte.addEventListener('change', aplicarPeriodo);
}

function aplicarPeriodo() {
  const deStr = document.getElementById('data-de').value;
  const ateStr = document.getElementById('data-ate').value;
  if (!deStr || !ateStr) return;
  const r = rangeDeAte(deStr, ateStr);
  state.de = r.de;
  state.ate = r.ate;
  esconderAvisoDados();
  carregarRanking();
}

// --- Aviso de dados em dias anteriores --------------------------------------
let avisoVerificando = false;

function esconderAvisoDados() {
  const el = document.getElementById('aviso-dados');
  if (el) el.classList.add('hidden');
}

async function verificarDadosAntigos() {
  if (!supabaseClient || avisoVerificando) return;
  const el = document.getElementById('aviso-dados');
  if (!el) return;
  avisoVerificando = true;
  try {
    const r = rangeDias(30);
    const res = await comTimeout(
      supabaseClient.rpc('get_ranking', {
        p_inicio: r.de.toISOString(),
        p_fim: r.ate.toISOString()
      }),
      15000,
      'a verificação de dados antigos'
    );
    if (res.error) return;
    const total30 = (res.data || []).reduce((s, l) => s + Number(l.total_atendimentos || 0), 0);
    if (total30 > 0) {
      const txt = document.getElementById('aviso-dados-texto');
      if (txt) {
        const plural = total30 === 1 ? 'atendimento' : 'atendimentos';
        txt.textContent = `Existem ${total30} ${plural} em dias anteriores. Clique em "Mês" para vê-los no ranking.`;
      }
      el.classList.remove('hidden');
    }
  } catch (e) {
    // aviso é opcional — falhas aqui são silenciosas
  } finally {
    avisoVerificando = false;
  }
}

function toggleRankingLoading(loading) {
  document.getElementById('ranking-loading').classList.toggle('hidden', !loading);
  document.getElementById('ranking-box').classList.toggle('hidden', loading);
}

async function carregarRanking() {
  if (!supabaseClient) return;
  const el = document.getElementById('erro-global');
  if (el) el.classList.add('hidden');
  toggleRankingLoading(true);

  const tbody = document.getElementById('tabela-ranking');
  const vazio = document.getElementById('ranking-vazio');
  let data = null;

  try {
    const res = await comTimeout(
      supabaseClient.rpc('get_ranking', {
        p_inicio: state.de.toISOString(),
        p_fim: state.ate.toISOString()
      }),
      20000,
      'o ranking'
    );
    if (res.error) throw res.error;
    data = res.data;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-red-600 dark:text-red-400 text-sm">${escapeHtml(mensagemAmigavel(e, 'Erro ao carregar o ranking'))}</td></tr>`;
    vazio.classList.add('hidden');
    mostrarErroGlobal(mensagemAmigavel(e, 'Ao carregar o ranking'));
    toggleRankingLoading(false);
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '';
    vazio.classList.remove('hidden');
    vazio.innerHTML = `<span class="block font-medium text-slate-700 dark:text-slate-300">Nenhum operador encontrado.</span>
      Se você já tem perfil, rode o script sql/schema.sql no SQL Editor do Supabase para criar os perfis dos operadores.`;
    try {
      const res = await comTimeout(
        supabaseClient.from('profiles').select('id', { count: 'exact', head: true }),
        10000,
        'os operadores'
      );
      if (!res.error && (res.count ?? 0) > 0) {
        vazio.innerHTML = `<span class="block font-medium text-slate-700 dark:text-slate-300">Ainda não há atendimentos no período.</span>
          Se registrou em outro dia, clique em <span class="font-semibold">Semana</span> ou <span class="font-semibold">Mês</span>.`;
      }
    } catch (e) {}
    toggleRankingLoading(false);
    esconderAvisoDados();
    return;
  }

  vazio.classList.add('hidden');
  tbody.innerHTML = data.map(l => {
    const nome = escapeHtml(l.operador);
    const voce = meunome && l.operador === meunome;
    const destaque = voce
      ? 'bg-indigo-50 dark:bg-indigo-950/40'
      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40';
    return `
      <tr class="border-b border-slate-100 dark:border-slate-800 ${destaque}">
        <td class="py-3 px-4 text-lg">${medalhaSvg(Number(l.posicao))}</td>
        <td class="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">${nome}${voce ? ' <span class="text-xs font-medium text-indigo-600 dark:text-indigo-400">(você)</span>' : ''}</td>
        <td class="tnum py-3 px-4 text-center text-slate-600 dark:text-slate-300">${Number(l.total_atendimentos) || 0}</td>
        <td class="tnum py-3 px-4 text-center font-semibold text-green-600 dark:text-green-400">${Number(l.total_retidos) || 0}</td>
        <td class="tnum py-3 px-4 text-center text-red-600 dark:text-red-400">${Number(l.total_cancelados) || 0}</td>
        <td class="tnum py-3 px-4 text-center font-semibold ${taxaCorClasse(Number(l.taxa_retencao))}">${Number(l.taxa_retencao).toFixed(1)}%</td>
      </tr>`;
  }).join('');

  toggleRankingLoading(false);

  const soHoje = state.de.toDateString() === new Date().toDateString();
  if (soHoje) {
    const somaPeriodo = data.reduce((s, l) => s + Number(l.total_atendimentos || 0), 0);
    if (somaPeriodo === 0) {
      verificarDadosAntigos();
    } else {
      esconderAvisoDados();
    }
  } else {
    esconderAvisoDados();
  }
}

async function init() {
  if (!supabaseClient) return;
  const user = await guardPage();
  if (!user) return;

  const perfil = await getProfile(user.id);
  meunome = perfil ? perfil.nome : null;
  renderUsuario(perfil);
  setupPeriodo();
  const fecharAviso = document.getElementById('aviso-dados-fechar');
  if (fecharAviso) fecharAviso.addEventListener('click', esconderAvisoDados);
  setupDiagnostico();
  setupLogout();
  setupTemaToggle();
  await carregarRanking();
}

init();