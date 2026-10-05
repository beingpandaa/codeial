const { M, id, fail, objectId } = require('./lib');

// This monolith serializes changes to one showcase while claiming/releasing its media.
const activeChanges = new Set();

async function saveProject(req, project, requestedIds) {
  const key = id(project);
  if (activeChanges.has(key)) fail(409, 'This project is being updated. Please try again.', 'CONFLICT');
  activeChanges.add(key);
  let claimedIds = [];
  let saved = false;
  try {
    const previous = project.isNew
      ? null
      : await M.Project.findOne({ _id: project._id, owner: req.user._id, deleted: false }).select('media');
    if (!project.isNew && !previous) fail(404, 'Project not found.', 'NOT_FOUND');
    const previousIds = (previous?.media || []).map(id);
    const suppliedIds = requestedIds === undefined ? previousIds : requestedIds;
    if (!Array.isArray(suppliedIds) || suppliedIds.length > 4)
      fail(400, 'Attach at most four different screenshots.', 'VALIDATION');
    const mediaIds = suppliedIds.map((value) => String(objectId(value)).toLowerCase());
    if (new Set(mediaIds).size !== mediaIds.length)
      fail(400, 'Attach at most four different screenshots.', 'VALIDATION');
    const media = await M.Media.find({
      _id: { $in: mediaIds },
      owner: req.user._id,
      post: null,
      project: { $in: [null, project._id] },
      deleting: { $ne: true },
    });
    if (
      media.length !== mediaIds.length ||
      media.some((image) => req.user.avatarUrl === `/api/v1/media/${id(image)}`)
    )
      fail(400, 'Use your own unused screenshots or images already attached to this project.', 'VALIDATION');
    claimedIds = media.filter((image) => !image.project).map((image) => image._id);
    if (claimedIds.length) {
      const result = await M.Media.updateMany(
        {
          _id: { $in: claimedIds },
          owner: req.user._id,
          post: null,
          project: null,
          deleting: { $ne: true },
        },
        { $set: { project: project._id } },
      );
      if (result.modifiedCount !== claimedIds.length)
        fail(409, 'A screenshot was attached elsewhere. Refresh and try again.', 'CONFLICT');
    }
    project.media = mediaIds;
    await project.save();
    saved = true;
    const removedIds = previousIds.filter((value) => !mediaIds.includes(value));
    if (removedIds.length)
      await M.Media.updateMany(
        { _id: { $in: removedIds }, project: project._id, post: null },
        { $set: { project: null } },
      );
    return project;
  } catch (error) {
    if (!saved && claimedIds.length)
      await M.Media.updateMany(
        { _id: { $in: claimedIds }, project: project._id, post: null },
        { $set: { project: null } },
      );
    throw error;
  } finally {
    activeChanges.delete(key);
  }
}

module.exports = { saveProject };
