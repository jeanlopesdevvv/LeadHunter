/**
 * app.js — Lógica completa do frontend LeadHunter v2
 *
 * Changelog v2:
 * Bug 1:  Removido toast duplicado no export CSV
 * Bug 3:  Flag App.ordenacaoAtiva + buffer de leads durante ordenação
 * Bug 6:  Função escapeHtml() aplicada em todos os campos do innerHTML
 * Perf 4: Paginação virtual (App.paginaAtual, leadsPorPagina = 50)
 * Perf 5: Debounce 200ms no filtro da tabela
 * UX 1:   title no <td> (não no span interno), endereço via CSS ellipsis
 * UX 2:   Modal ampliado (Copiar tudo, Abrir no Maps, notas, Marcar contatado)
 * UX 3:   Exportar habilitado quando App.leads.length > 0
 * UX 4:   Texto botão exportar muda com seleção ativa
 * UX 5:   Botão Parar entra em "Parando..." com spinner e se desabilita
 * UX 6:   Preview dos 3 primeiros leads no histórico
 * UX 8:   Título nav-item resultados dinâmico
 * UX 9:   Cores distintas para campos vazios vs não coletados
 * UX 10:  Lógica de múltiplas cidades e progresso "Cidade X/N"
 * UX 11:  Botão "Nova busca" pré-preenche campos da última busca
 * Feature 1: Select de status por linha + PATCH ao mudar
 * Feature 2: Textarea de notas no modal, salvo via PATCH
 * Feature 4: Contador de duplicatas ignoradas no SSE
 * Feature 5: Renderização de cards de estatísticas
 * Feature 6: Toggle "Modo Rápido" enviado no POST /api/search
 * Feature 7: Função atualizarLead() via PATCH /api/leads/{id}
 */

// ─────────────────────────────────────────────
// ESTADO GLOBAL DA APLICAÇÃO
// ─────────────────────────────────────────────

const App = {
  searchId:       null,           // ID da busca ativa
  tipo:           '',             // Tipo de negócio da busca ativa
  cidade:         '',             // Cidades da busca ativa (string)
  leads:          [],             // Todos os leads carregados
  leadsVisiveis:  [],             // Leads após filtro/ordenação
  selecionados:   new Set(),      // IDs dos leads selecionados
  sseConexao:     null,           // Objeto EventSource ativo
  ordenacao:      { col: 'nome', dir: 'asc' },
  maxResults:     50,
  // Paginação (Perf 4)
  paginaAtual:    1,
  leadsPorPagina: 50,
  // Ordenação durante busca ativa (Bug 3)
  ordenacaoAtiva: false,
  bufferLeads:    [],             // Buffer de leads durante ordenação
  // Duplicatas (Feature 4)
  totalDuplicados: 0,
};

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────

/** Requisição HTTP simplificada com tratamento de erro */
async function api(method, endpoint, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`/api${endpoint}`, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || 'Erro desconhecido na API');
  }
  return data;
}

/** Bug 6: Escapa caracteres perigosos para evitar XSS no innerHTML */
function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Toast notifications */
function toast(mensagem, tipo = 'info', duracao = 4000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const container = document.getElementById('toast-container');

  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = `<span>${icons[tipo] || 'ℹ️'}</span><span>${mensagem}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'slide-out 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, duracao);
}

/** Copia texto para área de transferência */
function copiar(texto) {
  navigator.clipboard.writeText(texto).then(() => {
    toast('Copiado!', 'success', 1500);
  });
}

/** Formata estrelas de avaliação */
function renderEstrelas(nota, total) {
  if (!nota) return '';
  const n = parseFloat(nota);
  const cheias = Math.floor(n);
  const meia = n - cheias >= 0.5 ? 1 : 0;
  const vazias = 5 - cheias - meia;
  const str = '★'.repeat(cheias) + (meia ? '½' : '') + '☆'.repeat(vazias);
  return `<div class="stars">${str} <span>${nota}${total ? ' · ' + total : ''}</span></div>`;
}

/** Renderiza ícones de redes sociais */
function renderSociais(lead) {
  const redes = [
    { key: 'instagram', label: 'IG', cls: 'instagram', icon: '📸' },
    { key: 'facebook',  label: 'FB', cls: 'facebook',  icon: '👤' },
    { key: 'linkedin',  label: 'LI', cls: 'linkedin',  icon: '💼' },
    { key: 'whatsapp',  label: 'WA', cls: 'whatsapp',  icon: '💬' },
  ];

  const links = redes
    .filter(r => lead[r.key])
    .map(r => `<a href="${escapeHtml(lead[r.key])}" target="_blank" class="social-icon ${r.cls}" title="${r.label}">${r.icon}</a>`)
    .join('');

  return `<div class="social-icons">${links || '<span class="campo-nao-coletado">—</span>'}</div>`;
}

/**
 * UX 9: Renderiza um campo que pode estar vazio ou não coletado.
 * @param {string} valor - Valor do campo
 * @param {boolean} foiVisitado - true se o site foi visitado mas o campo não foi encontrado
 */
function renderCampoVazio(valor, foiVisitado = false) {
  if (valor) return escapeHtml(valor);
  if (foiVisitado) return '<span class="campo-nao-encontrado" title="Site visitado mas não encontrado">🚫</span>';
  return '<span class="campo-nao-coletado">—</span>';
}

/** Atualiza um lead via PATCH (Feature 7) */
async function atualizarLead(leadId, campos) {
  try {
    await api('PATCH', `/leads/${leadId}`, campos);
  } catch (err) {
    console.error('Erro ao atualizar lead:', err);
    toast(`Erro ao salvar: ${err.message}`, 'error');
  }
}

// ─────────────────────────────────────────────
// NAVEGAÇÃO ENTRE PÁGINAS
// ─────────────────────────────────────────────

function navegarPara(pagina) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${pagina}`);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`[data-page="${pagina}"]`);
  if (navEl) navEl.classList.add('active');

  if (pagina === 'historico') carregarHistorico();
  if (pagina === 'configuracoes') carregarConfiguracoes();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => navegarPara(item.dataset.page));
});

