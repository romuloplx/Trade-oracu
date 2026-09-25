'use strict';

/* =========================================================
   Trade Oracu — app principal
   ========================================================= */

/* ---------- utilidades ---------- */
const $ = id => document.getElementById(id);
const fmtBRL = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function fmtDur(ms) {
  const s  = Math.floor(Math.max(0, ms) / 1000);
  const d  = Math.floor(s / 86400);
  const h  = Math.floor((s % 86400) / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p  = n => String(n).padStart(2, '0');
  return d > 0 ? d + 'd ' + p(h) + ':' + p(m) + ':' + p(ss)
               : p(h) + ':' + p(m) + ':' + p(ss);
}

function toast(msg, type = 'info') {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); }, 4200);
  setTimeout(() => { el.remove(); }, 4700);
}

/* ---------- ativos ---------- */
const ASSETS = [
  /* Mercado real (forex) — seg a sex */
  { id: 'EURUSD',    pair: 'EUR/USD', otc: false, base: 1.0842, dec: 5, payout: 85, vol: 0.00035 },
  { id: 'GBPUSD',    pair: 'GBP/USD', otc: false, base: 1.2675, dec: 5, payout: 84, vol: 0.00042 },
  { id: 'USDJPY',    pair: 'USD/JPY', otc: false, base: 149.62, dec: 3, payout: 83, vol: 0.045 },
  { id: 'AUDUSD',    pair: 'AUD/USD', otc: false, base: 0.6538, dec: 5, payout: 82, vol: 0.00038 },
  { id: 'USDCAD',    pair: 'USD/CAD', otc: false, base: 1.3584, dec: 5, payout: 82, vol: 0.00035 },
  { id: 'USDCHF',    pair: 'USD/CHF', otc: false, base: 0.8892, dec: 5, payout: 81, vol: 0.00032 },
  { id: 'NZDUSD',    pair: 'NZD/USD', otc: false, base: 0.5972, dec: 5, payout: 81, vol: 0.00036 },
  { id: 'EURJPY',    pair: 'EUR/JPY', otc: false, base: 162.20, dec: 3, payout: 84, vol: 0.050 },
  { id: 'GBPJPY',    pair: 'GBP/JPY', otc: false, base: 189.55, dec: 3, payout: 86, vol: 0.062 },
  { id: 'EURGBP',    pair: 'EUR/GBP', otc: false, base: 0.8556, dec: 5, payout: 80, vol: 0.00028 },
  { id: 'USDBRL',    pair: 'USD/BRL', otc: false, base: 5.4320, dec: 4, payout: 87, vol: 0.0028 },

  /* OTC — disponíveis 24h por dia, 7 dias por semana */
  { id: 'EURUSD_OTC', pair: 'EUR/USD', otc: true, base: 1.0851, dec: 5, payout: 92, vol: 0.00045 },
  { id: 'GBPUSD_OTC', pair: 'GBP/USD', otc: true, base: 1.2661, dec: 5, payout: 91, vol: 0.00050 },
  { id: 'USDJPY_OTC', pair: 'USD/JPY', otc: true, base: 149.71, dec: 3, payout: 90, vol: 0.055 },
  { id: 'AUDUSD_OTC', pair: 'AUD/USD', otc: true, base: 0.6529, dec: 5, payout: 90, vol: 0.00046 },
  { id: 'EURGBP_OTC', pair: 'EUR/GBP', otc: true, base: 0.8561, dec: 5, payout: 89, vol: 0.00034 },
  { id: 'GBPJPY_OTC', pair: 'GBP/JPY', otc: true, base: 189.20, dec: 3, payout: 93, vol: 0.070 },
  { id: 'USDBRL_OTC', pair: 'USD/BRL', otc: true, base: 5.4402, dec: 4, payout: 94, vol: 0.0034 },
  { id: 'EURCHF_OTC', pair: 'EUR/CHF', otc: true, base: 0.9427, dec: 5, payout: 88, vol: 0.00030 },
  { id: 'NZDUSD_OTC', pair: 'NZD/USD', otc: true, base: 0.5965, dec: 5, payout: 89, vol: 0.00042 },
  { id: 'AUDCAD_OTC', pair: 'AUD/CAD', otc: true, base: 0.8880, dec: 5, payout: 88, vol: 0.00038 },
];

/* histórico inicial de candles por ativo (dados simulados) */
function seedCandles(a) {
  const candles = [];
  let p = a.base * (1 + gauss() * a.vol * 2);
  const nowMin = Math.floor(Date.now() / 60000);
  for (let i = 0; i < 140; i++) {
    const t = (nowMin - (140 - i)) * 60000;
    const o = p;
    let h = o, l = o, c = o;
    for (let k = 0; k < 6; k++) {
      c = c * (1 + gauss() * a.vol);
      if (c > h) h = c;
      if (c < l) l = c;
    }
    candles.push({ t, o, h, l, c });
    p = c;
  }
  return candles;
}

