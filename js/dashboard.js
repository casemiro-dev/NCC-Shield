const state = { de: null, ate: null, status: 'retido', filtro: 'todos' };
let canalRealtime = null;
let graficos = {};

const CLASSE_REMOVER = [
  'bg-indigo-600', 'bg-white', 'bg-green-600', 'bg-red-600',
  'dark:bg-slate-900', 'dark:bg-slate-800',
  'text-white', 'text-slate-700', 'dark:text-slate-300',
  'border-indigo-600', 'border-green-600', 'border-red-600', 'border-slate-300', 'dark:border-slate-700',
  'hover:bg-indigo-700', 'hover:bg-green-700', 'hover:bg-red-700', 'hover:bg-slate-50',
  'hover:bg-green-50', 'hover:bg-red-50', 'dark:hover:bg-slate-800', 'dark:bg-slate-800',
  'dark:hover:bg-slate-700'
];

function aplicarEstilo(el, estilo) {
  el.classList.remove(...CLASSE_REMOVER);
  el.classList.add(...estilo);
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

const CLASSE_FILTRO_ATIVO = ['bg-indigo-600', 'text-white', 'border-indigo-600'];
const CLASSE_FILTRO_INATIVO = ['bg-white', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300', 'border-slate-300', 'dark:border-slate-700', 'hover:bg-slate-50', 'dark:hover:bg-slate-700'];

function setupFiltros() {
  document.querySelectorAll('.filtro-btn').forEach((btn) => {
    btn.addEventListener('click', () => aplicarFiltro(btn.dataset.filtro));
  });
  aplicarFiltro('todos', false);
}

function aplicarFiltro(filtro, recarregar = true) {
  state.filtro = filtro;
  document.querySelectorAll('.filtro-btn').forEach((btn) => {
    aplicarEstilo(btn, btn.dataset.filtro === filtro ? CLASSE_FILTRO_ATIVO : CLASSE_FILTRO_INATIVO);
  });
  if (recarregar) carregarTabela();
}

function renderFiltros(contagens) {
  ['todos', 'retido', 'cancelado'].forEach((f) => {
    const el = document.querySelector(`[data-count="${f}"]`);
    if (el) el.textContent = contagens[f] || 0;
  });
}

function setupStatus() {
  document.querySelectorAll('.status-btn').forEach((btn) => {
    btn.addEventListener('click', () => setStatus(btn.dataset.status));
  });
}

function setStatus(status) {
  state.status = status;
  document.querySelectorAll('.status-btn').forEach((btn) => {
    if (btn.dataset.status === 'retido') {
      aplicarEstilo(btn, state.status === 'retido'
        ? ['bg-green-600', 'text-white', 'border-green-600']
        : ['bg-white', 'dark:bg-slate-900', 'text-slate-700', 'dark:text-slate-300', 'border-slate-300', 'dark:border-slate-700', 'hover:bg-green-50', 'dark:hover:bg-slate-800']);
    } else {
      aplicarEstilo(btn, state.status === 'cancelado'
        ? ['bg-red-600', 'text-white', 'border-red-600']
        : ['bg-white', 'dark:bg-slate-900', 'text-slate-700', 'dark:text-slate-300', 'border-slate-300', 'dark:border-slate-700', 'hover:bg-red-50', 'dark:hover:bg-slate-800']);
    }
  });
}

function formatarResumoPeriodo() {
  const el = document.getElementById('periodo-resumo');
  if (el && state.de && state.ate) {
    el.textContent = `Período: ${fmtData(state.de)} até ${fmtData(state.ate)}`;
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
  formatarResumoPeriodo();

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
  formatarResumoPeriodo();
  esconderAvisoDados();
  carregarTudo();
}

function setupForm() {
  document.getElementById('atendimento-form').addEventListener('submit', salvarAtendimento);
}

function setBtnSalvar(estado) {
  const btn = document.getElementById('btn-salvar');
  const spinner = document.getElementById('btn-salvar-spinner');
  const label = document.getElementById('btn-salvar-label');
  btn.classList.remove('bg-red-600', 'bg-green-600');
  btn.classList.add('bg-indigo-600');
  btn.disabled = estado === 'saving';
  spinner.classList.toggle('hidden', estado !== 'saving');
  if (estado === 'saving') {
    label.textContent = 'Salvando...';
  } else if (estado === 'saved') {
    btn.classList.remove('bg-indigo-600');
    btn.classList.add('bg-green-600');
    label.textContent = 'Salvo!';
  } else if (estado === 'error') {
    btn.classList.remove('bg-indigo-600');
    btn.classList.add('bg-red-600');
    label.textContent = 'Erro ao salvar';
  } else {
    label.textContent = 'Salvar Atendimento';
  }
}

async function salvarAtendimento(e) {
  e.preventDefault();
  if (!supabaseClient || document.getElementById('btn-salvar').disabled) return;
  const user = await getCurrentUser();
  if (!user) return;

  const nome = document.getElementById('campo-nome').value.trim();
  const protocolo = document.getElementById('campo-protocolo').value.trim();
  if (!nome || !protocolo) return;

  setBtnSalvar('saving');

  try {
    const { error } = await comTimeout(
      supabaseClient.from('atendimentos').insert({
        user_id: user.id,
        nome_cliente: nome,
        protocolo,
        status: state.status
      }),
      20000,
      'o salvamento'
    );

    if (error) {
      setBtnSalvar('error');
      mostrarErroGlobal(mensagemAmigavel(error, 'Ao salvar o atendimento'));
      setTimeout(() => setBtnSalvar('idle'), 2500);
      return;
    }
  } catch (e) {
    setBtnSalvar('error');
    mostrarErroGlobal(mensagemAmigavel(e, 'Ao salvar o atendimento'));
    setTimeout(() => setBtnSalvar('idle'), 2500);
    return;
  }

  document.getElementById('atendimento-form').reset();
  setStatus('retido');
  setBtnSalvar('saved');
  setTimeout(() => setBtnSalvar('idle'), 2000);

  carregarTudo();
}

function toggleCardsLoading(loading) {
  document.getElementById('cards-loading').classList.toggle('hidden', !loading);
  document.getElementById('cards-grid').classList.toggle('hidden', loading);
}

async function carregarTudo() {
  const el = document.getElementById('erro-global');
  if (el) el.classList.add('hidden');
  await Promise.all([
    carregarCards().catch(() => {}),
    carregarTabela().catch(() => {}),
    carregarGraficos().catch(() => {})
  ]);
}

// --- Aviso de dados em dias anteriores --------------------------------------
// Se hoje está vazio mas os últimos 30 dias têm atendimentos, avisa o
// operador que os dados estão fora do período (o padrão é "Hoje").
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
      supabaseClient
        .from('atendimentos')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', r.de.toISOString())
        .lte('created_at', r.ate.toISOString()),
      15000,
      'a verificação de dados antigos'
    );
    if (res.error) return;
    const total30 = res.count ?? 0;
    if (total30 > 0) {
      const txt = document.getElementById('aviso-dados-texto');
      if (txt) {
        const plural = total30 === 1 ? 'atendimento' : 'atendimentos';
        txt.textContent = `Você tem ${total30} ${plural} de dias anteriores. Clique em "Mês" para vê-los nos gráficos e no ranking.`;
      }
      el.classList.remove('hidden');
    }
  } catch (e) {
    // aviso é opcional — falhas aqui são silenciosas
  } finally {
    avisoVerificando = false;
  }
}

