'use strict';
// wu-wind-compass-card.js – wedge/segment design (transparent white areas) + i18n (en, cs)
// Place this file in: <config>/www/wu-wind-compass-card.js
// Add as Lovelace resource: /local/wu-wind-compass-card.js?v=1.3.0, type: module

var DEG2RAD = Math.PI / 180;

// ===== i18n =====
var I18N = {
  en: {
    card8: ['N','NE','E','SE','S','SW','W','NW'],
    card16: ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  },
  cs: {
    // 8-směrná růžice
    card8: ['S','SV','V','JV','J','JZ','Z','SZ'],
    // 16-směrná růžice (české zkratky)
    card16: ['S','SSV','SV','VSV','V','VJV','JV','JJV','J','JJZ','JZ','ZJZ','Z','ZSZ','SZ','SSZ']
  }
};

class WuWindCompassCard extends HTMLElement {
  constructor() {
    super();
    this._config = null;
    this._hass = null;
    this._lastDir = null;
    this._lang = 'en';
    this.attachShadow({ mode: 'open' });
  }

  static get version() { return '1.4.0'; }

  // Lovelace GUI editor hooks
  static async getConfigElement() {
    return document.createElement('wu-wind-compass-card-editor');
  }
  static getStubConfig(hass, entities) {
    const pick = (list, pred) => (list || []).find((e) => pred(e)) || '';
    const dir = pick(entities, (e) => e.endsWith('_bearing') || e.includes('wind') && e.includes('dir')) || '';
    const spd = pick(entities, (e) => e.includes('wind') && (e.includes('speed') || e.endsWith('_spd'))) || '';
    return { entity_direction: dir, entity_speed: spd || undefined, size: 220, wedge_width_deg: 22.5 };
  }

  setConfig(config) {
    if (!config || !config.entity_direction) {
      throw new Error('entity_direction is required');
    }

    this._config = {
      name: config.name || 'Wind',
      entity_direction: config.entity_direction,
      entity_speed: config.entity_speed || null,
      speed_unit: config.speed_unit || null,
      show_speed: config.show_speed !== false,
      size: Number(config.size || 220),
      language: config.language || null, // 'en', 'cs' (auto if null)
      // visual tuning
      outer_stroke: config.outer_stroke || 'var(--ha-card-border-color, rgba(127,127,127,0.35))',
      segment_color: config.segment_color || 'rgba(3, 169, 244, 0.18)', // light blue, semi-transparent
      label_color: config.label_color || 'var(--secondary-text-color)',
      center_text_color: config.center_text_color || 'var(--primary-text-color)',
      wedge_color: config.wedge_color || 'var(--accent-color)',
      wedge_width_deg: Number(config.wedge_width_deg || 22.5),
      smooth_deg: Number(config.smooth_deg || 0),
      // fonts (slightly larger by default)
      font_labels_px: Number(config.font_labels_px || 14),
      font_center_px: Number(config.font_center_px || 28),
      font_speed_px: Number(config.font_speed_px || 13)
    };

    this._build();
  }

  getCardSize() { return 3; }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    // Language auto-detect (HA locale → config override → browser)
    var lang = this._resolveLang();
    if (lang !== this._lang) {
      this._lang = lang;
      this._renderLabels();
    }

    var dirState = hass.states[this._config.entity_direction];
    var speedState = this._config.entity_speed ? hass.states[this._config.entity_speed] : null;

    var dir = this._parseNumber(dirState && dirState.state);
    var spd = speedState ? this._parseNumber(speedState.state) : null;

    var validDir = dir != null && isFinite(dir);
    var norm = validDir ? ((dir % 360) + 360) % 360 : null;

    var finalDir = norm;
    if (this._config.smooth_deg && this._lastDir != null && norm != null) {
      var delta = this._angleDelta(this._lastDir, norm);
      if (Math.abs(delta) < this._config.smooth_deg) finalDir = this._lastDir;
    }
    if (finalDir != null) this._lastDir = finalDir;

