const path = require('node:path');
const fs = require('node:fs/promises');
const sharp = require('sharp');
const { Media } = require('../src/models');

// Original vector artwork for fictional projects, not screenshots of real products.
async function writeDemoPreview({ mediaId, seedKey, owner, post = null, project = null, label, index = 0 }) {
  const mediaDir = process.env.LOCAL_MEDIA_DIR || path.resolve(__dirname, '../../.local/uploads');
  const escaped = label.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char],
  );
  const palette = [
    ['#edf1ff', '#142249', '#345bff'],
    ['#eef6f4', '#183b34', '#498b7a'],
    ['#f2effa', '#302943', '#8d77b4'],
    ['#eef3fa', '#243b55', '#668bc5'],
  ][index % 4];
  const [background, ink, accent] = palette;
  const svg = `<svg width="1080" height="520" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="520" fill="${background}"/>
    <circle cx="1010" cy="60" r="240" fill="${accent}" opacity=".05"/>
    <circle cx="990" cy="510" r="210" fill="${accent}" opacity=".06"/>
    <text x="64" y="72" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="${accent}" letter-spacing="3">A WORK IN PROGRESS</text>
    <text x="62" y="156" font-family="Arial,sans-serif" font-size="51" font-weight="700" fill="${ink}">${escaped}</text>
    <text x="64" y="202" font-family="Arial,sans-serif" font-size="21" fill="${ink}" opacity=".65">From a small idea to something useful.</text>
    <rect x="64" y="258" width="626" height="207" rx="8" fill="white"/>
    <circle cx="89" cy="282" r="4" fill="${accent}" opacity=".3"/>
    <circle cx="103" cy="282" r="4" fill="${accent}" opacity=".3"/>
    <circle cx="117" cy="282" r="4" fill="${accent}" opacity=".3"/>
    <rect x="84" y="307" width="166" height="137" rx="4" fill="${background}"/>
    <rect x="103" y="328" width="103" height="10" rx="2" fill="${accent}" opacity=".6"/>
    <rect x="103" y="354" width="123" height="6" rx="2" fill="${accent}" opacity=".2"/>
    <rect x="103" y="373" width="109" height="6" rx="2" fill="${accent}" opacity=".2"/>
    <rect x="103" y="392" width="113" height="6" rx="2" fill="${accent}" opacity=".2"/>
    <rect x="271" y="311" width="229" height="12" rx="2" fill="${ink}" opacity=".75"/>
    <rect x="271" y="338" width="391" height="7" rx="2" fill="${ink}" opacity=".12"/>
    <rect x="271" y="355" width="324" height="7" rx="2" fill="${ink}" opacity=".12"/>
    <rect x="271" y="384" width="186" height="60" rx="3" fill="${background}"/>
    <rect x="475" y="384" width="187" height="60" rx="3" fill="${background}"/>
    <path d="M811 298h36c35 0 35 52 0 52h-16v34h-20zm20 18v17h15c11 0 11-17 0-17z" fill="${accent}"/>
    <text x="777" y="426" font-family="Arial,sans-serif" font-size="29" font-weight="700" fill="${ink}">Pitchers.</text>
    <text x="64" y="497" font-family="Arial,sans-serif" font-size="12" fill="${ink}" opacity=".45">FICTIONAL PROJECT · DEMO ARTWORK</text>
  </svg>`;
  const bytes = await sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer();
  let storage = 'local',
    storageKey = `${mediaId}.webp`;
  if (process.env.UPLOADS_MODE === 'cloudinary') {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const result = await new Promise((resolve, reject) =>
      cloudinary.uploader
        .upload_stream(
          { type: 'authenticated', public_id: `codeial/demo/${mediaId}`, resource_type: 'image' },
          (error, value) => (error ? reject(error) : resolve(value)),
        )
        .end(bytes),
    );
    storage = 'cloudinary';
    storageKey = result.public_id;
  } else {
    await fs.mkdir(mediaDir, { recursive: true });
    await fs.writeFile(path.join(mediaDir, storageKey), bytes);
  }
  const existing = await Media.findById(mediaId);
  if (existing && existing.seedKey !== seedKey)
    throw new Error('Refusing to overwrite media outside the demo dataset.');
  await Media.updateOne(
    { _id: mediaId },
    {
      $set: {
        owner,
        post,
        project,
        storage,
        storageKey,
        mimeType: 'image/webp',
        width: 1080,
        height: 520,
        size: bytes.length,
        seedKey,
      },
    },
    { upsert: true },
  );
  return mediaId;
}
module.exports = { writeDemoPreview };