async function carregarCards() {
  if (!supabaseClient) return;
  const user = await getCurrentUser();
  if (!user) return;
  toggleCardsLoading(true);
  try {
    const de = state.de.toISOString();
    const ate = state.ate.toISOString();

    const [totalRes, retidosRes] = await comTimeout(Promise.all([
      supabaseClient
        .from('atendimentos')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', de)
        .lte('created_at', ate),
      supabaseClient
        .from('atendimentos')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', de)
        .lte('created_at', ate)
        .eq('status', 'retido')
    ]), 20000, 'as métricas');

    if (totalRes.error || retidosRes.error) {
      mostrarErroGlobal(mensagemAmigavel(totalRes.error || retidosRes.error, 'Ao carregar as métricas'));
      renderCards({ total: 0, retidos: 0, cancelados: 0, taxa: 0, comissao: 0 });
      return;
    }

    const total = totalRes.count ?? 0;
    const retidos = retidosRes.count ?? 0;
    const cancelados = total - retidos;
    const taxa = calcTaxa(retidos, total);
    const comissao = calcComissao(retidos, taxa);

    renderCards({ total, retidos, cancelados, taxa, comissao });

    const soHoje = state.de.toDateString() === new Date().toDateString();
    if (total === 0 && soHoje) {
      verificarDadosAntigos();
    } else {
      esconderAvisoDados();
    }
  } catch (e) {
    mostrarErroGlobal(mensagemAmigavel(e, 'Ao carregar as métricas'));
    renderCards({ total: 0, retidos: 0, cancelados: 0, taxa: 0, comissao: 0 });
  } finally {
    toggleCardsLoading(false);
  }
}

