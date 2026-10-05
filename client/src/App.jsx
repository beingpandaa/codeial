import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  Braces,
  Check,
  ChevronDown,
  Code2,
  Compass,
  House,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { api, listItems } from './api';
import { useSession } from './session';
import { Avatar, Composer, Empty, Spinner, UserRow, useAction } from './components';
import { FeedPage, PostPage, NotificationsPage, AdminPage } from './pages/Feed';
import { AuthPage, ProfilePage, FriendsPage, SettingsPage } from './pages/Accounts';
import { GroupsPage, GroupPage, ProjectsPage, ProjectPage } from './pages/Community';
import s from './ui.module.css';

const navigation = [
  { to: '/home', label: 'My feed', icon: House },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/friends', label: 'Connections', icon: UsersRound },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/projects', label: 'Projects', icon: Code2 },
  { to: '/saved', label: 'Saved posts', icon: Bookmark },
];

function Brand({ light = false }) {
  return (
    <Link to="/explore" className={`${s.brand} ${light ? s.brandLight : ''}`} aria-label="Pitchers home">
      <img className={s.brandIcon} src="/brand/pitchers-mark.svg" alt="" />
      <span>
        Pitchers<span className={s.brandDot}>.</span>
      </span>
    </Link>
  );
}

function DiscoveryRail() {
  const { user } = useSession();
  const groups = useQuery({ queryKey: ['groups', 'discovery'], queryFn: () => api('/groups') });
  const people = useQuery({ queryKey: ['users', 'discovery'], queryFn: () => api('/users') });
  const action = useAction();
  const navigate = useNavigate();
  return (
    <aside className={s.discoveryRail} aria-label="Discover your community">
      <div className={s.buildCard}>
        <span className={s.smallOverline}>GOOD THINGS TAKE SHARING</span>
        <h2>
          Your next idea
          <br />
          starts with a<br />
          <em>conversation.</em>
        </h2>
        <div className={s.buildIllustration} aria-hidden="true">
          <div className={s.windowIllustration}>
            <span>● ● ●</span>
            <pre>
              <b>const</b> tomorrow = {'{'}
              <br /> build: <i>true</i>,<br /> together: <i>true</i>
              <br />
              {'}'};
            </pre>
          </div>
          <span className={s.illustrationStar}>✳</span>
          <span className={s.illustrationArrow}>↗</span>
        </div>
        <Link to="/projects">
          See what people are building <ArrowUpRight size={16} />
        </Link>
      </div>
      <section className={s.railSection}>
        <div className={s.railHeading}>
          <h3>Find your people</h3>
          <Link to="/friends" aria-label="Explore developers">
            <ArrowUpRight size={17} />
          </Link>
        </div>
        {listItems(people.data)
          .filter((person) => person.id !== user?.id)
          .slice(0, 3)
          .map((person) => (
            <UserRow
              key={person.id}
              user={person}
              subtitle={person.skills?.slice(0, 2).join(' · ') || 'Developer'}
            >
              <button
                className={s.followButton}
                disabled={action.busy}
                aria-label={`Follow ${person.name}`}
                onClick={() =>
                  user
                    ? action.run(
                        () => api(`/users/${person.id}/follow`, { method: 'PUT' }),
                        `Following ${person.name}.`,
                      )
                    : navigate('/login')
                }
              >
                <Plus size={15} />
              </button>
            </UserRow>
          ))}
      </section>
      <section className={s.railSection}>
        <div className={s.railHeading}>
          <h3>Spaces to belong</h3>
          <Link to="/groups">View all</Link>
        </div>
        {listItems(groups.data)
          .slice(0, 3)
          .map((group, index) => (
            <Link className={s.railGroup} key={group.id} to={`/groups/${group.slug}`}>
              <span className={`${s.groupMiniIcon} ${s[`groupColor${index}`]}`}>
                <Braces size={20} />
              </span>
              <span>
                <strong>{group.name}</strong>
                <small>
                  {group.memberCount || 0} members · {group.visibility}
                </small>
              </span>
              <ArrowUpRight size={14} />
            </Link>
          ))}
      </section>
      <section className={s.communityNote}>
        <Sparkles size={17} />
        <p>
          A place to build in public.
          <br />
          Be curious. Be kind. Keep going.
        </p>
      </section>
      <footer className={s.railFooter}>
        <span>Pitchers © {new Date().getFullYear()}</span>
        <span>Built for the builders.</span>
        <span className={s.demoNotice}>Demo profiles & sample community activity</span>
      </footer>
    </aside>
  );
}

