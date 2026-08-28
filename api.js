// api.js
// Wrapper único de fetch para os 6 endpoints do workflow "BARB-02 - Dashboard API".
// Centraliza: header de autenticação, tratamento de 401 (sessão inválida -> volta pro login)
// e 409 (conflito -> avisa a tela e deixa quem chamou decidir re-buscar).

const Api = {
  // Preenchidos pelo bootstrap da página (ver index.html).
  onUnauthorized: () => {},
  onConflict: (mensagem) => {
    UI.toast(mensagem, 'error');
  },

  async _request(path, { method = 'GET', body, query } = {}) {
    const authHeader = Auth.getAuthHeader();
    if (!authHeader) {
      this.onUnauthorized();
      throw new Error('Sessão não iniciada.');
    }

    let url = CONFIG.API_BASE_URL + path;
    if (query) {
      const params = new URLSearchParams(query);
      url += '?' + params.toString();
    }

    const headers = { Authorization: authHeader };
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let resp;
    try {
      resp = await fetch(url, { method, headers, body: payload });
    } catch (err) {
      throw new Error('Não consegui falar com o servidor. Verifique sua conexão.');
    }

    if (resp.status === 401) {
      Auth.logout();
      this.onUnauthorized();
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (resp.status === 409) {
      let msg = 'Este item foi atualizado por outra pessoa. Atualizando a lista...';
      try {
        const data = await resp.json();
        if (data && data.erro) msg = data.erro;
      } catch (_) {
        // resposta 409 sem corpo JSON — usa a mensagem padrão
      }
      this.onConflict(msg);
      const err = new Error(msg);
      err.isConflict = true;
      throw err;
    }

    if (!resp.ok) {
      let msg = `O servidor respondeu com erro (${resp.status}).`;
      try {
        const data = await resp.json();
        if (data && data.erro) msg = data.erro;
      } catch (_) {
        // sem corpo JSON, mantém a mensagem padrão
      }
      throw new Error(msg);
    }

    // Respostas sem corpo (ex.: alguns 200 simples) não quebram o parse.
    const texto = await resp.text();
    if (!texto) return null;
    try {
      return JSON.parse(texto);
    } catch (_) {
      return texto;
    }
  },

  // --- Os 6 endpoints ---

  getAgendamentos() {
    return this._request(CONFIG.ENDPOINTS.AGENDAMENTOS);
  },

  getConversas() {
    return this._request(CONFIG.ENDPOINTS.CONVERSAS);
  },

  getMensagens(clienteId) {
    return this._request(CONFIG.ENDPOINTS.MENSAGENS, { query: { cliente_id: clienteId } });
  },

  setTakeover(clienteId, ativar) {
    return this._request(CONFIG.ENDPOINTS.TAKEOVER, {
      method: 'POST',
      body: { cliente_id: clienteId, ativar },
    });
  },

  enviarMensagem({ clienteId, telefone, mensagem }) {
    return this._request(CONFIG.ENDPOINTS.ENVIAR_MENSAGEM, {
      method: 'POST',
      body: { cliente_id: clienteId, telefone, mensagem },
    });
  },

  atualizarAgendamento({ agendamentoId, novoStatus }) {
    return this._request(CONFIG.ENDPOINTS.ATUALIZAR_AGENDAMENTO, {
      method: 'POST',
      body: { agendamento_id: agendamentoId, novo_status: novoStatus },
    });
  },

  // mes no formato "AAAA-MM". Endpoint ainda pendente do lado do n8n — ver README, seção 3.1.
  getRelatorio(mes) {
    return this._request(CONFIG.ENDPOINTS.RELATORIO, { query: { mes } });
  },
};
