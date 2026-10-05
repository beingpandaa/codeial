const {
  M,
  id,
  eq,
  fail,
  objectId,
  text,
  strings,
  choice,
  ok,
  requireUser,
  guardDemo,
  safeRegex,
  route,
  context,
  groupFor,
  canModerate,
  canRead,
  canInteract,
  readablePost,
  notify,
  postJSON,
  commentJSON,
  paginated,
} = require('./lib');
async function removeComment(comment, post) {
  const children = await M.Comment.find({ parent: comment._id }).select('_id');
  const ids = [comment._id, ...children.map((c) => c._id)];
  await M.Comment.updateMany({ _id: { $in: ids } }, { $set: { deleted: true } });
  if (ids.some((value) => eq(value, post.solutionComment)))
    await M.Post.updateOne({ _id: post._id }, { $set: { status: 'open', solutionComment: null } });
}
function postRoutes(router) {
  router.get(
    '/posts',
    route(async (req, res) => {
      const feed = choice(req.query.feed || 'explore', ['explore', 'home', 'saved'], 'feed');
      if (feed !== 'explore') requireUser(req);
      const ctx = await context(req);
      const filter = { deleted: false };
      if (req.query.type)
        filter.type = choice(req.query.type, ['build', 'learning', 'discussion', 'help'], 'post type');
      if (req.query.tag) filter.tags = text(req.query.tag, 'Tag', 1, 40);
      for (const field of ['author', 'group', 'project'])
        if (req.query[field]) filter[field] = objectId(req.query[field]);
      if (req.query.search) {
        const regex = new RegExp(safeRegex(req.query.search), 'i');
        filter.$or = [{ title: regex }, { body: regex }, { tags: regex }];
      }
      const saves =
        feed === 'saved' ? new Set((await M.Save.find({ user: req.user._id })).map((s) => id(s.post))) : null;
      const publicExplore = feed === 'explore' && !req.query.author && !req.query.group && !req.query.project;
      const permitted = async (post) => {
        if (!post.author || post.author.disabled || !(await canRead(req, post))) return false;
        if (publicExplore)
          return (
            post.visibility === 'public' ||
            (post.visibility === 'group' && post.group?.visibility === 'public')
          );
        if (saves) return saves.has(id(post));
        if (feed === 'home')
          return (
            eq(post.author, req.user) ||
            ctx.friends.has(id(post.author)) ||
            ctx.following.has(id(post.author)) ||
            (post.group && ctx.memberships.has(id(post.group)))
          );
        return true;
      };
      ok(
        res,
        await paginated(req, M.Post, filter, 'author group project media', permitted, (p) =>
          postJSON(req, p),
        ),
      );
    }),
  );
  router.get(
    '/posts/:id',
    route(async (req, res) => {
      const post = await readablePost(req, req.params.id);
      if (!post.author || post.author.disabled) fail(404, 'Post not found.', 'NOT_FOUND');
      ok(res, await postJSON(req, post));
    }),
  );
  router.post(
    '/posts',
    route(async (req, res) => {
      requireUser(req);
      const type = choice(
        req.body.type || 'discussion',
        ['build', 'learning', 'discussion', 'help'],
        'post type',
      );
      const title = text(req.body.title, 'Title', 3, 180);
      const body = text(req.body.body, 'Post', 1, 12000);
      const tags = strings(req.body.tags || [], 'Tags', 6).map((t) => t.toLowerCase());
      const visibility = choice(
        req.body.visibility || 'public',
        ['public', 'friends', 'group'],
        'visibility',
      );
      let group = null;
      let project = null;
      if (visibility === 'group') {
        objectId(req.body.groupId);
        group = await groupFor(req, req.body.groupId);
        if (!group || group.archived || !(await context(req)).memberships.has(id(group)))
          fail(403, 'Join the group before posting.', 'FORBIDDEN');
        if ((await context(req)).blocked.has(id(group.owner)))
          fail(403, 'Unable to post in this group.', 'FORBIDDEN');
      } else if (req.body.groupId) fail(400, 'Group posts must use group visibility.', 'VALIDATION');
      if (req.body.projectId) {
        objectId(req.body.projectId);
        project = await M.Project.findOne({ _id: req.body.projectId, owner: req.user._id, deleted: false });
        if (!project) fail(400, 'Choose one of your projects.', 'VALIDATION');
      }
      const mediaIds = req.body.mediaIds || [];
      if (!Array.isArray(mediaIds) || mediaIds.length > 4 || new Set(mediaIds).size !== mediaIds.length)
        fail(400, 'Attach at most four different images.', 'VALIDATION');
      mediaIds.forEach(objectId);
      const media = await M.Media.find({
        _id: { $in: mediaIds },
        owner: req.user._id,
        post: null,
        project: null,
        deleting: { $ne: true },
      });
      if (
        media.length !== mediaIds.length ||
        media.some((m) => req.user.avatarUrl === `/api/v1/media/${id(m)}`)
      )
        fail(400, 'One or more images cannot be attached.', 'VALIDATION');
      const post = await M.Post.create({
        author: req.user._id,
        type,
        title,
        body,
        tags,
        visibility,
        group: group?._id || null,
        project: project?._id || null,
        media: mediaIds,
      });
      if (media.length) {
        const result = await M.Media.updateMany(
          { _id: { $in: mediaIds }, owner: req.user._id, post: null, project: null, deleting: { $ne: true } },
          { $set: { post: post._id } },
        );
        if (result.modifiedCount !== mediaIds.length) {
          await M.Media.updateMany({ post: post._id }, { $set: { post: null } });
          await post.deleteOne();
          fail(409, 'An image was already attached elsewhere.', 'CONFLICT');
        }
      }
      await post.populate('author group project media');
      ok(res, await postJSON(req, post), 201);
    }),
  );
  router.patch(
    '/posts/:id',
    route(async (req, res) => {
      requireUser(req);
      const post = await readablePost(req, req.params.id);
      if (!eq(post.author, req.user)) fail(403, 'Only the author can edit this post.', 'FORBIDDEN');
      guardDemo(req, post);
      if ('title' in req.body) post.title = text(req.body.title, 'Title', 3, 180);
      if ('body' in req.body) post.body = text(req.body.body, 'Post', 1, 12000);
      if ('tags' in req.body) post.tags = strings(req.body.tags, 'Tags', 6).map((t) => t.toLowerCase());
      await post.save();
      ok(res, await postJSON(req, post));
    }),
  );
  router.delete(
    '/posts/:id',
    route(async (req, res) => {
      requireUser(req);
      const post = await readablePost(req, req.params.id);
      if (!eq(post.author, req.user) && !(await canModerate(req, post)))
        fail(403, 'Only the author or a group moderator can remove this post.', 'FORBIDDEN');
      guardDemo(req, post);
      post.deleted = true;
      await post.save();
      ok(res, { deleted: true });
    }),
  );
  for (const method of ['put', 'delete']) {
    router[method](
      '/posts/:id/like',
      route(async (req, res) => {
        const post = await readablePost(req, req.params.id);
        if (!(await canInteract(req, post))) fail(403, 'You cannot interact with this post.', 'FORBIDDEN');
        const filter = { user: req.user._id, targetType: 'post', target: post._id };
        if (method === 'put') {
          await M.Like.updateOne(filter, { $setOnInsert: filter }, { upsert: true });
          await notify(req, { user: post.author._id, kind: 'post_like', post: post._id });
        } else await M.Like.deleteOne(filter);
        ok(res, {
          liked: method === 'put',
          likeCount: await M.Like.countDocuments({ targetType: 'post', target: post._id }),
        });
      }),
    );
    router[method](
      '/posts/:id/save',
      route(async (req, res) => {
        requireUser(req);
        const post = await readablePost(req, req.params.id);
        const filter = { user: req.user._id, post: post._id };
        if (method === 'put') await M.Save.updateOne(filter, { $setOnInsert: filter }, { upsert: true });
        else await M.Save.deleteOne(filter);
        ok(res, { saved: method === 'put' });
      }),
    );
  }
  router.get(
    '/posts/:id/comments',
    route(async (req, res) => {
      const post = await readablePost(req, req.params.id);
      const ctx = await context(req);
      const moderator = await canModerate(req, post);
      ok(
        res,
        await paginated(
          req,
          M.Comment,
          { post: post._id, deleted: false },
          'author',
          (c) => c.author && !c.author.disabled && (!ctx.blocked.has(id(c.author)) || moderator),
          (c) => commentJSON(req, c, post),
        ),
      );
    }),
  );
  router.post(
    '/posts/:id/comments',
    route(async (req, res) => {
      const post = await readablePost(req, req.params.id);
      if (!(await canInteract(req, post))) fail(403, 'Join the group before commenting.', 'FORBIDDEN');
      const body = text(req.body.body, 'Comment', 1, 3000);
      let parent = null;
      if (req.body.parentId) {
        objectId(req.body.parentId);
        parent = await M.Comment.findOne({ _id: req.body.parentId, post: post._id, deleted: false });
        if (!parent || parent.parent || (await context(req)).blocked.has(id(parent.author)))
          fail(400, 'Reply to an available top-level comment.', 'VALIDATION');
      }
      const comment = await M.Comment.create({
        post: post._id,
        author: req.user._id,
        body,
        parent: parent?._id || null,
      });
      await notify(req, { user: post.author._id, kind: 'comment', post: post._id, comment: comment._id });
      if (parent && !eq(parent.author, post.author))
        await notify(req, { user: parent.author, kind: 'reply', post: post._id, comment: comment._id });
      await comment.populate('author');
      ok(res, await commentJSON(req, comment, post), 201);
    }),
  );
  const getComment = async (req) => {
    requireUser(req);
    objectId(req.params.id);
    const comment = await M.Comment.findOne({ _id: req.params.id, deleted: false }).populate('author');
    if (!comment || !comment.author) fail(404, 'Comment not found.', 'NOT_FOUND');
    const post = await readablePost(req, comment.post);
    if ((await context(req)).blocked.has(id(comment.author)) && !(await canModerate(req, post)))
      fail(404, 'Comment not found.', 'NOT_FOUND');
    return { comment, post };
  };
  router.patch(
    '/comments/:id',
    route(async (req, res) => {
      const { comment, post } = await getComment(req);
      if (!eq(comment.author, req.user)) fail(403, 'Only the author can edit this comment.', 'FORBIDDEN');
      guardDemo(req, comment);
      comment.body = text(req.body.body, 'Comment', 1, 3000);
      await comment.save();
      ok(res, await commentJSON(req, comment, post));
    }),
  );
  router.delete(
    '/comments/:id',
    route(async (req, res) => {
      const { comment, post } = await getComment(req);
      if (!eq(comment.author, req.user) && !(await canModerate(req, post)))
        fail(403, 'Only the author or group moderator can remove this comment.', 'FORBIDDEN');
      guardDemo(req, comment);
      await removeComment(comment, post);
      ok(res, { deleted: true });
    }),
  );
  for (const method of ['put', 'delete'])
    router[method](
      '/comments/:id/like',
      route(async (req, res) => {
        const { comment, post } = await getComment(req);
        if (!(await canInteract(req, post)) || (await context(req)).blocked.has(id(comment.author)))
          fail(403, 'You cannot interact with this comment.', 'FORBIDDEN');
        const filter = { user: req.user._id, targetType: 'comment', target: comment._id };
        if (method === 'put') {
          await M.Like.updateOne(filter, { $setOnInsert: filter }, { upsert: true });
          await notify(req, {
            user: comment.author._id,
            kind: 'comment_like',
            post: post._id,
            comment: comment._id,
          });
        } else await M.Like.deleteOne(filter);
        ok(res, {
          liked: method === 'put',
          likeCount: await M.Like.countDocuments({ targetType: 'comment', target: comment._id }),
        });
      }),
    );
  router.put(
    '/posts/:id/solution',
    route(async (req, res) => {
      requireUser(req);
      const post = await readablePost(req, req.params.id);
      if (!eq(post.author, req.user) || post.type !== 'help')
        fail(403, 'Only the author of a help post can select a solution.', 'FORBIDDEN');
      guardDemo(req, post);
      let comment = null;
      if (req.body.commentId !== null) {
        objectId(req.body.commentId);
        comment = await M.Comment.findOne({ _id: req.body.commentId, post: post._id, deleted: false });
        if (!comment || (await context(req)).blocked.has(id(comment.author)))
          fail(400, 'Choose an available comment on this post.', 'VALIDATION');
      }
      post.solutionComment = comment?._id || null;
      post.status = comment ? 'solved' : 'open';
      await post.save();
      if (comment)
        await notify(req, { user: comment.author, kind: 'solution', post: post._id, comment: comment._id });
      ok(res, await postJSON(req, post));
    }),
  );
}
module.exports = { postRoutes, removeComment };
