/* GiveTogether — campaign-store.js. Organiser-side campaign management saved on this device.
   Shared by index.html and app.html so edits appear in every campaign list. */
(function (w) {
  'use strict';
  var KEY = 'gt.v1.managed';
  var EDITABLE = ['title', 'category', 'location', 'goal', 'hours_left', 'status', 'featured', 'story', 'image_alt'];
  function empty() { return { created: [], edits: {}, removed: [] }; }
  function read() {
    try {
      var v = JSON.parse(w.localStorage.getItem(KEY));
      if (v && typeof v === 'object') {
        return {
          created: Array.isArray(v.created) ? v.created : [],
          edits: v.edits && typeof v.edits === 'object' ? v.edits : {},
          removed: Array.isArray(v.removed) ? v.removed : []
        };
      }
    } catch (e) { /* ignore */ }
    return empty();
  }
  function write(s) { try { w.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage disabled */ } }
  function clone(o) { var r = {}; for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { r[k] = o[k]; } } return r; }
  function apply(list, opts) {
    var s = read(), out = [];
    (list || []).concat(s.created).forEach(function (c) {
      if (!c || !c.slug || s.removed.indexOf(c.slug) > -1) { return; }
      var m = clone(c), e = s.edits[c.slug];
      if (e) {
        EDITABLE.forEach(function (k) { if (e[k] !== undefined) { m[k] = e[k]; } });
        if (e.title) { m.short = e.title; }
      }
      m.status = m.status === 'paused' ? 'paused' : 'live';
      out.push(m);
    });
    return opts && opts.all ? out : out.filter(function (c) { return c.status === 'live'; });
  }
  function update(slug, patch) {
    var s = read(), found = false;
    s.created.forEach(function (c) { if (c.slug === slug) { found = true; EDITABLE.forEach(function (k) { if (patch[k] !== undefined) { c[k] = patch[k]; } }); if (patch.title) { c.short = patch.title; } } });
    if (!found) { var e = s.edits[slug] || {}; EDITABLE.forEach(function (k) { if (patch[k] !== undefined) { e[k] = patch[k]; } }); s.edits[slug] = e; }
    write(s);
  }
  function create(c) { var s = read(); c.user = true; s.created.push(c); write(s); }
  function remove(slug) {
    var s = read(), before = s.created.length;
    s.created = s.created.filter(function (c) { return c.slug !== slug; });
    if (s.created.length === before && s.removed.indexOf(slug) < 0) { s.removed.push(slug); }
    delete s.edits[slug];
    write(s);
  }
  function reset() { try { w.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  w.GTStore = { KEY: KEY, read: read, apply: apply, update: update, create: create, remove: remove, reset: reset };
}(window));
