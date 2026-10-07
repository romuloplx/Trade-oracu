# 📦 BACKUP COMPLETO — ORÁCULO TRADER AI & ROBÔ BINANCE FUTURES

Este arquivo contém o inventário completo de todos os arquivos de código-fonte, arquitetura, endpoints de API e instruções de implantação do seu ecossistema **Oráculo Trader AI**.

---

## 🗂️ Arquivos do Projeto (Pacote ZIP Disponível)

O arquivo **`oraculo-trader-backup.zip`** foi gerado na raiz do projeto com **100% dos arquivos**, incluindo:

```
├── index.html                     # Frontend SPA completo (Interface, Gráficos, IA, Sentinela Web)
├── vercel.json                    # Configuração de rotas e cron jobs na Vercel
├── manifest.webmanifest           # Manifesto PWA para instalação no celular e desktop
├── sw.js                          # Service Worker do PWA
├── package.json                   # Dependências do projeto
├── RESUMO_ROBO.md                 # Manual operacional e endpoints em nuvem
├── logo.png / logo-192 / logo-512 # Ícones e artes do aplicativo
│
├── api/                           # ☁️ 12 ENDPOINTS SERVERLESS (NUVEM 24/7)
│   ├── robo.js                    # Motor do Robô Binance Futures 24/7 (Filtro Sniper, Trailing Stop, Sentinela)
│   ├── radar.js                   # Radar Cripto Futuros com disparo no Telegram (@rl_sinais_bot)
│   ├── bin.js                     # Radar Quotex / Binárias / OTC com segundo do clique e código de cópia
│   ├── copy.js                    # Central de Copy Trading e retransmissão de sinais
│   ├── binance.js                 # Proxy seguro com assinatura HMAC-SHA256 para ordens Binance
│   ├── binproxy.js                # Proxy de cotação em tempo real e websockets
│   ├── llm.js                     # Gateway multi-modelo com fallback de IA
│   ├── tg.js                      # Envio seguro de alertas formatados para o Telegram
│   ├── aitest.js                  # Testador e validador de chaves de IA
│   ├── revive.js                  # Auto-reinicialização e verificação de saúde da nuvem
│   ├── sol.js                     # Scanner de tokens Solana e Pump.fun
│   └── yahoo.js                   # Cotações históricas e forex
│
└── binance-futures/               # 🤖 ROBÔ BINANCE STANDALONE (NODE.JS / WEBSOCKET)
    ├── index.js                   # Servidor de trading em tempo real com comandos Telegram
    ├── api.js                     # Driver de conexão autenticado com a Binance Futures
    ├── package.json               # Dependências do bot (ws, node-telegram-bot-api, axios)
    └── .env                       # Chaves e parâmetros de execução
```

---

## 🚀 Resumo das Tecnologias e Configurações

### 1. 🌐 Frontend (`index.html`)
- **Estilo:** Cyberpunk inovador em preto absoluto com neon verde (`#00ffa3`), azul elétrico (`#4bc3ff`) e ouro (`#ffc24b`).
- **Visão Computacional:** Modelos Gemini Vision (`gemini-2.5-flash` e `gemini-2.5-pro`) com marcação direta de Suporte, Resistência, EMA21, Alvo e Stop na foto do gráfico.
- **Modo Precisão 97%:** Análise por consenso duplo institucional sem gargalos externos.

### 2. 🤖 Robô Binance Futures Nuvem 24/7 (`api/robo.js`)
- **Risco Zero Imediato (Break-Even):** Ativa com $+0.35\%$ de avanço do preço.
- **Escada de Trailing Stop:** $+0.80\%$ trava $+0.40\%$, $+1.40\%$ trava $+0.90\%$, $+2.00\%$ realiza lucro e gira capital.
- **Filtro de Entrada:** Fita de Médias EMA Ribbon (9 / 21 / 50), Pullback no desconto da EMA21, $ADX \ge 23$ e correlação direta com a maré do Bitcoin.
- **Stop Loss:** Rígido e curto em $1.05\times\text{ATR}$ (perda controlada em ~1.0%).
- **Take Profit:** Alvo assimétrico em $2.60\times\text{ATR}$ ($R:R \ge 2.5:1$).

### 3. 🛰️ Radares Telegram (`api/radar.js` e `api/bin.js`)
- **Telegram Bot:** `@rl_sinais_bot` (ID: `8324502851`).
- **Canal Oficial:** `https://t.me/+o2z6qYp3bI0zM2Q5`.
- **Fila Anti-Repetição:** Bloqueia reenvio do mesmo ativo por 8 ciclos consecutivos (45 min para binárias e 60 min para futuros).
- **Binárias Quotex / OTC:** Sinal com horário exato (`HH:mm:ss`), segundo de clique no segundo 58 (`HH:mm:58`), vela M5, expiração e blocos de cópia rápida `<pre><code>`.

---

## 💾 Como Restaurar ou Rodar o Projeto

1. Baixe o arquivo **`oraculo-trader-backup.zip`**.
2. Descompacte os arquivos na pasta desejada.
3. Para publicar na Vercel:
   ```bash
   vercel --prod
   ```
4. Para rodar o robô localmente com WebSocket:
   ```bash
   cd binance-futures
   npm install
   npm start
   ```

Seu backup completo está seguro, atualizado e pronto para preservação!