// ─────────────────────────────────────────────
// TEMA CLARO / ESCURO
// ─────────────────────────────────────────────

const btnTema = document.getElementById('btn-tema');
btnTema.addEventListener('click', () => {
  const html = document.documentElement;
  const atual = html.dataset.theme;
  const novo = atual === 'escuro' ? 'claro' : 'escuro';
  html.dataset.theme = novo;
  btnTema.textContent = novo === 'escuro' ? '🌙' : '☀️';
  api('PATCH', '/config', { tema: novo }).catch(() => {});
});

// ─────────────────────────────────────────────
// SLIDER DE MÁXIMO DE RESULTADOS
// ─────────────────────────────────────────────

const slider = document.getElementById('slider-max');
const sliderLabel = document.getElementById('slider-label');

slider.addEventListener('input', () => {
  sliderLabel.textContent = slider.value;
  App.maxResults = parseInt(slider.value);
});

// ─────────────────────────────────────────────
// FEATURE 6 — MODO RÁPIDO
// ─────────────────────────────────────────────

const toggleModoRapido = document.getElementById('toggle-modo-rapido');
const badgeRapido = document.getElementById('badge-rapido');

toggleModoRapido.addEventListener('change', () => {
  badgeRapido.style.display = toggleModoRapido.checked ? 'inline-block' : 'none';
  // Persiste na config do servidor
  api('PATCH', '/config', { modo_rapido: toggleModoRapido.checked }).catch(() => {});
});

// ─────────────────────────────────────────────
// INICIAR BUSCA
// ─────────────────────────────────────────────

document.getElementById('btn-buscar').addEventListener('click', iniciarBusca);

async function iniciarBusca() {
  const tipo   = document.getElementById('input-tipo').value.trim();
  const cidade = document.getElementById('input-cidade').value.trim();
  const max    = parseInt(slider.value);
  const modoRapido = toggleModoRapido.checked;

  if (!tipo)   { toast('Digite o tipo de negócio', 'error'); return; }
  if (!cidade) { toast('Digite a cidade', 'error'); return; }

  // Conta quantas combinacoes serão feitas
  const tipos   = tipo.split('\n').map(t => t.trim()).filter(Boolean);
  const cidades = cidade.split('\n').map(c => c.trim()).filter(Boolean);
  const totalComb = tipos.length * cidades.length;

  // Reset estado
  App.leads = [];
  App.bufferLeads = [];
  App.ordenacaoAtiva = false;
  App.selecionados.clear();
  App.tipo = tipo;
  App.cidade = cidade;
  App.totalDuplicados = 0;
  App.paginaAtual = 1;

  // UX 8: Atualiza título da sidebar
  atualizarNavResultados('buscando...');

  // UI: estado de carregamento
  const btnBuscar = document.getElementById('btn-buscar');
  const btnParar  = document.getElementById('btn-parar');
  btnBuscar.innerHTML = '<span class="spinner"></span> Iniciando...';
  btnBuscar.disabled = true;
  btnParar.style.display = 'flex';
  btnParar.disabled = false;
  btnParar.innerHTML = '⏹ Parar Busca';

  // Mostrar seção de progresso
  const progressSection = document.getElementById('progress-section');
  progressSection.classList.add('visible');
  atualizarContador(0);
  atualizarProgresso(0, max);
  document.getElementById('progress-log').textContent = 'Conectando ao Google Maps...';
  document.getElementById('duplicados-info').style.display = 'none';

  // Navega para a busca
  navegarPara('busca');

  try {
    const resultado = await api('POST', '/search', { tipo, cidade, max_results: max, modo_rapido: modoRapido });
    App.searchId = resultado.search_id;

    if (totalComb > 1) {
      toast(`🔍 ${totalComb} combinações (${tipos.length} tipo(s) × ${cidades.length} cidade(s)) — até ${max} leads no total`, 'info');
    }

    renderizarTabela([]);
    conectarSSE(App.searchId, max);

  } catch (err) {
    toast(`Erro ao iniciar busca: ${err.message}`, 'error');
    resetarBotoesBusca();
  }
}

/** Para a busca em andamento — UX 5: feedback visual imediato */
document.getElementById('btn-parar').addEventListener('click', async () => {
  if (!App.searchId) return;
  if (!confirm('Tem certeza que deseja parar a busca? Os leads já coletados serão mantidos.')) return;

  // UX 5: Estado "Parando..." imediato
  const btnParar = document.getElementById('btn-parar');
  btnParar.innerHTML = '<span class="spinner"></span> Parando...';
  btnParar.disabled = true;

  try {
    await api('POST', `/search/${App.searchId}/stop`);
    toast('Busca interrompida', 'info');
  } catch (err) {
    toast(`Erro ao parar: ${err.message}`, 'error');
    btnParar.disabled = false;
    btnParar.innerHTML = '⏹ Parar Busca';
  }
});

