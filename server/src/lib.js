const crypto = require('node:crypto');
const mongoose = require('mongoose');
const M = require('./models');
const id = (value) => {
  const result = value == null ? '' : String(value._id || (typeof value.id === 'string' ? value.id : value));
  return /^[a-f0-9]{24}$/i.test(result) ? result.toLowerCase() : result;
};
const eq = (a, b) => Boolean(a && b && id(a) === id(b));
const fail = (status, message, code = 'REQUEST_FAILED') => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
};
const objectId = (value) => {
  if (
    !(typeof value === 'string' || value instanceof mongoose.Types.ObjectId) ||
    !mongoose.isValidObjectId(value)
  )
    fail(400, 'Invalid identifier.', 'VALIDATION');
  return value;
};
const text = (value, name, min = 0, max = 1000) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    fail(400, `${name} must contain ${min}–${max} characters.`, 'VALIDATION');
  return value.trim();
};
const strings = (value, name, max = 10) => {
  if (!Array.isArray(value) || value.length > max)
    fail(400, `${name} must be a list of at most ${max} items.`, 'VALIDATION');
  return [...new Set(value.map((v) => text(v, name, 1, 40)))];
};
const choice = (value, choices, name) => {
  if (!choices.includes(value)) fail(400, `Invalid ${name}.`, 'VALIDATION');
  return value;
};
const url = (value, name) => {
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(400, `Invalid ${name}.`, 'VALIDATION');
  }
  if (
    !['https:', 'http:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    value.length > 500
  )
    fail(400, `Invalid ${name}.`, 'VALIDATION');
  return parsed.href;
};
const slug = (title) =>
  `${
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 55) || 'item'
  }-${crypto.randomBytes(3).toString('hex')}`;
