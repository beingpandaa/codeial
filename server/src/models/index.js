const mongoose = require('mongoose');
const { Schema } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });
const requiredRef = (name) => ({ ...ref(name), required: true });
const make = (name, fields, indexes = []) => {
  const schema = new Schema(fields, { timestamps: true });
  for (const [keys, options] of indexes) schema.index(keys, options);
  return mongoose.models[name] || mongoose.model(name, schema);
};
const seed = { seedKey: { type: String, index: true, sparse: true } };
const User = make('User', {
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true, lowercase: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
  bio: { type: String, default: '' },
  skills: { type: [String], default: [] },
  avatarUrl: { type: String, default: '' },
  githubUrl: { type: String, default: '' },
  portfolioUrl: { type: String, default: '' },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isDemo: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },
  sessionVersion: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  ...seed,
});
const Group = make('Group', {
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  rules: { type: String, default: '' },
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  owner: requiredRef('User'),
  archived: { type: Boolean, default: false },
  ...seed,
});
const Membership = make(
  'Membership',
  {
    group: requiredRef('Group'),
    user: requiredRef('User'),
    role: { type: String, enum: ['owner', 'moderator', 'member'], default: 'member' },
    status: { type: String, enum: ['pending', 'active'], default: 'active' },
    ...seed,
  },
  [
    [{ group: 1, user: 1 }, { unique: true }],
    [{ user: 1, status: 1 }, {}],
  ],
);
const Project = make('Project', {
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  stack: [String],
  githubUrl: String,
  liveUrl: String,
  owner: requiredRef('User'),
  media: [{ ...ref('Media') }],
  deleted: { type: Boolean, default: false },
  ...seed,
});
const Post = make(
  'Post',
  {
    author: requiredRef('User'),
    type: { type: String, enum: ['build', 'learning', 'discussion', 'help'], default: 'discussion' },
    title: { type: String, required: true },
    body: { type: String, required: true },
    tags: [String],
    visibility: { type: String, enum: ['public', 'friends', 'group'], default: 'public' },
    group: { ...ref('Group'), default: null },
    project: { ...ref('Project'), default: null },
    media: [{ ...ref('Media') }],
    status: { type: String, enum: ['open', 'solved'], default: 'open' },
    solutionComment: { ...ref('Comment'), default: null },
    deleted: { type: Boolean, default: false },
    ...seed,
  },
  [
    [{ createdAt: -1, _id: -1 }, {}],
    [{ author: 1, createdAt: -1 }, {}],
    [{ group: 1, createdAt: -1 }, {}],
  ],
);
const Comment = make(
  'Comment',
  {
    post: requiredRef('Post'),
    author: requiredRef('User'),
    body: { type: String, required: true },
    parent: { ...ref('Comment'), default: null },
    deleted: { type: Boolean, default: false },
    ...seed,
  },
  [[{ post: 1, createdAt: 1 }, {}]],
);
const Follow = make('Follow', { from: requiredRef('User'), to: requiredRef('User'), ...seed }, [
  [{ from: 1, to: 1 }, { unique: true }],
]);
const Friendship = make('Friendship', {
  requester: requiredRef('User'),
  recipient: requiredRef('User'),
  pairKey: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
  ...seed,
});
const Block = make('Block', { from: requiredRef('User'), to: requiredRef('User'), ...seed }, [
  [{ from: 1, to: 1 }, { unique: true }],
]);
const Like = make(
  'Like',
  {
    user: requiredRef('User'),
    targetType: { type: String, enum: ['post', 'comment'], required: true },
    target: { type: Schema.Types.ObjectId, required: true },
    ...seed,
  },
  [[{ user: 1, targetType: 1, target: 1 }, { unique: true }]],
);
const Save = make('Save', { user: requiredRef('User'), post: requiredRef('Post'), ...seed }, [
  [{ user: 1, post: 1 }, { unique: true }],
]);
const Media = make('Media', {
  owner: requiredRef('User'),
  post: { ...ref('Post'), default: null },
  project: { ...ref('Project'), default: null },
  storage: { type: String, enum: ['local', 'cloudinary'], required: true },
  storageKey: { type: String, required: true },
  mimeType: String,
  width: Number,
  height: Number,
  size: Number,
  deleting: { type: Boolean, default: false },
  ...seed,
});
const Notification = make(
  'Notification',
  {
    user: requiredRef('User'),
    actor: requiredRef('User'),
    kind: { type: String, required: true },
    post: ref('Post'),
    comment: ref('Comment'),
    group: ref('Group'),
    readAt: { type: Date, default: null },
    dedupeKey: { type: String, required: true, unique: true },
    ...seed,
  },
  [[{ user: 1, createdAt: -1 }, {}]],
);
const Report = make('Report', {
  reporter: requiredRef('User'),
  targetType: { type: String, enum: ['user', 'post', 'comment', 'group'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['open', 'dismissed', 'removed'], default: 'open' },
  resolvedBy: ref('User'),
  ...seed,
});
const AuthToken = make(
  'AuthToken',
  {
    user: requiredRef('User'),
    purpose: { type: String, enum: ['reset', 'verify'], required: true },
    hash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
);
module.exports = {
  User,
  Group,
  Membership,
  Project,
  Post,
  Comment,
  Follow,
  Friendship,
  Block,
  Like,
  Save,
  Media,
  Notification,
  Report,
  AuthToken,
};
