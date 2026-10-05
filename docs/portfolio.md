# Pitchers walkthrough and portfolio evidence

Pitchers is a developer community built from the original Codeial starter. It uses a React client and a classic JavaScript Express modular monolith, backed by MongoDB. The application is ready for local review; public hosting and real provider verification remain launch tasks.

## A five-minute walkthrough

1. Run `npm run dev` and open `http://localhost:5173`. Browse Explore as a guest. Explain that every profile and activity count in the showcase is fictional seed data.
2. Sign in with **Explore as Maya**. Show the combined Home feed, save a post, leave a comment, and inspect connections and notifications. Demo accounts are shared and protect curated content.
3. Register a separate local account to try profile editing and create your own project with screenshots. Attach a build update to its timeline. Development verification/recovery messages are captured under `.local/mail`.
4. Create a help request. Use a second account/browser session to answer; select that answer as the solution, then reopen the question.
5. Show a private group's discoverable overview. Request membership and approve it as the owner. Demonstrate that removing membership also revokes direct post, saved-post and media access.
6. Switch to the mobile layout and dark theme. Point out keyboard focus, responsive navigation, restrained motion, and the reduced-motion alternative.

## Résumé bullets supported by the implementation

- Built Pitchers, a full-stack developer community using React, Express and MongoDB, with friendships, independent follows, public/private groups, project galleries and threaded help discussions.
- Implemented session-based authentication, CSRF protection and server-side authorization across feeds, search, bookmarks, notifications and protected media; validated access revocation with real MongoDB integration tests.
- Delivered persistent Socket.IO notifications and repeatable demo seeding for 40 fictional developers, eight groups, 20 projects and 180 posts, with desktop/mobile browser coverage and a GitHub Actions release pipeline.

Use these as draft bullets and be ready to explain the implementation. Do not claim real active users, uptime, cloud scale, latency improvements, cost savings or production deployment until those are measured. Provider adapters and deployment configuration are implemented; actual Atlas/Cloudinary/Resend/Render behavior still needs account-level verification.

## Design and brand

The chosen direction is a cool-white, cobalt and ink interface with layered surfaces, quiet shadows and fluid interaction feedback. Project artwork has subtle pointer depth; reduced-motion settings disable decorative movement. The original editable Pitchers mark, light/dark wordmarks, social image and favicons live under `client/public/brand`.

The local folder remains `D:\PROJECTS\CODEIAL`. The product title is Pitchers. Internal package names and Git history retain Codeial for continuity.

## Screenshots

Actual desktop, mobile and dark-theme screenshots are stored under `docs/screenshots`. These are separate from the earlier generated design concepts. The project images inside fictional seed posts are labelled demo artwork.

## What to discuss in an interview

- Why a modular monolith fits this release and which changes multiple replicas would require.
- Why friendship and following use separate records and why the feed cannot simply concatenate arrays.
- How unique indexes, idempotent reactions and cursor tie-breakers handle retries/concurrency.
- Why saving a reference does not preserve access to private content.
- Why private media is proxied with current authorization instead of returning a signed public URL.
- How session revocation affects HTTP requests and already-connected sockets.
- What tests prove locally and what remains unverified until a real cloud deployment.

Private chat, recommendation ranking, video and AI features are deliberately deferred.
