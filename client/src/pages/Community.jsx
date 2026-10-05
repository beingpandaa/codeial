import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  Braces,
  Check,
  Code2,
  Github,
  Globe,
  ImagePlus,
  LockKeyhole,
  LogOut,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, listItems, queryString, uploadImage } from '../api';
import { useSession } from '../session';
import {
  Avatar,
  Composer,
  Empty,
  ErrorState,
  Field,
  LoadMore,
  Markdown,
  Modal,
  PageTitle,
  ReportButton,
  Spinner,
  UserRow,
  useAction,
  usePagedList,
} from '../components';
import { PostsList } from './Feed';
import s from '../ui.module.css';

function GroupEditor({ initial, onClose }) {
  const action = useAction();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: initial?.name || '',
    description: initial?.description || '',
    rules: initial?.rules || 'Be kind. Share what you know. Give credit where it is due.',
    visibility: initial?.visibility || 'public',
  });
  function field(key) {
    return { value: form[key], onChange: (event) => setForm({ ...form, [key]: event.target.value }) };
  }
  return (
    <Modal title={initial ? 'Edit your group' : 'A new space for your people'} onClose={onClose}>
      <form
        className={s.form}
        onSubmit={(event) => {
          event.preventDefault();
          action.run(
            () =>
              api(initial ? `/groups/${initial.id}` : '/groups', {
                method: initial ? 'PATCH' : 'POST',
                body: initial ? { description: form.description, rules: form.rules } : form,
              }),
            initial ? 'Group updated.' : 'Your group is ready.',
            (result) => {
              onClose();
              if (!initial && result?.slug) navigate(`/groups/${result.slug}`);
            },
          );
        }}
      >
        {!initial && (
          <Field label="Group name">
            <input
              {...field('name')}
              required
              minLength={3}
              maxLength={70}
              placeholder="The Weekend Builders"
            />
          </Field>
        )}
        <Field label="Description">
          <textarea
            {...field('description')}
            required
            minLength={10}
            maxLength={1000}
            rows={3}
            placeholder="Who is this space for?"
          />
        </Field>
        <Field label="Community rules" hint="Markdown is welcome.">
          <textarea {...field('rules')} maxLength={3000} rows={4} />
        </Field>
        {!initial && (
          <Field
            label="Visibility"
            hint="Visibility is fixed after creation. Private group content and member lists are visible only to approved members."
          >
            <select {...field('visibility')}>
              <option value="public">Public · anyone can read and join</option>
              <option value="private">Private · joining requires approval</option>
            </select>
          </Field>
        )}
        <button className={s.primaryButton} disabled={action.busy}>
          <Plus size={16} />
          {initial ? 'Save changes' : 'Create group'}
        </button>
      </form>
    </Modal>
  );
}

