#!/usr/bin/env node
/**
 * contrib-city.mjs — render a GitHub contribution calendar as an isometric
 * "city" SVG card for your profile README.
 *
 * Usage:
 *   GITHUB_TOKEN=xxx node contrib-city.mjs --user octocat --out profile/contrib-city.svg
 *   node contrib-city.mjs --demo --out profile/contrib-city.svg      # sample data, no token
 *
 * Options (flag or environment variable):
 *   --user  / GH_USER      GitHub login (defaults to GITHUB_REPOSITORY_OWNER inside Actions)
 *   --out   / CITY_OUT     output file (default: profile/contrib-city.svg)
 *   --theme / CITY_THEME   teal | green | violet | amber (default: teal)
 *   --title / CITY_TITLE   heading text (default: "Contribution City")
 *   --animation / CITY_ANIMATION
 *                          wave      buildings rise, then a wave pushes them down and up (default)
 *                          equalizer buildings rise, then each bounces at its own pace
 *                          rise      buildings rise once, then stay still
 *                          none      static image
 *   --demo                 use generated sample data instead of the GitHub API
 *
 * No dependencies. Needs Node 18+ (built-in fetch).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ---------------------------------------------------------------- themes ---

const THEMES = {
  teal: {
    bg: ['#10302b', '#24524a', '#143831'],
    border: '#3f8a7e',
    accent: '#6fe3cb',
    text: '#e9fffa',
    sub: '#8eeed8',
    muted: '#7fb8ac',
    levels: ['#2b5c55', '#3e9584', '#58b8a4', '#7ad3bf', '#a6eadb'],
  },
  green: {
    bg: ['#0d1117', '#14281c', '#0d1117'],
    border: '#2f6b3e',
    accent: '#56d364',
    text: '#f0fff4',
    sub: '#7ee787',
    muted: '#7aa385',
    levels: ['#1f3b2a', '#0f6a34', '#1f9a45', '#2fc055', '#66e080'],
  },
  violet: {
    bg: ['#17122c', '#2e2556', '#1a1534'],
    border: '#6d5bd0',
    accent: '#b9a7ff',
    text: '#f5f2ff',
    sub: '#cabdff',
    muted: '#9a8fc8',
    levels: ['#3a3168', '#5b4bb0', '#7c69d6', '#a08ff0', '#cdc2ff'],
  },
  amber: {
    bg: ['#24170c', '#4a2f15', '#29190d'],
    border: '#b07a35',
    accent: '#ffc46b',
    text: '#fff7ea',
    sub: '#ffd28f',
    muted: '#c9a272',
    levels: ['#5a3a1a', '#9a5f1e', '#c97f28', '#eea43c', '#ffd27a'],
  },
};

// ------------------------------------------------------------------ main ---

const args = parseArgs(process.argv.slice(2));
const opts = {
  user: args.user || process.env.GH_USER || process.env.GITHUB_REPOSITORY_OWNER || 'octocat',
  out: args.out || process.env.CITY_OUT || 'profile/contrib-city.svg',
  theme: args.theme || process.env.CITY_THEME || 'teal',
  title: args.title || process.env.CITY_TITLE || 'Contribution City',
  animation: args.animation || process.env.CITY_ANIMATION || 'wave',
  demo: Boolean(args.demo),
};
const ANIMATIONS = ['wave', 'equalizer', 'rise', 'none'];
if (!ANIMATIONS.includes(opts.animation)) {
  console.error(`Unknown animation "${opts.animation}". Choose one of: ${ANIMATIONS.join(', ')}`);
  process.exit(1);
}
if (!THEMES[opts.theme]) {
  console.error(`Unknown theme "${opts.theme}". Choose one of: ${Object.keys(THEMES).join(', ')}`);
  process.exit(1);
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!opts.demo && !token) {
  console.error('GITHUB_TOKEN is not set. Set it, or pass --demo to render sample data.');
  process.exit(1);
}

const calendar = opts.demo ? demoCalendar() : await fetchCalendar(opts.user, token);
const stats = computeStats(calendar);
const svg = render(calendar, stats, opts);

mkdirSync(dirname(opts.out), { recursive: true });
writeFileSync(opts.out, svg);
console.log(
  `Wrote ${opts.out} (${(svg.length / 1024).toFixed(1)} KB) — ` +
    `${stats.total} contributions, ${stats.active} active days, busiest ${stats.max}`,
);

// ------------------------------------------------------------------ data ---

async function fetchCalendar(login, token) {
  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date weekday contributionCount contributionLevel } }
        }
      }
    }
  }`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'contrib-city',
    },
    body: JSON.stringify({ query, variables: { login } }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));
  const cal = json.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error(`GitHub user "${login}" not found`);

  const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  return {
    total: cal.totalContributions,
    weeks: cal.weeks.map((w) =>
      w.contributionDays.map((d) => ({
        date: d.date,
        weekday: d.weekday,
        count: d.contributionCount,
        level: LEVEL[d.contributionLevel] ?? 0,
      })),
    ),
  };
}

/** Deterministic, realistic-looking sample year (for previews and testing). */
function demoCalendar() {
  const rand = mulberry32(20261111);
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // back to Sunday

  const days = [];
  for (let d = new Date(start), i = 0; d <= end; d.setUTCDate(d.getUTCDate() + 1), i++) {
    const weekday = d.getUTCDay();
    const season = 0.55 + 0.45 * Math.sin(i / 38) + 0.25 * Math.sin(i / 9 + 1.3);
    const weekend = weekday === 0 || weekday === 6 ? 0.45 : 1;
    const active = rand() < 0.62 + 0.25 * season * weekend;
    let count = active ? Math.round(1 + rand() ** 1.7 * 22 * Math.max(0.2, season) * weekend) : 0;
    if (active && rand() < 0.025) count += Math.round(25 + rand() * 35); // occasional crunch day
    days.push({ date: d.toISOString().slice(0, 10), weekday, count, level: 0 });
  }

  // GitHub-style quartile levels from the non-zero counts
  const nz = days.filter((d) => d.count > 0).map((d) => d.count).sort((a, b) => a - b);
  const q = (p) => nz[Math.floor((nz.length - 1) * p)] ?? 0;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  for (const d of days) d.level = d.count === 0 ? 0 : d.count <= q1 ? 1 : d.count <= q2 ? 2 : d.count <= q3 ? 3 : 4;

  const weeks = [];
  for (const d of days) {
    if (d.weekday === 0 || weeks.length === 0) weeks.push([]);
    weeks[weeks.length - 1].push(d);
  }
  return { total: days.reduce((s, d) => s + d.count, 0), weeks };
}

