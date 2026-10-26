import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from './supabase';
import './styles.css';

const today = new Date();

const dateKey = (year, month, day) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const daysInMonth = (year, month) =>
  new Date(year, month, 0).getDate();

const getErrorMessage = (error) =>
  error?.message || 'Something went wrong. Please try again.';

/* ========================================
   Single-value touch scrolling date wheel
======================================== */

function DateWheel({
  label,
  value,
  values,
  onChange,
  pad = false,
}) {
  const wheelRef = useRef(null);
  const timerRef = useRef(null);
  const ROW_HEIGHT = 48;

  // Keep the selected number aligned in the visible row.
  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return;

    const index = values.indexOf(Number(value));

    if (index >= 0) {
      wheel.scrollTop = index * ROW_HEIGHT;
    }
  }, [value, values]);

  // When scrolling stops, snap to the closest number.
  function handleScroll() {
    const wheel = wheelRef.current;
    if (!wheel) return;

    window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      const index = Math.max(
        0,
        Math.min(
          values.length - 1,
          Math.round(wheel.scrollTop / ROW_HEIGHT)
        )
      );

      const nextValue = values[index];

      if (nextValue !== undefined) {
        onChange(nextValue);
      }

      wheel.scrollTo({
        top: index * ROW_HEIGHT,
        behavior: 'smooth',
      });
    }, 100);
  }

  function handleWheel(event) {
    event.preventDefault();

    if (wheelRef.current) {
      wheelRef.current.scrollTop += event.deltaY;
    }
  }

  function handleKeyDown(event) {
    if (
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown'
    ) {
      return;
    }

    event.preventDefault();

    const currentIndex = values.indexOf(Number(value));

    const nextIndex = Math.max(
      0,
      Math.min(
        values.length - 1,
        currentIndex +
          (event.key === 'ArrowDown' ? 1 : -1)
      )
    );

    onChange(values[nextIndex]);
  }

  return (
    <div
      className="wheel-wrap"
      role="group"
      aria-label={label}
    >
      <div
        ref={wheelRef}
        className="date-wheel"
        onScroll={handleScroll}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label={`${label}: ${value}`}
      >
        {values.map((item) => (
          <button
            type="button"
            key={item}
            className={`date-wheel-item ${
              item === value ? 'is-selected' : ''
            }`}
            onClick={() => {
              onChange(item);

              const index = values.indexOf(item);

              if (wheelRef.current) {
                wheelRef.current.scrollTo({
                  top: index * ROW_HEIGHT,
                  behavior: 'smooth',
                });
              }
            }}
            aria-pressed={item === value}
          >
            {pad
              ? String(item).padStart(2, '0')
              : item}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ========================================
   Administrator login
======================================== */

function LoginPanel({ onClose, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();

    if (!supabase) {
      setMessage('Supabase is not connected.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error) throw error;

      onLogin(data.session);
      onClose();
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-shade"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="login-panel"
        aria-label="Administrator login"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <p className="tiny-label">ADMIN ACCESS</p>
        <h2>log in</h2>

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
            />
          </label>

          <button
            className="plain-button"
            type="submit"
            disabled={busy}
          >
            {busy ? 'please wait…' : 'enter'}
          </button>
        </form>

        {message && (
          <p className="form-message" role="alert">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}

/* ========================================
   Main website
======================================== */

function App() {
  const [page, setPage] = useState('home');

  const [loginOpen, setLoginOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [day, setDay] = useState(today.getDate());

  const [posts, setPosts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [uploadFile, setUploadFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const [lightboxIndex, setLightboxIndex] = useState(null);

  const selectedDate = dateKey(year, month, day);

  const yearValues = useMemo(
    () =>
      Array.from(
        { length: 101 },
        (_, index) => today.getFullYear() - 50 + index
      ),
    []
  );

  const monthValues = useMemo(
    () => Array.from({ length: 12 }, (_, index) => index + 1),
    []
  );

  const dayValues = useMemo(
    () =>
      Array.from(
        { length: daysInMonth(year, month) },
        (_, index) => index + 1
      ),
    [year, month]
  );

  /* Restore login session. */

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Could not restore session:', error);
        return;
      }

      if (!mounted) return;

      const nextSession = data.session;

      setSession(nextSession);
      setIsAdmin(
        nextSession?.user?.app_metadata?.role === 'admin'
      );
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setIsAdmin(
          nextSession?.user?.app_metadata?.role === 'admin'
        );
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /* Keep day valid when year or month changes. */

  useEffect(() => {
    const maximumDay = daysInMonth(year, month);

    if (day > maximumDay) {
      setDay(maximumDay);
    }
  }, [year, month, day]);

  /* Load published diary posts and their photos. */

  async function loadPosts() {
    if (!supabaseConfigured || !supabase) return;

    setBusy(true);
    setError('');

    try {
      const { data, error: queryError } = await supabase
        .from('diary_posts')
        .select(
          'id, title, body, entry_date, created_at, post_photos(id, storage_path, caption)'
        )
        .eq('status', 'published')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;

      const normalized = (data || []).map((post) => ({
        ...post,
        photos: (post.post_photos || []).map((photo) => ({
          ...photo,
          url: supabase.storage
            .from('public-post-photos')
            .getPublicUrl(photo.storage_path).data.publicUrl,
        })),
      }));

      setPosts(normalized);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadPosts();
  }, [session?.user?.id]);

  const galleryItems = useMemo(
    () =>
      posts
        .filter((post) => post.entry_date === selectedDate)
        .flatMap((post) =>
          (post.photos || []).map((photo) => ({
            id: photo.id,
            url: photo.url,
            title: post.title || photo.caption || '',
            post,
          }))
        ),
    [posts, selectedDate]
  );

  /* Photo viewer keyboard navigation. */

  useEffect(() => {
    if (lightboxIndex === null) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setLightboxIndex(null);
      }

      if (event.key === 'ArrowRight') {
        setLightboxIndex((index) =>
          index === null
            ? null
            : (index + 1) % galleryItems.length
        );
      }

      if (event.key === 'ArrowLeft') {
        setLightboxIndex((index) =>
          index === null
            ? null
            : (index - 1 + galleryItems.length) %
              galleryItems.length
        );
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightboxIndex, galleryItems.length]);

  /* Date changes. */

  function changeYear(nextYear) {
    setYear(nextYear);
    setDay((currentDay) =>
      Math.min(currentDay, daysInMonth(nextYear, month))
    );
  }

  function changeMonth(nextMonth) {
    setMonth(nextMonth);
    setDay((currentDay) =>
      Math.min(currentDay, daysInMonth(year, nextMonth))
    );
  }

  /* Upload a photo with a one-line title. */

  async function uploadPhoto(event) {
    event.preventDefault();

    if (!session || !isAdmin) {
      setError('Admin access is required to upload photos.');
      return;
    }

    if (!uploadFile) {
      setError('Please choose a photo first.');
      return;
    }

    if (!caption.trim()) {
      setError('Please enter a one-line title.');
      return;
    }

    if (!supabase) return;

    setUploading(true);
    setError('');

    let createdPostId = null;
    let uploadedStoragePath = null;

    try {
      const { data: post, error: postError } = await supabase
        .from('diary_posts')
        .insert({
          title: caption.trim(),
          body: '',
          entry_date: selectedDate,
          status: 'published',
          author_id: session.user.id,
        })
        .select('id')
        .single();

      if (postError) throw postError;

      createdPostId = post.id;

      const extension =
        uploadFile.name.split('.').pop()?.toLowerCase() || 'jpg';

      const storagePath =
        `${post.id}/${crypto.randomUUID()}.${extension}`;

      const { error: storageError } = await supabase.storage
        .from('public-post-photos')
        .upload(storagePath, uploadFile, {
          upsert: false,
          contentType: uploadFile.type,
        });

      if (storageError) throw storageError;

      uploadedStoragePath = storagePath;

      const { error: photoError } = await supabase
        .from('post_photos')
        .insert({
          post_id: post.id,
          storage_path: storagePath,
          caption: caption.trim(),
        });

      if (photoError) throw photoError;

      setUploadFile(null);
      setCaption('');
      event.target.reset();

      await loadPosts();
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));

      if (createdPostId && supabase) {
        if (uploadedStoragePath) {
          const { error: cleanupStorageError } =
            await supabase.storage
              .from('public-post-photos')
              .remove([uploadedStoragePath]);

          if (cleanupStorageError) {
            console.error(cleanupStorageError);
          }
        }

        const { error: cleanupPostError } = await supabase
          .from('diary_posts')
          .delete()
          .eq('id', createdPostId);

        if (cleanupPostError) {
          console.error(cleanupPostError);
        }
      }
    } finally {
      setUploading(false);
    }
  }

  async function logOut() {
    if (supabase) {
      const { error: logoutError } =
        await supabase.auth.signOut();

      if (logoutError) {
        setError(getErrorMessage(logoutError));
        return;
      }
    }

    setSession(null);
    setIsAdmin(false);
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <button
          className="nav-link"
          onClick={() => setPage('home')}
        >
          home
        </button>

        <button
          className="nav-link"
          onClick={() => setPage('diary')}
        >
          diary
        </button>

        <button
          className="nav-link"
          onClick={() => setPage('about')}
        >
          about
        </button>

        {isAdmin ? (
          <button className="nav-link" onClick={logOut}>
            log out
          </button>
        ) : (
          <button
            className="nav-link"
            onClick={() => setLoginOpen(true)}
          >
            log in
          </button>
        )}
      </header>

      {/* Home */}
      {page === 'home' && (
        <main className="home-page">
          <div className="home-copy">
            <p>Jew,the creator</p>
            <p>find me in another universe</p>
            <p>call me if u get lost</p>
          </div>
        </main>
      )}

      {/* About */}
      {page === 'about' && (
        <main className="about-page">
          <p>where the flower blooms</p>
        </main>
      )}

      {/* Diary */}
      {page === 'diary' && (
        <main className="diary-page">
          <section
            className="date-picker"
            aria-label="Choose a date"
          >
            <div className="date-columns">
              <DateWheel
                label="Year"
                value={year}
                values={yearValues}
                onChange={changeYear}
              />

              <div className="month-column">
                <button
                  className="star-button"
                  type="button"
                  aria-label="Open photos for selected date"
                  onClick={() => {
                    setLightboxIndex(null);
                    setPage('gallery');
                    loadPosts();
                  }}
                >
                  ★
                </button>

                <DateWheel
                  label="Month"
                  value={month}
                  values={monthValues}
                  onChange={changeMonth}
                  pad
                />
              </div>

              <DateWheel
                label="Day"
                value={day}
                values={dayValues}
                onChange={setDay}
                pad
              />
            </div>
          </section>
        </main>
      )}

      {/* Gallery */}
      {page === 'gallery' && (
        <main className="gallery-page">
          <div className="gallery-heading">
            <button
              className="back-link"
              onClick={() => {
                setLightboxIndex(null);
                setPage('diary');
              }}
            >
              ← diary
            </button>

            <span>{selectedDate.replaceAll('-', ' ')}</span>
          </div>

          {isAdmin && (
            <form className="upload-form" onSubmit={uploadPhoto}>
              <label className="file-label">
                <span>
                  {uploadFile
                    ? uploadFile.name
                    : 'choose photo'}
                </span>

                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setUploadFile(event.target.files?.[0] || null)
                  }
                />
              </label>

              <input
                className="caption-input"
                type="text"
                maxLength={120}
                value={caption}
                onChange={(event) =>
                  setCaption(event.target.value)
                }
                placeholder="one-line title"
                aria-label="Photo title"
                required
              />

              <button
                className="plain-button"
                type="submit"
                disabled={uploading}
              >
                {uploading ? 'uploading…' : 'upload'}
              </button>
            </form>
          )}

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          {busy && (
            <p className="subtle-message">loading</p>
          )}

          {!busy && galleryItems.length === 0 && (
            <p className="subtle-message">nothing here yet</p>
          )}

          <section className="photo-gallery" aria-label="Photos">
            {galleryItems.map((item, index) => (
              <article className="photo-item" key={item.id}>
                <button
                  className="photo-open"
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  aria-label={`Open ${item.title || 'photo'}`}
                >
                  <img
                    src={item.url}
                    alt={item.title || 'Diary photo'}
                    loading="lazy"
                  />
                </button>

                {item.title && (
                  <p className="photo-title">{item.title}</p>
                )}

                {isAdmin && (
                  <button
                    className="delete-link"
                    type="button"
                    onClick={async () => {
                      const confirmed = window.confirm(
                        'Delete this photo entry?'
                      );

                      if (!confirmed || !supabase) return;

                      const { error: deleteError } = await supabase
                        .from('diary_posts')
                        .delete()
                        .eq('id', item.post.id);

                      if (deleteError) {
                        setError(getErrorMessage(deleteError));
                      } else {
                        setLightboxIndex(null);
                        await loadPosts();
                      }
                    }}
                  >
                    delete
                  </button>
                )}
              </article>
            ))}
          </section>

          {lightboxIndex !== null &&
            galleryItems[lightboxIndex] && (
              <div
                className="lightbox"
                role="dialog"
                aria-modal="true"
                aria-label="Photo viewer"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setLightboxIndex(null);
                  }
                }}
              >
                <button
                  className="lightbox-close"
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  aria-label="Close photo"
                >
                  ×
                </button>

                {galleryItems.length > 1 && (
                  <button
                    className="lightbox-arrow lightbox-prev"
                    type="button"
                    onClick={() =>
                      setLightboxIndex(
                        (index) =>
                          (index - 1 + galleryItems.length) %
                          galleryItems.length
                      )
                    }
                    aria-label="Previous photo"
                  >
                    ‹
                  </button>
                )}

                <button
                  className="lightbox-image-button"
                  type="button"
                  onClick={() => {
                    if (galleryItems.length > 1) {
                      setLightboxIndex(
                        (index) =>
                          (index + 1) % galleryItems.length
                      );
                    }
                  }}
                  aria-label={
                    galleryItems.length > 1
                      ? 'Next photo'
                      : 'Photo'
                  }
                >
                  <img
                    src={galleryItems[lightboxIndex].url}
                    alt={
                      galleryItems[lightboxIndex].title ||
                      'Diary photo'
                    }
                  />
                </button>

                {galleryItems.length > 1 && (
                  <button
                    className="lightbox-arrow lightbox-next"
                    type="button"
                    onClick={() =>
                      setLightboxIndex(
                        (index) =>
                          (index + 1) % galleryItems.length
                      )
                    }
                    aria-label="Next photo"
                  >
                    ›
                  </button>
                )}

                {galleryItems[lightboxIndex].title && (
                  <p className="lightbox-caption">
                    {galleryItems[lightboxIndex].title}
                  </p>
                )}

                <p className="lightbox-count">
                  {lightboxIndex + 1} / {galleryItems.length}
                </p>
              </div>
            )}
        </main>
      )}

      {!supabaseConfigured && (
        <p className="config-warning">
          Supabase is not connected. Check your environment
          variables and GitHub Actions secrets.
        </p>
      )}

      {loginOpen && (
        <LoginPanel
          onClose={() => setLoginOpen(false)}
          onLogin={(nextSession) => {
            setSession(nextSession);
            setIsAdmin(
              nextSession?.user?.app_metadata?.role === 'admin'
            );
          }}
        />
      )}
    </div>
  );
}

export default App;
