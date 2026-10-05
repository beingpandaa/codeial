const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const mongoose = require('mongoose');
const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const { rateLimit } = require('express-rate-limit');
const { M, id, eq, fail, objectId, ok, requireUser, guardDemo, route, canRead, context } = require('./lib');
async function streamImage(source, response) {
  try {
    await pipeline(source, response);
  } catch (error) {
    // Navigation can cancel lazy images after authorization while bytes are streaming.
    if (
      response.destroyed &&
      ['ERR_STREAM_PREMATURE_CLOSE', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_CANNOT_PIPE'].includes(error.code)
    )
      return;
    throw error;
  }
}
function mediaRoutes(router) {
  const activeUploads = new Set();
  const byteQuota = 100 * 1024 * 1024;
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: (req) => (req.app.locals.options.testing ? 1000 : 40),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'Too many uploads. Please try again later.', code: 'RATE_LIMITED' } },
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
    fileFilter: (req, file, cb) =>
      cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.mimetype)),
  });
  router.post(
    '/media',
    uploadLimiter,
    route(async (req, res, next) => {
      requireUser(req);
      const key = id(req.user);
      if (activeUploads.has(key)) fail(409, 'Please wait for your current upload to finish.', 'UPLOAD_BUSY');
      activeUploads.add(key);
      const release = () => activeUploads.delete(key);
      res.once('finish', release);
      res.once('close', release);
      const [usage, pending] = await Promise.all([
        M.Media.aggregate([
          { $match: { owner: req.user._id } },
          { $group: { _id: null, bytes: { $sum: '$size' } } },
        ]),
        M.Media.find({ owner: req.user._id, post: null, project: null }).select('_id').lean(),
      ]);
      req.mediaBytesUsed = usage[0]?.bytes || 0;
      if (
        req.mediaBytesUsed >= byteQuota ||
        pending.filter((m) => req.user.avatarUrl !== `/api/v1/media/${id(m)}`).length >= 10
      )
        fail(
          413,
          'Your upload allowance is full. Remove unused images before uploading more.',
          'UPLOAD_QUOTA',
        );
      next();
    }),
    upload.single('image'),
    route(async (req, res) => {
      if (!req.file) fail(400, 'Upload a JPEG, PNG, WebP or AVIF image under 5 MB.', 'VALIDATION');
      let buffer;
      let metadata;
      try {
        const image = sharp(req.file.buffer, { limitInputPixels: 25_000_000, animated: false });
        metadata = await image.metadata();
        if (!['jpeg', 'png', 'webp', 'avif', 'heif'].includes(metadata.format))
          fail(400, 'Unsupported image format.', 'VALIDATION');
        buffer = await image
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        metadata = await sharp(buffer).metadata();
      } catch {
        fail(400, 'This image could not be processed. Use a smaller valid image.', 'INVALID_IMAGE');
      }
      if (req.mediaBytesUsed + buffer.length > byteQuota)
        fail(413, 'This image exceeds your upload allowance.', 'UPLOAD_QUOTA');
      const mediaId = new mongoose.Types.ObjectId();
      const options = req.app.locals.options;
      let storageKey;
      if (options.uploadsMode === 'local') {
        storageKey = `${mediaId}.webp`;
        await fs.mkdir(options.localMediaDir, { recursive: true });
        await fs.writeFile(path.join(options.localMediaDir, storageKey), buffer, { flag: 'wx' });
      } else {
        cloudinary.config({ secure: true });
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              resource_type: 'image',
              type: 'authenticated',
              public_id: `codeial/${mediaId}`,
              format: 'webp',
              overwrite: false,
            },
            (error, result) => (error ? reject(error) : resolve(result)),
          );
          stream.end(buffer);
        });
        storageKey = result.public_id;
      }
      await M.Media.create({
        _id: mediaId,
        owner: req.user._id,
        storage: options.uploadsMode,
        storageKey,
        mimeType: 'image/webp',
        width: metadata.width,
        height: metadata.height,
        size: buffer.length,
      });
      ok(res, { id: String(mediaId), url: `/api/v1/media/${mediaId}` }, 201);
    }),
  );
  router.delete(
    '/media/:id',
    route(async (req, res) => {
      requireUser(req);
      objectId(req.params.id);
      if (req.user.avatarUrl === `/api/v1/media/${id(req.params.id)}`)
        fail(409, 'Choose another avatar before removing this image.', 'MEDIA_IN_USE');
      const candidate = await M.Media.findOne({
        _id: req.params.id,
        owner: req.user._id,
        post: null,
        project: null,
        deleting: { $ne: true },
      });
      if (!candidate) fail(404, 'Unused image not found.', 'NOT_FOUND');
      guardDemo(req, candidate);
      const media = await M.Media.findOneAndUpdate(
        { _id: candidate._id, post: null, project: null, deleting: { $ne: true } },
        { $set: { deleting: true } },
        { new: true },
      );
      if (!media) fail(409, 'The image is already in use.', 'MEDIA_IN_USE');
      try {
        if (media.storage === 'local') {
          if (path.basename(media.storageKey) !== media.storageKey) throw new Error('Invalid storage key');
          await fs
            .unlink(path.join(req.app.locals.options.localMediaDir, media.storageKey))
            .catch((error) => {
              if (error.code !== 'ENOENT') throw error;
            });
        } else {
          const result = await cloudinary.uploader.destroy(media.storageKey, {
            type: 'authenticated',
            resource_type: 'image',
            invalidate: true,
          });
          if (!['ok', 'not found'].includes(result.result)) throw new Error('Image removal failed');
        }
        await M.Media.deleteOne({ _id: media._id, deleting: true });
      } catch {
        await M.Media.updateOne({ _id: media._id }, { $set: { deleting: false } });
        fail(503, 'Image removal is temporarily unavailable.', 'MEDIA_UNAVAILABLE');
      }
      ok(res, { deleted: true });
    }),
  );
  router.get(
    '/media/:id',
    route(async (req, res) => {
      objectId(req.params.id);
      const media = await M.Media.findById(req.params.id);
      if (!media || media.deleting) fail(404, 'Image not found.', 'NOT_FOUND');
      if (media.post && media.project) fail(404, 'Image not found.', 'NOT_FOUND');
      let allowed = false;
      if (media.post) {
        const post = await M.Post.findById(media.post).populate('author group');
        allowed = Boolean(
          post &&
          post.media.some((value) => eq(value, media)) &&
          post.author &&
          !post.author.disabled &&
          (await canRead(req, post)),
        );
      } else if (media.project) {
        const project = await M.Project.findById(media.project).populate('owner');
        allowed = Boolean(
          project &&
          !project.deleted &&
          project.media.some((value) => eq(value, media)) &&
          project.owner &&
          !project.owner.disabled &&
          !(await context(req)).blocked.has(id(project.owner)),
        );
      } else if (eq(media.owner, req.user)) allowed = true;
      else {
        const owner = await M.User.findOne({
          _id: media.owner,
          disabled: false,
          avatarUrl: `/api/v1/media/${id(media)}`,
        });
        allowed = Boolean(owner && !(await context(req)).blocked.has(id(owner)));
      }
      if (!allowed) fail(404, 'Image not found.', 'NOT_FOUND');
      res.set({
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Type': 'image/webp',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        Vary: 'Cookie',
      });
      if (media.storage === 'local') {
        if (path.basename(media.storageKey) !== media.storageKey) fail(404, 'Image not found.', 'NOT_FOUND');
        const file = path.resolve(req.app.locals.options.localMediaDir, media.storageKey);
        const { createReadStream } = require('node:fs');
        try {
          await fs.access(file);
        } catch {
          fail(404, 'Image not found.', 'NOT_FOUND');
        }
        await streamImage(createReadStream(file), res);
      } else {
        cloudinary.config({ secure: true });
        const source = cloudinary.url(media.storageKey, {
          type: 'authenticated',
          resource_type: 'image',
          format: 'webp',
          secure: true,
          sign_url: true,
        });
        const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok || !response.body)
          fail(502, 'Image delivery is temporarily unavailable.', 'MEDIA_UNAVAILABLE');
        await streamImage(Readable.fromWeb(response.body), res);
      }
    }),
  );
}
module.exports = { mediaRoutes };