ASSETS.forEach(a => {
  a.candles = seedCandles(a);
  a.price   = a.candles[a.candles.length - 1].c;
  a.up      = true;
});
const byId = Object.fromEntries(ASSETS.map(a => [a.id, a]));

/* ---------- estado ---------- */
const state = {
  balance:   10000,
  activeId:  null,
  marketOpen: true,
  forceOtc:  false,
  amount:    50,
  expiry:    60,
  trades:    [],      // operações abertas
  history:   [],      // últimos resultados
};
let tradeSeq = 0;

/* ---------- mercado ---------- */
function marketOpen() { return Market.status() && !state.forceOtc; }

function applyMarketState() {
  const open    = marketOpen();
  const wasOpen = state.marketOpen;
  state.marketOpen = open;
  document.body.classList.toggle('market-closed', !open);

  /* pílula de status + contagem regressiva */
  const cd = Market.countdown();
  $('marketDot').className = 'dot ' + (open ? 'on' : 'off');
  $('marketPill').classList.toggle('closed', !open);
  $('marketLabel').textContent = open ? 'MERCADO ABERTO' : 'MERCADO FECHADO';
  $('marketCountdown').textContent = open
    ? 'Fecha em ' + fmtDur(cd.ms)
    : 'Abre em ' + fmtDur(cd.ms) + ' · modo OTC';

  /* banner OTC */
  $('otcBanner').classList.toggle('hidden', open);
  if (!open) {
    $('otcBannerText').textContent = state.forceOtc
      ? 'Modo de teste: o mercado está sendo simulado como fechado. Os pares reais foram pausados e os pares OTC (disponíveis 24h) estão ativos em âmbar.'
      : 'O mercado forex real está encerrado no momento (fim de semana). Os pares reais foram pausados e os pares OTC — disponíveis 24 horas por dia, 7 dias por semana — estão destacados em âmbar. O mercado reabre domingo às 17:00 ET.';
  }

  /* troca automática para o OTC ao fechar */
  if (wasOpen && !open) {
    const cur = byId[state.activeId];
    if (cur && !cur.otc) {
      const alt = byId[cur.id + '_OTC'] || ASSETS.find(x => x.otc);
      if (alt) {
        selectAsset(alt.id);
        toast('Mercado fechado — ' + cur.pair + ' trocado automaticamente para ' + alt.pair + ' OTC', 'warn');
      }
    }
  }
  renderSidebarState();
  renderChartHeader();
}

/* ---------- sidebar de ativos ---------- */
const priceEls = {};

function buildSidebar() {
  const real = $('realList');
  const otc  = $('otcList');
  real.innerHTML = '';
  otc.innerHTML  = '';

  for (const a of ASSETS) {
    const li = document.createElement('button');
    li.className = 'asset-item' + (a.otc ? ' otc' : '');
    li.dataset.id = a.id;
    li.innerHTML =
      '<span class="asset-dot"></span>' +
      '<span class="asset-main">' +
        '<span class="pair">' + a.pair + (a.otc ? ' <em class="otc-tag">OTC</em>' : '') + '</span>' +
        '<span class="asset-price"><b class="p"></b> <i class="dir">▲</i></span>' +
      '</span>' +
      '<span class="asset-side"><span class="payout"></span></span>';

    li.addEventListener('click', () => selectAsset(a.id));
    (a.otc ? otc : real).appendChild(li);

    priceEls[a.id] = {
      li,
      p: li.querySelector('.p'),
      dir: li.querySelector('.dir'),
      payout: li.querySelector('.payout'),
    };
  }
  renderSidebarState();
  renderSidebarPrices();
}

function renderSidebarState() {
  for (const a of ASSETS) {
    const el = priceEls[a.id];
    if (!el) continue;
    const closed = !a.otc && !state.marketOpen;
    el.li.classList.toggle('closed', closed);
    el.li.classList.toggle('active', a.id === state.activeId);
    el.payout.textContent = closed ? 'fechado' : a.payout + '%';
    el.payout.classList.toggle('closed-tag', closed);
  }
}

function renderSidebarPrices() {
  for (const a of ASSETS) {
    const el = priceEls[a.id];
    if (!el) continue;
    el.p.textContent = a.price.toFixed(a.dec);
    el.dir.textContent = a.up ? '▲' : '▼';
    el.dir.className = 'dir ' + (a.up ? 'up' : 'down');
  }
}

