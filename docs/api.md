# Pitchers API

Base path: `/api/v1`. All application endpoints return JSON except image streaming. `/health` returns `{ "status": "ready", "service": "codeial-api" }` when MongoDB is connected, or HTTP 503 otherwise. The internal service identifier retains the original repository name.

## Conventions

- Success: `{ "data": ... }`. List endpoints return `{ "data": { "items": [], "nextCursor": null } }`.
- Error: `{ "error": { "code": "VALIDATION", "message": "A useful explanation" } }` with an appropriate HTTP status.
- IDs are MongoDB ObjectId strings. Read profiles by username and groups/projects by slug; mutations use their IDs.
- Send cookies with requests. First call `GET /auth/session`; send its `data.csrfToken` in `X-CSRF-Token` for every POST, PUT, PATCH and DELETE, including login. Authentication rotates the session and returns a replacement token.
- Paginated endpoints accept `cursor` and return up to 20 items per page. Treat the returned cursor as opaque. Authorization is evaluated again on each page; a saved item or notification never bypasses it.
- HTML is not accepted as executable content. Post bodies support Markdown and fenced code snippets in the React renderer.
- Common statuses: 400 invalid input, 401 expired/missing session, 403 forbidden or unavailable feature, 404 missing/inaccessible content, 409 conflicting concurrent operation, 413 upload limit, 429 throttled, 503 dependency/configuration unavailable.

## Accounts and profiles

| Method and path                  | Body / query                                              | Behavior                                                                   |
| -------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| GET `/auth/session`              | —                                                         | Current user or null, CSRF token, registration/demo/recovery feature flags |
| POST `/auth/register`            | `name, username, email, password`                         | Creates a normal account and session; sends/captures verification mail     |
| POST `/auth/login`               | `email, password`                                         | Starts a new session                                                       |
| POST `/auth/demo`                | `persona: "maya"` or `"alex"`                             | Starts a restricted fictional persona session when enabled                 |
| POST `/auth/logout`              | —                                                         | Destroys the current session and disconnects its sockets                   |
| POST `/auth/forgot-password`     | `email`                                                   | Generic eligibility response; unavailable/failed delivery returns 503      |
| POST `/auth/reset-password`      | `token, password`                                         | Consumes a single-use token and revokes prior sessions                     |
| POST `/auth/verify-email`        | `token`                                                   | Verifies the account                                                       |
| POST `/auth/resend-verification` | —                                                         | Sends a new verification link for the signed-in account                    |
| GET `/users`                     | `search, cursor`                                          | Search people and skills                                                   |
| GET `/users/:username`           | —                                                         | Profile, visible-content statistics and current relationship               |
| PATCH `/users/me`                | `name, bio, skills[], avatarUrl, githubUrl, portfolioUrl` | Updates the current profile; avatar must be an owned upload URL            |

Passwords are 10–128 characters; usernames are 3–25 letters, digits or underscores. Demo profiles cannot change credentials or curated content. Development mail is stored under ignored `.local/mail`; production requires Resend configuration for delivery.

## Connections

| Method and path                  | Behavior                                                                    |
| -------------------------------- | --------------------------------------------------------------------------- |
| GET `/relationships`             | `{ friends, incoming, outgoing, blocked }` for the signed-in account        |
| PUT / DELETE `/users/:id/follow` | Follow/unfollow independently of friendship                                 |
| POST `/users/:id/friend-request` | Request a friendship                                                        |
| POST `/users/:id/friend-accept`  | Accept an incoming request                                                  |
| DELETE `/users/:id/friend`       | Decline, cancel or remove the relationship                                  |
| PUT / DELETE `/users/:id/block`  | Block/unblock; blocking removes connections and requests in both directions |

Unblocking does not recreate removed connections. Unique indexes keep repeated relationship/reaction requests consistent.

## Posts, comments and saves

| Method and path                   | Body / query                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET `/posts`                      | `feed` is `explore`, `home` or `saved`; optional `search, type, tag, author, group, project, cursor` |
| GET `/posts/:id`                  | —                                                                                                    |
| POST `/posts`                     | `type, title, body, tags[], visibility, groupId?, projectId?, mediaIds[]`                            |
| PATCH `/posts/:id`                | `title?, body?, tags?` (author only)                                                                 |
| DELETE `/posts/:id`               | Author or authorized group moderator                                                                 |
| PUT / DELETE `/posts/:id/like`    | Returns reaction state and count                                                                     |
| PUT / DELETE `/posts/:id/save`    | Saves privately / removes the saved reference                                                        |
| GET / POST `/posts/:id/comments`  | GET paginates; POST accepts `body, parentId?`                                                        |
| PATCH / DELETE `/comments/:id`    | PATCH accepts `body`; deletion is also available to group moderators                                 |
| PUT / DELETE `/comments/:id/like` | React to a readable comment                                                                          |
| PUT `/posts/:id/solution`         | `{ "commentId": "..." }`, or `{ "commentId": null }` to reopen; help author only                     |

