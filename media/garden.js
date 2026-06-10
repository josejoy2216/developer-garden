// Developer Garden — webview renderer.
// Pure client-side drawing from the view model posted by the extension.
// Deterministic: the same garden always draws the same way.

(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const tabs = document.getElementById('tabs');

  let model = null;
  let activeTab = 'garden';

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    for (const b of tabs.querySelectorAll('button')) {
      b.classList.toggle('active', b === btn);
    }
    render();
  });

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.type === 'state') {
      model = e.data.model;
      render();
    } else if (e.data.type === 'watered') {
      toast = e.data.gained > 0
        ? '+' + e.data.gained + ' growth — it loved that.'
        : 'Already watered today. It\'s glistening.';
      renderPopover();
    }
  });

  vscode.postMessage({ type: 'ready' });

  // ------------------------------------------------------------ utilities

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const STAGE_LEVEL = { seed: 0, sprout: 1, plant: 2, tree: 3, mature: 4 };
  const STAGE_LABEL = { seed: 'Seed', sprout: 'Sprout', plant: 'Plant', tree: 'Tree', mature: 'Mature' };
  const STAGE_NEXT_MIN = { seed: 25, sprout: 90, plant: 250, tree: 600, mature: null };

  const ALL_SPECIES = [
    ['oak', 'Oak'], ['birch', 'Birch'], ['pine', 'Pine'], ['willow', 'Willow'],
    ['maple', 'Maple'], ['bamboo', 'Bamboo'], ['sunflower', 'Sunflower'], ['tulip', 'Tulip'],
    ['lavender', 'Lavender'], ['cactus', 'Cactus'], ['fern', 'Fern'], ['bush', 'Berry bush']
  ];

  function hours(min) {
    return min < 60 ? min + ' min' : (min / 60).toFixed(1) + ' hrs';
  }

  // ------------------------------------------------------------ plants

  // Returns an SVG <g> string for a plant at (x, groundY), height scaled by stage.
  function drawPlant(p, x, groundY, scale, seed, interactive) {
    const r = rng(seed);
    const lvl = STAGE_LEVEL[p.stage] || 0;
    const delay = (r() * 6).toFixed(2);
    const sway = 'class="anim' + (lvl > 0 ? ' sway' : '') + '"' +
      (lvl > 0 ? ' style="animation-delay:-' + delay + 's"' : '');
    let body = '';

    if (lvl === 0) {
      body =
        '<ellipse cx="0" cy="0" rx="8" ry="3.4" fill="#4a3b2c"/>' +
        '<ellipse cx="0" cy="-1" rx="5.5" ry="2.2" fill="#5a4936"/>' +
        '<path d="M0 -2 q -0.6 -3 0.4 -5" stroke="#9ccb86" stroke-width="1.4" fill="none"/>' +
        '<circle cx="0.6" cy="-7.6" r="1.7" fill="#9ccb86"/>';
    } else {
      body = bySpecies(p.species, lvl, r);
    }

    const dormantStyle = p.dormant ? ' style="filter:saturate(.3) brightness(.82)"' : '';
    const cap = p.dormant && lvl > 1
      ? '<ellipse cx="0" cy="' + (-14 * lvl * 0.9) + '" rx="' + (5 + lvl * 2) + '" ry="2.4" fill="#dfe8f2" opacity="0.85"/>'
      : '';

    const identity = interactive
      ? ' class="plant" data-plant="' + esc(p.name) + '" data-x="' + x.toFixed(1) + '" data-y="' + groundY.toFixed(1) + '" data-h="' + (12 + lvl * 12) + '" tabindex="0" role="button" aria-label="Visit ' + esc(p.name) + '"'
      : '';
    return (
      '<g' + identity + ' transform="translate(' + x.toFixed(1) + ',' + groundY.toFixed(1) + ') scale(' + scale + ')"' + dormantStyle + '>' +
      '<g ' + sway + '>' + body + cap + '</g>' +
      '<ellipse cx="0" cy="1.5" rx="' + (6 + lvl * 3) + '" ry="2" fill="#10180f" opacity="0.35"/>' +
      '<title>' + esc(p.name) + ' — ' + STAGE_LABEL[p.stage] + (p.dormant ? ' (resting)' : '') + '</title>' +
      '</g>'
    );
  }

  function bySpecies(species, lvl, r) {
    const h = 10 + lvl * 11; // stem/trunk height
    const lean = (r() - 0.5) * 4;
    switch (species) {
      case 'pine': {
        let tiers = '';
        for (let i = 0; i < lvl; i++) {
          const w = 10 + (lvl - i) * 4;
          const y = -h * 0.35 - i * (h * 0.18);
          tiers += '<path d="M' + -w + ' ' + y + ' L0 ' + (y - w * 1.1) + ' L' + w + ' ' + y + ' Z" fill="#3e6b4f"/>';
        }
        return trunk(h * 0.45, '#5d4634') + tiers;
      }
      case 'birch':
        return trunk(h, '#e8e4d8', lean) + dashes(h) + canopy(h, lvl, r, '#8fbf7f', '#a9d49a');
      case 'willow': {
        let strands = '';
        const n = 4 + lvl * 2;
        for (let i = 0; i < n; i++) {
          const sx = (r() - 0.5) * (10 + lvl * 5);
          strands += '<path d="M' + sx + ' ' + (-h + 4) + ' q ' + (sx * 0.4) + ' ' + (h * 0.55) +
            ' ' + (sx * 0.8) + ' ' + (h * 0.75) + '" stroke="#7fb069" stroke-width="1.4" fill="none" opacity="0.9"/>';
        }
        return trunk(h, '#6b4f3a', lean) + canopy(h, lvl, r, '#6da77a', '#7fb069') + strands;
      }
      case 'maple':
        return trunk(h, '#6b4f3a', lean) + canopy(h, lvl, r, '#d98e73', '#e8a37f');
      case 'bamboo': {
        let stalks = '';
        const n = Math.min(1 + lvl, 4);
        for (let i = 0; i < n; i++) {
          const sx = (i - (n - 1) / 2) * 5;
          const sh = h * (0.8 + r() * 0.4);
          stalks += '<rect x="' + (sx - 1.4) + '" y="' + -sh + '" width="2.8" height="' + sh + '" rx="1.2" fill="#9ccb86"/>';
          for (let k = 1; k <= 3; k++) {
            stalks += '<line x1="' + (sx - 1.6) + '" y1="' + (-sh * k / 4) + '" x2="' + (sx + 1.6) + '" y2="' + (-sh * k / 4) + '" stroke="#5e8c5a" stroke-width="0.8"/>';
          }
          if (lvl > 1) stalks += leaf(sx, -sh + 2, 6, '#7fb069', r);
        }
        return stalks;
      }
      case 'sunflower': {
        const head = lvl >= 2
          ? petals(0, -h, 4 + lvl, '#e8c170', 6 + lvl) + '<circle cx="0" cy="' + -h + '" r="' + (2.5 + lvl) + '" fill="#6b4f3a"/>'
          : '<circle cx="0" cy="' + -h + '" r="2.5" fill="#9ccb86"/>';
        return stem(h, lean) + leaf(-2, -h * 0.5, 6, '#7fb069', r) + leaf(2, -h * 0.65, 6, '#7fb069', r, true) + head;
      }
      case 'tulip': {
        const bloom = lvl >= 2
          ? '<path d="M-5 ' + -h + ' q0 -9 5 -9 q5 0 5 9 q-2.5 4 -5 4 q-2.5 0 -5 -4Z" fill="#d98e73"/>'
          : '<circle cx="0" cy="' + -h + '" r="2.5" fill="#9ccb86"/>';
        return stem(h, lean) + leaf(-2, -h * 0.4, 7, '#6da77a', r) + bloom;
      }
      case 'lavender': {
        let spikes = '';
        const n = 1 + lvl;
        for (let i = 0; i < n; i++) {
          const sx = (i - (n - 1) / 2) * 5;
          const sh = h * (0.75 + r() * 0.4);
          spikes += '<line x1="' + sx + '" y1="0" x2="' + sx + '" y2="' + -sh + '" stroke="#6da77a" stroke-width="1.2"/>';
          if (lvl >= 2) spikes += '<ellipse cx="' + sx + '" cy="' + (-sh - 3) + '" rx="2.2" ry="5" fill="#a48ed1"/>';
          else spikes += '<circle cx="' + sx + '" cy="' + -sh + '" r="1.8" fill="#9ccb86"/>';
        }
        return spikes;
      }
      case 'cactus': {
        const bh = h * 0.9;
        let arms = '';
        if (lvl >= 3) {
          arms = '<path d="M-4 ' + (-bh * 0.5) + ' h-5 v-8 a3 3 0 0 1 6 0 v5" fill="none" stroke="#6da77a" stroke-width="5" stroke-linecap="round"/>';
        }
        if (lvl >= 4) {
          arms += '<path d="M4 ' + (-bh * 0.62) + ' h5 v-10 a3 3 0 0 0 -6 0 v6" fill="none" stroke="#6da77a" stroke-width="5" stroke-linecap="round"/>' +
            '<circle cx="0" cy="' + (-bh - 3) + '" r="2.4" fill="#d98e73"/>';
        }
        return '<rect x="-4" y="' + -bh + '" width="8" height="' + bh + '" rx="4" fill="#6da77a"/>' + arms;
      }
      case 'fern': {
        let fronds = '';
        const n = 2 + lvl * 2;
        for (let i = 0; i < n; i++) {
          const ang = -90 + (i - (n - 1) / 2) * 22;
          const len = h * (0.7 + r() * 0.4);
          const rad = (ang * Math.PI) / 180;
          const ex = Math.cos(rad) * len;
          const ey = Math.sin(rad) * len;
          fronds += '<path d="M0 0 Q ' + (ex * 0.3) + ' ' + (ey * 0.8) + ' ' + ex + ' ' + ey + '" stroke="#5e8c5a" stroke-width="1.6" fill="none"/>';
        }
        return fronds;
      }
      case 'bush': {
        const berries = lvl >= 3 ? dots(r, 3 + lvl, 8 + lvl * 2, -h * 0.5, '#d98e73') : '';
        return blob(0, -h * 0.45, 8 + lvl * 4, '#5e8c5a') + blob(-5, -h * 0.4, 6 + lvl * 3, '#6da77a') + berries;
      }
      default: // oak & fallback
        return trunk(h, '#6b4f3a', lean) + canopy(h, lvl, r, '#5e8c5a', '#6da77a') +
          (lvl >= 4 ? dots(r, 5, 12, -h - 4, '#e8c170') : '');
    }
  }

  function trunk(h, color, lean = 0) {
    return '<path d="M-2.5 0 Q' + lean + ' ' + (-h / 2) + ' -1 ' + -h + ' L1 ' + -h + ' Q' + lean + ' ' + (-h / 2) + ' 2.5 0 Z" fill="' + color + '"/>';
  }
  function stem(h, lean = 0) {
    return '<path d="M0 0 Q' + lean + ' ' + (-h / 2) + ' 0 ' + -h + '" stroke="#6da77a" stroke-width="1.6" fill="none"/>';
  }
  function dashes(h) {
    let d = '';
    for (let y = -h * 0.2; y > -h * 0.9; y -= h * 0.18) {
      d += '<line x1="-1.8" y1="' + y + '" x2="0.4" y2="' + (y - 1) + '" stroke="#4a4438" stroke-width="0.9"/>';
    }
    return d;
  }
  function canopy(h, lvl, r, c1, c2) {
    let g = '';
    const n = 2 + lvl;
    for (let i = 0; i < n; i++) {
      const cx = (r() - 0.5) * (8 + lvl * 4);
      const cy = -h - (r() * lvl * 6);
      const rad = 6 + lvl * 3 + r() * 4;
      g += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + rad.toFixed(1) + '" fill="' + (i % 2 ? c2 : c1) + '"/>';
    }
    return g;
  }
  function leaf(x, y, len, color, r, flip) {
    const dir = flip ? -1 : 1;
    return '<path d="M' + x + ' ' + y + ' q ' + (dir * len) + ' -2 ' + (dir * len) + ' -5 q ' + (-dir * len * 0.8) + ' 0 ' + (-dir * len) + ' 5Z" fill="' + color + '"/>';
  }
  function petals(x, y, r1, color, n) {
    let g = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g += '<ellipse cx="' + (x + Math.cos(a) * r1).toFixed(1) + '" cy="' + (y + Math.sin(a) * r1).toFixed(1) +
        '" rx="3.2" ry="2" fill="' + color + '" transform="rotate(' + ((a * 180) / Math.PI).toFixed(0) + ' ' +
        (x + Math.cos(a) * r1).toFixed(1) + ' ' + (y + Math.sin(a) * r1).toFixed(1) + ')"/>';
    }
    return g;
  }
  function blob(x, y, r1, color) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r1 + '" fill="' + color + '"/>';
  }
  function dots(r, n, spread, y, color) {
    let g = '';
    for (let i = 0; i < n; i++) {
      g += '<circle cx="' + ((r() - 0.5) * spread * 2).toFixed(1) + '" cy="' + (y + (r() - 0.5) * 10).toFixed(1) + '" r="1.4" fill="' + color + '"/>';
    }
    return g;
  }

  // ------------------------------------------------------------ scene

  function renderScene(m) {
    const W = 360, H = 222;
    const dusk = m.mood === 'dusk';
    const skyTop = dusk ? '#1b2735' : '#cfe3d2';
    const skyBot = dusk ? '#41506b' : '#f0f4e3';
    const unlockedIds = (m.achievements || []).filter((a) => a.unlockedAt).map((a) => a.id);
    const wild = (m.wildlife || []).filter((w) => w.unlockedAt).map((w) => w.id);

    let svg = '<svg data-scene viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Your garden">';
    svg += '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + skyTop + '"/><stop offset="1" stop-color="' + skyBot + '"/></linearGradient></defs>';
    svg += '<rect width="' + W + '" height="' + H + '" fill="url(#sky)"/>';

    // celestial
    if (dusk) {
      svg += '<circle cx="306" cy="38" r="13" fill="#f0f4e3" opacity="0.92"/><circle cx="299" cy="33" r="12" fill="' + skyTop + '"/>';
      const sr = rng(7);
      for (let i = 0; i < 14; i++) {
        svg += '<circle class="twinkle" style="animation-delay:-' + (sr() * 3.5).toFixed(2) + 's" cx="' +
          (sr() * W).toFixed(0) + '" cy="' + (sr() * 80).toFixed(0) + '" r="0.9" fill="#f0f4e3"/>';
      }
    } else {
      svg += '<circle cx="306" cy="40" r="15" fill="#e8c170" opacity="0.95"/>';
    }

    // hills + ground
    svg += '<path d="M0 150 Q 90 122 200 146 T 360 140 V222 H0 Z" fill="' + (dusk ? '#26382c' : '#4c7350') + '"/>';
    svg += '<path d="M0 176 Q 120 158 240 174 T 360 170 V222 H0 Z" fill="' + (dusk ? '#1d2a22' : '#3e5c44') + '"/>';

    // decorations from achievements
    if (unlockedIds.includes('first-seed')) {
      const stones = [[252, 218, 7], [243, 208, 6], [250, 198, 5.4], [241, 189, 4.8], [247, 181, 4.2]];
      for (const [sx, sy, sr2] of stones) {
        svg += '<ellipse cx="' + sx + '" cy="' + sy + '" rx="' + sr2 + '" ry="' + (sr2 * 0.45).toFixed(1) +
          '" fill="' + (dusk ? '#8f8a7c' : '#cfc6ad') + '" opacity="0.75"/>';
      }
    }
    if (unlockedIds.includes('projects-5')) {
      svg += '<ellipse cx="64" cy="206" rx="30" ry="9" fill="#7fa9c9" opacity="0.85"/><ellipse cx="64" cy="204" rx="30" ry="9" fill="#9dc2db" opacity="0.6"/>';
    }
    if (unlockedIds.includes('streak-30')) {
      svg += '<g transform="translate(344,186)"><rect x="-1.5" y="0" width="3" height="22" fill="#56524a"/>' +
        '<rect x="-5" y="-10" width="10" height="11" rx="2" fill="#3a3a38"/>' +
        '<rect x="-3" y="-8" width="6" height="7" fill="#e8c170" class="twinkle"/></g>';
    }
    if (unlockedIds.includes('commits-1000')) {
      svg += '<g transform="translate(298,190)"><rect x="-16" y="0" width="32" height="3" rx="1" fill="#6b4f3a"/>' +
        '<rect x="-14" y="3" width="3" height="9" fill="#5d4634"/><rect x="11" y="3" width="3" height="9" fill="#5d4634"/>' +
        '<rect x="-16" y="-7" width="32" height="2.5" fill="#6b4f3a"/></g>';
    }
    if (unlockedIds.includes('first-commit')) {
      svg += '<g transform="translate(140,206)">' + petals(0, 0, 3, '#f0f4e3', 6) + '<circle r="1.6" fill="#e8c170"/></g>';
    }
    if (unlockedIds.includes('streak-7')) {
      for (let i = 0; i < 4; i++) {
        svg += '<g transform="translate(' + (200 + i * 9) + ',208)"><line y2="-6" stroke="#6da77a" stroke-width="1"/><circle cy="-7" r="2.2" fill="#e8a13c"/></g>';
      }
    }
    if (unlockedIds.includes('first-mature') && dusk) {
      const fr = rng(99);
      for (let i = 0; i < 6; i++) {
        svg += '<circle class="twinkle" style="animation-delay:-' + (fr() * 3.5).toFixed(2) + 's" cx="' +
          (40 + fr() * 280).toFixed(0) + '" cy="' + (130 + fr() * 60).toFixed(0) + '" r="1.2" fill="#e8c170"/>';
      }
    }

    // plants — newest projects up front, two staggered rows
    const projects = m.projects.slice();
    const shown = projects.slice(-14);
    const back = shown.filter((_, i) => i % 2 === 1);
    const front = shown.filter((_, i) => i % 2 === 0);
    const place = (list, y, scale) => {
      const pad = 34;
      const step = list.length > 1 ? (W - pad * 2) / (list.length - 1) : 0;
      list.forEach((p, i) => {
        const seed = hash(p.name);
        const jitter = (rng(seed)() - 0.5) * 14;
        const x = list.length === 1 ? W * 0.42 : pad + step * i + jitter;
        svg += drawPlant(p, x, y, scale, seed, true);
      });
    };
    place(back, 172, 0.8);
    place(front, 204, 1.05);

    // wildlife
    if (wild.includes('butterfly')) {
      svg += '<g class="drift" transform="translate(110,120)"><ellipse cx="-2.4" cy="0" rx="3" ry="4" fill="#e8a37f"/><ellipse cx="2.4" cy="0" rx="3" ry="4" fill="#d98e73"/><line x1="0" y1="-4" x2="0" y2="4" stroke="#3a3026" stroke-width="1"/></g>';
    }
    if (wild.includes('bee')) {
      svg += '<g class="drift" style="animation-duration:10s" transform="translate(230,136)"><ellipse rx="3.4" ry="2.4" fill="#e8c170"/><line x1="-1" y1="-2.4" x2="-1" y2="2.4" stroke="#3a3026"/><line x1="1.2" y1="-2.4" x2="1.2" y2="2.4" stroke="#3a3026"/><ellipse cx="0" cy="-2.8" rx="2" ry="1.2" fill="#f0f4e3" opacity="0.8"/></g>';
    }
    if (wild.includes('bird')) {
      svg += '<path class="drift" style="animation-duration:18s" d="M70 60 q4 -5 8 0 q4 -5 8 0" stroke="' + (dusk ? '#cfd8e3' : '#3e5c44') + '" stroke-width="1.6" fill="none"/>';
    }
    if (wild.includes('squirrel')) {
      svg += '<g transform="translate(250,200)"><circle r="3.4" fill="#a4684a"/><circle cx="3" cy="-2.4" r="2" fill="#a4684a"/><path d="M-3 0 q-6 -2 -4 -9 q4 0 5 6" fill="#8a563c"/></g>';
    }
    if (wild.includes('fox')) {
      svg += '<g transform="translate(36,182)"><path d="M0 0 L10 0 L8 -6 L5 -3 L2 -6 Z" fill="#d97f4a"/><path d="M10 0 q6 -1 7 -5" stroke="#d97f4a" stroke-width="2.4" fill="none"/></g>';
    }
    if (wild.includes('owl')) {
      svg += '<g transform="translate(28,118)"><line x1="-9" y1="6" x2="10" y2="6" stroke="#6b4f3a" stroke-width="2"/><ellipse rx="4.4" ry="5.6" fill="#8a7a64"/><circle cx="-1.6" cy="-1.6" r="1.3" fill="#f0f4e3"/><circle cx="1.6" cy="-1.6" r="1.3" fill="#f0f4e3"/><circle cx="-1.6" cy="-1.6" r="0.5" fill="#1d2a22"/><circle cx="1.6" cy="-1.6" r="0.5" fill="#1d2a22"/></g>';
    }

    svg += '</svg>';

    const more = projects.length > shown.length
      ? '<p class="small muted">+ ' + (projects.length - shown.length) + ' more plants live on in your Journey.</p>'
      : '';
    const welcome = m.returning
      ? '<div class="welcome-back">Welcome back. Everything you planted is still here, resting under a light frost.</div>'
      : '';

    const hint = m.projects.length
      ? '<p class="small muted hint">Tap a plant to visit it — you can water each one once a day, just for fun.</p>'
      : '';
    return '<div class="scene-wrap">' + svg + '</div><div id="popover"></div>' + welcome + hint + more;
  }

  // ------------------------------------------------------------ tabs

  function renderGarden(m) {
    let html = renderScene(m);
    if (!m.projects.length) {
      html += '<div class="card"><h3>Your garden is ready</h3><p class="muted">Open a project and start working — a seed will appear here on its own. Nothing to water, nothing to maintain.</p></div>';
      return html;
    }
    html += '<div class="card"><h3>Project plants</h3>';
    for (const p of m.projects.slice().reverse()) {
      html += plantRow(p, p.commits + ' commits · ' + hours(p.minutes));
    }
    html += '</div>';
    return html;
  }

  function renderSkills(m) {
    if (!m.skills.length) {
      return '<div class="card"><h3>Skills</h3><p class="muted">As you work in different languages and tools, skill plants will sprout here on their own.</p></div>';
    }
    let html = '<div class="card"><h3>Skill plants</h3>';
    for (const s of m.skills) {
      html += plantRow(s, hours(s.minutes) + ' of work');
    }
    html += '</div>';
    return html;
  }

  function plantRow(p, detail) {
    const next = STAGE_NEXT_MIN[p.stage];
    const prevMin = { seed: 0, sprout: 25, plant: 90, tree: 250, mature: 600 }[p.stage];
    const pct = next ? Math.min(100, Math.round(((p.growth - prevMin) / (next - prevMin)) * 100)) : 100;
    const mini = '<svg class="mini-plant" width="30" height="34" viewBox="-15 -28 30 34">' +
      drawPlant(p, 0, 2, 0.62, hash(p.name)) + '</svg>';
    const badge = p.dormant
      ? '<span class="badge dormant">resting</span>'
      : '<span class="badge stage-' + p.stage + '">' + STAGE_LABEL[p.stage] + '</span>';
    return '<div class="row">' + mini +
      '<div class="grow"><div class="name">' + esc(p.name) + '</div>' +
      '<div class="small muted">' + esc(detail) + '</div>' +
      '<div class="stagebar" title="' + pct + '% toward the next form"><i style="width:' + pct + '%"></i></div></div>' +
      badge + '</div>';
  }

  function renderJourney(m) {
    let html = '';
    html += '<div class="card"><h3 class="display">Career timeline</h3>';
    if (!m.timeline.length) {
      html += '<p class="muted">Your timeline begins with your first project.</p>';
    }
    for (const t of m.timeline) {
      html += '<div class="year"><div class="y">' + t.year + '</div><ul>' +
        t.names.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul></div>';
    }
    html += '</div>';

    html += '<div class="card"><h3>Achievements</h3>';
    for (const a of m.achievements) {
      const cls = a.unlockedAt ? 'trophy' : 'trophy locked';
      const when = a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString() : '';
      html += '<div class="row ' + cls + '"><div class="grow"><div class="name">' + esc(a.title) +
        (when ? ' <span class="small muted">· ' + when + '</span>' : '') + '</div>' +
        '<div class="small muted">' + esc(a.detail) + ' <span class="reward">' + (a.unlockedAt ? esc(a.reward) : '') + '</span></div></div>' +
        '<span class="badge">' + (a.unlockedAt ? 'unlocked' : 'someday') + '</span></div>';
    }
    html += '</div>';

    html += '<div class="card"><h3>Wildlife</h3>';
    for (const w of m.wildlife) {
      const cls = w.unlockedAt ? 'trophy' : 'trophy locked';
      html += '<div class="row ' + cls + '"><div class="grow"><div class="name">' +
        (w.unlockedAt ? esc(w.name) : '???') + '</div>' +
        '<div class="small muted">' + esc(w.hint) + '</div></div>' +
        '<span class="badge">' + (w.unlockedAt ? 'in residence' : 'shy') + '</span></div>';
    }
    html += '</div>';
    return html;
  }

  function renderToday(m) {
    const d = m.daily, w = m.weekly;
    let html = '<div class="card"><h3 class="display">Today</h3>';
    if (d.minutes === 0 && d.growth === 0) {
      html += '<p class="muted">A quiet day so far. The garden is resting — it will be here when you are.</p>';
    } else {
      html += '<p>' + hours(d.minutes) + ' worked · ' + d.files + ' files · ' + d.commits + ' commits</p>' +
        '<p>Your garden gained <b>+' + d.growth + '</b> growth' +
        (m.streak > 1 ? ' · <b>' + m.streak + '</b>-day streak' : '') + '</p>';
      if (d.milestones.length) {
        html += '<ul>' + d.milestones.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>';
      }
    }
    html += '</div>';

    html += '<div class="card"><h3 class="display">This week</h3>';
    if (w.activeDays === 0) {
      html += '<p class="muted">A restful week. Everything you planted is still here.</p>';
    } else {
      html += '<p>' + hours(w.minutes) + ' across ' + w.activeDays + ' day' + (w.activeDays === 1 ? '' : 's') +
        ' · ' + w.commits + ' commits · +' + w.growth + ' growth</p>';
      if (w.mostActiveProject) html += '<p class="small">Most active project: <b>' + esc(w.mostActiveProject) + '</b></p>';
      if (w.mostImprovedSkill) html += '<p class="small">Most improved skill: <b>' + esc(w.mostImprovedSkill) + '</b></p>';
    }
    html += '</div>';

    html += '<p class="small muted">Everything here is computed and stored on your machine. No code, file contents, or project data ever leaves it.</p>';
    return html;
  }

  // ---------------------------------------------------------- interaction

  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let selectedPlant = null;
  let toast = '';
  let pickerOpen = false;

  root.addEventListener('click', (e) => {
    const plantG = e.target.closest ? e.target.closest('[data-plant]') : null;
    if (plantG) {
      selectedPlant = plantG.dataset.plant;
      toast = '';
      pickerOpen = false;
      wiggle(plantG);
      renderPopover();
      return;
    }
    const waterBtn = e.target.closest ? e.target.closest('[data-water]') : null;
    if (waterBtn) {
      waterPlant(waterBtn.dataset.water);
      return;
    }
    const pickBtn = e.target.closest ? e.target.closest('[data-pick]') : null;
    if (pickBtn) {
      pickerOpen = !pickerOpen;
      renderPopover();
      return;
    }
    const speciesBtn = e.target.closest ? e.target.closest('[data-species]') : null;
    if (speciesBtn) {
      const name = speciesBtn.dataset.for;
      const species = speciesBtn.dataset.species;
      vscode.postMessage({ type: 'species', name, species });
      pickerOpen = false;
      toast = 'Replanted as ' + speciesBtn.dataset.label.toLowerCase() + '. Same roots, same history.';
      // state refresh will redraw the scene; wiggle once it lands
      setTimeout(() => {
        const g = findPlantGroup(name);
        if (g) wiggle(g);
      }, 120);
      return;
    }
    const closeBtn = e.target.closest ? e.target.closest('[data-close]') : null;
    if (closeBtn) {
      selectedPlant = null;
      pickerOpen = false;
      renderPopover();
      return;
    }
    const scene = e.target.closest ? e.target.closest('svg[data-scene]') : null;
    if (scene) {
      grassFlower(scene, e);
    }
  });

  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.plant) {
      e.preventDefault();
      selectedPlant = e.target.dataset.plant;
      toast = '';
      wiggle(e.target);
      renderPopover();
    }
  });

  function findPlantGroup(name) {
    for (const g of root.querySelectorAll('[data-plant]')) {
      if (g.dataset.plant === name) return g;
    }
    return null;
  }

  function wiggle(g) {
    if (REDUCED) return;
    const anim = g.querySelector('.anim');
    if (!anim) return;
    anim.classList.remove('wiggle');
    void anim.getBoundingClientRect();
    anim.classList.add('wiggle');
    setTimeout(() => anim.classList.remove('wiggle'), 700);
  }

  function waterPlant(name) {
    vscode.postMessage({ type: 'water', name });
    const g = findPlantGroup(name);
    if (g && !REDUCED) {
      pourWater(g);
    }
  }

  function pourWater(g) {
    const svg = g.ownerSVGElement;
    if (!svg) return;
    const x = parseFloat(g.dataset.x);
    const y = parseFloat(g.dataset.y);
    const h = parseFloat(g.dataset.h) || 24;
    const ns = 'http://www.w3.org/2000/svg';
    const fx = document.createElementNS(ns, 'g');
    for (let i = 0; i < 7; i++) {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', (x + (Math.random() - 0.5) * 16).toFixed(1));
      c.setAttribute('cy', (y - h - 8).toFixed(1));
      c.setAttribute('r', (1 + Math.random()).toFixed(1));
      c.setAttribute('fill', '#9dc2db');
      c.setAttribute('class', 'drop');
      c.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
      c.style.setProperty('--fall', (h + 4) + 'px');
      fx.appendChild(c);
    }
    svg.appendChild(fx);
    g.classList.add('glisten');
    wiggle(g);
    setTimeout(() => {
      fx.remove();
      g.classList.remove('glisten');
      sparkle(svg, x, y - h * 0.6);
    }, 1300);
  }

  function sparkle(svg, x, y) {
    const ns = 'http://www.w3.org/2000/svg';
    const fx = document.createElementNS(ns, 'g');
    for (let i = 0; i < 5; i++) {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', (x + (Math.random() - 0.5) * 20).toFixed(1));
      c.setAttribute('cy', (y + (Math.random() - 0.5) * 14).toFixed(1));
      c.setAttribute('r', '1.1');
      c.setAttribute('fill', '#e8c170');
      c.setAttribute('class', 'spark');
      c.style.animationDelay = (Math.random() * 0.4).toFixed(2) + 's';
      fx.appendChild(c);
    }
    svg.appendChild(fx);
    setTimeout(() => fx.remove(), 1400);
  }

  // Tapping open grass grows a tiny ephemeral wildflower. Pure play.
  function grassFlower(svg, e) {
    if (REDUCED) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * 360;
    const sy = ((e.clientY - rect.top) / rect.height) * 222;
    if (sy < 152) return; // sky — let it be
    const ns = 'http://www.w3.org/2000/svg';
    const fx = document.createElementNS(ns, 'g');
    fx.setAttribute('class', 'pop-flower');
    const colors = ['#e8c170', '#d98e73', '#a48ed1', '#f0f4e3'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    fx.innerHTML =
      '<line x1="' + sx + '" y1="' + sy + '" x2="' + sx + '" y2="' + (sy - 7) + '" stroke="#6da77a" stroke-width="1.2"/>' +
      '<circle cx="' + sx + '" cy="' + (sy - 9) + '" r="2.6" fill="' + color + '"/>' +
      '<circle cx="' + sx + '" cy="' + (sy - 9) + '" r="1" fill="#3a3026"/>';
    fx.style.transformOrigin = sx + 'px ' + sy + 'px';
    svg.appendChild(fx);
    setTimeout(() => fx.remove(), 4000);
  }

  function renderPopover() {
    const el = document.getElementById('popover');
    if (!el) return;
    if (!selectedPlant || !model) {
      el.innerHTML = '';
      return;
    }
    const p = model.projects.find((x) => x.name === selectedPlant);
    if (!p) {
      el.innerHTML = '';
      return;
    }
    const watered = !!p.wateredToday;
    const btn = watered
      ? '<button class="btn" disabled>Watered today ✓</button>'
      : '<button class="btn" data-water="' + esc(p.name) + '">💧 Water</button>';
    el.innerHTML =
      '<div class="popover-card">' +
      '<div class="grow"><div class="name">' + esc(p.name) + '</div>' +
      '<div class="small muted">' + STAGE_LABEL[p.stage] + (p.dormant ? ' · resting' : '') +
      ' · ' + p.commits + ' commits · ' + hours(p.minutes) + '</div>' +
      (toast ? '<div class="small toast">' + esc(toast) + '</div>' : '') +
      '</div>' + btn +
      '<button class="btn" data-pick title="Choose a different plant">🌿</button>' +
      '<button class="btn ghost" data-close aria-label="Close">✕</button>' +
      '</div>' +
      (pickerOpen ? renderNursery(p) : '');
  }

  function renderNursery(p) {
    // Preview at the plant's stage (at least "Plant" so species are tellable apart).
    const lvl = Math.max(STAGE_LEVEL[p.stage] || 0, 2);
    const previewStage = ['seed', 'sprout', 'plant', 'tree', 'mature'][lvl];
    let html = '<div class="nursery">' +
      '<div class="small muted nursery-head">Choose how ' + esc(p.name) +
      ' grows — looks only, growth and history stay.</div><div class="nursery-grid">';
    for (const [id, label] of ALL_SPECIES) {
      const current = id === p.species;
      const preview = drawPlant(
        { name: label, species: id, stage: previewStage, dormant: false },
        0, 6, 0.62, hash(id)
      );
      html += '<button class="species' + (current ? ' current' : '') + '" data-species="' + id +
        '" data-for="' + esc(p.name) + '" data-label="' + esc(label) + '"' +
        (current ? ' disabled' : '') + '>' +
        '<svg width="44" height="52" viewBox="-22 -40 44 52">' + preview + '</svg>' +
        '<span class="small">' + esc(label) + '</span></button>';
    }
    html += '</div></div>';
    return html;
  }

  function render() {
    if (!model) return;
    const views = {
      garden: renderGarden,
      skills: renderSkills,
      journey: renderJourney,
      today: renderToday
    };
    root.innerHTML = (views[activeTab] || renderGarden)(model);
    if (activeTab === 'garden') {
      renderPopover();
    }
  }
})();
