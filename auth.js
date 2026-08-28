// auth.js
// Login/logout e guarda do header "Authorization: Basic ..." em sessionStorage.
//
// IMPORTANTE: usamos sessionStorage (nunca localStorage) de propósito — o header some
// assim que a aba é fechada, então não fica uma senha guardada indefinidamente no navegador
// de um computador compartilhado da barbearia.

const Auth = {
  /**
   * Devolve o header "Basic xxxxx" salvo, ou null se não houver login ativo.
   */
  getAuthHeader() {
    return sessionStorage.getItem(CONFIG.AUTH_STORAGE_KEY);
  },

  isLoggedIn() {
    return !!this.getAuthHeader();
  },

  /**
   * Tenta logar: monta o header Basic Auth e valida contra a API de verdade
   * (busca a lista de agendamentos). Só grava no sessionStorage se a API aceitar.
   * Lança um erro com mensagem amigável em caso de falha.
   */
  async login(usuario, senha) {
    if (!usuario || !senha) {
      throw new Error('Preencha usuário e senha.');
    }

    const header = 'Basic ' + btoa(`${usuario}:${senha}`);

    let resp;
    try {
      resp = await fetch(CONFIG.API_BASE_URL + CONFIG.ENDPOINTS.AGENDAMENTOS, {
        method: 'GET',
        headers: { Authorization: header },
      });
    } catch (err) {
      throw new Error('Não consegui falar com o servidor. Verifique sua conexão e tente de novo.');
    }

    if (resp.status === 401) {
      throw new Error('Usuário ou senha incorretos.');
    }
    if (!resp.ok) {
      throw new Error(`O servidor respondeu com erro (${resp.status}). Tente novamente em instantes.`);
    }

    sessionStorage.setItem(CONFIG.AUTH_STORAGE_KEY, header);
    return true;
  },

  logout() {
    sessionStorage.removeItem(CONFIG.AUTH_STORAGE_KEY);
  },

  /**
   * Liga o formulário de login da tela inicial.
   * onSuccess é chamado depois de um login válido.
   */
  initLoginForm({ formEl, usuarioEl, senhaEl, erroEl, botaoEl }, onSuccess) {
    formEl.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      erroEl.textContent = '';
      erroEl.hidden = true;
      botaoEl.disabled = true;
      const textoOriginal = botaoEl.textContent;
      botaoEl.textContent = 'Entrando...';

      try {
        await this.login(usuarioEl.value.trim(), senhaEl.value);
        senhaEl.value = '';
        onSuccess();
      } catch (err) {
        erroEl.textContent = err.message || 'Não foi possível entrar.';
        erroEl.hidden = false;
      } finally {
        botaoEl.disabled = false;
        botaoEl.textContent = textoOriginal;
      }
    });
  },
};