function filterAssets() {
  const q = $('assetSearch').value.trim().toUpperCase();
  for (const a of ASSETS) {
    priceEls[a.id].li.style.display =
      !q || a.pair.toUpperCase().includes(q) ? '' : 'none';
  }
}

/* ---------- gráfico + cabeçalho ---------- */
const chart = new CandleChart($('chartCanvas'));

function selectAsset(id) {
  const a = byId[id];
  if (!a) return;

  /* mercado fechado em ativo real → mostra que está em OTC */
  if (!a.otc && !state.marketOpen) {
    const alt = byId[id + '_OTC'];
    if (alt) {
      toast(a.pair + ' está com o mercado fechado agora. Operando no OTC: ' + alt.pair, 'warn');
      return selectAsset(alt.id);
    }
    toast(a.pair + ' está com o mercado fechado. Escolha um par OTC (âmbar).', 'warn');
    return;
  }

  state.activeId = id;
  renderSidebarState();
  renderChartHeader();
  updateSignal(a);
  renderBalance();
  renderTrades();
}

function renderChartHeader() {
  const a = byId[state.activeId];
  if (!a) return;
  $('chartPair').textContent = a.pair;
  $('chartOtcBadge').classList.toggle('hidden', !a.otc);
  $('chartPayout').textContent = 'Retorno ' + a.payout + '%';
  const chip = $('chartState');
  if (a.otc) {
    chip.textContent = 'OTC · 24 HORAS';
    chip.className = 'state-chip otc-chip';
  } else if (state.marketOpen) {
    chip.textContent = 'MERCADO REAL · ABERTO';
    chip.className = 'state-chip open-chip';
  } else {
    chip.textContent = 'MERCADO REAL · FECHADO';
    chip.className = 'state-chip closed-chip';
  }
  renderPriceHeader();
}

function renderPriceHeader() {
  const a = byId[state.activeId];
  if (!a) return;
  const el = $('chartPrice');
  el.textContent = a.price.toFixed(a.dec);
  el.className = 'price ' + (a.up ? 'up' : 'down');
}

/* ---------- operações (binárias) ---------- */
function placeTrade(dir) {
  const a = byId[state.activeId];
  if (!a) return;
  if (!a.otc && !state.marketOpen) {
    toast('Mercado fechado para ' + a.pair + '. Use um par OTC (âmbar).', 'warn');
    return;
  }
  const amount = state.amount;
  if (!(amount > 0)) { toast('Informe um valor válido.', 'error'); return; }
  if (amount > state.balance) { toast('Saldo insuficiente.', 'error'); return; }

  state.balance -= amount;
  const now = Date.now();
  const t = {
    id: ++tradeSeq,
    assetId: a.id,
    pair: a.pair,
    otc: a.otc,
    dir,
    amount,
    payout: a.payout,
    entry: a.price,
    entryTime: now,
    expiry: now + state.expiry * 1000,
    expiryLabel: state.expiry >= 60 ? (state.expiry / 60) + ' min' : state.expiry + ' seg',
  };
  state.trades.push(t);
  toast('Ordem ' + dir + ' · ' + fmtBRL(amount) + ' · ' + a.pair + (a.otc ? ' (OTC)' : '') +
        ' @ ' + t.entry.toFixed(a.dec) + ' · expira em ' + t.expiryLabel, 'info');
  renderBalance();
  renderTrades();
}

function settleTrades() {
  const now = Date.now();
  let changed = false;

  for (const t of state.trades) {
    if (now < t.expiry) continue;
    const a = byId[t.assetId];
    const final = a ? a.price : t.entry;

    let res;
    if (final === t.entry) res = 'draw';
    else if (t.dir === 'CALL') res = final > t.entry ? 'win' : 'loss';
    else res = final < t.entry ? 'win' : 'loss';

    if (res === 'win')  state.balance += t.amount * (1 + t.payout / 100);
    if (res === 'draw') state.balance += t.amount;

    t.result = res;
    t.final  = final;
    state.history.unshift(t);
    changed = true;

    if (res === 'win') {
      toast('✔ ' + t.pair + (t.otc ? ' OTC' : '') + ' — GANHO de ' +
            fmtBRL(t.amount * t.payout / 100), 'success');
    } else if (res === 'loss') {
      toast('✖ ' + t.pair + (t.otc ? ' OTC' : '') + ' — perda de ' + fmtBRL(t.amount), 'error');
    } else {
      toast('≡ ' + t.pair + ' — empate, valor devolvido.', 'info');
    }
  }
  if (state.history.length > 12) state.history.length = 12;

  state.trades = state.trades.filter(t => now < t.expiry);
  if (changed) {
    renderBalance();
    renderHistory();
  }
}

