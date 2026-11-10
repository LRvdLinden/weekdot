// weekdot.com animations (in the spirit of pasr.nl): devices that rise in and float and follow the mouse,
// sections and tiles that slide in while scrolling, a counting "34", a scrolling band of calendars and services,
// and two live demos: joining a video call, and Month & List picking days.
// Everything is skipped when the visitor prefers reduced motion (the html element then lacks the "motion" class).
(function () {
  "use strict";
  var root = document.documentElement;
  var motion = root.classList.contains("motion");
  var I18N = window.WEEKDOT_I18N || { en: {} };
  var lang = (window.WeekdotLang && window.WeekdotLang.lang) || "en";
  if (!I18N[lang]) lang = "en";
  function t(k) { return (I18N[lang] || {})[k] || (I18N.en || {})[k] || ""; }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function fmt(d, o) { try { return new Intl.DateTimeFormat(lang, o).format(d); } catch (e) { return ""; } }
  function rel(n) { try { return new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(n, "minute"); } catch (e) { return n + " min"; } }
  function cap(s) { return s ? s.charAt(0).toLocaleUpperCase(lang) + s.slice(1) : s; }
  function seen(el, fn, opts) {
    if (!("IntersectionObserver" in window)) return fn();
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); }
    }, opts || { threshold: 0.25 });
    io.observe(el);
  }
  function whenVisible(el, start, stop) {   // run demos only while on screen
    if (!("IntersectionObserver" in window)) return start();
    new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }, { threshold: 0.2 }).observe(el);
  }

  // ---------- Slide in while scrolling ----------
  var groups = [".gallery .center", "#features .center", ".bento .tile", "#faq h2", "#faq details", ".closing .band", ".works-t"];
  var items = [];
  groups.forEach(function (sel) {
    $$(sel).forEach(function (el, i) { el.classList.add("reveal"); el.style.setProperty("--r", String(i % 4)); items.push(el); });
  });
  if (!motion || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -40px 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  // ---------- Hero: rise in, then float and follow the mouse ----------
  var stage = document.querySelector(".hero .stage");
  if (stage && motion) {
    stage.classList.add("enter");
    setTimeout(function () { stage.classList.remove("enter"); stage.classList.add("floating"); }, 2000);
    if (window.matchMedia("(pointer: fine)").matches) {
      var hero = document.querySelector(".hero");
      var raf = 0, mx = 0, my = 0;
      hero.addEventListener("mousemove", function (e) {
        var r = stage.getBoundingClientRect();
        mx = (e.clientX - (r.left + r.width / 2)) / r.width;
        my = (e.clientY - (r.top + r.height / 2)) / r.height;
        if (!raf) raf = requestAnimationFrame(function () {
          raf = 0;
          stage.style.setProperty("--mx", mx.toFixed(3));
          stage.style.setProperty("--my", my.toFixed(3));
        });
      });
      hero.addEventListener("mouseleave", function () { stage.style.setProperty("--mx", "0"); stage.style.setProperty("--my", "0"); });
    }
  }

  // ---------- Band of calendars and services: endless scroll, and 0 → 34 ----------
  $$(".mq-track").forEach(function (tr) { tr.innerHTML += tr.innerHTML; });   // two copies for a seamless loop
  var count = document.querySelector(".works .count");
  if (count && motion) {
    var to = +count.getAttribute("data-to");
    count.textContent = "0";
    seen(count, function () {
      var t0 = performance.now();
      (function step(now) {
        var p = Math.min(1, (now - t0) / 1300);
        count.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }, { threshold: 0.6 });
  }

  // ---------- Video calls: the event counts down, Join appears, a tap opens the call; next service ----------
  var vc = document.getElementById("vc");
  if (vc) {
    var SVC = [["Google Meet", "#34c759"], ["Microsoft Teams", "#5b5fc7"], ["FaceTime", "#30d158"], ["Zoom", "#0b5cff"]];
    var sub = document.getElementById("vc-sub"), when = document.getElementById("vc-when");
    var join = document.getElementById("vc-join"), joinT = document.getElementById("vc-join-t");
    var chips = $$("#vc-svc span");
    var start = new Date(); start.setHours(10, 0, 0, 0);
    var end = new Date(start.getTime() + 30 * 6e4);
    var tm = function (d) { return fmt(d, { hour: "numeric", minute: "2-digit" }); };
    document.getElementById("vc-title").textContent = t("vc.title") || "Team meeting";
    var k = 0, timers = [];
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function show(i, mins, live) {
      var s = SVC[i];
      vc.style.setProperty("--svc", s[1]);
      sub.textContent = tm(start) + " – " + tm(end) + " · " + s[0];
      chips.forEach(function (c, j) { c.classList.toggle("on", j === i); });
      when.textContent = mins > 0 ? cap(rel(mins)) : (t("vc.now") || "Now");
      join.classList.toggle("live", !!live);
      joinT.textContent = t("vc.join") || "Join";
    }
    function cycle() {
      var i = k++ % SVC.length;
      join.classList.remove("tap", "opening");
      show(i, 13, false);
      later(function () { show(i, 12, false); }, 600);
      later(function () { show(i, 11, false); }, 1200);
      later(function () { show(i, 10, true); }, 1800);            // Join appears 10 minutes before
      later(function () { join.classList.add("tap"); }, 3300);
      later(function () { join.classList.add("opening"); joinT.textContent = t("vc.joining") || "Opening…"; }, 3600);
      later(cycle, 5200);
    }
    if (!motion) { show(0, 10, true); }
    else whenVisible(vc, function () { if (!timers.length) cycle(); },
                     function () { timers.forEach(clearTimeout); timers = []; });
  }

  // ---------- Month & List: dots per calendar, today in red, a tapped day fills the list ----------
  var grid = document.getElementById("ml-grid"), list = document.getElementById("ml-list");
  if (grid && list) {
    var COL = ["#e8352f", "#0a84ff", "#34c759", "#ff9500", "#af52de"];
    var NAMES = ["Meeting", "Lunch", "Gym", "Dentist", "Birthday", "Doctor", "Flight", "Holiday"];
    function mock(w) { return t("mock." + w) || w; }
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var first = new Date(today.getFullYear(), today.getMonth(), 1);
    var lead = (first.getDay() + 6) % 7;                      // weeks start on Monday
    var gstart = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    var seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    var days = [];
    for (var d = 0; d < 35; d++) {
      var day = new Date(gstart.getFullYear(), gstart.getMonth(), gstart.getDate() + d);
      var n = Math.floor(rnd() * 3.2), ev = [];
      for (var e = 0; e < n; e++) ev.push({ c: COL[Math.floor(rnd() * COL.length)], name: mock(NAMES[Math.floor(rnd() * NAMES.length)]), h: 8 + Math.floor(rnd() * 10) });
      ev.sort(function (a, b) { return a.h - b.h; });
      days.push({ date: day, ev: ev });
    }
    var head = "";
    for (var w = 0; w < 7; w++) head += "<em>" + fmt(new Date(2024, 0, 1 + w), { weekday: "narrow" }) + "</em>";
    grid.innerHTML = head + days.map(function (x, i) {
      var cls = (x.date.getMonth() !== today.getMonth() ? " out" : "") + (+x.date === +today ? " today" : "");
      var dots = x.ev.slice(0, 3).map(function (v) { return '<i style="background:' + v.c + '"></i>'; }).join("");
      return '<span class="d' + cls + '" data-i="' + i + '"><b>' + x.date.getDate() + "</b><s>" + dots + "</s></span>";
    }).join("");
    var cells = $$(".d", grid);
    var todayIdx = days.findIndex(function (x) { return +x.date === +today; });
    function pick(i) {
      cells.forEach(function (c, j) { c.classList.toggle("sel", j === i); });
      var rows = [];
      for (var j = i; j < days.length && rows.length < 3; j++) {
        days[j].ev.forEach(function (v) { if (rows.length < 3) rows.push({ d: days[j].date, v: v }); });
      }
      list.innerHTML = rows.map(function (r, n) {
        var label = +r.d === +today ? '<span class="t">' + (t("mock.Today") || "Today") + "</span>" : cap(fmt(r.d, { weekday: "short", day: "numeric" }).replace(/\./g, ""));
        var at = new Date(r.d.getFullYear(), r.d.getMonth(), r.d.getDate(), r.v.h);
        return '<div class="row" style="--n:' + n + '"><i style="background:' + r.v.c + '"></i><b>' + r.v.name + "</b><small>" + label + " · " + fmt(at, { hour: "numeric", minute: "2-digit" }) + "</small></div>";
      }).join("");
    }
    pick(todayIdx);
    cells.forEach(function (c) { c.addEventListener("click", function () { pick(+c.getAttribute("data-i")); }); });
    if (motion) {
      var order = [todayIdx, todayIdx + 2, todayIdx + 5, todayIdx + 8, todayIdx + 3].map(function (i) { return Math.max(0, Math.min(34, i)); });
      var step = 0, timer = null;
      whenVisible(list, function () {
        if (!timer) timer = setInterval(function () { pick(order[++step % order.length]); }, 1900);
      }, function () { clearInterval(timer); timer = null; });
    }
  }
})();