Post types: `build`, `learning`, `discussion`, `help`. Visibility: `public`, `friends`, `group`; group posts inherit group access. Titles are 3–180 characters, bodies 1–12,000, up to six tags and four images. A build update may link to one of its author's projects. Replies use one child level. Deleting a selected solution, or its parent thread, reopens the help request.

General Explore shows recent public posts and public-group posts. Home combines readable posts from friends, followed developers, joined groups and the current user without duplicating a post. Contextual lists for profiles, projects and groups apply current viewer access. Likes, comments, saves, media and notifications repeat access checks on the server.

## Groups and projects

| Method and path                            | Body / behavior                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| GET `/groups`                              | `search, cursor`                                                                            |
| GET `/groups/:slug`                        | Discoverable group description and current membership                                       |
| POST `/groups`                             | `name, description, rules, visibility` where visibility is `public` or `private`            |
| PATCH `/groups/:id`                        | `description?, rules?`; group moderation permissions apply                                  |
| POST `/groups/:id/join`                    | Immediate public membership or pending private request                                      |
| DELETE `/groups/:id/membership`            | Leave/cancel request; owner must transfer ownership first                                   |
| GET `/groups/:id/members`                  | Member list and authorized pending requests; private groups require membership              |
| POST `/groups/:id/members/:userId/approve` | Approve a pending request                                                                   |
| DELETE `/groups/:id/members/:userId`       | Remove a member or decline a request                                                        |
| PATCH `/groups/:id/members/:userId`        | `{ "role": "member" }` or `"moderator"`; owner only                                         |
| POST `/groups/:id/transfer`                | `{ "userId": "..." }`; transfer to an active member                                         |
| DELETE `/groups/:id`                       | Archive a group; owner only                                                                 |
| GET `/projects`                            | `search, owner, cursor`                                                                     |
| GET `/projects/:slug`                      | Showcase and screenshot URLs                                                                |
| POST / PATCH `/projects`, `/projects/:id`  | `title, description, stack[], githubUrl, liveUrl, mediaIds[]`; PATCH is partial, owner only |
| DELETE `/projects/:id`                     | Remove an owned project and revoke gallery access                                           |

Project screenshots accept at most four owned images. An image cannot simultaneously belong to a post, another project, or an avatar. Passing `mediaIds: []` removes the gallery. Omit `mediaIds` on an edit to keep it. Group visibility is fixed at creation. Public group posts can be read by guests; joining is required to create posts, comment or like within the group.

## Images, notifications and moderation

| Method and path            | Body / behavior                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| POST `/media`              | Multipart field `image`; returns an ID and application URL                                       |
| GET `/media/:id`           | Access-checked image stream; private/provider signatures are never exposed                       |
| DELETE `/media/:id`        | Delete an owned unused upload; attached/curated images are protected                             |
| GET `/notifications`       | Paginated currently readable notification history                                                |
| POST `/notifications/read` | `ids[]` to mark selected items; omit IDs to mark all read                                        |
| POST `/reports`            | `targetType` is `user`, `post`, `comment` or `group`; `targetId`, `reason` (10–1,000 characters) |
| GET `/admin/reports`       | Administrator report queue                                                                       |
| PATCH `/admin/reports/:id` | `action` is `dismiss` or `remove`; administrator only                                            |

Uploads accept JPEG, PNG, WebP or AVIF up to 5 MB, decode at most 25 million pixels, and normalize to WebP at up to 1600×1600. Limits include 100 MB per account, ten unattached uploads, and request throttles. Discard unused uploads through DELETE. Cloudinary assets use authenticated delivery through the application proxy; image responses use `Cache-Control: no-store`.

Socket.IO connects on the same origin with the session cookie. The `notification` event carries an identifier; the client reloads authorized history. History remains in MongoDB through refresh/reconnection. Current session validity and content access are checked before live delivery. Self-notifications are excluded.

## Browser example

```js
let session = (await (await fetch('/api/v1/auth/session', { credentials: 'include' })).json()).data;
const response = await fetch('/api/v1/auth/demo', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
  body: JSON.stringify({ persona: 'maya' }),
});
session = (await response.json()).data; // Keep the rotated token for later writes.
```
