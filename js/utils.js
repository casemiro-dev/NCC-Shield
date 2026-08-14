// ============================================================================
// UTILITÁRIOS — períodos, taxa de retenção, comissão e formatação
// ============================================================================

// --- Períodos (intervalo De / Até) ------------------------------------------
function hojeRange() {
  const agora = new Date();
  const de = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const ate = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999);
  return { de, ate };
}

function fimDoDia(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// Recebe "YYYY-MM-DD" e devolve { de: Date, ate: Date } (ate = fim do dia)
function rangeDeAte(deStr, ateStr) {
  const [a1, m1, d1] = deStr.split('-').map(Number);
  const [a2, m2, d2] = ateStr.split('-').map(Number);
  const de = new Date(a1, m1 - 1, d1);
  let ate = new Date(a2, m2 - 1, d2, 23, 59, 59, 999);
  if (ate < de) ate = new Date(de.getFullYear(), de.getMonth(), de.getDate(), 23, 59, 59, 999);
  return { de, ate };
}

// Período dos últimos N dias (incluindo hoje)
function rangeDias(n) {
  const agora = new Date();
  const de = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - (n - 1));
  const ate = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999);
  return { de, ate };
}

function paraInputDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// --- Regras de negócio ------------------------------------------------------
function calcTaxa(retidos, total) {
  return total === 0 ? 0 : (retidos / total) * 100;
}

function comissaoPorRetido(taxa) {
  if (taxa < 50) return 0;
  if (taxa < 55) return 5;
  return 8;
}

function calcComissao(retidos, taxa) {
  return retidos * comissaoPorRetido(taxa);
}

// --- Segurança (XSS) -----------------------------------------------------------
function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Paginação (o Supabase limita cada consulta a 1000 linhas) ----------------
// Busca TODAS as linhas do período em blocos de 1000 — o operador vê todos
// os atendimentos que fez, sem limite de 50 ou de 1000.
async function fetchAll(builder) {
  const todas = [];
  const pagina = 1000;
  for (let inicio = 0; ; inicio += pagina) {
    const { data, error } = await builder.range(inicio, inicio + pagina - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    todas.push(...data);
    if (data.length < pagina) break;
  }
  return { data: todas, error: null };
}

// --- Timeout: nada fica "carregando para sempre" -----------------------------
// Se o Supabase não responder em X segundos, a consulta é abortada e mostra
// erro na tela em vez de skeleton infinito.
function comTimeout(promise, ms = 20000, alvo = 'consulta') {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`tempo esgotado (${alvo} demorou mais de ${Math.round(ms / 1000)}s)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// --- Mensagens de erro em português simples -----------------------------------
function mensagemAmigavel(erro, area) {
  const m = String((erro && erro.message) || erro || '').toLowerCase();
  const status = erro && erro.status;
  if (m.includes('paused') || status === 503)
    return `O projeto do Supabase está pausado. Acesse supabase.com, abra o projeto e clique em Restore, depois recarregue a página.`;
  if (m.includes('invalid api key') || m.includes('apikey') || m.includes('jwt') || status === 401)
    return `A chave de acesso está inválida ou foi trocada. No Supabase, abra Project Settings → API e confira se a chave é a mesma do arquivo js/config.js.`;
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('abort') || m.includes('tempo esgotado') || m.includes('timed out'))
    return `Não foi possível conectar ao servidor do Supabase (${area}). Verifique a internet e o status do projeto em supabase.com.`;
  if (status === 404)
    return `Projeto do Supabase não encontrado. A URL em js/config.js pode estar errada ou o projeto foi excluído.`;
  if (m.includes('permission denied') || m.includes('row-level security') || m.includes('42501') || m.includes('does not exist'))
    return `Falta configurar o banco. No Supabase, abra SQL Editor, cole TODO o conteúdo do arquivo sql/schema.sql e clique em Run.`;
  return `${area}: ${m.charAt(0).toUpperCase()}${m.slice(1)}`;
}

// --- Banner de erro no topo da página -----------------------------------------
function mostrarErroGlobal(mensagem) {
  const el = document.getElementById('erro-global');
  if (!el) return;
  const box = el.firstElementChild;
  if (box) box.textContent = mensagem;
  el.classList.remove('hidden');
}

// --- Painel de diagnóstico ------------------------------------------------------
// Mostra (para o usuário logado) os números reais do banco, para que qualquer
// problema de dados seja identificado em segundos. Chama do init() das páginas.
async function setupDiagnostico() {
  const btn = document.getElementById('btn-diagnostico');
  if (!btn || !supabaseClient) return;
  btn.addEventListener('click', async () => {
    const painel = document.getElementById('painel-diagnostico');
    if (!painel) return;
    painel.classList.toggle('hidden');
    if (painel.classList.contains('hidden')) return;

    const saida = document.getElementById('diagnostico-saida');
    if (!saida) return;
    saida.textContent = 'Consultando o banco...';
    const linhas = [];

    const contar = async (nome, builder) => {
      try {
        const res = await comTimeout(builder, 15000, 'o diagnóstico');
        linhas.push(`${nome}: ${res.error ? 'ERRO ' + res.error.message : (res.count ?? 0)}`);
      } catch (e) {
        linhas.push(`${nome}: ERRO ${e.message}`);
      }
    };

    const base = () => supabaseClient.from('atendimentos').select('id', { count: 'exact', head: true });
    await contar('Atendimentos hoje', base().gte('created_at', hojeRange().de.toISOString()).lte('created_at', hojeRange().ate.toISOString()));
    await contar('Atendimentos 7 dias', base().gte('created_at', rangeDias(7).de.toISOString()).lte('created_at', rangeDias(7).ate.toISOString()));
    await contar('Atendimentos 30 dias', base().gte('created_at', rangeDias(30).de.toISOString()).lte('created_at', rangeDias(30).ate.toISOString()));
    await contar('Atendimentos total', base());
    await contar('Operadores cadastrados', supabaseClient.from('profiles').select('id', { count: 'exact', head: true }));

    try {
      const r = rangeDias(30);
      const res = await comTimeout(supabaseClient.rpc('get_ranking', { p_inicio: r.de.toISOString(), p_fim: r.ate.toISOString() }), 15000, 'o diagnóstico');
      linhas.push(`Ranking 30 dias: ${res.error ? 'ERRO ' + res.error.message : (res.data || []).length + ' operador(es) na lista'}`);
    } catch (e) {
      linhas.push(`Ranking 30 dias: ERRO ${e.message}`);
    }

    saida.textContent = linhas.join('\n');
  });
}

// --- Formatação ---------------------------------------------------------------
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function fmtData(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtDataHora(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function taxaCorClasse(taxa) {
  if (taxa < 50) return 'text-red-600 dark:text-red-400';
  if (taxa < 55) return 'text-amber-500 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}