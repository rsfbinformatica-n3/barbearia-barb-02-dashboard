// ui.js
// Camada visual compartilhada: ícones SVG inline, toasts, modal de confirmação,
// avatar por iniciais e o helper de escape usado por todos os outros módulos.
// Não depende de nenhuma biblioteca externa.

const UI = {
  // ---------- Ícones (SVG inline, estilo "outline", herdam a cor via currentColor) ----------
  ICONS: {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    message: '<path d="M21 12a8 8 0 0 1-11.6 7.15L4 21l1.85-5.4A8 8 0 1 1 21 12Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4.2 5-6 8-6s6.5 1.8 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1.1-3.4 3.6-5 6.5-5s5.4 1.6 6.5 5"/><circle cx="17.5" cy="9" r="2.7"/><path d="M15.5 15.2c2.2.4 3.8 1.8 4.7 4.8"/>',
    phone: '<path d="M6.5 3h3l1.5 4.5-2.3 1.6a13 13 0 0 0 6.2 6.2l1.6-2.3L21 14.5v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z"/>',
    scissors: '<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.3 7.8 20 20"/><path d="M20 4 8.3 16.2"/>',
    send: '<path d="M21 3 3 10.5l7.2 2.6L13 20.5 21 3Z"/><path d="M10.2 13.1 21 3"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1.3"/><circle cx="9" cy="14" r="1.3"/><circle cx="15" cy="14" r="1.3"/><path d="M9 18h6"/>',
    headset: '<path d="M4 13a8 8 0 0 1 16 0"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M20 19v.5A3.5 3.5 0 0 1 16.5 23H13"/>',
    play: '<path d="M7 4.5v15l13-7.5-13-7.5Z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M15 16l5-4-5-4"/><path d="M20 12H9"/>',
    menu: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
    back: '<path d="M15 5 8 12l7 7"/>',
    inbox: '<path d="M4 12h4l2 3h4l2-3h4"/><path d="M5.5 5h13l2.5 7v7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19v-7l2.5-7Z"/>',
    chart: '<path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/><path d="M3 20h18"/>',
    chevronLeft: '<path d="M15 6 9 12l6 6"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
  },

  icon(name, cls) {
    const body = this.ICONS[name] || this.ICONS.x;
    return `<svg class="icone ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  },

  // ---------- Escape de texto (evita XSS ao injetar dado do servidor via innerHTML) ----------
  escapar(texto) {
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  },

  // ---------- Iniciais pra avatar ----------
  iniciais(nome) {
    if (!nome) return '?';
    const partes = String(nome).trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  },

  // ---------- Toasts ----------
  _toastContainer() {
    let el = document.getElementById('toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-container';
      el.className = 'toast-container';
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  },

  toast(mensagem, tipo) {
    const tipoFinal = tipo || 'info';
    const container = this._toastContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${tipoFinal}`;
    const iconeNome = tipoFinal === 'success' ? 'check' : tipoFinal === 'error' ? 'x' : 'message';
    el.innerHTML = `${this.icon(iconeNome, 'toast-icone')}<span class="toast-texto"></span>`;
    el.querySelector('.toast-texto').textContent = mensagem;
    container.appendChild(el);

    requestAnimationFrame(() => el.classList.add('toast-visivel'));

    const remover = () => {
      el.classList.remove('toast-visivel');
      setTimeout(() => el.remove(), 220);
    };
    setTimeout(remover, 3800);
    el.addEventListener('click', remover);
  },

  // ---------- Modal de confirmação ----------
  // UI.confirmar({titulo, mensagem, confirmarTexto, cancelarTexto, perigo}) -> Promise<boolean>
  confirmar({ titulo, mensagem, confirmarTexto = 'Confirmar', cancelarTexto = 'Voltar', perigo = false } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-caixa" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
          <h3 id="modal-titulo">${this.escapar(titulo || 'Confirmar ação')}</h3>
          <p>${this.escapar(mensagem || '')}</p>
          <div class="modal-acoes">
            <button type="button" class="botao-secundario" data-acao="cancelar">${this.escapar(cancelarTexto)}</button>
            <button type="button" class="${perigo ? 'botao-perigo' : 'botao-primario'}" data-acao="confirmar">${this.escapar(confirmarTexto)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('modal-visivel'));

      const encerrar = (resultado) => {
        overlay.classList.remove('modal-visivel');
        document.removeEventListener('keydown', onKeyDown);
        setTimeout(() => overlay.remove(), 180);
        resolve(resultado);
      };

      const onKeyDown = (ev) => {
        if (ev.key === 'Escape') encerrar(false);
      };
      document.addEventListener('keydown', onKeyDown);

      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) encerrar(false);
      });
      overlay.querySelector('[data-acao="cancelar"]').addEventListener('click', () => encerrar(false));
      overlay.querySelector('[data-acao="confirmar"]').addEventListener('click', () => encerrar(true));
      overlay.querySelector('[data-acao="confirmar"]').focus();
    });
  },
};
