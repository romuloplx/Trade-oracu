# RESUMO TÉCNICO: ORÁCULO TRADER AI & RADAR SNIPER

## 1. Padrão Oficial dos Sinais de Opções Binárias / Quotex
Todos os sinais emitidos pelo Radar de Binárias (tanto na nuvem `api/bin.js` quanto no painel web `index.html`) seguem estritamente o modelo aprovado:

```text
🎯 SINAL QUOTEX / BINÁRIAS 🌙 OTC
━━━━━━━━━━━━━━━━━━━━━━━━━━
🪙 PAR NA CORRETORA:
<pre><code>{PAR}</code></pre>

🕹️ AÇÃO / BOTÃO: 🟢 COMPRA / CALL (BOTÃO VERDE ⬆️) ou 🔴 VENDA / PUT (BOTÃO VERMELHO ⬇️)
━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ HORÁRIO DA ENTRADA:
<pre><code>{HH:mm:00}</code></pre>

⚡ SEGUNDO DO CLIQUE:
<pre><code>{HH:mm:58}</code></pre> <i>(aperte no segundo 58!)</i>

📊 TEMPO GRÁFICO (VELA):
<pre><code>M5 (Velas de 5 Minutos)</code></pre>

⏳ TEMPO DE EXPIRAÇÃO:
<pre><code>5 Minutos (Vence às {HH:mm:00})</code></pre>

💵 COTAÇÃO ATUAL NO GRÁFICO:
<pre><code>{PREÇO_FORMATADO}</code></pre>

💪 ASSERTIVIDADE IA: {CONF}% ({IA})
━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 CHECKLIST PARA ENTRAR NO SEGUNDO EXATO:
1️⃣ Abra {PAR} na Quotex / Corretora
2️⃣ Coloque o gráfico em Vela M5 e Expiração em 5 Min ({EXPIRA_SHORT})
3️⃣ Confira a cotação no gráfico próxima de {PREÇO_FORMATADO}
4️⃣ Olhe os segundos do relógio: quando bater {SEGUNDO_CLIQUE} aperte {AÇÃO}
5️⃣ 🛡️ Gale 1 (Opcional): Se precisar de proteção, entre no segundo 58 da próxima vela às {GALE_TIME}:58
━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 Filtro: Sniper 97% Validado pelo Oráculo AI
```

## 2. Regras de Precisão de Cotação
- **Pares de Forex Padrão (EUR/USD, GBP/USD, etc.):** 5 casas decimais (ex: `1.08450`)
- **Pares com JPY (EUR/JPY, GBP/JPY, USD/JPY):** 3 casas decimais (ex: `177.250`, `190.499`)
- **Criptoativos e Metais (BTC, ETH, XAU/USD):** 2 casas decimais (ex: `2650.40`)
- **Pares com BRL (USD/BRL, EUR/BRL):** 4 casas decimais (ex: `5.6420`)

## 3. Configurações Padrão de Fábrica do Robô de Futuros
- **Modo:** Sniper 97% Alta Confluência
- **Posições Simultâneas:** Máximo 2
- **Stop Loss de Emergência Rígido:** -1.8% de variação de preço
- **Alavancagem:** Dinâmica e Inteligente até 25x baseada no ATR e risco
- **Filtro de Tendência:** Alinhamento estrito H1 + Breakout Momentum Institucional
