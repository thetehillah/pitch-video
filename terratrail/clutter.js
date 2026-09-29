// The "manual operations" clutter: WhatsApp-style chat bubbles, a scrolling spreadsheet and receipt
// thumbnails, getting more crowded over 8 seconds. Used by scene 1 (build-up) and scene 3 (exit).
// update(t, exit): t = seconds into the build-up (clamped to 8), exit = 0..1 slide-off progress.

const CLUTTER_END = 8;

const MESSAGES = [
  'Good morning, I have paid for plot 14',
  'Sent ₦250,000 this morning',
  'Please send my receipt',
  'When is my next payment due?',
  'Has my March payment reflected?',
  'Who sold plot B7? My commission?',
  'Kindly resend the payment schedule',
  'Transfer done. Receipt attached',
  'What is my balance now?',
  'Is inspection still on Saturday?',
  'I paid last week, check again',
  'Commission for last month?',
  'Please confirm receipt',
  'Which account do I pay into?',
  'My name is not on the sheet',
  'Balance remaining?',
];

const SHEET_NAMES = ['Adebayo O.', 'Chioma N.', 'Ibrahim S.', 'Funke A.', 'Emeka U.', 'Aisha B.', 'Tunde K.',
  'Ngozi E.', 'Yusuf M.', 'Bola T.', 'Kelechi I.', 'Halima D.', 'Segun F.', 'Amaka O.', 'Musa L.', 'Tolu J.'];
const SHEET_NOTES = ['paid', 'pending', 'check WA', '??', 'part', 'paid', 'confirm', 'late', 'paid', 'ask rep'];

