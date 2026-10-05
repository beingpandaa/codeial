const http = require('node:http');
const { createApp } = require('./app');
const { attachSockets } = require('./sockets');
async function start() {
  const { app, close } = await createApp();
  const server = http.createServer(app);
  const io = attachSockets(server, app);
  const port = Number(process.env.PORT || 4000);
  server.listen(port, process.env.HOST || '0.0.0.0', () =>
    console.log(`Pitchers API ready on http://localhost:${port}`),
  );
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    io.close();
    server.close();
    await close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
if (require.main === module)
  start().catch((error) => {
    console.error('Pitchers could not start:', error.message);
    process.exitCode = 1;
  });
module.exports = { start };
