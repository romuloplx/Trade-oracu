/**
 * ORÁCULO TRADER AI - MOTOR DE EXECUÇÃO ULTRA-SNIPER 24/7 (FUTURES CLOUD)
 * ARQUIVO: binance-futures/index.js
 */

import { BinanceClient } from "./api.js";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
dotenv.config();

// Inicialização segura dos clientes
const binance = new BinanceClient({
    apiKey: process.env.BINANCE_API_KEY || process.env.API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET || process.env.SECRET_KEY,
    testnet: process.env.USE_TESTNET === "true"
});

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;
const CANAL_ALERTA = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID;

let bot = null;
if (TELEGRAM_TOKEN) {
    try {
        bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
    } catch (e) {
        console.warn("⚠️ Telegram polling não iniciado:", e.message);
    }
}

// TOP 150+ PARES DE ALTA LIQUIDEZ BINANCE FUTURES
const PARES_PADRAO = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "XRPUSDT", "ADAUSDT",
    "SUIUSDT", "NEARUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT", "1000PEPEUSDT", "WIFUSDT",
    "1000BONKUSDT", "1000FLOKIUSDT", "1000SHIBUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "TIAUSDT",
    "FTMUSDT", "INJUSDT", "RENDERUSDT", "LTCUSDT", "BCHUSDT", "POLUSDT", "ETCUSDT", "FILUSDT",
    "UNIUSDT", "TRXUSDT", "AAVEUSDT", "KASUSDT", "ICPUSDT", "XLMUSDT", "ALGOUSDT", "CRVUSDT",
    "SANDUSDT", "MANAUSDT", "AXSUSDT", "GALAUSDT", "CHZUSDT", "ENJUSDT", "SNXUSDT", "COMPUSDT",
    "LDOUSDT", "THETAUSDT", "EGLDUSDT", "IMXUSDT", "SEIUSDT", "BOMEUSDT", "NOTUSDT", "IOUSDT",
    "ZROUSDT", "BLURUSDT", "PORTALUSDT", "JUPUSDT", "PYTHUSDT", "WLDUSDT", "STRKUSDT", "DYDXUSDT",
    "RUNEUSDT", "PENDLEUSDT", "ONDOUSDT", "ORDIUSDT", "1000SATSUSDT", "1000RATSUSDT", "MEMEUSDT",
    "BEAMXUSDT", "JTOUSDT", "BIGTIMEUSDT", "NTRNUSDT", "ALTUSDT", "MANTAUSDT", "PIXELUSDT",
    "AEVOUSDT", "ETHFIUSDT", "ENAUSDT", "TNSRUSDT", "OMNIUSDT", "REZUSDT", "BBUSDT", "ZKUSDT",
    "LISTAUSDT", "BLASTUSDT", "BANANAUSDT", "VOXELUSDT", "TONUSDT", "DOGSUSDT", "CATIUSDT",
    "HMSTRUSDT", "EIGENUSDT", "NEIROUSDT", "TURBOUSDT", "1000CATUSDT", "MOODENGUSDT", "GOATUSDT",
    "PNUTUSDT", "ACTUSDT", "HIPPOUSDT", "CETUSUSDT", "COWUSDT", "THEUSDT", "MOVEUSDT", "MEUSDT",
    "VIRTUALUSDT", "PENGUUSDT", "SPXUSDT", "TRUMPUSDT", "MELANIAUSDT"
];

// CONFIGURAÇÕES INSTITUCIONAIS SNIPER & ROTAÇÃO RÁPIDA
const CONFIG = {
    ALAVANCAGEM: parseInt(process.env.LEVERAGE || "5", 10),
    VALOR_ENTRADA_MIN_USDT: 5.0,     // Margem mínima Binance (MIN_NOTIONAL)
    RISCO_POR_TRADE: 0.05,          // 5% da banca por operação
    MAX_POSICOES: 2,                // Máximo de operações simultâneas
    TAKE_PROFIT_PCT: 0.0050,        // Alvo rápido: +0.50% de variação de preço
    BREAKEVEN_PCT: 0.0025,          // Trava risco zero no lucro de +0.25%
    STOP_LOSS_PCT: 0.0050,          // Stop cirúrgico: -0.50%
    INTERVALO_VARREDURA_MS: 15000   // 15 segundos entre ciclos
};

// Estado interno de controle
let estadoRobo = {
    operando: true,
    posicoesAtivas: {},
    timestampUltimoTrade: 0,
    ciclosExecutados: 0
};

console.log("🚀 Oráculo Trader AI 24/7 inicializado com sucesso.");

/**
 * MOTOR DE ANÁLISE SNIPER ADITIVO
 */
