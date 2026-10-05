const mongoose = require('mongoose');
const argon2 = require('argon2');
const crypto = require('node:crypto');
const path = require('node:path');
const { writeDemoPreview } = require('./demo-media');
const models = require('../src/models');
const { User, Group, Membership, Project, Post, Comment, Follow, Friendship, Like, Save, Notification } =
  models;
const oid = (key) =>
  new mongoose.Types.ObjectId(
    crypto
      .createHash('sha256')
      .update('codeial-demo-v1:' + key)
      .digest('hex')
      .slice(0, 24),
  );
const root = path.resolve(__dirname, '../..');
const names = [
  'Maya Chen',
  'Alex Morgan',
  'Priya Shah',
  'Noah Williams',
  'Zara Ahmed',
  'Leo Martin',
  'Aisha Patel',
  'Sam Rivera',
  'Iris Park',
  'Arjun Mehta',
  'Chloe Brooks',
  'Omar Hassan',
  'Nina Santos',
  'Ethan Kim',
  'Amara Okafor',
  'Theo Laurent',
  'Sofia Costa',
  'Dev Malhotra',
  'Luna Reyes',
  'Kai Nakamura',
  'Anika Rao',
  'Ben Carter',
  'Dina Farouk',
  'Eli Thompson',
  'Fatima Ali',
  'Gabriel Silva',
  'Hana Lee',
  'Ivan Petrov',
  'Jules Laurent',
  'Kavya Nair',
  'Liam Wilson',
  'Mei Tan',
  'Nikhil Joshi',
  'Olivia Reed',
  'Pavel Novak',
  'Quinn Foster',
  'Riya Kapoor',
  'Sasha Ivanova',
  'Tara Singh',
  'Will Evans',
];
const skills = [
  ['React', 'TypeScript', 'Accessibility'],
  ['Node.js', 'MongoDB', 'APIs'],
  ['Python', 'Data', 'SQL'],
  ['CSS', 'Design systems', 'React'],
  ['Go', 'Distributed systems', 'AWS'],
  ['JavaScript', 'Testing', 'Open source'],
];
const bios = [
  'Building useful things, one small release at a time. Currently exploring accessible interfaces.',
  'Backend developer who enjoys clean APIs, good documentation, and weekend side projects.',
  'Learning in public. Sharing the experiments, mistakes, and small wins along the way.',
  'Turning messy ideas into friendly software. Always happy to review a first pull request.',
  'Curious about what happens behind the request. Databases, queues, and reliability.',
];
const groupData = [
  [
    'React Collective',
    'react-collective',
    'A friendly corner for React patterns, component design, and questions.',
    'public',
  ],
  [
    'Node.js Guild',
    'nodejs-guild',
    'APIs, background jobs, debugging, and everything on the server.',
    'public',
  ],
  ['UI Craft', 'ui-craft', 'Small details that make interfaces feel considered and accessible.', 'public'],
  [
    'System Design Club',
    'system-design-club',
    'Understand the tradeoffs behind scalable, reliable applications.',
    'public',
  ],
  [
    'Open Source Lab',
    'open-source-lab',
    'Find a first issue, share a project, and help maintainers.',
    'public',
  ],
  [
    'First PR Club',
    'first-pr-club',
    'A welcoming place for new contributors. No question is too small.',
    'public',
  ],
  [
    'Build Circle',
    'build-circle',
    'A small, private circle for thoughtful feedback on work in progress.',
    'private',
  ],
  [
    'Launch Lab',
    'launch-lab',
    'Private release planning and constructive feedback before launch.',
    'private',
  ],
];
const projectData = [
  [
    'Pitchers',
    'A home for developers who build, learn, and help each other.',
    ['React', 'Node.js', 'MongoDB'],
  ],
  [
    'Focusboard',
    'A calm workspace for a busy mind. Organize your next small win.',
    ['React', 'CSS', 'IndexedDB'],
  ],
  [
    'Tracekit',
    'A tiny request tracing dashboard for local API development.',
    ['Node.js', 'Express', 'SQLite'],
  ],
  [
    'Sprout UI',
    'Accessible, composable components for thoughtful products.',
    ['React', 'CSS', 'Accessibility'],
  ],
  [
    'Readwise Garden',
    'Collect reading notes and connect ideas across books.',
    ['JavaScript', 'Markdown', 'Search'],
  ],
  ['Parcel Path', 'An order timeline that explains where every package is.', ['Node.js', 'Queues', 'SQL']],
  ['Pocket Weather', 'A lightweight weather dashboard designed for small screens.', ['React', 'APIs', 'CSS']],
  ['Commit Canvas', 'Turn a project history into a readable visual story.', ['SVG', 'Git', 'JavaScript']],
  ['Query Lab', 'A playground for understanding indexes and query plans.', ['SQL', 'Node.js', 'Charts']],
  ['Tiny Uptime', 'Understand your service health without a noisy dashboard.', ['Go', 'HTTP', 'Monitoring']],
  ['Habit Grove', 'A gentle habit tracker that celebrates consistency.', ['React', 'Local storage', 'PWA']],
  ['Token Studio', 'An open source design token explorer for frontend teams.', ['CSS', 'JSON', 'React']],
  [
    'Form Friend',
    'Accessible forms with clear errors and useful validation.',
    ['React', 'Testing', 'Accessibility'],
  ],
  [
    'Queue View',
    'See retries and dead-letter messages in one small dashboard.',
    ['Node.js', 'Queues', 'React'],
  ],
  ['Study Circle', 'Share notes and discuss what you learned this week.', ['React', 'MongoDB', 'Node.js']],
  ['API Atlas', 'A searchable catalog of useful public APIs and examples.', ['Express', 'React', 'Search']],
  ['Byte Budget', 'Understand where your frontend bundle gets its weight.', ['JavaScript', 'Vite', 'Charts']],
  ['Pixel Pantry', 'A collection of original CSS patterns and layout recipes.', ['CSS', 'HTML', 'Design']],
  ['Release Notes', 'A friendly changelog for independent makers.', ['Markdown', 'React', 'Node.js']],
  ['Local Lens', 'Inspect network requests while building a frontend.', ['JavaScript', 'HTTP', 'Devtools']],
];
const stories = [
  [
    'build',
    'Shipped a calmer way to track what I’m building',
    'I finally connected the feed, project pages, and comments in Pitchers. The most useful change was adding proper empty states before adding more features.\n\nSmall detail I’m proud of: loading never moves the entire page around. What is one interaction you always polish before a release?',
    ['react', 'buildinpublic', 'ui'],
  ],
  [
    'learning',
    'The index that made my feed query predictable',
    'Today I learned why a cursor needs a stable tie-breaker. Two posts can have the same timestamp, so I now sort by createdAt and id together.\n\nIt is a small change, but pagination is much easier to reason about. I wrote a test with identical timestamps to make sure nothing disappears.',
    ['mongodb', 'backend', 'learning'],
  ],
  [
    'help',
    'Why does my session disappear after refreshing?',
    'Login works until I reload the page. My React app and Express server run on different ports locally.\n\nI am checking the cookie flags and whether fetch sends credentials. Has anyone got a minimal setup that keeps this understandable?',
    ['nodejs', 'authentication', 'help'],
  ],
  [
    'discussion',
    'What makes a side project worth coming back to?',
    'For me it is seeing someone actually use one tiny feature. I have started writing a short weekly note instead of trying to finish everything at once.\n\nWhat keeps your projects moving after the first exciting weekend?',
    ['community', 'sideprojects'],
  ],
  [
    'build',
    'A first pass at an accessible command menu',
    'The keyboard interactions now work: open, navigate, select, and return focus to the button. Screen reader announcements were the part I had to slow down for.\n\nNext step is trying it with people who use different input methods.',
    ['accessibility', 'react', 'design'],
  ],
  [
    'learning',
    'A retry is a new attempt, not a new order',
    'Working through a payment simulation taught me to separate a request from the business operation. The same idempotency key should return the same result.\n\nI added a unique constraint and tested two requests at the same time. That test found more than my happy-path demo ever did.',
    ['systemdesign', 'apis', 'testing'],
  ],
  [
    'help',
    'How would you explain this slow query?',
    'I have a list that filters by owner and sorts newest first. It is quick with 20 rows but slows down once I seed a realistic dataset.\n\nI am learning to read the query plan before adding more indexes. What signals do you look for first?',
    ['database', 'performance', 'help'],
  ],
  [
    'discussion',
    'A small README improvement that helped a contributor',
    'I added the expected output under each setup command and included one screenshot of the running app. A new contributor got through setup without a call.\n\nDocumentation is part of the interface. What is the first thing you wish every project README explained?',
    ['opensource', 'documentation'],
  ],
  [
    'build',
    'The empty state is finally useful',
    'Instead of a blank panel, a new user now sees an example and one clear action. I also made sure failed requests have a retry button.\n\nThe application feels more complete even though the main feature list has not changed.',
    ['ux', 'frontend', 'buildinpublic'],
  ],
  [
    'learning',
    'Understanding the difference between a queue and a topic',
    'A queue helps workers share a job. A topic helps multiple independent consumers react to the same event.\n\nI sketched an order flow with separate inventory and notification subscribers. The picture made the tradeoff much clearer than memorizing service names.',
    ['systemdesign', 'queues', 'learning'],
  ],
  [
    'help',
    'Testing a component that fetches data',
    'My test passes when I check for a spinner but fails when I wait for the response. I suspect I am asserting too early.\n\nI want to test the behavior a user sees: loading, the result, and a useful error. How do you keep these tests readable?',
    ['testing', 'react', 'help'],
  ],
  [
    'discussion',
    'Show us your smallest useful developer tool',
    'Mine is a script that checks example environment variables against the ones used in code. It has prevented several confusing setup sessions.\n\nSmall scripts count as projects too. Share something you made that saves a few minutes every week.',
    ['tools', 'community', 'opensource'],
  ],
  [
    'build',
    'Image uploads now survive a deployment',
    'I moved uploaded files out of the application directory and stored media references in the database. Private images still go through an authorization check.\n\nNext I’m adding a size limit and a friendly upload progress state.',
    ['nodejs', 'security', 'buildinpublic'],
  ],
  [
    'learning',
    'CSS grid made this layout much simpler',
    'The desktop view has navigation, content, and a discovery column. On a phone it collapses into one readable stream.\n\nI used minmax(0, 1fr) for the main column and finally stopped long code snippets from stretching the whole page.',
    ['css', 'responsive', 'learning'],
  ],
  [
    'help',
    'What belongs in a good error response?',
    'I am building a small REST API and want validation errors to be consistent. The UI needs something useful to show, while logs need enough context to debug.\n\nWould you keep a machine-readable code alongside the message?',
    ['apis', 'nodejs', 'help'],
  ],
  [
    'discussion',
    'One thing you learned from reviewing someone else’s code',
    'I noticed a teammate checked permissions inside the service, not just in the button visibility. We added a test that calls the endpoint directly as another user.\n\nA short review turned into a much stronger feature.',
    ['codereview', 'security', 'learning'],
  ],
  [
    'build',
    'My first contribution was a documentation fix',
    'I updated an example that no longer matched the latest API and added a small regression test. The maintainer explained how they review changes.\n\nIf you are waiting for a big idea before contributing, a clear reproduction or documentation fix is a great start.',
    ['opensource', 'firstpr', 'buildinpublic'],
  ],
  [
    'learning',
    'Why my notification count doubled',
    'The client retried a request after a timeout, and I created the notification twice. A stable event key and a unique index fixed the duplicate.\n\nI now test repeated requests on purpose instead of hoping they never happen.',
    ['backend', 'testing', 'learning'],
  ],
  [
    'help',
    'How do you preserve focus after closing a dialog?',
    'Keyboard navigation works inside my edit dialog, but focus gets lost when it closes. I want it to return to the edit button.\n\nI am keeping the trigger reference and checking escape-key behavior too. Any good test cases I should include?',
    ['accessibility', 'frontend', 'help'],
  ],
  [
    'discussion',
    'Shipping something small this weekend',
    'I’m aiming for a searchable project page with a clear README. No extra features until someone can run it from a fresh clone.\n\nWhat is your small, concrete finish line this week?',
    ['buildinpublic', 'community'],
  ],
  [
    'build',
    'A better saved-posts page',
    'Saved items now remember the post, not a copied snapshot of its contents. If access changes, the saved list checks permissions again.\n\nThat made the UI a little more work, but the behavior is much easier to explain.',
    ['security', 'react', 'backend'],
  ],
  [
    'learning',
    'A health endpoint should say whether the app can serve requests',
    'I split a process-is-running check from database readiness. A successful startup message alone did not tell me the dependency was ready.\n\nI tested what happens when the database connection drops, including the error a visitor sees.',
    ['devops', 'reliability', 'learning'],
  ],
  [
    'help',
    'When should I use a background worker?',
    'My order request sends an email and updates a dashboard. If the email service is slow, the whole request feels slow.\n\nI’m considering moving notifications to a queue while keeping the order transaction synchronous. What failure cases should I model?',
    ['queues', 'systemdesign', 'help'],
  ],
  [
    'discussion',
    'What would you remove from your first project?',
    'I would remove three libraries I added before understanding the problem they solved. Fewer moving parts made debugging and explaining the project much easier.\n\nWhat did you simplify after the first version?',
    ['architecture', 'learning', 'community'],
  ],
];
const comments = [
  'This is a useful example. I would start with a small reproduction and write down the expected behavior before changing the code.',
  'Check the request in the network panel, including the response headers. It often makes this kind of problem much easier to see.',
  'I ran into this too. Testing the failure case and the retry separately helped me find the actual issue.',
  'The clear explanation is appreciated. Could you share how you verified the behavior after a page refresh?',
  'Nice progress. The empty and error states make a big difference when someone tries a project for the first time.',
  'One edge case worth covering: what happens when two people perform the action at the same time?',
  'For the session issue, send credentials with fetch and use a development proxy so browser requests share one origin.',
  'A compound index matching the filter and sort is worth testing. Compare the query plan before and after, using the same dataset.',
  'I like that the solution stays small. A short test describing the behavior would make a great addition to the project README.',
  'Thanks for sharing the tradeoff as well as the implementation. That is usually the most interesting part to discuss.',
  'I tried the same approach in a small demo and it made debugging much less surprising.',
  'The next useful experiment might be to deliberately disconnect the dependency and observe what a user sees.',
];
async function put(Model, key, fields) {
  const createdAt = fields.createdAt || new Date();
  return Model.findOneAndUpdate(
    { _id: oid(key) },
    { $setOnInsert: { ...fields, seedKey: key, createdAt, updatedAt: createdAt } },
    { upsert: true, new: true, setDefaultsOnInsert: true, timestamps: false },
  );
}
async function seedDemo({ reset = false } = {}) {
  const dbName = mongoose.connection.name || '';
  if (!dbName.endsWith('_demo'))
    throw new Error('Seeding is allowed only in a dedicated database whose name ends in _demo.');
  await Promise.all(Object.values(models).map((model) => model.init()));
  if (reset) {
    for (const model of Object.values(models))
      if (model.schema.path('seedKey')) await model.deleteMany({ seedKey: { $exists: true } });
  }
  if (
    (await Post.countDocuments({ seedKey: /^post:/ })) >= 180 &&
    (await User.countDocuments({ seedKey: /^user:/ })) >= 40
  ) {
    console.log('Demo dataset already present; genuine user content preserved.');
    return;
  }
  const passwordHash = await argon2.hash(process.env.DEMO_PASSWORD || crypto.randomBytes(32).toString('hex'));
  const users = [];
  for (let i = 0; i < names.length; i++) {
    const username = i === 0 ? 'maya' : i === 1 ? 'alex' : names[i].toLowerCase().replace(/[^a-z]/g, '');
    users.push(
      await put(User, 'user:' + username, {
        name: names[i],
        username,
        email: username + '@demo.codeial.test',
        passwordHash,
        bio: bios[i % bios.length],
        skills: skills[i % skills.length],
        avatarUrl: '/avatars/avatar-' + (i + 1) + '.svg',
        isDemo: true,
        emailVerified: true,
      }),
    );
  }
  const groups = [];
  const groupUsers = [];
  for (let i = 0; i < groupData.length; i++) {
    const [name, slug, description, visibility] = groupData[i];
    const owner = users[i * 3];
    const group = await put(Group, 'group:' + i, {
      name,
      slug,
      description,
      visibility,
      owner: owner._id,
      rules:
        'Be kind. Share enough context to help. Respect privacy. Credit the work of others. Keep promotional posts relevant.',
    });
    groups.push(group);
    const indices = [
      ...new Set([i * 3, 0, 1, ...Array.from({ length: 10 }, (_, j) => (i * 4 + j) % users.length)]),
    ];
    groupUsers.push(indices.map((j) => users[j]));
    for (const j of indices)
      await put(Membership, 'member:' + i + ':' + j, {
        group: group._id,
        user: users[j]._id,
        role: j === i * 3 ? 'owner' : j === indices[3] ? 'moderator' : 'member',
        status: 'active',
      });
    if (visibility === 'private')
      await put(Membership, 'pending:' + i, {
        group: group._id,
        user: users[39]._id,
        role: 'member',
        status: 'pending',
      });
  }
  const projects = [];
  for (let i = 0; i < projectData.length; i++) {
    const [title, description, stack] = projectData[i];
    const projectId = oid('project:' + i);
    const imageId = await writeDemoPreview({
      mediaId: oid('project-media:' + i),
      seedKey: 'project-media:' + i,
      project: projectId,
      owner: users[i]._id,
      label: title,
      index: i,
    });
    projects.push(
      await put(Project, 'project:' + i, {
        title,
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description,
        stack,
        owner: users[i]._id,
        githubUrl: i === 0 ? 'https://github.com/beingpandaa/codeial' : '',
        liveUrl: '',
        media: [imageId],
      }),
    );
  }
  const base = Date.now();
  for (let i = 0; i < 180; i++) {
    const story = stories[i % stories.length];
    const [type, title, body, tags] = story;
    const groupIndex = i > 8 && i % 3 === 0 ? i % groups.length : -1;
    const author =
      groupIndex >= 0 ? groupUsers[groupIndex][i % groupUsers[groupIndex].length] : users[i % users.length];
    const project = type === 'build' ? projects.find((p) => String(p.owner) === String(author._id)) : null;
    const postId = oid('post:' + i);
    const imageIds = [];
    if (type === 'build' && i < 80) {
      const mediaId = oid('media:' + i);
      await writeDemoPreview({
        mediaId,
        seedKey: 'media:' + i,
        owner: author._id,
        post: postId,
        label: project ? project.title : 'A little progress, every day',
        index: Math.floor(i / 4),
      });
      imageIds.push(mediaId);
    }
    const post = await put(Post, 'post:' + i, {
      author: author._id,
      type,
      title,
      body,
      tags,
      visibility: groupIndex >= 0 ? 'group' : i % 17 === 16 ? 'friends' : 'public',
      group: groupIndex >= 0 ? groups[groupIndex]._id : null,
      project: project?._id || null,
      media: imageIds,
      createdAt: new Date(base - i * 43 * 60000),
    });
    const commenters = groupIndex >= 0 ? groupUsers[groupIndex] : users;
    for (let j = 0; j < 2 + (i % 4); j++) {
      const commenter = commenters[(i + j + 1) % commenters.length];
      const comment = await put(Comment, 'comment:' + i + ':' + j, {
        author: commenter._id,
        post: post._id,
        body: comments[(i + j) % comments.length],
        parent: j === 3 ? oid('comment:' + i + ':0') : null,
        createdAt: new Date(base - i * 43 * 60000 + (j + 1) * 60000),
      });
      if (type === 'help' && i % 8 === 2 && j === 0)
        await Post.updateOne({ _id: post._id }, { $set: { status: 'solved', solutionComment: comment._id } });
    }
    for (let j = 0; j < 3 + (i % 8); j++) {
      const liker = commenters[(i + j) % commenters.length];
      await put(Like, 'like:' + i + ':' + j, { user: liker._id, targetType: 'post', target: post._id });
    }
    if (post.visibility === 'public' && i % 5 === 0)
      await put(Save, 'save:' + i, { user: users[0]._id, post: post._id });
  }
  for (let i = 0; i < users.length; i++) {
    for (let j = 1; j <= 3; j++)
      await put(Follow, 'follow:' + i + ':' + j, {
        from: users[i]._id,
        to: users[(i + j) % users.length]._id,
      });
    if (i > 0 && i < 12) {
      const ids = [String(users[0]._id), String(users[i]._id)].sort();
      await put(Friendship, 'friend:' + i, {
        requester: users[i]._id,
        recipient: users[0]._id,
        pairKey: ids.join(':'),
        status: i < 9 ? 'accepted' : 'pending',
      });
    }
  }
  for (let i = 1; i <= 5; i++)
    await put(Notification, 'notification:' + i, {
      user: users[0]._id,
      actor: users[i]._id,
      kind: 'comment',
      post: oid('post:0'),
      comment: oid('comment:0:0'),
      dedupeKey: 'seed:notification:' + i,
    });
  console.log(
    'Seeded 40 fictional developers, 8 groups, 20 projects, and 180 posts. Demo logins: Maya and Alex.',
  );
}
if (require.main === module) {
  if (require('node:fs').existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
  if (!process.env.MONGODB_URI) {
    console.error('Set MONGODB_URI to a dedicated *_demo database, or run npm run dev.');
    process.exitCode = 1;
  } else
    mongoose
      .connect(process.env.MONGODB_URI)
      .then(() => seedDemo({ reset: process.argv.includes('--reset') }))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      })
      .finally(() => mongoose.disconnect());
}
module.exports = { seedDemo };