function renderCards(m) {
  const grid = document.getElementById('cards-grid');
  const cardBase = 'bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 transition-colors hover:border-indigo-300 dark:hover:border-indigo-700';
  grid.innerHTML = `
    <div class="${cardBase}">
      <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total de Atendimentos</p>
      <p class="tnum text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">${m.total}</p>
    </div>
    <div class="${cardBase}">
      <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Clientes Retidos</p>
      <p class="tnum text-3xl font-bold text-green-600 dark:text-green-400 mt-2">${m.retidos}</p>
    </div>
    <div class="${cardBase}">
      <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Clientes Cancelados</p>
      <p class="tnum text-3xl font-bold text-red-600 dark:text-red-400 mt-2">${m.cancelados}</p>
    </div>
    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border-2 ${m.taxa < 50 ? 'border-red-200 dark:border-red-900/60' : m.taxa < 55 ? 'border-amber-300 dark:border-amber-900/60' : 'border-green-300 dark:border-green-900/60'} p-5 transition-colors hover:border-indigo-300 dark:hover:border-indigo-700">
      <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Taxa de Retenção</p>
      <p class="tnum text-3xl font-bold ${taxaCorClasse(m.taxa)} mt-2">${m.taxa.toFixed(1)}%</p>
      <p class="text-xs font-medium mt-1 ${m.taxa < 50 ? 'text-red-600 dark:text-red-400' : m.taxa < 55 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}">
        ${m.taxa < 50 ? 'Meta não atingida' : m.taxa < 55 ? 'Faixa R$ 5,00 / retido' : 'Faixa R$ 8,00 / retido'}
      </p>
    </div>
    <div class="${cardBase}">
      <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Comissão Acumulada</p>
      <p class="tnum text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-2">${brl(m.comissao)}</p>
    </div>`;
}