async function analisarMercado(par) {
    try {
        const velas = await binance.getKlines(par, "15m", 50);
        if (!velas || velas.length < 30) return null;

        const fechamentos = velas.map(v => parseFloat(v[4]));
        const precoAtual = fechamentos[fechamentos.length - 1];

        const ema9 = calcularEMA(fechamentos, 9);
        const ema21 = calcularEMA(fechamentos, 21);
        const rsi = calcularRSI(fechamentos, 14);
        const atr = calcularATR(velas, 14);

        let scoreLong = 0;
        let scoreShort = 0;

        // 1. Alinhamento de Médias Móveis
        if (precoAtual > ema21) scoreLong += 1.8;
        if (precoAtual < ema21) scoreShort += 1.8;
        if (ema9 > ema21) scoreLong += 1.0;
        if (ema9 < ema21) scoreShort += 1.0;

        // 2. Proximidade de Pullback
        const distEma21 = Math.abs(precoAtual - ema21);
        if (distEma21 <= (atr * 0.45)) {
            scoreLong += 1.8;
            scoreShort += 1.8;
        }

        // 3. Força Relativa (RSI)
        if (rsi >= 42 && rsi <= 65) scoreLong += 1.0;
        if (rsi >= 35 && rsi <= 58) scoreShort += 1.0;

        if (scoreLong >= 3.8) {
            return {
                par,
                direcao: "BUY",
                preco: precoAtual,
                score: scoreLong,
                sl: precoAtual * (1 - CONFIG.STOP_LOSS_PCT),
                tp: precoAtual * (1 + CONFIG.TAKE_PROFIT_PCT)
            };
        }

        if (scoreShort >= 3.8) {
            return {
                par,
                direcao: "SELL",
                preco: precoAtual,
                score: scoreShort,
                sl: precoAtual * (1 + CONFIG.STOP_LOSS_PCT),
                tp: precoAtual * (1 - CONFIG.TAKE_PROFIT_PCT)
            };
        }

        return null;
    } catch (e) {
        return null;
    }
}

/**
 * CICLO PRINCIPAL DE EXECUÇÃO 24/7
 */
async function executarCiclo24H() {
    if (!estadoRobo.operando) return;
    estadoRobo.ciclosExecutados++;

    try {
        // 1. Consulta saldo e posições abertas
        const saldoConta = await binance.getBalance();
        
        // 2. Gerenciamento ativo de posições
        let posicoesAbertasCount = 0;
        for (const par of PARES_PADRAO) {
            const pos = await binance.getOpenPosition(par);
            if (pos && Math.abs(parseFloat(pos.positionAmt)) > 0) {
                posicoesAbertasCount++;
                await gerenciarPosicaoAberta(par, pos);
            }
        }

        if (posicoesAbertasCount >= CONFIG.MAX_POSICOES) {
            return; // Limite de posições atingido
        }

        // 3. Varredura nos 30 pares
        for (const par of PARES_PADRAO) {
            if (posicoesAbertasCount >= CONFIG.MAX_POSICOES) break;

            const posAtual = await binance.getOpenPosition(par);
            if (posAtual && Math.abs(parseFloat(posAtual.positionAmt)) > 0) continue;

            const setup = await analisarMercado(par);
            if (!setup) continue;

            // Alavancagem e Tipo de Margem
            await binance.setLeverage(par, CONFIG.ALAVANCAGEM);
            await binance.setMarginType(par, "ISOLATED");

            // Cálculo do Lote
            const margemAlocada = Math.max(CONFIG.VALOR_ENTRADA_MIN_USDT, saldoConta * CONFIG.RISCO_POR_TRADE);
            const valorTotal = margemAlocada * CONFIG.ALAVANCAGEM;
            const qtdContrato = valorTotal / setup.preco;

            console.log(`🎯 [ENTRADA 24H] ${setup.direcao} em ${par} | Preço: $${setup.preco} | Score: ${setup.score.toFixed(1)}`);
            
            const ordem = await binance.createMarketOrder(par, setup.direcao, qtdContrato);
            if (ordem) {
                await binance.createOrderProtection(par, setup.direcao === "BUY" ? "SELL" : "BUY", setup.sl, setup.tp);
                posicoesAbertasCount++;
                
                avisarTelegram(`🟩 <b>ORDEM EXECUTADA 24/7</b>\n<b>Par:</b> <code>${par}</code>\n<b>Lado:</b> <b>${setup.direcao}</b>\n<b>Preço:</b> ${setup.preco}\n<b>Alvo (+0.50%):</b> ${setup.tp.toFixed(4)}\n<b>Stop (-0.50%):</b> ${setup.sl.toFixed(4)}\n<b>Alavancagem:</b> ${CONFIG.ALAVANCAGEM}x`);
            }
        }
    } catch (error) {
        console.error("Erro no ciclo 24h:", error.message);
    }
}

