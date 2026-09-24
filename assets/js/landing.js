/* GiveTogether — landing.js. jQuery 3.7. No inline scripts or styles (CSP-safe). */
(function ($, window, document) {
  'use strict';
  if (!$) { return; }
  document.documentElement.className += ' js';
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function onVisible(el, cb, threshold) {
    if (!('IntersectionObserver' in window)) { cb(); return; }
    var io = new IntersectionObserver(function (en) { $.each(en, function (_, e) { if (e.isIntersecting) { cb(); io.disconnect(); } }); }, { threshold: threshold || 0.2 });
    io.observe(el);
  }

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"'`]/g, function (c) { return ESC[c]; }); }
  function peso(n) { return '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 }); }
  function pct(r, g) { return g > 0 ? Math.min(100, Math.round((r / g) * 100)) : 0; }
  function left(h) { h = Number(h) || 0; if (h <= 0) { return 'Closed'; } if (h < 24) { return h + (h === 1 ? ' hr left' : ' hrs left'); } var d = Math.round(h / 24); return d + (d === 1 ? ' day left' : ' days left'); }
  function slugOk(s) { return /^[a-z0-9-]{1,80}$/.test(String(s)); }

  function card(c) {
    var p = pct(c.raised, c.goal);
    var badge = c.hours_left > 0 && c.hours_left < 24 ? '<span class="badge badge--urgent">' + esc(left(c.hours_left)) + '</span>'
      : p >= 90 ? '<span class="badge badge--success">Almost funded</span>' : '<span class="badge badge--info">Verified</span>';
    var url = 'app.html#/c/' + encodeURIComponent(c.slug);
    return '<li class="campaign-card">' +
      '<div class="campaign-card_media" role="img" aria-label="' + esc(c.image_alt) + '">' +
        '<div class="campaign-card_badges"><span class="badge badge--category">' + esc(c.category) + '</span>' + badge + '</div>' +
        '<span class="campaign-card_file">' + esc(c.image) + '</span></div>' +
      '<div class="campaign-card_body">' +
        '<h3 class="campaign-card_title"><a href="' + url + '">' + esc(c.title) + '</a></h3>' +
        '<p class="campaign-card_by">by ' + esc(c.organiser && c.organiser.name) + ' · ' + esc(c.location) + '</p>' +
        '<p class="campaign-card_amount">' + peso(c.raised) + ' <span class="campaign-card_goal">of ' + peso(c.goal) + '</span></p>' +
        '<div class="progress" role="progressbar" aria-label="' + p + ' percent funded" aria-valuenow="' + p + '" aria-valuemin="0" aria-valuemax="100"><div class="progress_bar' + (p < 50 ? ' progress_bar--low' : '') + '" data-w="' + p + '"></div></div>' +
        '<p class="campaign-card_meta"><span class="campaign-card_pct">' + p + '% funded</span><span>' + Number(c.donors).toLocaleString('en-PH') + ' donors</span><span>' + esc(left(c.hours_left)) + '</span></p>' +
        '<a class="btn btn--secondary btn--block campaign-card_cta" href="app.html#/give/' + encodeURIComponent(c.slug) + '">Give to this campaign</a>' +
      '</div></li>';
  }

  function loadCampaigns() {
    var $list = $('.js-campaigns'), $status = $('.js-feed-status');
    $.ajax({ url: 'data/campaigns.json', dataType: 'json', cache: true, timeout: 10000 })
      .done(function (data) {
        var src = (data && data.campaigns) || [];
        if (window.GTStore) { src = window.GTStore.apply(src); }
        var rows = $.grep(src, function (c) { return c && typeof c.title === 'string' && slugOk(c.slug) && Number(c.goal) > 0; });
        var featured = $.grep(rows, function (c) { return c.featured; });
        var show = (featured.length ? featured : rows).slice(0, 3);
        $list.html($.map(show, card).join(''));
        $list.find('[data-w]').each(function () { $(this).css('width', Math.max(0, Math.min(100, +$(this).attr('data-w') || 0)) + '%'); });
        $status.text('Live feed · ' + rows.length + ' verified campaigns');
      })
      .fail(function () {
        $list.html('<li class="feed-error"><p>We couldn’t load live campaigns right now.</p><p><a href="app.html">Browse them in the app →</a></p></li>');
        $status.text('Feed unavailable');
      });
  }

  function bindMenu() {
    var $btn = $('.menu-toggle'), $nav = $('#site-nav');
    function set(open) {
      $btn.attr('aria-expanded', String(open));
      $nav.toggleClass('site-nav--open', open);
    }
    $btn.on('click', function () { set($btn.attr('aria-expanded') !== 'true'); });
    $nav.on('click', 'a', function () { set(false); });
    $(document).on('keydown', function (e) { if (e.key === 'Escape' && $btn.attr('aria-expanded') === 'true') { set(false); $btn.trigger('focus'); } });
    $(window).on('resize', function () { if (window.innerWidth >= 1024) { set(false); } });
  }

  function bindScrollState() {
    var $h = $('.site-header');
    var $links = $('.site-nav_list-item');
    var ids = $links.map(function () { return $(this).attr('href'); }).get();
    function onScroll() {
      $h.toggleClass('site-header--scrolled', window.pageYOffset > 8);
      var y = window.pageYOffset + $h.outerHeight() + 48, current = '';
      $.each(ids, function (_, id) { var $s = $(id); if ($s.length && $s.offset().top <= y) { current = id; } });
      $links.each(function () { var on = $(this).attr('href') === current; $(this).toggleClass('site-nav_list-item--active', on); if (on) { $(this).attr('aria-current', 'true'); } else { $(this).removeAttr('aria-current'); } });
    }
    var ticking = false;
    $(window).on('scroll', function () { if (!ticking) { ticking = true; window.requestAnimationFrame(function () { onScroll(); ticking = false; }); } });
    onScroll();
  }

  function bindAccordion() {
    var D = REDUCED ? 0 : 320;
    $('.accordion').on('click', '.accordion_trigger', function () {
      var $t = $(this), open = $t.attr('aria-expanded') === 'true';
      $('.accordion_trigger[aria-expanded="true"]').not($t).each(function () {
        $(this).attr('aria-expanded', 'false').closest('.accordion_item').removeClass('is-open');
        $('#' + $(this).attr('aria-controls')).stop(true).slideUp(D, function () { $(this).removeClass('accordion_panel--open').css('display', ''); });
      });
      var $p = $('#' + $t.attr('aria-controls'));
      $t.attr('aria-expanded', String(!open)).closest('.accordion_item').toggleClass('is-open', !open);
      if (open) { $p.stop(true).slideUp(D, function () { $p.removeClass('accordion_panel--open').css('display', ''); }); }
      else { $p.stop(true).hide().addClass('accordion_panel--open').slideDown(D + 40); }
    });
  }

  function bindReveal() {
    $('.section-head, .feature-card, .plan-card, .accordion_item, .cta-band, .testimonials').each(function () {
      var $el = $(this), i = $el.index();
      $el.addClass('reveal');
      if ($el.is('.feature-card, .plan-card, .accordion_item')) { $el.css('transition-delay', Math.min(i, 5) * 80 + 'ms'); }
      onVisible(this, function () { $el.addClass('is-visible'); window.setTimeout(function () { $el.css('transition-delay', ''); }, 1200); }, 0.12);
    });
    $('.js-stepper').each(function () { var el = this; onVisible(el, function () { $(el).addClass('is-visible'); }, 0.3); });
  }

  function bindHero() {
    var $amt = $('.js-live-amount'), $bar = $('.js-live-bar'), $toast = $('.js-toast'), $txt = $('.js-toast-text');
    var total = +$amt.attr('data-to') || 0, GOAL = 250000;
    if (!REDUCED && window.requestAnimationFrame) {
      var t0 = null, from = Math.round(total * 0.6);
      var step = function (t) { if (!t0) { t0 = t; } var k = Math.min(1, (t - t0) / 1400), e = 1 - Math.pow(1 - k, 3); $amt.text(peso(from + (total - from) * e)); if (k < 1) { window.requestAnimationFrame(step); } };
      window.setTimeout(function () { window.requestAnimationFrame(step); }, 500);
    }
    var gifts = [['Marites', 'GCash', 500], ['Jun', 'Maya', 1000], ['Anonymous', 'Visa', 250], ['Liza', 'GCash', 2500], ['Paolo', 'BPI', 300], ['Carmela', 'Mastercard', 750]], g = 0;
    function tick() {
      if (document.hidden || total >= GOAL) { return; }
      var gift = gifts[g++ % gifts.length];
      $toast.removeClass('is-in');
      window.setTimeout(function () {
        $txt.text(peso(gift[2]) + ' · ' + gift[0] + ' via ' + gift[1]);
        $toast.addClass('is-in');
        total = Math.min(GOAL, total + gift[2]);
        $amt.text(peso(total)).removeClass('is-bump');
        void $amt[0].offsetWidth;
        $amt.addClass('is-bump');
        $bar.css('width', (total / GOAL * 100).toFixed(2) + '%');
        window.setTimeout(function () { $toast.removeClass('is-in'); }, 2600);
      }, 380);
    }
    if (!REDUCED && $toast.length) { window.setTimeout(function () { tick(); window.setInterval(tick, 4200); }, 2200); }
    var $d = $('.js-tilt');
    if ($d.length && !REDUCED && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      $d.on('pointermove', function (e) {
        if (window.innerWidth < 1024) { return; }
        var r = this.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        this.style.setProperty('--ry', (x * 8).toFixed(2) + 'deg');
        this.style.setProperty('--rx', (-y * 6).toFixed(2) + 'deg');
      }).on('pointerleave', function () { this.style.setProperty('--ry', '0deg'); this.style.setProperty('--rx', '0deg'); });
    }
  }

  function bindCarousel() {
    $('.js-carousel').each(function () {
      var $c = $(this), $vp = $c.find('.testimonials_viewport'), $track = $c.find('.testimonials_track'), $slides = $track.children(), n = $slides.length, i = 0;
      var $dots = $c.find('.testimonials_dots'), $now = $c.find('.js-slide-now'), auto = !REDUCED;
      if (!auto) { $c.addClass('no-autoplay'); }
      $slides.each(function (k) { $dots.append('<button class="testimonials_dot" type="button" aria-label="Show testimonial ' + (k + 1) + ' of ' + n + '"><span class="testimonials_dot-fill"></span></button>'); });
      var $dotBtns = $dots.children();
      function go(k) {
        i = (k + n) % n;
        $track.css('transform', 'translate3d(' + (-100 * i) + '%,0,0)');
        $slides.each(function (s) { var on = s === i; $(this).toggleClass('is-active', on).attr('aria-hidden', String(!on)); });
        $dotBtns.removeClass('is-active').removeAttr('aria-current');
        var d = $dotBtns.eq(i)[0]; void d.offsetWidth;
        $dotBtns.eq(i).addClass('is-active').attr('aria-current', 'true');
        $now.text((i < 9 ? '0' : '') + (i + 1));
      }
      if (auto) { $dots.on('animationend', '.testimonials_dot-fill', function () { go(i + 1); }); }
      $dots.on('click', '.testimonials_dot', function () { go($(this).index()); });
      $c.find('.js-prev').on('click', function () { go(i - 1); });
      $c.find('.js-next').on('click', function () { go(i + 1); });
      $c.on('keydown', function (e) { if (e.key === 'ArrowLeft') { go(i - 1); } else if (e.key === 'ArrowRight') { go(i + 1); } });
      $c.on('mouseenter focusin', function () { $c.addClass('is-paused'); }).on('mouseleave focusout', function (e) { if (!e.relatedTarget || !$.contains(this, e.relatedTarget)) { $c.removeClass('is-paused'); } });
      var x0 = null;
      $vp.on('pointerdown', function (e) { x0 = e.clientX; });
      $vp.on('pointerup pointercancel', function (e) { if (x0 === null) { return; } var dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) { go(dx < 0 ? i + 1 : i - 1); } });
      if ('IntersectionObserver' in window) { new IntersectionObserver(function (en) { $c.toggleClass('is-offscreen', !en[0].isIntersecting); if (!en[0].isIntersecting) { $c.addClass('is-paused'); } else if (!$c.is(':hover') && !$.contains($c[0], document.activeElement)) { $c.removeClass('is-paused'); } }).observe($c[0]); }
      go(0);
    });
  }

  function bindLaunch() {
    $('.js-launch').each(function () {
      var el = this, $days = $(el).find('.launch_day'), n = $days.length, k = -1;
      function set(idx) { $days.each(function (d) { $(this).toggleClass('is-on', d <= idx); }); el.style.setProperty('--p', Math.max(0, idx) / (n - 1)); }
      if (REDUCED) { set(n - 1); return; }
      onVisible(el, function () {
        (function loop() { k++; if (k >= n) { window.setTimeout(function () { k = -1; set(-1); window.setTimeout(loop, 700); }, 2600); return; } set(k); window.setTimeout(loop, k === 3 ? 1400 : 850); }());
      }, 0.4);
    });
  }

  function bindForm() {
    $('.js-demo-form').on('submit', function (e) {
      e.preventDefault();
      var $f = $(this), $email = $f.find('[name="email"]'), $org = $f.find('[name="org"]'), $s = $('#demo-status');
      var email = $.trim($email.val()).slice(0, 120), org = $.trim($org.val()).slice(0, 120);
      var okEmail = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email), okOrg = org.length >= 2;
      $email.attr('aria-invalid', String(!okEmail));
      $org.attr('aria-invalid', String(!okOrg));
      if (!okEmail || !okOrg) {
        $s.removeClass('cta-form_status--ok').addClass('cta-form_status--error').text(!okEmail ? 'Please enter a valid work email.' : 'Please add your organisation name.');
        (!okEmail ? $email : $org).trigger('focus');
        return;
      }
      // Static build: no network call. A live build POSTs JSON over HTTPS with a CSRF token and server-side validation.
      var $btn = $f.find('.js-submit'), $lbl = $btn.find('.btn_label'), label = $lbl.text();
      $btn.addClass('is-loading').attr('aria-busy', 'true'); $lbl.text('Booking…');
      $s.removeClass('cta-form_status--error cta-form_status--ok').text('');
      window.setTimeout(function () {
        $btn.removeClass('is-loading').removeAttr('aria-busy'); $lbl.text(label);
        $s.addClass('cta-form_status--ok').text('Thanks — we’ll email ' + email + ' within one business day.');
        $f[0].reset();
        $email.add($org).attr('aria-invalid', 'false');
      }, REDUCED ? 0 : 900);
    });
  }

  $(function () {
    $('.js-year').text(new Date().getFullYear());
    bindMenu();
    bindScrollState();
    bindAccordion();
    bindForm();
    bindReveal();
    bindHero();
    bindCarousel();
    bindLaunch();
    function drawIcons() {
      if (REDUCED) { return; }
      $('.feature-card').each(function (i) {
        var el = this; el.style.setProperty('--draw-delay', (300 + i * 150) + 'ms');
        $(el).removeClass('is-drawing'); void el.offsetWidth; $(el).addClass('is-drawing');
        window.setTimeout(function () { $(el).removeClass('is-drawing'); }, 1800 + i * 150);
      });
    }
    if (document.readyState === 'complete') { drawIcons(); } else { $(window).on('load', drawIcons); }
    $('.feature-grid').on('click', '.feature-card', function () { var $c = $(this); window.clearTimeout($c.data('tap')); $c.removeClass('is-tapped'); void this.offsetWidth; $c.addClass('is-tapped'); $c.data('tap', window.setTimeout(function () { $c.removeClass('is-tapped'); }, 1400)); });
    $(window).on('storage', function (e) { if (window.GTStore && e.originalEvent && e.originalEvent.key === window.GTStore.KEY) { loadCampaigns(); } });
    loadCampaigns();
  });
}(window.jQuery, window, document));
