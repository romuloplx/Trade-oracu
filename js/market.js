/* =========================================================
   Market — status do mercado forex, sessões e contagem regressiva
   Convenção do forex: abre domingo 17:00 ET, fecha sexta 17:00 ET
   ========================================================= */
const Market = (() => {

  // Horário de verão dos EUA (2º domingo de março → 1º domingo de novembro)
  function isUSDST(d) {
    const y  = d.getUTCFullYear();
    const m1 = new Date(Date.UTC(y, 2, 1)).getUTCDay();
    const n1 = new Date(Date.UTC(y, 10, 1)).getUTCDay();
    const start = Date.UTC(y, 2, 1 + ((7 - m1) % 7) + 7, 7); // 02:00 EST = 07:00 UTC
    const end   = Date.UTC(y, 10, 1 + ((7 - n1) % 7), 6);    // 02:00 EDT = 06:00 UTC
    const t = d.getTime();
    return t >= start && t < end;
  }

  // 17:00 ET equivale a 21:00 UTC (verão dos EUA) ou 22:00 UTC (inverno)
  function boundaryHour(date) { return isUSDST(date) ? 21 : 22; }

  function status(now = new Date()) {
    const h   = boundaryHour(now);
    const day = now.getUTCDay();       // 0 = dom … 5 = sex, 6 = sáb
    const hh  = now.getUTCHours();

    if (day === 6) return false;                 // sábado: sempre fechado
    if (day === 5 && hh >= h) return false;      // sexta a partir das 17:00 ET
    if (day === 0 && hh <  h) return false;      // domingo antes das 17:00 ET
    return true;
  }

  // Próximo horário-limite (17:00 ET) de um determinado dia da semana
  function nextBoundary(now, targetDay) {
    for (let i = 0; i <= 8; i++) {
      const d = new Date(now.getTime() + i * 864e5);
      if (d.getUTCDay() !== targetDay) continue;
      const b = new Date(Date.UTC(
        d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
        boundaryHour(d), 0, 0
      ));
      if (b > now) return b;
    }
    return new Date(now.getTime() + 864e5);
  }

  function countdown(now = new Date()) {
    const open    = status(now);
    const target  = open ? nextBoundary(now, 5)   // aberto  → fecha sexta 17:00 ET
                         : nextBoundary(now, 0);   // fechado → abre domingo 17:00 ET
    return { open, target, ms: target - now };
  }

  /* Sessões (horários aproximados em UTC) */
  const SESSIONS = [
    { name: 'Sydney',    start: 21, end: 6  },
    { name: 'Tóquio',    start: 0,  end: 9  },
    { name: 'Londres',   start: 8,  end: 17 },
    { name: 'Nova York', start: 13, end: 22 },
  ];

  function sessionOpen(s, hour) {
    return s.start < s.end
      ? hour >= s.start && hour < s.end
      : hour >= s.start || hour < s.end;   // janela que cruza a meia-noite
  }

  function sessions(now = new Date()) {
    const h = now.getUTCHours();
    return SESSIONS.map(s => ({ ...s, open: sessionOpen(s, h) }));
  }

  return { status, countdown, sessions, isUSDST };
})();
