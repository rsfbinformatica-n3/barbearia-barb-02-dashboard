// overview.js
// Aba "Visão Geral": indicadores calculados em cima dos mesmos dados que o Kanban e o
// Atendimento já buscam (Api.getAgendamentos / Api.getConversas) — nenhum endpoint novo.

const Overview = {
  _containerEl: null,
  _pollTimer: null,
  _carregouUmaVez: false,

  CARTOES: [
    { chave: 'agendados', label: 'Agendados', icone: 'calendar', cor: 'dourado' },
    { chave: 'cancelados', label: 'Cancelados', icone: 'x', cor: 'vermelho' },
    { chave: 'concluidos', label: 'Concluídos', icone: 'check', cor: 'verde' },
    { chave: 'atendimentoHumano', label: 'Atendimento Humano', icone: 'headset', cor: 'neutro' },
  ],

  init(containerEl) {
    this._containerEl = containerEl;
    this._carregouUmaVez = false;
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
      const [agendamentos, conversas] = await Promise.all([Api.getAgendamentos(), Api.getConversas()]);
      const listaAg = Array.isArray(agendamentos) ? agendamentos : [];
      const listaConv = Array.isArray(conversas) ? conversas : [];

      const contagem = {
        agendados: listaAg.filter((a) => a.status === 'agendado').length,
        cancelados: listaAg.filter((a) => a.status === 'cancelado').length,
        concluidos: listaAg.filter((a) => a.status === 'concluido').length,
        atendimentoHumano: listaConv.filter((c) => c.atendimento_manual === true).length,
      };

      this._carregouUmaVez = true;
      this._render(contagem);
    } catch (err) {
      if (!err.isConflict) console.error('Erro ao buscar indicadores:', err);
    }
  },

  _renderSkeleton() {
    this._containerEl.innerHTML = this.CARTOES.map(
      () => `
        <div class="indicador-card">
          <div class="skeleton skeleton-linha" style="width:34px;height:34px;border-radius:8px;"></div>
          <div class="skeleton skeleton-linha" style="width:50%;height:28px;"></div>
          <div class="skeleton skeleton-linha" style="width:70%;"></div>
        </div>
      `
    ).join('');
  },

  _render(contagem) {
    this._containerEl.innerHTML = this.CARTOES.map((cartao) => {
      const valor = contagem[cartao.chave] ?? 0;
      return `
        <div class="indicador-card">
          <div class="indicador-topo">
            <span class="indicador-icone indicador-icone-${cartao.cor}">${UI.icon(cartao.icone)}</span>
          </div>
          <span class="indicador-valor">${valor}</span>
          <span class="indicador-label">${UI.escapar(cartao.label)}</span>
        </div>
      `;
    }).join('');
  },
};
