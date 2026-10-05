import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  Ban,
  Check,
  CheckCircle2,
  Code2,
  Github,
  Globe,
  ImagePlus,
  LockKeyhole,
  Mail,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, listItems, queryString, uploadImage } from '../api';
import { useSession } from '../session';
import {
  Avatar,
  Empty,
  ErrorState,
  Field,
  LoadMore,
  PageTitle,
  ReportButton,
  RequireAccount,
  Spinner,
  UserRow,
  useAction,
  usePagedList,
} from '../components';
import { PostsList } from './Feed';
import s from '../ui.module.css';

export function AuthPage({ mode }) {
  const { user, features, authenticate, notify } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    token: params.get('token') || '',
  });
  const titles = {
    login: 'Good to have you back.',
    signup: 'Your next chapter starts here.',
    forgot: 'Let’s get you back in.',
    reset: 'A fresh start.',
    verify: 'Make it official.',
  };
  const signupClosed = mode === 'signup' && features.registrationEnabled === false;
  const recoveryClosed = ['forgot', 'reset'].includes(mode) && features.passwordRecoveryEnabled === false;
  const subtitles = {
    login: 'A little progress. A shared discovery. Your people are here.',
    signup: 'Join the builders, the learners, and the endlessly curious.',
    forgot: 'We’ll send you a link to reset your password.',
    reset: 'Choose a strong password for your Pitchers account.',
    verify: 'Verify your email to complete your account setup.',
  };
  function field(key) {
    return { value: form[key], onChange: (event) => setForm({ ...form, [key]: event.target.value }) };
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login' || mode === 'signup') {
        await authenticate(mode === 'login' ? '/auth/login' : '/auth/register', form);
        navigate('/home');
        notify(mode === 'signup' ? 'Welcome to the community.' : 'Welcome back.');
      } else {
        await api(
          mode === 'forgot'
            ? '/auth/forgot-password'
            : mode === 'verify'
              ? '/auth/verify-email'
              : '/auth/reset-password',
          { method: 'POST', body: form },
        );
        setSent(true);
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  async function demo(persona) {
    if (features.demoEnabled === false) {
      setError('Demo sign-in is unavailable on this deployment.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authenticate('/auth/demo', { persona });
      navigate('/home');
      notify('You’re exploring with a demo profile. Say hello!');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  if (user && (mode === 'login' || mode === 'signup')) return <Navigate to="/home" replace />;
  if (signupClosed || recoveryClosed)
    return (
      <Empty
        icon={signupClosed ? Users : Mail}
        title={signupClosed ? 'Explore the community preview' : 'Email delivery is not connected yet'}
        description={
          signupClosed
            ? 'New registrations are currently closed. You can browse freely or sign in with an available demo profile.'
            : 'Password recovery will be available when this deployment has a verified email sender. Existing accounts can still sign in.'
        }
      >
        <Link className={s.primaryButton} to="/login">
          Back to sign in
        </Link>
        <Link className={s.textButton} to="/explore">
          Browse the community
        </Link>
      </Empty>
    );
  return (
    <div className={s.authPage}>
      <div className={s.authArt}>
        <span className={s.smallOverline}>FOR THE LOVE OF BUILDING</span>
        <h1>
          Good things
          <br />
          are built
          <br />
          <em>together.</em>
        </h1>
        <div className={s.authSymbol} aria-hidden="true">
          ✳
        </div>
        <p>
          Find your people. Share your progress.
          <br />
          Leave a little better than you arrived.
        </p>
        <div className={s.authArtFooter}>
          <Code2 size={20} /> A community for developers, by developers.
        </div>
      </div>
      <div className={s.authForm}>
        <div className={s.authHeading}>
          <span className={s.eyebrow}>HELLO, BUILDER</span>
          <h2>{titles[mode]}</h2>
          <p>{subtitles[mode]}</p>
        </div>
        {sent ? (
          <div className={s.successPanel}>
            <CheckCircle2 size={36} />
            <h3>
              {mode === 'forgot'
                ? 'Check your inbox'
                : mode === 'verify'
                  ? 'Email verified'
                  : 'Password updated'}
            </h3>
            <p>
              {mode === 'forgot'
                ? 'If an account exists for that address, you’ll receive a reset link. Check your inbox and spam folder.'
                : 'You’re all set. Head back to the community.'}
            </p>
            <Link className={s.primaryButton} to="/login">
              Back to sign in <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <>
            <form className={s.form} onSubmit={submit}>
              {mode === 'signup' && (
                <>
                  <Field label="Your name">
                    <input
                      {...field('name')}
                      autoComplete="name"
                      placeholder="Ada Lovelace"
                      minLength={2}
                      maxLength={70}
                      required
                    />
                  </Field>
                  <Field label="Username" hint="Letters, numbers, and underscores.">
                    <input
                      {...field('username')}
                      autoComplete="username"
                      placeholder="ada_builds"
                      pattern="[a-zA-Z0-9_]{3,25}"
                      minLength={3}
                      maxLength={25}
                      required
                    />
                  </Field>
                </>
              )}
              {['login', 'signup', 'forgot'].includes(mode) && (
                <Field label="Email address">
                  <input
                    {...field('email')}
                    autoComplete="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                  />
                </Field>
              )}
              {['login', 'signup', 'reset'].includes(mode) && (
                <Field
                  label="Password"
                  hint={
                    mode !== 'login' ? 'At least 12 characters. Make it unique to this account.' : undefined
                  }
                >
                  <input
                    {...field('password')}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    type="password"
                    minLength={mode === 'login' ? 1 : 12}
                    maxLength={128}
                    required
                    placeholder="Your password"
                  />
                </Field>
              )}
              {['reset', 'verify'].includes(mode) && !params.get('token') && (
                <Field label="Token from your email">
                  <input {...field('token')} required placeholder="Paste your email token" />
                </Field>
              )}
              {mode === 'login' && features.passwordRecoveryEnabled !== false && (
                <Link className={s.forgotLink} to="/forgot-password">
                  Forgot your password?
                </Link>
              )}
              {error && <ErrorState error={{ message: error }} />}
              <button className={s.primaryButton} disabled={busy}>
                {busy
                  ? 'One moment…'
                  : mode === 'login'
                    ? 'Sign in'
                    : mode === 'signup'
                      ? 'Create your account'
                      : mode === 'forgot'
                        ? 'Send reset link'
                        : mode === 'verify'
                          ? 'Verify email'
                          : 'Update password'}
                <ArrowRight size={16} />
              </button>
            </form>
            {['login', 'signup'].includes(mode) && (
              <>
                <div className={s.orDivider}>
                  <span />
                  or take a look around
                  <span />
                </div>
                <div className={s.demoButtons}>
                  <button
                    className={s.outlineButton}
                    disabled={busy || features.demoEnabled === false}
                    onClick={() => demo('maya')}
                  >
                    <Sparkles size={15} />
                    Explore as Maya
                  </button>
                  <button
                    className={s.outlineButton}
                    disabled={busy || features.demoEnabled === false}
                    onClick={() => demo('alex')}
                  >
                    Explore as Alex
                  </button>
                </div>
                <p className={s.demoHint}>Sample profiles. Real features. No signup needed.</p>
                <p className={s.authSwitch}>
                  {mode === 'login' ? 'New around here?' : 'Already part of the community?'}{' '}
                  <Link to={mode === 'login' ? '/signup' : '/login'}>
                    {mode === 'login' ? 'Join Pitchers' : 'Sign in'}
                  </Link>
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RelationshipButtons({ profile }) {
  const { user } = useSession();
  const action = useAction();
  const navigate = useNavigate();
  const relationship = profile.relationship || {};
  const id = profile.user.id;
  if (user?.id === id)
    return (
      <Link className={s.outlineButton} to="/settings">
        <Pencil size={15} />
        Edit profile
      </Link>
    );
  if (!user)
    return (
      <Link className={s.primaryButton} to="/login">
        <UserPlus size={16} />
        Connect
      </Link>
    );
  if (relationship.blocked)
    return (
      <button
        className={s.outlineButton}
        disabled={action.busy}
        onClick={() =>
          action.run(() => api(`/users/${id}/block`, { method: 'DELETE' }), 'Developer unblocked.')
        }
      >
        <Ban size={15} />
        Unblock
      </button>
    );
  return (
    <div className={s.profileButtons}>
      <button
        className={relationship.following ? s.outlineButton : s.primaryButton}
        disabled={action.busy}
        onClick={() =>
          action.run(() => api(`/users/${id}/follow`, { method: relationship.following ? 'DELETE' : 'PUT' }))
        }
      >
        {relationship.following ? <Check size={15} /> : <Plus size={15} />}
        {relationship.following ? 'Following' : 'Follow'}
      </button>
      {relationship.friendship === 'incoming' ? (
        <>
          <button
            className={s.outlineButton}
            disabled={action.busy}
            onClick={() =>
              action.run(() => api(`/users/${id}/friend-accept`, { method: 'POST' }), 'You are now friends.')
            }
          >
            <UserCheck size={15} />
            Accept request
          </button>
          <button
            className={s.iconButton}
            title="Decline friend request"
            aria-label="Decline friend request"
            onClick={() =>
              action.run(() => api(`/users/${id}/friend`, { method: 'DELETE' }), 'Request declined.')
            }
          >
            <X size={17} />
          </button>
        </>
      ) : (
        <button
          className={s.outlineButton}
          disabled={action.busy}
          onClick={() => {
            if (relationship.friendship === 'friends' && !window.confirm('Remove this friendship?')) return;
            action.run(
              () =>
                api(
                  `/users/${id}/${relationship.friendship === 'friends' || relationship.friendship === 'outgoing' ? 'friend' : 'friend-request'}`,
                  {
                    method:
                      relationship.friendship === 'friends' || relationship.friendship === 'outgoing'
                        ? 'DELETE'
                        : 'POST',
                  },
                ),
              relationship.friendship === 'none' || !relationship.friendship
                ? 'Friend request sent.'
                : 'Connection updated.',
            );
          }}
        >
          <UserPlus size={15} />
          {relationship.friendship === 'friends'
            ? 'Friends · Remove'
            : relationship.friendship === 'outgoing'
              ? 'Cancel request'
              : 'Add friend'}
        </button>
      )}
      <button
        className={s.iconButton}
        title="Block developer"
        aria-label="Block developer"
        onClick={() => {
          if (window.confirm('Block this developer? Your connections will be removed.'))
            action.run(
              () => api(`/users/${id}/block`, { method: 'PUT' }),
              'Developer blocked.',
              () => navigate('/friends?tab=blocked'),
            );
        }}
      >
        <Ban size={17} />
      </button>
      <ReportButton targetType="user" targetId={id} compact />
    </div>
  );
}

export function ProfilePage() {
  const { username } = useParams();
  const [tab, setTab] = useState('posts');
  const profile = useQuery({ queryKey: ['profile', username], queryFn: () => api(`/users/${username}`) });
  const projects = useQuery({
    queryKey: ['projects', 'owner', profile.data?.user?.id],
    queryFn: () => api(`/projects?${queryString({ owner: profile.data?.user?.id })}`),
    enabled: !!profile.data?.user,
  });
  if (profile.isLoading) return <Spinner />;
  if (profile.error) return <ErrorState error={profile.error} retry={profile.refetch} />;
  const { user, stats = {} } = profile.data;
  return (
    <>
      <section className={s.profileCard}>
        <div className={s.profileCover}>
          <span>{'{ keep: "building" }'}</span>
          <div aria-hidden="true">✳</div>
        </div>
        <div className={s.profileInfo}>
          <div className={s.profileTop}>
            <Avatar user={user} size="large" />
            <RelationshipButtons profile={profile.data} />
          </div>
          <h1>{user.name}</h1>
          <div className={s.profileHandle}>
            @{user.username}
            {user.isDemo && <span className={s.statusPill}>Demo profile</span>}
          </div>
          <p className={s.profileBio}>{user.bio || 'Every great project starts with a curious mind.'}</p>
          <div className={s.profileLinks}>
            {user.githubUrl && (
              <a href={user.githubUrl} target="_blank" rel="noreferrer">
                <Github size={15} />
                GitHub <ArrowUpRight size={12} />
              </a>
            )}
            {user.portfolioUrl && (
              <a href={user.portfolioUrl} target="_blank" rel="noreferrer">
                <Globe size={15} />
                Portfolio <ArrowUpRight size={12} />
              </a>
            )}
          </div>
          <div className={s.skills}>
            {user.skills?.map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
          <div className={s.profileStats}>
            {[
              ['Posts', stats.posts],
              ['Followers', stats.followers],
              ['Following', stats.following],
              ['Friends', stats.friends],
            ].map(([label, count]) => (
              <span key={label}>
                <strong>{count || 0}</strong>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>
      <div className={s.tabs}>
        <button className={tab === 'posts' ? s.tabActive : ''} onClick={() => setTab('posts')}>
          Posts
        </button>
        <button className={tab === 'projects' ? s.tabActive : ''} onClick={() => setTab('projects')}>
          Projects <span>{stats.projects || listItems(projects.data).length}</span>
        </button>
      </div>
      {tab === 'posts' ? (
        <PostsList
          filters={{ author: user.id }}
          emptyTitle="The story is just beginning"
          emptyDescription="This developer has not shared a visible post yet."
        />
      ) : projects.isLoading ? (
        <Spinner />
      ) : projects.error ? (
        <ErrorState error={projects.error} />
      ) : listItems(projects.data).length ? (
        <div className={s.cardList}>
          {listItems(projects.data).map((project) => (
            <Link key={project.id} className={s.projectCompact} to={`/projects/${project.slug}`}>
              <Code2 size={26} />
              <div>
                <h3>{project.title}</h3>
                <p>{project.description}</p>
              </div>
              <ArrowUpRight size={19} />
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          icon={Code2}
          title="Something good is in the works"
          description="Projects will appear here when this developer shares them."
        />
      )}
    </>
  );
}

export function FriendsPage() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const tab = params.get('tab') || 'discover';
  const relationships = useQuery({
    queryKey: ['relationships'],
    queryFn: () => api('/relationships'),
    enabled: !!user,
  });
  const people = usePagedList(['users', 'find', search], `/users?${queryString({ search })}`);
  const action = useAction();
  const data = relationships.data || {};
  const known = new Set(
    [...(data.friends || []), ...(data.incoming || []), ...(data.outgoing || [])].map((person) => person.id),
  );
  const options = [
    ['discover', 'Discover people'],
    ['friends', 'Friends'],
    ['requests', `Requests${data.incoming?.length ? ` (${data.incoming.length})` : ''}`],
    ['sent', 'Sent'],
    ['blocked', 'Blocked'],
  ];
  const current =
    tab === 'friends'
      ? data.friends
      : tab === 'requests'
        ? data.incoming
        : tab === 'sent'
          ? data.outgoing
          : data.blocked;
  return (
    <>
      <PageTitle
        eyebrow="GOOD COMPANY, BETTER IDEAS"
        title="Find your people."
        subtitle="Connect with curious minds, familiar faces, and future collaborators."
      />
      <div className={s.tabs}>
        {options.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setParams({ tab: value })}
            className={tab === value ? s.tabActive : ''}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'discover' ? (
        <>
          <div className={s.localSearch}>
            <Search size={18} />
            <input
              aria-label="Search developers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find developers by name or username…"
            />
          </div>
          {people.isLoading ? (
            <Spinner />
          ) : people.error ? (
            <ErrorState error={people.error} retry={people.refetch} />
          ) : listItems(people.data).length ? (
            <div className={s.peopleGrid}>
              {listItems(people.data)
                .filter((person) => person.id !== user?.id)
                .map((person) => (
                  <article className={s.personCard} key={person.id}>
                    <Link to={`/u/${person.username}`}>
                      <Avatar user={person} size="medium" />
                      <h3>{person.name}</h3>
                      <span className={s.muted}>@{person.username}</span>
                      <p>{person.bio || 'A curious developer, building something new.'}</p>
                    </Link>
                    <div className={s.skills}>
                      {person.skills?.slice(0, 3).map((skill) => (
                        <span key={skill}>{skill}</span>
                      ))}
                    </div>
                    {known.has(person.id) ? (
                      <Link className={s.outlineButton} to={`/u/${person.username}`}>
                        <UserCheck size={15} />
                        View connection
                      </Link>
                    ) : user ? (
                      <button
                        className={s.outlineButton}
                        disabled={action.busy}
                        onClick={() =>
                          action.run(
                            () => api(`/users/${person.id}/friend-request`, { method: 'POST' }),
                            'Friend request sent.',
                          )
                        }
                      >
                        <UserPlus size={15} />
                        Connect
                      </button>
                    ) : (
                      <Link className={s.outlineButton} to="/login">
                        <UserPlus size={15} />
                        Connect
                      </Link>
                    )}
                  </article>
                ))}
            </div>
          ) : (
            <Empty icon={Search} title="No developers found" description="Try another name or username." />
          )}
          <LoadMore {...people} label="developers" />
        </>
      ) : !user ? (
        <RequireAccount />
      ) : relationships.isLoading ? (
        <Spinner />
      ) : relationships.error ? (
        <ErrorState error={relationships.error} retry={relationships.refetch} />
      ) : current?.length ? (
        <div className={s.panel}>
          {current.map((person) => (
            <UserRow key={person.id} user={person}>
              <div className={s.row}>
                {tab === 'requests' && (
                  <button
                    className={s.smallPrimary}
                    disabled={action.busy}
                    onClick={() =>
                      action.run(
                        () => api(`/users/${person.id}/friend-accept`, { method: 'POST' }),
                        'Friend request accepted.',
                      )
                    }
                  >
                    <Check size={14} />
                    Accept
                  </button>
                )}
                <button
                  className={s.outlineButton}
                  disabled={action.busy}
                  onClick={() => {
                    if (tab === 'friends' && !window.confirm('Remove this friendship?')) return;
                    action.run(
                      () =>
                        api(`/users/${person.id}/${tab === 'blocked' ? 'block' : 'friend'}`, {
                          method: 'DELETE',
                        }),
                      tab === 'blocked' ? 'Developer unblocked.' : 'Connection updated.',
                    );
                  }}
                >
                  {tab === 'friends'
                    ? 'Remove'
                    : tab === 'requests'
                      ? 'Decline'
                      : tab === 'sent'
                        ? 'Cancel request'
                        : 'Unblock'}
                </button>
              </div>
            </UserRow>
          ))}
        </div>
      ) : (
        <Empty
          icon={Users}
          title={
            tab === 'requests'
              ? 'No requests waiting'
              : tab === 'friends'
                ? 'Your circle starts with hello'
                : tab === 'blocked'
                  ? 'No blocked developers'
                  : 'No pending requests'
          }
          description={
            tab === 'friends'
              ? 'Discover someone whose work inspires you and send a friend request.'
              : 'You’re all caught up here.'
          }
        />
      )}
    </>
  );
}

export function SettingsPage() {
  const { user } = useSession();
  if (!user) return <RequireAccount title="Make this space your own" />;
  return <ProfileSettings user={user} />;
}

function ProfileSettings({ user }) {
  const action = useAction();
  const avatarInput = useRef();
  const uploadedAvatars = useRef([]);
  const savedAvatar = useRef(user.avatarUrl);
  const alive = useRef(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [form, setForm] = useState({
    name: user.name || '',
    bio: user.bio || '',
    skills: user.skills?.join(', ') || '',
    githubUrl: user.githubUrl || '',
    portfolioUrl: user.portfolioUrl || '',
    avatarUrl: user.avatarUrl || '',
  });
  function field(key) {
    return { value: form[key], onChange: (event) => setForm({ ...form, [key]: event.target.value }) };
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      uploadedAvatars.current
        .filter((image) => image.url !== savedAvatar.current)
        .forEach((image) => api(`/media/${image.id}`, { method: 'DELETE' }).catch(() => {}));
    };
  }, []);
  async function avatar(event) {
    if (!event.target.files[0]) return;
    setUploading(true);
    setUploadError('');
    try {
      const image = await uploadImage(event.target.files[0]);
      if (!alive.current) {
        await api(`/media/${image.id}`, { method: 'DELETE' }).catch(() => {});
        return;
      }
      uploadedAvatars.current.push(image);
      setForm((current) => ({ ...current, avatarUrl: image.url }));
    } catch (error) {
      setUploadError(error.message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE ABOUT YOU"
        title="Make yourself at home."
        subtitle="Help your community get to know the person behind the commits."
      />
      <section className={s.panel}>
        {user.isDemo && (
          <div className={s.infoBox}>
            <ShieldCheck size={18} />
            <p>
              This is a shared demo profile. Its account details and curated content are protected. Create an
              account to customize your own profile.
            </p>
          </div>
        )}
        <form
          className={s.form}
          onSubmit={(event) => {
            event.preventDefault();
            action.run(
              () =>
                api('/users/me', {
                  method: 'PATCH',
                  body: {
                    ...form,
                    skills: [
                      ...new Set(
                        form.skills
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean),
                      ),
                    ],
                  },
                }),
              'Profile updated.',
              (updated) => {
                savedAvatar.current = updated.avatarUrl;
              },
            );
          }}
        >
          <div className={s.avatarEditor}>
            <Avatar user={{ ...user, avatarUrl: form.avatarUrl }} size="large" />
            <button
              type="button"
              className={s.outlineButton}
              disabled={uploading || user.isDemo}
              onClick={() => avatarInput.current.click()}
            >
              <ImagePlus size={16} />
              {uploading ? 'Uploading…' : 'Change avatar'}
            </button>
            <input
              ref={avatarInput}
              disabled={uploading || user.isDemo}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={avatar}
            />
            <small>JPG, PNG, GIF or WebP · up to 5 MB</small>
          </div>
          {uploadError && <p className={s.inlineError}>{uploadError}</p>}
          <Field label="Display name">
            <input {...field('name')} minLength={2} maxLength={70} required disabled={user.isDemo} />
          </Field>
          <Field label="About you">
            <textarea
              {...field('bio')}
              rows={4}
              maxLength={500}
              placeholder="What are you curious about? What are you building?"
              disabled={user.isDemo}
            />
          </Field>
          <Field label="Skills" hint="Separate skills with commas.">
            <input
              {...field('skills')}
              placeholder="JavaScript, React, Node.js"
              maxLength={300}
              disabled={user.isDemo}
            />
          </Field>
          <div className={s.formRow}>
            <Field label="GitHub URL">
              <input
                {...field('githubUrl')}
                type="url"
                placeholder="https://github.com/you"
                disabled={user.isDemo}
              />
            </Field>
            <Field label="Portfolio URL">
              <input
                {...field('portfolioUrl')}
                type="url"
                placeholder="https://your-site.com"
                disabled={user.isDemo}
              />
            </Field>
          </div>
          <button className={s.primaryButton} disabled={action.busy || uploading || user.isDemo}>
            <Check size={16} />
            Save profile
          </button>
        </form>
      </section>
      <section className={`${s.panel} ${s.accountSecurity}`}>
        <div className={s.row}>
          <LockKeyhole size={20} />
          <h3>Account security</h3>
        </div>
        <p>
          Your email address: <strong>{user.email || 'Private'}</strong>
        </p>
        {!user.isDemo && (
          <Link className={s.outlineButton} to="/forgot-password">
            <Mail size={15} />
            Request password reset
          </Link>
        )}
        <Link className={s.textButton} to="/friends?tab=blocked">
          <Ban size={15} />
          Manage blocked developers
        </Link>
      </section>
    </>
  );
}
