const {
  M,
  id,
  fail,
  objectId,
  text,
  choice,
  ok,
  requireUser,
  guardDemo,
  route,
  userJSON,
  context,
  canRead,
  readablePost,
  paginated,
} = require('./lib');
const { removeComment } = require('./posts');
const notificationAccess = async (req, entry) => {
  if (!entry.actor || entry.actor.disabled || (await context(req)).blocked.has(id(entry.actor))) return false;
  if (['post_like', 'comment_like', 'comment', 'reply', 'solution'].includes(entry.kind) && !entry.post)
    return false;
  if (['comment_like', 'comment', 'reply', 'solution'].includes(entry.kind) && !entry.comment) return false;
  if (['group_request', 'group_approved'].includes(entry.kind) && !entry.group) return false;
  if (entry.post && !(await canRead(req, entry.post))) return false;
  if (entry.comment && (entry.comment.deleted || (await context(req)).blocked.has(id(entry.comment.author))))
    return false;
  if (entry.group) {
    const group = entry.group;
    if (
      group.archived ||
      (group.visibility === 'private' && !(await context(req)).memberships.has(id(group)))
    )
      return false;
  }
  if (entry.kind === 'friend_request')
    return Boolean(
      await M.Friendship.exists({ requester: entry.actor._id, recipient: req.user._id, status: 'pending' }),
    );
  if (entry.kind === 'friend_accepted') return (await context(req)).friends.has(id(entry.actor));
  if (entry.kind === 'follow')
    return Boolean(await M.Follow.exists({ from: entry.actor._id, to: req.user._id }));
  if (entry.kind === 'group_request')
    return Boolean(
      entry.group &&
      ['owner', 'moderator'].includes((await context(req)).memberships.get(id(entry.group))) &&
      (await M.Membership.exists({ group: entry.group._id, user: entry.actor._id, status: 'pending' })),
    );
  return true;
};
function activityRoutes(router) {
  const notificationJSON = (req, entry) => {
    const labels = {
      friend_request: 'sent you a friend request',
      friend_accepted: 'accepted your friend request',
      follow: 'started following you',
      post_like: 'liked your post',
      comment_like: 'liked your comment',
      comment: 'commented on your post',
      reply: 'replied to your comment',
      solution: 'selected your answer as the solution',
      group_request: 'requested to join your group',
      group_approved: 'approved your group request',
    };
    const href = entry.post
      ? `/posts/${id(entry.post)}`
      : entry.group
        ? `/groups/${entry.group.slug}`
        : entry.kind.startsWith('friend_')
          ? '/friends?tab=requests'
          : `/u/${entry.actor.username}`;
    return {
      id: id(entry),
      kind: entry.kind,
      actor: userJSON(entry.actor, req.user),
      title: `${entry.actor.name} ${labels[entry.kind] || 'shared an update'}`,
      body: entry.post?.title || entry.group?.name || '',
      href,
      postId: entry.post ? id(entry.post) : null,
      commentId: entry.comment ? id(entry.comment) : null,
      groupId: entry.group ? id(entry.group) : null,
      createdAt: entry.createdAt,
      readAt: entry.readAt,
      isRead: Boolean(entry.readAt),
    };
  };
  router.get(
    '/notifications',
    route(async (req, res) => {
      requireUser(req);
      ok(
        res,
        await paginated(
          req,
          M.Notification,
          { user: req.user._id },
          [
            { path: 'actor' },
            { path: 'post', populate: 'author group' },
            { path: 'comment' },
            { path: 'group' },
          ],
          (entry) => notificationAccess(req, entry),
          (entry) => notificationJSON(req, entry),
        ),
      );
    }),
  );
  router.post(
    '/notifications/read',
    route(async (req, res) => {
      requireUser(req);
      const filter = { user: req.user._id, readAt: null };
      if (req.body.ids !== undefined) {
        if (!Array.isArray(req.body.ids) || req.body.ids.length > 100)
          fail(400, 'Invalid notification identifiers.', 'VALIDATION');
        req.body.ids.forEach(objectId);
        filter._id = { $in: req.body.ids };
      }
      await M.Notification.updateMany(filter, { $set: { readAt: new Date() } });
      ok(res, { read: true });
    }),
  );
  const targetModel = { user: M.User, post: M.Post, comment: M.Comment, group: M.Group };
  router.post(
    '/reports',
    route(async (req, res) => {
      requireUser(req);
      const targetType = choice(req.body.targetType, Object.keys(targetModel), 'report target');
      const targetId = objectId(req.body.targetId);
      const reason = text(req.body.reason, 'Reason', 10, 1000);
      const target = await targetModel[targetType].findById(targetId);
      if (!target || target.deleted || target.archived || target.disabled)
        fail(404, 'Content not found.', 'NOT_FOUND');
      if (targetType === 'post') await readablePost(req, targetId);
      if (targetType === 'comment') {
        await readablePost(req, target.post);
        if ((await context(req)).blocked.has(id(target.author))) fail(404, 'Content not found.', 'NOT_FOUND');
      }
      if (targetType === 'user' && (await context(req)).blocked.has(id(target)))
        fail(404, 'User not found.', 'NOT_FOUND');
      const existing = await M.Report.findOne({
        reporter: req.user._id,
        targetType,
        targetId,
        status: 'open',
      });
      const report =
        existing || (await M.Report.create({ reporter: req.user._id, targetType, targetId, reason }));
      ok(res, { id: id(report), status: report.status }, existing ? 200 : 201);
    }),
  );
  const requireAdmin = (req) => {
    requireUser(req);
    if (req.user.role !== 'admin') fail(403, 'Administrator access is required.', 'FORBIDDEN');
  };
  const reportJSON = async (req, report) => {
    const target = await targetModel[report.targetType].findById(report.targetId).lean();
    let href = null;
    if (target)
      href =
        report.targetType === 'post'
          ? `/posts/${id(target)}`
          : report.targetType === 'comment'
            ? `/posts/${id(target.post)}`
            : report.targetType === 'group'
              ? `/groups/${target.slug}`
              : `/u/${target.username}`;
    return {
      id: id(report),
      targetType: report.targetType,
      targetId: id(report.targetId),
      reason: report.reason,
      status: report.status,
      reporter: userJSON(report.reporter, req.user),
      createdAt: report.createdAt,
      target: target
        ? {
            label: target.title || target.name || 'Comment',
            body: target.body || target.description || target.bio || '',
            href,
          }
        : null,
    };
  };
  router.get(
    '/admin/reports',
    route(async (req, res) => {
      requireAdmin(req);
      const filter = {};
      if (req.query.status)
        filter.status = choice(req.query.status, ['open', 'dismissed', 'removed'], 'status');
      ok(
        res,
        await paginated(
          req,
          M.Report,
          filter,
          'reporter',
          () => true,
          (report) => reportJSON(req, report),
        ),
      );
    }),
  );
  router.patch(
    '/admin/reports/:id',
    route(async (req, res) => {
      requireAdmin(req);
      guardDemo(req);
      objectId(req.params.id);
      const action = choice(req.body.action, ['dismiss', 'remove'], 'action');
      const report = await M.Report.findById(req.params.id).populate('reporter');
      if (!report) fail(404, 'Report not found.', 'NOT_FOUND');
      if (report.status !== 'open') return ok(res, await reportJSON(req, report));
      if (action === 'remove') {
        const target = await targetModel[report.targetType].findById(report.targetId);
        if (target) {
          if (report.targetType === 'user') {
            if (target.role === 'admin')
              fail(403, 'Administrator accounts cannot be removed here.', 'FORBIDDEN');
            target.disabled = true;
            target.sessionVersion += 1;
            await target.save();
            req.app.locals.io?.in(`user:${id(target)}`).disconnectSockets(true);
          } else if (report.targetType === 'group') {
            target.archived = true;
            await target.save();
          } else if (report.targetType === 'comment') {
            const post = await M.Post.findById(target.post);
            if (post) await removeComment(target, post);
            else {
              target.deleted = true;
              await target.save();
            }
          } else {
            target.deleted = true;
            await target.save();
          }
        }
      }
      report.status = action === 'remove' ? 'removed' : 'dismissed';
      report.resolvedBy = req.user._id;
      await report.save();
      ok(res, await reportJSON(req, report));
    }),
  );
}
module.exports = { activityRoutes, notificationAccess };