// UX 11: Botão "Nova busca" na página de resultados
document.getElementById('btn-nova-busca').addEventListener('click', () => {
  navegarPara('busca');
  // Pré-preenche com a última busca
  if (App.tipo)   document.getElementById('input-tipo').value = App.tipo;
  if (App.cidade) document.getElementById('input-cidade').value = App.cidade;
});

// ─────────────────────────────────────────────
// SSE — SERVER-SENT EVENTS (Leads em tempo real)
// ─────────────────────────────────────────────

function conectarSSE(searchId, maxResults) {
  if (App.sseConexao) App.sseConexao.close();

  App.sseConexao = new EventSource(`/api/search/${searchId}/stream`);

  App.sseConexao.onmessage = (e) => {
    try {
      const evento = JSON.parse(e.data);
      processarEventoSSE(evento, maxResults);
    } catch (err) {
      console.warn('Erro ao processar evento SSE:', err);
    }
  };

  App.sseConexao.onerror = () => {
    App.sseConexao.close();
    resetarBotoesBusca();
  };
}

function processarEventoSSE(evento, maxResults) {
  const { tipo, dados } = evento;

  switch (tipo) {
    case 'lead':
      App.leads.push(dados);
      atualizarContador(App.leads.length);
      atualizarProgresso(App.leads.length, maxResults);

      // Bug 3: Se há ordenação ativa, acumula no buffer em vez de adicionar à tabela
      if (App.ordenacaoAtiva) {
        App.bufferLeads.push(dados);
      } else {
        adicionarLinhaTabela(dados);
      }

      // Atualiza badge na sidebar e nav label
      const badge = document.getElementById('results-badge');
      badge.textContent = App.leads.length;
      badge.style.display = 'inline';
      atualizarNavResultados('buscando...');
      break;

    case 'status':
      document.getElementById('progress-log').textContent = dados.mensagem;
      if (dados.nivel === 'erro') toast(dados.mensagem, 'error');
      break;

    // Feature 4: Evento de duplicata
    case 'duplicado':
      App.totalDuplicados++;
      const dupInfo = document.getElementById('duplicados-info');
      const dupCount = document.getElementById('duplicados-count');
      dupCount.textContent = App.totalDuplicados;
      dupInfo.style.display = 'block';
      break;

    case 'concluido':
      App.sseConexao.close();
      resetarBotoesBusca();

      // Bug 3: Drena o buffer ao concluir
      if (App.bufferLeads.length > 0) {
        App.bufferLeads.forEach(l => App.leads.push(l));
        App.bufferLeads = [];
        App.ordenacaoAtiva = false;
        renderizarTabela(App.leads);
      }

      atualizarProgresso(dados.total, maxResults, true);
      toast(`✅ Busca concluída! ${dados.total} leads encontrados.`, 'success', 6000);

      document.getElementById('results-subtitle').textContent =
        `${App.tipo} em ${App.cidade} — ${dados.total} leads coletados`;
      document.getElementById('export-total').textContent = dados.total;

      // UX 8: Atualiza título da sidebar com total
      atualizarNavResultados(`(${dados.total})`);

      atualizarBotoesExportar();
      setTimeout(() => navegarPara('resultados'), 1500);
      break;

    case 'erro':
      App.sseConexao.close();
      resetarBotoesBusca();
      toast(`Erro: ${dados.mensagem}`, 'error');
      atualizarNavResultados(`(erro)`);
      break;

    case 'fim':
      App.sseConexao.close();
      resetarBotoesBusca();
      break;
  }
}

/** UX 8: Atualiza o label do nav-item de resultados */
function atualizarNavResultados(sufixo) {
  const label = document.getElementById('nav-resultados-label');
  if (label) label.textContent = sufixo ? `Resultados ${sufixo}` : 'Resultados';
}

function atualizarContador(n) {
  const el = document.getElementById('lead-counter');
  el.textContent = n;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'pulse-count 0.4s ease';
}

function atualizarProgresso(atual, maximo, concluido = false) {
  const pct = maximo > 0 ? Math.min(100, Math.round((atual / maximo) * 100)) : 0;
  document.getElementById('progress-bar').style.width = `${pct}%`;
  document.getElementById('progress-pct').textContent =
    concluido ? '100% ✅' : `${pct}%`;
}

function resetarBotoesBusca() {
  document.getElementById('btn-buscar').innerHTML = '🔍 Iniciar Busca';
  document.getElementById('btn-buscar').disabled = false;
  document.getElementById('btn-parar').style.display = 'none';
}

// ─────────────────────────────────────────────
// TABELA DE LEADS
// ─────────────────────────────────────────────

/** Perf 4: Renderiza apenas os leads da página atual */
function renderizarTabela(leads) {
  App.leadsVisiveis = [...leads];
  App.paginaAtual = 1;
  renderizarPagina();
}

