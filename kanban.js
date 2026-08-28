// kanban.js
// Kanban de agendamentos: 3 colunas (Agendado, Cancelado, Concluído), drag-and-drop nativo
// (HTML5, sem lib externa). Só é possível arrastar um card de "Agendado" para "Cancelado" ou
// "Concluído" — as outras colunas são estados finais e os cards lá não ficam arrastáveis.
// A lógica de dados (polling, chamadas Api.*, atualização otimista) é a mesma de antes —
// esta revisão troca só a camada visual (cards, cabeçalhos, confirmação e feedback).

const Kanban = {
  _pollTimer: null,
  _boardEl: null,
  _agendamentos: [],
  _draggingId: null,
  _carregouUmaVez: false,

  COLUNAS: [
    { status: 'agendado', label: 'Agendados', icone: 'calendar', dica: null,
      vazio: { titulo: 'Nenhum agendamento aqui', texto: 'Os próximos horários aparecem aqui.' } },
    { status: 'cancelado', label: 'Cancelados', icone: 'x', dica: 'Solte aqui para cancelar',
      vazio: { titulo: 'Nenhum cancelamento', texto: 'Os agendamentos cancelados aparecem aqui.' } },
    { status: 'concluido', label: 'Concluídos', icone: 'check', dica: 'Solte aqui para concluir',
      vazio: { titulo: 'Nenhum atendimento concluído', texto: 'Os atendimentos concluídos aparecem aqui.' } },
  ],

  init(boardEl) {
    this._boardEl = boardEl;
    this._boardEl.innerHTML = '';
    this._carregouUmaVez = false;

    this.COLUNAS.forEach((col) => {
      const colEl = document.createElement('div');
      colEl.className = 'kanban-coluna';
      colEl.dataset.status = col.status;
      colEl.innerHTML = `
        <h3 class="kanban-coluna-titulo">
          <span class="kanban-coluna-dot"></span>
          <span class="kanban-coluna-titulo-texto">${UI.escapar(col.label)}</span>
          <span class="kanban-contador" data-contador="${col.status}">0</span>
        </h3>
        <div class="kanban-coluna-cards" data-cards="${col.status}" data-dica="${col.dica || ''}"></div>
      `;

      // Só as colunas de destino final aceitam drop (agendado é sempre origem, nunca destino).
      if (col.status !== 'agendado') {
        const cardsEl = colEl.querySelector('.kanban-coluna-cards');
        cardsEl.addEventListener('dragover', (ev) => this._onDragOver(ev));
        cardsEl.addEventListener('dragleave', (ev) => this._onDragLeave(ev));
        cardsEl.addEventListener('drop', (ev) => this._onDrop(ev, col.status));
      }

      this._boardEl.appendChild(colEl);
    });

    this._renderSkeleton();
  },

  start() {
    this.refresh();
    this.stop();
    this._pollTimer = setInterval(() => this.refresh(), CONFIG.POLL_INTERVAL_LISTAS_MS);
  },

  stop() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = null;
  },

  async refresh() {
    try {
      const dados = await Api.getAgendamentos();
      this._agendamentos = Array.isArray(dados) ? dados : [];
      this._carregouUmaVez = true;
      this._render();
    } catch (err) {
      if (!err.isConflict) console.error('Erro ao buscar agendamentos:', err);
    }
  },

  _renderSkeleton() {
    this.COLUNAS.forEach((col) => {
      const cardsEl = this._boardEl.querySelector(`[data-cards="${col.status}"]`);
      cardsEl.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';
    });
  },

  _render() {
    this.COLUNAS.forEach((col) => {
      const cardsEl = this._boardEl.querySelector(`[data-cards="${col.status}"]`);
      const contadorEl = this._boardEl.querySelector(`[data-contador="${col.status}"]`);
      const itens = this._agendamentos.filter((a) => a.status === col.status);

      contadorEl.textContent = String(itens.length);
      cardsEl.innerHTML = '';

      itens
        .slice()
        .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
        .forEach((ag) => cardsEl.appendChild(this._criarCard(ag)));

      if (itens.length === 0) {
        cardsEl.appendChild(this._criarVazio(col.vazio));
      }
    });
  },

  _criarVazio({ titulo, texto }) {
    const vazio = document.createElement('div');
    vazio.className = 'kanban-coluna-vazia';
    vazio.innerHTML = `${UI.icon('inbox')}<strong>${UI.escapar(titulo)}</strong><span>${UI.escapar(texto)}</span>`;
    return vazio;
  },

  _criarCard(ag) {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    const arrastavel = ag.status === 'agendado';
    card.draggable = arrastavel;
    if (arrastavel) card.classList.add('kanban-card-arrastavel');

    const horario = this._formatarHorario(ag.inicio, ag.fim);
    card.innerHTML = `
      <div class="kanban-card-horario">${UI.icon('clock')}${horario}</div>
      <div class="kanban-card-cliente">${UI.escapar(ag.cliente_nome || 'Cliente sem nome')}</div>
      ${ag.servico_nome ? `<div class="kanban-card-detalhe">${UI.icon('scissors')}${UI.escapar(ag.servico_nome)}</div>` : ''}
      ${ag.barbeiro_nome ? `<div class="kanban-card-detalhe">${UI.icon('user')}${UI.escapar(ag.barbeiro_nome)}</div>` : ''}
      ${ag.cliente_telefone ? `<div class="kanban-card-detalhe">${UI.icon('phone')}${UI.escapar(ag.cliente_telefone)}</div>` : ''}
      ${arrastavel ? `
        <div class="kanban-card-acoes">
          <button type="button" class="kanban-acao-botao kanban-acao-cancelar" data-acao="cancelado">${UI.icon('x', 'icone-sm')}Cancelar</button>
          <button type="button" class="kanban-acao-botao kanban-acao-concluir" data-acao="concluido">${UI.icon('check', 'icone-sm')}Concluir</button>
        </div>
      ` : ''}
    `;

    if (arrastavel) {
      card.addEventListener('dragstart', (ev) => {
        this._draggingId = ag.id;
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', String(ag.id));
        card.classList.add('kanban-card-arrastando');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('kanban-card-arrastando');
        this._draggingId = null;
      });

      // Botões de ação: caminho alternativo ao arrastar-e-soltar. O drag nativo HTML5 não
      // funciona em telas de toque (celular/tablet) — sem isso, quem só tem celular não
      // conseguia cancelar nem concluir um agendamento pela dashboard.
      card.querySelectorAll('.kanban-acao-botao').forEach((botao) => {
        botao.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._mudarStatus(ag, botao.dataset.acao);
        });
      });
    }

    return card;
  },

  _onDragOver(ev) {
    if (this._draggingId == null) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    ev.currentTarget.classList.add('kanban-coluna-cards-recebendo');
  },

  _onDragLeave(ev) {
    ev.currentTarget.classList.remove('kanban-coluna-cards-recebendo');
  },

  async _onDrop(ev, statusDestino) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('kanban-coluna-cards-recebendo');

    const agendamentoId = this._draggingId;
    this._draggingId = null;
    if (agendamentoId == null) return;

    const agendamento = this._agendamentos.find((a) => a.id === agendamentoId);
    if (!agendamento || agendamento.status !== 'agendado') return;

    await this._mudarStatus(agendamento, statusDestino);
  },

  // Muda o status de um agendamento (agendado -> cancelado/concluido). Usado tanto pelo
  // drop do drag-and-drop (desktop) quanto pelos botões de ação de cada card (funcionam
  // em qualquer dispositivo, incluindo celular, onde o drag nativo HTML5 não funciona).
  async _mudarStatus(agendamento, statusDestino) {
    if (!agendamento || agendamento.status !== 'agendado') return;

    // Um agendamento já em processamento não pode receber uma segunda ação em cima —
    // evita clique duplo (ou um toque que chega bem na hora em que a lista está se
    // reordenando) disparar a chamada duas vezes ou parecer "ter ido pro card errado".
    if (this._processando && this._processando.has(agendamento.id)) return;

    // Sempre confirma antes de executar — tanto Cancelar quanto Concluir — mostrando o
    // nome do cliente e o horário exatos do agendamento em questão. Isso funciona como
    // uma segunda checagem: se o toque tiver "pego" o card errado (ex.: a lista se
    // reordenou logo depois de uma ação anterior e um toque seguinte acabou noutro
    // card), a pessoa vê o nome/horário errado no modal e pode cancelar a ação a tempo.
    const ehCancelamento = statusDestino === 'cancelado';
    const confirmou = await UI.confirmar({
      titulo: ehCancelamento ? 'Cancelar agendamento?' : 'Concluir agendamento?',
      mensagem: `Você está prestes a ${ehCancelamento ? 'cancelar' : 'marcar como concluído'} o horário de ${agendamento.cliente_nome || 'cliente'} às ${this._formatarHora(agendamento.inicio)}.`,
      confirmarTexto: ehCancelamento ? 'Cancelar agendamento' : 'Marcar como concluído',
      cancelarTexto: 'Voltar',
      perigo: ehCancelamento,
    });
    if (!confirmou) {
      this._render();
      return;
    }

    // Enquanto o modal estava aberto, esse mesmo agendamento pode ter sido alterado
    // (outra pessoa da equipe agiu nele, ou o polling trouxe um estado novo) — confere
    // de novo antes de mandar pro servidor.
    if (agendamento.status !== 'agendado') {
      UI.toast('Esse agendamento já foi atualizado por outra pessoa.', 'error');
      this.refresh();
      return;
    }

    const agendamentoId = agendamento.id;
    if (!this._processando) this._processando = new Set();
    this._processando.add(agendamentoId);

    // Atualização otimista: já mostra o card na coluna nova enquanto o servidor confirma.
    const statusAnterior = agendamento.status;
    agendamento.status = statusDestino;
    this._render();

    try {
      await Api.atualizarAgendamento({ agendamentoId, novoStatus: statusDestino });
      UI.toast(
        statusDestino === 'cancelado' ? 'Agendamento cancelado.' : 'Agendamento concluído.',
        'success'
      );
      // Confirma buscando de novo — evita ficar com dado otimista desalinhado do servidor.
      this.refresh();
    } catch (err) {
      // Erro (incluindo 409 — alguém já mudou esse agendamento): desfaz e busca o estado real.
      agendamento.status = statusAnterior;
      if (!err.isConflict) UI.toast('Não foi possível atualizar o agendamento.', 'error');
      this.refresh();
    } finally {
      this._processando.delete(agendamentoId);
    }
  },

  _formatarHorario(inicio, fim) {
    try {
      const dtInicio = new Date(inicio);
      const dtFim = new Date(fim);
      const dataStr = dtInicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const horaInicio = dtInicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const horaFim = dtFim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${dataStr} · ${horaInicio}–${horaFim}`;
    } catch (_) {
      return '';
    }
  },

  _formatarHora(dataStr) {
    try {
      return new Date(dataStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  },
};
