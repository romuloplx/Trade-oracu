# Trade Oracu 📈

**Analista de opções binárias** — painel web que monitora o mercado forex em tempo real e, **quando o mercado está fechado, exibe automaticamente o modo OTC** (Over-the-Counter), como nas plataformas de opções binárias.

## Como funciona

### Status do mercado
O mercado forex real opera de **domingo 17:00 ET** até **sexta-feira 17:00 ET** (com ajuste automático de horário de verão dos EUA). O app calcula o status em tempo real:

- **Mercado aberto** → pares reais ativos (verde), com contagem regressiva para o fechamento.
- **Mercado fechado** (fim de semana) → o app entra em **modo OTC**:
  - 🟠 Banner **"MERCADO FECHADO — OPERANDO EM MODO OTC"**
  - Pares reais ficam pausados/cinza com selo **"fechado"**
  - Pares **OTC** (disponíveis 24h, 7 dias por semana) destacados em âmbar
  - Troca automática para o par OTC equivalente ao fechar o mercado
  - Clicar em um par real fechado redireciona para a versão OTC
  - Contagem regressiva para a reabertura (domingo 17:00 ET)

### Funcionalidades
- 📊 Gráfico de candles em canvas (tempo real, dados simulados)
- 🟢🔴 Botões **CALL / PUT** com valor, expiração (30s a 5min) e retorno (%)
- 💰 Carteira demo (R$ 10.000) com liquidação automática: ganho, perda e empate
- 🧠 **Análise do Oracu**: sinal CALL/PUT/NEUTRO com RSI(14), EMA 9/21 e nível de confiança
- 🕐 Sessões de mercado: Sydney, Tóquio, Londres e Nova York
- 🔍 Busca de ativos e lista com preços ao vivo
- 🧪 Toggle **"Forçar OTC (teste)"** para visualizar o modo OTC mesmo com o mercado aberto

## Como rodar

Basta abrir o `index.html` no navegador, ou servir com qualquer servidor estático:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Estrutura

```
index.html       # página principal
css/style.css    # tema escuro estilo plataforma de trading
js/market.js     # status do mercado forex, sessões e contagem regressiva (DST-aware)
js/chart.js      # motor de gráfico de candles em canvas
js/app.js        # ativos, operações binárias, análise e UI
```

## Aviso

⚠️ Todos os preços e resultados são **simulados** para fins educacionais. Este projeto **não é uma recomendação de investimento**. Opções binárias envolvem alto risco de perda.
