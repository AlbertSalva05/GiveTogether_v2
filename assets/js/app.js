/* ==========================================================================
   GiveTogether — app.js
   Hash router + views for: Discover · Campaign · Choose amount · Payment ·
   Confirmation, plus Explore, My gifts, Start, 404.
   Security: every dynamic value passes through esc(); no card number or CVC
   is ever stored — only the last four digits. No inline scripts/styles (CSP).
   ========================================================================== */
(function ($, window, document) {
  'use strict';
  if (!$) { return; }

  var CONFIG = {
    dataUrl: 'data/campaigns.json',
    minAmount: 50,
    maxAmount: 500000,
    messageMax: 200,
    storage: 'gt.v1.',
    splashMs: 900,
    processingMs: 1400
  };

  var state = {
    data: null,
    campaigns: [],
    bySlug: {},
    filter: 'All',
    query: '',
    drafts: {},
    gifts: [],
    deltas: {},
    firstRender: true,
    raw: [],
    all: []
  };

  var CATEGORIES = ['All', 'Education', 'Health', 'Livelihood', 'Disaster relief'];
  var BANKS = ['BDO Unibank', 'BPI', 'UnionBank', 'Landbank', 'Metrobank', 'Security Bank', 'RCBC', 'PNB', 'China Bank', 'EastWest'];

  /* ---------- Utilities ---------- */
  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"'`]/g, function (c) { return ESC_MAP[c]; }); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function peso(n) { return '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 }); }
  function peso2(n) { return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(n) { return Number(n).toLocaleString('en-PH'); }
  function feeFor(amount) {
    var f = state.data ? state.data.fees : { rate: 0.029, flat: 15 };
    return round2(amount * f.rate + f.flat);
  }
  function pct(raised, goal) { return goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0; }
  function timeLeft(h) {
    h = Number(h) || 0;
    if (h <= 0) { return 'Closed'; }
    if (h < 24) { return h + (h === 1 ? ' hr left' : ' hrs left'); }
    var d = Math.round(h / 24);
    return d + (d === 1 ? ' day left' : ' days left');
  }
  function icon(id, cls) { return '<svg class="' + (cls || 'icon') + '" aria-hidden="true" focusable="false"><use href="#' + id + '"/></svg>'; }
  function isSafeSlug(s) { return /^[a-z0-9-]{1,80}$/.test(s); }

  var store = {
    get: function (k, fallback) {
      try { var v = window.localStorage.getItem(CONFIG.storage + k); return v ? JSON.parse(v) : fallback; }
      catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { window.localStorage.setItem(CONFIG.storage + k, JSON.stringify(v)); } catch (e) { /* storage full or disabled */ }
    }
  };

  function toast(msg) {
    var $t = $('#toast');
    $t.text(msg).addClass('toast--show');
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(function () { $t.removeClass('toast--show'); }, 2600);
  }

  /* ---------- Data ---------- */
  function sanitizeCampaign(c) {
    if (!c || typeof c.title !== 'string' || !isSafeSlug(String(c.slug)) || !(Number(c.goal) > 0)) { return null; }
    c.raised = Number(c.raised) || 0;
    c.goal = Number(c.goal);
    c.donors = Number(c.donors) || 0;
    c.shares = Number(c.shares) || 0;
    c.story = Array.isArray(c.story) ? c.story : [];
    c.budget = Array.isArray(c.budget) ? c.budget : [];
    c.impact = Array.isArray(c.impact) ? c.impact.slice(0, 4) : [];
    c.recent = Array.isArray(c.recent) ? c.recent : [];
    c.organiser = c.organiser || { name: 'Verified organiser', initials: 'GT' };
    return c;
  }

  function applyManaged() {
    var all = window.GTStore ? window.GTStore.apply(state.raw || [], { all: true }) : (state.raw || []).slice();
    state.all = $.map(all, function (c) { return sanitizeCampaign($.extend(true, {}, c)); });
    state.campaigns = $.grep(state.all, function (c) { return c.status !== 'paused'; });
    state.bySlug = {};
    $.each(state.all, function (_, c) { state.bySlug[c.slug] = c; });
  }

  function live(c) {
    var d = state.deltas[c.slug] || { amount: 0, count: 0 };
    var raised = c.raised + d.amount;
    return { raised: raised, donors: c.donors + d.count, pct: pct(raised, c.goal), toGo: Math.max(0, c.goal - raised) };
  }

  function draftFor(slug) {
    if (!state.drafts[slug]) {
      state.drafts[slug] = { amount: 100, custom: '', message: '', anonymous: true, updates: false, coverFees: true, method: 'card', wallet: 'GCash', email: '' };
    }
    return state.drafts[slug];
  }
  function saveDrafts() {
    var safe = {};
    $.each(state.drafts, function (k, d) {
      safe[k] = { amount: d.amount, custom: d.custom, message: d.message, anonymous: d.anonymous, updates: d.updates, coverFees: d.coverFees, method: d.method, wallet: d.wallet, email: d.email };
    });
    try { window.sessionStorage.setItem(CONFIG.storage + 'drafts', JSON.stringify(safe)); } catch (e) { /* ignore */ }
  }
  function loadDrafts() {
    try { var v = window.sessionStorage.getItem(CONFIG.storage + 'drafts'); state.drafts = v ? JSON.parse(v) : {}; } catch (e) { state.drafts = {}; }
  }

  function impactFor(c, amount) {
    var best = null;
    $.each(c.impact, function (_, i) { if (amount >= i.amount) { best = i; } });
    return best;
  }

  /* ---------- Shared partials ---------- */
  function progress(p, extra, gift) {
    var low = p < 50 ? ' progress_bar--low' : '';
    return '<div class="progress ' + (extra || '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '" aria-label="' + p + ' percent funded">' +
      '<div class="progress_bar' + low + '" data-w="' + p + '"></div>' +
      (gift != null ? '<div class="progress_gift"></div>' : '') +
      '</div>';
  }

  function statusBadge(c, l) {
    if (c.hours_left > 0 && c.hours_left < 24) { return '<span class="badge badge--urgent">' + esc(timeLeft(c.hours_left)) + '</span>'; }
    if (l.pct >= 90) { return '<span class="badge badge--success">Almost funded</span>'; }
    if (c.featured) { return '<span class="badge badge--info">Verified</span>'; }
    return '';
  }

  function media(file, alt, cls) {
    return '<div class="media ' + (cls || '') + '" role="img" aria-label="' + esc(alt) + '"><span class="media_filename">' + esc(file) + '</span>';
  }

  function stepper(current) {
    var steps = ['Amount', 'Payment', 'Confirm'];
    var html = '<ol class="stepper" aria-label="Checkout progress">';
    $.each(steps, function (i, label) {
      var n = i + 1;
      var cls = n < current ? 'stepper_item--done' : (n === current ? 'stepper_item--current' : '');
      if (i) { html += '<li class="stepper_line" aria-hidden="true"></li>'; }
      html += '<li class="stepper_item ' + cls + '"' + (n === current ? ' aria-current="step"' : '') + '>' +
        '<span class="stepper_dot">' + (n < current ? icon('icn_ui_check', 'icon icon--sm') : n) + '</span>' +
        '<span class="stepper_label">' + label + '</span></li>';
    });
    return html + '</ol>';
  }

  function contextRow(c) {
    var l = live(c);
    return '<div class="context context--mobile">' +
      '<div class="context_thumb media" role="img" aria-label="' + esc(c.image_alt) + '"></div>' +
      '<div><p class="context_title">' + esc(c.short || c.title) + '</p><p class="context_meta">' + l.pct + '% funded · ' + esc(timeLeft(c.hours_left)) + '</p></div></div>';
  }

  function campaignCard(c) {
    var l = live(c);
    return '<article class="campaign-card">' +
      media(c.image, c.image_alt, 'campaign-card_media') +
        '<div class="campaign-card_badges"><span class="badge badge--category">' + esc(c.category) + '</span>' + statusBadge(c, l) + '</div></div>' +
      '<div class="campaign-card_body">' +
        '<h3 class="campaign-card_title"><a href="#/c/' + esc(c.slug) + '">' + esc(c.title) + '</a></h3>' +
        '<p class="campaign-card_byline">by ' + esc(c.organiser.name) + ' · ' + esc(c.location) + '</p>' +
        '<p class="campaign-card_amount">' + peso(l.raised) + ' <span class="campaign-card_goal">of ' + peso(c.goal) + '</span></p>' +
        progress(l.pct) +
        '<p class="campaign-card_meta"><span class="campaign-card_pct">' + l.pct + '% funded</span><span>' + num(l.donors) + ' donors</span><span>' + esc(timeLeft(c.hours_left)) + '</span></p>' +
        '<a class="btn btn--secondary btn--block campaign-card_cta" href="#/give/' + esc(c.slug) + '">Give to this campaign</a>' +
      '</div></article>';
  }

  function filtered() {
    var q = state.query.trim().toLowerCase();
    return $.grep(state.campaigns, function (c) {
      var catOk = state.filter === 'All' || c.category === state.filter;
      var qOk = !q || (c.title + ' ' + c.location + ' ' + c.category + ' ' + c.organiser.name).toLowerCase().indexOf(q) > -1;
      return catOk && qOk;
    });
  }

  function gridHtml() {
    var list = filtered();
    if (!list.length) {
      return '<div class="empty-state"><h3 class="h3 empty-state_title">No campaigns match “' + esc(state.query || state.filter) + '”</h3>' +
        '<p class="muted">Try a different word, or clear the filter to see all verified campaigns.</p>' +
        '<p><button class="btn btn--secondary" type="button" data-action="clear-filters">Clear search and filters</button></p></div>';
    }
    return $.map(list, campaignCard).join('');
  }

  function chipsHtml() {
    return '<div class="chips" role="toolbar" aria-label="Filter by cause">' + $.map(CATEGORIES, function (cat) {
      var on = cat === state.filter;
      return '<button class="chip' + (on ? ' chip--active' : '') + '" type="button" aria-pressed="' + on + '" data-action="filter" data-value="' + esc(cat) + '">' + esc(cat) + '</button>';
    }).join('') + '</div>';
  }

  function statsHtml(cls) {
    var s = state.data.stats;
    return '<dl class="stat-row ' + cls + '">' +
      '<div class="stat-row_item"><dt class="stat-row_label">Raised since 2021</dt><dd class="stat-row_value">' + esc(s.raised_label) + '</dd></div>' +
      '<div class="stat-row_item"><dt class="stat-row_label">Campaigns funded</dt><dd class="stat-row_value">' + esc(s.funded) + '</dd></div>' +
      '<div class="stat-row_item"><dt class="stat-row_label">Median payout</dt><dd class="stat-row_value">' + esc(s.payout) + '</dd></div></dl>';
  }

  function searchHero() {
    return '<label class="search search--hero"><span class="visually-hidden">Search campaigns</span>' + icon('icn_ui_search', 'search_icon') +
      '<input class="search_input js-search" type="search" placeholder="Search campaign, cause or place…" autocomplete="off" maxlength="80" value="' + esc(state.query) + '"></label>';
  }

  /* ---------- Views ---------- */
  var views = {};

  views.discover = function () {
    return {
      title: 'GiveTogether — Give to verified campaigns in the Philippines',
      nav: 'home',
      html:
        '<section class="hero" aria-labelledby="hero-title">' +
          '<div class="hero_media media" role="img" aria-label="Volunteer handing a relief package to a child"><span class="media_filename">img_hero_01.jpg</span></div>' +
          '<div class="hero_scrim"></div>' +
          '<div class="hero_inner">' +
            '<p class="overline hero_overline">Together we can</p>' +
            '<h1 class="hero_title" id="hero-title" tabindex="-1">Create a brighter future</h1>' +
            '<p class="hero_lede">Support identity-verified campaigns from Filipino families, teachers and barangay councils. Funds are released in tranches, with receipts you can read.</p>' +
            '<div class="hero_actions"><button class="btn btn--inverse btn--lg" type="button" data-action="scroll-campaigns">Find a campaign</button><a class="btn btn--ghost-inverse btn--lg" href="#/start">Start your own</a></div>' +
            statsHtml('hero-stats hero-stats--wide') +
          '</div>' +
        '</section>' +
        '<div class="container">' + searchHero() + '</div>' +
        statsHtml('hero-stats--mobile') +
        '<div class="container">' + chipsHtml() +
          '<section class="section section--flush" id="campaigns" aria-labelledby="featured-title">' +
            '<div class="section-head"><div><p class="overline">Featured campaigns</p><h2 class="h2 section-head_title" id="featured-title">Verified and close to goal</h2></div>' +
            '<a class="link-arrow" href="#/explore">See all →</a></div>' +
            '<div class="campaign-grid" id="campaign-grid">' + gridHtml() + '</div>' +
            '<div class="trust-strip"><span class="trust-strip_icon">' + icon('icn_ui_check', 'icon icon--sm') + '</span>' +
              '<p class="trust-strip_text">Every campaign is identity-verified before it can receive a peso. Funds are released to the organiser in tranches with receipts you can read.</p>' +
              '<a class="link-arrow" href="#/start">How we verify →</a></div>' +
          '</section>' +
        '</div>'
    };
  };

  views.explore = function () {
    return {
      title: 'Explore campaigns — GiveTogether',
      nav: 'explore',
      html:
        '<div class="container">' +
          '<div class="page-bar"><h1 class="page-bar_title" tabindex="-1">Explore campaigns</h1></div>' +
          searchHero().replace('search--hero', 'search--hero search--flat') +
          chipsHtml() +
          '<p class="caption" id="result-count">' + filtered().length + ' verified campaigns</p>' +
          '<div class="campaign-grid section" id="campaign-grid">' + gridHtml() + '</div>' +
        '</div>'
    };
  };

  function tabsHtml(c, l) {
    var tabs = [['story', 'Story', ''], ['updates', 'Updates', c.updates], ['donors', 'Donors', num(l.donors)], ['budget', 'Budget', '']];
    return '<div class="tabs" role="tablist" aria-label="Campaign details">' + $.map(tabs, function (t, i) {
      return '<button class="tabs_item" type="button" role="tab" id="tab-' + t[0] + '" aria-controls="panel-' + t[0] + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '">' +
        t[1] + (t[2] !== '' ? ' <span class="tabs_count">' + esc(t[2]) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function budgetHtml(c) {
    return '<ul class="budget">' + $.map(c.budget, function (b) {
      return '<li class="budget_item"><div><p class="budget_label">' + esc(b.label) + '</p><p class="budget_detail">' + esc(b.detail) + '</p></div><p class="budget_amount">' + peso(b.amount) + '</p></li>';
    }).join('') + '</ul>';
  }

  function organiserHtml(c) {
    var o = c.organiser;
    return '<section class="card card_pad organiser" aria-label="Organiser">' +
      '<span class="avatar" aria-hidden="true">' + esc(o.initials) + '</span>' +
      '<div class="organiser_body"><p class="organiser_name">' + esc(o.name) + '</p>' +
      '<p class="organiser_meta">Organiser · ID verified ' + esc(o.verified_on) + ' · Payouts to ' + esc(o.bank) + '</p></div>' +
      '<a class="link-arrow" href="mailto:organisers@givetogether.ph?subject=' + encodeURIComponent('Message for ' + o.name) + '">Message</a></section>';
  }

  function donorsHtml(c, l, withAll) {
    return '<ul class="donor-list">' + $.map(c.recent, function (d) {
      return '<li class="donor-list_item"><strong>' + esc(d.name) + '</strong> · ' + peso(d.amount) + ' · ' + esc(d.mins) + ' min ago</li>';
    }).join('') + '</ul>' + (withAll ? '<button class="link-arrow btn-link" type="button" data-action="tab" data-tab="donors">See all ' + num(l.donors) + ' donors →</button>' : '');
  }

  views.campaign = function (slug) {
    var c = state.bySlug[slug];
    if (!c) { return views.notFound(); }
    var l = live(c), d = draftFor(slug);
    var verifiedTranche = l.pct >= 25 ? 'Tranche 1 is eligible for release against receipts.' : 'Tranche 1 unlocks at 25% funded.';

    return {
      title: c.title + ' — GiveTogether',
      nav: 'explore',
      dock: true,
      html:
        '<div class="container">' +
          '<div class="page-bar page-bar--campaign">' +
            '<a class="icon-btn" href="#/" aria-label="Back to campaigns">' + icon('icn_ui_back') + '</a>' +
            '<p class="page-bar_title">All about the campaign</p>' +
            '<nav class="breadcrumb" aria-label="Breadcrumb"><a href="#/">Discover</a><span class="breadcrumb_sep" aria-hidden="true">/</span><a href="#/explore" data-action="filter-link" data-value="' + esc(c.category) + '">' + esc(c.category) + '</a><span class="breadcrumb_sep" aria-hidden="true">/</span><span>' + esc(c.location) + '</span></nav>' +
            '<button class="icon-btn page-bar_share" type="button" data-action="share" data-slug="' + esc(c.slug) + '" aria-label="Share this campaign">' + icon('icn_share_link') + '</button>' +
          '</div>' +
          '<div class="page-grid page-grid--campaign">' +
            '<div class="campaign-layout_hero">' +
              media(c.image, c.image_alt, 'campaign-hero') +
                '<div class="campaign-hero_scrim"></div>' +
                '<div class="campaign-hero_content"><span class="badge badge--on-media">' + esc(c.category) + ' · ' + esc(c.location) + '</span>' +
                '<h1 class="campaign-hero_title" tabindex="-1">' + esc(c.title) + '</h1>' +
                '<p class="campaign-hero_by">by ' + esc(c.organiser.name) + ' · verified organiser · ' + esc(c.updates) + ' updates posted</p></div>' +
              '</div>' +
            '</div>' +

            '<div class="page-grid_main campaign-layout_main">' +
              tabsHtml(c, l) +
              '<div class="tabs_panel stack-3" role="tabpanel" id="panel-story" aria-labelledby="tab-story" tabindex="0">' +
                '<section class="card card_pad card_pad--lg story" aria-label="The story">' + $.map(c.story, function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</section>' +
                '<section aria-labelledby="money-title"><p class="overline" id="money-title">Where the money goes</p><div class="stack-1-5">' + budgetHtml(c) + '</div></section>' +
                organiserHtml(c) +
              '</div>' +
              '<div class="tabs_panel" role="tabpanel" id="panel-updates" aria-labelledby="tab-updates" tabindex="0" hidden>' +
                '<section class="card card_pad"><ul class="update-list">' +
                  '<li class="update-list_item"><p class="h4">Organiser verified</p><p class="caption">' + esc(c.organiser.verified_on) + ' · Government ID, supporting document and payout account confirmed.</p></li>' +
                  '<li class="update-list_item"><p class="h4">Budget published</p><p class="caption">Line-item budget with supplier quotes attached to this page.</p></li>' +
                  '<li class="update-list_item"><p class="h4">Payout status</p><p class="caption">' + esc(verifiedTranche) + '</p></li>' +
                '</ul></section>' +
              '</div>' +
              '<div class="tabs_panel" role="tabpanel" id="panel-donors" aria-labelledby="tab-donors" tabindex="0" hidden>' +
                '<section class="card card_pad"><p class="overline">Most recent of ' + num(l.donors) + ' donors</p>' + donorsHtml(c, l, false) + '</section>' +
              '</div>' +
              '<div class="tabs_panel" role="tabpanel" id="panel-budget" aria-labelledby="tab-budget" tabindex="0" hidden>' +
                budgetHtml(c) + '<p class="caption stack-gap">Total goal ' + peso(c.goal) + '. Receipts are posted as each tranche is released.</p>' +
              '</div>' +
            '</div>' +

            '<aside class="page-grid_aside campaign-layout_aside" aria-label="Donate">' +
              '<section class="card card--raised card_pad campaign-layout_raised">' +
                '<div class="raised_top"><p class="overline">Raised</p>' + statusBadge(c, l) + '</div>' +
                '<p class="raised_amount">' + peso(l.raised) + '</p>' +
                '<p class="raised_goal">of ' + peso(c.goal) + ' goal · ' + peso(l.toGo) + ' to go</p>' +
                progress(l.pct, 'progress--lg') +
                '<div class="raised_stats">' +
                  '<div><p class="raised_stat-value">' + l.pct + '%</p><p class="raised_stat-label">funded</p></div>' +
                  '<div><p class="raised_stat-value">' + num(l.donors) + '</p><p class="raised_stat-label">donors</p></div>' +
                  '<div><p class="raised_stat-value">' + num(c.shares) + '</p><p class="raised_stat-label">shares</p></div>' +
                '</div>' +
                '<div class="raised_cta">' +
                  '<a class="btn btn--primary btn--lg btn--block" href="#/give/' + esc(c.slug) + '" id="donate-cta">Donate to this campaign</a>' +
                '</div>' +
              '</section>' +
              '<div class="campaign-layout_extra stack-2">' +
                '<div class="note">' + icon('icn_ui_shield', 'note_icon') + '<p>Funds go directly to the organiser in tranches. Every release is posted publicly with receipts.</p></div>' +
                '<section class="card card_pad"><p class="overline">Recent donors</p>' + donorsHtml(c, l, true) + '</section>' +
              '</div>' +
            '</aside>' +
          '</div>' +
        '</div>' +
        '<div class="action-dock">' +
          '<button class="icon-btn" type="button" data-action="share" data-slug="' + esc(c.slug) + '" aria-label="Share this campaign">' + icon('icn_share_link') + '</button>' +
          '<a class="btn btn--primary btn--lg" href="#/give/' + esc(c.slug) + '">Donate to this campaign</a>' +
        '</div>'
    };
  };

  function impactPanel(c, d, withCta) {
    var l = live(c);
    var ladder = $.map(c.impact, function (i) {
      return '<li class="impact-ladder_item" data-rung="' + i.amount + '"><span class="impact-ladder_amount">' + peso(i.amount) + '</span><span class="impact-ladder_label">' + esc(i.label) + '</span><span class="impact-ladder_check" aria-hidden="true">' + icon('icn_ui_check', 'icon icon--sm') + '</span></li>';
    }).join('');
    return '<section class="card card--raised impact" aria-label="What your gift does">' +
      '<div class="card_pad">' +
        '<p class="overline">Your gift in the goal</p>' +
        '<p class="h4 stack-gap-sm">' + esc(c.title) + '</p>' +
        '<p class="caption">' + esc(timeLeft(c.hours_left)) + ' · ' + num(l.donors) + ' donors before you</p>' +
        '<div class="stack-gap">' + progress(l.pct, 'progress--lg', 0) + '</div>' +
        '<p class="impact_before-after"><strong class="tabular" id="impact-before-after">' + peso(l.raised) + ' → ' + peso(l.raised + d.amount) + '</strong><span id="impact-to-go">' + peso(Math.max(0, l.toGo - d.amount)) + ' to go</span></p>' +
        '<p class="impact_legend"><span class="impact_swatch" aria-hidden="true"></span>Your gift</p>' +
      '</div>' +
      '<div class="card_pad card_divider">' +
        '<p class="overline">What your gift builds</p>' +
        '<ul class="impact-ladder" id="impact-ladder">' + ladder + '</ul>' +
        '<p class="caption">' + esc(c.impact_note || '') + '</p>' +
        (withCta ? '<div class="aside-cta stack-1-5 stack-gap"><button class="btn btn--primary btn--lg btn--block" type="button" data-action="continue">Continue to payment</button><p class="caption text-center">Fees are shown on the next step — you can choose to cover them.</p></div>' : '') +
      '</div>' +
    '</section>' +
    (c.popular ? '<div class="note"><span class="avatar avatar--sm" aria-hidden="true">₱</span><p><strong>' + peso(c.popular.amount) + ' is the most chosen gift</strong> on this campaign — ' + esc(c.popular.share) + '% of donors this week.</p></div>' : '');
  }

  views.amount = function (slug) {
    var c = state.bySlug[slug];
    if (!c) { return views.notFound(); }
    var d = draftFor(slug);
    var tiles = $.map(c.impact, function (i) {
      var on = !d.custom && i.amount === d.amount;
      return '<button class="amount-tile' + (on ? ' amount-tile--active' : '') + '" type="button" aria-pressed="' + on + '" data-action="pick-amount" data-amount="' + i.amount + '">' + peso(i.amount) + '</button>';
    }).join('');
    return {
      title: 'Set your donation — ' + c.short + ' — GiveTogether',
      nav: 'explore',
      dock: true,
      html:
        '<div class="container">' +
          '<div class="page-bar"><a class="icon-btn" href="#/c/' + esc(slug) + '" aria-label="Back to campaign">' + icon('icn_ui_back') + '</a>' +
            '<h1 class="page-bar_title" tabindex="-1">Set your donation</h1><span class="page-bar_step">Step 1 of 3</span></div>' +
          stepper(1) +
          '<div class="page-grid">' +
            '<div class="page-grid_main">' +
              contextRow(c) +
              '<p class="lede">Pick what feels right. You will see the full total, fees included, before anything is charged.</p>' +
              '<section class="card card_pad card_pad--lg" aria-labelledby="amount-title">' +
                '<h2 class="h3" id="amount-title">Choose an amount</h2>' +
                '<div class="amount-grid amount-grid--wide stack-gap" role="group" aria-label="Suggested amounts">' + tiles + '</div>' +
                '<div class="field stack-gap' + '" id="field-custom">' +
                  '<label class="field_label" for="custom-amount">Or enter an amount</label>' +
                  '<div class="field_control"><span class="field_prefix" aria-hidden="true">₱</span>' +
                  '<input class="field_input tabular" id="custom-amount" name="custom" type="text" inputmode="numeric" autocomplete="off" placeholder="Enter amount" maxlength="7" value="' + esc(d.custom) + '" aria-describedby="custom-hint custom-error"></div>' +
                  '<p class="field_hint" id="custom-hint">Minimum ' + peso(CONFIG.minAmount) + ', maximum ' + peso(CONFIG.maxAmount) + ' per gift.</p>' +
                  '<p class="field_error" id="custom-error" role="alert"></p>' +
                '</div>' +
              '</section>' +
              '<section class="card card_pad card_pad--lg" aria-labelledby="message-title">' +
                '<h2 class="h3" id="message-title">Add a message <span class="field_optional">(optional)</span></h2>' +
                '<div class="field stack-gap"><label class="visually-hidden" for="message">Message to the organiser</label>' +
                  '<textarea class="field_textarea" id="message" maxlength="' + CONFIG.messageMax + '" placeholder="Say something kind and let your heart be heard…" aria-describedby="message-count">' + esc(d.message) + '</textarea>' +
                  '<p class="field_counter" id="message-count">' + d.message.length + ' / ' + CONFIG.messageMax + '</p></div>' +
                '<div class="checkbox-row">' +
                  '<label class="checkbox"><input class="checkbox_input" type="checkbox" id="anonymous"' + (d.anonymous ? ' checked' : '') + '><span class="checkbox_label">Donate anonymously</span></label>' +
                  '<label class="checkbox"><input class="checkbox_input" type="checkbox" id="updates"' + (d.updates ? ' checked' : '') + '><span class="checkbox_label">Email me campaign updates</span></label>' +
                '</div>' +
              '</section>' +
            '</div>' +
            '<aside class="page-grid_aside" aria-label="Your impact">' + impactPanel(c, d, true) + '</aside>' +
          '</div>' +
        '</div>' +
        '<div class="action-dock"><div class="action-dock_summary"><p class="action-dock_label">Your gift</p><p class="action-dock_value" id="dock-amount">' + peso2(d.amount) + '</p></div>' +
          '<button class="btn btn--primary btn--lg" type="button" data-action="continue">Continue to payment</button></div>'
    };
  };

  function methodBlock(key, iconId, title, sub, open, body) {
    return '<div class="method' + (open ? ' method--open' : '') + '" data-method="' + key + '">' +
      '<button class="method_head" type="button" aria-expanded="' + open + '" aria-controls="method-' + key + '" data-action="method" data-method="' + key + '">' +
        icon(iconId, 'method_icon') + '<span><span class="method_title">' + title + '</span><span class="method_sub">' + sub + '</span></span>' + icon('icn_ui_chevron', 'method_chev') +
      '</button>' +
      '<div class="method_body" id="method-' + key + '">' + body + '</div></div>';
  }

  function field(id, label, input, cls, hint) {
    return '<div class="field ' + (cls || '') + '" id="field-' + id + '"><label class="field_label" for="' + id + '">' + label + '</label>' + input +
      (hint ? '<p class="field_hint">' + hint + '</p>' : '') + '<p class="field_error" id="' + id + '-error"></p></div>';
  }

  function summaryHtml(c, d) {
    var fee = feeFor(d.amount);
    var total = d.coverFees ? round2(d.amount + fee) : d.amount;
    return '<div class="summary" id="summary">' +
      '<p class="summary_row"><span>Donation to ' + esc(c.organiser.name.split(' ')[0]) + '</span><span class="summary_value">' + peso2(d.amount) + '</span></p>' +
      '<p class="summary_row"><span>Processing fee (2.9% + ₱15)' + (d.coverFees ? '' : ' · deducted') + '</span><span class="summary_value">' + (d.coverFees ? peso2(fee) : '−' + peso2(fee)) + '</span></p>' +
      '<p class="summary_row"><span>Platform fee</span><span class="summary_value summary_value--free">₱0.00</span></p>' +
      '<p class="summary_row summary_row--total"><span>Total charged today</span><span class="summary_value">' + peso2(total) + '</span></p>' +
      '</div>';
  }
  function totalFor(d) { return d.coverFees ? round2(d.amount + feeFor(d.amount)) : d.amount; }

  views.payment = function (slug) {
    var c = state.bySlug[slug];
    if (!c) { return views.notFound(); }
    var d = draftFor(slug);
    var l = live(c);
    var total = totalFor(d);
    var cardBody =
      '<div class="field-grid field-grid--4">' +
        field('card-number', 'Card number', '<div class="field_control"><input class="field_input field_input--mono" id="card-number" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" maxlength="23" aria-describedby="card-number-error"><span class="field_brand" id="card-brand"></span></div>', 'field-grid_full') +
        field('card-name', 'Name on card', '<input class="field_input" id="card-name" type="text" autocomplete="cc-name" placeholder="Full name as it appears on your card" maxlength="60" aria-describedby="card-name-error">', 'field-grid_full field-grid_half') +
        field('card-exp', 'Expiry date', '<input class="field_input field_input--mono" id="card-exp" type="text" inputmode="numeric" autocomplete="cc-exp" placeholder="MM / YY" maxlength="7" aria-describedby="card-exp-error">') +
        field('card-cvc', 'CVC', '<input class="field_input field_input--mono" id="card-cvc" type="password" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" aria-describedby="card-cvc-error">') +
        '<label class="checkbox field-grid_full"><input class="checkbox_input" type="checkbox" id="save-card" checked><span class="checkbox_label">Save this card for faster giving<span class="checkbox_hint">Stored with our PCI DSS Level 1 processor. We never see or keep your CVC.</span></span></label>' +
      '</div>';
    var walletBody =
      '<fieldset class="fieldset"><legend class="field_label">Choose a wallet</legend><div class="wallet-options">' +
        '<label class="wallet-option"><input type="radio" name="wallet" value="GCash"' + (d.wallet === 'GCash' ? ' checked' : '') + '>GCash</label>' +
        '<label class="wallet-option"><input type="radio" name="wallet" value="Maya"' + (d.wallet === 'Maya' ? ' checked' : '') + '>Maya</label>' +
      '</div></fieldset>' +
      field('wallet-mobile', 'Mobile number', '<input class="field_input field_input--mono" id="wallet-mobile" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="0917 123 4567" maxlength="13" aria-describedby="wallet-mobile-error">', '', 'You’ll approve the payment in your wallet app.');
    var bankBody =
      field('bank', 'Your bank', '<select class="field_select" id="bank" aria-describedby="bank-error"><option value="">Select your bank</option>' + $.map(BANKS, function (b) { return '<option>' + esc(b) + '</option>'; }).join('') + '<option>Other (22 more banks)</option></select>', '', 'You’ll be sent to your bank to approve, then brought back here.');

    return {
      title: 'Choose your payment — GiveTogether',
      nav: 'explore',
      dock: true,
      html:
        '<form class="container" id="pay-form" novalidate data-slug="' + esc(slug) + '">' +
          '<div class="page-bar"><a class="icon-btn" href="#/give/' + esc(slug) + '" aria-label="Back to amount">' + icon('icn_ui_back') + '</a>' +
            '<h1 class="page-bar_title" tabindex="-1">Choose your payment</h1><span class="page-bar_step">Step 2 of 3</span></div>' +
          stepper(2) +
          '<div class="page-grid">' +
            '<div class="page-grid_main">' +
              contextRow(c) +
              '<section class="card card_pad card_pad--lg" aria-labelledby="method-title">' +
                '<h2 class="h3" id="method-title">Payment method</h2>' +
                '<div class="method-list stack-gap">' +
                  methodBlock('card', 'icn_pay_card', 'Credit / debit card', 'Mastercard, Visa · 3-D Secure', d.method === 'card', cardBody) +
                  methodBlock('wallet', 'icn_pay_wallet', 'E-wallet', 'GCash, Maya', d.method === 'wallet', walletBody) +
                  methodBlock('bank', 'icn_pay_bank', 'Online banking', 'BDO, BPI, UnionBank, Landbank and 22 more', d.method === 'bank', bankBody) +
                '</div>' +
              '</section>' +
              '<section class="card card_pad card_pad--lg" aria-labelledby="receipt-title">' +
                '<h2 class="h3" id="receipt-title">Your receipt</h2>' +
                '<div class="stack-gap">' + field('email', 'Email for your receipt', '<input class="field_input" id="email" type="email" autocomplete="email" placeholder="you@example.com" maxlength="120" value="' + esc(d.email) + '" aria-describedby="email-error">') + '</div>' +
                '<label class="checkbox"><input class="checkbox_input" type="checkbox" id="cover-fees"' + (d.coverFees ? ' checked' : '') + '><span class="checkbox_label">Cover the processing fee<span class="checkbox_hint" id="cover-hint">Adds ' + peso2(feeFor(d.amount)) + ' so the campaign receives your full ' + peso2(d.amount) + '.</span></span></label>' +
              '</section>' +
            '</div>' +
            '<aside class="page-grid_aside" aria-label="Order summary">' +
              '<section class="card card--raised">' +
                '<div class="card_pad receipt_campaign receipt_campaign--flush">' +
                  '<div class="receipt_thumb media" role="img" aria-label="' + esc(c.image_alt) + '"></div>' +
                  '<div><p class="receipt_title">' + esc(c.title) + '</p><p class="caption">' + l.pct + '% funded · ' + num(l.donors) + ' donors · ' + esc(timeLeft(c.hours_left)) + '</p></div>' +
                '</div>' +
                '<div class="card_pad card_divider">' +
                  '<p class="overline stack-gap-sm">Summary</p>' + summaryHtml(c, d) +
                  '<div class="aside-cta stack-gap"><button class="btn btn--primary btn--lg btn--block js-pay" type="submit">Pay ' + peso2(total) + '</button></div>' +
                  '<p class="legal stack-gap">By continuing you agree to the Terms of Service, Privacy Policy, Donor Agreement and Refund Policy.</p>' +
                '</div>' +
              '</section>' +
              '<div class="note">' + icon('icn_ui_lock', 'note_icon note_icon--success') + '<p>Secured with 256-bit SSL encryption and PCI DSS compliant. Refundable within 24 hours, no questions asked.</p></div>' +
            '</aside>' +
          '</div>' +
          '<div class="action-dock"><div class="action-dock_summary"><p class="action-dock_label">Total</p><p class="action-dock_value js-total">' + peso2(total) + '</p></div>' +
            '<button class="btn btn--primary btn--lg js-pay" type="submit">Pay ' + peso2(total) + '</button></div>' +
        '</form>'
    };
  };

  views.confirmation = function (ref) {
    var g = $.grep(state.gifts, function (x) { return x.ref === ref; })[0];
    if (!g) {
      return {
        title: 'Receipt not found — GiveTogether', nav: 'gifts',
        html: '<div class="container section"><div class="empty-state"><h1 class="h3 empty-state_title" tabindex="-1">We couldn’t find that receipt on this device</h1><p class="muted">Receipts are stored in this browser. Check the email we sent, or open My gifts.</p><p class="stack-gap"><a class="btn btn--primary" href="#/gifts">Open My gifts</a></p></div></div>'
      };
    }
    var c = state.bySlug[g.slug];
    var l = c ? live(c) : { raised: 0, pct: 0 };
    var imp = c ? impactFor(c, g.amount) : null;
    var phrase = imp ? 'your gift covers ' + imp.label.charAt(0).toLowerCase() + imp.label.slice(1) + '.' : 'every peso is receipted on the campaign page.';
    var date = new Date(g.date);
    var dateLabel = date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
    var shareUrl = window.location.origin + window.location.pathname + '#/c/' + g.slug;
    var shareText = 'I just gave to “' + (c ? c.title : 'a campaign') + '” on GiveTogether.';
    return {
      title: 'Thank you — your gift is on its way — GiveTogether',
      nav: 'gifts',
      html:
        '<section class="confirm_hero"><div class="confirm_inner">' +
          '<span class="confirm_check" aria-hidden="true">' + icon('icn_ui_check', 'icon icon--lg') + '</span>' +
          '<h1 class="confirm_title" tabindex="-1">Your ' + peso2(g.amount) + ' is on its way</h1>' +
          '<p class="confirm_lede">Thank you for making a difference. You were donor ' + num(g.donorNo) + ' — ' + esc(phrase) + '</p>' +
        '</div></section>' +
        '<div class="confirm_body">' +
          '<article class="receipt" aria-label="Donation receipt">' +
            '<div class="receipt_campaign">' +
              '<div class="receipt_thumb media" role="img" aria-label="' + esc(c ? c.image_alt : '') + '"></div>' +
              '<div class="receipt_body"><p class="receipt_title">' + esc(c ? c.title : g.slug) + '</p>' +
              '<p class="receipt_status">Now ' + peso(l.raised) + ' of ' + peso(c ? c.goal : 0) + ' · ' + l.pct + '% funded</p>' + progress(l.pct, 'progress--sm') + '</div>' +
            '</div>' +
            '<dl class="receipt_fields">' +
              '<div class="receipt_field"><dt class="receipt_key">Donation ID</dt><dd class="receipt_value">#' + esc(g.ref) + '</dd></div>' +
              '<div class="receipt_field"><dt class="receipt_key">Date</dt><dd class="receipt_value">' + esc(dateLabel) + '</dd></div>' +
              '<div class="receipt_field"><dt class="receipt_key">Total charged</dt><dd class="receipt_value">' + peso2(g.total) + '</dd></div>' +
              '<div class="receipt_field"><dt class="receipt_key">Paid with</dt><dd class="receipt_value">' + esc(g.paidWith) + '</dd></div>' +
            '</dl>' +
            (g.message ? '<p class="receipt_message">“' + esc(g.message) + '”' + (g.anonymous ? ' — shown as Anonymous' : '') + '</p>' : '') +
            '<div class="receipt_footer"><p>Receipt sent to ' + esc(g.email) + '</p><button class="link-arrow btn-link" type="button" data-action="print">Download PDF</button></div>' +
          '</article>' +
          '<section class="share" aria-labelledby="share-title">' +
            '<h2 class="h4" id="share-title">Share your impact</h2>' +
            '<p class="small muted stack-gap-sm">Help spread the word and inspire others to give.</p>' +
            '<div class="share_list">' +
              '<a class="share_list-item" href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(shareUrl) + '" target="_blank" rel="noopener noreferrer"><span class="share_glyph" aria-hidden="true">f</span>Facebook</a>' +
              '<a class="share_list-item" href="https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&amp;url=' + encodeURIComponent(shareUrl) + '" target="_blank" rel="noopener noreferrer"><span class="share_glyph" aria-hidden="true">X</span>X</a>' +
              '<a class="share_list-item" href="https://www.messenger.com/" target="_blank" rel="noopener noreferrer"><span class="share_glyph" aria-hidden="true">m</span>Messenger</a>' +
              '<button class="share_list-item" type="button" data-action="copy-link" data-slug="' + esc(g.slug) + '"><span class="share_glyph" aria-hidden="true">' + icon('icn_share_link', 'icon icon--sm') + '</span>Copy link</button>' +
            '</div>' +
            '<div class="confirm_actions">' +
              '<button class="btn btn--primary btn--lg" type="button" data-action="share" data-slug="' + esc(g.slug) + '">Share this campaign</button>' +
              '<a class="btn btn--secondary btn--lg" href="#/">Back to home</a>' +
            '</div>' +
            '<p class="confirm_tagline">Together, we can build a kinder tomorrow.</p>' +
          '</section>' +
        '</div>'
    };
  };

  views.gifts = function () {
    var list = state.gifts.slice().reverse();
    var body = list.length
      ? '<ul class="gift-list">' + $.map(list, function (g) {
          var c = state.bySlug[g.slug];
          return '<li><a class="gift-list_item" href="#/thank-you/' + esc(g.ref) + '"><div class="receipt_thumb media" aria-hidden="true"></div>' +
            '<div class="gift-list_body"><p class="gift-list_title">' + esc(c ? c.title : g.slug) + '</p><p class="gift-list_meta">#' + esc(g.ref) + ' · ' + esc(new Date(g.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })) + '</p></div>' +
            '<p class="gift-list_amount">' + peso2(g.amount) + '</p></a></li>';
        }).join('') + '</ul>'
      : '<div class="empty-state"><h2 class="h3 empty-state_title">No gifts yet</h2><p class="muted">When you give, your receipts appear here so you can revisit them any time.</p><p class="stack-gap"><a class="btn btn--primary" href="#/explore">Find a campaign</a></p></div>';
    var totalGiven = 0; $.each(list, function (_, g) { totalGiven += g.amount; });
    return {
      title: 'My gifts — GiveTogether', nav: 'gifts',
      html: '<div class="container">' +
        '<div class="page-bar"><h1 class="page-bar_title" tabindex="-1">My gifts</h1>' + (list.length ? '<span class="page-bar_step">' + list.length + ' · ' + peso2(totalGiven) + '</span>' : '') + '</div>' +
        '<p class="caption stack-gap-bottom">Receipts are stored on this device only.</p>' + body + '</div>'
    };
  };

  views.start = function () {
    return {
      title: 'Start a campaign — GiveTogether', nav: '',
      html: '<div class="container">' +
        '<div class="page-bar"><a class="icon-btn" href="#/" aria-label="Back to home">' + icon('icn_ui_back') + '</a><h1 class="page-bar_title" tabindex="-1">Start a campaign</h1></div>' +
        '<p class="lede">From sign-up to first payout in three steps. The slowest part is verification, and we tell you exactly what to upload.</p>' +
        '<ol class="steps section">' +
          '<li class="card card_pad"><span class="steps_index">1</span><h2 class="h3">Build the page</h2><p class="stack-gap-sm">Write the story, set the goal, and break the budget into line items with quotes.</p><p class="caption mono stack-gap-sm">≈ 25 minutes</p></li>' +
          '<li class="card card_pad"><span class="steps_index">2</span><h2 class="h3">Get verified</h2><p class="stack-gap-sm">Upload one government ID, a barangay or SEC document, and the bank account that will receive payouts.</p><p class="caption mono stack-gap-sm">≈ 2 working days</p></li>' +
          '<li class="card card_pad"><span class="steps_index">3</span><h2 class="h3">Collect and release</h2><p class="stack-gap-sm">Donations land instantly; payouts release per tranche once receipts are in.</p><p class="caption mono stack-gap-sm">First payout ≈ 36 hrs</p></li>' +
        '</ol>' +
        '<div class="note">' + icon('icn_ui_shield', 'note_icon') + '<p>No platform fee on the Community plan. Card and wallet processing is passed through at cost — 2.9% + ₱15 — and donors can cover it at checkout.</p></div>' +
        '<p class="section manage-cta"><a class="btn btn--primary btn--lg" href="#/manage/new">Create a campaign</a><a class="btn btn--secondary btn--lg" href="#/manage">Manage your campaigns</a></p>' +
        '</div>'
    };
  };

  /* ---------- Campaign management ---------- */
  var MANAGE_CATS = $.grep(CATEGORIES, function (c) { return c !== 'All'; });

  function manageRow(c) {
    var l = live(c), paused = c.status === 'paused';
    return '<li class="manage-row' + (paused ? ' manage-row--paused' : '') + '" data-slug="' + esc(c.slug) + '">' +
      '<div class="manage-row_thumb media" role="img" aria-label="' + esc(c.image_alt) + '"></div>' +
      '<div class="manage-row_body">' +
        '<div class="manage-row_badges"><span class="badge ' + (paused ? 'badge--muted' : 'badge--success') + '">' + (paused ? 'Paused' : 'Live') + '</span>' +
          (c.featured ? '<span class="badge badge--info">Featured</span>' : '') + (c.user ? '<span class="badge badge--outline">Created here</span>' : '') + '</div>' +
        '<p class="manage-row_title"><a href="#/c/' + esc(c.slug) + '">' + esc(c.title) + '</a></p>' +
        '<p class="manage-row_meta">' + esc(c.category) + ' · ' + esc(c.location) + ' · ' + peso(l.raised) + ' of ' + peso(c.goal) + ' · ' + esc(timeLeft(c.hours_left)) + '</p>' +
        progress(l.pct, 'progress--sm') +
      '</div>' +
      '<div class="manage-row_actions">' +
        '<button class="manage-btn" type="button" data-action="m-feature" aria-pressed="' + !!c.featured + '">' + (c.featured ? 'Unfeature' : 'Feature') + '</button>' +
        '<button class="manage-btn" type="button" data-action="m-pause">' + (paused ? 'Resume' : 'Pause') + '</button>' +
        '<a class="manage-btn" href="#/manage/edit/' + esc(c.slug) + '">Edit</a>' +
        '<button class="manage-btn manage-btn--danger" type="button" data-action="m-delete">Delete</button>' +
      '</div></li>';
  }

  views.manage = function () {
    var liveN = state.campaigns.length, pausedN = state.all.length - liveN, feat = $.grep(state.all, function (c) { return c.featured && c.status !== 'paused'; }).length;
    return {
      title: 'Manage campaigns — GiveTogether', nav: '',
      html: '<div class="container manage">' +
        '<div class="page-bar"><a class="icon-btn" href="#/" aria-label="Back to home">' + icon('icn_ui_back') + '</a><h1 class="page-bar_title manage_title" tabindex="-1">Manage campaigns</h1>' +
          '<a class="btn btn--primary btn--sm" href="#/manage/new">' + icon('icn_nav_add', 'icon icon--sm') + '<span>New campaign</span></a></div>' +
        '<dl class="manage-stats">' +
          '<div class="manage-stats_item"><dt>Live</dt><dd>' + liveN + '</dd></div>' +
          '<div class="manage-stats_item"><dt>Paused</dt><dd>' + pausedN + '</dd></div>' +
          '<div class="manage-stats_item"><dt>Featured</dt><dd>' + feat + '</dd></div>' +
        '</dl>' +
        '<p class="caption manage_hint">Live campaigns appear in Explore right away. Featured ones also lead the landing page. Changes are saved in this browser.</p>' +
        (state.all.length ? '<ul class="manage-list" id="manage-list">' + $.map(state.all, manageRow).join('') + '</ul>'
          : '<div class="empty-state"><h2 class="h3 empty-state_title">No campaigns yet</h2><p class="muted">Create your first campaign to see it listed here and in Explore.</p><p class="stack-gap"><a class="btn btn--primary" href="#/manage/new">New campaign</a></p></div>') +
        '<p class="manage_reset"><button class="btn-link link-arrow" type="button" data-action="m-reset">Restore the original campaign list</button></p>' +
      '</div>'
    };
  };

  views.manageForm = function (slug) {
    var c = slug ? state.bySlug[slug] : null;
    if (slug && !c) { return views.notFound(); }
    var v = c || { title: '', category: 'Education', location: '', goal: '', hours_left: 30 * 24, story: [], image_alt: '', featured: false, status: 'live', organiser: { name: '' } };
    var days = Math.max(1, Math.round((Number(v.hours_left) || 24) / 24));
    function opt(val, cur, label) { return '<option value="' + esc(val) + '"' + (val === cur ? ' selected' : '') + '>' + esc(label || val) + '</option>'; }
    return {
      title: (c ? 'Edit campaign' : 'New campaign') + ' — GiveTogether', nav: '',
      html: '<div class="container manage">' +
        '<div class="page-bar"><a class="icon-btn" href="#/manage" aria-label="Back to campaigns">' + icon('icn_ui_back') + '</a><h1 class="page-bar_title manage_title" tabindex="-1">' + (c ? 'Edit campaign' : 'New campaign') + '</h1></div>' +
        '<form class="card card_pad card_pad--lg manage-form" id="manage-form" novalidate data-slug="' + esc(c ? c.slug : '') + '">' +
          '<div class="field-grid">' +
            field('m-title', 'Campaign title', '<input class="field_input" id="m-title" type="text" maxlength="120" required value="' + esc(v.title) + '" placeholder="Replace 12 fishing bancas lost in Bantayan" aria-describedby="m-title-error">', 'field-grid_full') +
            field('m-category', 'Cause', '<select class="field_select" id="m-category">' + $.map(MANAGE_CATS, function (k) { return opt(k, v.category); }).join('') + '</select>') +
            field('m-location', 'Location', '<input class="field_input" id="m-location" type="text" maxlength="60" required value="' + esc(v.location) + '" placeholder="Cebu" aria-describedby="m-location-error">') +
            (c ? '' : field('m-organiser', 'Organiser name', '<input class="field_input" id="m-organiser" type="text" maxlength="80" required placeholder="Full name or organisation" aria-describedby="m-organiser-error">', 'field-grid_full')) +
            field('m-goal', 'Goal (₱)', '<input class="field_input field_input--mono" id="m-goal" type="text" inputmode="numeric" maxlength="9" required value="' + esc(v.goal) + '" placeholder="250000" aria-describedby="m-goal-error">', '', 'Between ₱5,000 and ₱10,000,000.') +
            field('m-days', 'Days to run', '<input class="field_input field_input--mono" id="m-days" type="text" inputmode="numeric" maxlength="2" required value="' + days + '" aria-describedby="m-days-error">', '', '1 to 90 days.') +
            field('m-story', 'Story', '<textarea class="field_textarea manage-form_story" id="m-story" maxlength="2400" required placeholder="What happened, who is helped, and what the money buys." aria-describedby="m-story-error">' + esc((v.story || []).join('\n\n')) + '</textarea>', 'field-grid_full', 'Leave a blank line between paragraphs.') +
            field('m-alt', 'Photo description', '<input class="field_input" id="m-alt" type="text" maxlength="140" value="' + esc(v.image_alt) + '" placeholder="Fishermen repairing a banca on the shore">', 'field-grid_full', 'Read aloud by screen readers until your photo is uploaded.') +
            field('m-status', 'Visibility', '<select class="field_select" id="m-status">' + opt('live', v.status, 'Live — listed in Explore') + opt('paused', v.status, 'Paused — hidden from lists') + '</select>') +
            '<div class="field manage-form_check"><label class="checkbox"><input class="checkbox_input" type="checkbox" id="m-featured"' + (v.featured ? ' checked' : '') + '><span class="checkbox_label">Feature on the landing page<span class="checkbox_hint">Up to 3 featured campaigns are shown.</span></span></label></div>' +
          '</div>' +
          '<div class="manage-form_actions"><a class="btn btn--secondary" href="#/manage">Cancel</a><button class="btn btn--primary" type="submit">' + (c ? 'Save changes' : 'Publish campaign') + '</button></div>' +
        '</form></div>'
    };
  };

  function slugify(t) {
    var base = String(t).toLowerCase().normalize ? String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : String(t).toLowerCase();
    base = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'campaign';
    var r = new Uint16Array(1); (window.crypto || window.msCrypto).getRandomValues(r);
    return base + '-' + (r[0] % 10000);
  }

  function submitManage($f) {
    var slug = String($f.attr('data-slug') || '');
    var title = $.trim($('#m-title').val()), loc = $.trim($('#m-location').val()), story = $.trim($('#m-story').val());
    var goal = parseInt(String($('#m-goal').val()).replace(/\D/g, ''), 10), days = parseInt(String($('#m-days').val()).replace(/\D/g, ''), 10);
    var org = slug ? '' : $.trim($('#m-organiser').val());
    var ok = true, first = null;
    function check(id, msg) { var good = setError(id, msg); if (!good && !first) { first = id; } ok = ok && good; }
    check('m-title', title.length >= 10 ? '' : 'Give the campaign a title of at least 10 characters.');
    check('m-location', loc.length >= 2 ? '' : 'Add the city, town or province.');
    if (!slug) { check('m-organiser', org.length >= 2 ? '' : 'Add the organiser’s name.'); }
    check('m-goal', goal >= 5000 && goal <= 10000000 ? '' : 'Set a goal between ₱5,000 and ₱10,000,000.');
    check('m-days', days >= 1 && days <= 90 ? '' : 'Run the campaign for 1 to 90 days.');
    check('m-story', story.length >= 40 ? '' : 'Tell donors a little more — at least 40 characters.');
    if (!ok) { $('#' + first).trigger('focus'); toast('Please check the highlighted fields.'); return; }
    var patch = {
      title: title, category: String($('#m-category').val()), location: loc, goal: goal, hours_left: days * 24,
      story: $.grep(story.split(/\n\s*\n/), function (p) { return $.trim(p) !== ''; }).slice(0, 12).map(function (p) { return $.trim(p); }),
      image_alt: $.trim($('#m-alt').val()) || title, status: $('#m-status').val() === 'paused' ? 'paused' : 'live', featured: $('#m-featured').is(':checked')
    };
    if (slug) { window.GTStore.update(slug, patch); toast('Changes saved.'); }
    else {
      var initials = $.map(org.split(/\s+/).slice(0, 2), function (w) { return w.charAt(0).toUpperCase(); }).join('') || 'GT';
      slug = slugify(title);
      var q = Math.round(goal / 100) * 100;
      window.GTStore.create($.extend(patch, {
        id: 'GT-LOCAL-' + slug.slice(-4), slug: slug, short: title, image: 'img_campaign_new.jpg',
        raised: 0, donors: 0, shares: 0, updates: 0,
        organiser: { name: org, initials: initials, verified_on: 'pending review', bank: 'account on file' },
        budget: [{ label: 'Campaign goal', detail: 'Line items published after verification', amount: goal }],
        impact: [{ amount: 100, label: 'A share of the first tranche' }, { amount: 500, label: 'A bigger share of the first tranche' }, { amount: 1000, label: 'One day of progress' }, { amount: 2500, label: 'A major line item' }],
        impact_note: 'The organiser will attach supplier quotes once verified. Goal ' + peso(q) + '.',
        recent: []
      }));
      toast('Campaign published.');
    }
    applyManaged();
    go('#/manage');
  }

  views.notFound = function () {
    return {
      title: 'Page not found — GiveTogether', nav: '',
      html: '<div class="container section"><div class="empty-state"><h1 class="h3 empty-state_title" tabindex="-1">This page doesn’t exist</h1><p class="muted">The link may be old, or the campaign may have closed.</p><p class="stack-gap"><a class="btn btn--primary" href="#/">Back to home</a></p></div></div>'
    };
  };

  views.error = function () {
    return {
      title: 'Connection problem — GiveTogether', nav: '',
      html: '<div class="container section"><div class="empty-state"><h1 class="h3 empty-state_title" tabindex="-1">We couldn’t load campaigns</h1><p class="muted">Check your connection and try again. Nothing has been charged.</p><p class="stack-gap"><button class="btn btn--primary" type="button" data-action="reload">Try again</button></p></div></div>'
    };
  };

  /* ---------- Router ---------- */
  function parse() {
    var h = (window.location.hash || '').replace(/^#/, '');
    if (!h || h === '/') { return { name: 'discover' }; }
    if (h.charAt(0) !== '/') { return null; }
    var p = h.split('?')[0].split('/').filter(Boolean);
    if (p[0] === 'explore') { return { name: 'explore' }; }
    if (p[0] === 'gifts') { return { name: 'gifts' }; }
    if (p[0] === 'start') { return { name: 'start' }; }
    if (p[0] === 'manage') {
      if (p[1] === 'new') { return { name: 'manageForm' }; }
      if (p[1] === 'edit' && p[2] && isSafeSlug(p[2])) { return { name: 'manageForm', arg: p[2] }; }
      return { name: 'manage' };
    }
    if (p[0] === 'c' && p[1] && isSafeSlug(p[1])) { return { name: 'campaign', arg: p[1] }; }
    if (p[0] === 'give' && p[1] && isSafeSlug(p[1])) { return { name: p[2] === 'pay' ? 'payment' : 'amount', arg: p[1] }; }
    if (p[0] === 'thank-you' && p[1] && /^[A-Z0-9-]{6,32}$/.test(p[1])) { return { name: 'confirmation', arg: p[1] }; }
    return { name: 'notFound' };
  }

  function render() {
    var r = parse();
    if (!r) { return; }
    if (!state.data) { return; }
    var v = views[r.name](r.arg);
    var $view = $('#view');
    $view.html(v.html).toggleClass('view--dock', !!v.dock);
    $('body').toggleClass('has-dock', !!v.dock);
    document.title = v.title;
    $('.nav_list-item').each(function () {
      var on = $(this).data('nav') === v.nav;
      $(this).toggleClass('nav_list-item--active', on);
      if (on) { $(this).attr('aria-current', 'page'); } else { $(this).removeAttr('aria-current'); }
    });
    $('.search--header .js-search').val(state.query);
    hydrate($view, r.name === 'amount' ? function () { syncAmount(r.arg); } : null);
    window.scrollTo(0, 0);
    if (!state.firstRender) { $view.find('[tabindex="-1"]').first().trigger('focus'); }
    state.firstRender = false;
  }

  function hydrate($root, after) {
    var $bars = $root.find('[data-w]');
    window.requestAnimationFrame(function () {
      $bars.each(function () {
        var w = Math.max(0, Math.min(100, parseFloat($(this).attr('data-w')) || 0));
        $(this).css('width', w + '%');
      });
      if (after) { after(); }
    });
  }

  function go(hash) { if (window.location.hash === hash) { render(); } else { window.location.hash = hash; } }

  /* ---------- Amount step ---------- */
  function syncAmount(slug) {
    var c = state.bySlug[slug]; if (!c) { return; }
    var d = draftFor(slug);
    var l = live(c);
    var giftPct = c.goal ? (d.amount / c.goal) * 100 : 0;
    var visible = Math.min(100 - l.pct, Math.max(giftPct, d.amount > 0 ? 0.8 : 0));
    $('.progress_gift').css('width', visible + '%');
    $('#impact-before-after').text(peso(l.raised) + ' → ' + peso(l.raised + d.amount));
    $('#impact-to-go').text(peso(Math.max(0, l.toGo - d.amount)) + ' to go');
    $('#dock-amount').text(peso2(d.amount));
    var best = impactFor(c, d.amount);
    $('#impact-ladder .impact-ladder_item').each(function () {
      var on = best && Number($(this).attr('data-rung')) === best.amount;
      $(this).toggleClass('impact-ladder_item--active', !!on);
    });
    $('.amount-tile[data-action="pick-amount"]').each(function () {
      var on = !d.custom && Number($(this).attr('data-amount')) === d.amount;
      $(this).toggleClass('amount-tile--active', on).attr('aria-pressed', on);
    });
    saveDrafts();
  }

  function validateAmount(slug) {
    var d = draftFor(slug);
    var $f = $('#field-custom');
    var err = '';
    if (d.custom !== '') {
      var n = parseInt(d.custom, 10);
      if (isNaN(n) || n < CONFIG.minAmount) { err = 'The minimum gift is ' + peso(CONFIG.minAmount) + '.'; }
      else if (n > CONFIG.maxAmount) { err = 'For gifts above ' + peso(CONFIG.maxAmount) + ', please contact us so we can verify the transfer.'; }
    }
    $f.toggleClass('field--invalid', !!err);
    $('#custom-amount').attr('aria-invalid', err ? 'true' : 'false');
    $('#custom-error').text(err);
    return !err;
  }

  /* ---------- Payment validation ---------- */
  function luhn(n) {
    var sum = 0, alt = false;
    for (var i = n.length - 1; i >= 0; i--) {
      var d = parseInt(n.charAt(i), 10);
      if (alt) { d *= 2; if (d > 9) { d -= 9; } }
      sum += d; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function brandOf(n) {
    if (/^4/.test(n)) { return 'VISA'; }
    if (/^(5[1-5]|2[2-7])/.test(n)) { return 'MASTERCARD'; }
    if (/^3[47]/.test(n)) { return 'AMEX'; }
    return '';
  }
  function setError(id, msg) {
    var $f = $('#field-' + id);
    $f.toggleClass('field--invalid', !!msg);
    $('#' + id).attr('aria-invalid', msg ? 'true' : 'false');
    $('#' + id + '-error').text(msg || '');
    return !msg;
  }

  function validatePayment(d) {
    var ok = true, first = null;
    function check(id, msg) { var good = setError(id, msg); if (!good && !first) { first = id; } ok = ok && good; }
    var email = $.trim($('#email').val());
    check('email', /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email) ? '' : 'Enter the email where we should send your receipt.');
    if (d.method === 'card') {
      var num = ($('#card-number').val() || '').replace(/\D/g, '');
      check('card-number', num.length >= 13 && num.length <= 19 && luhn(num) ? '' : 'Check the card number — it doesn’t look complete.');
      check('card-name', $.trim($('#card-name').val()).length >= 2 ? '' : 'Enter the name exactly as it appears on the card.');
      var exp = ($('#card-exp').val() || '').replace(/\s/g, '');
      var m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(exp);
      var expOk = false;
      if (m) { var end = new Date(2000 + parseInt(m[2], 10), parseInt(m[1], 10), 1); expOk = end > new Date(); }
      check('card-exp', expOk ? '' : 'Use MM / YY, and a date that hasn’t passed.');
      var cvcLen = brandOf(num) === 'AMEX' ? 4 : 3;
      check('card-cvc', new RegExp('^\\d{' + cvcLen + '}$').test($('#card-cvc').val() || '') ? '' : 'Enter the ' + cvcLen + '-digit code on the back of the card.');
    } else if (d.method === 'wallet') {
      var mob = ($('#wallet-mobile').val() || '').replace(/\D/g, '');
      check('wallet-mobile', /^09\d{9}$/.test(mob) ? '' : 'Enter an 11-digit mobile number starting with 09.');
    } else {
      check('bank', $('#bank').val() ? '' : 'Choose the bank you’ll pay from.');
    }
    if (first) { $('#' + first).trigger('focus'); }
    return ok;
  }

  function newRef() {
    var dt = new Date();
    var ymd = dt.getFullYear() + ('0' + (dt.getMonth() + 1)).slice(-2) + ('0' + dt.getDate()).slice(-2);
    var r = new Uint16Array(1);
    (window.crypto || window.msCrypto).getRandomValues(r);
    return 'GT' + ymd + '-' + ('000' + (r[0] % 10000)).slice(-4);
  }

  function refreshSummary(slug) {
    var c = state.bySlug[slug], d = draftFor(slug);
    var total = totalFor(d);
    $('#summary').replaceWith(summaryHtml(c, d));
    $('.js-pay').text('Pay ' + peso2(total));
    $('.js-total').text(peso2(total));
    $('#cover-hint').text(d.coverFees ? 'Adds ' + peso2(feeFor(d.amount)) + ' so the campaign receives your full ' + peso2(d.amount) + '.' : 'The campaign receives ' + peso2(round2(d.amount - feeFor(d.amount))) + ' after processing.');
  }

  function submitPayment(slug) {
    var c = state.bySlug[slug], d = draftFor(slug);
    if (!c || !validatePayment(d)) { toast('Please check the highlighted fields.'); return; }
    var $btns = $('.js-pay').prop('disabled', true).addClass('is-loading').attr('aria-busy', 'true');
    var fee = feeFor(d.amount);
    var paidWith;
    if (d.method === 'card') {
      var n = ($('#card-number').val() || '').replace(/\D/g, '');
      paidWith = (brandOf(n) || 'Card') + ' ···' + n.slice(-4);
    } else if (d.method === 'wallet') {
      var mob = ($('#wallet-mobile').val() || '').replace(/\D/g, '');
      paidWith = d.wallet + ' ···' + mob.slice(-4);
    } else {
      paidWith = String($('#bank').val());
    }
    // Card number and CVC are never persisted; clear the inputs immediately.
    $('#card-number, #card-cvc').val('');
    var l = live(c);
    var gift = {
      ref: newRef(), slug: slug, amount: d.amount, fee: fee, covered: d.coverFees,
      total: totalFor(d), paidWith: paidWith, email: $.trim($('#email').val()).slice(0, 120),
      message: String(d.message || '').slice(0, CONFIG.messageMax), anonymous: !!d.anonymous,
      date: new Date().toISOString(), donorNo: l.donors + 1
    };
    window.setTimeout(function () {
      state.gifts.push(gift);
      store.set('gifts', state.gifts.slice(-50));
      var net = d.coverFees ? d.amount : Math.max(0, round2(d.amount - fee));
      var delta = state.deltas[slug] || { amount: 0, count: 0 };
      delta.amount = round2(delta.amount + net); delta.count += 1;
      state.deltas[slug] = delta;
      store.set('deltas', state.deltas);
      delete state.drafts[slug];
      saveDrafts();
      $btns.prop('disabled', false).removeClass('is-loading').removeAttr('aria-busy');
      go('#/thank-you/' + gift.ref);
    }, CONFIG.processingMs);
  }

  /* ---------- Share ---------- */
  function shareCampaign(slug) {
    var c = state.bySlug[slug];
    var url = window.location.origin + window.location.pathname + '#/c/' + slug;
    if (navigator.share) {
      navigator.share({ title: c ? c.title : 'GiveTogether', text: 'Give to a verified campaign on GiveTogether', url: url }).catch(function () { /* dismissed */ });
    } else { copyLink(url); }
  }
  function copyLink(url) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(function () { toast('Link copied — paste it anywhere.'); }, function () { toast(url); });
    } else { toast(url); }
  }

  /* ---------- Events (delegated) ---------- */
  function bind() {
    var $doc = $(document);

    $(window).on('hashchange', render);

    $doc.on('click', '.skip-link', function (e) { e.preventDefault(); $('#view').trigger('focus'); });

    $doc.on('click', '[data-action="filter"]', function () {
      state.filter = String($(this).attr('data-value'));
      $('.chip').each(function () { var on = $(this).attr('data-value') === state.filter; $(this).toggleClass('chip--active', on).attr('aria-pressed', on); });
      $('#campaign-grid').html(gridHtml()); hydrate($('#campaign-grid'));
      $('#result-count').text(filtered().length + ' verified campaigns');
    });
    $doc.on('click', '[data-action="filter-link"]', function () { state.filter = String($(this).attr('data-value')); });
    $doc.on('click', '[data-action="clear-filters"]', function () {
      state.filter = 'All'; state.query = ''; $('.js-search').val(''); render();
    });
    $doc.on('click', '[data-action="scroll-campaigns"]', function () {
      var el = document.getElementById('campaigns'); if (!el) { return; }
      var top = el.getBoundingClientRect().top + window.pageYOffset - $('.app-header').outerHeight() - 8;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });

    var searchTimer;
    $doc.on('input', '.js-search', function () {
      var val = String($(this).val() || '').slice(0, 80);
      state.query = val;
      $('.js-search').not(this).val(val);
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        var r = parse();
        if (r && (r.name === 'discover' || r.name === 'explore')) {
          $('#campaign-grid').html(gridHtml()); hydrate($('#campaign-grid'));
          $('#result-count').text(filtered().length + ' verified campaigns');
        } else if (val) { go('#/explore'); }
      }, 160);
    });
    $doc.on('keydown', '.js-search', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var r = parse(); if (!r || r.name !== 'explore') { go('#/explore'); } }
    });

    // Tabs (ARIA tabs pattern with arrow keys)
    function selectTab($tab) {
      var $all = $tab.closest('.tabs').find('.tabs_item');
      $all.attr({ 'aria-selected': 'false', tabindex: '-1' });
      $tab.attr({ 'aria-selected': 'true', tabindex: '0' });
      $('.tabs_panel').attr('hidden', true);
      $('#' + $tab.attr('aria-controls')).removeAttr('hidden');
    }
    $doc.on('click', '.tabs_item', function () { selectTab($(this)); });
    $doc.on('keydown', '.tabs_item', function (e) {
      var $all = $(this).closest('.tabs').find('.tabs_item'), i = $all.index(this), n = null;
      if (e.key === 'ArrowRight') { n = (i + 1) % $all.length; }
      if (e.key === 'ArrowLeft') { n = (i - 1 + $all.length) % $all.length; }
      if (e.key === 'Home') { n = 0; }
      if (e.key === 'End') { n = $all.length - 1; }
      if (n !== null) { e.preventDefault(); var $t = $all.eq(n); selectTab($t); $t.trigger('focus'); }
    });
    $doc.on('click', '[data-action="tab"]', function () {
      var $t = $('#tab-' + $(this).attr('data-tab')); selectTab($t); $t.trigger('focus');
    });

    // Campaign quick amount
    $doc.on('click', '[data-action="quick-amount"]', function () {
      var r = parse(); if (!r) { return; }
      var d = draftFor(r.arg), c = state.bySlug[r.arg];
      d.amount = Number($(this).attr('data-amount')); d.custom = '';
      $('[data-action="quick-amount"]').each(function () { var on = Number($(this).attr('data-amount')) === d.amount; $(this).toggleClass('amount-tile--active', on).attr('aria-pressed', on); });
      var sel = impactFor(c, d.amount);
      $('#donate-cta').text('Donate ' + peso(d.amount) + ' now');
      $('#donate-caption').text((sel ? peso(sel.amount) + ' buys ' + sel.label.charAt(0).toLowerCase() + sel.label.slice(1) + '. ' : '') + 'You’ll see the full total before anything is charged.');
      saveDrafts();
    });

    // Amount step
    $doc.on('click', '[data-action="pick-amount"]', function () {
      var r = parse(); if (!r) { return; }
      var d = draftFor(r.arg);
      d.amount = Number($(this).attr('data-amount')); d.custom = '';
      $('#custom-amount').val('');
      validateAmount(r.arg); syncAmount(r.arg);
    });
    $doc.on('input', '#custom-amount', function () {
      var r = parse(); if (!r) { return; }
      var d = draftFor(r.arg);
      var clean = String($(this).val()).replace(/\D/g, '').slice(0, 7);
      if ($(this).val() !== clean) { $(this).val(clean); }
      d.custom = clean;
      var n = parseInt(clean, 10);
      if (!isNaN(n) && n >= CONFIG.minAmount && n <= CONFIG.maxAmount) { d.amount = n; }
      if (clean === '') { d.amount = d.amount || 100; }
      syncAmount(r.arg);
      if ($('#field-custom').hasClass('field--invalid')) { validateAmount(r.arg); }
    });
    $doc.on('blur', '#custom-amount', function () { var r = parse(); if (r) { validateAmount(r.arg); } });
    $doc.on('input', '#message', function () {
      var r = parse(); if (!r) { return; }
      var v = String($(this).val()).slice(0, CONFIG.messageMax);
      draftFor(r.arg).message = v;
      $('#message-count').text(v.length + ' / ' + CONFIG.messageMax);
      saveDrafts();
    });
    $doc.on('change', '#anonymous, #updates', function () {
      var r = parse(); if (!r) { return; }
      draftFor(r.arg)[this.id] = this.checked; saveDrafts();
    });
    $doc.on('click', '[data-action="continue"]', function () {
      var r = parse(); if (!r) { return; }
      if (!validateAmount(r.arg)) { $('#custom-amount').trigger('focus'); toast('Check the amount before continuing.'); return; }
      saveDrafts();
      go('#/give/' + r.arg + '/pay');
    });

    // Payment step
    $doc.on('click', '[data-action="method"]', function () {
      var r = parse(); if (!r) { return; }
      var key = String($(this).attr('data-method'));
      draftFor(r.arg).method = key; saveDrafts();
      $('.method').each(function () {
        var on = $(this).attr('data-method') === key;
        $(this).toggleClass('method--open', on).find('.method_head').attr('aria-expanded', on);
      });
    });
    $doc.on('change', 'input[name="wallet"]', function () { var r = parse(); if (r) { draftFor(r.arg).wallet = this.value; saveDrafts(); } });
    $doc.on('input', '#card-number', function () {
      var digits = String($(this).val()).replace(/\D/g, '').slice(0, 19);
      $(this).val(digits.replace(/(.{4})/g, '$1 ').trim());
      $('#card-brand').text(brandOf(digits));
    });
    $doc.on('input', '#card-exp', function (e) {
      var digits = String($(this).val()).replace(/\D/g, '').slice(0, 4);
      var out = digits.length > 2 ? digits.slice(0, 2) + ' / ' + digits.slice(2) : digits;
      if (e.originalEvent && e.originalEvent.inputType === 'deleteContentBackward' && digits.length === 2) { out = digits; }
      $(this).val(out);
    });
    $doc.on('input', '#card-cvc', function () { $(this).val(String($(this).val()).replace(/\D/g, '').slice(0, 4)); });
    $doc.on('input', '#wallet-mobile', function () {
      var dg = String($(this).val()).replace(/\D/g, '').slice(0, 11);
      $(this).val(dg.replace(/^(\d{4})(\d{0,3})(\d{0,4}).*/, function (_, a, b, c) { return [a, b, c].filter(Boolean).join(' '); }));
    });
    $doc.on('input', '#email', function () { var r = parse(); if (r) { draftFor(r.arg).email = String($(this).val()).slice(0, 120); saveDrafts(); } });
    $doc.on('change', '#cover-fees', function () { var r = parse(); if (r) { draftFor(r.arg).coverFees = this.checked; saveDrafts(); refreshSummary(r.arg); } });
    $doc.on('blur', '#pay-form .field_input, #pay-form .field_select', function () {
      var $f = $(this).closest('.field');
      if ($f.hasClass('field--invalid')) { var r = parse(); if (r) { validatePayment(draftFor(r.arg)); } }
    });
    $doc.on('submit', '#pay-form', function (e) {
      e.preventDefault();
      if ($('.js-pay').prop('disabled')) { return; }
      submitPayment(String($(this).attr('data-slug')));
    });

    // Campaign management
    $doc.on('submit', '#manage-form', function (e) { e.preventDefault(); submitManage($(this)); });
    $doc.on('input', '#m-goal, #m-days', function () { var v = String($(this).val()).replace(/\D/g, ''); if ($(this).val() !== v) { $(this).val(v); } });
    $doc.on('blur', '#manage-form .field_input, #manage-form .field_textarea', function () { if ($(this).closest('.field').hasClass('field--invalid')) { setError(this.id, ''); } });
    function rowSlug(el) { return String($(el).closest('.manage-row').attr('data-slug')); }
    function afterManage(msg) { applyManaged(); render(); if (msg) { toast(msg); } }
    $doc.on('click', '[data-action="m-feature"]', function () {
      var s = rowSlug(this), c = state.bySlug[s]; if (!c) { return; }
      window.GTStore.update(s, { featured: !c.featured });
      afterManage(c.featured ? 'Removed from the landing page.' : 'Featured on the landing page.');
    });
    $doc.on('click', '[data-action="m-pause"]', function () {
      var s = rowSlug(this), c = state.bySlug[s]; if (!c) { return; }
      var paused = c.status === 'paused';
      window.GTStore.update(s, { status: paused ? 'live' : 'paused' });
      afterManage(paused ? 'Campaign is live again.' : 'Campaign paused and hidden from lists.');
    });
    $doc.on('click', '[data-action="m-delete"]', function () {
      var s = rowSlug(this), c = state.bySlug[s]; if (!c) { return; }
      if (!window.confirm('Delete “' + c.title + '”? It will be removed from every campaign list.')) { return; }
      var $row = $(this).closest('.manage-row').addClass('manage-row--leaving');
      window.setTimeout(function () { window.GTStore.remove(s); afterManage('Campaign deleted.'); }, 260);
    });
    $doc.on('click', '[data-action="m-reset"]', function () {
      if (!window.confirm('Restore the original campaign list? Campaigns you created here will be removed.')) { return; }
      window.GTStore.reset(); afterManage('Original campaigns restored.');
    });
    $(window).on('storage', function (e) { if (e.originalEvent && e.originalEvent.key === window.GTStore.KEY) { applyManaged(); render(); } });

    // Confirmation
    $doc.on('click', '[data-action="share"]', function () { shareCampaign(String($(this).attr('data-slug'))); });
    $doc.on('click', '[data-action="copy-link"]', function () { copyLink(window.location.origin + window.location.pathname + '#/c/' + $(this).attr('data-slug')); });
    $doc.on('click', '[data-action="print"]', function () { window.print(); });
    $doc.on('click', '[data-action="reload"]', function () { window.location.reload(); });
  }

  /* ---------- Boot ---------- */
  function splash(start) {
    var $b = $('body');
    var seen = false;
    try { seen = window.sessionStorage.getItem(CONFIG.storage + 'splash') === '1'; } catch (e) { seen = true; }
    if (seen || window.innerWidth >= 768) { return function () {}; }
    $b.addClass('is-splash');
    try { window.sessionStorage.setItem(CONFIG.storage + 'splash', '1'); } catch (e) { /* ignore */ }
    return function () {
      var wait = Math.max(0, CONFIG.splashMs - (Date.now() - start));
      window.setTimeout(function () {
        $b.addClass('is-splash-out');
        window.setTimeout(function () { $b.removeClass('is-splash is-splash-out'); }, 320);
      }, wait);
    };
  }

  $(function () {
    var start = Date.now();
    var done = splash(start);
    state.gifts = store.get('gifts', []);
    state.deltas = store.get('deltas', {});
    if (!Array.isArray(state.gifts)) { state.gifts = []; }
    loadDrafts();
    bind();
    $.ajax({ url: CONFIG.dataUrl, dataType: 'json', cache: true, timeout: 10000 })
      .done(function (payload) {
        state.data = payload || {};
        state.data.fees = state.data.fees || { rate: 0.029, flat: 15 };
        state.data.stats = state.data.stats || { raised_label: '—', funded: '—', payout: '—' };
        state.raw = (payload && payload.campaigns) || [];
        applyManaged();
        render();
      })
      .fail(function () {
        state.data = { fees: { rate: 0.029, flat: 15 } };
        var v = views.error();
        $('#view').html(v.html); document.title = v.title;
      })
      .always(done);
  });
}(window.jQuery, window, document));
