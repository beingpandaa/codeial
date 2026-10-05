# Deployment

The repository includes render.yaml for a single Render Node service. It serves the built React app, API, and Socket.IO on one origin.

## Required account configuration

1. Create a MongoDB Atlas database with a dedicated least-privilege database user. Use a database ending in _demo for the seeded showcase. Configure Atlas network access for the application host.
2. Create a Cloudinary product environment. Set the cloud name, API key, and secret through hosting environment variables.
3. Configure Resend and a verified sender domain before enabling public registration and email recovery.
4. Connect this GitHub repository/branch in Render or create a Blueprint from render.yaml.
5. Set ORIGIN to the exact HTTPS application origin and MONGODB_URI to the Atlas connection string. Keep secrets in the hosting dashboard, never in Git.

No purchases, account upgrades, or cloud deployments are performed by this document. Check current provider limits in your account.

## Environment variables

| Variable              | Production value                                                      |
| --------------------- | --------------------------------------------------------------------- |
| NODE_ENV              | production                                                            |
| PORT                  | Supplied by the host                                                  |
| ORIGIN                | Exact HTTPS site origin                                               |
| MONGODB_URI           | Atlas connection string                                               |
| SESSION_SECRET        | Long randomly generated secret; keep stable across ordinary deploys   |
| UPLOADS_MODE          | cloudinary                                                            |
| CLOUDINARY_CLOUD_NAME | Product environment name                                              |
| CLOUDINARY_API_KEY    | Provider API key                                                      |
| CLOUDINARY_API_SECRET | Provider secret                                                       |
| MAIL_MODE             | resend                                                                |
| RESEND_API_KEY        | Required for real email delivery                                      |
| MAIL_FROM             | Verified sender address                                               |
| ALLOW_REGISTRATION    | false for a guest/demo preview; true after mail is configured         |
| DEMO_ENABLED          | true for the fictional showcase; false to disable demonstration login |

Build: npm ci && npm run build

Start: npm start

Readiness: GET /health

Production startup rejects development media/mail adapters. The guest/demo deployment can run with registration disabled before email delivery is configured. Its recovery endpoints must not pretend mail was sent when the provider is unavailable.

## Seed the showcase

Use a secure local terminal or provider execution environment with MONGODB_URI pointing to the dedicated *_demo database and the Cloudinary credentials configured. Run npm run seed:demo.

The seed creates authenticated Cloudinary project previews when UPLOADS_MODE=cloudinary. It creates tagged fictional records and preserves untagged user data. The --reset option is restricted to dedicated demo database names and deletes tagged records only.

Never put seed passwords or database credentials into the repository. Demo sessions use named personas through a rate-limited endpoint.

## Release checks

- Verify registration, email verification, reset delivery, logout, and cookie flags on the actual HTTPS origin.
- Upload a real image, redeploy, and confirm it remains available.
- Remove access to a private-group post and confirm its media endpoint denies a new request.
- Connect two browser sessions and verify persisted notifications plus reconnection.
- Verify /health, SPA direct-link navigation, and provider logs.
- Confirm Atlas backups/export policy and keep the seed script available for the demonstration dataset.

## Rollback

Keep the last passing Git revision and its deployment. Redeploy that revision to roll back application code. This does not restore database contents. Export the demo database before an intentional data reset; restore only into a separate database and verify it before switching the application URI.

No destructive schema migration is required for this starter replacement. Any future schema changes need their own compatibility and rollback plan.

The local production smoke command is `node tests/e2e/production-smoke.cjs` after a build. It starts the production configuration against a disposable database and verifies health, SPA asset delivery and secure session cookies. Its provider placeholders do not contact external accounts and do not verify cloud media or mail. A local artifact restore check is also available in `tests/e2e/rollback-smoke.cjs`; hosted rollback still requires a real deployment and prior passing revision.

## Hosting behavior

Render's free service can spin down when idle and has an ephemeral filesystem. Atlas and Cloudinary have usage limits. Initial visits can therefore be delayed. The README and demo should make no always-on or paid-tier performance claim.

Official references: [Render free limits](https://render.com/docs/free), [Render WebSockets](https://render.com/docs/websocket), [Cloudinary access control](https://cloudinary.com/documentation/control_access_to_media), [Resend Node integration](https://resend.com/docs/send-with-nodejs).