function renderizarPagina() {
  const tbody = document.getElementById('table-body');
  const { paginaAtual, leadsPorPagina, leadsVisiveis } = App;

  if (!leadsVisiveis.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-table">
      <div class="empty-icon">🎯</div>
      <div>Nenhum lead encontrado ainda</div>
    </div></td></tr>`;
    atualizarPaginacao();
    return;
  }

  const inicio = (paginaAtual - 1) * leadsPorPagina;
  const fim    = inicio + leadsPorPagina;
  const pagina = leadsVisiveis.slice(inicio, fim);

  tbody.innerHTML = '';
  pagina.forEach(lead => adicionarLinhaTabela(lead, false));
  atualizarPaginacao();
}

/** Perf 4: Atualiza controles de paginação */
function atualizarPaginacao() {
  const { paginaAtual, leadsPorPagina, leadsVisiveis } = App;
  const totalPaginas = Math.max(1, Math.ceil(leadsVisiveis.length / leadsPorPagina));
  const paginacaoEl  = document.getElementById('paginacao');
  const infoEl       = document.getElementById('pag-info');
  const btnAnterior  = document.getElementById('btn-pag-anterior');
  const btnProximo   = document.getElementById('btn-pag-proximo');

  // Exibe paginação apenas se houver mais de uma página
  paginacaoEl.style.display = totalPaginas > 1 ? 'flex' : 'none';
  infoEl.textContent = `Página ${paginaAtual} de ${totalPaginas}`;
  btnAnterior.disabled = paginaAtual <= 1;
  btnProximo.disabled  = paginaAtual >= totalPaginas;
}

document.getElementById('btn-pag-anterior').addEventListener('click', () => {
  if (App.paginaAtual > 1) {
    App.paginaAtual--;
    renderizarPagina();
    document.getElementById('leads-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

document.getElementById('btn-pag-proximo').addEventListener('click', () => {
  const totalPaginas = Math.ceil(App.leadsVisiveis.length / App.leadsPorPagina);
  if (App.paginaAtual < totalPaginas) {
    App.paginaAtual++;
    renderizarPagina();
    document.getElementById('leads-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

/** Adiciona uma linha na tabela (durante busca em tempo real ou ao renderizar) */
function adicionarLinhaTabela(lead, scroll = true) {
  const tbody = document.getElementById('table-body');

  // Remove placeholder se presente
  const vazio = tbody.querySelector('.empty-table');
  if (vazio) tbody.innerHTML = '';

  const tr = document.createElement('tr');
  tr.dataset.id = lead.id;

  // UX 9: determina se o site foi visitado para diferenciar campos vazios
  const siteVisitado = !!lead.site;

  // UX 1: endereço no td com title, sem truncagem JS (CSS faz isso)
  // Feature 1: select de status
  const statusOpcoes = ['Novo', 'Contatado', 'Sem resposta', 'Cliente', 'Descartado'];
  const statusAtual = lead.status_contato || 'Novo';
  const statusOpcoesHtml = statusOpcoes
    .map(s => `<option value="${s}" ${s === statusAtual ? 'selected' : ''}>${s}</option>`)
    .join('');

  // Bug 6: escapeHtml em todos os campos interpolados
  tr.innerHTML = `
    <td><input type="checkbox" class="row-check" data-id="${lead.id}" /></td>
    <td title="${escapeHtml(lead.nome || '')}">
      ${escapeHtml(lead.nome) || '<span class="campo-nao-coletado">—</span>'}
      ${lead.nome ? `<button class="copy-btn" onclick="copiar('${escapeHtml(lead.nome).replace(/'/g, "\\'")}')">copiar</button>` : ''}
    </td>
    <td>
      ${lead.telefone ? escapeHtml(lead.telefone) : '<span class="campo-nao-coletado">—</span>'}
      ${lead.telefone ? `<button class="copy-btn" onclick="copiar('${escapeHtml(lead.telefone)}')">copiar</button>` : ''}
    </td>
    <td title="${escapeHtml(lead.email || '')}">
      ${lead.email
        ? `<a href="mailto:${escapeHtml(lead.email)}" style="color:var(--brand);">${escapeHtml(lead.email.substring(0, 28))}${lead.email.length > 28 ? '...' : ''}</a>`
        : (siteVisitado ? '<span class="campo-nao-encontrado" title="Site visitado mas email não encontrado">🚫</span>' : '<span class="campo-nao-coletado">—</span>')}
    </td>
    <td>
      ${lead.site ? `<a href="${escapeHtml(lead.site)}" target="_blank" style="color:var(--brand);">🌐 Site</a>` : '<span class="campo-nao-coletado">—</span>'}
    </td>
    <td>${renderSociais(lead)}</td>
    <td>${renderEstrelas(lead.avaliacao_nota, lead.avaliacao_total) || '<span class="campo-nao-coletado">—</span>'}</td>
    <td>${lead.categoria ? `<span class="badge">${escapeHtml(lead.categoria)}</span>` : '<span class="campo-nao-coletado">—</span>'}</td>
    <td class="col-endereco" title="${escapeHtml(lead.endereco || '')}">${escapeHtml(lead.endereco) || '<span class="campo-nao-coletado">—</span>'}</td>
    <td>
      <select class="status-select status-${(statusAtual || 'Novo').toLowerCase().replace(' ', '-')}" data-lead-id="${lead.id}">
        ${statusOpcoesHtml}
      </select>
    </td>
  `;

  // Clique na linha fora de inputs/botões exibe detalhes
  tr.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON' &&
        e.target.tagName !== 'A' && e.target.tagName !== 'SELECT') {
      exibirDetalhesLead(lead);
    }
  });

  tbody.appendChild(tr);

  // Removido auto-scroll a pedido do usuário (atrapalhava a navegação)
  // if (scroll) {
  //   tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // }

  // Listener de checkbox
  tr.querySelector('.row-check').addEventListener('change', (e) => {
    const id = parseInt(e.target.dataset.id);
    if (e.target.checked) {
      App.selecionados.add(id);
    } else {
      App.selecionados.delete(id);
      document.getElementById('check-all').checked = false;
    }
    atualizarInfoSelecionados();
  });

  // Feature 1: Salva status ao mudar
  tr.querySelector('.status-select').addEventListener('change', async (e) => {
    const novoStatus = e.target.value;
    // Atualiza a classe CSS para a cor correta
    e.target.className = `status-select status-${novoStatus.toLowerCase().replace(' ', '-')}`;
    // Salva no servidor
    await atualizarLead(lead.id, { status_contato: novoStatus });
    // Atualiza no estado local
    const leadLocal = App.leads.find(l => l.id === lead.id);
    if (leadLocal) leadLocal.status_contato = novoStatus;
  });
}

// Selecionar todos
document.getElementById('check-all').addEventListener('change', (e) => {
  const checks = document.querySelectorAll('.row-check');
  checks.forEach(c => {
    c.checked = e.target.checked;
    const id = parseInt(c.dataset.id);
    if (e.target.checked) App.selecionados.add(id);
    else App.selecionados.delete(id);
  });
  atualizarInfoSelecionados();
});

document.getElementById('btn-select-all').addEventListener('click', () => {
  const checkAll = document.getElementById('check-all');
  checkAll.checked = !checkAll.checked;
  checkAll.dispatchEvent(new Event('change'));
});

function atualizarInfoSelecionados() {
  const n = App.selecionados.size;
  const info = document.getElementById('export-selected-info');
  document.getElementById('export-selected-count').textContent = n;
  info.style.display = n > 0 ? 'inline' : 'none';

  // UX 4: Texto do botão muda com seleção ativa
  const btnCsv   = document.getElementById('btn-export-csv');
  const btnExcel = document.getElementById('btn-export-excel');
  if (n > 0) {
    btnCsv.innerHTML   = `⬇️ Exportar ${n} selecionados`;
    btnExcel.innerHTML = `📗 Excel ${n} selecionados`;
  } else {
    btnCsv.innerHTML   = '⬇️ Exportar CSV';
    btnExcel.innerHTML = '📗 Exportar Excel';
  }

  atualizarBotoesExportar();
}

/** UX 3: Habilita/desabilita botões de export baseado em App.leads.length */
function atualizarBotoesExportar() {
  const temLeads = App.leads.length > 0;
  document.getElementById('btn-export-csv').disabled   = !temLeads;
  document.getElementById('btn-export-excel').disabled = !temLeads;
  document.getElementById('btn-export-sheets').disabled = !temLeads;
}

// ─── FILTRO DE TEXTO (Perf 5 — Debounce 200ms) ───
let filterTimer;
document.getElementById('table-filter').addEventListener('input', (e) => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => aplicarFiltro(e.target.value), 200);
});

function aplicarFiltro(termo) {
  const t = termo.toLowerCase();
  const rows = document.querySelectorAll('#table-body tr[data-id]');
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(t) ? '' : 'none';
  });
}

// ─── ORDENAÇÃO (Bug 3: flag + buffer) ───
document.querySelectorAll('[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (!col || col === 'social') return;

    if (App.ordenacao.col === col) {
      App.ordenacao.dir = App.ordenacao.dir === 'asc' ? 'desc' : 'asc';
    } else {
      App.ordenacao.col = col;
      App.ordenacao.dir = 'asc';
    }

    // Atualiza ícones
    document.querySelectorAll('[data-col]').forEach(t => t.classList.remove('sorted'));
    th.classList.add('sorted');
    const sortIcon = th.querySelector('.sort-icon');
    if (sortIcon) sortIcon.textContent = App.ordenacao.dir === 'asc' ? '↑' : '↓';

    // Bug 3: Ativa flag durante busca SSE ativa
    const buscaAtiva = App.sseConexao && App.sseConexao.readyState !== EventSource.CLOSED;
    if (buscaAtiva) {
      App.ordenacaoAtiva = true;
    }

    // Ordena e re-renderiza
    const sorted = [...App.leads].sort((a, b) => {
      const va = (a[col] || '').toString().toLowerCase();
      const vb = (b[col] || '').toString().toLowerCase();
      const cmp = App.ordenacao.dir === 'asc' ? 1 : -1;
      return va < vb ? -cmp : va > vb ? cmp : 0;
    });

    renderizarTabela(sorted);
  });
});

// ─── DETALHES DO LEAD (UX 2) ───
function exibirDetalhesLead(lead) {
  const campos = [
    ['Nome',               lead.nome],
    ['Endereço',           lead.endereco],
    ['Telefone',           lead.telefone],
    ['E-mail',             lead.email],
    ['Site',               lead.site],
    ['Instagram',          lead.instagram],
    ['Facebook',           lead.facebook],
    ['LinkedIn',           lead.linkedin],
    ['WhatsApp',           lead.whatsapp],
    ['Avaliação',          lead.avaliacao_nota],
    ['Total Avaliações',   lead.avaliacao_total],
    ['Categoria',          lead.categoria],
    ['Horário',            lead.horario],
    ['Plus Code',          lead.plus_code],
    ['Status',             lead.status_contato],
  ].filter(([, v]) => v);

  // Texto completo para "Copiar tudo"
  const textoCompleto = campos.map(([k, v]) => `${k}: ${v}`).join('\n');

  // Link para o Google Maps
  const nomeParaMaps = encodeURIComponent((lead.nome || '') + ' ' + (lead.endereco || ''));
  const linkMaps = lead.maps_url
    ? lead.maps_url
    : `https://www.google.com/maps/search/${nomeParaMaps}`;

  const linhas = campos.map(([k, v]) => `
    <div style="display:flex; gap:12px; padding:8px 0; border-bottom:1px solid var(--border);">
      <span style="color:var(--text-muted); min-width:100px; font-size:12px; flex-shrink:0;">${escapeHtml(k)}</span>
      <span style="color:var(--text-primary); font-size:13px; word-break:break-all;">${escapeHtml(String(v))}</span>
    </div>
  `).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '600';
  modal.innerHTML = `
    <div class="modal" style="max-width:600px;">
      <div class="modal-header">
        <span class="modal-title">📌 ${escapeHtml(lead.nome || 'Lead')}</span>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>

      <!-- Botões de ação -->
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
        <button class="btn btn-secondary" style="font-size:12px; padding:5px 12px;"
          onclick="copiar('${escapeHtml(textoCompleto).replace(/'/g, "\\'")}')">
          📋 Copiar tudo
        </button>
        <a href="${escapeHtml(linkMaps)}" target="_blank"
          class="btn btn-secondary" style="font-size:12px; padding:5px 12px; text-decoration:none;">
          🗺️ Abrir no Maps
        </a>
        <button class="btn btn-secondary" style="font-size:12px; padding:5px 12px;"
          id="btn-marcar-contatado-${lead.id}"
          onclick="marcarContatado(${lead.id}, this)">
          ✅ Marcar como Contatado
        </button>
      </div>

      <!-- Dados do lead -->
      <div style="max-height:45vh; overflow-y:auto; margin-bottom:16px;">${linhas}</div>

      <!-- Feature 2: Campo de notas -->
      <div style="margin-top:12px;">
        <label style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:6px;">📝 Notas</label>
        <textarea id="notas-lead-${lead.id}"
          style="width:100%; min-height:80px; padding:8px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-dark); color:var(--text-primary); font-family:inherit; font-size:13px; resize:vertical;"
          placeholder="Adicione observações sobre este lead..."
        >${escapeHtml(lead.notas || '')}</textarea>
        <div style="text-align:right; margin-top:4px;">
          <button class="btn btn-primary" style="font-size:11px; padding:4px 12px;"
            onclick="salvarNotas(${lead.id})">
            💾 Salvar Notas
          </button>
        </div>
      </div>
    </div>
  `;

  // Salva notas ao sair do campo (onblur)
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  // Attach blur para auto-save
  const notasEl = modal.querySelector(`#notas-lead-${lead.id}`);
  if (notasEl) {
    notasEl.addEventListener('blur', () => salvarNotas(lead.id));
  }
}

/** Feature 2: Salva notas via PATCH */
async function salvarNotas(leadId) {
  const notasEl = document.getElementById(`notas-lead-${leadId}`);
  if (!notasEl) return;
  const notas = notasEl.value;
  await atualizarLead(leadId, { notas });
  // Atualiza no estado local
  const leadLocal = App.leads.find(l => l.id === leadId);
  if (leadLocal) leadLocal.notas = notas;
  toast('Notas salvas!', 'success', 1500);
}

/** UX 2: Marca lead como contatado */
async function marcarContatado(leadId, btnEl) {
  await atualizarLead(leadId, { status_contato: 'Contatado' });
  // Atualiza o select na tabela
  const selectEl = document.querySelector(`.status-select[data-lead-id="${leadId}"]`);
  if (selectEl) {
    selectEl.value = 'Contatado';
    selectEl.className = 'status-select status-contatado';
  }
  // Destaque visual na linha
  const tr = document.querySelector(`tr[data-id="${leadId}"]`);
  if (tr) tr.classList.add('lead-contatado');
  // Atualiza no estado local
  const leadLocal = App.leads.find(l => l.id === leadId);
  if (leadLocal) leadLocal.status_contato = 'Contatado';
  if (btnEl) btnEl.textContent = '✅ Contatado!';
  toast('Lead marcado como Contatado', 'success', 1500);
}

// ─────────────────────────────────────────────
// EXPORTAÇÃO CSV
// ─────────────────────────────────────────────

document.getElementById('btn-export-csv').addEventListener('click', async () => {
  // UX 3: verifica App.leads.length em vez de App.searchId
  if (!App.leads.length) { toast('Nenhum lead para exportar', 'error'); return; }
  if (!App.searchId) { toast('searchId não disponível', 'error'); return; }

  const leadIds = App.selecionados.size > 0 ? [...App.selecionados] : null;

  try {
    const res = await api('POST', '/export/csv', {
      search_id: App.searchId,
      tipo: App.tipo,
      cidade: App.cidade,
      lead_ids: leadIds,
    });
    
    // Fallback nativo e seguro para forçar o browser a interpretar como download
    window.location.href = `/api/download/${res.filename}`;

    toast(`✅ CSV exportado! ${res.total} leads.`, 'success');
  } catch (err) {
    toast(`Erro ao exportar: ${err.message}`, 'error');
  }
});

// ─────────────────────────────────────────────
// EXPORTAÇÃO EXCEL
// ─────────────────────────────────────────────

document.getElementById('btn-export-excel').addEventListener('click', async () => {
  if (!App.leads.length) { toast('Nenhum lead para exportar', 'error'); return; }
  if (!App.searchId) { toast('searchId não disponível', 'error'); return; }

  const leadIds = App.selecionados.size > 0 ? [...App.selecionados] : null;

  try {
    const res = await api('POST', '/export/excel', {
      search_id: App.searchId,
      tipo: App.tipo,
      cidade: App.cidade,
      lead_ids: leadIds,
    });

    // Fallback nativo e seguro para forçar o browser a interpretar como download
    window.location.href = `/api/download/${res.filename}`;

    toast(`✅ Excel exportado! ${res.total} leads.`, 'success');
  } catch (err) {
    toast(`Erro ao exportar Excel: ${err.message}`, 'error');
  }
});

// ─────────────────────────────────────────────
// EXPORTAÇÃO GOOGLE SHEETS
// ─────────────────────────────────────────────

document.getElementById('btn-export-sheets').addEventListener('click', async () => {
  if (!App.leads.length) { toast('Nenhum lead para exportar', 'error'); return; }

  try {
    const status = await api('GET', '/export/sheets/status');
    const infoEl = document.getElementById('sheets-cred-status');

    if (status.credentials_existe) {
      infoEl.innerHTML = `✅ <strong style="color:var(--success)">Credenciais configuradas!</strong>
        ${status.token_existe ? ' Token de acesso ativo.' : ' Será necessário autorizar na primeira exportação.'}`;
    } else {
      infoEl.innerHTML = `⚠️ <strong style="color:var(--warning)">Credenciais não encontradas.</strong>
        <br><small>${status.instrucoes?.replace(/\n/g, '<br>') || ''}</small>`;
    }
  } catch (e) {
    console.error(e);
  }

  document.getElementById('modal-sheets').classList.add('open');
});

document.getElementById('modal-sheets-close').addEventListener('click', () => {
  document.getElementById('modal-sheets').classList.remove('open');
});

document.getElementById('sheets-cancel').addEventListener('click', () => {
  document.getElementById('modal-sheets').classList.remove('open');
});

document.getElementById('sheets-mode').addEventListener('change', (e) => {
  const group = document.getElementById('sheets-id-group');
  group.style.display = e.target.value === 'existente' ? 'block' : 'none';
});

document.getElementById('btn-confirmar-sheets').addEventListener('click', async () => {
  const modo     = document.getElementById('sheets-mode').value;
  const sheetsId = document.getElementById('sheets-id').value.trim();
  const leadIds  = App.selecionados.size > 0 ? [...App.selecionados] : null;

  const btn = document.getElementById('btn-confirmar-sheets');
  btn.innerHTML = '<span class="spinner"></span> Exportando...';
  btn.disabled = true;

  try {
    const res = await api('POST', '/export/sheets', {
      search_id: App.searchId,
      tipo: App.tipo,
      cidade: App.cidade,
      lead_ids: leadIds,
      planilha_existente_id: modo === 'existente' ? sheetsId : null,
    });

    document.getElementById('modal-sheets').classList.remove('open');
    toast(`✅ Planilha criada! ${res.total} leads exportados. Abrindo no browser...`, 'success', 6000);
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  } finally {
    btn.innerHTML = '📤 Exportar Agora';
    btn.disabled = false;
  }
});

// ─────────────────────────────────────────────
// HISTÓRICO DE BUSCAS
// ─────────────────────────────────────────────

async function carregarHistorico() {
  const container = document.getElementById('history-list');
  container.innerHTML = '<div style="padding:20px;color:var(--text-muted);">Carregando...</div>';

  // Feature 5: Carrega estatísticas junto com o histórico
  carregarEstatisticas();

  try {
    const historico = await api('GET', '/history');

    if (!historico.length) {
      container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
        <div style="font-size:48px;margin-bottom:12px;opacity:0.4;">📂</div>
        <div>Nenhuma busca no histórico ainda</div>
      </div>`;
      return;
    }

    container.innerHTML = '';
    historico.forEach(busca => {
      const data = new Date(busca.created_at).toLocaleString('pt-BR');
      const item = document.createElement('div');
      item.className = 'history-item';

      // UX 6: Preview dos 3 primeiros leads
      const leadsPreview = busca._preview_leads
        ? `<div class="history-preview">${busca._preview_leads.map(n => escapeHtml(n)).join(' · ')}</div>`
        : '';

      item.innerHTML = `
        <div style="font-size:24px;">🔍</div>
        <div class="history-info">
          <div class="history-query">${escapeHtml(busca.tipo)} em ${escapeHtml(busca.cidade)}</div>
          <div class="history-meta">${data} · ${busca.total_found} leads</div>
          ${leadsPreview}
        </div>
        <span class="history-badge ${busca.status}">${busca.status}</span>
        <button class="btn btn-secondary" style="font-size:11px;padding:5px 10px;"
          onclick="reAbrirBusca('${escapeHtml(busca.id)}','${escapeHtml(busca.tipo).replace(/'/g,"\\'")}','${escapeHtml(busca.cidade).replace(/'/g,"\\'")}')">
          📂 Abrir
        </button>
        <button class="btn btn-danger" style="font-size:11px;padding:5px 10px;"
          onclick="deletarHistorico('${escapeHtml(busca.id)}', this)">
          🗑
        </button>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    container.innerHTML = `<div style="color:var(--error);padding:20px;">Erro: ${escapeHtml(err.message)}</div>`;
  }
}

