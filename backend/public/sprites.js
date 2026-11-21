// Tiny pixel-art sprites drawn as SVG rectangles (crisp at any size).
// Each sprite is rows of characters; each character maps to a colour.

export function sprite(rows, palette, size = 4, label = '') {
  const w = rows[0].length;
  const h = rows.length;
  let rects = '';
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const c = palette[ch];
      if (c) rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`;
    });
  });
  return `<svg class="sprite" viewBox="0 0 ${w} ${h}" width="${w * size}" height="${h * size}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${rects}</svg>`;
}

const FACE = [
  '...hhhhhh...',
  '..hhhhhhhh..',
  '..hhhhhhhh..',
  '..hssssssh..',
  '..sbssssbs..',
  '..ssssssss..',
  '..sssmmsss..',
  '...ssssss...',
  '....ssss....',
  '..cccccccc..',
  '.cccccccccc.',
  '.cccccccccc.',
];

function withLongHair(rows) {
  return rows.map((r, y) => (y >= 2 && y <= 8 ? `${r[0]}h${r.slice(2, 10)}h${r[11]}` : r));
}
function withGlasses(rows) {
  return rows.map((r, y) => (y === 4 ? '..gbgssgbg..' : r));
}
function withBeard(rows) {
  return rows.map((r, y) => (y === 6 ? '..hhhmmhhh..' : y === 7 ? '...hhhhhh...' : r));
}

const SENIORS = {
  'ux-designer': { rows: withLongHair(FACE), pal: { h: '#2b1b17', s: '#c68863', b: '#15172b', m: '#8a3b3b', c: '#ff6f91' } },
  'forensic-accountant': { rows: withGlasses(FACE), pal: { h: '#1a1a1a', s: '#a86b4c', b: '#15172b', m: '#6b2f2f', c: '#52c7ea', g: '#ffcb47' } },
  'urban-planner': { rows: withBeard(FACE), pal: { h: '#3a2a20', s: '#b57a55', b: '#15172b', m: '#6b2f2f', c: '#5ed68f' } },
  architect: { rows: FACE, pal: { h: '#22201c', s: '#8d5a3b', b: '#15172b', m: '#5a2525', c: '#ff9f43' } },
  student: { rows: withLongHair(FACE), pal: { h: '#3b2416', s: '#c99271', b: '#15172b', m: '#8a3b3b', c: '#ffcb47' } },
  parent: { rows: withLongHair(FACE), pal: { h: '#5a5a6e', s: '#b98566', b: '#15172b', m: '#8a3b3b', c: '#52c7ea' } },
  school: { rows: withGlasses(withLongHair(FACE)), pal: { h: '#1f1f2b', s: '#b07b58', b: '#15172b', m: '#8a3b3b', c: '#5ed68f', g: '#f4efe1' } },
};

export const avatar = (key, size = 5, label = '') => {
  const s = SENIORS[key] || SENIORS.student;
  return sprite(s.rows, s.pal, size, label);
};

export const arrowLogo = (size = 4) => sprite(
  ['...y...', '..yyy..', '.yyyyy.', 'yyyyyyy', '...y...', '...y...', '...y...'],
  { y: '#ffcb47' }, size, 'Disha',
);

export const chest = (open = false, size = 5) => sprite(
  open
    ? ['.kkkkkk.', 'kyyyyyyk', 'k......k', 'kkkyykkk', 'kbbyybbk', 'kbbbbbbk', 'kkkkkkkk']
    : ['.kkkkkk.', 'kbbbbbbk', 'kbbbbbbk', 'kkkyykkk', 'kbbyybbk', 'kbbbbbbk', 'kkkkkkkk'],
  { k: '#0a0b18', y: '#ffcb47', b: '#a0612e' }, size, open ? 'Open bonus chest' : 'Bonus chest',
);

export const star = (on = true, size = 4) => sprite(
  ['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', 'y.....y'],
  { y: on ? '#ffcb47' : '#4b5190' }, size,
);

export const trophy = (size = 5) => sprite(
  ['yyyyyyy', 'y.yyy.y', 'y.yyy.y', '.yyyyy.', '..yyy..', '...y...', '..ddd..', '.ddddd.'],
  { y: '#ffcb47', d: '#a0612e' }, size, 'Trophy',
);
