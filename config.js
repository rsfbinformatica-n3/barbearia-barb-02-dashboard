// config.js
// Único lugar para trocar a URL base da API (o workflow "BARB-02 - Dashboard API" no n8n).
// Se a dashboard for hospedada em outro domínio, ou o endereço do n8n mudar, é só editar aqui.

const CONFIG = {
  // Nome exibido na sidebar e na tela de login. Único lugar a trocar pra reutilizar
  // esta mesma dashboard em outra barbearia (junto com API_BASE_URL abaixo).
  NOME_BARBEARIA: 'Hermoso Bigote',

  // Domínio público do n8n (Cloudflare Tunnel), sem barra no final.
  API_BASE_URL: 'https://barbearia.rsfbinformatica.com.br',

  // Caminhos dos 6 endpoints do workflow "BARB-02 - Dashboard API".
  ENDPOINTS: {
    AGENDAMENTOS: '/webhook/dashboard-agendamentos',
    CONVERSAS: '/webhook/dashboard-conversas',
    MENSAGENS: '/webhook/dashboard-mensagens',
    TAKEOVER: '/webhook/dashboard-takeover',
    ENVIAR_MENSAGEM: '/webhook/dashboard-enviar-mensagem',
    ATUALIZAR_AGENDAMENTO: '/webhook/dashboard-atualizar-agendamento',
    RELATORIO: '/webhook/dashboard-relatorio',
  },

  // Intervalos de polling, em milissegundos.
  POLL_INTERVAL_LISTAS_MS: 18000, // Kanban e lista de conversas
  POLL_INTERVAL_CHAT_MS: 5000,    // thread de mensagens, só enquanto o chat estiver aberto

  // Chave usada no sessionStorage para guardar o header "Authorization: Basic ...".
  AUTH_STORAGE_KEY: 'barb02_dashboard_auth',
};