export function GroupsPage() {
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [create, setCreate] = useState(false);
  const navigate = useNavigate();
  const groups = usePagedList(['groups', 'list', search], `/groups?${queryString({ search })}`);
  const items = listItems(groups.data).filter(
    (group) => tab !== 'mine' || ['owner', 'moderator', 'member', 'pending'].includes(group.membership),
  );
  return (
    <>
      <PageTitle
        eyebrow="FIND A LITTLE COMMON GROUND"
        title="Big ideas. Smaller circles."
        subtitle="Spaces for your interests, your questions, and your kind of people."
      >
        <button className={s.primaryButton} onClick={() => (user ? setCreate(true) : navigate('/login'))}>
          <Plus size={16} />
          New group
        </button>
      </PageTitle>
      <div className={s.localSearch}>
        <Search size={18} />
        <input
          aria-label="Search groups"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a community you’ll feel at home in…"
        />
      </div>
      <div className={s.tabs}>
        <button className={tab === 'all' ? s.tabActive : ''} onClick={() => setTab('all')}>
          Discover groups
        </button>
        <button className={tab === 'mine' ? s.tabActive : ''} onClick={() => setTab('mine')}>
          Your spaces
        </button>
      </div>
      {groups.isLoading ? (
        <Spinner />
      ) : groups.error ? (
        <ErrorState error={groups.error} retry={groups.refetch} />
      ) : items.length ? (
        <div className={s.groupGrid}>
          {items.map((group, index) => (
            <article className={s.groupCard} key={group.id}>
              <Link className={`${s.groupCover} ${s[`groupCover${index % 4}`]}`} to={`/groups/${group.slug}`}>
                <span>{index % 2 === 0 ? '{ }' : '</>'}</span>
                <div className={s.groupCoverGrid} />
                <small>
                  {group.visibility === 'private' ? <LockKeyhole size={14} /> : <Globe size={14} />}
                  {group.visibility}
                </small>
              </Link>
              <div className={s.groupCardBody}>
                <Link to={`/groups/${group.slug}`}>
                  <h2>{group.name}</h2>
                </Link>
                <p>{group.description}</p>
                <div className={s.groupCardFooter}>
                  <span>
                    <Users size={14} />
                    {group.memberCount || 0} members
                  </span>
                  <Link className={s.groupVisit} to={`/groups/${group.slug}`}>
                    {group.membership === 'pending'
                      ? 'Requested'
                      : ['owner', 'moderator', 'member'].includes(group.membership)
                        ? 'Your group'
                        : 'Take a look'}
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={Users}
          title={tab === 'mine' ? 'Find a space that feels like you' : 'No groups found'}
          description={
            tab === 'mine'
              ? 'Join a community to see it here, or create a new one.'
              : 'Try another topic or start your own community.'
          }
        />
      )}
      <LoadMore {...groups} label="groups" />
      {create && <GroupEditor onClose={() => setCreate(false)} />}
    </>
  );
}

function GroupMembers({ group }) {
  const { user } = useSession();
  const action = useAction();
  const members = useQuery({
    queryKey: ['members', group.id],
    queryFn: () => api(`/groups/${group.id}/members`),
    enabled: !!group.canRead,
  });
  if (members.isLoading) return <Spinner />;
  if (members.error) return <ErrorState error={members.error} retry={members.refetch} />;
  const data = members.data || {};
  return (
    <div className={s.cardList}>
      {group.canModerate && !!data.requests?.length && (
        <section className={s.panel}>
          <h3 className={s.sectionTitle}>
            Waiting to join <span>{data.requests.length}</span>
          </h3>
          {data.requests.map(({ user: person }) => (
            <UserRow key={person.id} user={person}>
              <div className={s.row}>
                <button
                  className={s.smallPrimary}
                  disabled={action.busy}
                  onClick={() =>
                    action.run(
                      () => api(`/groups/${group.id}/members/${person.id}/approve`, { method: 'POST' }),
                      'Member approved.',
                    )
                  }
                >
                  <Check size={14} />
                  Approve
                </button>
                <button
                  className={s.iconButton}
                  title="Decline request"
                  aria-label={`Decline ${person.name}`}
                  disabled={action.busy}
                  onClick={() =>
                    action.run(
                      () => api(`/groups/${group.id}/members/${person.id}`, { method: 'DELETE' }),
                      'Request declined.',
                    )
                  }
                >
                  <X size={16} />
                </button>
              </div>
            </UserRow>
          ))}
        </section>
      )}
      <section className={s.panel}>
        <h3 className={s.sectionTitle}>The people who make this space</h3>
        {data.members?.map(({ user: person, role }) => (
          <UserRow key={person.id} user={person} subtitle={role}>
            <div className={s.memberActions}>
              {group.membership === 'owner' && role !== 'owner' && (
                <>
                  <select
                    aria-label={`Role for ${person.name}`}
                    disabled={action.busy}
                    value={role}
                    onChange={(event) =>
                      action.run(
                        () =>
                          api(`/groups/${group.id}/members/${person.id}`, {
                            method: 'PATCH',
                            body: { role: event.target.value },
                          }),
                        'Member role updated.',
                      )
                    }
                  >
                    <option value="member">Member</option>
                    <option value="moderator">Moderator</option>
                  </select>
                  <button
                    className={s.iconButton}
                    title="Transfer ownership"
                    aria-label={`Transfer ownership to ${person.name}`}
                    disabled={action.busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Transfer group ownership to ${person.name}? You will become a moderator.`,
                        )
                      )
                        action.run(
                          () =>
                            api(`/groups/${group.id}/transfer`, {
                              method: 'POST',
                              body: { userId: person.id },
                            }),
                          'Ownership transferred.',
                        );
                    }}
                  >
                    <ShieldCheck size={16} />
                  </button>
                </>
              )}
              {group.canModerate && role !== 'owner' && person.id !== user?.id && (
                <button
                  className={s.iconButton}
                  title="Remove member"
                  aria-label={`Remove ${person.name}`}
                  disabled={action.busy}
                  onClick={() => {
                    if (window.confirm(`Remove ${person.name} from the group?`))
                      action.run(
                        () => api(`/groups/${group.id}/members/${person.id}`, { method: 'DELETE' }),
                        'Member removed.',
                      );
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </UserRow>
        ))}
      </section>
    </div>
  );
}

export function GroupPage() {
  const { slug } = useParams();
  const { user } = useSession();
  const action = useAction();
  const navigate = useNavigate();
  const [tab, setTab] = useState('posts');
  const [compose, setCompose] = useState(false);
  const [editing, setEditing] = useState(false);
  const groups = useQuery({ queryKey: ['group', slug], queryFn: () => api(`/groups/${slug}`) });
  if (groups.isLoading) return <Spinner />;
  if (groups.error) return <ErrorState error={groups.error} retry={groups.refetch} />;
  const group = groups.data;
  const joined = ['member', 'moderator', 'owner'].includes(group.membership);
  const canRead = group.canRead ?? group.visibility === 'public';
  return (
    <>
      <Link className={s.backLink} to="/groups">
        <ArrowLeft size={16} />
        All communities
      </Link>
      <section className={s.groupDetailCard}>
        <div className={s.groupDetailBanner}>
          <span className={s.eyebrow}>A SPACE TO GROW TOGETHER</span>
          <div aria-hidden="true">
            {'{'}
            <span>✳</span>
            {'}'}
          </div>
        </div>
        <div className={s.groupDetailInfo}>
          <div className={s.between}>
            <span className={s.groupDetailIcon}>
              <Braces size={28} />
            </span>
            <div className={s.row}>
              {group.canModerate && (
                <button className={s.outlineButton} onClick={() => setEditing(true)}>
                  <Settings2 size={15} />
                  Manage
                </button>
              )}
              <ReportButton targetType="group" targetId={group.id} compact />
            </div>
          </div>
          <h1>{group.name}</h1>
          <div className={s.groupMetadata}>
            <span>
              {group.visibility === 'private' ? <LockKeyhole size={14} /> : <Globe size={14} />}
              {group.visibility} group
            </span>
            <span>
              <Users size={14} />
              {group.memberCount || 0} members
            </span>
            {joined && (
              <span>
                <Check size={14} />
                {group.membership}
              </span>
            )}
          </div>
          <p>{group.description}</p>
          <div className={s.groupButtons}>
            {joined ? (
              <>
                <button className={s.primaryButton} onClick={() => setCompose(true)}>
                  <Plus size={16} />
                  Share with the group
                </button>
                {group.membership !== 'owner' && (
                  <button
                    className={s.outlineButton}
                    disabled={action.busy}
                    onClick={() => {
                      if (window.confirm('Leave this group? Private content will no longer be available.'))
                        action.run(
                          () => api(`/groups/${group.id}/membership`, { method: 'DELETE' }),
                          'You have left the group.',
                        );
                    }}
                  >
                    <LogOut size={15} />
                    Leave group
                  </button>
                )}
              </>
            ) : group.membership === 'pending' ? (
              <button
                className={s.outlineButton}
                disabled={action.busy}
                onClick={() =>
                  action.run(
                    () => api(`/groups/${group.id}/membership`, { method: 'DELETE' }),
                    'Join request cancelled.',
                  )
                }
              >
                <Check size={16} />
                Request sent · Cancel
              </button>
            ) : (
              <button
                className={s.primaryButton}
                disabled={action.busy}
                onClick={() =>
                  user
                    ? action.run(
                        () => api(`/groups/${group.id}/join`, { method: 'POST' }),
                        group.visibility === 'private'
                          ? 'Request sent to the group moderators.'
                          : 'Welcome to the group.',
                      )
                    : navigate('/login')
                }
              >
                <UserPlus size={16} />
                {group.visibility === 'private' ? 'Request to join' : 'Join this group'}
              </button>
            )}
          </div>
        </div>
      </section>
      <div className={s.tabs}>
        <button className={tab === 'posts' ? s.tabActive : ''} onClick={() => setTab('posts')}>
          Conversations
        </button>
        <button className={tab === 'about' ? s.tabActive : ''} onClick={() => setTab('about')}>
          About & rules
        </button>
        {canRead && (
          <button className={tab === 'members' ? s.tabActive : ''} onClick={() => setTab('members')}>
            Members
          </button>
        )}
      </div>
      {tab === 'about' ? (
        <section className={s.panel}>
          <h2 className={s.sectionTitle}>A little about this space</h2>
          <p className={s.aboutDescription}>{group.description}</p>
          <h3 className={s.sectionTitle}>How we show up here</h3>
          <Markdown>{group.rules || 'Be kind, stay curious, and respect one another.'}</Markdown>
          {group.membership === 'owner' && (
            <div className={s.ownerNote}>
              <ShieldCheck size={17} />
              <p>You own this group. To leave, transfer ownership to a member from the Members tab first.</p>
              <button
                className={s.dangerButton}
                disabled={action.busy}
                onClick={() => {
                  if (window.confirm('Archive this group? Its discussions will be unavailable to members.'))
                    action.run(
                      () => api(`/groups/${group.id}`, { method: 'DELETE' }),
                      'Group archived.',
                      () => navigate('/groups'),
                    );
                }}
              >
                <Trash2 size={14} />
                Archive group
              </button>
            </div>
          )}
        </section>
      ) : !canRead ? (
        <Empty
          icon={LockKeyhole}
          title="A small circle, a safe space"
          description="This is a private group. Request to join to see conversations and meet the members."
        />
      ) : tab === 'members' ? (
        <GroupMembers group={{ ...group, canRead }} />
      ) : (
        <PostsList
          filters={{ group: group.id }}
          emptyTitle="Every community starts with a conversation"
          emptyDescription="Share an introduction, a question, or something you are working on."
        />
      )}
      {compose && <Composer group={group} onClose={() => setCompose(false)} />}
      {editing && <GroupEditor initial={group} onClose={() => setEditing(false)} />}
    </>
  );
}

function ProjectEditor({ initial, onClose }) {
  const action = useAction();
  const navigate = useNavigate();
  const uploadInput = useRef();
  const uploadedRef = useRef([]);
  const aliveRef = useRef(true);
  const savedRef = useRef(false);
  const [images, setImages] = useState(initial?.images || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    stack: initial?.stack?.join(', ') || '',
    githubUrl: initial?.githubUrl || '',
    liveUrl: initial?.liveUrl || '',
  });
  function field(key) {
    return { value: form[key], onChange: (event) => setForm({ ...form, [key]: event.target.value }) };
  }
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (!savedRef.current)
        uploadedRef.current.forEach((image) =>
          api(`/media/${image.id}`, { method: 'DELETE' }).catch(() => {}),
        );
    };
  }, []);
  async function addScreenshots(event) {
    setUploadError('');
    const files = [...event.target.files];
    if (images.length + files.length > 4) {
      setUploadError('Add up to four screenshots.');
      event.target.value = '';
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        const image = await uploadImage(file);
        if (!aliveRef.current) {
          await api(`/media/${image.id}`, { method: 'DELETE' }).catch(() => {});
          break;
        }
        uploadedRef.current.push(image);
        setImages((current) => [...current, image]);
      }
    } catch (error) {
      setUploadError(error.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }
  function removeScreenshot(image) {
    if (!uploadedRef.current.some((upload) => upload.id === image.id)) {
      setImages((current) => current.filter((item) => item.id !== image.id));
      return;
    }
    action.run(
      () => api(`/media/${image.id}`, { method: 'DELETE' }),
      undefined,
      () => {
        uploadedRef.current = uploadedRef.current.filter((item) => item.id !== image.id);
        setImages((current) => current.filter((item) => item.id !== image.id));
      },
    );
  }
  return (
    <Modal title={initial ? 'Edit your project' : 'Give your project a home'} onClose={onClose}>
      <form
        className={s.form}
        onSubmit={(event) => {
          event.preventDefault();
          action.run(
            () =>
              api(initial ? `/projects/${initial.id}` : '/projects', {
                method: initial ? 'PATCH' : 'POST',
                body: {
                  ...form,
                  mediaIds: images.map((image) => image.id),
                  stack: [
                    ...new Set(
                      form.stack
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean),
                    ),
                  ],
                },
              }),
            initial ? 'Project updated.' : 'Your project is out in the world.',
            (result) => {
              savedRef.current = true;
              (initial?.images || [])
                .filter((image) => !images.some((item) => item.id === image.id))
                .forEach((image) => api(`/media/${image.id}`, { method: 'DELETE' }).catch(() => {}));
              onClose();
              if (result?.slug) navigate(`/projects/${result.slug}`);
            },
          );
        }}
      >
        <Field label="Project name">
          <input
            {...field('title')}
            minLength={3}
            maxLength={120}
            required
            placeholder="What are you building?"
          />
        </Field>
        <Field
          label="The story behind it"
          hint="Tell us what it does, who it helps, and why you built it. Markdown is welcome."
        >
          <textarea {...field('description')} required minLength={10} maxLength={4000} rows={6} />
        </Field>
        <Field label="Tech stack" hint="Separate technologies with commas.">
          <input {...field('stack')} maxLength={250} placeholder="React, Node.js, MongoDB" />
        </Field>
        <Field label="GitHub repository">
          <input {...field('githubUrl')} type="url" placeholder="https://github.com/you/project" />
        </Field>
        <Field label="Live project">
          <input {...field('liveUrl')} type="url" placeholder="https://your-project.com" />
        </Field>
        <div className={s.screenshotEditor}>
          <span>Project screenshots</span>
          <p>Give your work a face. Up to 4 images, 5 MB each.</p>
          <div className={s.uploadPreviews}>
            {images.map((image, index) => (
              <div key={image.id}>
                <img src={image.url} alt={`Project screenshot ${index + 1}`} />
                <button
                  type="button"
                  disabled={action.busy || uploading}
                  aria-label={`Remove screenshot ${index + 1}`}
                  onClick={() => removeScreenshot(image)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <input
            ref={uploadInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={addScreenshots}
          />
          <button
            type="button"
            className={s.outlineButton}
            disabled={uploading || images.length >= 4}
            onClick={() => uploadInput.current.click()}
          >
            <ImagePlus size={16} />
            {uploading ? 'Uploading…' : 'Add screenshots'}
          </button>
          {uploadError && (
            <p className={s.inlineError} role="alert">
              {uploadError}
            </p>
          )}
        </div>
        <button className={s.primaryButton} disabled={action.busy || uploading}>
          <Code2 size={16} />
          {initial ? 'Save project' : 'Share your project'}
        </button>
      </form>
    </Modal>
  );
}

export function ProjectsPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);
  const [create, setCreate] = useState(false);
  const projects = usePagedList(
    ['projects', 'list', search, mine, user?.id],
    `/projects?${queryString({ search, owner: mine ? user?.id : undefined })}`,
  );
  return (
    <>
      <PageTitle
        eyebrow="FROM IDEA TO SOMETHING REAL"
        title="Look what we’re building."
        subtitle="Side projects, small experiments, and big ambitions. All welcome."
      >
        <button className={s.primaryButton} onClick={() => (user ? setCreate(true) : navigate('/login'))}>
          <Plus size={16} />
          Add project
        </button>
      </PageTitle>
      <div className={s.localSearch}>
        <Search size={18} />
        <input
          aria-label="Search projects"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a project, a stack, a little inspiration…"
        />
      </div>
      <div className={s.tabs}>
        <button className={!mine ? s.tabActive : ''} onClick={() => setMine(false)}>
          Community projects
        </button>
        {user && (
          <button className={mine ? s.tabActive : ''} onClick={() => setMine(true)}>
            Your projects
          </button>
        )}
      </div>
      {projects.isLoading ? (
        <Spinner />
      ) : projects.error ? (
        <ErrorState error={projects.error} retry={projects.refetch} />
      ) : listItems(projects.data).length ? (
        <div className={s.projectGrid}>
          {listItems(projects.data).map((project, index) => (
            <article className={s.projectCard} key={project.id}>
              <Link
                className={`${s.projectCover} ${s[`projectCover${index % 4}`]}`}
                to={`/projects/${project.slug}`}
                onPointerMove={(event) => {
                  if (
                    event.pointerType !== 'mouse' ||
                    window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  )
                    return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  event.currentTarget.style.setProperty(
                    '--depth-x',
                    `${((event.clientX - rect.left) / rect.width - 0.5) * 7}px`,
                  );
                  event.currentTarget.style.setProperty(
                    '--depth-y',
                    `${((event.clientY - rect.top) / rect.height - 0.5) * 5}px`,
                  );
                }}
                onPointerLeave={(event) => {
                  event.currentTarget.style.setProperty('--depth-x', '0px');
                  event.currentTarget.style.setProperty('--depth-y', '0px');
                }}
              >
                {project.images?.length ? (
                  <img
                    className={s.projectCoverImage}
                    src={project.images[0].url}
                    alt={`${project.title} preview`}
                    loading="lazy"
                  />
                ) : (
                  <>
                    <span className={s.projectCoverDots}>● ● ●</span>
                    <div>
                      <Code2 size={34} />
                      <span>{project.title}</span>
                      <small>{project.stack?.slice(0, 2).join(' + ')}</small>
                    </div>
                  </>
                )}
                <ArrowUpRight className={s.projectCoverArrow} size={23} />
              </Link>
              <div className={s.projectCardBody}>
                <Link to={`/projects/${project.slug}`}>
                  <h2>{project.title}</h2>
                  <p>{project.description?.replace(/[#*`]/g, '')}</p>
                </Link>
                <div className={s.skills}>
                  {project.stack?.slice(0, 3).map((stack) => (
                    <span key={stack}>{stack}</span>
                  ))}
                </div>
                <footer>
                  <Link to={`/u/${project.owner?.username}`}>
                    <Avatar user={project.owner} size="tiny" />
                    <span>{project.owner?.name}</span>
                  </Link>
                  <Link to={`/projects/${project.slug}`} aria-label={`See ${project.title}`}>
                    <ArrowUpRight size={18} />
                  </Link>
                </footer>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={Code2}
          title={mine ? 'Your next big thing belongs here' : 'No projects found'}
          description={
            mine
              ? 'Share a project and document its journey through build updates.'
              : 'Try a different search, or add the first project on this topic.'
          }
        />
      )}
      <LoadMore {...projects} label="projects" />
      {create && <ProjectEditor onClose={() => setCreate(false)} />}
    </>
  );
}

export function ProjectPage() {
  const { slug } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const [edit, setEdit] = useState(false);
  const [compose, setCompose] = useState(false);
  const action = useAction();
  const projects = useQuery({ queryKey: ['project', slug], queryFn: () => api(`/projects/${slug}`) });
  if (projects.isLoading) return <Spinner />;
  if (projects.error) return <ErrorState error={projects.error} retry={projects.refetch} />;
  const project = projects.data;
  const owner = project.canEdit ?? user?.id === project.owner?.id;
  return (
    <>
      <Link to="/projects" className={s.backLink}>
        <ArrowLeft size={16} />
        All projects
      </Link>
      <section className={s.projectDetail}>
        <div className={s.projectDetailHeading}>
          <span className={s.projectDetailIcon}>
            <Code2 size={30} />
          </span>
          <div className={s.row}>
            {owner && (
              <>
                <button className={s.outlineButton} onClick={() => setEdit(true)}>
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  className={s.iconButton}
                  title="Delete project"
                  aria-label="Delete project"
                  disabled={action.busy}
                  onClick={() => {
                    if (window.confirm('Delete this project showcase?'))
                      action.run(
                        () => api(`/projects/${project.id}`, { method: 'DELETE' }),
                        'Project deleted.',
                        () => navigate('/projects'),
                      );
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        </div>
        <span className={s.eyebrow}>BUILT WITH CURIOSITY</span>
        <h1>{project.title}</h1>
        <Link className={s.projectOwner} to={`/u/${project.owner?.username}`}>
          <Avatar user={project.owner} size="small" />
          <span>
            A project by <strong>{project.owner?.name}</strong>
          </span>
          <ArrowUpRight size={14} />
        </Link>
        <div className={s.skills}>
          {project.stack?.map((stack) => (
            <span key={stack}>{stack}</span>
          ))}
        </div>
        <Markdown>{project.description}</Markdown>
        {!!project.images?.length && (
          <div className={s.projectGallery}>
            {project.images.map((image, index) => (
              <a href={image.url} key={image.id} target="_blank" rel="noreferrer">
                <img src={image.url} alt={`${project.title} screenshot ${index + 1}`} loading="lazy" />
                <span>
                  Screenshot {index + 1} <ArrowUpRight size={13} />
                </span>
              </a>
            ))}
          </div>
        )}
        <div className={s.projectLinks}>
          {project.liveUrl && (
            <a href={project.liveUrl} target="_blank" rel="noreferrer" className={s.primaryButton}>
              <Globe size={16} />
              Visit project <ArrowUpRight size={15} />
            </a>
          )}
          {project.githubUrl && (
            <a href={project.githubUrl} target="_blank" rel="noreferrer" className={s.outlineButton}>
              <Github size={16} />
              View source
            </a>
          )}
        </div>
      </section>
      <div className={s.timelineHeading}>
        <div>
          <span className={s.eyebrow}>ONE COMMIT AT A TIME</span>
          <h2>The build journal</h2>
          <p>A project is more than the finished thing. Here’s the journey.</p>
        </div>
        {owner && (
          <button className={s.outlineButton} onClick={() => setCompose(true)}>
            <Plus size={15} />
            Add update
          </button>
        )}
      </div>
      <PostsList
        filters={{ project: project.id }}
        emptyTitle="The first chapter is yours"
        emptyDescription="Build updates linked to this project will appear here, from the first idea to the next release."
      />
      {edit && <ProjectEditor initial={project} onClose={() => setEdit(false)} />}
      {compose && <Composer project={project} onClose={() => setCompose(false)} />}
    </>
  );
}
