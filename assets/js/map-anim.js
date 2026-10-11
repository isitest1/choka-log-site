/* 釣果ログ：航跡の動き（地図の節「あの日と、この日を重ねる。」・航跡の節）
   - この節に近づいたときに Leaflet と素材を読み込む（ページを開いた時点では読まない）
   - 画面に入ったら再生し、外れたら止める。終わったら 3 秒止めて、最初から繰り返す
   - 動きを減らす設定のときは、動かさずに最後の絵（全体）だけを出す
   - 地図は指で動かせない（ページを下に送る邪魔をしないため） */
(function () {
  'use strict';

  var LEAFLET_JS  = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  var LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  var TILE_URL = '/assets/map-anim/{z}/{x}/{y}.webp';
  var LAND_URL = '/assets/map-anim/land.geojson';
  // タイルを並べた範囲（assets/map-anim/meta.json の tileCoverageBounds）
  var TILE_BOUNDS = [[35.029996, 139.394531], [35.317366, 139.746094]];
  // どの拡大率でもタイルがそろっている範囲（meta.json の bounds）。画面はこの中に収める
  var VIEW_BOUNDS = [[35.056422, 139.532024], [35.179203, 139.691098]];
  var ATTRIBUTION = '海底地形：J-EGG500（加工）／陸の形：国土数値情報（行政区域）（加工）';
  var FISH_RED = '#e0312b';
  var PLACE_NAMES = [
    { name: '三浦市', lat: 35.1600, lon: 139.6400 },
    { name: '城ヶ島', lat: 35.1325, lon: 139.6195 }
  ];

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 読み込み（1 回だけ） ── */
  var leafletPromise = null;
  function loadLeaflet() {
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      if (window.L) { resolve(window.L); return; }
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS; css.crossOrigin = '';
      document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = LEAFLET_JS; s.async = true; s.crossOrigin = '';
      s.onload = function () { resolve(window.L); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return leafletPromise;
  }
  var landPromise = null;
  function loadLand() {
    if (!landPromise) landPromise = fetch(LAND_URL).then(function (r) { return r.json(); });
    return landPromise;
  }
  function loadJSON(url) { return fetch(url).then(function (r) { return r.json(); }); }

  /* ── 共通：地図の土台 ── */
  function makeMap(L, el, land) {
    var map = L.map(el, {
      zoomControl: false, attributionControl: true,
      dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, tap: false,
      zoomSnap: 0, minZoom: 11, maxZoom: 15.5,
      maxBounds: VIEW_BOUNDS, maxBoundsViscosity: 1,
      fadeAnimation: true, inertia: false
    });
    map.attributionControl.setPrefix(false);
    // 画面がタイルのそろった範囲より広くならない拡大率を、いちばん引いた所にする
    var fitMin = function () { map.setMinZoom(Math.max(11, map.getBoundsZoom(VIEW_BOUNDS, true))); };
    map.setView(L.latLngBounds(VIEW_BOUNDS).getCenter(), 14, { animate: false });
    fitMin();
    map.on('resize', fitMin);
    map.attributionControl.addAttribution(ATTRIBUTION);
    map.createPane('land').style.zIndex = 250;
    map.createPane('places').style.zIndex = 260;
    map.createPane('track').style.zIndex = 410;
    map.createPane('fish').style.zIndex = 620;
    L.tileLayer(TILE_URL, {
      tileSize: 256, minNativeZoom: 11, maxNativeZoom: 15, minZoom: 11, maxZoom: 16,
      bounds: TILE_BOUNDS, detectRetina: false, keepBuffer: 4
    }).addTo(map);
    L.geoJSON(land, {
      pane: 'land', interactive: false, renderer: L.canvas({ pane: 'land', padding: 0.5 }),
      style: { stroke: false, fillColor: '#efe8da', fillOpacity: 1 }
    }).addTo(map);
    PLACE_NAMES.forEach(function (p) {
      L.marker([p.lat, p.lon], {
        pane: 'places', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'map-anim__place', html: '<span>' + p.name + '</span>', iconSize: null })
      }).addTo(map);
    });
    return map;
  }

  function trackRenderer(L) { return L.canvas({ pane: 'track', padding: 0.6 }); }

  // アプリと同じ描き分け：釣り中＝実線、移動中＝細かい点線。下に白い縁
  function lineStyles(state, color) {
    if (state === 1) {
      return [
        { color: '#ffffff', weight: 5.5, opacity: 0.55, lineCap: 'round', lineJoin: 'round' },
        { color: color, weight: 3, opacity: 1, lineCap: 'round', lineJoin: 'round' }
      ];
    }
    return [
      { color: '#ffffff', weight: 3.6, opacity: 0.55, lineCap: 'round', dashArray: '0.1 4' },
      { color: color, weight: 1.8, opacity: 1, lineCap: 'round', dashArray: '0.1 4' }
    ];
  }

  // 航跡を少しずつ描き足すための部品
  function TrackDrawer(L, map, color, renderer) {
    this.L = L; this.map = map; this.color = color; this.renderer = renderer;
    this.layers = []; this.cur = null; this.state = null; this.last = null;
  }
  TrackDrawer.prototype.add = function (p) {
    var ll = [p[1], p[2]];
    if (this.state !== p[3]) {
      var self = this;
      var styles = lineStyles(p[3], this.color);
      var start = this.last ? [this.last, ll] : [ll];
      this.cur = styles.map(function (st) {
        st.pane = 'track'; st.renderer = self.renderer; st.interactive = false;
        var pl = self.L.polyline(start.slice(), st).addTo(self.map);
        self.layers.push(pl);
        return pl;
      });
      this.state = p[3];
    } else {
      this.cur.forEach(function (pl) { pl.addLatLng(ll); });
    }
    this.last = ll;
  };
  TrackDrawer.prototype.clear = function () {
    var map = this.map;
    this.layers.forEach(function (l) { map.removeLayer(l); });
    this.layers = []; this.cur = null; this.state = null; this.last = null;
  };

  function addFish(L, map, c, list) {
    var dot = L.circleMarker([c.lat, c.lon], {
      pane: 'fish', radius: 5.5, color: '#ffffff', weight: 2, fillColor: FISH_RED, fillOpacity: 1, interactive: false
    }).addTo(map);
    var label = L.marker([c.lat, c.lon], {
      pane: 'fish', interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'map-anim__fish', html: '<span>' + c.species + '</span>', iconSize: null })
    }).addTo(map);
    list.push(dot, label);
  }

  function bearing(a, b) {
    var y = (b[2] - a[2]) * Math.cos(a[1] * Math.PI / 180);
    var x = b[1] - a[1];
    return Math.atan2(y, x) * 180 / Math.PI; // 北が 0、時計回り
  }

  // 素材の時刻は日本時間。端末の時間帯によらず日本時間で出す
  function jstClock(iso, plusSec) {
    var t = Date.parse(iso) + plusSec * 1000 + 9 * 3600 * 1000;
    var d = new Date(t);
    var h = d.getUTCHours(), m = d.getUTCMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  // 実際の時間（秒）→ 素材の時刻（出港からの秒）を、折れ線で対応させる
  function warp(knots, real) {
    if (real <= knots[0][0]) return knots[0][1];
    for (var i = 1; i < knots.length; i++) {
      if (real <= knots[i][0]) {
        var a = knots[i - 1], b = knots[i];
        return a[1] + (b[1] - a[1]) * (real - a[0]) / (b[0] - a[0]);
      }
    }
    return knots[knots.length - 1][1];
  }

  // 画面に入ったら再生、外れたら止める
  function Player(el, step, total, hold, onLoop) {
    this.el = el; this.step = step; this.total = total; this.hold = hold; this.onLoop = onLoop;
    this.t = 0; this.running = false; this.prev = null; this.raf = null;
    var self = this;
    this.frame = function (now) {
      if (!self.running) return;
      if (self.prev != null) self.t += Math.min(0.1, (now - self.prev) / 1000);
      self.prev = now;
      if (self.t >= self.total + self.hold) { self.t = 0; self.onLoop(); }
      self.step(Math.min(self.t, self.total));
      self.raf = requestAnimationFrame(self.frame);
    };
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.isIntersecting ? self.play() : self.pause(); });
    }, { threshold: 0.35 }).observe(el);
  }
  Player.prototype.play = function () {
    if (this.running) return;
    this.running = true; this.prev = null;
    this.raf = requestAnimationFrame(this.frame);
  };
  Player.prototype.pause = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  };

  function whenNear(el, fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); }
    }, { rootMargin: '600px 0px' });
    io.observe(el);
  }

  function boundsOf(L, pts, catches) {
    var b = L.latLngBounds(pts.map(function (p) { return [p[1], p[2]]; }));
    (catches || []).forEach(function (c) { b.extend([c.lat, c.lon]); });
    return b;
  }

  /* ── 航跡の節：2026/10/3 の 1 日 ── */
  function initDay(root) {
    var mapEl = root.querySelector('.map-anim__map');
    var clockEl = root.querySelector('[data-clock]');
    var stateEl = root.querySelector('[data-state]');
    var hudEl = root.querySelector('.map-anim__hud');
    Promise.all([loadLeaflet(), loadLand(), loadJSON(root.getAttribute('data-src'))]).then(function (r) {
      var L = r[0], land = r[1], day = r[2];
      var pts = day.points, color = day.color || '#5B3FB8';
      var map = makeMap(L, mapEl, land);
      var renderer = trackRenderer(L);
      var drawer = new TrackDrawer(L, map, color, renderer);
      var fish = [];
      var allBounds = boundsOf(L, pts, day.catches).pad(0.12);
      var endSec = (Date.parse(day.returnAt) - Date.parse(day.departureAt)) / 1000;

      // 移動中・釣り中の区間（短い移動は、釣り場の中の流し直しとして扱う）
      var segs = [];
      pts.forEach(function (p, i) {
        if (!segs.length || segs[segs.length - 1].s !== p[3]) segs.push({ s: p[3], a: i, b: i });
        else segs[segs.length - 1].b = i;
      });
      // 長い移動（4 分を超える）で場面を区切る
      var scenes = [];
      segs.forEach(function (sg) {
        var dur = pts[sg.b][0] - pts[sg.a][0];
        var run = sg.s === 0 && dur > 240;
        var last = scenes[scenes.length - 1];
        if (!last || last.run !== run || run) scenes.push({ run: run, a: sg.a, b: sg.b });
        else last.b = sg.b;
      });
      scenes.forEach(function (sc) {
        sc.t0 = pts[sc.a][0]; sc.t1 = pts[sc.b][0];
        sc.bounds = boundsOf(L, pts.slice(sc.a, sc.b + 1));
      });

      // 実際の時間の進み方：移動中は速く、釣りの場面と魚が釣れる瞬間はゆっくり
      var knots = [[0, 0], [1.0, 90]];
      var real = 1.0;
      scenes.forEach(function (sc, i) {
        if (i === 0) { real += 1.6; knots.push([real, sc.t1]); return; }
        if (sc.run) { real += i === scenes.length - 1 ? 1.6 : 1.0; knots.push([real, sc.t1]); return; }
        var inScene = day.catches.filter(function (c) { return c.t > sc.t0 && c.t < sc.t1; });
        var span = sc.t1 - sc.t0;
        var base = 1.3 + span / 6500; // 釣りの場面の長さに応じて
        var cur = sc.t0;
        inScene.forEach(function (c) {
          var before = c.t - 240;
          if (before > cur) { real += base * (before - cur) / span; knots.push([real, before]); }
          real += 0.6;  knots.push([real, c.t]);
          real += 0.7;  knots.push([real, c.t]);   // 釣れた瞬間で少し止める
          real += 0.4;  knots.push([real, c.t + 180]);
          cur = c.t + 180;
        });
        real += base * Math.max(0, sc.t1 - cur) / span; knots.push([real, sc.t1]);
      });
      if (endSec > knots[knots.length - 1][1]) { real += 0.3; knots.push([real, endSec]); }
      var playEnd = real;
      var total = playEnd + 1.6; // 最後に全体へ引く時間

      // カメラの動き：場面が変わるときに flyTo で寄る・引く
      var camera = scenes.map(function (sc, i) {
        var startReal = knots.filter(function (k) { return k[1] <= sc.t0; }).pop()[0];
        if (i === 0) return { at: 1.0, center: null, zoom: 13, dur: 1.6, follow: true, sc: sc };
        if (sc.run) {
          var z = Math.min(13.6, map.getBoundsZoom(sc.bounds.pad(0.25)));
          return { at: startReal, center: sc.bounds.getCenter(), zoom: z, dur: 0.9, sc: sc, follow: i === scenes.length - 1 };
        }
        var zf = Math.max(14, Math.min(15, map.getBoundsZoom(sc.bounds.pad(0.3))));
        return { at: startReal, center: sc.bounds.getCenter(), zoom: zf, dur: 1.0, sc: sc };
      });

      var boat = L.marker([pts[0][1], pts[0][2]], {
        pane: 'fish', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'map-anim__boat', iconSize: [22, 22], iconAnchor: [11, 11],
          html: '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><path d="M11 2 L18 19 L11 15 L4 19 Z" fill="' + color + '" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>' })
      }).addTo(map);
      var boatSvg = function () { return boat.getElement() && boat.getElement().querySelector('svg'); };

      var drawnIdx = 0, fishShown = 0, camIdx = 0, follow = true, finished = false, lastHead = 0;

      function reset() {
        drawer.clear();
        fish.forEach(function (l) { map.removeLayer(l); }); fish = [];
        drawnIdx = 0; fishShown = 0; camIdx = 0; follow = true; finished = false;
        map.stop();
        map.setView([pts[0][1], pts[0][2]], 15, { animate: false });
        boat.setLatLng([pts[0][1], pts[0][2]]);
        if (hudEl) hudEl.classList.remove('is-done');
      }

      function drawUntil(sim) {
        while (drawnIdx < pts.length && pts[drawnIdx][0] <= sim) { drawer.add(pts[drawnIdx]); drawnIdx++; }
        while (fishShown < day.catches.length && day.catches[fishShown].t <= sim) { addFish(L, map, day.catches[fishShown], fish); fishShown++; }
      }

      function setHud(sim, state) {
        clockEl.textContent = jstClock(day.departureAt, sim);
        stateEl.textContent = state;
      }

      function step(t) {
        if (t <= playEnd) {
          var sim = warp(knots, t);
          drawUntil(sim);
          var i = Math.max(0, drawnIdx - 1);
          var p = pts[i];
          boat.setLatLng([p[1], p[2]]);
          var j = Math.max(0, i - 3);
          if (i > j) lastHead = bearing(pts[j], p);
          var svg = boatSvg(); if (svg) svg.style.transform = 'rotate(' + lastHead + 'deg)';
          var returned = sim >= pts[pts.length - 1][0];
          setHud(sim, returned ? '帰港' : (p[3] === 1 ? '釣り中' : '移動中'));
          // カメラ
          while (camIdx < camera.length && t >= camera[camIdx].at) {
            var c = camera[camIdx];
            follow = !!c.follow;
            var center = c.center || boat.getLatLng();
            if (c.follow && !c.center) center = L.latLng(pts[Math.min(pts.length - 1, drawnIdx + 40)][1], pts[Math.min(pts.length - 1, drawnIdx + 40)][2]);
            map.flyTo(center, Math.max(map.getMinZoom(), c.zoom), { duration: c.dur, easeLinearity: 0.3 });
            camIdx++;
          }
          if (follow && !map._flyToFrame) {
            var pt = map.latLngToContainerPoint(boat.getLatLng());
            var size = map.getSize();
            if (pt.x < size.x * 0.25 || pt.x > size.x * 0.75 || pt.y < size.y * 0.25 || pt.y > size.y * 0.75) {
              map.panTo(boat.getLatLng(), { animate: true, duration: 0.6, easeLinearity: 0.5 });
            }
          }
        } else if (!finished) {
          finished = true;
          drawUntil(Infinity);
          setHud(endSec, '帰港');
          if (hudEl) hudEl.classList.add('is-done');
          map.flyToBounds(allBounds, { duration: 1.4, easeLinearity: 0.3 });
        }
      }

      if (reduceMotion) {
        drawUntil(Infinity);
        boat.setLatLng([pts[pts.length - 1][1], pts[pts.length - 1][2]]);
        map.fitBounds(allBounds, { animate: false });
        setHud(endSec, '帰港');
        clockEl.textContent = jstClock(day.departureAt, 0) + ' → ' + jstClock(day.departureAt, endSec);
        if (hudEl) hudEl.classList.add('is-done');
        root.classList.add('is-ready');
        return;
      }
      reset();
      root.classList.add('is-ready');
      new Player(root, step, total, 3, reset);
    }).catch(function () { root.classList.add('is-failed'); });
  }

  /* ── 地図の節：過去の 2 回を重ねる ── */
  function initOverlay(root) {
    var mapEl = root.querySelector('.map-anim__map');
    var clockEl = root.querySelector('[data-clock]');
    var legendEl = root.querySelector('[data-legend]');
    Promise.all([loadLeaflet(), loadLand(), loadJSON(root.getAttribute('data-src'))]).then(function (r) {
      var L = r[0], land = r[1], trips = r[2].trips;
      var map = makeMap(L, mapEl, land);
      var renderer = trackRenderer(L);
      var all = L.latLngBounds([]);
      trips.forEach(function (tr) { all.extend(boundsOf(L, tr.points, tr.catches)); });
      // カメラは動かさない
      // 魚の名前（右に出る）と、上の時計・下の凡例の分だけ余白を取る
      map.fitBounds(all, { animate: false, paddingTopLeft: [24, 56], paddingBottomRight: [76, 64] });
      var PER = 6.0, GAP = 0.6;
      var drawers = trips.map(function (tr) { return new TrackDrawer(L, map, tr.color, renderer); });
      var fish = [], idx = trips.map(function () { return 0; }), shown = trips.map(function () { return 0; });
      var chips = trips.map(function (tr) {
        var y = Number(tr.date.slice(0, 4)), m = Number(tr.date.slice(5, 7)), dd = Number(tr.date.slice(8, 10));
        var d = new Date(Date.UTC(y, m - 1, dd));
        var li = document.createElement('li');
        li.innerHTML = '<span class="map-anim__swatch" style="background:' + tr.color + '"></span>' + m + '/' + dd + '（' + '日月火水木金土'[d.getUTCDay()] + '）';
        legendEl.appendChild(li);
        return li;
      });
      var total = trips.length * (PER + GAP);

      function reset() {
        drawers.forEach(function (d) { d.clear(); });
        fish.forEach(function (l) { map.removeLayer(l); }); fish = [];
        idx = idx.map(function () { return 0; }); shown = shown.map(function () { return 0; });
        chips.forEach(function (c) { c.classList.remove('is-on'); });
      }
      function drawTrip(k, sim) {
        var tr = trips[k];
        while (idx[k] < tr.points.length && tr.points[idx[k]][0] <= sim) { drawers[k].add(tr.points[idx[k]]); idx[k]++; }
        while (shown[k] < tr.catches.length && tr.catches[shown[k]].t <= sim) { addFish(L, map, tr.catches[shown[k]], fish); shown[k]++; }
      }
      function step(t) {
        for (var k = 0; k < trips.length; k++) {
          var t0 = k * (PER + GAP);
          if (t < t0) break;
          var tr = trips[k];
          var dur = tr.points[tr.points.length - 1][0];
          var f = Math.min(1, (t - t0) / PER);
          var sim = f * dur;
          drawTrip(k, sim);
          chips[k].classList.add('is-on');
          if (t - t0 <= PER + GAP) clockEl.textContent = chips[k].textContent + ' ' + jstClock(tr.departureAt, sim);
        }
      }
      if (reduceMotion) {
        trips.forEach(function (tr, k) { drawTrip(k, Infinity); chips[k].classList.add('is-on'); });
        clockEl.textContent = '過去の釣行 2 回';
        root.classList.add('is-ready');
        return;
      }
      root.classList.add('is-ready');
      new Player(root, step, total, 3, reset);
    }).catch(function () { root.classList.add('is-failed'); });
  }

  // トップの左の画面の動画：画面に見えている間だけ再生する（横に送る部品では、その 1 枚が見えている間だけ）。
  // 動きを減らす設定の人には、ポスターだけを出す（動画は読み込まない）
  document.querySelectorAll('video.js-loop-video').forEach(function (v) {
    v.muted = true;
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          if (v.preload === 'none') { v.preload = 'auto'; }
          var p = v.play(); if (p && p.catch) p.catch(function () {});
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.5 }).observe(v);
  });

  // 地図の埋め込み：この節に近づいたときに iframe を入れる（埋め込みの側も、押すまで地図のデータを読まない）
  document.querySelectorAll('.map-embed iframe[data-src]').forEach(function (f) {
    var load = function () { f.src = f.getAttribute('data-src'); f.removeAttribute('data-src'); };
    if (!('IntersectionObserver' in window)) { load(); return; }
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); }
    }, { rootMargin: '300px 0px' });
    io.observe(f);
  });

  document.querySelectorAll('[data-map-anim]').forEach(function (root) {
    var kind = root.getAttribute('data-map-anim');
    whenNear(root, function () { kind === 'day' ? initDay(root) : initOverlay(root); });
  });

  /* ── 1.x と 2.0 の地図の見比べ ── */
  document.querySelectorAll('.compare').forEach(function (cmp) {
    var handle = cmp.querySelector('.compare__handle');
    var value = 50;
    function set(v) {
      value = Math.max(0, Math.min(100, v));
      cmp.style.setProperty('--pos', value + '%');
      handle.setAttribute('aria-valuenow', String(Math.round(value)));
      handle.setAttribute('aria-valuetext', '左が 1.x、右が 2.0。境目は左から ' + Math.round(value) + '%');
    }
    function fromEvent(e) {
      var r = cmp.getBoundingClientRect();
      set((e.clientX - r.left) / r.width * 100);
    }
    var dragging = false;
    cmp.addEventListener('pointerdown', function (e) {
      dragging = true; fromEvent(e);
      if (cmp.setPointerCapture) cmp.setPointerCapture(e.pointerId);
      handle.focus({ preventScroll: true });
    });
    cmp.addEventListener('pointermove', function (e) { if (dragging) fromEvent(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) {
      cmp.addEventListener(n, function () { dragging = false; });
    });
    handle.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(value - step); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(value + step); e.preventDefault(); }
      else if (e.key === 'Home') { set(0); e.preventDefault(); }
      else if (e.key === 'End') { set(100); e.preventDefault(); }
    });
    set(50);
  });
}());
