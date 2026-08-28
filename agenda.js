// agenda.js
// Aba "Agenda": espelha a agenda operacional dentro do dashboard usando o mesmo endpoint
// de agendamentos do Kanban. Não lê Google Calendar direto nesta fase; o Postgres continua
// sendo a fonte principal do painel.

const Agenda = {
  _containerEl: null,
  _pollTimer: null,
  _agendamentos: [],
  _carregouUmaVez: false,
  _modo: 'dia',
  _dataBase: null,
  _filtroBarbeiro: 'todos',
  _filtroStatus: 'todos',

  STATUS: {
    agendado: { label: 'Agendado', icone: 'calendar' },
    cancelado: { label: 'Cancelado', icone: 'x' },
    concluido: { label: 'Concluído', icone: 'check' },
  },

  init(containerEl) {
    this._containerEl = containerEl;
    this._pollTimer = null;
    this._agendamentos = [];
    this._carregouUmaVez = false;
    this._modo = 'dia';
    this._dataBase = this._formatarChaveData(new Date());
    this._filtroBarbeiro = 'todos';
    this._filtroStatus = 'todos';
    this._renderSkeleton();
  },

  start() {
    this.refresh();
    this.stop();
    this._pollTimer = setInterval(() => this.refresh({ silencioso: true }), CONFIG.POLL_INTERVAL_LISTAS_MS);
  },

  stop() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = null;
  },

  async refresh({ silencioso = false } = {}) {
    try {
      const dados = await Api.getAgendamentos();
      this._agendamentos = Array.isArray(dados) ? dados : [];
      this._carregouUmaVez = true;
      this._render();
    } catch (err) {
      if (!err.isConflict) console.error('Erro ao buscar agenda:', err);
      if (!silencioso && this._containerEl) {
        this._containerEl.innerHTML = `
          <div class="agenda-estado agenda-estado-erro">
            ${UI.icon('x')}
            <strong>Não consegui carregar a agenda</strong>
            <p>Verifique a conexão com o servidor e tente novamente.</p>
            <button type="button" class="botao-secundario" data-agenda-acao="recarregar">Tentar de novo</button>
          </div>
        `;
        this._containerEl.querySelector('[data-agenda-acao="recarregar"]')?.addEventListener('click', () => this.refresh());
      }
    }
  },

  _renderSkeleton() {
    if (!this._containerEl) return;
    this._containerEl.innerHTML = `
      <div class="agenda-toolbar skeleton skeleton-linha"></div>
      <div class="agenda-resumo-grid">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
    `;
  },

  _render() {
    if (!this._containerEl) return;

    const barbeiros = this._barbeirosDisponiveis();
    const periodo = this._periodoAtual();
    const itensPeriodo = this._agendamentos
      .filter((ag) => this._estaNoPeriodo(ag, periodo))
      .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    const itensFiltrados = itensPeriodo.filter((ag) => this._passaFiltros(ag));
    const resumo = this._calcularResumo(itensPeriodo);

    this._containerEl.innerHTML = `
      <div class="agenda-toolbar">
        <div class="agenda-toolbar-bloco agenda-toolbar-principal">
          <div class="agenda-segmentado" role="group" aria-label="Modo da agenda">
            <button type="button" class="agenda-segmento ${this._modo === 'dia' ? 'agenda-segmento-ativo' : ''}" data-agenda-modo="dia">Dia</button>
            <button type="button" class="agenda-segmento ${this._modo === 'semana' ? 'agenda-segmento-ativo' : ''}" data-agenda-modo="semana">Semana</button>
          </div>
          <button type="button" class="botao-secundario agenda-botao-iconico" data-agenda-acao="anterior" aria-label="Período anterior">${UI.icon('chevronLeft')}</button>
          <input class="agenda-data-input" type="date" value="${UI.escapar(this._dataBase)}" data-agenda-data />
          <button type="button" class="botao-secundario agenda-botao-iconico" data-agenda-acao="proximo" aria-label="Próximo período">${UI.icon('chevronRight')}</button>
          <button type="button" class="botao-secundario" data-agenda-acao="hoje">Hoje</button>
        </div>

        <div class="agenda-toolbar-bloco agenda-toolbar-filtros">
          <label class="agenda-filtro">
            <span>Barbeiro</span>
            <select data-agenda-barbeiro>
              <option value="todos">Todos</option>
              ${barbeiros.map((b) => `<option value="${UI.escapar(b)}" ${b === this._filtroBarbeiro ? 'selected' : ''}>${UI.escapar(b)}</option>`).join('')}
            </select>
          </label>
          <label class="agenda-filtro">
            <span>Status</span>
            <select data-agenda-status>
              <option value="todos" ${this._filtroStatus === 'todos' ? 'selected' : ''}>Todos</option>
              <option value="agendado" ${this._filtroStatus === 'agendado' ? 'selected' : ''}>Agendados</option>
              <option value="concluido" ${this._filtroStatus === 'concluido' ? 'selected' : ''}>Concluídos</option>
              <option value="cancelado" ${this._filtroStatus === 'cancelado' ? 'selected' : ''}>Cancelados</option>
            </select>
          </label>
          <button type="button" class="botao-secundario" data-agenda-acao="recarregar">Atualizar</button>
        </div>
      </div>

      <div class="agenda-periodo-card">
        <div>
          <span class="agenda-periodo-label">${this._modo === 'dia' ? 'Agenda do dia' : 'Agenda da semana'}</span>
          <h2>${UI.escapar(this._tituloPeriodo(periodo))}</h2>
        </div>
        <span class="agenda-periodo-contador">${itensFiltrados.length} de ${itensPeriodo.length} horário${itensPeriodo.length === 1 ? '' : 's'}</span>
      </div>

      <div class="agenda-resumo-grid">
        ${this._renderResumoCard('agendado', resumo.agendado)}
        ${this._renderResumoCard('concluido', resumo.concluido)}
        ${this._renderResumoCard('cancelado', resumo.cancelado)}
      </div>

      <div class="agenda-lista">
        ${this._renderListaPorDia(itensFiltrados, periodo)}
      </div>
    `;

    this._ligarEventos();
  },

  _ligarEventos() {
    this._containerEl.querySelectorAll('[data-agenda-modo]').forEach((botao) => {
      botao.addEventListener('click', () => {
        this._modo = botao.dataset.agendaModo;
        this._render();
      });
    });

    this._containerEl.querySelector('[data-agenda-data]')?.addEventListener('change', (ev) => {
      if (ev.target.value) {
        this._dataBase = ev.target.value;
        this._render();
      }
    });

    this._containerEl.querySelector('[data-agenda-barbeiro]')?.addEventListener('change', (ev) => {
      this._filtroBarbeiro = ev.target.value || 'todos';
      this._render();
    });

    this._containerEl.querySelector('[data-agenda-status]')?.addEventListener('change', (ev) => {
      this._filtroStatus = ev.target.value || 'todos';
      this._render();
    });

    this._containerEl.querySelectorAll('[data-agenda-acao]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const acao = botao.dataset.agendaAcao;
        if (acao === 'hoje') this._dataBase = this._formatarChaveData(new Date());
        else if (acao === 'anterior') this._moverPeriodo(-1);
        else if (acao === 'proximo') this._moverPeriodo(1);
        else if (acao === 'recarregar') return this.refresh();
        this._render();
      });
    });
  },

  _renderResumoCard(status, quantidade) {
    const meta = this.STATUS[status] || this.STATUS.agendado;
    return `
      <div class="agenda-resumo-card agenda-resumo-${status}">
        <span class="agenda-resumo-icone">${UI.icon(meta.icone)}</span>
        <span class="agenda-resumo-numero">${quantidade}</span>
        <span class="agenda-resumo-label">${UI.escapar(meta.label)}</span>
      </div>
    `;
  },

  _renderListaPorDia(itens, periodo) {
    const dias = this._diasDoPeriodo(periodo);
    if (!itens.length) {
      return `
        <div class="agenda-estado">
          ${UI.icon('inbox')}
          <strong>Nenhum horário encontrado</strong>
          <p>Não há agendamentos nesse período com os filtros selecionados.</p>
        </div>
      `;
    }

    return dias.map((dia) => {
      const itensDia = itens.filter((ag) => this._formatarChaveData(new Date(ag.inicio)) === dia);
      if (!itensDia.length && this._modo === 'dia') return '';
      if (!itensDia.length) {
        return `
          <section class="agenda-dia agenda-dia-vazio">
            <header class="agenda-dia-header">
              <h3>${UI.escapar(this._formatarDiaTitulo(dia))}</h3>
              <span>Sem horários</span>
            </header>
          </section>
        `;
      }
      return `
        <section class="agenda-dia">
          <header class="agenda-dia-header">
            <h3>${UI.escapar(this._formatarDiaTitulo(dia))}</h3>
            <span>${itensDia.length} horário${itensDia.length === 1 ? '' : 's'}</span>
          </header>
          <div class="agenda-dia-itens">
            ${itensDia.map((ag) => this._renderAgendaItem(ag)).join('')}
          </div>
        </section>
      `;
    }).join('');
  },

  _renderAgendaItem(ag) {
    const status = ag.status || 'agendado';
    const meta = this.STATUS[status] || { label: status, icone: 'calendar' };
    return `
      <article class="agenda-item agenda-item-${UI.escapar(status)}">
        <div class="agenda-item-hora">
          <strong>${UI.escapar(this._formatarHora(ag.inicio))}</strong>
          <span>${UI.escapar(this._formatarHora(ag.fim))}</span>
        </div>
        <div class="agenda-item-corpo">
          <div class="agenda-item-topo">
            <strong>${UI.escapar(ag.cliente_nome || 'Cliente sem nome')}</strong>
            <span class="agenda-status agenda-status-${UI.escapar(status)}">${UI.icon(meta.icone)}${UI.escapar(meta.label)}</span>
          </div>
          <div class="agenda-item-detalhes">
            ${ag.servico_nome ? `<span>${UI.icon('scissors')}${UI.escapar(ag.servico_nome)}</span>` : ''}
            ${ag.barbeiro_nome ? `<span>${UI.icon('user')}${UI.escapar(ag.barbeiro_nome)}</span>` : ''}
            ${ag.cliente_telefone ? `<span>${UI.icon('phone')}${UI.escapar(ag.cliente_telefone)}</span>` : ''}
          </div>
        </div>
      </article>
    `;
  },

  _barbeirosDisponiveis() {
    return Array.from(new Set(this._agendamentos.map((ag) => ag.barbeiro_nome).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  },

  _passaFiltros(ag) {
    if (this._filtroBarbeiro !== 'todos' && ag.barbeiro_nome !== this._filtroBarbeiro) return false;
    if (this._filtroStatus !== 'todos' && ag.status !== this._filtroStatus) return false;
    return true;
  },

  _calcularResumo(itens) {
    return {
      agendado: itens.filter((a) => a.status === 'agendado').length,
      concluido: itens.filter((a) => a.status === 'concluido').length,
      cancelado: itens.filter((a) => a.status === 'cancelado').length,
    };
  },

  _periodoAtual() {
    const base = this._dataDeChave(this._dataBase);
    if (this._modo === 'semana') {
      const inicio = new Date(base);
      const diaSemana = inicio.getDay();
      const deslocamentoSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
      inicio.setDate(inicio.getDate() + deslocamentoSegunda);
      const fim = new Date(inicio);
      fim.setDate(inicio.getDate() + 6);
      return { inicio: this._formatarChaveData(inicio), fim: this._formatarChaveData(fim) };
    }
    return { inicio: this._formatarChaveData(base), fim: this._formatarChaveData(base) };
  },

  _diasDoPeriodo(periodo) {
    const dias = [];
    const atual = this._dataDeChave(periodo.inicio);
    const fim = this._dataDeChave(periodo.fim);
    while (atual <= fim) {
      dias.push(this._formatarChaveData(atual));
      atual.setDate(atual.getDate() + 1);
    }
    return dias;
  },

  _estaNoPeriodo(ag, periodo) {
    if (!ag || !ag.inicio) return false;
    const dia = this._formatarChaveData(new Date(ag.inicio));
    return dia >= periodo.inicio && dia <= periodo.fim;
  },

  _moverPeriodo(direcao) {
    const data = this._dataDeChave(this._dataBase);
    data.setDate(data.getDate() + (this._modo === 'semana' ? 7 : 1) * direcao);
    this._dataBase = this._formatarChaveData(data);
  },

  _tituloPeriodo(periodo) {
    if (periodo.inicio === periodo.fim) return this._formatarDiaTitulo(periodo.inicio, { completo: true });
    return `${this._formatarDiaTitulo(periodo.inicio)} a ${this._formatarDiaTitulo(periodo.fim)}`;
  },

  _formatarDiaTitulo(chave, { completo = false } = {}) {
    const data = this._dataDeChave(chave);
    return data.toLocaleDateString('pt-BR', completo
      ? { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }
      : { weekday: 'short', day: '2-digit', month: '2-digit' }
    );
  },

  _formatarChaveData(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  },

  _dataDeChave(chave) {
    const [ano, mes, dia] = String(chave).split('-').map(Number);
    return new Date(ano, (mes || 1) - 1, dia || 1);
  },

  _formatarHora(valor) {
    try {
      return new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  },
};
