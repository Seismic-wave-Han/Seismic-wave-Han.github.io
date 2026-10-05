/* Interactive behaviour for the homepage.
   1. Email popover
   2. Pinned scroll stages: a shared mechanism for the research highlight effects
   3. Effect "fault":   fault slip with a sheared gouge zone (S-wave polarization highlight)
   4. Effect "rupture": cascading slip pulses that smear the ink (Jeju multi-stage rupture)
   5. Effect "wave":    P- and S-wavefronts kicking the letters (Tewksbury / NYC shaking) */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function env(p, a, b) { return clamp01((p - a) / (b - a)); }     /* 0 before a, 1 after b */
  function rnd(i, k) {                                              /* deterministic pseudo-random in [0, 1) */
    var x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  function cloneLayer(content, cls) {
    var el = content.cloneNode(true);
    el.className = content.className + ' ' + cls;
    el.setAttribute('aria-hidden', 'true');
    Array.prototype.forEach.call(el.querySelectorAll('a, button'), function (a) { a.tabIndex = -1; });
    content.parentNode.appendChild(el);
    return el;
  }

  /* Keep an unsplit copy of `el` for assistive technology and mark `el` as decorative. */
  function animatedCopy(el) {
    var sr = el.cloneNode(true);
    sr.classList.add('sr-only');
    el.parentNode.insertBefore(sr, el);
    el.setAttribute('aria-hidden', 'true');
    Array.prototype.forEach.call(el.querySelectorAll('a, button'), function (a) { a.tabIndex = -1; });
  }

  /* Split the text nodes under `root` into word spans (.w) holding letter spans (.c). */
  function splitText(root, words, letters) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!node.nodeValue.trim()) return;
      var frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (tok) {
        if (!tok) return;
        if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
        var w = document.createElement('span');
        w.className = 'w';
        Array.from(tok).forEach(function (ch) {
          var c = document.createElement('span');
          c.className = 'c';
          c.textContent = ch;
          w.appendChild(c);
          letters.push({ el: c, ch: ch, x: 0, y: 0, hit: false });
        });
        words.push({ el: w, x: 0, hit: false });
        frag.appendChild(w);
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 1. Email popover                                                    */
  /* ------------------------------------------------------------------ */
  (function () {
    var btn = document.querySelector('.email-btn');
    var pop = document.getElementById('email-popover');
    if (!btn || !pop) return;

    function isOpen() { return pop.classList.contains('open'); }
    function setOpen(open) {
      pop.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!isOpen()); });
    document.addEventListener('click', function (e) { if (isOpen() && !pop.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { setOpen(false); btn.focus(); }
    });

    var copy = pop.querySelector('.copy-btn');
    if (copy && navigator.clipboard) {
      var label = copy.querySelector('.copy-label');
      var timer = null;
      copy.addEventListener('click', function () {
        navigator.clipboard.writeText(copy.dataset.copy).then(function () {
          copy.classList.add('copied');
          label.textContent = 'Copied';
          clearTimeout(timer);
          timer = setTimeout(function () { copy.classList.remove('copied'); label.textContent = 'Copy'; }, 1600);
        });
      });
    } else if (copy) {
      copy.hidden = true;
    }
  })();

  /* ------------------------------------------------------------------ */
  /* 2. Pinned scroll stages                                             */
  /*    .stage > .stage-pin (sticky) + .stage-spacer. While the pin is   */
  /*    stuck below the nav, the spacer's height of scroll is mapped to  */
  /*    a progress value p in [0, 1] and handed to the effect.           */
  /* ------------------------------------------------------------------ */
  var stages = [];

  function registerStage(name, build) {
    var el = document.querySelector('.stage[data-effect="' + name + '"]');
    if (!el) return;
    var pin = el.querySelector('.stage-pin');
    var spacer = el.querySelector('.stage-spacer');
    if (!pin || !spacer) return;
    var st = { el: el, pin: pin, spacer: spacer, pinTop: 0, lastP: -1, effect: null };
    st.effect = build(st);
    if (st.effect) stages.push(st);
  }

  function updateStages() {
    for (var i = 0; i < stages.length; i++) {
      var st = stages[i];
      var top = st.el.getBoundingClientRect().top;
      var D = st.spacer.offsetHeight || 1;
      var p = clamp01((st.pinTop - top) / D);
      if (p !== st.lastP) {
        st.effect.update(p, st.lastP);
        st.lastP = p;
      }
    }
  }

  function layoutStages() {
    for (var i = 0; i < stages.length; i++) {
      var st = stages[i];
      st.pinTop = parseFloat(getComputedStyle(st.pin).top) || 0;
      if (st.effect.measure) st.effect.measure();
      st.lastP = -1;
    }
    updateStages();
  }

  /* ------------------------------------------------------------------ */
  /* 3. Fault slip (S-wave polarization highlight)                       */
  /*    Ten lines of scroll play out an earthquake cycle on the text:    */
  /*      0-60 %   interseismic loading: far-field creep, the gouge zone  */
  /*               between the blocks shears elastically                 */
  /*      60 %     coseismic rupture: sudden slip, crushed gouge, and     */
  /*               ground shaking (P wiggle, S burst, decaying coda)      */
  /*      60-100 % postseismic: logarithmic afterslip and aftershocks     */
  /*    The text is split into block A (upper-left), block B (lower-     */
  /*    right) and the gouge band G between them.                        */
  /* ------------------------------------------------------------------ */
  registerStage('fault', function (stage) {
    var fault = stage.el.querySelector('.fault');
    var content = fault && fault.querySelector('.fault-content');
    var disp = document.querySelector('#gouge-filter feDisplacementMap');
    if (!fault || !content) return null;

    var DIP = 32 * Math.PI / 180;      /* fault angle from horizontal */
    var P_RUPTURE = 0.6;               /* scroll fraction at which the mainshock occurs */
    var PRESLIP = 0.1;                 /* fraction of total slip taken up before the mainshock */
    var COSEISMIC = 0.88;              /* fraction reached by the mainshock itself */
    var AFTERSLIP_K = 60;              /* steepness of the logarithmic afterslip */
    var CRUMPLE_MAX = 2.4;             /* displacement-map scale for the crushed gouge */
    var SHOCKS = [[P_RUPTURE, 1], [0.78, 0.45], [0.92, 0.25]];   /* [progress, amplitude] */

    var layerB = cloneLayer(content, 'fault-layer fault-b');
    var layerG = cloneLayer(content, 'fault-layer fault-g');

    /* u = unit vector along the fault (up-right); n = unit normal to the lower-right side */
    var geo = { W: 0, H: 0, S: 0, w: 0, ux: Math.cos(DIP), uy: -Math.sin(DIP), nx: Math.sin(DIP), ny: Math.cos(DIP) };

    function clipHalfPlane(poly, ax, ay, c) {          /* keep points with ax*x + ay*y <= c */
      var out = [];
      for (var i = 0; i < poly.length; i++) {
        var P = poly[i], Q = poly[(i + 1) % poly.length];
        var dP = ax * P[0] + ay * P[1] - c, dQ = ax * Q[0] + ay * Q[1] - c;
        if (dP <= 0) out.push(P);
        if ((dP < 0 && dQ > 0) || (dP > 0 && dQ < 0)) {
          var t = dP / (dP - dQ);
          out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
        }
      }
      return out;
    }
    function toClipPath(poly) {
      if (poly.length < 3) return 'polygon(0 0, 0 0, 0 0)';
      return 'polygon(' + poly.map(function (P) { return P[0].toFixed(1) + 'px ' + P[1].toFixed(1) + 'px'; }).join(', ') + ')';
    }

    function measure() {
      var W = content.offsetWidth, H = content.offsetHeight;
      var para = content.querySelector('p') || content;
      var cs = getComputedStyle(para);
      var lineHeight = parseFloat(cs.lineHeight) || 24;
      var probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;width:2ch;height:0;';
      para.appendChild(probe);
      var w = probe.offsetWidth || parseFloat(cs.fontSize) * 1.1;    /* gouge width: two characters */
      para.removeChild(probe);

      geo.W = W; geo.H = H; geo.w = w;
      geo.S = (0.5 * lineHeight) / Math.sin(DIP);      /* total slip: half a line of vertical offset */

      var rect = [[0, 0], [W, 0], [W, H], [0, H]];
      var cx = W / 2, cy = H / 2, nc = geo.nx * cx + geo.ny * cy;
      var A = clipHalfPlane(rect, geo.nx, geo.ny, nc - w / 2);
      var B = clipHalfPlane(rect, -geo.nx, -geo.ny, -(nc + w / 2));
      var G = clipHalfPlane(clipHalfPlane(rect, geo.nx, geo.ny, nc + w / 2), -geo.nx, -geo.ny, -(nc - w / 2));
      content.style.clipPath = toClipPath(A);
      layerB.style.clipPath = toClipPath(B);
      layerG.style.clipPath = toClipPath(G);
      layerG.style.transformOrigin = cx + 'px ' + cy + 'px';
    }

    var ruptured = false, crumple = 0, crumpleTarget = 0, crumpleRaf = null;
    var fired = SHOCKS.map(function () { return false; });

    function slipFraction(p) {
      if (p < P_RUPTURE) return PRESLIP * (p / P_RUPTURE);
      var t = (p - P_RUPTURE) / (1 - P_RUPTURE);
      return COSEISMIC + (1 - COSEISMIC) * Math.log(1 + AFTERSLIP_K * t) / Math.log(1 + AFTERSLIP_K);
    }
    function shake(amplitude) {
      if (reduceMotion) return;
      stage.pin.style.setProperty('--shake', amplitude);
      stage.pin.classList.remove('shaking');
      void stage.pin.offsetWidth;
      stage.pin.classList.add('shaking');
    }
    stage.pin.addEventListener('animationend', function () { stage.pin.classList.remove('shaking'); });

    function setCrumple(target) {
      crumpleTarget = target;
      if (!disp || crumpleRaf) return;
      var step = function () {
        crumple += (crumpleTarget - crumple) * 0.25;
        if (Math.abs(crumpleTarget - crumple) < 0.05) crumple = crumpleTarget;
        disp.setAttribute('scale', (crumple * CRUMPLE_MAX).toFixed(2));
        crumpleRaf = crumple === crumpleTarget ? null : requestAnimationFrame(step);
      };
      crumpleRaf = requestAnimationFrame(step);
    }

    function update(p, lastP) {
      var f = slipFraction(p);
      var half = geo.S * f / 2;
      var dx = (geo.ux * half).toFixed(2), dy = (geo.uy * half).toFixed(2);
      content.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      layerB.style.transform = 'translate(' + (-dx) + 'px, ' + (-dy) + 'px)';
      /* gouge: simple shear in the fault frame joining block A to block B */
      var skew = -Math.atan2(geo.S * f, geo.w);
      var dip = (DIP * 180 / Math.PI).toFixed(2) + 'deg';
      layerG.style.transform = 'rotate(-' + dip + ') skewX(' + (skew * 180 / Math.PI).toFixed(2) + 'deg) rotate(' + dip + ')';

      var nowRuptured = p >= P_RUPTURE;
      if (nowRuptured !== ruptured) {
        ruptured = nowRuptured;
        fault.classList.toggle('ruptured', ruptured);
        setCrumple(ruptured ? 1 : 0);
      }
      for (var i = 0; i < SHOCKS.length; i++) {
        if (!fired[i] && p >= SHOCKS[i][0] && lastP >= 0 && lastP < SHOCKS[i][0]) { fired[i] = true; shake(SHOCKS[i][1]); }
        else if (fired[i] && p < SHOCKS[i][0] - 0.05) fired[i] = false;
      }
    }

    return { measure: measure, update: update };
  });

  /* ------------------------------------------------------------------ */
  /* 4. Cascading rupture (Jeju multi-stage rupture highlight)           */
  /*    Every letter carries a hidden copy of itself rendered through    */
  /*    the ink-smear filter. When a circular rupture front reaches a    */
  /*    letter, that copy flashes to full strength and settles at half   */
  /*    strength, so the smear travels letter by letter with the front.  */
  /*      4 %, 11 %   two weak nucleation phases: a flicker near the      */
  /*                  hypocentre that fades again                        */
  /*      16-46 %     subevent 1: slow, bilateral, from the right         */
  /*      46-52 %     pause                                               */
  /*      52-88 %     subevent 2: faster, from the western end of S1,     */
  /*                  spreading into everything S1 did not break         */
  /*      88-100 %    healing: the residual smear fades out               */
  /* ------------------------------------------------------------------ */
  registerStage('rupture', function (stage) {
    var box = stage.el.querySelector('.rupture');
    var content = box && box.querySelector('.rupture-content');
    if (!box || !content) return null;

    var words = [], letters = [];
    Array.prototype.slice.call(content.children).forEach(function (el) {
      animatedCopy(el);
      splitText(el, words, letters);
    });
    letters.forEach(function (L, i) {
      var wrap = document.createElement('span');
      wrap.className = 'sw';
      wrap.setAttribute('aria-hidden', 'true');
      var ghost = document.createElement('span');
      ghost.className = 's';
      ghost.textContent = L.ch;
      wrap.appendChild(ghost);
      L.el.appendChild(wrap);
      L.el.style.setProperty('--sdur', (0.9 + 0.5 * rnd(i, 7)).toFixed(2) + 's');
    });

    var NUC = [[0.04, 22], [0.11, 32]];                 /* [progress, radius in px] of the nucleation flickers */
    var S1 = { cx: 0.70, cy: 0.50, R: 0.33, start: 0.16, end: 0.46 };
    var S2 = { cx: 0.37, cy: 0.55, R: 1, start: 0.52, end: 0.88 };   /* R is set to reach the farthest corner */
    var HEAL = [0.88, 1.0];
    var g = { W: 1, H: 1 };
    var nucFired = NUC.map(function () { return false; });

    function measure() {
      var r = content.getBoundingClientRect();
      g.W = content.offsetWidth || 1;
      g.H = content.offsetHeight || 1;
      var c1x = S1.cx * g.W, c1y = S1.cy * g.H, c2x = S2.cx * g.W, c2y = S2.cy * g.H;
      S2.R = 0;
      [[0, 0], [g.W, 0], [0, g.H], [g.W, g.H]].forEach(function (P) {
        S2.R = Math.max(S2.R, Math.sqrt((P[0] - c2x) * (P[0] - c2x) + (P[1] - c2y) * (P[1] - c2y)));
      });
      letters.forEach(function (L) {
        var b = L.el.getBoundingClientRect();
        L.x = b.left - r.left + b.width / 2;
        L.y = b.top - r.top + b.height / 2;
        L.d1 = Math.sqrt((L.x - c1x) * (L.x - c1x) + (L.y - c1y) * (L.y - c1y));
        L.d2 = Math.sqrt((L.x - c2x) * (L.x - c2x) + (L.y - c2y) * (L.y - c2y));
      });
    }

    function update(p, lastP) {
      var forward = p > lastP;
      var animate = lastP >= 0 && !reduceMotion;

      /* nucleation flickers */
      NUC.forEach(function (n, i) {
        if (!nucFired[i] && p >= n[0] && lastP >= 0 && lastP < n[0]) {
          nucFired[i] = true;
          if (!reduceMotion) letters.forEach(function (L) {
            if (L.d1 <= n[1]) { L.el.classList.remove('nuc'); void L.el.offsetWidth; L.el.classList.add('nuc'); }
          });
        } else if (nucFired[i] && p < n[0] - 0.03) {
          nucFired[i] = false;
          letters.forEach(function (L) { L.el.classList.remove('nuc'); });
        }
      });

      /* rupture fronts */
      var r1 = p >= S1.start ? S1.R * g.W * env(p, S1.start, S1.end) : -1;
      var r2 = p >= S2.start ? S2.R * env(p, S2.start, S2.end) : -1;
      letters.forEach(function (L) {
        var inside = L.d1 <= r1 || L.d2 <= r2;
        if (!L.hit && inside) {
          L.hit = true;
          L.el.classList.add('hit');
          L.el.classList.toggle('still', !(animate && forward));   /* no burst when the page opens mid-stage */
        } else if (L.hit && !inside && !forward) {
          L.hit = false;
          L.el.classList.remove('hit', 'still');
        }
      });

      /* healing: the residual smear fades out */
      box.style.setProperty('--heal', (1 - env(p, HEAL[0], HEAL[1])).toFixed(3));
    }

    return { measure: measure, update: update };
  });

  /* ------------------------------------------------------------------ */
  /* 5. Passing seismic waves (Tewksbury highlight)                      */
  /*    The title and paragraph are split into words and letters. Two    */
  /*    wavefronts sweep from left to right as the user scrolls: a fast  */
  /*    P front that nudges whole words along the propagation direction, */
  /*    and an S front 1.73 times slower that kicks each letter          */
  /*    transversely with a random amplitude and polarity, after which   */
  /*    the letter rings down as a damped oscillation. Amplitude grows   */
  /*    toward the right, echoing the rupture directivity toward NYC.    */
  /* ------------------------------------------------------------------ */
  registerStage('wave', function (stage) {
    var box = stage.el.querySelector('.wave');
    var content = box && box.querySelector('.wave-content');
    if (!box || !content) return null;

    var VP_VS = 1.73;          /* P-wave speed over S-wave speed */
    var P_S_ARRIVAL = 0.866;   /* scroll fraction at which the S front reaches the right edge */
    var words = [], letters = [];

    Array.prototype.slice.call(content.children).forEach(function (el) {
      if (el.tagName !== 'H3' && !(el.tagName === 'P' && !el.classList.contains('links'))) return;
      animatedCopy(el);
      splitText(el, words, letters);
    });

    var W = 1;
    function measure() {
      var left = content.getBoundingClientRect().left;
      W = content.offsetWidth || 1;
      letters.forEach(function (L, i) {
        var r = L.el.getBoundingClientRect();
        L.x = r.left - left + r.width / 2;
        var amp = 0.5 + 0.5 * (L.x / W);                       /* directivity: stronger toward the right */
        var sy = rnd(i, 1) < 0.5 ? -1 : 1;
        L.el.style.setProperty('--kx', ((rnd(i, 2) - 0.5) * 2 * 5 * amp).toFixed(1) + 'px');
        L.el.style.setProperty('--ky', (sy * (4 + 9 * rnd(i, 3)) * amp).toFixed(1) + 'px');
        L.el.style.setProperty('--kr', ((rnd(i, 4) - 0.5) * 2 * 8 * amp).toFixed(1) + 'deg');
        L.el.style.setProperty('--dur', (1.5 + 1.2 * rnd(i, 5)).toFixed(2) + 's');
      });
      words.forEach(function (Wd, i) {
        var r = Wd.el.getBoundingClientRect();
        Wd.x = r.left - left + r.width / 2;
        var amp = 0.5 + 0.5 * (Wd.x / W);
        Wd.el.style.setProperty('--px', ((2 + 3 * rnd(i, 6)) * amp).toFixed(1) + 'px');
      });
    }

    function sweep(items, front, cls, forward, animate) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.hit && it.x <= front) {
          it.hit = true;
          if (forward && animate && !reduceMotion) it.el.classList.add(cls);
        } else if (it.hit && !forward && it.x > front + 24) {
          it.hit = false;
          it.el.classList.remove(cls);
        }
      }
    }
    function update(p, lastP) {
      var forward = p > lastP;
      var animate = lastP >= 0;                                 /* no burst when the page loads mid-stage */
      sweep(words, W * p / (P_S_ARRIVAL / VP_VS), 'p-hit', forward, animate);
      sweep(letters, W * p / P_S_ARRIVAL, 's-hit', forward, animate);
    }

    return { measure: measure, update: update };
  });

  /* ---------- wire the stages to scroll and layout ---------- */
  if (stages.length) {
    window.addEventListener('scroll', updateStages, { passive: true });
    window.addEventListener('resize', layoutStages);
    window.addEventListener('load', layoutStages);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutStages);
    layoutStages();
  }
})();
