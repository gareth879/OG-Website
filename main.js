(function(){
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Mobile nav ── */
  window.toggleNav = function(){
    var nav = document.getElementById('mobileNav');
    nav.classList.toggle('open');
    document.body.style.overflow = nav.classList.contains('open') ? 'hidden' : '';
  };

  /* ── Scroll progress bar ── */
  var bar = document.getElementById('scrollbar');
  function progress(){
    if (!bar) return;
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
  }

  /* ── Parallax engine (transform-based, mobile-safe) ── */
  var layers = Array.prototype.slice.call(document.querySelectorAll('.px'));
  function parallax(){
    layers.forEach(function(l){
      var s = parseFloat(l.getAttribute('data-speed') || 0.2);
      var rect = l.parentElement.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return;
      var offset = (rect.top - window.innerHeight / 2) * -s;
      l.style.transform = 'translate3d(0,' + offset.toFixed(1) + 'px,0)';
    });
  }

  /* ── System scroll timeline ── */
  var sysSteps = Array.prototype.slice.call(document.querySelectorAll('.sys-step'));
  var sysFill = document.getElementById('sysFill');
  var sysNum = document.getElementById('sysNum');
  var sysLbl = document.getElementById('sysLbl');
  var sysWrap = document.getElementById('sysSteps');
  function systemTimeline(){
    if (!sysWrap) return;
    var mid = window.innerHeight * 0.55;
    var active = null;
    sysSteps.forEach(function(st){
      var r = st.getBoundingClientRect();
      if (r.top < mid) { st.classList.add('on'); active = st; }
      else { st.classList.remove('on'); }
    });
    if (active) {
      sysNum.textContent = active.getAttribute('data-num');
      sysLbl.textContent = active.getAttribute('data-lbl');
      var wrapR = sysWrap.getBoundingClientRect();
      var aR = active.getBoundingClientRect();
      var fill = Math.min(Math.max(aR.top + 44 - wrapR.top - 20, 0), wrapR.height - 40);
      sysFill.style.height = fill + 'px';
    } else {
      sysFill.style.height = '0px';
      if (sysSteps[0]) { sysNum.textContent = sysSteps[0].getAttribute('data-num'); sysLbl.textContent = sysSteps[0].getAttribute('data-lbl'); }
    }
  }

  /* ── Cube → pixelate → explode → logos fly out ── */
  var heroEl = document.getElementById('hero');
  var cubeScale = document.getElementById('cubeScale');
  var flyIcons = Array.prototype.slice.call(document.querySelectorAll('#heroIcons .h-icon'));
  var clamp = function(v,a,b){ return Math.min(Math.max(v,a),b); };

  /* build explosion pixels once */
  var pixWrap = document.getElementById('pixels');
  var pixels = [];
  if (pixWrap && !reduce) {
    var COLORS = ['#1a6eff','#00c6ff','#7c3aed','#ffffff'];
    for (var i = 0; i < 78; i++) {
      var d = document.createElement('div');
      d.className = 'pix';
      var s = 6 + Math.random() * 16;
      var col = COLORS[i % COLORS.length];
      d.style.width = s + 'px'; d.style.height = s + 'px';
      d.style.background = col;
      d.style.boxShadow = '0 0 14px ' + col;
      d.style.animationDelay = (-Math.random()) + 's';
      var sx = (Math.random() - .5) * 470, sy = (Math.random() - .5) * 470;
      var ang = Math.atan2(sy, sx) + (Math.random() - .5) * .9;
      var dist = (0.5 + Math.random() * 0.8) * Math.max(window.innerWidth, window.innerHeight);
      pixels.push({el:d, sx:sx, sy:sy, dx:Math.cos(ang)*dist, dy:Math.sin(ang)*dist, rz:(Math.random()-.5)*1080, inP:0.12+Math.random()*0.1, outP:0.72+Math.random()*0.22});
      pixWrap.appendChild(d);
    }
  }

  function fly(){
    if (!heroEl) return;
    var range = heroEl.offsetHeight * 0.85 || 1;
    var p = clamp(window.scrollY / range, 0, 1);

    /* Cube is already pixelating at rest — first scroll detonates it */
    if (cubeScale) {
      var cubeFade = 1 - clamp((p - 0.03) / 0.24, 0, 1);
      cubeScale.style.opacity = (0.42 * cubeFade).toFixed(3);
      cubeScale.style.transform = 'scale(' + (1 + p * 0.55).toFixed(3) + ')';
    }

    /* Pixels: visible from load, explode outward immediately on scroll */
    var q = clamp((p - 0.03) / 0.62, 0, 1);
    var eq = 1 - Math.pow(1 - q, 3);
    pixels.forEach(function(px){
      var fade = 1 - clamp((p - px.outP) / (1.001 - px.outP), 0, 1);
      px.el.style.opacity = ((0.28 + 0.55 * q) * fade).toFixed(3);
      px.el.style.transform = 'translate(calc(-50% + ' + (px.sx + px.dx * eq).toFixed(1) + 'px), calc(-50% + ' + (px.sy + px.dy * eq).toFixed(1) + 'px)) rotate(' + (px.rz * eq).toFixed(1) + 'deg)';
    });

    /* Logos: burst out of the explosion, fly to corners */
    var e = 1 - Math.pow(1 - q, 2);
    flyIcons.forEach(function(el){
      var fx = parseFloat(el.dataset.fx || 0) * window.innerWidth / 100;
      var fy = parseFloat(el.dataset.fy || 0) * window.innerHeight / 100;
      var x = parseFloat(el.dataset.ox || 0) * (0.3 + e * 0.7) + fx * e;
      var y = parseFloat(el.dataset.oy || 0) * (0.3 + e * 0.7) + fy * e;
      el.style.transform = 'translate(calc(-50% + ' + x.toFixed(1) + 'px), calc(-50% + ' + y.toFixed(1) + 'px)) scale(' + (0.35 + e * 2.4).toFixed(3) + ')';
      el.style.opacity = q <= 0 ? '0' : (0.08 + 0.42 * Math.sin(Math.PI * Math.min(e, 0.999))).toFixed(3);
    });
  }
  if (reduce) {
    /* static fallback: cube dimmed, logos spread halfway, no pixels */
    if (cubeScale) cubeScale.style.opacity = '0.42';
    flyIcons.forEach(function(el){
      var x = parseFloat(el.dataset.ox || 0) + parseFloat(el.dataset.fx || 0) * window.innerWidth / 100 * 0.5;
      var y = parseFloat(el.dataset.oy || 0) + parseFloat(el.dataset.fy || 0) * window.innerHeight / 100 * 0.5;
      el.style.transform = 'translate(calc(-50% + ' + x + 'px), calc(-50% + ' + y + 'px))';
      el.style.opacity = '0.25';
    });
  }

  /* ── Master scroll handler ── */
  var ticking = false;
  function onScroll(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function(){
      progress();
      if (!reduce) { parallax(); fly(); }
      systemTimeline();
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', onScroll, {passive:true});
  onScroll();

  /* ── Reveal on scroll ── */
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, {threshold: 0.12, rootMargin: '0px 0px -40px 0px'});
  document.querySelectorAll('.rv,.rv-l,.rv-r').forEach(function(el){ io.observe(el); });

  /* ── Chart draw + counters on view ── */
  var chartIO = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (!e.isIntersecting) return;
      e.target.querySelectorAll('.chart-line,.big-line,.chart-area,.chart-endcap').forEach(function(p){ p.classList.add('draw'); });
      e.target.querySelectorAll('.count').forEach(function(c){
        if (c.dataset.done) return;
        c.dataset.done = '1';
        var to = parseInt(c.getAttribute('data-to'), 10);
        var from = parseInt(c.getAttribute('data-from') || '0', 10);
        var fmt = function(n){ return n.toLocaleString('en-US'); };
        if (reduce || to === from) { c.textContent = fmt(to); return; }
        var t0 = null, dur = from > to ? 2200 : 1600;
        function tick(t){
          if (!t0) t0 = t;
          var p = Math.min((t - t0) / dur, 1);
          c.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      chartIO.unobserve(e.target);
    });
  }, {threshold: 0.35});
  document.querySelectorAll('.hero-dash,.chart-card,.stats-grid,.g-numbers').forEach(function(el){ chartIO.observe(el); });

  /* ── Hero mouse parallax + dashboard tilt ── */
  var hero = document.getElementById('hero');
  var dash = document.getElementById('heroDash');
  var mxEls = Array.prototype.slice.call(document.querySelectorAll('.mx'));
  if (hero && !reduce && window.matchMedia('(hover:hover)').matches) {
    hero.addEventListener('mousemove', function(e){
      var cx = (e.clientX / window.innerWidth) - 0.5;
      var cy = (e.clientY / window.innerHeight) - 0.5;
      mxEls.forEach(function(el){
        var f = parseFloat(el.getAttribute('data-mx') || 15);
        el.style.transform = 'translate(' + (cx * -f) + 'px,' + (cy * -f) + 'px)';
      });
      if (dash) dash.style.transform = 'rotateY(' + (cx * 6).toFixed(2) + 'deg) rotateX(' + (-cy * 5).toFixed(2) + 'deg)';
    });
    hero.addEventListener('mouseleave', function(){
      mxEls.forEach(function(el){ el.style.transform = ''; });
      if (dash) dash.style.transform = '';
    });
  }

  /* ── Clarity stack tilt ── */
  var stack = document.getElementById('baStack');
  var clarity = document.querySelector('.clarity');
  if (stack && clarity && !reduce && window.matchMedia('(hover:hover)').matches) {
    clarity.addEventListener('mousemove', function(e){
      var r = stack.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width/2)) / r.width;
      var dy = (e.clientY - (r.top + r.height/2)) / r.height;
      stack.style.transform = 'rotateY(' + (dx*7).toFixed(2) + 'deg) rotateX(' + (-dy*5).toFixed(2) + 'deg)';
    });
    clarity.addEventListener('mouseleave', function(){ stack.style.transform = ''; });
  }

  /* ── Meta Ads funnel toggle ── */
  window.toggleFunnel = function(sw){
    sw.classList.toggle('on');
    document.getElementById('metaTotal').textContent = sw.classList.contains('on') ? '1,350' : '1,250';
  };

  /* ── Accordion ── */
  window.toggleAcc = function(btn){
    var item = btn.parentElement;
    var ans = item.querySelector('.acc-a');
    var open = item.classList.contains('open');
    document.querySelectorAll('.acc-item.open').forEach(function(i){
      i.classList.remove('open');
      i.querySelector('.acc-a').style.maxHeight = '0px';
    });
    if (!open) {
      item.classList.add('open');
      ans.style.maxHeight = ans.scrollHeight + 'px';
    }
  };
})();
