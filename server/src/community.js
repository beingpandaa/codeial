const {
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
  targetUser,
  notify,
  canRead,
  groupJSON,
  projectJSON,
  paginated,
} = require('./lib');
const { saveProject } = require('./project-media');
function communityRoutes(router) {
  router.get(
    '/users',
    route(async (req, res) => {
      const ctx = await context(req);
      const search = safeRegex(req.query.search);
      const filter = {
        disabled: false,
        ...(search
          ? {
              $or: [
                { name: new RegExp(search, 'i') },
                { username: new RegExp(search, 'i') },
                { skills: new RegExp(search, 'i') },
              ],
            }
          : {}),
      };
      ok(
        res,
        await paginated(
          req,
          M.User,
          filter,
          '',
          (u) => !ctx.blocked.has(id(u)),
          (u) => userJSON(u, req.user),
        ),
      );
    }),
  );
  router.patch(
    '/users/me',
    route(async (req, res) => {
      requireUser(req);
      guardDemo(req);
      const fields = {};
      if ('name' in req.body) fields.name = text(req.body.name, 'Name', 2, 70);
      if ('bio' in req.body) fields.bio = text(req.body.bio, 'Bio', 0, 500);
      if ('skills' in req.body) fields.skills = strings(req.body.skills, 'Skills', 12);
      for (const field of ['githubUrl', 'portfolioUrl'])
        if (field in req.body) fields[field] = url(req.body[field], field);
      if ('avatarUrl' in req.body) {
        let avatar = text(req.body.avatarUrl, 'Avatar', 0, 200);
        const match = avatar.match(/^\/api\/v1\/media\/([a-f0-9]{24})$/i);
        if (match) avatar = `/api/v1/media/${match[1].toLowerCase()}`;
        if (avatar && avatar !== req.user.avatarUrl) {
          const media = match
            ? await M.Media.findOne({
                _id: match[1],
                owner: req.user._id,
                post: null,
                project: null,
                deleting: { $ne: true },
              })
            : null;
          if (!media) fail(400, 'Upload an image to use as your avatar.', 'VALIDATION');
        }
        fields.avatarUrl = avatar;
      }
      const user = await M.User.findByIdAndUpdate(req.user._id, { $set: fields }, { new: true });
      ok(res, userJSON(user, user));
    }),
  );
  router.get(
    '/users/:username',
    route(async (req, res) => {
      const user = await M.User.findOne({ username: req.params.username.toLowerCase(), disabled: false });
      const ctx = await context(req);
      if (!user || ctx.blocked.has(id(user))) fail(404, 'Profile not found.', 'NOT_FOUND');
      const friendship =
        req.user && !eq(user, req.user)
          ? await M.Friendship.findOne({ pairKey: pair(user, req.user) })
          : null;
      const posts = await M.Post.find({ author: user._id, deleted: false }).lean();
      let visiblePosts = 0;
      for (const post of posts) if (await canRead(req, post)) visiblePosts++;
      const [followers, following, friends, projects] = await Promise.all([
        M.Follow.countDocuments({ to: user._id }),
        M.Follow.countDocuments({ from: user._id }),
        M.Friendship.countDocuments({
          status: 'accepted',
          $or: [{ requester: user._id }, { recipient: user._id }],
        }),
        M.Project.countDocuments({ owner: user._id, deleted: false }),
      ]);
      ok(res, {
        user: userJSON(user, req.user),
        stats: { posts: visiblePosts, followers, following, friends, projects },
        relationship: {
          following: ctx.following.has(id(user)),
          friendship: !friendship
            ? 'none'
            : friendship.status === 'accepted'
              ? 'friends'
              : eq(friendship.requester, req.user)
                ? 'outgoing'
                : 'incoming',
          blocked: false,
        },
      });
    }),
  );
  router.get(
    '/relationships',
    route(async (req, res) => {
      requireUser(req);
      const ctx = await context(req);
      const uid = req.user._id;
      const [relations, blocks] = await Promise.all([
        M.Friendship.find({ $or: [{ requester: uid }, { recipient: uid }] }).populate('requester recipient'),
        M.Block.find({ from: uid }).populate('to'),
      ]);
      const data = {
        friends: [],
        incoming: [],
        outgoing: [],
        blocked: blocks.filter((b) => b.to).map((b) => userJSON(b.to, req.user)),
      };
      for (const relation of relations) {
        const other = eq(relation.requester, uid) ? relation.recipient : relation.requester;
        if (!other || ctx.blocked.has(id(other))) continue;
        const key =
          relation.status === 'accepted' ? 'friends' : eq(relation.requester, uid) ? 'outgoing' : 'incoming';
        data[key].push(userJSON(other, req.user));
      }
      ok(res, data);
    }),
  );
  router.put(
    '/users/:id/follow',
    route(async (req, res) => {
      const user = await targetUser(req, req.params.id);
      await M.Follow.updateOne(
        { from: req.user._id, to: user._id },
        { $setOnInsert: { from: req.user._id, to: user._id } },
        { upsert: true },
      );
      await notify(req, { user: user._id, kind: 'follow' });
      ok(res, { following: true });
    }),
  );
  router.delete(
    '/users/:id/follow',
    route(async (req, res) => {
      requireUser(req);
      objectId(req.params.id);
      await M.Follow.deleteOne({ from: req.user._id, to: req.params.id });
      ok(res, { following: false });
    }),
  );
  router.post(
    '/users/:id/friend-request',
    route(async (req, res) => {
      const user = await targetUser(req, req.params.id);
      const pairKey = pair(req.user, user);
      const relation = await M.Friendship.findOneAndUpdate(
        { pairKey },
        { $setOnInsert: { pairKey, requester: req.user._id, recipient: user._id, status: 'pending' } },
        { upsert: true, new: true },
      );
      if (relation.status === 'pending' && eq(relation.requester, req.user))
        await notify(req, { user: user._id, kind: 'friend_request', key: `friend_request:${id(relation)}` });
      ok(res, {
        friendship:
          relation.status === 'accepted'
            ? 'friends'
            : eq(relation.requester, req.user)
              ? 'outgoing'
              : 'incoming',
      });
    }),
  );
  router.post(
    '/users/:id/friend-accept',
    route(async (req, res) => {
      const user = await targetUser(req, req.params.id);
      const relation = await M.Friendship.findOneAndUpdate(
        { pairKey: pair(user, req.user), requester: user._id, recipient: req.user._id },
        { $set: { status: 'accepted' } },
        { new: true },
      );
      if (!relation) fail(404, 'Friend request not found.', 'NOT_FOUND');
      await notify(req, { user: user._id, kind: 'friend_accepted', key: `friend_accepted:${id(relation)}` });
      ok(res, { friendship: 'friends' });
    }),
  );
  router.delete(
    '/users/:id/friend',
    route(async (req, res) => {
      requireUser(req);
      objectId(req.params.id);
      await M.Friendship.deleteOne({ pairKey: pair(req.user, req.params.id) });
      ok(res, { friendship: 'none' });
    }),
  );
  router.put(
    '/users/:id/block',
    route(async (req, res) => {
      const user = await targetUser(req, req.params.id, { allowBlocked: true });
      const me = req.user._id;
      await M.Block.updateOne(
        { from: me, to: user._id },
        { $setOnInsert: { from: me, to: user._id } },
        { upsert: true },
      );
      await Promise.all([
        M.Friendship.deleteOne({ pairKey: pair(me, user) }),
        M.Follow.deleteMany({
          $or: [
            { from: me, to: user._id },
            { from: user._id, to: me },
          ],
        }),
        M.Notification.deleteMany({
          $or: [
            { user: me, actor: user._id },
            { user: user._id, actor: me },
          ],
        }),
      ]);
      ok(res, { blocked: true });
    }),
  );
  router.delete(
    '/users/:id/block',
    route(async (req, res) => {
      requireUser(req);
      objectId(req.params.id);
      await M.Block.deleteOne({ from: req.user._id, to: req.params.id });
      ok(res, { blocked: false });
    }),
  );
  router.get(
    '/groups',
    route(async (req, res) => {
      const search = safeRegex(req.query.search);
      ok(
        res,
        await paginated(
          req,
          M.Group,
          {
            archived: false,
            ...(search
              ? { $or: [{ name: new RegExp(search, 'i') }, { description: new RegExp(search, 'i') }] }
              : {}),
          },
          '',
          () => true,
          (g) => groupJSON(req, g),
        ),
      );
    }),
  );
  router.get(
    '/groups/:slug',
    route(async (req, res) => {
      const group = await M.Group.findOne({ slug: req.params.slug, archived: false });
      if (!group) fail(404, 'Group not found.', 'NOT_FOUND');
      ok(res, await groupJSON(req, group));
    }),
  );
  router.post(
    '/groups',
    route(async (req, res) => {
      requireUser(req);
      const name = text(req.body.name, 'Name', 3, 70);
      const description = text(req.body.description || '', 'Description', 0, 2000);
      const rules = text(req.body.rules || '', 'Rules', 0, 3000);
      const visibility = choice(req.body.visibility || 'public', ['public', 'private'], 'visibility');
      const group = await M.Group.create({
        name,
        slug: slug(name),
        description,
        rules,
        visibility,
        owner: req.user._id,
      });
      await M.Membership.create({ group: group._id, user: req.user._id, role: 'owner', status: 'active' });
      req.acl = null;
      ok(res, await groupJSON(req, group), 201);
    }),
  );
  const getGroup = async (req, moderator = false, ownerOnly = false) => {
    requireUser(req);
    objectId(req.params.id);
    const group = await M.Group.findOne({ _id: req.params.id, archived: false });
    if (!group) fail(404, 'Group not found.', 'NOT_FOUND');
    const role = (await context(req)).memberships.get(id(group));
    if (moderator && !(ownerOnly ? role === 'owner' : ['owner', 'moderator'].includes(role)))
      fail(403, 'Group management permission is required.', 'FORBIDDEN');
    return group;
  };
  router.patch(
    '/groups/:id',
    route(async (req, res) => {
      const group = await getGroup(req, true);
      guardDemo(req, group);
      for (const [field, max] of [
        ['description', 2000],
        ['rules', 3000],
      ])
        if (field in req.body) group[field] = text(req.body[field], field, 0, max);
      await group.save();
      ok(res, await groupJSON(req, group));
    }),
  );
  router.post(
    '/groups/:id/join',
    route(async (req, res) => {
      const group = await getGroup(req);
      if ((await context(req)).blocked.has(id(group.owner)))
        fail(403, 'Unable to join this group.', 'FORBIDDEN');
      const membership = await M.Membership.findOneAndUpdate(
        { group: group._id, user: req.user._id },
        {
          $setOnInsert: {
            group: group._id,
            user: req.user._id,
            role: 'member',
            status: group.visibility === 'private' ? 'pending' : 'active',
          },
        },
        { upsert: true, new: true },
      );
      if (membership.status === 'pending')
        await notify(req, {
          user: group.owner,
          kind: 'group_request',
          group: group._id,
          key: `group_request:${id(membership)}`,
        });
      req.acl = null;
      ok(res, await groupJSON(req, group));
    }),
  );
  router.delete(
    '/groups/:id/membership',
    route(async (req, res) => {
      const group = await getGroup(req);
      if (eq(group.owner, req.user))
        fail(409, 'Transfer ownership or archive the group before leaving.', 'OWNER_REQUIRED');
      await M.Membership.deleteOne({ group: group._id, user: req.user._id });
      req.acl = null;
      ok(res, await groupJSON(req, group));
    }),
  );
  router.get(
    '/groups/:id/members',
    route(async (req, res) => {
      const group = await getGroup(req);
      const role = (await context(req)).memberships.get(id(group));
      if (group.visibility === 'private' && !role) fail(403, 'Join this group to view members.', 'FORBIDDEN');
      const moderator = ['owner', 'moderator'].includes(role);
      const members = await M.Membership.find({
        group: group._id,
        ...(moderator ? {} : { status: 'active' }),
      }).populate('user');
      const ctx = await context(req);
      ok(res, {
        members: members
          .filter((m) => m.status === 'active' && m.user && (moderator || !ctx.blocked.has(id(m.user))))
          .map((m) => ({ user: userJSON(m.user, req.user), role: m.role })),
        requests: moderator
          ? members
              .filter((m) => m.status === 'pending' && m.user)
              .map((m) => ({ user: userJSON(m.user, req.user) }))
          : [],
      });
    }),
  );
  router.post(
    '/groups/:id/members/:userId/approve',
    route(async (req, res) => {
      const group = await getGroup(req, true);
      guardDemo(req, group);
      objectId(req.params.userId);
      const membership = await M.Membership.findOneAndUpdate(
        { group: group._id, user: req.params.userId, status: 'pending' },
        { $set: { status: 'active' } },
        { new: true },
      );
      if (!membership) fail(404, 'Request not found.', 'NOT_FOUND');
      await notify(req, {
        user: req.params.userId,
        kind: 'group_approved',
        group: group._id,
        key: `group_approved:${id(membership)}`,
      });
      ok(res, { approved: true });
    }),
  );
  router.delete(
    '/groups/:id/members/:userId',
    route(async (req, res) => {
      const group = await getGroup(req, true);
      guardDemo(req, group);
      objectId(req.params.userId);
      const membership = await M.Membership.findOne({ group: group._id, user: req.params.userId });
      if (!membership) fail(404, 'Member not found.', 'NOT_FOUND');
      if (membership.role === 'owner' || (membership.role === 'moderator' && !eq(group.owner, req.user)))
        fail(403, 'You cannot remove this member.', 'FORBIDDEN');
      await membership.deleteOne();
      ok(res, { removed: true });
    }),
  );
  router.patch(
    '/groups/:id/members/:userId',
    route(async (req, res) => {
      const group = await getGroup(req, true, true);
      guardDemo(req, group);
      objectId(req.params.userId);
      if (eq(group.owner, req.params.userId))
        fail(400, 'Use ownership transfer to change the owner.', 'VALIDATION');
      const role = choice(req.body.role, ['member', 'moderator'], 'role');
      const membership = await M.Membership.findOneAndUpdate(
        { group: group._id, user: req.params.userId, status: 'active' },
        { $set: { role } },
        { new: true },
      );
      if (!membership) fail(404, 'Member not found.', 'NOT_FOUND');
      ok(res, { role });
    }),
  );
  router.post(
    '/groups/:id/transfer',
    route(async (req, res) => {
      const group = await getGroup(req, true, true);
      guardDemo(req, group);
      objectId(req.body.userId);
      if (eq(req.user, req.body.userId)) fail(400, 'Choose another member.', 'VALIDATION');
      const member = await M.Membership.findOne({
        group: group._id,
        user: req.body.userId,
        status: 'active',
      });
      if (!member) fail(400, 'The new owner must be an active member.', 'VALIDATION');
      const changed = await M.Group.updateOne(
        { _id: group._id, owner: req.user._id },
        { $set: { owner: member.user } },
      );
      if (!changed.modifiedCount) fail(409, 'Ownership has changed. Refresh and retry.', 'CONFLICT');
      await M.Membership.updateMany({ group: group._id, role: 'owner' }, { $set: { role: 'moderator' } });
      member.role = 'owner';
      await member.save();
      req.acl = null;
      group.owner = member.user;
      ok(res, await groupJSON(req, group));
    }),
  );
  router.delete(
    '/groups/:id',
    route(async (req, res) => {
      const group = await getGroup(req, true, true);
      guardDemo(req, group);
      group.archived = true;
      await group.save();
      ok(res, { archived: true });
    }),
  );
  router.get(
    '/projects',
    route(async (req, res) => {
      const ctx = await context(req);
      const search = safeRegex(req.query.search);
      const filter = {
        deleted: false,
        ...(req.query.owner ? { owner: objectId(req.query.owner) } : {}),
        ...(search
          ? {
              $or: [
                { title: new RegExp(search, 'i') },
                { description: new RegExp(search, 'i') },
                { stack: new RegExp(search, 'i') },
              ],
            }
          : {}),
      };
      ok(
        res,
        await paginated(
          req,
          M.Project,
          filter,
          'owner',
          (p) => p.owner && !p.owner.disabled && !ctx.blocked.has(id(p.owner)),
          (p) => projectJSON(req, p),
        ),
      );
    }),
  );
  router.get(
    '/projects/:slug',
    route(async (req, res) => {
      const project = await M.Project.findOne({ slug: req.params.slug, deleted: false }).populate('owner');
      if (
        !project ||
        !project.owner ||
        project.owner.disabled ||
        (await context(req)).blocked.has(id(project.owner))
      )
        fail(404, 'Project not found.', 'NOT_FOUND');
      ok(res, projectJSON(req, project));
    }),
  );
  const projectFields = (body, partial = false) => {
    const fields = {};
    if (!partial || 'title' in body) fields.title = text(body.title, 'Title', 3, 120);
    if (!partial || 'description' in body)
      fields.description = text(body.description, 'Description', 10, 4000);
    if (!partial || 'stack' in body) fields.stack = strings(body.stack || [], 'Stack', 12);
    for (const field of ['githubUrl', 'liveUrl'])
      if (!partial || field in body) fields[field] = url(body[field], field);
    return fields;
  };
  router.post(
    '/projects',
    route(async (req, res) => {
      requireUser(req);
      const fields = projectFields(req.body);
      const project = new M.Project({ ...fields, slug: slug(fields.title), owner: req.user._id });
      await saveProject(req, project, req.body.mediaIds || []);
      await project.populate('owner');
      ok(res, projectJSON(req, project), 201);
    }),
  );
  router.patch(
    '/projects/:id',
    route(async (req, res) => {
      requireUser(req);
      objectId(req.params.id);
      const project = await M.Project.findOne({ _id: req.params.id, owner: req.user._id, deleted: false });
      if (!project) fail(404, 'Project not found.', 'NOT_FOUND');
      guardDemo(req, project);
      Object.assign(project, projectFields(req.body, true));
      await saveProject(req, project, req.body.mediaIds);
      await project.populate('owner');
      ok(res, projectJSON(req, project));
    }),
  );
  router.delete(
    '/projects/:id',
    route(async (req, res) => {
      requireUser(req);
      objectId(req.params.id);
      const project = await M.Project.findOne({ _id: req.params.id, owner: req.user._id, deleted: false });
      if (!project) fail(404, 'Project not found.', 'NOT_FOUND');
      guardDemo(req, project);
      project.deleted = true;
      await project.save();
      ok(res, { deleted: true });
    }),
  );
}
module.exports = { communityRoutes };
