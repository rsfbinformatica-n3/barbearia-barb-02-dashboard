// relatorios.js
// Aba "Relatórios": faturamento e quantidade de atendimentos — por serviço, por barbeiro,
// por status, e a comparação mês a mês dos últimos 12 meses.
//
// Depende de um endpoint que AINDA PRECISA ser criado no n8n
// (GET /webhook/dashboard-relatorio?mes=AAAA-MM — ver README, seção 3.1) e de uma coluna
// nova (`servicos.valor`) preenchida com o preço de cada serviço. Enquanto isso não
// estiver pronto do lado do backend, esta aba mostra um aviso explicando o que falta, em
// vez de gráfico quebrado ou zerado sem explicação — assim já dá pra publicar o frontend
// sem esperar o backend, e o dia que o endpoint existir a aba liga sozinha.
//
// Sem polling: um relatório não muda segundo a segundo como o Kanban/Atendimento — só
// recarrega quando a aba é aberta ou o mês é trocado.

const Relatorios = {
  _containerEl: null,
  _mesSelecionado: null, // "AAAA-MM" — mês dos 3 recortes (porServico/porBarbeiro/porStatus)
  _dados: null,
  _metricaServico: 'quantidade', // 'quantidade' | 'faturamento'
  _metricaBarbeiro: 'quantidade',
  _metricaMes: 'faturamento', // métrica do gráfico de comparação mensal
  _graficos: {}, // instâncias Chart.js vivas, indexadas por id do canvas — destruídas antes de redesenhar
  _carregouUmaVez: false,

  // Paleta categórica validada (skill dataviz) pro fundo escuro desta dashboard: os 3
  // primeiros slots passam a checagem "all-pairs" (todo par, não só vizinhos — importante
  // num gráfico de pizza, onde qualquer fatia pode ficar ao lado de qualquer outra).
  // Além de 3 itens, o resto entra em "Outros" (cinza neutro) em vez de gerar uma 4ª cor.
  // Tons mais vivos e contrastados (aprovados em QA visual Ricardo/RSFB).
  PALETA: ['#4a9af5', '#f0773f', '#1fbb85'],
  COR_OUTROS: '#7c8796',

  // Mesmas cores que o Kanban já usa pros dots de cada coluna — mantém o "status" com o
  // mesmo significado visual em toda a dashboard, em vez de uma paleta categórica genérica.
  // Verde/vermelho mais vivos para contraste no fundo escuro.
  CORES_STATUS: { concluido: '#2fce6a', cancelado: '#f0554c', agendado: '#e0b25c' },
  LABELS_STATUS: { concluido: 'Concluídos', cancelado: 'Cancelados', agendado: 'Agendados' },

  MESES_EXTENSO: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ],
  MESES_ABREV: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],

  init(containerEl) {
    this._containerEl = containerEl;
    this._mesSelecionado = this._formatarChaveMes(new Date());
    this._carregouUmaVez = false;
    this._renderCarregando();
  },

  start() {
    this.refresh();
  },

  stop() {
    // Nada a limpar (sem setInterval) — ver comentário no topo do arquivo.
  },

  async refresh() {
    // Importante: só a CHAMADA À API entra nesse try/catch. Erro de rede/404 (endpoint
    // ainda não existe) é o único caso que deve virar a tela "ainda não configurado" —
    // um erro de verdade ao DESENHAR os gráficos (ex.: bug no código, Chart.js que não
    // carregou) precisa aparecer como erro de verdade, não ser disfarçado de "falta
    // configurar o backend".
    let dados;
    try {
      dados = await Api.getRelatorio(this._mesSelecionado);
    } catch (err) {
      if (err.isConflict) return;
      // Erro mais provável hoje: o endpoint ainda não existe no n8n (ver README 3.1).
      this._renderAguardandoConfiguracao();
      return;
    }

    this._dados = dados && typeof dados === 'object' ? dados : null;
    this._carregouUmaVez = true;
    if (!this._dados) {
      this._renderAguardandoConfiguracao();
      return;
    }

    if (typeof Chart === 'undefined') {
      this._renderErroGraficos('A biblioteca de gráficos não carregou (verifique a conexão com a internet e recarregue a página).');
      return;
    }

    try {
      this._render();
    } catch (err) {
      console.error('Erro ao desenhar os gráficos da aba Relatórios:', err);
      this._renderErroGraficos('Algo deu errado ao desenhar os gráficos. Recarregue a página; se continuar, avise quem cuida da dashboard.');
    }
  },

  // ---------- Navegação de mês ----------

  _formatarChaveMes(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${ano}-${mes}`;
  },

  _mesParaData(chaveMes) {
    const [ano, mes] = chaveMes.split('-').map(Number);
    return new Date(ano, mes - 1, 1);
  },

  _somarMeses(chaveMes, delta) {
    const data = this._mesParaData(chaveMes);
    data.setMonth(data.getMonth() + delta);
    return this._formatarChaveMes(data);
  },

  _mesAtualChave() {
    return this._formatarChaveMes(new Date());
  },

  _rotularMesExtenso(chaveMes) {
    const data = this._mesParaData(chaveMes);
    return `${this.MESES_EXTENSO[data.getMonth()]} de ${data.getFullYear()}`;
  },

  _rotularMesAbrev(chaveMes) {
    const data = this._mesParaData(chaveMes);
    return `${this.MESES_ABREV[data.getMonth()]}/${String(data.getFullYear()).slice(2)}`;
  },

  _trocarMes(delta) {
    const novoMes = this._somarMeses(this._mesSelecionado, delta);
    if (novoMes > this._mesAtualChave()) return; // nunca navega pro futuro
    this._mesSelecionado = novoMes;
    this._renderCarregando();
    this.refresh();
  },

  // ---------- Formatação ----------

  _formatarReal(valor) {
    const numero = Number(valor) || 0;
    return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  // Reduz uma lista (já ordenada por quantidade desc, vinda do servidor) aos 3 maiores +
  // "Outros" com o resto somado — mantém a paleta de 3 cores validada em vez de inventar
  // uma 4ª/5ª cor a cada novo serviço cadastrado.
  _agruparTop3(lista, chaveNome) {
    const itens = Array.isArray(lista) ? lista : [];
    const top = itens.slice(0, 3);
    const resto = itens.slice(3);
    const resultado = top.map((item) => ({
      nome: item[chaveNome],
      quantidade: Number(item.quantidade) || 0,
      faturamento: Number(item.faturamento) || 0,
    }));
    if (resto.length > 0) {
      resultado.push({
        nome: 'Outros',
        quantidade: resto.reduce((soma, i) => soma + (Number(i.quantidade) || 0), 0),
        faturamento: resto.reduce((soma, i) => soma + (Number(i.faturamento) || 0), 0),
      });
    }
    return resultado;
  },

  // ---------- Estados de carregamento/erro ----------

  _renderCarregando() {
    this._containerEl.innerHTML = `
      <div class="relatorios-topo">
        <div class="skeleton skeleton-linha" style="width:220px;height:34px;border-radius:8px;"></div>
      </div>
      <div class="relatorios-grid">
        ${['', '', ''].map(() => '<div class="skeleton skeleton-card" style="height:280px;"></div>').join('')}
      </div>
    `;
  },

  _renderAguardandoConfiguracao() {
    this._containerEl.innerHTML = `
      ${this._htmlSeletorMes()}
      <div class="relatorios-estado">
        ${UI.icon('chart')}
        <strong>Relatórios ainda não configurados</strong>
        <p>
          Essa aba já está pronta, mas falta o backend: um endpoint novo no n8n
          (<code>/webhook/dashboard-relatorio</code>) e o preço de cada serviço cadastrado
          no banco. O Hermes tem o passo a passo completo no README do projeto
          (seção "3.1 — Pendente"). Assim que isso existir, essa tela liga sozinha —
          não precisa mexer em mais nada aqui.
        </p>
      </div>
    `;
    this._ligarSeletorMes();
  },

  _renderErroGraficos(mensagem) {
    this._containerEl.innerHTML = `
      ${this._htmlSeletorMes()}
      <div class="relatorios-estado">
        ${UI.icon('x')}
        <strong>Não consegui mostrar os gráficos</strong>
        <p>${UI.escapar(mensagem)}</p>
      </div>
    `;
    this._ligarSeletorMes();
  },

  _htmlSeletorMes() {
    const podeAvancar = this._mesSelecionado !== this._mesAtualChave();
    return `
      <div class="relatorios-topo">
        <div class="relatorio-mes-seletor">
          <button type="button" class="relatorio-mes-botao" data-mes-nav="-1" aria-label="Mês anterior">
            ${UI.icon('chevronLeft')}
          </button>
          <span class="relatorio-mes-label">${UI.escapar(this._rotularMesExtenso(this._mesSelecionado))}</span>
          <button type="button" class="relatorio-mes-botao" data-mes-nav="1" ${podeAvancar ? '' : 'disabled'} aria-label="Próximo mês">
            ${UI.icon('chevronRight')}
          </button>
        </div>
      </div>
    `;
  },

  _ligarSeletorMes() {
    this._containerEl.querySelectorAll('[data-mes-nav]').forEach((botao) => {
      botao.addEventListener('click', () => this._trocarMes(Number(botao.dataset.mesNav)));
    });
  },

  // ---------- Render principal ----------

  _render() {
    const d = this._dados;
    const porServico = this._agruparTop3(d.porServico, 'servico');
    const porBarbeiro = this._agruparTop3(d.porBarbeiro, 'barbeiro');
    const porStatus = (Array.isArray(d.porStatus) ? d.porStatus : []);
    const porMes = (Array.isArray(d.porMes) ? d.porMes : []);

    const semDadosNoMes = porServico.length === 0 && porBarbeiro.length === 0 &&
      porStatus.every((s) => (Number(s.quantidade) || 0) === 0);

    const totalFaturamentoServico = porServico.reduce((s, i) => s + i.faturamento, 0);
    const faturamentoZerado = porServico.length > 0 && totalFaturamentoServico === 0;

    this._containerEl.innerHTML = `
      ${this._htmlSeletorMes()}

      ${faturamentoZerado ? `
        <div class="relatorio-card-rodape" style="border:1px dashed var(--border-forte); border-radius:var(--radius-sm); padding:10px 14px;">
          Quantidade calculada normalmente, mas o valor (R$) de cada serviço ainda não foi
          cadastrado no banco — por isso o faturamento aparece zerado. Ver README, seção 3.1.
        </div>
      ` : ''}

      ${semDadosNoMes ? `
        <div class="relatorios-estado">
          ${UI.icon('inbox')}
          <strong>Nenhum atendimento em ${UI.escapar(this._rotularMesExtenso(this._mesSelecionado))}</strong>
          <p>Escolha outro mês pra ver o detalhamento, ou volte aqui depois que houver atendimentos concluídos neste mês. A comparação mensal abaixo não depende do mês selecionado.</p>
        </div>
      ` : `
        <div class="relatorios-grid">
          <div class="relatorio-card">
            <div class="relatorio-card-cabecalho">
              <span class="relatorio-card-titulo">Por serviço</span>
              ${this._htmlToggleMetrica('servico', this._metricaServico)}
            </div>
            <div class="relatorio-grafico-wrap">
              <canvas id="grafico-servico"></canvas>
            </div>
          </div>

          <div class="relatorio-card">
            <div class="relatorio-card-cabecalho">
              <span class="relatorio-card-titulo">Por barbeiro</span>
              ${this._htmlToggleMetrica('barbeiro', this._metricaBarbeiro)}
            </div>
            <div class="relatorio-grafico-wrap">
              <canvas id="grafico-barbeiro"></canvas>
            </div>
          </div>

          <div class="relatorio-card">
            <div class="relatorio-card-cabecalho">
              <span class="relatorio-card-titulo">Por status</span>
            </div>
            <div class="relatorio-grafico-wrap">
              <canvas id="grafico-status"></canvas>
            </div>
          </div>
        </div>
      `}

      <!-- Independe do mês selecionado acima (sempre últimos 12 meses) — por isso fica
           fora do bloco "sem dados nesse mês": mesmo sem nada em agosto, por exemplo,
           ainda faz sentido comparar os outros 11 meses. -->
      <div class="relatorio-card relatorio-card-largo">
        <div class="relatorio-card-cabecalho">
          <div>
            <span class="relatorio-card-titulo">Comparação mensal</span>
            <span class="relatorio-card-subtitulo">Últimos 12 meses, só atendimentos concluídos</span>
          </div>
          ${this._htmlToggleMetrica('mes', this._metricaMes)}
        </div>
        <div class="relatorio-grafico-wrap relatorio-grafico-wrap-largo">
          <canvas id="grafico-mes"></canvas>
        </div>
      </div>
    `;

    this._ligarSeletorMes();
    this._ligarToggles();

    if (!semDadosNoMes) {
      this._desenharPizza('grafico-servico', porServico, this._metricaServico);
      this._desenharPizza('grafico-barbeiro', porBarbeiro, this._metricaBarbeiro);
      this._desenharStatus('grafico-status', porStatus);
    }
    this._desenharMes('grafico-mes', porMes, this._metricaMes);
  },

  _htmlToggleMetrica(grupo, ativa) {
    return `
      <div class="relatorio-toggle" data-toggle-grupo="${grupo}">
        <button type="button" class="relatorio-toggle-botao ${ativa === 'quantidade' ? 'relatorio-toggle-ativo' : ''}" data-toggle-valor="quantidade">Quantidade</button>
        <button type="button" class="relatorio-toggle-botao ${ativa === 'faturamento' ? 'relatorio-toggle-ativo' : ''}" data-toggle-valor="faturamento">R$</button>
      </div>
    `;
  },

  _ligarToggles() {
    this._containerEl.querySelectorAll('[data-toggle-grupo]').forEach((grupoEl) => {
      grupoEl.querySelectorAll('.relatorio-toggle-botao').forEach((botao) => {
        botao.addEventListener('click', () => {
          const grupo = grupoEl.dataset.toggleGrupo;
          const valor = botao.dataset.toggleValor;
          if (grupo === 'servico') this._metricaServico = valor;
          else if (grupo === 'barbeiro') this._metricaBarbeiro = valor;
          else if (grupo === 'mes') this._metricaMes = valor;
          this._render();
        });
      });
    });
  },

  // ---------- Chart.js ----------

  _destruirGrafico(id) {
    if (this._graficos[id]) {
      this._graficos[id].destroy();
      delete this._graficos[id];
    }
  },

  _corTexto() {
    return getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#9ca3af';
  },

  _corGrade() {
    return getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || 'rgba(255,255,255,0.08)';
  },

  _desenharPizza(canvasId, itens, metrica) {
    this._destruirGrafico(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || itens.length === 0) return;

    const cores = itens.map((item, i) => (item.nome === 'Outros' ? this.COR_OUTROS : this.PALETA[i] || this.COR_OUTROS));
    const valores = itens.map((item) => (metrica === 'faturamento' ? item.faturamento : item.quantidade));

    this._graficos[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: itens.map((i) => i.nome),
        datasets: [{ data: valores, backgroundColor: cores, borderColor: '#171c23', borderWidth: 3, hoverOffset: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '56%',
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { color: this._corTexto(), boxWidth: 11, boxHeight: 11, usePointStyle: true, pointStyle: 'circle', font: { size: 11, weight: 600 }, padding: 14 } },
          tooltip: {
            backgroundColor: '#1f2630',
            borderColor: 'rgba(212,168,83,0.35)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            titleColor: '#f7f7f8',
            bodyColor: '#a1a9b5',
            callbacks: {
              label: (ctx) => {
                const item = itens[ctx.dataIndex];
                return metrica === 'faturamento'
                  ? ` ${item.nome}: ${this._formatarReal(item.faturamento)}`
                  : ` ${item.nome}: ${item.quantidade}`;
              },
            },
          },
        },
      },
    });
  },

  _desenharStatus(canvasId, porStatus) {
    this._destruirGrafico(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ordem = ['concluido', 'cancelado', 'agendado'];
    const itens = ordem
      .map((status) => porStatus.find((s) => s.status === status))
      .filter(Boolean)
      .filter((s) => (Number(s.quantidade) || 0) > 0);

    if (itens.length === 0) return;

    this._graficos[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: itens.map((i) => this.LABELS_STATUS[i.status] || i.status),
        datasets: [{
          data: itens.map((i) => Number(i.quantidade) || 0),
          backgroundColor: itens.map((i) => this.CORES_STATUS[i.status] || this.COR_OUTROS),
          borderColor: '#171c23',
          borderWidth: 3,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '56%',
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { color: this._corTexto(), boxWidth: 11, boxHeight: 11, usePointStyle: true, pointStyle: 'circle', font: { size: 11, weight: 600 }, padding: 14 } },
          tooltip: {
            backgroundColor: '#1f2630',
            borderColor: 'rgba(212,168,83,0.35)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            titleColor: '#f7f7f8',
            bodyColor: '#a1a9b5',
            callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed}` },
          },
        },
      },
    });
  },

  _desenharMes(canvasId, porMes, metrica) {
    this._destruirGrafico(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || porMes.length === 0) return;

    const cor = metrica === 'faturamento' ? '#d4a853' : '#3987e5';
    const valores = porMes.map((m) => (metrica === 'faturamento' ? Number(m.faturamento) || 0 : Number(m.quantidade) || 0));

    this._graficos[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: porMes.map((m) => this._rotularMesAbrev(m.mes)),
        datasets: [{
          label: metrica === 'faturamento' ? 'Faturamento' : 'Quantidade',
          data: valores,
          backgroundColor: metrica === 'faturamento'
            ? 'rgba(212,168,83,0.75)'
            : 'rgba(57,135,229,0.7)',
          borderRadius: 7,
          borderSkipped: false,
          maxBarThickness: 46,
          hoverBackgroundColor: metrica === 'faturamento' ? 'rgba(240,200,117,0.95)' : 'rgba(79,158,244,0.9)',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1f2630',
            borderColor: 'rgba(212,168,83,0.35)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            titleColor: '#f7f7f8',
            bodyColor: '#a1a9b5',
            callbacks: {
              label: (ctx) => metrica === 'faturamento' ? ` ${this._formatarReal(ctx.parsed.y)}` : ` ${ctx.parsed.y} atendimento(s)`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: this._corTexto(), font: { size: 11 } } },
          y: {
            beginAtZero: true,
            grid: { color: this._corGrade() },
            ticks: {
              color: this._corTexto(),
              font: { size: 11 },
              callback: (valor) => metrica === 'faturamento' ? this._formatarReal(valor) : valor,
            },
          },
        },
      },
    });
  },
};
