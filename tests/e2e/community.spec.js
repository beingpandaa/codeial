const { test, expect } = require('@playwright/test');
const sharp = require('sharp');

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  page.__runtimeErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.__runtimeErrors, 'No uncaught browser errors').toEqual([]);
});

async function register(page, suffix) {
  await page.goto('/signup');
  await page.getByLabel('Your name', { exact: true }).fill(`Browser ${suffix}`);
  await page.getByLabel('Username').fill(`browser_${suffix}`);
  await page.getByLabel('Email address').fill(`browser_${suffix}@example.test`);
  await page.getByLabel('Password', { exact: false }).fill('BrowserIntegration!2026');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test('visitors can explore seeded conversations, public groups and projects', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main article').first()).toBeVisible();
  const attachment = page.getByRole('img', { name: /^Attachment/ }).first();
  await attachment.scrollIntoViewIfNeeded();
  await expect.poll(() => attachment.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByLabel('Search Pitchers').fill('React');
  await page.getByLabel('Search Pitchers').press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('React');
  await expect(page.locator('main article').first()).toBeVisible();

  await page.goto('/groups');
  await page.getByLabel('Search groups').fill('React Collective');
  await page.getByRole('heading', { name: 'React Collective', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('React Collective');
  await expect(page.getByRole('button', { name: 'Join this group' })).toBeVisible();
  await page.goto('/groups/build-circle');
  await expect(page.getByRole('heading', { name: 'A small circle, a safe space' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Members', exact: true })).toHaveCount(0);

  await page.goto('/projects');
  await page.getByLabel('Search projects').fill('Tracekit');
  await page.getByRole('heading', { name: 'Tracekit', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tracekit');
  await expect(page.getByRole('heading', { name: 'The build journal' })).toBeVisible();
});

test('Maya can publish, react, save and discuss new content without changing the curated profile', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Explore as Maya' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('link', { name: 'Account settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Create a post', exact: true }).first().click();
  const composer = page.getByRole('dialog', { name: 'Share something with the community' });
  const title = composer.getByLabel('Title', { exact: true });
  await title.click();
  await title.pressSequentially('Browser journey: shipping a small improvement');
  await expect(title).toHaveValue('Browser journey: shipping a small improvement');
  await composer.getByLabel('Post content').fill('A real browser created this update. **Small steps** add up.');
  await composer.getByRole('button', { name: 'Preview Markdown' }).click();
  await expect(composer.locator('strong')).toContainText(['Maya', 'Small steps']);
  await composer.getByRole('button', { name: 'Publish post' }).focus();
  await page.keyboard.press('Tab');
  await expect(composer.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await composer.getByRole('button', { name: 'Publish post' }).click();
  await expect(composer).toHaveCount(0);
  await page.getByRole('link', { name: 'Browser journey: shipping a small improvement', exact: true }).click();
  await expect(page).toHaveURL(/\/posts\/[a-f\d]{24}$/);
  await page.getByRole('button', { name: 'Like post', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unlike post', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unsave post', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Write a comment').fill('The discussion also persists after reloading.');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.getByText('The discussion also persists after reloading.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('The discussion also persists after reloading.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlike post', exact: true })).toBeVisible();
  await page.goto('/saved');
  await expect(page.getByRole('heading', { name: 'Browser journey: shipping a small improvement' })).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByLabel('Display name')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled();
});

test('a new member updates their profile, joins a public group and requests private access', async ({ page }) => {
  await register(page, 'member');
  await page.goto('/settings');
  await page.getByLabel('Display name').fill('Browser Builder');
  await page.getByLabel('About you').fill('Learning through integration tests and thoughtful conversations.');
  await page.getByLabel('Skills').fill('React, Node.js, Testing');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status')).toContainText('Profile updated.');
  await page.goto('/u/browser_member');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Browser Builder');
  await expect(page.getByText('Learning through integration tests and thoughtful conversations.', { exact: true })).toBeVisible();
  await page.goto('/groups/react-collective');
  await page.getByRole('button', { name: 'Join this group' }).click();
  await expect(page.getByRole('button', { name: 'Share with the group' })).toBeVisible();
  await page.getByRole('button', { name: 'Leave group' }).click();
  await expect(page.getByRole('button', { name: 'Join this group' })).toBeVisible();
  await page.goto('/groups/build-circle');
  await page.getByRole('button', { name: 'Request to join' }).click();
  await expect(page.getByRole('button', { name: 'Request sent · Cancel' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A small circle, a safe space' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Members', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Request sent · Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Request to join' })).toBeVisible();
});

test('mobile navigation, persistent theme and keyboard access stay usable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore');
  await expect(page.locator('main article').first()).toBeVisible();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.locator('aside nav').getByRole('link', { name: 'Groups', exact: true }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Smaller circles');
  await expect(page.getByRole('button', { name: 'Close navigation' }).first()).not.toBeVisible();
  for (const route of ['/explore', '/groups', '/projects', '/login']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: route === '/login' ? 2 : 1 }).first()).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content, `No horizontal page overflow at ${route}`).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
  await page.goto('/explore');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);
});

test('a developer can publish a screenshot showcase and remove the image while editing', async ({ page }) => {
  await register(page, 'showcase');
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Add project', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Give your project a home' });
  await editor.getByLabel('Project name').fill('Browser Screenshot Showcase');
  await editor.getByLabel('The story behind it').fill('A real uploaded image should appear on the public showcase.');
  await editor.getByLabel('Tech stack').fill('React, Node.js');
  const image = await sharp({ create: { width: 640, height: 360, channels: 3, background: { r: 50, g: 80, b: 200 } } }).png().toBuffer();
  const chooser = page.waitForEvent('filechooser');
  await editor.getByRole('button', { name: 'Add screenshots' }).click();
  await (await chooser).setFiles({ name: 'showcase.png', mimeType: 'image/png', buffer: image });
  await expect(editor.getByRole('img', { name: 'Project screenshot 1' })).toBeVisible();
  await editor.getByRole('button', { name: 'Share your project' }).click();
  await expect(page).toHaveURL(/\/projects\/browser-screenshot-showcase/);
  const screenshot = page.getByRole('img', { name: 'Browser Screenshot Showcase screenshot 1', exact: true });
  await screenshot.scrollIntoViewIfNeeded();
  await expect.poll(() => screenshot.evaluate(element => element.naturalWidth)).toBe(640);
  const imageUrl = await screenshot.getAttribute('src');
  await page.reload();
  await expect(screenshot).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editing = page.getByRole('dialog', { name: 'Edit your project' });
  await editing.getByRole('button', { name: 'Remove screenshot 1' }).click();
  await editing.getByRole('button', { name: 'Save project' }).click();
  await expect(editing).toHaveCount(0);
  await expect(screenshot).toHaveCount(0);
  await expect.poll(async () => (await page.request.get(imageUrl)).status()).toBe(404);
});