async function carregarTabela() {
  if (!supabaseClient) return;
  const user = await getCurrentUser();
  if (!user) return;

  const tbody = document.getElementById('tabela-atendimentos');
  let data = null;

  try {
    const res = await comTimeout(fetchAll(
      supabaseClient
        .from('atendimentos')
        .select('id, nome_cliente, protocolo, status, created_at')
        .gte('created_at', state.de.toISOString())
        .lte('created_at', state.ate.toISOString())
        .order('created_at', { ascending: false })
    ), 30000, 'a tabela de atendimentos');
    if (res.error) throw res.error;
    data = res.data;
  } catch (e) {
    mostrarErroGlobal(mensagemAmigavel(e, 'Ao carregar a tabela'));
    renderFiltros({ todos: 0, retido: 0, cancelado: 0 });
    tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-red-600 dark:text-red-400 text-sm">${escapeHtml(mensagemAmigavel(e, 'Erro ao carregar a tabela'))}</td></tr>`;
    return;
  }

  const total = data ? data.length : 0;
  const retidos = data ? data.filter(a => a.status === 'retido').length : 0;
  renderFiltros({ todos: total, retido: retidos, cancelado: total - retidos });

  const filtradas = state.filtro === 'todos' ? (data || []) : (data || []).filter(a => a.status === state.filtro);

  if (total === 0 || filtradas.length === 0) {
    const filtroVazio = total > 0 && filtradas.length === 0;
    tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-500 dark:text-slate-400">
      <p class="font-medium text-slate-700 dark:text-slate-300 text-sm">${filtroVazio ? 'Nenhum atendimento com este status no período.' : 'Nenhum atendimento registrado neste período.'}</p>
      <p class="text-xs mt-1">${filtroVazio ? 'Mude o filtro acima ou o período selecionado.' : 'Use o formulário acima para registrar o primeiro atendimento.'}</p>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas.map(a => `
    <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td class="tnum py-2.5 pr-4 whitespace-nowrap text-slate-600 dark:text-slate-300">${fmtDataHora(a.created_at)}</td>
      <td class="py-2.5 pr-4 font-medium text-slate-900 dark:text-slate-100">${escapeHtml(a.nome_cliente)}</td>
      <td class="tnum py-2.5 pr-4 text-slate-600 dark:text-slate-300">${escapeHtml(a.protocolo)}</td>
      <td class="py-2.5">
        <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${a.status === 'retido' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'}">
          <span class="w-1.5 h-1.5 rounded-full ${a.status === 'retido' ? 'bg-green-500' : 'bg-red-500'}"></span>
          ${a.status === 'retido' ? 'Retido' : 'Cancelado'}
        </span>
      </td>
    </tr>`).join('');
}

// --- Gráficos (Chart.js) -----------------------------------------------------

function fmtDataCurta(d) {
  const p = (n) => String(n).padStart(2, '0');
  const diff = (state.ate - state.de) / 86400000;
  return diff >= 365 ? `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}` : `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

function agregarSeries(rows) {
  const MS_DIA = 86400000;
  const deIni = new Date(state.de.getFullYear(), state.de.getMonth(), state.de.getDate());
  const diasTotais = Math.max(1, Math.round((state.ate - deIni) / MS_DIA) + 1);
  const passo = Math.ceil(diasTotais / 92);
  const contagem = {};

  rows.forEach(r => {
    const d = new Date(r.created_at);
    const idx = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - deIni) / MS_DIA);
    if (idx < 0 || idx >= diasTotais) return;
    const bucket = Math.floor(idx / passo) * passo;
    contagem[bucket] = contagem[bucket] || { retidos: 0, cancelados: 0 };
    contagem[bucket][r.status] += 1;
  });

  const labels = [], retidos = [], cancelados = [], taxas = [];
  for (let b = 0; b < diasTotais; b += passo) {
    const c = contagem[b] || { retidos: 0, cancelados: 0 };
    const totalDia = c.retidos + c.cancelados;
    labels.push(fmtDataCurta(new Date(deIni.getTime() + b * MS_DIA)));
    retidos.push(c.retidos);
    cancelados.push(c.cancelados);
    taxas.push(Number(((c.retidos / totalDia) * 100).toFixed(1)) || 0);
  }
  return { labels, retidos, cancelados, taxas };
}

function destruirGraficos() {
  Object.values(graficos).forEach(g => { try { g.destroy(); } catch (e) {} });
  graficos = {};
}

async function carregarGraficos() {
  if (!supabaseClient) return;
  const vazio = document.getElementById('graficos-vazio');
  const area = document.getElementById('graficos-area');

  if (!window.Chart) {
    destruirGraficos();
    area.classList.add('hidden');
    vazio.classList.remove('hidden');
    vazio.textContent = 'Não foi possível carregar os gráficos (biblioteca Chart.js não carregou). Verifique a conexão e recarregue a página.';
    return;
  }

  Chart.defaults.font.family = "'Inter', ui-sans-serif, system-ui, sans-serif";
  Chart.defaults.font.size = 13;
  Chart.defaults.animation = false;

  const user = await getCurrentUser();
  if (!user) return;

  let data = null;
  let error = null;
  try {
    const res = await comTimeout(fetchAll(
      supabaseClient
        .from('atendimentos')
        .select('created_at, status')
        .gte('created_at', state.de.toISOString())
        .lte('created_at', state.ate.toISOString())
    ), 30000, 'os gráficos');
    if (res.error) throw res.error;
    data = res.data;
  } catch (e) {
    error = e;
  }

  if (error || !data || data.length === 0) {
    destruirGraficos();
    area.classList.add('hidden');
    vazio.classList.remove('hidden');
    vazio.textContent = error
      ? mensagemAmigavel(error, 'Erro ao carregar os gráficos')
      : 'Sem atendimentos registrados no período selecionado.';
    if (error) mostrarErroGlobal(mensagemAmigavel(error, 'Ao carregar os gráficos'));
    return;
  }

  area.classList.remove('hidden');
  vazio.classList.add('hidden');

  try {
    const { labels, retidos, cancelados, taxas } = agregarSeries(data);
    renderizarGraficos(labels, retidos, cancelados, taxas);
  } catch (err) {
    destruirGraficos();
    area.classList.add('hidden');
    vazio.classList.remove('hidden');
    vazio.textContent = 'Erro ao renderizar os gráficos: ' + escapeHtml(err.message);
  }
}

// Desenha os três gráficos com os dados já agregados. Sem animação (desenho
// síncrono) para funcionar em qualquer estado do navegador/aba.
function renderizarGraficos(labels, retidos, cancelados, taxas) {
  if (!window.Chart) return;
  const dark = document.documentElement.classList.contains('dark');
  const cor = {
    indigo: dark ? '#818cf8' : '#6366f1',
    verde: dark ? '#4ade80' : '#16a34a',
    vermelho: dark ? '#f87171' : '#dc2626',
    texto: dark ? '#94a3b8' : '#64748b',
    grade: dark ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.12)'
  };

  destruirGraficos();

  graficos.barras = new Chart(document.getElementById('chart-barras'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Retidos', data: retidos, backgroundColor: cor.indigo, borderRadius: 4 },
        { label: 'Cancelados', data: cancelados, backgroundColor: cor.vermelho, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { labels: { color: cor.texto } } },
      scales: {
        x: { stacked: true, ticks: { color: cor.texto, maxRotation: 45 }, grid: { color: cor.grade } },
        y: { stacked: true, beginAtZero: true, ticks: { color: cor.texto, precision: 0 }, grid: { color: cor.grade } }
      }
    }
  });

  graficos.taxa = new Chart(document.getElementById('chart-taxa'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Taxa de retenção (%)',
        data: taxas,
        borderColor: cor.verde,
        backgroundColor: dark ? 'rgba(74,222,128,0.15)' : 'rgba(22,163,74,0.12)',
        fill: true,
        tension: 0.35,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { labels: { color: cor.texto } } },
      scales: {
        x: { ticks: { color: cor.texto, maxRotation: 45 }, grid: { color: cor.grade } },
        y: { min: 0, max: 100, ticks: { color: cor.texto, callback: (v) => `${v}%` }, grid: { color: cor.grade } }
      }
    }
  });

  const totalRet = retidos.reduce((a, b) => a + b, 0);
  const totalCan = cancelados.reduce((a, b) => a + b, 0);

  graficos.donut = new Chart(document.getElementById('chart-donut'), {
    type: 'doughnut',
    data: {
      labels: ['Retidos', 'Cancelados'],
      datasets: [{
        data: [totalRet, totalCan],
        backgroundColor: [cor.indigo, cor.vermelho],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      cutout: '62%',
      plugins: { legend: { position: 'bottom', labels: { color: cor.texto, usePointStyle: true } } }
    }
  });

  verificarGraficosVisiveis();
}

// Garante que os gráficos tenham tamanho visível mesmo se o CSS de altura falhar
// (ex.: Tailwind não aplicado) — recria com largura/altura explícitas.
function verificarGraficosVisiveis() {
  const planos = [
    { id: 'chart-barras', altura: 256 },
    { id: 'chart-taxa', altura: 224 },
    { id: 'chart-donut', altura: 256 }
  ];
  setTimeout(() => {
    planos.forEach(({ id, altura }) => {
      const canvas = document.getElementById(id);
      const ch = canvas && Chart.getChart(canvas);
      if (!ch) return;
      if (ch.chartArea && ch.chartArea.height < 10) {
        const largura = canvas.parentElement ? canvas.parentElement.clientWidth || 640 : 640;
        try { ch.resize(largura, altura); } catch (e) {}
      }
    });
    atualizarStatusApp();
  }, 800);
}

function setupRealtime(userId) {
  canalRealtime = supabaseClient.channel('atendimentos-own')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'atendimentos', filter: `user_id=eq.${userId}`
    }, () => { carregarCards(); carregarTabela(); carregarGraficos(); })
    .subscribe();
}

async function init() {
  if (!supabaseClient) return;
  const user = await guardPage();
  if (!user) return;

  const perfil = await getProfile(user.id);
  renderUsuario(perfil);
  setupStatus();
  setupFiltros();
  setupPeriodo();
  const fecharAviso = document.getElementById('aviso-dados-fechar');
  if (fecharAviso) fecharAviso.addEventListener('click', esconderAvisoDados);
  setupDiagnostico();
  setupAutoTeste();
  setupForm();
  setupLogout();
  setupTemaToggle();
  window.addEventListener('ncc-theme', () => carregarGraficos());
  await carregarTudo();
  atualizarStatusApp();
  setTimeout(atualizarStatusApp, 1200);
  setupRealtime(user.id);
}

// --- Auto-teste visual dos gráficos ---------------------------------------------
// Renderiza um conjunto de dados de exemplo nos 3 gráficos e conta os pixels
// desenhados em cada canvas, para saber se o navegador consegue desenhar.
function setupAutoTeste() {
  const btn = document.getElementById('btn-auto-teste');
  if (!btn || !supabaseClient) return;
  btn.addEventListener('click', () => {
    const painel = document.getElementById('painel-auto-teste');
    if (!painel) return;
    painel.classList.toggle('hidden');
    if (painel.classList.contains('hidden')) return;

    const saida = document.getElementById('auto-teste-saida');
    if (!saida) return;
    saida.textContent = 'Renderizando gráficos de teste...';

    try {
      const agora = new Date();
      const rows = [];
      for (let d = 6; d >= 0; d--) {
        const qtd = 3 + ((d * 2) % 5);
        for (let i = 0; i < qtd; i++) {
          const t = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - d, 10 + i, 0, 0);
          rows.push({ created_at: t.toISOString(), status: i % 4 === 3 ? 'cancelado' : 'retido' });
        }
      }
      const { labels, retidos, cancelados, taxas } = agregarSeries(rows);
      renderizarGraficos(labels, retidos, cancelados, taxas);

      setTimeout(() => {
        const nomes = { 'chart-barras': 'Barras', 'chart-taxa': 'Linha (taxa)', 'chart-donut': 'Distribuição' };
        const linhas = [];
        Object.keys(nomes).forEach(id => {
          const px = contarPixelsCanvas(id);
          linhas.push(`${nomes[id]}: ${px} pixels ${px > 100 ? '(OK - desenhado)' : '(VAZIO - navegador não desenhou)'}`);
        });
        saida.textContent = linhas.join('\n');
        atualizarStatusApp();
      }, 700);
    } catch (e) {
      saida.textContent = 'Erro no auto-teste: ' + (e && e.message ? e.message : e);
    }
  });
}

// --- Linha de status automática -------------------------------------------------
// Coleta erros do navegador e mede o desenho real dos gráficos, mostrando o
// resultado numa linha fixa no topo da página — sem precisar de nenhum clique.
window.__erros = window.__erros || [];
window.addEventListener('error', (e) => window.__erros.push((e.message || e.type) + (e.filename ? ' (' + e.filename.split('/').pop() + ')' : '')));
window.addEventListener('unhandledrejection', (e) => window.__erros.push('rejeição: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))));

function contarPixelsCanvas(id) {
  const c = document.getElementById(id);
  if (!c) return -1;
  try {
    const ctx = c.getContext('2d');
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    let px = 0;
    for (let i = 3; i < img.length; i += 4) if (img[i] > 40) px++;
    return px;
  } catch (e) {
    return -1;
  }
}

function atualizarStatusApp() {
  const el = document.getElementById('status-app');
  if (!el) return;
  const versao = (document.getElementById('versao-app') || {}).textContent || '?';
  const partes = [versao.trim()];
  if (window.Chart) {
    const pxB = contarPixelsCanvas('chart-barras');
    const pxT = contarPixelsCanvas('chart-taxa');
    const pxD = contarPixelsCanvas('chart-donut');
    if (pxB > 100 || pxT > 100 || pxD > 100) {
      partes.push(`Chart.js: OK · Desenho: OK (barras ${pxB}px, linha ${pxT}px, distribuição ${pxD}px)`);
    } else {
      partes.push(`Chart.js: OK · Desenho: VAZIO (barras ${pxB}px, linha ${pxT}px, distribuição ${pxD}px)`);
    }
  } else {
    partes.push('Chart.js: AUSENTE — a biblioteca de gráficos não carregou neste navegador');
  }
  partes.push(window.__erros.length ? 'Erros: ' + window.__erros.slice(0, 3).join(' | ') : 'Erros: nenhum');
  el.textContent = partes.join(' · ');
}

init();