function Layout() {
  const { user, loading, logout, notify, toast, dismissToast, theme, toggleTheme } = useSession();
  const [compose, setCompose] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarRef = useRef();
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen || !window.matchMedia('(max-width: 760px)').matches) return undefined;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const nodes = () =>
      [...sidebarRef.current.querySelectorAll('a[href],button:not(:disabled)')].filter(
        (node) => node.getClientRects().length,
      );
    nodes()[0]?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key === 'Tab') {
        const elements = nodes();
        if (event.shiftKey && document.activeElement === elements[0]) {
          event.preventDefault();
          elements.at(-1)?.focus();
        }
        if (!event.shiftKey && document.activeElement === elements.at(-1)) {
          event.preventDefault();
          elements[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus?.();
    };
  }, [mobileOpen]);
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api('/notifications'),
    enabled: !!user,
    refetchInterval: 60000,
  });
  const unread = listItems(notifications.data).filter((item) => !item.readAt && !item.isRead).length;
  const myGroups = useQuery({
    queryKey: ['groups', 'sidebar'],
    queryFn: () => api('/groups'),
    enabled: !!user,
  });
  const isAuth = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email'].includes(
    location.pathname,
  );
  async function signOut() {
    try {
      await logout();
      navigate('/explore');
      notify('You have signed out.');
    } catch (error) {
      notify(error.message);
    }
  }
  function openComposer() {
    user ? setCompose(true) : navigate('/login');
    setMobileOpen(false);
  }
  return (
    <div className={s.app}>
      {mobileOpen && (
        <button
          className={s.sidebarBackdrop}
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside ref={sidebarRef} className={`${s.sidebar} ${mobileOpen ? s.sidebarOpen : ''}`}>
        <div className={s.sidebarBrand}>
          <Brand />
          <button
            className={`${s.iconButton} ${s.mobileOnly}`}
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <span className={s.sidebarLabel}>YOUR COMMUNITY</span>
        <nav className={s.nav}>
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `${s.navLink} ${isActive || (to === '/explore' && location.pathname === '/') ? s.navActive : ''}`
              }
            >
              <Icon size={20} strokeWidth={1.7} />
              <span>{label}</span>
              {to === '/explore' && <span className={s.navActiveDot} />}
            </NavLink>
          ))}
          <NavLink
            to="/notifications"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `${s.navLink} ${isActive ? s.navActive : ''}`}
          >
            <Bell size={20} strokeWidth={1.7} />
            <span>Notifications</span>
            {unread > 0 && <span className={s.countBadge}>{unread > 9 ? '9+' : unread}</span>}
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => `${s.navLink} ${isActive ? s.navActive : ''}`}>
              <ShieldCheck size={20} />
              <span>Moderation</span>
            </NavLink>
          )}
        </nav>
        <button className={s.newPostButton} onClick={openComposer}>
          <Plus size={19} />
          Create a post
        </button>
        {user && (
          <div className={s.sidebarGroups}>
            <div className={s.sidebarLabel}>
              YOUR SPACES{' '}
              <Link to="/groups" aria-label="Browse groups">
                <Plus size={14} />
              </Link>
            </div>
            {listItems(myGroups.data)
              .filter((group) => ['owner', 'moderator', 'member'].includes(group.membership))
              .slice(0, 4)
              .map((group, index) => (
                <Link
                  onClick={() => setMobileOpen(false)}
                  className={s.sidebarGroup}
                  key={group.id}
                  to={`/groups/${group.slug}`}
                >
                  <span className={`${s.groupDot} ${s[`groupColor${index % 3}`]}`}>#</span>
                  {group.name}
                </Link>
              ))}
          </div>
        )}
        <div className={s.sidebarBottom}>
          <div className={s.sidebarEncouragement}>
            <span>✳</span>
            <p>
              A little progress,
              <br />
              <strong>every single day.</strong>
            </p>
          </div>
          {user ? (
            <div className={s.sidebarAccount}>
              <Link to={`/u/${user.username}`} className={s.author}>
                <Avatar user={user} />
                <span>
                  <strong>{user.name}</strong>
                  <small>@{user.username}</small>
                </span>
              </Link>
              <button className={s.iconButton} title="Sign out" aria-label="Sign out" onClick={signOut}>
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Link to="/login" className={s.sidebarSignIn}>
              Make yourself at home <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </aside>
      <div className={s.workspace}>
        <header className={s.topbar}>
          <button
            className={`${s.iconButton} ${s.mobileOnly}`}
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={22} />
          </button>
          <form
            className={s.globalSearch}
            onSubmit={(event) => {
              event.preventDefault();
              navigate(`/explore?search=${encodeURIComponent(search.trim())}`);
            }}
          >
            <Search size={18} />
            <input
              aria-label="Search Pitchers"
              placeholder="Search posts, people, and ideas…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <div className={s.topbarActions}>
            <span className={s.previewPill}>COMMUNITY PREVIEW</span>
            <button
              className={s.iconButton}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              onClick={toggleTheme}
            >
              {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <Link
              to="/notifications"
              className={s.notificationButton}
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            >
              <Bell size={20} />
              {unread > 0 && <span />}
            </Link>
            {user ? (
              <Link className={s.topbarProfile} to="/settings" aria-label="Account settings">
                <Avatar user={user} size="small" />
                <ChevronDown size={13} />
              </Link>
            ) : (
              <Link to="/login" className={s.smallPrimary}>
                Sign in <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
        </header>
        <div className={`${s.contentLayout} ${isAuth ? s.authLayout : ''}`}>
          <main className={s.main} id="main-content">
            {loading ? <Spinner /> : <Outlet />}
          </main>
          {!isAuth && <DiscoveryRail />}
        </div>
      </div>
      <nav className={s.mobileBottomNav} aria-label="Quick navigation">
        <NavLink to="/explore" aria-label="Explore">
          <Compass size={22} />
        </NavLink>
        <NavLink to="/groups" aria-label="Groups">
          <Users size={22} />
        </NavLink>
        <button aria-label="Create a post" onClick={openComposer}>
          <Plus size={24} />
        </button>
        <NavLink to="/saved" aria-label="Saved posts">
          <Bookmark size={22} />
        </NavLink>
        <NavLink to={user ? `/u/${user.username}` : '/login'} aria-label="Your profile">
          <Avatar user={user} size="tiny" />
        </NavLink>
      </nav>
      {compose && <Composer onClose={() => setCompose(false)} />}
      {toast && (
        <div key={toast.key} className={s.toast} role="status">
          <Check size={17} />
          <span>{toast.message}</span>
          <button aria-label="Dismiss notification" onClick={dismissToast}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <>
      <a className={s.skipLink} href="#main-content">
        Skip to content
      </a>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<FeedPage />} />
          <Route path="explore" element={<FeedPage />} />
          <Route path="home" element={<FeedPage mode="home" />} />
          <Route path="saved" element={<FeedPage mode="saved" />} />
          <Route path="posts/:id" element={<PostPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="login" element={<AuthPage mode="login" />} />
          <Route path="signup" element={<AuthPage mode="signup" />} />
          <Route path="forgot-password" element={<AuthPage mode="forgot" />} />
          <Route path="reset-password" element={<AuthPage mode="reset" />} />
          <Route path="verify-email" element={<AuthPage mode="verify" />} />
          <Route path="u/:username" element={<ProfilePage />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="groups/:slug" element={<GroupPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:slug" element={<ProjectPage />} />
          <Route
            path="*"
            element={
              <Empty
                title="Looks like a wrong turn"
                description="This page may have moved. There is plenty more to discover."
              >
                <Link className={s.primaryButton} to="/explore">
                  Back to the community
                </Link>
              </Empty>
            }
          />
        </Route>
      </Routes>
    </>
  );
}
