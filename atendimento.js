// atendimento.js
// Aba "Atendimento": lista de clientes (com preview da última mensagem e status IA/Humano)
// + painel de chat com um controle bem visível pra assumir/devolver a conversa e responder
// manualmente sem sair da dashboard. A lógica de dados (polling, takeover, envio, Api.*) é a
// mesma de antes — esta revisão troca a camada visual e reorganiza onde o controle vive.

const Atendimento = {
  _listaEl: null,
  _chatEl: null,
  _buscaEl: null,
  _layoutEl: null,
  _pollListaTimer: null,
  _pollChatTimer: null,
  _conversas: [],
  _termoBusca: '',
  _clienteSelecionadoId: null,
  _carregouUmaVez: false,

  init({ listaEl, chatEl, buscaEl, layoutEl }) {
    this._listaEl = listaEl;
    this._chatEl = chatEl;
    this._buscaEl = buscaEl;
    this._layoutEl = layoutEl || document.getElementById('atendimento-layout');
    this._carregouUmaVez = false;
    this._renderChatVazio();
    this._renderSkeletonLista();

    if (this._buscaEl) {
      this._buscaEl.addEventListener('input', () => {
        this._termoBusca = this._buscaEl.value.trim().toLowerCase();
        this._renderLista();
      });
    }
  },

  start() {
    this.refreshLista();
    this._pararPollLista();
    this._pollListaTimer = setInterval(() => this.refreshLista(), CONFIG.POLL_INTERVAL_LISTAS_MS);
  },

  stop() {
    this._pararPollLista();
    this._pararPollChat();
  },

  _pararPollLista() {
    if (this._pollListaTimer) clearInterval(this._pollListaTimer);
    this._pollListaTimer = null;
  },

  _pararPollChat() {
    if (this._pollChatTimer) clearInterval(this._pollChatTimer);
    this._pollChatTimer = null;
  },

  async refreshLista() {
    try {
      const dados = await Api.getConversas();
      this._conversas = Array.isArray(dados) ? dados : [];
      this._carregouUmaVez = true;
      this._renderLista();
      // Se a conversa aberta mudou de estado (ex.: outra pessoa assumiu), atualiza o cabeçalho do chat.
      if (this._clienteSelecionadoId != null) this._atualizarCabecalhoChat();
    } catch (err) {
      if (!err.isConflict) console.error('Erro ao buscar conversas:', err);
    }
  },

  _renderSkeletonLista() {
    this._listaEl.innerHTML = '<div class="skeleton skeleton-item"></div><div class="skeleton skeleton-item"></div><div class="skeleton skeleton-item"></div>';
  },

  _listaFiltrada() {
    if (!this._termoBusca) return this._conversas;
    return this._conversas.filter((c) => {
      const alvo = `${c.nome || ''} ${c.telefone || ''}`.toLowerCase();
      return alvo.includes(this._termoBusca);
    });
  },

  _renderLista() {
    this._listaEl.innerHTML = '';
    const itens = this._listaFiltrada();

    if (itens.length === 0) {
      const vazio = document.createElement('div');
      vazio.className = 'atendimento-lista-vazia';
      const semResultado = this._termoBusca && this._conversas.length > 0;
      vazio.innerHTML = `${UI.icon('inbox')}<span>${semResultado ? 'Nenhuma conversa encontrada.' : 'Nenhum cliente ainda.'}</span>`;
      this._listaEl.appendChild(vazio);
      return;
    }

    itens.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'atendimento-item';
      if (c.cliente_id === this._clienteSelecionadoId) {
        item.classList.add('atendimento-item-selecionado');
      }

      const preview = c.ultima_mensagem
        ? this._truncar(c.ultima_mensagem, 52)
        : 'Sem mensagens ainda';
      const prefixoRole = c.ultima_role === 'humano' ? 'Você: ' : c.ultima_role === 'assistant' ? 'IA: ' : '';
      const humano = c.atendimento_manual === true;

      item.innerHTML = `
        <span class="avatar">${UI.escapar(UI.iniciais(c.nome || c.telefone))}</span>
        <div class="atendimento-item-corpo">
          <div class="atendimento-item-topo">
            <span class="atendimento-item-nome">${UI.escapar(c.nome || c.telefone || 'Cliente')}</span>
            <span class="atendimento-item-hora">${this._formatarHora(c.ultima_em)}</span>
          </div>
          <div class="atendimento-item-preview">${UI.escapar(prefixoRole)}${UI.escapar(preview)}</div>
          <span class="selo ${humano ? 'selo-humano' : 'selo-ia'}"><span class="selo-dot"></span>${humano ? 'HUMANO' : 'IA'}</span>
        </div>
      `;

      item.addEventListener('click', () => this._selecionarCliente(c));
      this._listaEl.appendChild(item);
    });
  },

  async _alternarTakeover(cliente, ativar, botaoEl) {
    if (botaoEl) botaoEl.disabled = true;
    try {
      await Api.setTakeover(cliente.cliente_id, ativar);
      cliente.atendimento_manual = ativar;
      const registro = this._conversas.find((c) => c.cliente_id === cliente.cliente_id);
      if (registro) registro.atendimento_manual = ativar;
      UI.toast(ativar ? 'Conversa assumida.' : 'IA reativada.', 'success');
      this._renderLista();
      this._atualizarCabecalhoChat();
    } catch (err) {
      if (!err.isConflict) UI.toast('Não consegui atualizar o atendimento manual.', 'error');
    } finally {
      if (botaoEl) botaoEl.disabled = false;
    }
  },

  _selecionarCliente(cliente) {
    this._clienteSelecionadoId = cliente.cliente_id;
    this._renderLista();
    this._abrirChat(cliente);
    if (this._layoutEl) this._layoutEl.classList.add('mostrar-chat');
  },

  _voltarParaLista() {
    if (this._layoutEl) this._layoutEl.classList.remove('mostrar-chat');
  },

  async _abrirChat(cliente) {
    this._pararPollChat();
    this._renderChatCarregando(cliente);

    try {
      const mensagens = await Api.getMensagens(cliente.cliente_id);
      this._renderChat(cliente, Array.isArray(mensagens) ? mensagens : [], true);
    } catch (err) {
      if (!err.isConflict) console.error('Erro ao buscar mensagens:', err);
      // Mesmo se a busca de mensagens falhar (rede instável, erro passageiro no
      // backend etc.), garante que o formulário volte a aparecer — sem isso a
      // tela ficava travada no esqueleto de carregamento e a pessoa não conseguia
      // mais digitar nem enviar nada.
      if (this._clienteSelecionadoId === cliente.cliente_id) {
        this._renderChat(cliente, [], true);
        UI.toast('Não consegui atualizar as mensagens. Tente novamente.', 'error');
      }
    }

    // No polling seguinte, atualiza só a lista de mensagens (nunca o formulário/textarea),
    // pra não apagar o que a pessoa está digitando a cada ciclo.
    this._pollChatTimer = setInterval(async () => {
      try {
        const mensagens = await Api.getMensagens(cliente.cliente_id);
        this._atualizarMensagens(cliente, Array.isArray(mensagens) ? mensagens : []);
      } catch (err) {
        if (!err.isConflict) console.error('Erro ao buscar mensagens:', err);
      }
    }, CONFIG.POLL_INTERVAL_CHAT_MS);
  },

  // Atualiza só as bolhas de mensagem e o cabeçalho de controle, preservando o formulário
  // (textarea) intocado — usado pelo polling periódico do chat aberto.
  _atualizarMensagens(cliente, mensagens) {
    if (this._clienteSelecionadoId !== cliente.cliente_id) return;
    const mensagensEl = this._chatEl.querySelector('.chat-mensagens');
    if (!mensagensEl) return;

    const pertoDoFinal = mensagensEl.scrollHeight - mensagensEl.scrollTop - mensagensEl.clientHeight < 80;

    mensagensEl.innerHTML = '';
    if (mensagens.length === 0) {
      mensagensEl.innerHTML = '<div class="chat-mensagens-vazio">Nenhuma mensagem ainda.</div>';
    } else {
      mensagens.forEach((m) => mensagensEl.appendChild(this._criarBolha(m)));
    }

    if (pertoDoFinal) mensagensEl.scrollTop = mensagensEl.scrollHeight;

    this._atualizarCabecalhoChat();
  },

  _clienteAtual() {
    return this._conversas.find((c) => c.cliente_id === this._clienteSelecionadoId) || null;
  },

  // Atualiza só o bloco de estado/controle do cabeçalho (sem re-renderizar as mensagens),
  // usado quando o polling da lista traz uma mudança de estado da conversa aberta.
  _atualizarCabecalhoChat() {
    const bloco = this._chatEl.querySelector('.controle-atendimento');
    const cliente = this._clienteAtual();
    if (!bloco || !cliente) return;
    bloco.outerHTML = this._marcacaoControle(cliente);
    this._ligarControle(cliente);
  },

  _marcacaoControle(cliente) {
    const humano = cliente.atendimento_manual === true;
    if (humano) {
      return `
        <div class="controle-atendimento">
          <span class="controle-estado controle-estado-humano"><span class="selo-dot" style="background:var(--danger)"></span>ATENDIMENTO HUMANO</span>
          <button type="button" class="botao-controle botao-devolver" data-acao="devolver">${UI.icon('play')}DEVOLVER PARA IA</button>
        </div>
      `;
    }
    return `
      <div class="controle-atendimento">
        <span class="controle-estado controle-estado-ia"><span class="selo-dot" style="background:var(--text-secondary)"></span>IA ATIVA</span>
        <button type="button" class="botao-controle botao-assumir" data-acao="assumir">${UI.icon('headset')}ASSUMIR CONVERSA</button>
      </div>
    `;
  },

  _ligarControle(cliente) {
    const botao = this._chatEl.querySelector('.botao-controle');
    if (!botao) return;
    botao.addEventListener('click', () => {
      const ativar = botao.dataset.acao === 'assumir';
      this._alternarTakeover(cliente, ativar, botao);
    });
  },

  _renderChatVazio() {
    this._chatEl.innerHTML = `
      <div class="chat-vazio">
        ${UI.icon('message')}
        <strong>Selecione uma conversa</strong>
        <span>Escolha um cliente ao lado para visualizar o atendimento.</span>
      </div>
    `;
  },

  _renderChatCarregando(cliente) {
    this._chatEl.innerHTML = `
      <div class="chat-cabecalho">
        <button type="button" class="chat-voltar-mobile" aria-label="Voltar para a lista">${UI.icon('back')}</button>
        <span class="avatar">${UI.escapar(UI.iniciais(cliente.nome || cliente.telefone))}</span>
        <div class="chat-cabecalho-info">
          <div class="chat-cabecalho-nome">${UI.escapar(cliente.nome || cliente.telefone || 'Cliente')}</div>
          <div class="chat-cabecalho-telefone">${UI.escapar(cliente.telefone || '')}</div>
        </div>
      </div>
      <div class="chat-mensagens">
        <div class="skeleton skeleton-linha" style="width:60%;height:36px;border-radius:12px;align-self:flex-start;"></div>
        <div class="skeleton skeleton-linha" style="width:45%;height:36px;border-radius:12px;align-self:flex-end;"></div>
        <div class="skeleton skeleton-linha" style="width:55%;height:36px;border-radius:12px;align-self:flex-start;"></div>
      </div>
    `;
    this._chatEl.querySelector('.chat-voltar-mobile').addEventListener('click', () => this._voltarParaLista());
  },

  _renderChat(cliente, mensagens, manterScrollEmbaixo) {
    // Se o cliente selecionado mudou enquanto a busca estava em andamento, ignora este resultado.
    if (this._clienteSelecionadoId !== cliente.cliente_id) return;

    const mensagensAntigasEl = this._chatEl.querySelector('.chat-mensagens');
    const pertoDoFinal = !mensagensAntigasEl
      || mensagensAntigasEl.scrollHeight - mensagensAntigasEl.scrollTop - mensagensAntigasEl.clientHeight < 80;

    const humano = cliente.atendimento_manual === true;

    this._chatEl.innerHTML = `
      <div class="chat-cabecalho">
        <button type="button" class="chat-voltar-mobile" aria-label="Voltar para a lista">${UI.icon('back')}</button>
        <span class="avatar">${UI.escapar(UI.iniciais(cliente.nome || cliente.telefone))}</span>
        <div class="chat-cabecalho-info">
          <div class="chat-cabecalho-nome">${UI.escapar(cliente.nome || cliente.telefone || 'Cliente')}</div>
          <div class="chat-cabecalho-telefone">${UI.escapar(cliente.telefone || '')}</div>
        </div>
        ${this._marcacaoControle(cliente)}
      </div>
      ${!humano ? '<div class="chat-dica">Ao responder, você assumirá esta conversa.</div>' : ''}
      <div class="chat-mensagens"></div>
      <div class="chat-form-wrap">
        <form class="chat-form">
          <textarea class="chat-input" placeholder="Digite uma mensagem..." rows="1"></textarea>
          <button type="submit" class="chat-enviar" aria-label="Enviar mensagem">${UI.icon('send')}</button>
        </form>
      </div>
    `;

    this._chatEl.querySelector('.chat-voltar-mobile').addEventListener('click', () => this._voltarParaLista());
    this._ligarControle(cliente);

    const mensagensEl = this._chatEl.querySelector('.chat-mensagens');
    if (mensagens.length === 0) {
      mensagensEl.innerHTML = '<div class="chat-mensagens-vazio">Nenhuma mensagem ainda.</div>';
    } else {
      mensagens.forEach((m) => mensagensEl.appendChild(this._criarBolha(m)));
    }

    if (manterScrollEmbaixo || pertoDoFinal) {
      mensagensEl.scrollTop = mensagensEl.scrollHeight;
    }

    const form = this._chatEl.querySelector('.chat-form');
    const input = this._chatEl.querySelector('.chat-input');
    const botao = this._chatEl.querySelector('.chat-enviar');

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const texto = input.value.trim();
      if (!texto) return;

      const textoOriginal = input.value;
      botao.disabled = true;
      input.disabled = true;
      try {
        await Api.enviarMensagem({
          clienteId: cliente.cliente_id,
          telefone: cliente.telefone,
          mensagem: texto,
        });

        // Só limpa depois que o backend confirmou. Em falha, o catch restaura o texto.
        input.value = '';
        cliente.atendimento_manual = true;
        const registro = this._conversas.find((c) => c.cliente_id === cliente.cliente_id);
        if (registro) {
          registro.atendimento_manual = true;
          registro.ultima_role = 'humano';
          registro.ultima_mensagem = texto;
          registro.ultima_em = new Date().toISOString();
        }

        // Feedback visual imediato: evita a sensação de que a mensagem "sumiu" enquanto
        // o polling/GET mensagens ainda não voltou do servidor.
        const mensagensEl = this._chatEl.querySelector('.chat-mensagens');
        if (mensagensEl) {
          const vazio = mensagensEl.querySelector('.chat-mensagens-vazio');
          if (vazio) vazio.remove();
          mensagensEl.appendChild(this._criarBolha({ role: 'humano', mensagem: texto, created_at: new Date().toISOString() }));
          mensagensEl.scrollTop = mensagensEl.scrollHeight;
        }

        UI.toast('Mensagem enviada.', 'success');
        this._renderLista();

        // Revalida com o estado real do banco sem destruir o formulário/textarea.
        try {
          const mensagens = await Api.getMensagens(cliente.cliente_id);
          this._atualizarMensagens(cliente, Array.isArray(mensagens) ? mensagens : []);
        } catch (refreshErr) {
          console.error('Mensagem enviada, mas não consegui atualizar o histórico:', refreshErr);
        }
        this.refreshLista();
      } catch (err) {
        // Se a API falhar, não perde o que a pessoa digitou.
        input.value = textoOriginal;
        if (!err.isConflict) UI.toast('Não consegui enviar a mensagem. O texto foi mantido para tentar de novo.', 'error');
      } finally {
        botao.disabled = false;
        input.disabled = false;
        input.focus();
      }
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        form.requestSubmit();
      }
    });
  },

  _criarBolha(mensagem) {
    const bolha = document.createElement('div');
    const role = mensagem.role === 'user' ? 'cliente' : mensagem.role === 'humano' ? 'humano' : 'ia';
    bolha.className = `chat-bolha chat-bolha-${role}`;

    const rotulo = role === 'ia' ? 'IA' : role === 'humano' ? 'Equipe' : '';
    const hora = this._formatarHora(mensagem.created_at);
    bolha.innerHTML = `
      ${rotulo ? `<div class="chat-bolha-remetente">${rotulo}</div>` : ''}
      <div class="chat-bolha-texto">${UI.escapar(mensagem.mensagem || '')}</div>
      <div class="chat-bolha-hora">${hora}</div>
    `;
    return bolha;
  },

  _formatarHora(dataStr) {
    if (!dataStr) return '';
    try {
      return new Date(dataStr).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '';
    }
  },

  _truncar(texto, max) {
    if (!texto) return '';
    return texto.length > max ? texto.slice(0, max - 1) + '…' : texto;
  },
};
