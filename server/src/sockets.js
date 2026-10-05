const { Server } = require('socket.io');
const { User, Notification } = require('./models');
const { notificationAccess } = require('./activity');

function attachSockets(server, app) {
  const io = new Server(server, {
    cors: { origin: app.locals.options.origin, credentials: true },
    allowRequest(req, callback) {
      const origin = req.headers.origin;
      callback(null, !origin || origin === app.locals.options.origin);
    },
  });
  io.engine.use(app.locals.sessionMiddleware);
  const activeUser = async (socket) => {
    const session = await new Promise((resolve, reject) =>
      app.locals.sessionStore.get(socket.data.sessionId, (error, value) =>
        error ? reject(error) : resolve(value),
      ),
    );
    if (!session?.userId || !session.cookie?.expires || new Date(session.cookie.expires) <= new Date())
      return null;
    const user = await User.findById(session.userId);
    return user &&
      !user.disabled &&
      user.sessionVersion === session.version &&
      (!user.isDemo || app.locals.options.demoEnabled)
      ? user
      : null;
  };
  io.use(async (socket, next) => {
    try {
      socket.data.sessionId = socket.request.sessionID;
      const user = await activeUser(socket);
      if (!user) return next(new Error('Sign in to receive notifications.'));
      socket.data.userId = String(user._id);
      next();
    } catch {
      next(new Error('Session unavailable.'));
    }
  });
  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    socket.join(`session:${socket.data.sessionId}`);
  });
  app.locals.io = io;
  app.locals.emitNotification = async (recipientId, notificationId) => {
    const sockets = await io.in(`user:${recipientId}`).fetchSockets();
    if (!sockets.length) return;
    const entry = await Notification.findOne({ _id: notificationId, user: recipientId }).populate([
      { path: 'actor' },
      { path: 'post', populate: 'author group' },
      { path: 'comment' },
      { path: 'group' },
    ]);
    await Promise.all(
      sockets.map(async (socket) => {
        try {
          const user = await activeUser(socket);
          if (!user || String(user._id) !== String(recipientId)) {
            socket.disconnect(true);
            return;
          }
          if (entry && (await notificationAccess({ user, app }, entry)))
            socket.emit('notification', { id: String(entry._id) });
        } catch {
          socket.disconnect(true);
        }
      }),
    );
  };
  return io;
}

module.exports = { attachSockets };