function renderBalance() {
  $('balance').textContent = fmtBRL(state.balance);
  $('profitPot').textContent = fmtBRL(state.amount * byId[state.activeId].payout / 100);
  $('payoutPct').textContent = byId[state.activeId].payout + '%';
}

function renderTrades() {
  const ul = $('openTrades');
  ul.innerHTML = '';
  $('openCount').textContent = state.trades.length;

  if (!state.trades.length) {
    ul.innerHTML = '<li class="empty">Nenhuma operação aberta.</li>';
  }
  for (const t of state.trades) {
    const a = byId[t.assetId];
    const now = Date.now();
    const left = Math.max(0, t.expiry - now);
    const prog = Math.min(100, (now - t.entryTime) / (t.expiry - t.entryTime) * 100);
    const diff = (a.price - t.entry);
    const winning = t.dir === 'CALL' ? diff > 0 : diff < 0;
    const li = document.createElement('li');
    li.className = 'trade ' + (winning ? 'winning' : 'losing');
    li.innerHTML =
      '<div class="t-head">' +
        '<span class="t-dir ' + t.dir.toLowerCase() + '">' + (t.dir === 'CALL' ? '▲' : '▼') + ' ' + t.dir + '</span>' +
        '<span class="t-pair">' + t.pair + (t.otc ? ' <em>OTC</em>' : '') + '</span>' +
        '<span class="t-amount">' + fmtBRL(t.amount) + '</span>' +
      '</div>' +
      '<div class="t-body">' +
        '<span>entrada <b>' + t.entry.toFixed(a.dec) + '</b></span>' +
        '<span>atual <b>' + a.price.toFixed(a.dec) + '</b></span>' +
        '<span class="' + (winning ? 'tx-up' : 'tx-down') + '">' + (diff >= 0 ? '+' : '') + diff.toFixed(a.dec) + '</span>' +
        '<span class="t-left">' + fmtDur(left).slice(3) + '</span>' +
      '</div>' +
      '<div class="t-bar"><i style="width:' + prog + '%"></i></div>';
    ul.appendChild(li);
  }

  /* linha de entrada no gráfico (apenas do ativo exibido) */
  const mine = state.trades.filter(t => t.assetId === state.activeId);
  chart.setEntry(mine.length ? { price: mine[0].entry, dir: mine[0].dir } : null);
}

function renderHistory() {
  const ul = $('tradeHistory');
  ul.innerHTML = '';
  if (!state.history.length) {
    ul.innerHTML = '<li class="empty">Sem resultados ainda.</li>';
    return;
  }
  for (const t of state.history) {
    const li = document.createElement('li');
    li.className = 'trade hist ' + t.result;
    const delta = t.result === 'win' ? '+' + fmtBRL(t.amount * t.payout / 100)
               : t.result === 'loss' ? '−' + fmtBRL(t.amount)
               : 'R$ 0,00';
    li.innerHTML =
      '<div class="t-head">' +
        '<span class="t-dir ' + t.dir.toLowerCase() + '">' + (t.dir === 'CALL' ? '▲' : '▼') + '</span>' +
        '<span class="t-pair">' + t.pair + (t.otc ? ' <em>OTC</em>' : '') + '</span>' +
        '<span class="badge ' + t.result + '">' +
          (t.result === 'win' ? 'GANHO' : t.result === 'loss' ? 'PERDA' : 'EMPATE') + '</span>' +
        '<span class="t-amount">' + delta + '</span>' +
      '</div>';
    ul.appendChild(li);
  }
}

/* ---------- análise (o "Oracu") ---------- */
function ema(values, period) {
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  const slice = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + (gains / period) / (losses / period));
}

function updateSignal(a) {
  const closes = a.candles.map(c => c.c);
  const e9  = ema(closes.slice(-30), 9);
  const e21 = ema(closes.slice(-60), 21);
  const r   = rsi(closes);

  let score = 0;
  if (e9 > e21) score += 1; else score -= 1;
  if (r > 55) score += 1; else if (r < 45) score -= 1;
  if (r > 70) score += 0.5; else if (r < 30) score -= 0.5;

  let dir = 'NEUTRO', conf = 50 + Math.abs(score) * 12;
  if (score >= 1)  dir = 'CALL';
  if (score <= -1) dir = 'PUT';
  conf = Math.min(92, Math.round(conf));

  const badge = $('sigBadge');
  badge.className = 'signal-badge ' + dir.toLowerCase();
  badge.textContent = dir === 'CALL' ? '▲ CALL — COMPRA' :
                      dir === 'PUT'  ? '▼ PUT — VENDA' : '◆ NEUTRO — AGUARDE';
  $('sigConf').textContent = conf + '%';
  $('sigConfBar').style.width = conf + '%';
  $('sigConfBar').className = 'conf-bar-fill ' + dir.toLowerCase();
  $('sigRsi').textContent = r.toFixed(1) + (r > 70 ? ' (sobrecomprado)' : r < 30 ? ' (sobrevendido)' : '');
  $('sigEma').textContent = e9.toFixed(a.dec) + ' / ' + e21.toFixed(a.dec);
  $('sigTrend').textContent = e9 > e21 ? 'Alta' : e9 < e21 ? 'Baixa' : 'Lateral';
}