const pair = (a, b) => [id(a), id(b)].sort().join(':');
const ok = (res, data, status = 200) => res.status(status).json({ data });
const requireUser = (req) => {
  if (!req.user) fail(401, 'Please sign in to continue.', 'UNAUTHENTICATED');
  return req.user;
};
const guardDemo = (req, record) => {
  if (req.user?.isDemo && (!record || record.seedKey))
    fail(403, 'Demo accounts cannot change curated records or account settings.', 'DEMO_RESTRICTED');
};
const safeRegex = (value) =>
  String(value || '')
    .slice(0, 120)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const userJSON = (user, viewer) => {
  if (!user) return null;
  const result = {
    id: id(user),
    name: user.name,
    username: user.username,
    bio: user.bio || '',
    skills: user.skills || [],
    avatarUrl: user.avatarUrl || '',
    githubUrl: user.githubUrl || '',
    portfolioUrl: user.portfolioUrl || '',
    role: user.role,
    isDemo: Boolean(user.isDemo),
  };
  if (eq(user, viewer)) {
    result.email = user.email;
    result.emailVerified = Boolean(user.emailVerified);
  }
  return result;
};
async function buildContext(req) {
  const uid = req.user?._id;
  const [blocks, friendships, memberships, follows] = uid
    ? await Promise.all([
        M.Block.find({ $or: [{ from: uid }, { to: uid }] }).lean(),
        M.Friendship.find({ status: 'accepted', $or: [{ requester: uid }, { recipient: uid }] }).lean(),
        M.Membership.find({ user: uid, status: 'active' }).lean(),
        M.Follow.find({ from: uid }).lean(),
      ])
    : [[], [], [], []];
  return {
    uid,
    blocked: new Set(blocks.map((b) => id(eq(b.from, uid) ? b.to : b.from))),
    friends: new Set(friendships.map((f) => id(eq(f.requester, uid) ? f.recipient : f.requester))),
    memberships: new Map(memberships.map((m) => [id(m.group), m.role])),
    following: new Set(follows.map((f) => id(f.to))),
    groups: new Map(),
  };
}
async function context(req) {
  if (!req.acl) req.acl = await buildContext(req);
  return req.acl;
}
async function groupFor(req, value) {
  if (!value) return null;
  if (value.name) return value;
  const ctx = await context(req);
  const key = id(value);
  if (!ctx.groups.has(key)) ctx.groups.set(key, await M.Group.findById(key).lean());
  return ctx.groups.get(key);
}
async function groupRole(req, group) {
  const ctx = await context(req);
  return ctx.memberships.get(id(group)) || null;
}
async function canModerate(req, post) {
  if (!req.user) return false;
  if (post.group) return ['owner', 'moderator'].includes(await groupRole(req, post.group));
  return false;
}
async function canRead(req, post) {
  if (!post || post.deleted || !post.author || post.author.disabled) return false;
  const ctx = await context(req);
  const group = post.group ? await groupFor(req, post.group) : null;
  if (post.group && (!group || group.archived)) return false;
  const moderator = group && ['owner', 'moderator'].includes(ctx.memberships.get(id(group)));
  if (ctx.blocked.has(id(post.author)) && !moderator) return false;
  if (post.visibility === 'group')
    return Boolean(group && (group.visibility === 'public' || ctx.memberships.has(id(group))));
  if (post.visibility === 'friends') return eq(post.author, ctx.uid) || ctx.friends.has(id(post.author));
  return true;
}
async function canInteract(req, post) {
  requireUser(req);
  const ctx = await context(req);
  if (!(await canRead(req, post)) || ctx.blocked.has(id(post.author))) return false;
  return !post.group || ctx.memberships.has(id(post.group));
}
async function readablePost(req, value) {
  objectId(value);
  const post = await M.Post.findById(value).populate('author group project media');
  if (!(await canRead(req, post))) fail(404, 'Post not found.', 'NOT_FOUND');
  return post;
}
async function targetUser(req, value, { allowBlocked = false } = {}) {
  requireUser(req);
  objectId(value);
  if (eq(value, req.user)) fail(400, 'This action requires another person.', 'VALIDATION');
  const user = await M.User.findById(value);
  if (!user || user.disabled || (!allowBlocked && (await context(req)).blocked.has(id(user))))
    fail(404, 'User not found.', 'NOT_FOUND');
  return user;
}
async function notify(req, { user, kind, post, comment, group, key }) {
  if (!user || !req.user || eq(user, req.user)) return;
  if (
    await M.Block.exists({
      $or: [
        { from: req.user._id, to: user },
        { from: user, to: req.user._id },
      ],
    })
  )
    return;
  const dedupeKey = key || `${kind}:${id(req.user)}:${id(user)}:${id(post)}:${id(comment)}:${id(group)}`;
  const entry = await M.Notification.findOneAndUpdate(
    { dedupeKey },
    {
      $setOnInsert: {
        user,
        actor: req.user._id,
        kind,
        post: post || undefined,
        comment: comment || undefined,
        group: group || undefined,
      },
    },
    { upsert: true, new: true },
  );
  if (req.app.locals.emitNotification) {
    try {
      await req.app.locals.emitNotification(id(user), id(entry));
    } catch {
      req.app.locals.logger.error('Notification delivery was interrupted.');
    }
  }
}
async function postJSON(req, post) {
  const group = post.group ? await groupFor(req, post.group) : null;
  const ctx = await context(req);
  const [likeCount, comments, liked, saved] = await Promise.all([
    M.Like.countDocuments({ targetType: 'post', target: post._id }),
    M.Comment.find({ post: post._id, deleted: false }).select('author').lean(),
    req.user ? M.Like.exists({ user: req.user._id, targetType: 'post', target: post._id }) : false,
    req.user ? M.Save.exists({ user: req.user._id, post: post._id }) : false,
  ]);
  return {
    id: id(post),
    author: userJSON(post.author, req.user),
    type: post.type,
    title: post.title,
    body: post.body,
    tags: post.tags || [],
    images: (post.media || []).map((m) => ({ id: id(m), url: `/api/v1/media/${id(m)}` })),
    visibility: post.visibility,
    group: group ? { id: id(group), name: group.name, slug: group.slug, visibility: group.visibility } : null,
    project:
      post.project && !post.project.deleted && post.project.title
        ? { id: id(post.project), title: post.project.title, slug: post.project.slug }
        : null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    status: post.status,
    solutionCommentId: post.solutionComment ? id(post.solutionComment) : null,
    likeCount,
    commentCount: comments.filter((c) => !ctx.blocked.has(id(c.author))).length,
    liked: Boolean(liked),
    saved: Boolean(saved),
    canEdit: eq(post.author, req.user) && !(req.user?.isDemo && post.seedKey),
    canModerate: (await canModerate(req, post)) && !(req.user?.isDemo && post.seedKey),
  };
}
async function commentJSON(req, comment, post) {
  const [likeCount, liked] = await Promise.all([
    M.Like.countDocuments({ targetType: 'comment', target: comment._id }),
    req.user ? M.Like.exists({ user: req.user._id, targetType: 'comment', target: comment._id }) : false,
  ]);
  return {
    id: id(comment),
    author: userJSON(comment.author, req.user),
    body: comment.body,
    parentId: comment.parent ? id(comment.parent) : null,
    createdAt: comment.createdAt,
    likeCount,
    liked: Boolean(liked),
    canEdit: eq(comment.author, req.user) && !(req.user?.isDemo && comment.seedKey),
    canModerate: (await canModerate(req, post)) && !(req.user?.isDemo && comment.seedKey),
    isSolution: eq(comment, post.solutionComment),
  };
}
async function groupJSON(req, group) {
  const membership = req.user
    ? await M.Membership.findOne({ group: group._id, user: req.user._id }).lean()
    : null;
  const memberCount = await M.Membership.countDocuments({ group: group._id, status: 'active' });
  const role = membership?.status === 'active' ? membership.role : membership ? 'pending' : 'none';
  return {
    id: id(group),
    name: group.name,
    slug: group.slug,
    description: group.description,
    rules: group.rules,
    visibility: group.visibility,
    memberCount,
    membership: role,
    canModerate: ['owner', 'moderator'].includes(role) && !(req.user?.isDemo && group.seedKey),
    canRead: group.visibility === 'public' || membership?.status === 'active',
    ownerId: id(group.owner),
  };
}
const projectJSON = (req, project) => ({
  id: id(project),
  title: project.title,
  slug: project.slug,
  description: project.description,
  stack: project.stack || [],
  githubUrl: project.githubUrl || '',
  liveUrl: project.liveUrl || '',
  images: (project.media || []).map((media) => ({ id: id(media), url: `/api/v1/media/${id(media)}` })),
  owner: userJSON(project.owner, req.user),
  createdAt: project.createdAt,
  canEdit: eq(project.owner, req.user) && !(req.user?.isDemo && project.seedKey),
});
async function paginated(req, Model, filter, populate, permitted, serialize) {
  const size = 20;
  const items = [];
  let nextCursor = null;
  let cursor = null;
  let lastAccepted = null;
  const encode = (doc) =>
    Buffer.from(JSON.stringify({ id: id(doc), date: doc.createdAt.toISOString() })).toString('base64url');
  if (req.query.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(String(req.query.cursor), 'base64url').toString());
      objectId(parsed.id);
      const date = new Date(parsed.date);
      if (!Number.isFinite(date.getTime())) throw new Error('date');
      cursor = { id: parsed.id, date };
    } catch {
      fail(400, 'Invalid page cursor.', 'VALIDATION');
    }
  }
  for (let batch = 0; batch < 100; batch++) {
    const query = cursor
      ? {
          $and: [
            filter,
            {
              $or: [{ createdAt: { $lt: cursor.date } }, { createdAt: cursor.date, _id: { $lt: cursor.id } }],
            },
          ],
        }
      : filter;
    const docs = await Model.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .populate(populate || '');
    if (!docs.length) break;
    for (const doc of docs) {
      if (!(await permitted(doc))) continue;
      if (items.length === size) {
        nextCursor = encode(lastAccepted);
        return { items, nextCursor };
      }
      items.push(await serialize(doc));
      lastAccepted = doc;
    }
    const last = docs[docs.length - 1];
    cursor = { id: id(last), date: last.createdAt };
    if (docs.length < 50) break;
  }
  return { items, nextCursor };
}
module.exports = {
  M,
  id,
  eq,
  fail,
  objectId,
  text,
  strings,
  choice,
  url,
  slug,
  pair,
  ok,
  requireUser,
  guardDemo,
  safeRegex,
  route,
  userJSON,
  context,
  groupFor,
  groupRole,
  canModerate,
  canRead,
  canInteract,
  readablePost,
  targetUser,
  notify,
  postJSON,
  commentJSON,
  groupJSON,
  projectJSON,
  paginated,
};