    this._update(finalDir, spd);
  }

  // ===== helpers =====
  _resolveLang() {
    var cfg = (this._config && this._config.language) ? String(this._config.language).toLowerCase() : null;
    var hassLang = this._hass && (this._hass.language || (this._hass.locale && this._hass.locale.language));
    var navLang = (navigator && navigator.language) ? navigator.language : 'en';
    var cand = (cfg || hassLang || navLang || 'en').slice(0,2).toLowerCase();
    return I18N[cand] ? cand : 'en';
  }

  _parseNumber(v) { if (v == null) return null; var n = Number(v); return isNaN(n) ? null : n; }
  _angleDelta(a, b) { return ((b - a + 540) % 360) - 180; }
  _cardinal16(deg) {
    if (deg == null || !isFinite(deg)) return '—';
    var idx = Math.floor(((deg + 11.25) % 360) / 22.5);
    var dict = I18N[this._lang] || I18N.en;
    return dict.card16[idx];
  }
  _formatSpeed(spd) {
    if (spd == null || !isFinite(spd)) return '';
    var unit = this._config.speed_unit;
    if (!unit && this._hass && this._config.entity_speed) {
      var st = this._hass.states[this._config.entity_speed];
      if (st && st.attributes && st.attributes.unit_of_measurement) unit = st.attributes.unit_of_measurement;
    }
    return (Math.round(spd * 10) / 10) + (unit ? (' ' + unit) : '');
  }

  _polar(cx, cy, r, deg) {
    var rad = deg * DEG2RAD;
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
  }

  _arcPath(cx, cy, r, startDeg, endDeg) {
    var s = this._polar(cx, cy, r, startDeg);
    var e = this._polar(cx, cy, r, endDeg);
    var sweep = 1;
    var large = ((endDeg - startDeg + 360) % 360) > 180 ? 1 : 0;
    return 'M ' + s[0] + ' ' + s[1] + ' A ' + r + ' ' + r + ' 0 ' + large + ' ' + sweep + ' ' + e[0] + ' ' + e[1];
  }

  // ===== UI build =====
  _build() {
    var size = this._config.size;
    var r = size / 2;
    var outerR = r - 6;        // outer ring radius
    var innerBandR = r - 18;   // radius of the segmented band
    var bandWidth = 16;        // thickness of the segmented band

    var root = document.createElement('ha-card');
    if (this._config.name) root.header = this._config.name;

    var style = document.createElement('style');
    style.textContent = `
      :host { display: block; }
      ha-card { padding: 8px 8px 6px; }
      .wrap { position: relative; margin: 0 auto; height:${size}px; width:${size}px; }
      svg { overflow: visible; }
      .outer { fill: none; stroke: ${this._config.outer_stroke}; stroke-width: 2; }
      .segment { fill: none; stroke: ${this._config.segment_color}; stroke-linecap: round; stroke-width: ${bandWidth}; }
      .labels { fill: ${this._config.label_color}; font-size: ${this._config.font_labels_px}px; font-weight: 600; }
      .centerText { fill: ${this._config.center_text_color}; font-size: ${this._config.font_center_px}px; font-weight: 700; text-anchor: middle; dominant-baseline: middle; }
      .speed { fill: var(--secondary-text-color); font-size: ${this._config.font_speed_px}px; text-anchor: middle; dominant-baseline: hanging; }
      .wedge { fill: ${this._config.wedge_color}; opacity: 1; }
    `;

    var wrap = document.createElement('div');
    wrap.className = 'wrap';

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);

    // Outer circle (thin grey stroke)
    var outer = document.createElementNS(svgNS, 'circle');
    outer.setAttribute('cx', r); outer.setAttribute('cy', r); outer.setAttribute('r', outerR);
    outer.setAttribute('class', 'outer');
    svg.appendChild(outer);

    // Segmented inner band (4 arcs)
    var segmentsG = document.createElementNS(svgNS, 'g');
    var gap = 6; // degrees gap around cardinal points
    for (var i = 0; i < 4; i++) {
      var start = i * 90 + gap;
      var end = (i + 1) * 90 - gap;
      var p = this._arcPath(r, r, innerBandR, start, end);
      var path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', p);
      path.setAttribute('class', 'segment');
      segmentsG.appendChild(path);
    }
    svg.appendChild(segmentsG);

    // Direction wedge (triangular pointer)
    var wedge = document.createElementNS(svgNS, 'path');
    wedge.setAttribute('class', 'wedge');
    svg.appendChild(wedge);

    // Labels around band (8 directions)
    var labelsG = document.createElementNS(svgNS, 'g');
    labelsG.setAttribute('class', 'labels');
    svg.appendChild(labelsG);

    // Center big cardinal + optional speed
    var center = document.createElementNS(svgNS, 'text');
    center.setAttribute('x', r); center.setAttribute('y', r);
    center.setAttribute('class', 'centerText');
    center.textContent = '—';
    svg.appendChild(center);

    var speedT = document.createElementNS(svgNS, 'text');
    speedT.setAttribute('x', r); speedT.setAttribute('y', r + (this._config.font_center_px * 0.65));
    speedT.setAttribute('class', 'speed');
    speedT.textContent = '';
    if (this._config.show_speed) svg.appendChild(speedT);

    wrap.appendChild(svg);

    root.appendChild(style);
    root.appendChild(wrap);

    this._els = { r: r, innerBandR: innerBandR, bandWidth: bandWidth, wedge: wedge, center: center, speedT: speedT, labelsG: labelsG };

    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(root);

    // Initial labels
    this._lang = this._resolveLang();
    this._renderLabels();
  }

  _renderLabels() {
    if (!this._els) return;
    var r = this._els.r;
    var lblR = this._els.innerBandR; // place roughly in the band
    var labelsG = this._els.labelsG;
    while (labelsG.firstChild) labelsG.removeChild(labelsG.firstChild);

    var dict = I18N[this._lang] || I18N.en;
    var card8 = dict.card8;

    var svgNS = 'http://www.w3.org/2000/svg';
    var angles = [0,45,90,135,180,225,270,315];
    for (var i=0;i<8;i++) {
      var t = card8[i];
      var a = angles[i];
      var p = this._polar(r, r, lblR, a);
      var text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', p[0]); text.setAttribute('y', p[1] + 2);
      text.setAttribute('text-anchor', 'middle');
      text.textContent = t;
      labelsG.appendChild(text);
    }
  }

  // ===== update =====
  _update(dir, speed) {
    if (!this._els) return;
    var r = this._els.r, innerBandR = this._els.innerBandR, bandWidth = this._els.bandWidth, wedge = this._els.wedge, center = this._els.center, speedT = this._els.speedT;

    if (dir == null || !isFinite(dir)) {
      center.textContent = '—';
      if (speedT) speedT.textContent = '';
      wedge.setAttribute('d', '');
      return;
    }

    // Wedge geometry
    var w = this._config.wedge_width_deg;
    var a1 = dir - w/2;
    var a2 = dir + w/2;
    var baseR = innerBandR - (bandWidth * 0.45);  // inner base of the triangle
    var tipR  = innerBandR + (bandWidth * 0.8);   // tip extends a bit outside the band

    var p1 = this._polar(r, r, baseR, a1);
    var p2 = this._polar(r, r, tipR, dir);
    var p3 = this._polar(r, r, baseR, a2);
    var d = 'M ' + p1[0] + ' ' + p1[1] + ' L ' + p2[0] + ' ' + p2[1] + ' L ' + p3[0] + ' ' + p3[1] + ' Z';
    wedge.setAttribute('d', d);

    // Center text (localized 16-point compass)
    var label = this._cardinal16(dir);
    center.textContent = label;

    if (speedT) speedT.textContent = this._formatSpeed(speed);
  }
}