/* ---------- sessões ---------- */
function renderSessions() {
  const bar = $('sessionsBar');
  bar.innerHTML = '';
  for (const s of Market.sessions()) {
    const el = document.createElement('span');
    el.className = 'session ' + (s.open ? 'on' : 'off');
    el.innerHTML = '<i class="dot ' + (s.open ? 'on' : 'off') + '"></i>' + s.name;
    el.title = s.start + 'h–' + s.end + 'h UTC';
    bar.appendChild(el);
  }
}

/* ---------- relógios ---------- */
function renderClocks() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  $('utcClock').innerHTML =
    p(now.getHours()) + ':' + p(now.getMinutes()) + ':' + p(now.getSeconds()) +
    ' <small>local · UTC ' + p(now.getUTCHours()) + ':' + p(now.getUTCMinutes()) + '</small>';
}

/* ---------- loop principal ---------- */
function tick() {
  const minute = Math.floor(Date.now() / 60000);

  for (const a of ASSETS) {
    const last = a.candles[a.candles.length - 1];
    const prev = last.c;
    const np   = prev * (1 + gauss() * a.vol);
    const curT = minute * 60000;

    if (last.t === curT) {
      last.c = np;
      if (np > last.h) last.h = np;
      if (np < last.l) last.l = np;
    } else {
      a.candles.push({
        t: curT, o: prev,
        h: Math.max(prev, np), l: Math.min(prev, np), c: np,
      });
      if (a.candles.length > 240) a.candles.shift();
      if (a.id === state.activeId) updateSignal(a);
    }
    a.price = np;
    a.up    = np >= prev;
  }

  const a = byId[state.activeId];
  if (a) chart.setData(a.candles, a.dec, a.price, a.up);

  const wasOpen = state.marketOpen;
  applyMarketState();
  renderSidebarPrices();
  renderPriceHeader();
  settleTrades();
  renderTrades();
  renderSessions();
  renderClocks();
}

/* ---------- eventos ---------- */
function bindEvents() {
  $('btnCall').addEventListener('click', () => placeTrade('CALL'));
  $('btnPut').addEventListener('click',  () => placeTrade('PUT'));

  $('amtMinus').addEventListener('click', () => changeAmount(-10));
  $('amtPlus').addEventListener('click',  () => changeAmount(10));
  $('amount').addEventListener('input', e => {
    state.amount = Math.max(0, parseFloat(e.target.value) || 0);
    renderBalance();
  });

  $('expiry').addEventListener('change', e => {
    state.expiry = parseInt(e.target.value, 10);
  });

  $('assetSearch').addEventListener('input', filterAssets);

  $('forceOtc').addEventListener('change', e => {
    state.forceOtc = e.target.checked;
    applyMarketState();
    toast(state.forceOtc
      ? 'Modo de teste ativado: mercado simulado como FECHADO — operando em OTC.'
      : 'Modo de teste desativado — usando o status real do mercado.', 'info');
  });
}

function changeAmount(delta) {
  state.amount = Math.max(1, Math.round((state.amount + delta)));
  $('amount').value = state.amount;
  renderBalance();
}

/* ---------- inicialização ---------- */
function init() {
  state.marketOpen = marketOpen();
  buildSidebar();
  bindEvents();

  /* começa no OTC se o mercado estiver fechado */
  const first = state.marketOpen ? byId.EURUSD : byId.EURUSD_OTC;
  state.activeId = first.id;
  renderSidebarState();
  renderChartHeader();
  updateSignal(first);
  renderBalance();
  renderHistory();
  renderSessions();
  renderClocks();
  applyMarketState();
  tick();
  setInterval(tick, 1000);

  if (!state.marketOpen) {
    setTimeout(() => toast('Mercado fechado — operando em modo OTC (24h).', 'warn'), 600);
  }
}

document.addEventListener('DOMContentLoaded', init);