/**
 * GERENCIADOR DE RISCO ATIVO E ROTAÇÃO
 */
async function gerenciarPosicaoAberta(par, pos) {
    try {
        const precoAtual = await binance.getCurrentPrice(par);
        const precoEntrada = parseFloat(pos.entryPrice);
        const amt = parseFloat(pos.positionAmt);
        const direcao = amt > 0 ? "BUY" : "SELL";

        if (!precoAtual || !precoEntrada) return;

        const lucroPct = direcao === "BUY"
            ? (precoAtual - precoEntrada) / precoEntrada
            : (precoEntrada - precoAtual) / precoEntrada;

        // BREAK-EVEN EM +0.25%
        if (lucroPct >= CONFIG.BREAKEVEN_PCT && (!estadoRobo.posicoesAtivas[par] || !estadoRobo.posicoesAtivas[par].be)) {
            await binance.cancelAllOpenOrders(par);
            const stopBe = direcao === "BUY" ? precoEntrada * 1.0005 : precoEntrada * 0.9995;
            const alvoTp = direcao === "BUY" ? precoEntrada * (1 + CONFIG.TAKE_PROFIT_PCT) : precoEntrada * (1 - CONFIG.TAKE_PROFIT_PCT);
            await binance.createOrderProtection(par, direcao === "BUY" ? "SELL" : "BUY", stopBe, alvoTp);
            
            estadoRobo.posicoesAtivas[par] = { be: true };
            avisarTelegram(`🛡️ <b>BREAK-EVEN 24H: ${par}</b>\nLucro atingiu +${(lucroPct * 100).toFixed(2)}%!\nStop Loss reposicionado para o preço de entrada. Risco zerado!`);
        }
    } catch (e) {
        console.error(`Erro ao gerenciar posição de ${par}:`, e.message);
    }
}

/**
 * MATEMÁTICA E INDICADORES
 */
function calcularEMA(dados, periodo) {
    const k = 2 / (periodo + 1);
    let ema = dados[0];
    for (let i = 1; i < dados.length; i++) {
        ema = dados[i] * k + ema * (1 - k);
    }
    return ema;
}

function calcularATR(velas, periodo = 14) {
    let trs = [];
    for (let i = 1; i < velas.length; i++) {
        const h = parseFloat(velas[i][2]);
        const l = parseFloat(velas[i][3]);
        const yc = parseFloat(velas[i-1][4]);
        trs.push(Math.max(h - l, Math.abs(h - yc), Math.abs(l - yc)));
    }
    const slice = trs.slice(-periodo);
    return slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
}

function calcularRSI(fechamentos, periodo = 14) {
    if (fechamentos.length < periodo + 1) return 50;
    let ganhos = 0, perdas = 0;
    for (let i = fechamentos.length - periodo; i < fechamentos.length; i++) {
        const dif = fechamentos[i] - fechamentos[i-1];
        if (dif > 0) ganhos += dif; else perdas += Math.abs(dif);
    }
    const rs = (ganhos / periodo) / ((perdas / periodo) || 1e-9);
    return 100 - (100 / (1 + rs));
}

function avisarTelegram(mensagem) {
    if (bot && CANAL_ALERTA) {
        bot.sendMessage(CANAL_ALERTA, mensagem, { parse_mode: "HTML" }).catch(() => {});
    }
}

// Bot Telegram comandos interativos
if (bot) {
    bot.onText(/\/status/, async (msg) => {
        try {
            const saldo = await binance.getBalance();
            let txt = `🤖 <b>ORÁCULO TRADER AI — STATUS 24/7</b>\n\n`;
            txt += `💰 <b>Saldo:</b> $${saldo.toFixed(2)} USDT\n`;
            txt += `⚡ <b>Ciclos Executados:</b> ${estadoRobo.ciclosExecutados}\n`;
            txt += `🛡️ <b>Varredura:</b> Top 30 Pares a cada 15s\n`;
            bot.sendMessage(msg.chat.id, txt, { parse_mode: "HTML" });
        } catch (e) {
            bot.sendMessage(msg.chat.id, `⚠️ Erro: ${e.message}`);
        }
    });
}

// Loop 24/7 Contínuo
setInterval(executarCiclo24H, CONFIG.INTERVALO_VARREDURA_MS);
executarCiclo24H();

export {
    analisarMercado,
    executarCiclo24H,
    gerenciarPosicaoAberta,
    CONFIG
};
