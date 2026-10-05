const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../client/public/avatars');
fs.mkdirSync(dir, { recursive: true });
const colors = [
  ['#e3eee9', '#314b40', '#8ebaa1'],
  ['#eeebf9', '#514667', '#b2a2d0'],
  ['#f9e9de', '#68472d', '#daa885'],
  ['#e2edf7', '#304c66', '#99b9d4'],
  ['#f6e5eb', '#683c50', '#cd99b0'],
];
const skins = ['#edbe99', '#d69870', '#a8694c', '#704a35', '#f2cfb1'];
for (let i = 1; i <= 40; i++) {
  const [bg, shirt, hair] = colors[(i - 1) % colors.length];
  const skin = skins[Math.floor((i - 1) / 3) % skins.length];
  const glasses =
    i % 4 === 0
      ? '<path d="M33 45h14v9H33zm20 0h14v9H53zM47 49h6" fill="none" stroke="#333" stroke-width="2"/>'
      : '';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="' +
    bg +
    '"/><path d="M15 100v-9c0-25 17-33 35-33s35 8 35 33v9" fill="' +
    shirt +
    '"/><rect x="42" y="56" width="16" height="21" rx="8" fill="' +
    skin +
    '"/><ellipse cx="50" cy="43" rx="23" ry="28" fill="' +
    skin +
    '"/><path d="M27 45C17 15 40 8 52 12c26-4 31 19 23 38-5-8-7-15-8-23-12 10-26 9-34 3l-6 15" fill="' +
    (i % 2 ? '#3d302d' : hair) +
    '"/><circle cx="41" cy="46" r="2" fill="#352b29"/><circle cx="59" cy="46" r="2" fill="#352b29"/><path d="M43 59q7 5 14 0" stroke="#8f5042" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    glasses +
    '</svg>';
  fs.writeFileSync(path.join(dir, 'avatar-' + i + '.svg'), svg);
}
console.log('Generated 40 original SVG demo avatars.');
