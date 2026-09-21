/* logforce-feed.js — shared Vue + d3 chart kit and realtime feed (LogForce prototype, local).
   CODA: components ported 1:1 (virtual-DOM pattern, no d3 DOM hacks except axis/path draws).
   FEED MODES: demo (default, synthetic) | poll (GET JSON) | sse (EventSource) | ws (WebSocket).
   Production wiring only after explicit approval. */
(function(){
'use strict';
/* ---------- 1. chart theme css (injected once) ---------- */
var CHART_CSS = [
'.lf-chart svg{width:100%;height:auto;display:block;background:transparent;}',
'.lf-chart .axis path,.lf-chart .axis line{fill:none;stroke:#cbd5e1;shape-rendering:crispEdges;}',
'.lf-chart .axis text{fill:#94a3b8;font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}',
'.lf-chart .d3__series .line{fill:none;stroke-width:2;}',
'.lf-chart .d3__series .point{stroke-width:2;}'
].join('\n');
if (typeof document !== 'undefined' && !document.querySelector('style[data-lf-charts]')) {
  var lfStyle = document.createElement('style');
  lfStyle.setAttribute('data-lf-charts', '1');
  lfStyle.textContent = CHART_CSS;
  document.head.appendChild(lfStyle);
}
var NORM = '#4f46e5', RAW = '#f59e0b';
function uniq(arr){ var out=[]; for(var i=0;i<arr.length;i++){ if(out.indexOf(arr[i])<0) out.push(arr[i]); } return out; }
function allTimestamps(chartData){
  var out=[];
  (chartData||[]).forEach(function(s){ (s.values||[]).forEach(function(d){ if(d.timestamp!=null) out.push(d.timestamp); }); });
  return out;
}
function dataMax(chartData){
  var m=0;
  (chartData||[]).forEach(function(s){ (s.values||[]).forEach(function(d){ if(d.value!=null&&d.value>m) m=d.value; }); });
  return m;
}
/* ---------- 2. vue components (ported) ---------- */
function registerComponents(){
  if (typeof Vue === 'undefined' || typeof d3 === 'undefined') return false;
  if (Vue.options.components && Vue.options.components['d3__chart']) return true;
  Vue.component('d3__chart', {
    template: '<svg :viewBox="viewBox" preserveAspectRatio="xMidYMid meet"><g class="d3__stage" :style="stageStyle"><d3__axis v-for="axis in uniqAxes" :key="axis" :axis="axis" :layout="layout" :scale="scale"></d3__axis><d3__series v-for="seriesData in orderedSeries" :key="seriesData.id" :series-data="seriesData" :layout="layout" :scale="scale"></d3__series></g></svg>',
    props: ['axes', 'layout', 'chart-data'],
    computed: {
      viewBox: function(){
        var outerWidth = this.layout.width + this.layout.marginLeft + this.layout.marginRight,
            outerHeight = this.layout.height + this.layout.marginTop + this.layout.marginBottom;
        return '0 0 ' + outerWidth + ' ' + outerHeight;
      },
      stageStyle: function(){
        return { 'transform': 'translate(' + this.layout.marginLeft + 'px,' + this.layout.marginTop + 'px)' };
      },
      uniqAxes: function(){ return uniq(this.axes || []); },
      orderedSeries: function(){
        function smax(s){ var m=0; (s.values||[]).forEach(function(d){ if(d.value!=null&&d.value>m) m=d.value; }); return m; }
        return (this.chartData || []).slice().sort(function(a, b){ return smax(b) - smax(a); });
      }
    },
    data: function(){
      return { scale: {
        x: this.getScaleX(),
        y: this.getScaleY(),
        color: d3.scaleOrdinal().range([NORM, RAW]).domain(['Normalized', 'Raw'])
      } };
    },
    methods: {
      getScaleX: function(){
        var ts = allTimestamps(this.chartData);
        var dom = ts.length ? d3.extent(ts) : [Date.now() - 12 * 3600 * 1000, Date.now()];
        return d3.scaleTime().range([0, this.layout.width]).domain(dom);
      },
      getScaleY: function(){
        var m = dataMax(this.chartData);
        return d3.scaleLinear().range([this.layout.height, 0]).domain([0, m > 0 ? m : 1]);
      },
      updateScales: function(){ this.scale.x = this.getScaleX(); this.scale.y = this.getScaleY(); }
    },
    watch: {
      layout: { deep: true, handler: function(){ this.updateScales(); } },
      chartData: { deep: true, handler: function(){ this.updateScales(); } }
    }
  });
  Vue.component('d3__axis', {
    template: '<g :class="[classList]" ref="axis" :style="style"></g>',
    props: ['axis', 'layout', 'scale'],
    data: function(){ return { classList: ['axis'].concat(this.getAxisClasses()) }; },
    mounted: function(){ this.drawAxis(); },
    computed: {
      style: function(){ return { transform: this.getAxisTransform() }; }
    },
    methods: {
      getAxisClasses: function(){
        var axis = { top: 'x', bottom: 'x', left: 'y', right: 'y' };
        return [this.axis, axis[this.axis]];
      },
      drawAxis: function(){
        try{
          if(!this.$refs.axis) return;
          var $axis = d3.select(this.$refs.axis);
          var scale = this.scale;
          var axisGenerator = {
            top: d3.axisTop(scale.x).tickFormat(d3.timeFormat('%H:%M')),
            right: d3.axisRight(scale.y),
            bottom: d3.axisBottom(scale.x).tickFormat(d3.timeFormat('%H:%M')),
            left: d3.axisLeft(scale.y)
          };
          $axis.call(axisGenerator[this.axis]);
        }catch(e){}
      },
      getAxisTransform: function(){
        var axisOffset = {
          top: { x: 0, y: 0 },
          right: { x: this.layout.width, y: 0 },
          bottom: { x: 0, y: this.layout.height },
          left: { x: 0, y: 0 }
        };
        return 'translate(' + axisOffset[this.axis].x + 'px, ' + axisOffset[this.axis].y + 'px)';
      }
    },
    watch: { scale: { deep: true, handler: function(){ this.drawAxis(); } } }
  });
  Vue.component('d3__series', {
    template: '<g class="d3__series"><d3__area :layout="layout" :series-data="this.seriesData" :scale="this.scale"></d3__area><d3__line :layout="layout" :series-data="this.seriesData" :scale="this.scale"></d3__line><d3__scatter :layout="layout" :series-data="this.seriesData" :scale="this.scale"></d3__scatter></g>',
    props: ['layout', 'series-data', 'scale']
  });
  Vue.component('d3__line', {
    template: '<path class="line" ref="line" :style="style"></path>',
    props: ['layout', 'series-data', 'scale'],
    mounted: function(){ this.drawLine(); },
    methods: {
      drawLine: function(){
        try{
          if(!this.$refs.line) return;
          var scale = this.scale;
          var line = d3.line()
            .x(function(d){ return scale.x(d.timestamp); })
            .y(function(d){ return scale.y(d.value); });
          d3.select(this.$refs.line)
            .data([this.seriesData.values.filter(function(d){ return d.value !== null && d.value !== undefined; })])
            .attr('d', line);
        }catch(e){}
      }
    },
    computed: {
      style: function(){ return { fill: 'none', stroke: this.scale.color(this.seriesData.id), strokeWidth: this.seriesData.id === 'Normalized' ? 2.5 : 2 }; }
    },
    watch: { scale: { deep: true, handler: function(){ this.drawLine(); } } }
  });
  Vue.component('d3__scatter', {
    template: '<g class="points"><d3__point v-for="pointData in seriesData.values" v-if="pointData.value !== null && pointData.value !== undefined" :key="pointData.timestamp" :series-id="seriesData.id" :point-data="pointData" :layout="layout" :scale="scale"></d3__point></g>',
    props: ['layout', 'series-data', 'scale'],
    watch: { scale: { deep: true, handler: function(){} } }
  });
  Vue.component('d3__point', {
    template: '<circle class="point" ref="point" :style="style"></circle>',
    props: ['layout', 'point-data', 'scale', 'series-id'],
    mounted: function(){ this.drawPoint(); },
    methods: {
      drawPoint: function(){
        try{
          if(!this.$refs.point) return;
          var scale = this.scale;
          d3.select(this.$refs.point)
            .datum(this.pointData)
            .attr('cx', function(d){ return scale.x(d.timestamp); })
            .attr('cy', function(d){ return scale.y(d.value); })
            .attr('r', 5);
        }catch(e){}
      }
    },
    computed: {
      style: function(){ return { fill: '#fff', stroke: this.scale.color(this.seriesId), strokeWidth: 2 }; }
    },
    watch: { scale: { deep: true, handler: function(){ this.drawPoint(); } } }
  });
  Vue.component('d3__area', {
    template: '<path class="area" ref="area" :style="style"></path>',
    props: ['layout', 'series-data', 'scale'],
    mounted: function(){ this.drawArea(); },
    methods: {
      drawArea: function(){
        try{
          if(!this.$refs.area) return;
          var scale = this.scale;
          var area = d3.area()
            .x(function(d){ return scale.x(d.timestamp); })
            .y0(scale.y(0))
            .y1(function(d){ return scale.y(d.value); });
          d3.select(this.$refs.area)
            .datum(this.seriesData.values.filter(function(d){ return d.value !== null && d.value !== undefined; }))
            .attr('d', area);
        }catch(e){}
      }
    },
    computed: {
      style: function(){ return { fill: this.scale.color(this.seriesData.id), fillOpacity: 0.10 }; }
    },
    watch: { scale: { deep: true, handler: function(){ this.drawArea(); } } }
  });
  return true;
}
/* ---------- 3. realtime feed (demo | poll | sse | ws) ---------- */
var FEED_DEFAULTS = { mode: 'demo', wsUrl: null, pollUrl: '/api/stats', pollMs: 5000, sseUrl: null, demoMs: 2000, demoBaseN: 8, demoBaseR: 20 };
function createFeed(opts){
  opts = opts || {};
  var cfg = {};
  for (var k in FEED_DEFAULTS) cfg[k] = (opts[k] !== undefined ? opts[k] : FEED_DEFAULTS[k]);
  var live = true, timer = null, ws = null, es = null, retryMs = 3000, retryTimer = null;
  var vn = cfg.demoBaseN, vr = cfg.demoBaseR;
  var api = { config: cfg, onPoint: null, onBuckets: null, onStatus: null };
  function status(s){ if (api.onStatus) { try { api.onStatus(s); } catch (e) {} } }
  function emitPoint(t, n, r){ if (api.onPoint) { try { api.onPoint({ t: t, normalized: n, raw: r }); } catch (e) {} } }
  function emitBuckets(bn, br){ if (api.onBuckets) { try { api.onBuckets(bn || [], br || []); } catch (e) {} } }
  function stopAll(){
    if (timer) { clearInterval(timer); timer = null; }
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    if (es) { try { es.close(); } catch (e) {} es = null; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  }
  function demoTick(){
    if (!live || cfg.mode !== 'demo') return;
    vn = Math.max(0, Math.round(vn + (Math.random() * 4 - 1.6)));
    vr = Math.max(0, Math.round(vr + (Math.random() * 10 - 4)));
    emitPoint(Date.now(), vn, vr);
  }
  function ingestMessage(m){
    if (!m) return;
    if (m.buckets_normalized || m.buckets_raw) { emitBuckets(m.buckets_normalized || [], m.buckets_raw || []); return; }
    if (m.type === 'buckets') { emitBuckets(m.normalized || [], m.raw || []); return; }
    if (m.type === 'point' || (m.normalized !== undefined && m.raw !== undefined)) { emitPoint(m.t || Date.now(), m.normalized, m.raw); return; }
  }
  function scheduleRetry(){
    if (!live || cfg.mode !== 'ws') return;
    retryTimer = setTimeout(function(){ if (live && cfg.mode === 'ws') wsConnect(); }, retryMs);
    retryMs = Math.min(retryMs * 2, 30000);
  }
  function wsConnect(){
    status('reconnecting');
    try { ws = new WebSocket(cfg.wsUrl); } catch (e) { scheduleRetry(); return; }
    ws.onopen = function(){ retryMs = 3000; status('live'); };
    ws.onmessage = function(ev){ try { ingestMessage(JSON.parse(ev.data)); } catch (e) {} };
    ws.onclose = function(){ ws = null; if (!live || cfg.mode !== 'ws') return; status('reconnecting'); scheduleRetry(); };
    ws.onerror = function(){ try { ws.close(); } catch (e) {} };
  }
  function start(){
    stopAll();
    if (!live) { status('paused'); return; }
    if (cfg.mode === 'demo') { status('demo'); timer = setInterval(demoTick, cfg.demoMs); }
    else if (cfg.mode === 'poll' && cfg.pollUrl) {
      status('live');
      var pull = function(){ if (!live) return; fetch(cfg.pollUrl, { cache: 'no-store' }).then(function(r){ return r.json(); }).then(ingestMessage).catch(function(){}); };
      timer = setInterval(pull, cfg.pollMs); pull();
    }
    else if (cfg.mode === 'sse' && cfg.sseUrl && typeof EventSource !== 'undefined') {
      status('live');
      es = new EventSource(cfg.sseUrl);
      es.onmessage = function(ev){ try { ingestMessage(JSON.parse(ev.data)); } catch (e) {} };
      es.onerror = function(){ try { es.close(); } catch (e) {} es = null; status('reconnecting'); };
    }
    else if (cfg.mode === 'ws' && cfg.wsUrl && typeof WebSocket !== 'undefined') { wsConnect(); }
    else { status('demo'); timer = setInterval(demoTick, cfg.demoMs); }
  }
  api.ingestBuckets = function(bn, br){ emitBuckets(bn || [], br || []); };
  api.ingestPoint = function(t, n, r){ emitPoint(t || Date.now(), n, r); };
  api.setLive = function(v){ live = !!v; if (!live) { stopAll(); status('paused'); } else { start(); } };
  api.setMode = function(mode, url){
    cfg.mode = mode;
    if (mode === 'ws' && url) cfg.wsUrl = url;
    if (mode === 'poll' && url) cfg.pollUrl = url;
    if (mode === 'sse' && url) cfg.sseUrl = url;
    if (live) start();
  };
  api.start = start;
  api.stop = stopAll;
  start();
  return api;
}
/* ---------- 4. mount helper ---------- */
function bucketsToSeries(arr, bucketMs, endTime){
  arr = arr || [];
  var e = (typeof endTime === 'function') ? endTime() : Date.now();
  return arr.map(function(v, i){ return { timestamp: e - (arr.length - 1 - i) * bucketMs, value: (v == null ? null : v) }; });
}
function mountLogforceChart(mountSelector, opts){
  opts = opts || {};
  var mountEl = typeof document !== 'undefined' ? document.querySelector(mountSelector) : null;
  if (!mountEl) return null;
  if (typeof Vue === 'undefined' || typeof d3 === 'undefined' || !registerComponents()) {
    mountEl.innerHTML = '<div style="padding:2rem;color:#94a3b8;font-size:12px;">Charts unavailable offline (Vue/d3 failed to load).</div>';
    if (typeof console !== 'undefined') console.warn('[logforce] chart libs missing for ' + mountSelector);
    return null;
  }
  var bucketMs = opts.bucketMs || 7200000;
  var windowSize = opts.windowSize || 48;
  function endTime(){ return (typeof opts.endTime === 'function') ? opts.endTime() : Date.now(); }
  var feed = createFeed(opts.feed || {});
  feed.onBuckets = function(bn, br){
    vm.chartData[0].values = bucketsToSeries(bn, bucketMs, endTime);
    vm.chartData[1].values = bucketsToSeries(br, bucketMs, endTime);
    if (opts.onTotals) { try { opts.onTotals(bn, br); } catch (e) {} }
  };
  feed.onPoint = function(pt){
    var pairs = [['Normalized', pt.normalized], ['Raw', pt.raw]];
    pairs.forEach(function(pair, si){
      var vals = vm.chartData[si].values;
      vals.push({ timestamp: pt.t, value: pair[1] });
      while (vals.length > windowSize) vals.shift();
    });
  };
  var vm = new Vue({
    el: mountSelector,
    data: {
      layout: { width: 800, height: 250, marginTop: 20, marginRight: 16, marginBottom: 8, marginLeft: 44 },
      chartData: [{ id: 'Normalized', values: [] }, { id: 'Raw', values: [] }],
      axes: ['left']
    }
  });
  return { vm: vm, feed: feed };
}
window.LogforceFeed = { defaults: FEED_DEFAULTS, create: createFeed, uniq: uniq };
window.mountLogforceChart = mountLogforceChart;
window.bucketsToSeries = bucketsToSeries;
})();