/** Feature 5: Carrega e renderiza cards de estatísticas */
async function carregarEstatisticas() {
  try {
    const stats = await api('GET', '/stats');
    document.getElementById('stat-val-buscas').textContent = stats.total_buscas ?? '—';
    document.getElementById('stat-val-leads').textContent  = stats.total_leads ?? '—';
    document.getElementById('stat-val-email').textContent  = stats.taxa_email != null ? `${stats.taxa_email}%` : '—';
    document.getElementById('stat-val-social').textContent = stats.taxa_redes_sociais != null ? `${stats.taxa_redes_sociais}%` : '—';
  } catch (err) {
    console.warn('Erro ao carregar estatísticas:', err);
  }
}

async function reAbrirBusca(searchId, tipo, cidade) {
  try {
    const res = await api('GET', `/results/${searchId}`);
    App.searchId = searchId;
    App.tipo = tipo;
    App.cidade = cidade;
    App.leads = res.leads;
    App.selecionados.clear();

    document.getElementById('results-subtitle').textContent =
      `${tipo} em ${cidade} — ${res.total} leads (histórico)`;
    document.getElementById('export-total').textContent = res.total;

    const badge = document.getElementById('results-badge');
    badge.textContent = res.total;
    badge.style.display = 'inline';

    atualizarNavResultados(`(${res.total})`);
    renderizarTabela(res.leads);
    atualizarBotoesExportar();
    navegarPara('resultados');
    toast(`${res.total} leads carregados do histórico`, 'info');
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
}

async function deletarHistorico(searchId, btn) {
  if (!confirm('Deletar esta busca e todos os seus leads?')) return;
  try {
    await api('DELETE', `/history/${searchId}`);
    btn.closest('.history-item').remove();
    toast('Busca deletada', 'info');
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
}

// ─────────────────────────────────────────────
// CONFIGURAÇÕES
// ─────────────────────────────────────────────

async function carregarConfiguracoes() {
  try {
    const cfg = await api('GET', '/config/fields');

    document.getElementById('cfg-delay-min').value   = cfg.delay_min_segundos;
    document.getElementById('cfg-delay-max').value   = cfg.delay_max_segundos;
    document.getElementById('cfg-headless').checked  = cfg.modo_headless;
    document.getElementById('cfg-visitar-site').checked = cfg.visitar_site_do_lead;

    const container = document.getElementById('fields-list');
    container.innerHTML = '';

    const todos = [...(cfg.campos || []), ...(cfg.campos_customizados || [])];
    todos.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    todos.forEach(campo => {
      const div = document.createElement('div');
      div.className = 'field-item';
      div.dataset.id = campo.id;
      // Guarda o objeto completo para o btn-salvar-config reconstruir com label/tipo/ordem
      div.dataset.campo = JSON.stringify(campo);
      const labelTexto = campo.label || campo.id || '?';
      const tipoTexto  = campo.tipo  || 'texto';
      div.innerHTML = `
        <label class="toggle">
          <input type="checkbox" ${campo.habilitado ? 'checked' : ''} data-field="${escapeHtml(campo.id)}" />
          <div class="toggle-track"></div>
        </label>
        <span class="field-label-text" style="color:var(--text-primary);">${escapeHtml(labelTexto)}</span>
        <span class="field-type-badge">${escapeHtml(tipoTexto)}</span>
      `;
      container.appendChild(div);
    });

  } catch (err) {
    toast(`Erro ao carregar configurações: ${err.message}`, 'error');
  }
}

document.getElementById('btn-salvar-config').addEventListener('click', async () => {
  try {
    // Lê objetos completos dos field-items (contém label, tipo, ordem além de habilitado)
    const fieldItems = document.querySelectorAll('.field-item[data-campo]');
    const campos = [];
    fieldItems.forEach(item => {
      try {
        const campoCompleto = JSON.parse(item.dataset.campo);
        const toggle = item.querySelector('input[type="checkbox"]');
        campoCompleto.habilitado = toggle ? toggle.checked : (campoCompleto.habilitado ?? true);
        campos.push(campoCompleto);
      } catch (e) {
        // fallback seguro se JSON corrompido
        const id = item.dataset.id;
        const toggle = item.querySelector('input[type="checkbox"]');
        if (id) campos.push({ id, habilitado: toggle?.checked ?? true });
      }
    });

    await api('POST', '/config/fields', { campos, campos_customizados: [] });
    await api('PATCH', '/config', {
      delay_min_segundos:   parseFloat(document.getElementById('cfg-delay-min').value),
      delay_max_segundos:   parseFloat(document.getElementById('cfg-delay-max').value),
      modo_headless:        document.getElementById('cfg-headless').checked,
      visitar_site_do_lead: document.getElementById('cfg-visitar-site').checked,
    });

    toast('✅ Configurações salvas!', 'success');
  } catch (err) {
    toast(`Erro ao salvar: ${err.message}`, 'error');
  }
});

document.getElementById('btn-resetar-config').addEventListener('click', async () => {
  if (!confirm('Restaurar todas as configurações para o padrão? Esta ação não pode ser desfeita.')) return;
  try {
    await api('POST', '/config/reset');
    carregarConfiguracoes();
    toast('Configurações restauradas!', 'info');
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
});

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────

(function init() {
  // Carrega tema salvo e sincroniza ícone
  api('GET', '/config/fields').then(cfg => {
    if (cfg.tema) {
      document.documentElement.dataset.theme = cfg.tema;
      document.getElementById('btn-tema').textContent = cfg.tema === 'escuro' ? '🌙' : '☀️';
    }
    // Sincroniza toggle Modo Rápido
    if (cfg.modo_rapido) {
      toggleModoRapido.checked = true;
      badgeRapido.style.display = 'inline-block';
    }
  }).catch(() => {});

  // UX 3: Inicia com botões de exportar desabilitados
  atualizarBotoesExportar();

  console.log('🎯 LeadHunter v2 inicializado. Boa caçada! 🚀');
})();
