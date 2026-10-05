const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const destination = path.resolve(__dirname, '../client/public/brand');
const markPath = 'M12 58V6H34C47 6 55 13.5 55 26S47 46 34 46H25V58H12ZM25 18V34H33L41 26L33 18H25Z';
const symbol = (color) => '<path d="' + markPath + '" fill="' + color + '" fill-rule="evenodd"/>';
const svg = (w, h, body) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="' +
  w +
  '" height="' +
  h +
  '" viewBox="0 0 ' +
  w +
  ' ' +
  h +
  '">' +
  body +
  '</svg>';
async function main() {
  await fs.mkdir(destination, { recursive: true });
  const icon = svg(64, 64, symbol('#345DFF'));
  await fs.writeFile(path.join(destination, 'pitchers-mark.svg'), icon);
  await fs.writeFile(path.join(destination, 'pitchers-mark-mono.svg'), svg(64, 64, symbol('#111B35')));
  await fs.writeFile(path.join(destination, 'pitchers-mark-white.svg'), svg(64, 64, symbol('#FFFFFF')));
  await fs.writeFile(path.resolve(destination, '../favicon.svg'), icon);
  for (const [suffix, color] of [
    ['', '#111B35'],
    ['-dark', '#F5F7FF'],
  ]) {
    await fs.writeFile(
      path.join(destination, 'pitchers-wordmark' + suffix + '.svg'),
      svg(
        356,
        76,
        '<g transform="translate(0 6)">' +
          symbol('#345DFF') +
          '</g><text x="78" y="55" fill="' +
          color +
          '" font-family="Arial,Helvetica,sans-serif" font-size="55" font-weight="700" letter-spacing="-2">Pitchers</text>',
      ),
    );
  }
  await sharp(Buffer.from(icon))
    .resize(512, 512)
    .png()
    .toFile(path.join(destination, 'pitchers-mark-512.png'));
  await sharp(Buffer.from(icon))
    .resize(192, 192)
    .png()
    .toFile(path.join(destination, 'pitchers-mark-192.png'));
  const board = svg(
    1440,
    960,
    '<rect width="1440" height="960" fill="#F5F7FC"/><rect x="40" y="40" width="1360" height="520" rx="16" fill="#FFFFFF"/><text x="92" y="107" font-family="Arial,sans-serif" font-size="14" letter-spacing="3" fill="#74809B">PITCHERS / VISUAL IDENTITY</text>' +
      '<g transform="translate(318 203) scale(2.5)">' +
      symbol('#345DFF') +
      '</g><text x="507" y="326" font-family="Arial,Helvetica,sans-serif" font-size="104" font-weight="700" letter-spacing="-5" fill="#111B35">Pitchers</text><text x="507" y="379" font-family="Arial,sans-serif" font-size="25" letter-spacing=".2" fill="#6C7891">A community for developers moving ideas forward.</text>' +
      '<text x="92" y="515" font-family="Arial,sans-serif" font-size="16" fill="#74809B">A precise P. A forward-facing idea. Built to stay clear at every size.</text>' +
      '<rect x="40" y="588" width="850" height="332" rx="16" fill="#111B35"/><g transform="translate(112 692) scale(1.55)">' +
      symbol('#7592FF') +
      '</g><text x="235" y="764" font-family="Arial,sans-serif" font-size="67" font-weight="700" letter-spacing="-3" fill="#F5F7FF">Pitchers</text><text x="102" y="862" font-family="Arial,sans-serif" font-size="15" letter-spacing="2" fill="#9CAAC6">INK + ELECTRIC COBALT</text>' +
      '<rect x="918" y="588" width="482" height="332" rx="16" fill="#345DFF"/><g transform="translate(1016 672) scale(1.4)">' +
      symbol('#FFFFFF') +
      '</g><g transform="translate(1154 708) scale(.8)">' +
      symbol('#FFFFFF') +
      '</g><g transform="translate(1254 732) scale(.4)">' +
      symbol('#FFFFFF') +
      '</g><text x="969" y="862" font-family="Arial,sans-serif" font-size="15" letter-spacing="2" fill="#E3E9FF">ICON / 64 / 32 / 16</text>',
  );
  await fs.writeFile(path.join(destination, 'pitchers-identity.svg'), board);
  await sharp(Buffer.from(board)).png().toFile(path.join(destination, 'pitchers-identity.png'));
  const social = svg(
    1200,
    630,
    '<rect width="1200" height="630" fill="#111B35"/><circle cx="1060" cy="120" r="280" fill="#345DFF" opacity=".12"/><g transform="translate(112 155) scale(2)">' +
      symbol('#7894FF') +
      '</g><text x="280" y="255" font-family="Arial,sans-serif" font-size="90" font-weight="700" letter-spacing="-4" fill="#FFFFFF">Pitchers</text><text x="118" y="371" font-family="Arial,sans-serif" font-size="38" fill="#E5EBFF">Build in good company.</text><text x="118" y="435" font-family="Arial,sans-serif" font-size="24" fill="#A7B5D2">Share your progress. Learn something. Get unstuck.</text>',
  );
  await sharp(Buffer.from(social)).png().toFile(path.join(destination, 'pitchers-social.png'));
  console.log('Pitchers master SVGs, transparent PNG icons, and identity preview generated.');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