function buildClutter(stage) {
  const rng = mulberry32(20260929);
  const root = el('div', { style: { position: 'absolute', inset: '0' } }, stage);

  // --- Spreadsheet -------------------------------------------------------------------------------
  const sheet = el('div', { style: {
    position: 'absolute', left: '110px', top: '96px', width: '960px', height: '720px',
    border: '2px solid #111', background: 'var(--paper)', overflow: 'hidden',
    fontSize: '21px', color: '#111',
  } }, root);
  const cols = [
    ['Buyer', 210], ['Plot', 100], ['Amount', 200], ['Paid', 180], ['Due', 140], ['Note', 130],
  ];
  const rowH = 48;
  const header = el('div', { style: { position: 'absolute', left: 0, top: 0, right: 0, height: rowH + 'px',
    display: 'flex', background: '#EFECE7', borderBottom: '2px solid #111', fontWeight: '600', zIndex: 2 } }, sheet);
  for (const [name, w] of cols)
    el('div', { text: name, style: { width: w + 'px', padding: '0 12px', lineHeight: rowH + 'px',
      borderRight: '1px solid #111', boxSizing: 'border-box' } }, header);
  const body = el('div', { style: { position: 'absolute', left: 0, right: 0, top: rowH + 'px' } }, sheet);
  const ROWS = 60;
  for (let i = 0; i < ROWS; i++) {
    const r = el('div', { style: { display: 'flex', height: rowH + 'px', borderBottom: '1px solid #111' } }, body);
    const amount = 500000 + Math.floor(rng() * 40) * 125000;
    const paid = Math.floor(amount * rng() / 50000) * 50000;
    const cells = [
      SHEET_NAMES[i % SHEET_NAMES.length],
      String.fromCharCode(65 + (i * 7) % 6) + (1 + (i * 13) % 40),
      naira(amount),
      naira(paid),
      `${1 + (i * 11) % 28}/${1 + (i * 5) % 12}`,
      SHEET_NOTES[(i * 3) % SHEET_NOTES.length],
    ];
    cells.forEach((c, k) => el('div', { text: c, style: { width: cols[k][1] + 'px', padding: '0 12px',
      lineHeight: rowH + 'px', borderRight: '1px solid #111', boxSizing: 'border-box', whiteSpace: 'nowrap',
      overflow: 'hidden' } }, r));
  }

  // --- Receipts ----------------------------------------------------------------------------------
  const receipts = [];
  const M = 24;
  for (let k = 0; k < M; k++) {
    const start = 1.5 + 6.4 * Math.pow(k / M, 0.75);
    const r = el('div', { style: {
      position: 'absolute', left: 0, top: 0, width: '170px', height: '220px', borderRadius: '10px',
      background: '#E4E1DC', border: '1.5px solid #C9C5BF', boxSizing: 'border-box', padding: '18px 16px',
      fontSize: '15px', color: '#8E8A84', willChange: 'transform',
    } }, root);
    el('div', { text: 'RECEIPT', style: { fontWeight: '700', letterSpacing: '0.12em', marginBottom: '14px' } }, r);
    for (let l = 0; l < 4; l++)
      el('div', { style: { height: '8px', width: 60 + ((k * 17 + l * 29) % 70) + 'px', background: '#CBC7C1',
        borderRadius: '4px', marginBottom: '10px' } }, r);
    el('div', { text: naira((2 + Math.floor(rng() * 30)) * 50000), style: { marginTop: '20px', fontSize: '24px',
      fontWeight: '700', color: '#9A968F' } }, r);
    receipts.push({ node: r, start, y: 70 + rng() * 700, speed: 420 + rng() * 260, tilt: 0 });
  }

  // --- Chat bubbles ------------------------------------------------------------------------------
  const bubble = (text) => el('div', { text, style: {
    position: 'absolute', left: 0, top: 0, height: '64px', lineHeight: '64px', padding: '0 26px',
    background: '#111', color: '#FAF8F5', borderRadius: '24px 24px 24px 6px', fontSize: '24px',
    fontWeight: '500', whiteSpace: 'nowrap', transformOrigin: '0% 100%', willChange: 'transform, opacity',
  } }, root);

  // First wave: a readable chat column that stacks up on the right.
  const stackTimes = [0.35, 0.95, 1.5, 2.0, 2.45, 2.85, 3.2, 3.5, 3.8, 4.05, 4.3, 4.5];
  const stack = stackTimes.map((start, i) => ({ node: bubble(MESSAGES[i % MESSAGES.length]), start,
    dx: i % 3 === 1 ? 70 : 0 }));

  // Second wave: bubbles land everywhere, faster and faster, until it is too much.
  const scatter = [];
  const N = 36;
  for (let k = 0; k < N; k++) {
    const start = 3.6 + 4.2 * Math.pow(k / N, 0.65);
    scatter.push({ node: bubble(MESSAGES[(k * 5 + 3) % MESSAGES.length]), start,
      x: 40 + rng() * 1380, y: 50 + rng() * 780 });
  }

  const pop = (p) => ({ o: ease.out(clamp(p * 1.6)), s: lerp(0.86, 1, ease.out(p)) });

  return {
    update(t, exit = 0) {
      t = Math.min(t, CLUTTER_END);
      const ex = ease.inOut(exit);

      // Spreadsheet: fades in, then scrolls, accelerating.
      const sheetIn = ease.out(prog(t, 0.1, 0.6));
      sheet.style.opacity = sheetIn;
      const scrollT = Math.max(0, t - 1.0);
      const scroll = 40 * scrollT + 22 * scrollT * scrollT; // px
      body.style.transform = `translateY(${-scroll}px)`;
      sheet.style.transform = `translate(${lerp(0, -1300, ex)}px, ${lerp(24, 0, sheetIn)}px)`;

      // Receipts slide right to left across the frame.
      for (const r of receipts) {
        const dt = t - r.start;
        if (dt < 0) { r.node.style.opacity = 0; continue; }
        const x = 1940 - r.speed * dt;
        r.node.style.opacity = 1;
        r.node.style.transform = `translate(${x - lerp(0, 2300, ex)}px, ${r.y}px)`;
      }

      // Stacked chat column: each new bubble pushes the stack up by one slot.
      const slot = 80, baseY = 790, colX = 1200;
      stack.forEach((b, i) => {
        const p = prog(t, b.start, 0.32);
        if (p <= 0) { b.node.style.opacity = 0; return; }
        let lift = 0;
        for (let j = i + 1; j < stack.length; j++) lift += ease.out(prog(t, stack[j].start, 0.32)) * slot;
        const { o, s } = pop(p);
        b.node.style.opacity = o;
        b.node.style.transform =
          `translate(${colX + b.dx + lerp(0, 1100, ex)}px, ${baseY - lift}px) scale(${s})`;
      });

      for (const b of scatter) {
        const p = prog(t, b.start, 0.28);
        if (p <= 0) { b.node.style.opacity = 0; continue; }
        const { o, s } = pop(p);
        const dir = b.x > 800 ? 1 : -1;
        b.node.style.opacity = o;
        b.node.style.transform = `translate(${b.x + dir * lerp(0, 1500, ex)}px, ${b.y}px) scale(${s})`;
      }
    },
  };
}
