import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  Code2,
  Filter,
  Heart,
  ImagePlus,
  MessageCircle,
  Pencil,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api, listItems, queryString } from '../api';
import { useSession } from '../session';
import {
  Avatar,
  Composer,
  Empty,
  ErrorState,
  LoadMore,
  Markdown,
  PageTitle,
  PostCard,
  ReportButton,
  RequireAccount,
  Spinner,
  UserRow,
  postTypes,
  timeAgo,
  useAction,
  usePagedList,
} from '../components';
import s from '../ui.module.css';

export function usePosts(filters) {
  return useInfiniteQuery({
    queryKey: ['posts', filters],
    queryFn: ({ pageParam }) => api(`/posts?${queryString({ ...filters, cursor: pageParam })}`),
    initialPageParam: undefined,
    getNextPageParam: (last) => last?.nextCursor || undefined,
  });
}

export function PostsList({
  filters,
  emptyTitle = 'A fresh page, ready for your story',
  emptyDescription = 'Share an update, ask a question, or find a few people to follow.',
}) {
  const posts = usePosts(filters);
  const items = posts.data?.pages.flatMap(listItems) || [];
  if (posts.isLoading) return <Spinner />;
  if (posts.error) return <ErrorState error={posts.error} retry={posts.refetch} />;
  return (
    <>
      {items.length ? (
        <div className={s.postList}>
          {items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <Empty title={emptyTitle} description={emptyDescription} />
      )}
      <LoadMore {...posts} />
    </>
  );
}

function SearchResults({ search, category }) {
  const results = usePagedList([category, 'search', search], `/${category}?${queryString({ search })}`);
  if (results.isLoading) return <Spinner />;
  if (results.error) return <ErrorState error={results.error} retry={results.refetch} />;
  const items = listItems(results.data);
  if (!items.length)
    return (
      <Empty icon={Search} title="No matches just yet" description="Try another name, topic, or keyword." />
    );
  return (
    <div className={s.panel}>
      {items.map((item) =>
        category === 'users' ? (
          <UserRow key={item.id} user={item} subtitle={item.bio || 'Developer in the community'}>
            <Link to={`/u/${item.username}`} className={s.outlineButton}>
              View profile
            </Link>
          </UserRow>
        ) : (
          <Link className={s.searchResult} key={item.id} to={`/${category}/${item.slug}`}>
            <span className={s.resultIcon}>
              {category === 'groups' ? <Users size={22} /> : <Code2 size={22} />}
            </span>
            <span>
              <strong>{item.title || item.name}</strong>
              <p>{item.description}</p>
            </span>
            <ArrowUpRight size={18} />
          </Link>
        ),
      )}
      <LoadMore {...results} label="results" />
    </div>
  );
}

export function FeedPage({ mode = 'explore' }) {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const [compose, setCompose] = useState(false);
  const [category, setCategory] = useState('posts');
  const navigate = useNavigate();
  const search = params.get('search') || '';
  const type = params.get('type') || '';
  const tag = params.get('tag') || '';
  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  }
  if (mode !== 'explore' && !user)
    return (
      <RequireAccount title={mode === 'saved' ? 'Keep the good ideas close' : 'A feed that feels like you'} />
    );
  return (
    <>
      {!search && !tag && mode === 'explore' ? (
        <PageTitle title="Your feed" subtitle="Fresh ideas, small wins, and good company. Keep building." />
      ) : (
        <PageTitle
          eyebrow={
            mode === 'saved'
              ? 'YOUR PERSONAL COLLECTION'
              : mode === 'home'
                ? 'YOUR CORNER OF THE COMMUNITY'
                : 'FIND YOUR NEXT SPARK'
          }
          title={
            search
              ? `Results for “${search}”`
              : tag
                ? `#${tag}`
                : mode === 'saved'
                  ? 'Saved for a little later.'
                  : `Welcome back, ${user?.name?.split(' ')[0] || 'builder'}.`
          }
          subtitle={
            search
              ? 'People, projects, and conversations worth finding.'
              : mode === 'saved'
                ? 'Ideas worth keeping. Only you can see this collection.'
                : 'The latest from your friends, follows, and spaces.'
          }
        />
      )}
      {mode !== 'saved' && !search && (
        <div className={s.quickComposer}>
          <Avatar user={user} />
          <button onClick={() => (user ? setCompose(true) : navigate('/login'))}>
            {user
              ? `What’s on your mind, ${user.name?.split(' ')[0]}?`
              : 'What did you learn or build today?'}
          </button>
          <button
            className={s.iconButton}
            aria-label="Add image to new post"
            onClick={() => (user ? setCompose(true) : navigate('/login'))}
          >
            <ImagePlus size={21} />
          </button>
          <span />
          <button
            className={s.composerSend}
            aria-label="Create post"
            onClick={() => (user ? setCompose(true) : navigate('/login'))}
          >
            <ArrowUpRight size={21} />
          </button>
        </div>
      )}
      {search && (
        <div className={s.tabs}>
          {[
            ['posts', 'Posts'],
            ['users', 'People'],
            ['projects', 'Projects'],
            ['groups', 'Groups'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={category === key ? s.tabActive : ''}
              onClick={() => setCategory(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {!search || category === 'posts' ? (
        <>
          <div className={s.feedControls}>
            <div className={s.filterChips}>
              <button className={!type ? s.chipActive : ''} onClick={() => setFilter('type', '')}>
                For you
              </button>
              {Object.entries(postTypes).map(([key, item]) => (
                <button
                  key={key}
                  className={type === key ? s.chipActive : ''}
                  onClick={() => setFilter('type', key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className={s.sortHint}>
              <Filter size={13} /> Latest
            </span>
          </div>
          {tag && (
            <button className={s.activeFilter} onClick={() => setFilter('tag', '')}>
              #{tag}
              <X size={13} />
            </button>
          )}
          <PostsList
            filters={{ feed: mode, type, tag, search }}
            emptyTitle={mode === 'saved' ? 'Your next great idea belongs here' : 'No posts here yet'}
            emptyDescription={
              mode === 'saved'
                ? 'Tap the bookmark on any post to come back to it later.'
                : 'Try a different filter, follow a developer, or start the conversation.'
            }
          />
        </>
      ) : (
        <SearchResults search={search} category={category} />
      )}
      {compose && <Composer onClose={() => setCompose(false)} />}
    </>
  );
}

function Comment({ comment, post, onReply, children, depth = 0 }) {
  const action = useAction();
  const { user } = useSession();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const isSolution = comment.isSolution || post.solutionCommentId === comment.id;
  return (
    <div className={`${s.comment} ${isSolution ? s.solutionComment : ''}`}>
      {isSolution && (
        <div className={s.solutionLabel}>
          <CheckCircle2 size={14} /> Accepted solution
        </div>
      )}
      <header className={s.commentHeader}>
        <Link to={`/u/${comment.author?.username}`} className={s.author}>
          <Avatar user={comment.author} size="small" />
          <span>
            <strong>{comment.author?.name}</strong>
            <small>{timeAgo(comment.createdAt)}</small>
          </span>
        </Link>
        <div className={s.row}>
          {comment.canEdit && (
            <button
              className={s.iconButton}
              title="Edit comment"
              aria-label="Edit comment"
              onClick={() => setEditing(!editing)}
            >
              <Pencil size={13} />
            </button>
          )}
          {(comment.canEdit || comment.canModerate) && (
            <button
              className={s.iconButton}
              title="Delete comment"
              aria-label="Delete comment"
              disabled={action.busy}
              onClick={() => {
                if (window.confirm('Delete this comment?'))
                  action.run(() => api(`/comments/${comment.id}`, { method: 'DELETE' }), 'Comment deleted.');
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
          <ReportButton targetType="comment" targetId={comment.id} compact />
        </div>
      </header>
      {editing ? (
        <form
          className={s.commentEdit}
          onSubmit={(event) => {
            event.preventDefault();
            action.run(
              () => api(`/comments/${comment.id}`, { method: 'PATCH', body: { body } }),
              'Comment updated.',
              () => setEditing(false),
            );
          }}
        >
          <textarea
            required
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-label="Edit comment content"
          />
          <div className={s.row}>
            <button className={s.smallPrimary} disabled={action.busy}>
              Save
            </button>
            <button type="button" className={s.textButton} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <Markdown>{comment.body}</Markdown>
      )}
      <div className={s.commentActions}>
        <button
          aria-pressed={!!comment.liked}
          className={comment.liked ? s.liked : ''}
          disabled={action.busy}
          onClick={() =>
            user
              ? action.run(() =>
                  api(`/comments/${comment.id}/like`, { method: comment.liked ? 'DELETE' : 'PUT' }),
                )
              : navigate('/login')
          }
        >
          <Heart size={14} fill={comment.liked ? 'currentColor' : 'none'} />
          {comment.likeCount || 0}
        </button>
        <button onClick={() => (user ? onReply(comment) : navigate('/login'))}>
          <Reply size={14} />
          Reply
        </button>
        {post.canEdit && post.type === 'help' && (
          <button
            disabled={action.busy}
            onClick={() =>
              action.run(
                () =>
                  api(`/posts/${post.id}/solution`, {
                    method: 'PUT',
                    body: { commentId: isSolution ? null : comment.id },
                  }),
                isSolution ? 'Question reopened.' : 'Solution accepted.',
              )
            }
          >
            <CheckCircle2 size={14} />
            {isSolution ? 'Reopen question' : 'Mark as solution'}
          </button>
        )}
      </div>
      {children && <div className={depth < 2 ? s.replies : s.deepReplies}>{children}</div>}
    </div>
  );
}

export function PostPage() {
  const { id } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const [body, setBody] = useState('');
  const [reply, setReply] = useState(null);
  const action = useAction();
  const post = useQuery({ queryKey: ['post', id], queryFn: () => api(`/posts/${id}`) });
  const comments = usePagedList(['comments', id], `/posts/${id}/comments`, !!post.data);
  useEffect(() => {
    if (post.data && window.location.hash === '#comments')
      document.getElementById('comments')?.scrollIntoView({ block: 'start' });
  }, [post.data?.id]);
  if (post.isLoading) return <Spinner />;
  if (post.error) return <ErrorState error={post.error} retry={post.refetch} />;
  const items = listItems(comments.data);
  function renderComments(parentId = null, depth = 0, seen = new Set()) {
    return items
      .filter(
        (item) =>
          !seen.has(item.id) &&
          ((item.parentId || null) === parentId ||
            (parentId === null && item.parentId && !items.some((parent) => parent.id === item.parentId))),
      )
      .map((item) => (
        <Comment
          key={item.id}
          comment={item}
          post={post.data}
          onReply={(comment) => {
            setReply(comment);
            document.getElementById('comment-body')?.focus();
          }}
          depth={depth}
        >
          {renderComments(item.id, depth + 1, new Set([...seen, item.id]))}
        </Comment>
      ));
  }
  return (
    <>
      <Link to="/explore" className={s.backLink}>
        <ArrowLeft size={16} />
        Back to the feed
      </Link>
      <PostCard post={post.data} detail onDeleted={() => navigate('/explore')} />
      <section className={s.commentsPanel} id="comments">
        <h2>
          Keep the conversation going <span>{post.data.commentCount || 0}</span>
        </h2>
        {user ? (
          <form
            className={s.commentForm}
            onSubmit={(event) => {
              event.preventDefault();
              action.run(
                () =>
                  api(`/posts/${id}/comments`, {
                    method: 'POST',
                    body: { body: body.trim(), parentId: reply?.parentId || reply?.id },
                  }),
                'Comment posted.',
                () => {
                  setBody('');
                  setReply(null);
                },
              );
            }}
          >
            {reply && (
              <div className={s.replyNotice}>
                Replying to {reply.author?.name}
                <button type="button" aria-label="Cancel reply" onClick={() => setReply(null)}>
                  <X size={14} />
                </button>
              </div>
            )}
            <div className={s.row}>
              <Avatar user={user} size="small" />
              <textarea
                id="comment-body"
                aria-label="Write a comment"
                placeholder="Add a thought, a little encouragement, or a helpful answer…"
                required
                maxLength={3000}
                rows={3}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>
            <div className={s.commentFormFooter}>
              <span>Markdown & code snippets welcome.</span>
              <button className={s.smallPrimary} disabled={action.busy || !body.trim()}>
                <Send size={14} />
                {reply ? 'Post reply' : 'Comment'}
              </button>
            </div>
          </form>
        ) : (
          <div className={s.signInPrompt}>
            <MessageCircle size={18} />
            <span>
              <Link to="/login">Sign in</Link> to join the conversation.
            </span>
          </div>
        )}
        {comments.isLoading ? (
          <Spinner label="Loading the conversation…" />
        ) : comments.error ? (
          <ErrorState error={comments.error} retry={comments.refetch} />
        ) : items.length ? (
          renderComments()
        ) : (
          <Empty
            icon={MessageCircle}
            title="Be the first to say something"
            description="A thoughtful comment can make someone's day."
          />
        )}
        <LoadMore {...comments} label="comments" />
      </section>
    </>
  );
}

export function NotificationsPage() {
  const { user } = useSession();
  const action = useAction();
  const notifications = usePagedList(['notifications', 'pages'], '/notifications', !!user);
  if (!user) return <RequireAccount title="Stay in the conversation" />;
  const items = listItems(notifications.data);
  const messages = {
    like: 'liked your post',
    comment: 'commented on your post',
    reply: 'replied to your comment',
    friend_request: 'sent you a friend request',
    friend_accept: 'accepted your friend request',
    follow: 'started following you',
    solution: 'selected your comment as a solution',
    group_approved: 'approved your group request',
    group_request: 'requested to join your group',
  };
  function target(item) {
    return (
      item.url ||
      item.href ||
      (item.targetType === 'post'
        ? `/posts/${item.targetId}`
        : item.postId
          ? `/posts/${item.postId}`
          : item.type?.includes('friend')
            ? '/friends'
            : item.group?.slug
              ? `/groups/${item.group.slug}`
              : item.actor?.username
                ? `/u/${item.actor.username}`
                : '/explore')
    );
  }
  return (
    <>
      <PageTitle
        eyebrow="YOU’RE PART OF SOMETHING"
        title="Your notifications"
        subtitle="The little connections that keep a community moving."
      >
        <button
          className={s.outlineButton}
          disabled={action.busy || !items.some((item) => !item.readAt && !item.isRead)}
          onClick={() =>
            action.run(() => api('/notifications/read', { method: 'POST', body: {} }), 'All caught up.')
          }
        >
          <Check size={15} />
          Mark all read
        </button>
      </PageTitle>
      {notifications.isLoading ? (
        <Spinner />
      ) : notifications.error ? (
        <ErrorState error={notifications.error} retry={notifications.refetch} />
      ) : items.length ? (
        <div className={s.panel}>
          {items.map((item) => (
            <div
              key={item.id}
              className={`${s.notificationRow} ${!item.readAt && !item.isRead ? s.unread : ''}`}
            >
              <Link
                to={target(item)}
                onClick={() => {
                  if (!item.readAt && !item.isRead)
                    action.run(() =>
                      api('/notifications/read', { method: 'POST', body: { ids: [item.id] } }),
                    );
                }}
              >
                <Avatar user={item.actor} />
                <div>
                  <p>
                    {item.title || (
                      <>
                        <strong>{item.actor?.name} </strong>
                        {item.message ||
                          messages[item.kind || item.type] ||
                          'shared a new update in your community.'}
                      </>
                    )}
                  </p>
                  {(item.body || item.preview) && <small>{item.body || item.preview}</small>}
                  <time>{timeAgo(item.createdAt)}</time>
                </div>
                <ArrowUpRight size={16} />
              </Link>
            </div>
          ))}
          <LoadMore {...notifications} label="notifications" />
        </div>
      ) : (
        <Empty
          icon={Bell}
          title="A quiet moment"
          description="When someone connects with you or responds to your work, you'll hear about it here."
        />
      )}
    </>
  );
}

export function AdminPage() {
  const { user } = useSession();
  const action = useAction();
  const reports = useQuery({
    queryKey: ['reports'],
    queryFn: () => api('/admin/reports'),
    enabled: user?.role === 'admin',
  });
  if (user?.role !== 'admin')
    return (
      <Empty
        icon={ShieldCheck}
        title="Moderators only"
        description="This space is available to community administrators."
      />
    );
  return (
    <>
      <PageTitle
        eyebrow="COMMUNITY CARE"
        title="Moderation queue"
        subtitle="Review reports and keep Pitchers welcoming for everyone."
      />
      {reports.isLoading ? (
        <Spinner />
      ) : reports.error ? (
        <ErrorState error={reports.error} retry={reports.refetch} />
      ) : listItems(reports.data).length ? (
        <div className={s.cardList}>
          {listItems(reports.data).map((report) => (
            <article key={report.id} className={s.panel}>
              <div className={s.between}>
                <span className={s.statusPill}>
                  {report.targetType} · {report.status || 'pending'}
                </span>
                <small className={s.muted}>{timeAgo(report.createdAt)}</small>
              </div>
              <p className={s.reportReason}>{report.reason}</p>
              {report.target?.label && (
                <p className={s.reportTarget}>
                  <strong>Reported {report.targetType}:</strong> {report.target.label}
                </p>
              )}
              {report.target?.body && <blockquote>{report.target.body}</blockquote>}
              <p className={s.muted}>
                Reported by {report.reporter?.name || report.reporter?.username || 'community member'}
              </p>
              <div className={s.reportActions}>
                {(report.target?.href || report.targetType === 'post') && (
                  <Link className={s.outlineButton} to={report.target?.href || `/posts/${report.targetId}`}>
                    Review {report.targetType} <ArrowUpRight size={14} />
                  </Link>
                )}
                {(!report.status || report.status === 'pending' || report.status === 'open') && (
                  <>
                    <button
                      className={s.outlineButton}
                      disabled={action.busy}
                      onClick={() =>
                        action.run(
                          () =>
                            api(`/admin/reports/${report.id}`, {
                              method: 'PATCH',
                              body: { action: 'dismiss' },
                            }),
                          'Report dismissed.',
                        )
                      }
                    >
                      Dismiss
                    </button>
                    <button
                      className={s.dangerButton}
                      disabled={action.busy}
                      onClick={() => {
                        if (window.confirm('Remove the reported content or restrict this account?'))
                          action.run(
                            () =>
                              api(`/admin/reports/${report.id}`, {
                                method: 'PATCH',
                                body: { action: 'remove' },
                              }),
                            'Report resolved.',
                          );
                      }}
                    >
                      <Trash2 size={14} />
                      Remove target
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={ShieldCheck}
          title="All clear"
          description="There are no reports waiting for your review."
        />
      )}
    </>
  );
}