if (!customElements.get('wu-wind-compass-card')) {
  customElements.define('wu-wind-compass-card', WuWindCompassCard);
  try { console.info('%cWU Wind Compass Card loaded v' + WuWindCompassCard.version, 'color:#03a9f4'); } catch(e) {}
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'wu-wind-compass-card',
  name: 'WU Wind Compass Card',
  description: 'Compass-style wind direction card with wedge & segmented band. i18n: en, cs',
});

// ========== Editor (GUI) ==========
class WuWindCompassCardEditor extends HTMLElement {
  constructor() {
    super();
    this._helpers = null;
    this._hass = null;
    this._config = {};
    this.attachShadow({ mode: 'open' });
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    this._config = { ...config };
    // Normalize language 'auto' -> null
    if (this._config.language === 'auto') delete this._config.language;
    this._render();
  }

  connectedCallback() {
    this._load();
  }

  async _load() {
    if (window.loadCardHelpers) {
      try { this._helpers = await window.loadCardHelpers(); } catch (e) {}
    }
    this._render();
  }

  _schema() {
    return [
      { name: 'name', selector: { text: {} } },
      { name: 'entity_direction', required: true, selector: { entity: { domain: 'sensor' } } },
      { name: 'entity_speed', selector: { entity: { domain: 'sensor' } } },
      { name: 'language', selector: { select: { mode: 'dropdown', options: [
        { value: 'auto', label: 'Auto (HA language)' },
        { value: 'cs', label: 'Čeština' },
        { value: 'en', label: 'English' },
      ] } } },
      { name: 'size', selector: { number: { min: 140, max: 480, step: 10, mode: 'slider' } } },
      { name: 'wedge_width_deg', selector: { number: { min: 5, max: 90, step: 2.5, mode: 'slider' } } },
      { name: 'smooth_deg', selector: { number: { min: 0, max: 30, step: 1, mode: 'slider' } } },
      { name: 'font_center_px', selector: { number: { min: 16, max: 48, step: 1, mode: 'box' } } },
      { name: 'font_labels_px', selector: { number: { min: 10, max: 30, step: 1, mode: 'box' } } },
      { name: 'font_speed_px', selector: { number: { min: 10, max: 24, step: 1, mode: 'box' } } },
      { name: 'wedge_color', selector: { text: {} } },
      { name: 'segment_color', selector: { text: {} } },
      { name: 'outer_stroke', selector: { text: {} } },
      { name: 'label_color', selector: { text: {} } },
      { name: 'center_text_color', selector: { text: {} } },
    ];
  }

  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      :host { display:block; }
      ha-form { padding: 0 6px 6px; }
    `;

    const form = document.createElement('ha-form');
    form.schema = this._schema();
    form.data = this._exportData(this._config);
    form.hass = this._hass;
    form.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      const v = ev.detail.value || {};
      const cfg = this._importData(v);
      this._config = cfg;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: cfg }, bubbles: true, composed: true }));
    });

    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(form);
  }

  _exportData(cfg) {
    const out = { ...cfg };
    if (!out.language) out.language = 'auto';
    return out;
  }
  _importData(v) {
    const cfg = { ...v };
    if (cfg.language === 'auto') delete cfg.language; // let card auto-detect
    return cfg;
  }
}

if (!customElements.get('wu-wind-compass-card-editor')) {
  customElements.define('wu-wind-compass-card-editor', WuWindCompassCardEditor);
}
