import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Flag,
  Heart,
  ImagePlus,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api, listItems, queryString, uploadImage } from './api';
import { useSession } from './session';
import s from './ui.module.css';

export const postTypes = {
  build: { label: 'Build update', icon: '↗', color: 'green' },
  learning: { label: 'Today I learned', icon: '✧', color: 'purple' },
  discussion: { label: 'Tech discussion', icon: '◌', color: 'orange' },
  help: { label: 'Help needed', icon: '?', color: 'blue' },
};

export function useAction() {
  const [busy, setBusy] = useState(false);
  const { notify } = useSession();
  const client = useQueryClient();
  async function run(fn, message, onSuccess) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await fn();
      await client.invalidateQueries();
      if (message) notify(message);
      onSuccess?.(result);
      return result;
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

export function usePagedList(queryKey, path, enabled = true) {
  const query = useInfiniteQuery({
    queryKey,
    enabled,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      api(
        `${path}${pageParam ? `${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (page) => page?.nextCursor || undefined,
  });
  return {
    ...query,
    data: query.data
      ? { items: query.data.pages.flatMap(listItems), nextCursor: query.data.pages.at(-1)?.nextCursor }
      : undefined,
  };
}

export function Avatar({ user, size = 'normal' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [user?.avatarUrl]);
  const name = user?.name || user?.username || 'Developer';
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((value) => value[0])
    .join('');
  const colors = ['#e4ead6', '#f4ded3', '#e1dcf1', '#d8e7ef', '#f1e6c6'];
  const color =
    colors[Array.from(name).reduce((total, letter) => total + letter.charCodeAt(0), 0) % colors.length];
  return (
    <span className={`${s.avatar} ${s[`avatar_${size}`]}`} style={{ background: color }}>
      {user?.avatarUrl && !failed ? (
        <img src={user.avatarUrl} alt={name} onError={() => setFailed(true)} />
      ) : (
        <span aria-label={name}>{initials}</span>
      )}
    </span>
  );
}

export function timeAgo(value) {
  if (!value) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Markdown({ children }) {
  return (
    <div className={s.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          img: (props) => (
            <a href={props.src} target="_blank" rel="noopener noreferrer">
              {props.alt || 'Image link'}
            </a>
          ),
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}

export function Spinner({ label = 'Loading your community…' }) {
  return (
    <div className={s.loading} role="status">
      <LoaderCircle size={22} className={s.spin} />
      <span>{label}</span>
    </div>
  );
}
export function Empty({ title, description, icon: Icon = Sparkles, children }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function ErrorState({ error, retry }) {
  return (
    <div className={s.errorBox} role="alert">
      <p>{error?.message || 'Something went wrong. Please try again.'}</p>
      {retry && (
        <button className={s.textButton} onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Field({ label, hint, children }) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function PageTitle({ eyebrow, title, subtitle, children }) {
  return (
    <div className={s.pageTitle}>
      <div>
        {eyebrow && <span className={s.eyebrow}>{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
export function Tags({ tags = [] }) {
  return (
    <div className={s.tags}>
      {tags.map((tag) => (
        <Link to={`/explore?tag=${encodeURIComponent(tag)}`} key={tag}>
          #{tag}
        </Link>
      ))}
    </div>
  );
}

export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () => [
      ...ref.current.querySelectorAll(
        'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
      ),
    ];
    focusables()[0]?.focus();
    function keydown(event) {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const items = focusables();
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus?.();
    };
  }, []);
  return createPortal(
    <div
      className={s.modalBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`${s.modal} ${wide ? s.modalWide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={s.modalHeader}>
          <h2>{title}</h2>
          <button className={s.iconButton} aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function ReportButton({ targetType, targetId, compact = false }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const action = useAction();
  if (!user) return null;
  return (
    <>
      <button
        className={compact ? s.iconButton : s.menuItem}
        title="Report"
        aria-label={`Report ${targetType}`}
        onClick={() => setOpen(true)}
      >
        <Flag size={15} />
        {!compact && 'Report'}
      </button>
      {open && (
        <Modal title="Report to moderators" onClose={() => setOpen(false)}>
          <form
            className={s.form}
            onSubmit={(event) => {
              event.preventDefault();
              action.run(
                () => api('/reports', { method: 'POST', body: { targetType, targetId, reason } }),
                'Report submitted. Thank you for helping the community.',
                () => setOpen(false),
              );
            }}
          >
            <p className={s.muted}>Tell us what happened. Reports are reviewed privately.</p>
            <Field label="Reason">
              <textarea
                required
                minLength={10}
                maxLength={1000}
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Describe the issue…"
              />
            </Field>
            <button className={s.primaryButton} disabled={action.busy}>
              Submit report
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function PostCard({ post, detail = false, onDeleted }) {
  const { user, notify } = useSession();
  const navigate = useNavigate();
  const action = useAction();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!menu) return undefined;
    const closeOutside = (event) => {
      if (!document.querySelector('[role="dialog"]') && !menuRef.current?.contains(event.target))
        setMenu(false);
    };
    const closeEscape = (event) => {
      if (event.key === 'Escape') setMenu(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [menu]);
  const type = postTypes[post.type] || postTypes.discussion;
  const requireUser = (callback) => (user ? callback() : navigate('/login'));
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/posts/${post.id}`);
      notify('Link copied to clipboard.');
    } catch {
      notify(`Post link: ${window.location.origin}/posts/${post.id}`);
    }
  }
  return (
    <article className={`${s.postCard} ${detail ? s.postDetail : ''}`}>
      <header className={s.postHeader}>
        <Link to={`/u/${post.author?.username}`} className={s.author}>
          <Avatar user={post.author} />
          <span>
            <strong>
              {post.author?.name || 'Developer'}{' '}
              {post.author?.isDemo && <span className={s.demoDot} title="Fictional demo profile" />}
            </strong>
            <small>
              @{post.author?.username} <span>·</span> {timeAgo(post.createdAt)}{' '}
              {post.visibility === 'friends' && <LockKeyhole size={11} />}
            </small>
          </span>
        </Link>
        <div className={s.postTopActions}>
          <span className={`${s.typeBadge} ${s[type.color]}`}>
            {type.icon}
            <span>{type.label}</span>
          </span>
          <div ref={menuRef} className={s.menuWrap}>
            <button
              className={s.iconButton}
              aria-label="Post options"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={20} />
            </button>
            {menu && (
              <div className={s.dropdown}>
                <button className={s.menuItem} onClick={copyLink}>
                  <Link2 size={15} />
                  Copy link
                </button>
                {post.canEdit && (
                  <button
                    className={s.menuItem}
                    onClick={() => {
                      setEditing(true);
                      setMenu(false);
                    }}
                  >
                    <Pencil size={15} />
                    Edit post
                  </button>
                )}
                {(post.canEdit || post.canModerate) && (
                  <button
                    className={`${s.menuItem} ${s.danger}`}
                    disabled={action.busy}
                    onClick={() => {
                      if (window.confirm('Delete this post and its comments?'))
                        action.run(
                          () => api(`/posts/${post.id}`, { method: 'DELETE' }),
                          'Post deleted.',
                          onDeleted,
                        );
                    }}
                  >
                    <Trash2 size={15} />
                    Delete post
                  </button>
                )}
                <ReportButton targetType="post" targetId={post.id} />
              </div>
            )}
          </div>
        </div>
      </header>
      {(post.group || post.project) && (
        <div className={s.postContext}>
          {post.group && (
            <Link to={`/groups/${post.group.slug}`}>
              in {post.group.name} {post.group.visibility === 'private' && <LockKeyhole size={11} />}
            </Link>
          )}
          {post.project && (
            <Link to={`/projects/${post.project.slug}`}>
              <Code2 size={13} /> {post.project.title}
            </Link>
          )}
        </div>
      )}
      {post.title && (
        <h2 className={s.postTitle}>
          {detail ? post.title : <Link to={`/posts/${post.id}`}>{post.title}</Link>}
        </h2>
      )}
      <div className={!detail ? s.postBodyPreview : ''}>
        <Markdown>{post.body}</Markdown>
      </div>
      {!detail && post.body?.length > 650 && (
        <Link className={s.readMore} to={`/posts/${post.id}`}>
          Read the full post <ArrowUpRight size={13} />
        </Link>
      )}
      {!!post.images?.length && (
        <div className={`${s.postImages} ${post.images.length > 1 ? s.multipleImages : ''}`}>
          {post.images.map((image, index) => (
            <a key={image.id || index} href={image.url} target="_blank" rel="noreferrer">
              <img
                src={image.url}
                loading="lazy"
                alt={`Attachment ${index + 1} to ${post.title || 'post'}`}
              />
            </a>
          ))}
        </div>
      )}
      <Tags tags={post.tags} />
      {post.type === 'help' && post.status === 'solved' && (
        <span className={s.solvedBadge}>
          <CheckCircle2 size={14} /> Solved by the community
        </span>
      )}
      <footer className={s.postFooter}>
        <div className={s.row}>
          <button
            className={`${s.postAction} ${post.liked ? s.liked : ''}`}
            disabled={action.busy}
            aria-pressed={!!post.liked}
            aria-label={`${post.liked ? 'Unlike' : 'Like'} post`}
            onClick={() =>
              requireUser(() =>
                action.run(() => api(`/posts/${post.id}/like`, { method: post.liked ? 'DELETE' : 'PUT' })),
              )
            }
          >
            <Heart size={18} fill={post.liked ? 'currentColor' : 'none'} />
            <span>{post.likeCount || 0}</span>
          </button>
          <Link className={s.postAction} to={`/posts/${post.id}#comments`}>
            <MessageCircle size={18} />
            <span>
              {post.commentCount || 0}
              <span className={s.commentsLabel}> comments</span>
            </span>
          </Link>
        </div>
        <div className={s.row}>
          <button className={s.postAction} onClick={copyLink} aria-label="Copy post link">
            <Link2 size={17} />
          </button>
          <button
            className={`${s.postAction} ${post.saved ? s.active : ''}`}
            aria-pressed={!!post.saved}
            aria-label={post.saved ? 'Unsave post' : 'Save post'}
            disabled={action.busy}
            onClick={() =>
              requireUser(() =>
                action.run(
                  () => api(`/posts/${post.id}/save`, { method: post.saved ? 'DELETE' : 'PUT' }),
                  post.saved ? 'Removed from saved posts.' : 'Added to your saved posts.',
                ),
              )
            }
          >
            <Bookmark size={18} fill={post.saved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </footer>
      {editing && <Composer initial={post} onClose={() => setEditing(false)} />}
    </article>
  );
}

export function Composer({ onClose, group, project, initial, defaultType = 'build' }) {
  const { user } = useSession();
  const action = useAction();
  const input = useRef();
  const [type, setType] = useState(initial?.type || defaultType);
  const [title, setTitle] = useState(initial?.title || '');
  const [body, setBody] = useState(initial?.body || '');
  const [tags, setTags] = useState(initial?.tags?.join(', ') || '');
  const [visibility, setVisibility] = useState(group ? 'group' : initial?.visibility || 'public');
  const [projectId, setProjectId] = useState(project?.id || '');
  const [images, setImages] = useState([]);
  const uploadedRef = useRef([]);
  const publishedRef = useRef(false);
  const aliveRef = useRef(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [preview, setPreview] = useState(false);
  const projects = useQuery({
    queryKey: ['myProjects', user?.id],
    queryFn: () => api(`/projects?${queryString({ owner: user?.id })}`),
    enabled: !!user && !initial,
  });
  const { notify } = useSession();
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (!publishedRef.current)
        uploadedRef.current.forEach((image) =>
          api(`/media/${image.id}`, { method: 'DELETE' }).catch(() => {}),
        );
    };
  }, []);
  async function addImages(event) {
    setUploading(true);
    setUploadError('');
    try {
      const files = [...event.target.files];
      if (images.length + files.length > 4) throw new Error('Add up to four images per post.');
      const uploaded = [];
      for (const file of files) {
        const image = await uploadImage(file);
        if (!aliveRef.current) {
          await api(`/media/${image.id}`, { method: 'DELETE' }).catch(() => {});
          break;
        }
        uploaded.push(image);
        uploadedRef.current.push(image);
      }
      setImages((current) => [...current, ...uploaded]);
    } catch (error) {
      setUploadError(error.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }
  function submit(event) {
    event.preventDefault();
    const payload = {
      title: title.trim(),
      body: body.trim(),
      tags: [
        ...new Set(
          tags
            .split(',')
            .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
            .filter(Boolean),
        ),
      ],
    };
    if (!initial)
      Object.assign(payload, {
        type,
        visibility,
        groupId: group?.id,
        projectId: projectId || undefined,
        mediaIds: images.map((image) => image.id),
      });
    action.run(
      () =>
        api(initial ? `/posts/${initial.id}` : '/posts', {
          method: initial ? 'PATCH' : 'POST',
          body: payload,
        }),
      initial ? 'Your post has been updated.' : 'Shared with the community.',
      () => {
        publishedRef.current = true;
        onClose();
      },
    );
  }
  return (
    <Modal title={initial ? 'Edit your post' : 'Share something with the community'} onClose={onClose} wide>
      <form onSubmit={submit} className={s.form}>
        <div className={s.composerIdentity}>
          <Avatar user={user} />
          <div>
            <strong>{user?.name}</strong>
            <small>{group ? `Posting in ${group.name}` : 'A small step forward is worth sharing.'}</small>
          </div>
        </div>
        {!initial && (
          <div className={s.typePicker}>
            {Object.entries(postTypes).map(([key, item]) => (
              <button
                type="button"
                key={key}
                className={`${s.typeOption} ${type === key ? s.typeSelected : ''}`}
                onClick={() => setType(key)}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        )}
        <Field label="Title">
          <input
            required
            minLength={3}
            maxLength={180}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={type === 'help' ? 'What are you stuck on?' : 'Give your update a little headline…'}
          />
        </Field>
        <div className={s.editorTabs}>
          <span>Write your story</span>
          <button type="button" onClick={() => setPreview(!preview)}>
            {preview ? 'Back to writing' : 'Preview Markdown'}
          </button>
        </div>
        {preview ? (
          <div className={s.preview}>
            <Markdown>{body || '*Your story starts here…*'}</Markdown>
          </div>
        ) : (
          <textarea
            aria-label="Post content"
            required
            minLength={1}
            maxLength={12000}
            rows={7}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={
              type === 'help'
                ? 'Explain what you expected, what happened, and what you have tried. Use fenced code blocks for examples.'
                : 'What did you build, discover, or wonder about today? Markdown and code blocks are welcome.'
            }
          />
        )}
        <Field label="Tags" hint="Separate tags with commas. Up to 8 tags.">
          <input
            maxLength={250}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="react, buildinpublic, javascript"
          />
        </Field>
        {!initial && (
          <div className={s.formRow}>
            {!group && (
              <Field label="Who can see this?">
                <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
                  <option value="public">Everyone · Public</option>
                  <option value="friends">Friends only</option>
                </select>
              </Field>
            )}
            <Field label="Link to a project">
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">No project</option>
                {listItems(projects.data).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {!!images.length && (
          <div className={s.uploadPreviews}>
            {images.map((image) => (
              <div key={image.id}>
                <img src={image.url} alt="Ready to upload" />
                <button
                  type="button"
                  aria-label="Remove image"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(
                      () => api(`/media/${image.id}`, { method: 'DELETE' }),
                      undefined,
                      () => {
                        setImages((current) => current.filter((item) => item.id !== image.id));
                        uploadedRef.current = uploadedRef.current.filter((item) => item.id !== image.id);
                      },
                    )
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {uploadError && (
          <p className={s.inlineError} role="alert">
            {uploadError}
          </p>
        )}
        <div className={s.composerBottom}>
          <div className={s.row}>
            {!initial && (
              <>
                <input
                  ref={input}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  hidden
                  onChange={addImages}
                />
                <button
                  type="button"
                  className={s.subtleButton}
                  disabled={uploading || images.length >= 4}
                  onClick={() => input.current.click()}
                >
                  <ImagePlus size={18} />
                  {uploading ? 'Uploading…' : 'Add images'}
                </button>
              </>
            )}
            <button
              type="button"
              title="Insert a code block"
              className={s.iconButton}
              onClick={() => {
                setBody((current) => `${current}\n\n\`\`\`javascript\n// Your code here\n\`\`\`\n`);
                setPreview(false);
                notify('Code block added.');
              }}
            >
              <Code2 size={18} />
            </button>
          </div>
          <button className={s.primaryButton} disabled={action.busy || uploading || !body.trim()}>
            <Send size={16} />
            {action.busy ? 'Publishing…' : initial ? 'Save changes' : 'Publish post'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function UserRow({ user, children, subtitle }) {
  return (
    <div className={s.userRow}>
      <Link to={`/u/${user.username}`} className={s.author}>
        <Avatar user={user} />
        <span>
          <strong>{user.name}</strong>
          <small>{subtitle || `@${user.username}`}</small>
        </span>
      </Link>
      {children}
    </div>
  );
}

export function LoadMore({ hasNextPage, isFetchingNextPage, fetchNextPage, label = 'posts' }) {
  return hasNextPage ? (
    <button className={s.loadMore} disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
      {isFetchingNextPage ? <LoaderCircle className={s.spin} size={17} /> : <ChevronDown size={17} />}
      {isFetchingNextPage ? 'Loading…' : `See more ${label}`}
    </button>
  ) : null;
}

export function RequireAccount({ title = 'Your community is waiting' }) {
  return (
    <Empty
      title={title}
      description="Sign in to connect with developers, share your work, and make this space your own."
    >
      <Link to="/login" className={s.primaryButton}>
        Sign in to Pitchers <ArrowUpRight size={16} />
      </Link>
    </Empty>
  );
}

export function StatusPill({ children }) {
  return (
    <span className={s.statusPill}>
      <Check size={12} />
      {children}
    </span>
  );
}
