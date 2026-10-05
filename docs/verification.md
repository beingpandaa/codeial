# Local verification — 5 October 2026

Environment: Windows, Node.js 24.21.0, npm 11.19.0, MongoDB 7.0.24 and Chromium through Playwright. Automated runs use disposable databases and separate media directories; they do not reset the developer's persistent `.local/db`.

| Check                          | Observed result                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript/JSX ESLint          | Passed                                                                                                                          |
| API/database/seed tests        | 26-case full run passed in about 81 seconds; the additional Explore policy regression passed in a focused run (27 checks total) |
| Browser journeys               | 5/5 passed in about 59 seconds                                                                                                  |
| React production build         | Passed                                                                                                                          |
| Production configuration smoke | Startup, health, deep SPA route, JS asset and Secure/HttpOnly/SameSite session cookie passed locally                            |
| Local artifact restore         | Previous frontend build served successfully; latest build restored byte for byte                                                |
| Dependency audit               | No reported production dependency vulnerabilities at verification time                                                          |
| Visual review                  | Desktop, mobile, dark theme and project-gallery screens inspected; no mobile horizontal overflow or browser errors observed     |

The API suite exercises concurrent/repeated reactions and connections; authentication, token reuse and session revocation; cross-account ownership; membership/friendship/block privacy through posts, saves, notifications and media; private-group role/ownership operations; help-solution deletion; socket delivery/revocation; image limits and exclusive attachment; administrator provisioning; and guarded repeatable seeding that preserves genuine records.

Browser coverage includes guest discovery and seeded image loading, registration/profile/group flows, demo posting/likes/saves/comments, project screenshot creation/edit/removal, mobile theme/menu/navigation, and modal keyboard focus.

These are functional checks on a development machine, not load benchmarks or uptime measurements. The production smoke uses nonfunctional provider placeholders and makes no Cloudinary or Resend calls. Real provider delivery, HTTPS deployment behavior, public URL, and hosted rollback must be verified after the hosting accounts are set up. GitHub Actions is configured to repeat the checks; its remote result is separate from these local observations.

Run the checks from a new clone:

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
node tests/e2e/production-smoke.cjs
```

For Linux CI, install Chromium with `npx playwright install --with-deps chromium`. The first MongoDB test run may download its platform binary. To repeat the local artifact restore check, copy a passing `client/dist` into a named folder beneath `.local/test-runtime`, make a new build, and pass the saved folder to `node tests/e2e/rollback-smoke.cjs`.