function computeStats(cal) {
  const days = cal.weeks.flat().sort((a, b) => (a.date < b.date ? -1 : 1));
  let active = 0;
  let busiest = { count: 0, date: null };
  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.count > 0) {
      active++;
      run++;
      longest = Math.max(longest, run);
      if (d.count > busiest.count) busiest = d;
    } else run = 0;
  }
  // Current streak: today may still be empty (the day isn't over), so skip it.
  let current = 0;
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--;
  for (; i >= 0 && days[i].count > 0; i--) current++;

  return { total: cal.total, active, busiest, max: busiest.count, longest, current };
}

// ---------------------------------------------------------------- render ---

function render(cal, stats, { user, theme, title, animation }) {
  const T = THEMES[theme];
  const VW = 1200;
  const VH = 600;

  // Orthographic camera: rotate the grid by PHI around the vertical axis,
  // then look down at it from elevation EPS.
  const PHI = rad(47);
  const EPS = rad(28);
  const Wv = [Math.cos(PHI), Math.sin(PHI) * Math.sin(EPS)]; // +1 week on screen
  const Dv = [Math.sin(PHI), -Math.cos(PHI) * Math.sin(EPS)]; // +1 weekday on screen
  const Zs = Math.cos(EPS); // +1 unit of height on screen (upwards)
  const P = (x, y, z) => [x * Wv[0] + y * Dv[0], x * Wv[1] + y * Dv[1] - z * Zs];

  // Building sizes, in grid-cell units.
  const GAP = 0.14;
  const FLOOR_H = 0.14;
  const MIN_H = 0.45;
  const MAX_H = 7;
  const GAMMA = 0.62; // < 1 keeps one huge day from flattening the rest of the city
  const max = Math.max(1, stats.max);

  const cells = [];
  cal.weeks.forEach((week, w) =>
    week.forEach((day) => {
      const lit = day.count > 0;
      cells.push({
        w,
        d: day.weekday,
        h: lit ? MIN_H + (MAX_H - MIN_H) * (day.count / max) ** GAMMA : FLOOR_H,
        level: lit ? Math.max(1, day.level) : 0,
      });
    }),
  );

  // Painter's algorithm: farthest first. Depth grows with week and shrinks with weekday.
  const depth = (c) => c.w * Math.sin(PHI) - c.d * Math.cos(PHI);
  cells.sort((a, b) => depth(a) - depth(b));

  // Base plate under the whole grid.
  const nW = cal.weeks.length;
  const pad = 0.4;
  const plateH = 0.35;
  const [ax, ay, bx, by] = [-pad, -pad, nW + pad, 7 + pad];
  const plate = [
    ['pt', [P(ax, ay, 0), P(bx, ay, 0), P(bx, by, 0), P(ax, by, 0)]],
    ['pl', [P(ax, ay, -plateH), P(bx, ay, -plateH), P(bx, ay, 0), P(ax, ay, 0)]],
    ['pr', [P(bx, ay, -plateH), P(bx, by, -plateH), P(bx, by, 0), P(bx, ay, 0)]],
  ];

  // Fit the city (plate + every building at full height) into the right-hand area of the card.
  const box = { x0: 380, x1: 1158, y0: 40, y1: 566 };
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const extend = ([x, y]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  plate.forEach(([, pts]) => pts.forEach(extend));
  for (const c of cells)
    for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      extend(P(c.w + dx, c.d + dy, 0));
      extend(P(c.w + dx, c.d + dy, c.h));
    }
  const s = Math.min((box.x1 - box.x0) / (maxX - minX), (box.y1 - box.y0) / (maxY - minY));
  const ox = box.x0 + (box.x1 - box.x0 - (maxX - minX) * s) / 2 - minX * s;
  const oy = box.y0 + (box.y1 - box.y0 - (maxY - minY) * s) / 2 - minY * s;
  const Q = (x, y, z) => {
    const [px, py] = P(x, y, z);
    return [px * s + ox, py * s + oy];
  };
  const f = (n) => +n.toFixed(1);
  const f2 = (n) => +n.toFixed(2);
  const d = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;

  // Animation timing (seconds).
  const animated = animation !== 'none';
  const RISE = 0.9; // how long one building takes to rise
  const SQUASH = 0.4; // lowest point of the wave, as a fraction of full height
  const riseDelay = (c) => 0.2 + c.w * 0.03 + c.d * 0.02;
  const riseEnd = riseDelay({ w: nW - 1, d: 6 }) + RISE;
  const rand = mulberry32(nW * 7 + stats.total);

  // A wall with vertical sides is a rectangle under a vertical shear. Drawing it that way
  // (base edge at local 0,0) lets CSS stretch it with scaleY while its slanted base stays put.
  const wall = (p0, p1, H, cls) =>
    `<g transform="matrix(1 ${+((p1[1] - p0[1]) / (p1[0] - p0[0])).toFixed(4)} 0 1 ${f(p0[0])} ${f(p0[1])})">` +
    `<path class="${cls} w" d="M0 0H${f(p1[0] - p0[0])}V${f(-H)}H0Z"/></g>`;

  const city = plate.map(([cls, pts]) => `<path class="${cls}" d="${d(pts)}"/>`);
  for (const c of cells) {
    const x0 = c.w + GAP / 2;
    const x1 = c.w + 1 - GAP / 2;
    const y0 = c.d + GAP / 2;
    const y1 = c.d + 1 - GAP / 2;
    const h = c.h;
    const L = c.level;
    const roof = d([Q(x0, y0, h), Q(x1, y0, h), Q(x1, y1, h), Q(x0, y1, h)]);

    if (!animated || L === 0) {
      // Static block: empty days are flat floor tiles and never move.
      city.push(
        `<path class="l${L}" d="${d([Q(x0, y0, 0), Q(x1, y0, 0), Q(x1, y0, h), Q(x0, y0, h)])}"/>` +
          `<path class="r${L}" d="${d([Q(x1, y0, 0), Q(x1, y1, 0), Q(x1, y1, h), Q(x1, y0, h)])}"/>` +
          `<path class="t${L}" d="${roof}"/>`,
      );
      continue;
    }

    const H = h * Zs * s; // full height on screen
    const [A, B, C] = [Q(x0, y0, 0), Q(x1, y0, 0), Q(x1, y1, 0)];
    let vars = `--h:${f(H)}px;--r:${f2(riseDelay(c))}s`;
    if (animation === 'wave') vars += `;--d:${f2(riseEnd + c.w * 0.07 + c.d * 0.035)}s`;
    if (animation === 'equalizer') vars += `;--d:${f2(riseEnd + rand() * 2)}s;--du:${f2(1.3 + rand() * 1.5)}s`;
    city.push(
      `<g class="b" style="${vars}">${wall(A, B, H, `l${L}`)}${wall(B, C, H, `r${L}`)}` +
        `<path class="t${L} tp" d="${roof}"/></g>`,
    );
  }

  // Face colours: roof lightest, front wall = base, right wall darker.
  const css = [];
  T.levels.forEach((base, i) => {
    const roof = mix(base, '#ffffff', i === 0 ? 0.06 : 0.16);
    const right = mix(base, '#000000', 0.26);
    css.push(`.t${i}{fill:${roof};stroke:${roof}}.l${i}{fill:${base};stroke:${base}}.r${i}{fill:${right};stroke:${right}}`);
  });
  const base = mix(T.levels[0], '#000000', 0.18);
  css.push(`.pt{fill:${base};stroke:${base}}.pl{fill:${mix(base, '#000000', 0.12)}}.pr{fill:${mix(base, '#000000', 0.3)}}`);

  // Motion. Walls stretch (scale) from their base; roofs move (translate) by the matching
  // distance, so they always meet. Rise uses the separate scale/translate properties and the
  // loop uses transform, so the two animations stack instead of overriding each other.
  if (animated) {
    const pop = 'cubic-bezier(.34,1.56,.64,1)';
    const loop = animation !== 'rise';
    css.push(
      `.w{transform-origin:0 0;vector-effect:non-scaling-stroke}`,
      `@keyframes cc-rw{from{scale:1 .001}to{scale:1 1}}`,
      `@keyframes cc-rt{from{translate:0 var(--h)}to{translate:0 0}}`,
      `@keyframes cc-lw{0%,100%{transform:scaleY(1)}50%{transform:scaleY(${SQUASH})}}`,
      `@keyframes cc-lt{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(var(--h) * ${1 - SQUASH}))}}`,
      `.b .w{animation:cc-rw ${RISE}s ${pop} var(--r) both${loop ? ',cc-lw var(--du,3.6s) ease-in-out var(--d) infinite' : ''}}`,
      `.b .tp{animation:cc-rt ${RISE}s ${pop} var(--r) both${loop ? ',cc-lt var(--du,3.6s) ease-in-out var(--d) infinite' : ''}}`,
      `@media (prefers-reduced-motion:reduce){.b *{animation:none!important}}`,
    );
  }

  // Text.
  const stat = (y, value, label) =>
    `<text x="64" y="${y}" class="stat"><tspan class="val">${value}</tspan> ${label}</text>`;
  const plural = (n, word) => `${word}${n === 1 ? '' : 's'}`;
  const updated = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  const sans = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif`;
  const mono = `ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="${VW}" height="${VH}" role="img" aria-labelledby="cc-title cc-desc">
<title id="cc-title">${esc(title)} — @${esc(user)}</title>
<desc id="cc-desc">${stats.total.toLocaleString('en-US')} contributions in the last year, ${stats.active} active days, busiest day ${stats.max}, longest streak ${stats.longest} days.</desc>
<defs>
<linearGradient id="cc-bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${T.bg[0]}"/><stop offset=".55" stop-color="${T.bg[1]}"/><stop offset="1" stop-color="${T.bg[2]}"/>
</linearGradient>
<radialGradient id="cc-glow" cx="770" cy="330" r="430" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${T.accent}" stop-opacity=".10"/><stop offset="1" stop-color="${T.accent}" stop-opacity="0"/>
</radialGradient>
</defs>
<style>
text{font-family:${sans}}
.mono{font-family:${mono}}
.eyebrow{font-size:15px;font-weight:700;letter-spacing:4.5px;fill:${T.accent}}
.big{font-size:68px;font-weight:800;letter-spacing:-1.5px;fill:${T.text}}
.sub{font-size:19px;font-weight:600;fill:${T.sub}}
.stat{font-size:17px;font-weight:500;fill:${T.muted}}
.val{font-weight:700;fill:${T.sub}}
.handle{font-size:17px;fill:${T.sub}}
.foot{font-size:13px;fill:${T.muted};opacity:.85}
path{stroke-width:.6;stroke-linejoin:round}
${css.join('\n')}
</style>
<rect x="1.5" y="1.5" width="${VW - 3}" height="${VH - 3}" rx="28" fill="url(#cc-bg)" stroke="${T.border}" stroke-opacity=".75" stroke-width="2"/>
<rect x="1.5" y="1.5" width="${VW - 3}" height="${VH - 3}" rx="28" fill="url(#cc-glow)"/>
<g>${city.join('')}</g>
<text x="64" y="98" class="eyebrow mono">${esc(title.toUpperCase())}</text>
<text x="64" y="172" class="big">${compact(stats.total)}</text>
<text x="64" y="208" class="sub">contributions in the last year</text>
${stat(262, stats.active, plural(stats.active, 'active day'))}
${stat(292, stats.max, 'on the busiest day')}
${stat(322, `${stats.longest}-day`, 'longest streak')}
${stat(352, `${stats.current}-day`, 'current streak')}
<text x="64" y="536" class="handle mono">@${esc(user)}</text>
<text x="64" y="562" class="foot">Updated ${updated}</text>
</svg>
`;
}

// --------------------------------------------------------------- helpers ---

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

function compact(n) {
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return String(n);
}
function trim(x) {
  return (x >= 100 ? x.toFixed(0) : x.toFixed(1)).replace(/\.0$/, '');
}

function rad(deg) {
  return (deg * Math.PI) / 180;
}

function mix(a, b, t) {
  const pa = hex(a);
  const pb = hex(b);
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
