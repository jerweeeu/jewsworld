import React, { useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths
} from 'date-fns';
import { enUS } from 'date-fns/locale';
import {
  ArrowLeft,
  ArrowRight,
  BookHeart,
  CalendarDays,
  Camera,
  LogOut,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  X
} from 'lucide-react';
import { supabase, supabaseConfigured } from './supabase';

const todayKey = () => format(new Date(), 'yyyy-MM-dd');

const errorText = (error) =>
  error?.message || 'Something went wrong. Please try again later.';

function AuthPanel({ onClose, onDone }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      if (!supabase) {
        throw new Error(
          'Supabase is not connected. Please check your .env settings.'
        );
      }

      if (mode === 'signup') {
        if (password.length < 8) {
          throw new Error('Your password must be at least 8 characters long.');
        }

        const cleanName = displayName.trim();

        if (cleanName.length < 2 || cleanName.length > 40) {
          throw new Error('Your display name must be between 2 and 40 characters.');
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: cleanName }
          }
        });

        if (error) throw error;

        if (data.session) {
          setMessage('Account created successfully. Welcome!');
          onDone(data.session.user);
        } else {
          setMessage(
            'Your account has been created. If you cannot sign in yet, check your email confirmation settings in Supabase.'
          );
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;

        onDone(data.user);
      }
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="modal auth-modal">
        <button
          className="icon-button close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="eyebrow">ALWAYS BE THERE</div>

        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>

        <p className="muted">
          Sign in to enter your own little space for everyday memories.
        </p>

        <form onSubmit={submit} className="stack">
          {mode === 'signup' && (
            <label>
              What should we call you?
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                minLength={2}
                maxLength={40}
                autoComplete="nickname"
                placeholder="Your display name"
              />
            </label>
          )}

          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="name@example.com"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              placeholder="At least 8 characters"
            />
          </label>

          {mode === 'signup' && (
            <p className="muted">
              Use an email address you can access, and keep your password
              somewhere safe. If email confirmation is disabled, you will not
              need to click a verification link.
            </p>
          )}

          <button className="primary-button" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Log in'
                : 'Create account'}
          </button>
        </form>

        {message && <p className="notice">{message}</p>}

        <button
          className="text-button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setMessage('');
          }}
        >
          {mode === 'login'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Log in'}
        </button>
      </section>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
  const timer = setInterval(() => {
  setCurrentTime(new Date());
  }, 1000);

     return () => clearInterval(timer);
}, []);

  const timeText = format(currentTime, 'HH');
  const dateText = format(currentTime, 'EEE, MMM d', { locale: enUS });
  const [authOpen, setAuthOpen] = useState(false);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [view, setView] = useState('calendar');
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [composerMode, setComposerMode] = useState('note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState([]);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [activePost, setActivePost] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsAdmin(data.session?.user?.app_metadata?.role === 'admin');
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        setSession(next);
        setIsAdmin(next?.user?.app_metadata?.role === 'admin');
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadPosts() {
    if (!supabaseConfigured) return;

    setBusy(true);
    setError('');

    try {
      const { data, error } = await supabase
        .from('diary_posts')
        .select(
          'id, title, body, entry_date, created_at, post_photos(id, storage_path, caption)'
        )
        .eq('status', 'published')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const withPhotos = (data || []).map((post) => ({
        ...post,
        photos: (post.post_photos || []).map((photo) => ({
          ...photo,
          url: supabase.storage
            .from('public-post-photos')
            .getPublicUrl(photo.storage_path).data.publicUrl
        }))
      }));

      setPosts(withPhotos);

      const ids = withPhotos.map((post) => post.id);

      if (ids.length) {
        const { data: commentData, error: commentError } = await supabase
          .from('comments')
          .select('id, post_id, body, created_at, user_id')
          .in('post_id', ids)
          .order('created_at', { ascending: true });

        if (commentError) throw commentError;

        const userIds = [
          ...new Set((commentData || []).map((comment) => comment.user_id))
        ];

        let profileMap = {};

        if (userIds.length) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', userIds);

          profileMap = Object.fromEntries(
            (profileData || []).map((profile) => [
              profile.id,
              profile.display_name
            ])
          );
        }

        const grouped = {};

        for (const comment of commentData || []) {
          const item = {
            ...comment,
            profiles: {
              display_name: profileMap[comment.user_id] || 'Diary friend'
            }
          };

          (grouped[comment.post_id] ||= []).push(item);
        }

        setComments(grouped);
      } else {
        setComments({});
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadPosts();
  }, [supabaseConfigured, session?.user?.id]);

  const postDates = useMemo(
    () => new Set(posts.map((post) => post.entry_date)),
    [posts]
  );

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });

    return eachDayOfInterval({ start, end });
  }, [month]);

  const selectedPosts = posts
    .filter((post) => post.entry_date === selectedDate)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const displayName =
    session?.user?.user_metadata?.display_name ||
    session?.user?.email?.split('@')[0];

  async function publishPost(e) {
    e.preventDefault();

    if (!session) {
      setAuthOpen(true);
      return;
    }

    if (!isAdmin) {
      setError('Only the site admin can publish entries.');
      return;
    }

    if (composerMode === 'note' && !body.trim()) {
      setError('Please write an entry first.');
      return;
    }

    if (composerMode === 'photo' && photos.length === 0) {
      setError('Please select at least one photo.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const { data: post, error: postError } = await supabase
        .from('diary_posts')
        .insert({
          title: title.trim() || null,
          body: composerMode === 'note' ? body.trim() : '',
          entry_date: selectedDate,
          status: 'published',
          author_id: session.user.id
        })
        .select()
        .single();

      if (postError) throw postError;

      for (const file of composerMode === 'photo' ? photos : []) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${post.id}/${crypto.randomUUID()}.${ext}`;
  
  const { error: uploadError } = await supabase.storage
    .from('public-post-photos')
    .upload(path, file, { upsert: false });

  if (uploadError) throw uploadError;

  const { error: photoError } = await supabase
    .from('post_photos')
    .insert({
      post_id: post.id,
      storage_path: path,
      caption: ''
    });

  if (photoError) throw photoError;
}

      setTitle('');
      setBody('');
      setPhotos([]);
      setShowComposer(false);
      setComposerMode('note');

      await loadPosts();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function addComment(postId) {
    if (!session) {
      setAuthOpen(true);
      return;
    }

    const text = (commentDrafts[postId] || '').trim();

    if (!text) return;

    setError('');

    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      body: text,
      user_id: session.user.id
    });

    if (error) {
      setError(errorText(error));
    } else {
      setCommentDrafts((old) => ({ ...old, [postId]: '' }));

      const { data, error: readError } = await supabase
        .from('comments')
        .select('id, post_id, body, created_at, user_id')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (readError) {
        setError(errorText(readError));
      } else {
        const ids = [...new Set((data || []).map((comment) => comment.user_id))];

        const { data: profiles } = ids.length
          ? await supabase
              .from('profiles')
              .select('id, display_name')
              .in('id', ids)
          : { data: [] };

        const names = Object.fromEntries(
          (profiles || []).map((profile) => [profile.id, profile.display_name])
        );

        setComments((old) => ({
          ...old,
          [postId]: (data || []).map((comment) => ({
            ...comment,
            profiles: {
              display_name: names[comment.user_id] || 'Diary friend'
            }
          }))
        }));
      }
    }
  }

  async function deleteComment(comment) {
    if (!session) return;

    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', comment.id);

    if (error) {
      setError(errorText(error));
    } else {
      setComments((old) => ({
        ...old,
        [comment.post_id]: (old[comment.post_id] || []).filter(
          (item) => item.id !== comment.id
        )
      }));
    }
  }

  async function deletePost(post) {
    if (
      !confirm(
        'Delete this entry? This action cannot be undone.'
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from('diary_posts')
      .delete()
      .eq('id', post.id);

    if (error) {
      setError(errorText(error));
    } else {
      await loadPosts();
    }
  }

  if (!supabaseConfigured) {
    return (
      <main className="setup-screen">
        <div className="setup-card">
          <div className="brand-mark">
            <BookHeart />
          </div>

          <div className="eyebrow">
            YOUR LITTLE CORNER OF THE INTERNET
          </div>

          <h1>Always Be There</h1>

          <p>A place to keep life's little moments, photos, and thoughts.</p>

          <div className="setup-note">
            <strong>Next step: Connect Supabase</strong>
            <br />
            Copy <code>.env.example</code> to <code>.env</code>, add your
            Supabase Project URL and Publishable/anon key, then restart the
            website.
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <div className="welcome-screen">
        <div className="welcome-brand">
          jewsworld
        </div>

        <main className="welcome-content">
      <div className="welcome-kicker">
        {timeText} {dateText}
      </div>

      <h1>
        welcome to a new world
      </h1>

      <p className="welcome-tagline">
        Let’s run through my daydream
      </p>

          <AuthPanel
            onClose={() => {}}
            onDone={() => setAuthOpen(false)}
          />
        </main>

        <div className="welcome-foot">
          call me if u get lost
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">
            <BookHeart size={20} />
          </span>

          <span>
            A Couple Minutes
            <small>Things are getting better and better</small>
          </span>
        </a>

        <nav>
          <span className="user-pill">{displayName}</span>

          <button
            className="outline-button"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut size={16} /> Log out
          </button>
        </nav>
      </header>

      <main className="main-layout">
        {view === 'calendar' && (
          <>
            <section className="intro">
              <div className="eyebrow">
                <Sparkles size={14} /> RECORD EVERDAY
              </div>

              <h1>Always Be There</h1>

              <p>
                Little things today, beautiful memories tomorrow.
              </p>
            </section>

            <section className="calendar-card">
              <div className="calendar-head">
                <div>
                  <div className="eyebrow">YOUR MEMORY CALENDAR</div>
                  <h2>{format(month, 'MMMM yyyy', { locale: enUS })}</h2>
                </div>

                <div className="date-selectors">
                  <label className="date-select">
                    <span>Year</span>

                    <select
                      aria-label="Select year"
                      value={month.getFullYear()}
                      onChange={(e) =>
                        setMonth(
                          new Date(
                            Number(e.target.value),
                            month.getMonth(),
                            1
                          )
                        )
                      }
                    >
                      {Array.from(
                        { length: 51 },
                        (_, i) => new Date().getFullYear() - 25 + i
                      ).map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="date-select">
                    <span>Month</span>

                    <select
                      aria-label="Select month"
                      value={month.getMonth()}
                      onChange={(e) =>
                        setMonth(
                          new Date(
                            month.getFullYear(),
                            Number(e.target.value),
                            1
                          )
                        )
                      }
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i} value={i}>
                          {format(new Date(2000, i, 1), 'MMMM', {
                            locale: enUS
                          })}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="month-nav">
                    <button
                      className="icon-button"
                      aria-label="Previous month"
                      onClick={() => setMonth(subMonths(month, 1))}
                    >
                      <ArrowLeft size={18} />
                    </button>

                    <button
                      className="icon-button"
                      aria-label="Next month"
                      onClick={() => setMonth(addMonths(month, 1))}
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="calendar-grid weekday-row">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
                  (day) => (
                    <span key={day}>{day}</span>
                  )
                )}
              </div>

              <div className="calendar-grid day-grid">
                {calendarDays.map((day) => {
                  const key = format(day, 'yyyy-MM-dd');

                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedDate(key);
                        setShowComposer(false);
                        setView('day');
                      }}
                      className={`day-cell ${
                        !isSameMonth(day, month) ? 'outside' : ''
                      } ${key === selectedDate ? 'selected' : ''} ${
                        isToday(day) ? 'today' : ''
                      }`}
                    >
                      <span>{format(day, 'd')}</span>
                      {postDates.has(key) && <i />}
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {view === 'day' && (
          <section className="entries-section day-view">
            <button
              className="back-calendar"
              onClick={() => setView('calendar')}
            >
              <ArrowLeft size={17} /> Back to Calendar
            </button>

            <div className="section-heading">
              <div>
                <div className="eyebrow">
                  <CalendarDays size={16} /> Where the Flower Blooms
                </div>

                <h2>
                  {format(
                    new Date(`${selectedDate}T12:00:00`),
                    'MMMM d · EEEE',
                    { locale: enUS }
                  )}
                </h2>
              </div>

              {isAdmin && (
                <button
                  className="primary-button compact"
                  onClick={() => {
                    setShowComposer((value) => !value);
                    setComposerMode('note');
                  }}
                >
                  <Plus size={16} /> Add Entry
                </button>
              )}
            </div>

            {error && (
              <div className="error-banner">
                {error}
                <button onClick={() => setError('')} aria-label="Dismiss error">
                  <X size={14} />
                </button>
              </div>
            )}

            {busy && <p className="muted">Loading entries…</p>}

            {!busy && selectedPosts.length === 0 && !showComposer && (
              <div className="empty-state">
                <div className="empty-icon">
                  <Camera size={24} />
                </div>

                <h3>Whats poppin today?!</h3>

                <p>Even ordinary days are worth remembering.</p>

                {isAdmin && (
                  <button
                    className="outline-button"
                    onClick={() => setShowComposer(true)}
                  >
                    <Plus size={16} /> Capture this day
                  </button>
                )}
              </div>
            )}

            {showComposer && isAdmin && (
              <form className="composer card" onSubmit={publishPost}>
                <div className="composer-head">
                  <h3>
                    {composerMode === 'note' ? 'Write a note' : 'Add photos'}
                  </h3>

                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setShowComposer(false)}
                    aria-label="Close editor"
                  >
                    <X size={17} />
                  </button>
                </div>

                <div className="composer-mode">
                  <button
                    type="button"
                    className={composerMode === 'note' ? 'mode-active' : ''}
                    onClick={() => setComposerMode('note')}
                  >
                    <BookHeart size={15} /> Written note
                  </button>

                  <button
                    type="button"
                    className={composerMode === 'photo' ? 'mode-active' : ''}
                    onClick={() => setComposerMode('photo')}
                  >
                    <Camera size={15} /> Photos
                  </button>
                </div>

                {composerMode === 'note' ? (
                  <>
                    <label>
                      Title (optional)
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={120}
                        placeholder="What made today special?"
                      />
                    </label>

                    <label>
                      Your entry
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={5}
                        maxLength={10000}
                        placeholder="Write down how today felt…"
                        required
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Photo title (optional)
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={120}
                        placeholder="Give these photos a title"
                      />
                    </label>

                    <label className="upload-box">
                      <Camera size={20} />

                      <span>Choose photos (multiple allowed)</span>

                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) =>
                          setPhotos(
                            Array.from(e.target.files || []).slice(0, 10)
                          )
                        }
                      />

                      <small>
                        {photos.length
                          ? `${photos.length} photo(s) selected`
                          : 'Up to 10 photos'}
                      </small>
                    </label>
                  </>
                )}

                <button className="primary-button" disabled={busy}>
                  {busy
                    ? 'Publishing…'
                    : composerMode === 'note'
                      ? 'Save Entry'
                      : 'Upload Photos'}
                </button>
              </form>
            )}

            <div className="memory-grid">
              {selectedPosts
                .flatMap((post) => [
                  ...(post.body?.trim()
                    ? [{ kind: 'note', id: `note-${post.id}`, post }]
                    : []),
                  ...(post.photos || []).map((photo, index) => ({
                    kind: 'photo',
                    id: `photo-${photo.id}`,
                    post,
                    photo,
                    index
                  }))
                ])
                .map((item) =>
                  item.kind === 'note' ? (
                    <article
                      className="memory-card note-memory"
                      key={item.id}
                    >
                      <div className="memory-card-top">
                        <span className="memory-kind">
                          <BookHeart size={13} /> NOTE
                        </span>

                        {isAdmin && (
                          <button
                            className="text-button danger-text"
                            onClick={() => deletePost(item.post)}
                          >
                            Delete
                          </button>
                        )}
                      </div>

                      {item.post.title && <h3>{item.post.title}</h3>}

                      <p className="note-preview">{item.post.body}</p>

                      <button
                        className="read-note"
                        onClick={() => setActivePost(item.post)}
                      >
                        Read full entry <ArrowRight size={14} />
                      </button>

                      <div className="memory-comments">
                        <div className="comments-block">
                          <h4>
                            <MessageCircle size={16} /> Comments{' '}
                            {comments[item.post.id]?.length || 0}
                          </h4>

                          {(comments[item.post.id] || []).map((comment) => (
                            <div className="comment" key={comment.id}>
                              <div className="avatar">
                                {(
                                  comment.profiles?.display_name || 'F'
                                ).slice(0, 1)}
                              </div>

                              <div className="comment-content">
                                <div className="comment-author">
                                  {comment.profiles?.display_name ||
                                    'Diary friend'}{' '}
                                  <time>
                                    {format(
                                      new Date(comment.created_at),
                                      'M/d HH:mm'
                                    )}
                                  </time>
                                </div>

                                <p>{comment.body}</p>
                              </div>

                              {(session?.user?.id === comment.user_id ||
                                isAdmin) && (
                                <button
                                  className="icon-button tiny"
                                  aria-label="Delete comment"
                                  onClick={() => deleteComment(comment)}
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}

                          {session ? (
                            <form
                              className="comment-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                addComment(item.post.id);
                              }}
                            >
                              <input
                                value={commentDrafts[item.post.id] || ''}
                                onChange={(e) =>
                                  setCommentDrafts((old) => ({
                                    ...old,
                                    [item.post.id]: e.target.value
                                  }))
                                }
                                maxLength={1000}
                                placeholder="Leave a kind note…"
                                required
                              />

                              <button
                                aria-label="Send comment"
                                className="send-button"
                              >
                                <Send size={16} />
                              </button>
                            </form>
                          ) : (
                            <button
                              className="comment-login"
                              onClick={() => setAuthOpen(true)}
                            >
                              Log in to comment
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ) : (
                    <article
                      className="memory-card photo-memory"
                      key={item.id}
                    >
                      <div className="memory-photo-wrap">
                        <img
                          src={item.photo.url}
                          alt={
                            item.photo.caption ||
                            item.post.title ||
                            'Diary photo'
                          }
                          loading="lazy"
                        />

                        <span className="photo-date">
                          {format(
                            new Date(`${item.post.entry_date}T12:00:00`),
                            'M/d'
                          )}
                        </span>
                      </div>

                      {item.post.title && (
                        <p className="photo-caption">{item.post.title}</p>
                      )}

                      {isAdmin && (
                        <button
                          className="text-button danger-text photo-delete"
                          onClick={() => deletePost(item.post)}
                        >
                          Delete photo set
                        </button>
                      )}
                    </article>
                  )
                )}
            </div>

            {activePost && (
              <div
                className="modal-backdrop"
                onMouseDown={(e) =>
                  e.target === e.currentTarget && setActivePost(null)
                }
              >
                <section className="modal note-detail">
                  <button
                    className="icon-button close"
                    onClick={() => setActivePost(null)}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>

                  <div className="eyebrow">A LITTLE MEMORY</div>

                  <h2>{activePost.title || 'Untitled entry'}</h2>

                  <p className="note-detail-body">{activePost.body}</p>

                  <small>
                    {format(
                      new Date(`${activePost.entry_date}T12:00:00`),
                      'MMMM d, yyyy'
                    )}
                  </small>
                </section>
              </div>
            )}
          </section>
        )}

        <footer className="footer">
          Call Me If U Get Lost 
        </footer>
      </main>

      {authOpen && (
        <AuthPanel
          onClose={() => setAuthOpen(false)}
          onDone={() => setAuthOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
