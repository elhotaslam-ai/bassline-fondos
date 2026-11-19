/* =========================================================
   Bassline — interacciones (JavaScript vanilla)
   ========================================================= */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Lee los colores de :root para usarlos en canvas (nada hardcodeado) ---
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const ACCENT = hexToRgb(token('--accent'));
  const rgba = (a) => `rgba(${ACCENT[0]}, ${ACCENT[1]}, ${ACCENT[2]}, ${a})`;

  /* ---------- Año del footer ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Menú hamburguesa ---------- */
  const burger = document.querySelector('.burger');
  const links = document.getElementById('nav-links');
  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    links.classList.toggle('open', open);
  };
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /* ---------- Animaciones de entrada al hacer scroll ---------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); revealIO.unobserve(entry.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach((el) => revealIO.observe(el));

  /* ---------- Contadores animados ---------- */
  const animateCount = (el) => {
    const to = Number(el.dataset.to);
    if (reduceMotion) { el.textContent = to; return; }
    const dur = 1400, start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const statsIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.querySelectorAll('.counter').forEach(animateCount);
      entry.target.querySelectorAll('.stat-bar i').forEach((b) => { b.style.width = b.dataset.w; });
      statsIO.unobserve(entry.target);
    });
  }, { threshold: 0.4 });
  document.querySelectorAll('.stats').forEach((el) => statsIO.observe(el));

  /* ---------- Lista de espera → Supabase (tabla bassline_waitlist) ----------
     La clave "anon" es pública por diseño: la tabla tiene RLS y solo
     permite INSERT al rol anon (nadie puede leer los emails desde aquí).
     La URL y la clave vienen de js/config.js, generado desde .env con
     `node build-config.mjs`. */
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.BASSLINE_CONFIG || {};
  const WAITLIST_TABLE = 'bassline_waitlist';

  const form = document.getElementById('waitlist');
  const msg = document.getElementById('form-msg');
  const submitBtn = form && form.querySelector('button[type="submit"]');
  const showMsg = (text, ok = false) => { msg.className = ok ? 'form-msg ok' : 'form-msg'; msg.textContent = text; };

  // El formulario solo existe en index.html (las páginas legales comparten este JS)
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot: si un bot rellena el campo oculto, fingimos éxito y no enviamos nada
    const honeypot = document.getElementById('wl-website');
    if (honeypot && honeypot.value.trim() !== '') {
      showMsg('¡Dentro! Te escribimos el 31 de diciembre cuando abra la beta.', true);
      form.reset();
      return;
    }

    const nameInput = document.getElementById('wl-name');
    const emailInput = document.getElementById('wl-email');
    const consentInput = document.getElementById('wl-consent');
    const name = nameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();

    if (!name) { showMsg('Dinos cómo te llamas.'); nameInput.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      showMsg('Revisa el email, parece que falta algo.'); emailInput.focus(); return;
    }
    if (!consentInput.checked) {
      showMsg('Marca la casilla para que podamos avisarte el día de la beta.'); consentInput.focus(); return;
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('Waitlist: falta js/config.js. Ejecuta `node build-config.mjs`.');
      showMsg('Algo ha fallado. Prueba otra vez en un momento.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';
    showMsg('');
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${WAITLIST_TABLE}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',          // no pedimos datos de vuelta (anon no puede leer)
        },
        body: JSON.stringify({ name, email, consent: true }),
      });

      if (res.ok) {
        showMsg('¡Dentro! Te escribimos el 31 de diciembre cuando abra la beta.', true);
        form.reset();
      } else if (res.status === 409) {        // email repetido (índice único)
        showMsg('Ya estabas en la lista. ¡Nos vemos el 31 de diciembre!', true);
        form.reset();
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('Waitlist:', err);
      showMsg('Algo ha fallado. Prueba otra vez en un momento.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Apuntarme a la beta';
    }
  });

  /* =========================================================
     "Audio" simulado: genera energía por banda con un pulso
     a ~118 BPM para que todo parezca seguir una canción.
     ========================================================= */
  const BPM = 118;
  const beatAt = (t) => {
    const phase = (t * BPM / 60) % 1;
    return Math.pow(1 - phase, 4);            // golpe que decae rápido
  };
  const bandEnergy = (i, n, t) => {
    const x = i / n;
    const bass = beatAt(t) * Math.max(0, 1 - x * 2.2);          // graves con el bombo
    const snare = beatAt(t + 0.254) * Math.exp(-Math.pow((x - .45) * 4, 2)) * .7;
    const melody = (Math.sin(t * 2.1 + i * .55) * .5 + .5) * (Math.sin(t * .7 + i * .21) * .5 + .5);
    const hats = (Math.sin(t * 13 + i * 1.7) * .5 + .5) * x * .35;
    return Math.min(1, .12 + bass * .85 + snare + melody * .45 + hats);
  };

  /* ---------- Utilidad: canvas nítido en pantallas HiDPI ---------- */
  const fitCanvas = (canvas) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  };

  /* ---------- Bucle de animación que se pausa fuera de pantalla ---------- */
  const runLoop = (canvas, draw) => {
    let view = fitCanvas(canvas), visible = false, raf = 0;
    const frame = (now) => { draw(view, now / 1000); raf = requestAnimationFrame(frame); };
    const start = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    if (reduceMotion) {                       // un único fotograma estático
      draw(view, 1.2);
      window.addEventListener('resize', () => { view = fitCanvas(canvas); draw(view, 1.2); });
      return;
    }
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(canvas);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    window.addEventListener('resize', () => { view = fitCanvas(canvas); });
  };

  /* =========================================================
     HERO: barras de ecualizador sobre suelo en perspectiva
     ========================================================= */
  const heroCanvas = document.getElementById('hero-canvas');
  const BARS = 44;
  const levels = new Float32Array(BARS);

  // Solo en index.html (las páginas legales no tienen hero)
  if (heroCanvas) runLoop(heroCanvas, ({ ctx, w, h }, t) => {
    ctx.clearRect(0, 0, w, h);
    const horizon = h * 0.62;           // línea del horizonte
    const cx = w / 2;

    // --- Suelo: líneas verticales que convergen al punto de fuga ---
    ctx.lineWidth = 1;
    const cols = 26;
    for (let i = -cols; i <= cols; i++) {
      const xBottom = cx + i * (w / cols) * 1.6;
      const a = 0.22 * (1 - Math.abs(i) / cols);
      ctx.strokeStyle = rgba(a);
      ctx.beginPath();
      ctx.moveTo(cx + i * (w / cols) * 0.18, horizon);
      ctx.lineTo(xBottom, h);
      ctx.stroke();
    }
    // --- Suelo: líneas horizontales que avanzan hacia el espectador ---
    const rows = 14, speed = (t * 0.35) % 1;
    for (let r = 0; r < rows; r++) {
      const z = (r + speed) / rows;               // 0 = horizonte, 1 = abajo
      const y = horizon + Math.pow(z, 2.2) * (h - horizon);
      ctx.strokeStyle = rgba(0.05 + z * 0.28);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // Brillo del horizonte
    const hg = ctx.createLinearGradient(0, horizon - 2, 0, horizon + 40);
    hg.addColorStop(0, rgba(0.35)); hg.addColorStop(1, rgba(0));
    ctx.fillStyle = hg; ctx.fillRect(0, horizon, w, 40);

    // --- Barras del ecualizador ---
    const totalW = Math.min(w * 0.82, 980);
    const gap = Math.max(3, totalW / BARS * 0.32);
    const bw = (totalW - gap * (BARS - 1)) / BARS;
    const x0 = cx - totalW / 2;
    const maxH = horizon * 0.82;

    for (let i = 0; i < BARS; i++) {
      // Simetría: graves en el centro, agudos hacia los lados
      const band = Math.abs(i - (BARS - 1) / 2) / (BARS / 2) * BARS;
      const target = bandEnergy(band, BARS, t);
      levels[i] += (target - levels[i]) * (target > levels[i] ? 0.45 : 0.12); // sube rápido, cae suave
      const bh = Math.max(4, levels[i] * maxH);
      const x = x0 + i * (bw + gap);
      const y = horizon - bh;

      const g = ctx.createLinearGradient(0, y, 0, horizon);
      g.addColorStop(0, rgba(1));
      g.addColorStop(1, rgba(0.15));
      ctx.fillStyle = g;
      ctx.shadowColor = rgba(0.6);
      ctx.shadowBlur = 18 * levels[i];
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, bw, bh, [Math.min(bw / 2, 4), Math.min(bw / 2, 4), 0, 0]) : ctx.rect(x, y, bw, bh);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Reflejo sobre el suelo
      const rh = bh * 0.35;
      const rg = ctx.createLinearGradient(0, horizon, 0, horizon + rh);
      rg.addColorStop(0, rgba(0.22)); rg.addColorStop(1, rgba(0));
      ctx.fillStyle = rg;
      ctx.fillRect(x, horizon + 2, bw, rh);
    }
  });

})();
