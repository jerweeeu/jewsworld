import React, { useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from './supabase';
import './styles.css';

const today = new Date();
const dateKey = (year, month, day) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
const errorMessage = (error) => error?.message || 'Something went wrong. Please try again.';

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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (error) throw error;
      onLogin(data.session);
      onClose();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-shade" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="login-panel" aria-label="Administrator login">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <p className="tiny-label">ADMIN ACCESS</p>
        <h2>log in</h2>
        <form onSubmit={submit} className="login-form">
          <label>
            <span>Email</span>
            <input type="email" autoComplete="username" value={email}
              onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password}
              onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <button className="plain-button" disabled={busy}>
            {busy ? 'please wait…' : 'enter'}
          </button>
        </form>
        {message && <p className="form-message" role="alert">{message}</p>}
      </section>
    </div>
  );
}

function DateWheel({ label, value, values, onChange, pad = false }) {
  return (
    <label className="wheel-wrap" aria-label={label}>
      <select
        className="date-wheel"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onWheel={(event) => {
          event.preventDefault();
          const current = values.indexOf(Number(value));
          const next = Math.max(0, Math.min(values.length - 1, current + (event.deltaY > 0 ? 1 : -1)));
          onChange(values[next]);
        }}
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {pad ? String(item).padStart(2, '0') : item}
          </option>
        ))}
      </select>
    </label>
  );
}

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

  const selectedDate = dateKey(year, month, day);
  const yearValues = useMemo(
    () => Array.from({ length: 101 }, (_, index) => today.getFullYear() - 50 + index),
    []
  );
  const dayValues = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, index) => index + 1),
    [year, month]
  );

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      const nextSession = data.session;
      setSession(nextSession);
      setIsAdmin(nextSession?.user?.app_metadata?.role === 'admin');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsAdmin(nextSession?.user?.app_metadata?.role === 'admin');
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (day > daysInMonth(year, month)) setDay(daysInMonth(year, month));
  }, [year, month, day]);

  async function loadPosts() {
    if (!supabaseConfigured || !supabase) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('diary_posts')
        .select('id, title, body, entry_date, created_at, post_photos(id, storage_path, caption)')
        .eq('status', 'published')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;

      const normalized = (data || []).map((post) => ({
        ...post,
        photos: (post.post_photos || []).map((photo) => ({
          ...photo,
          url: supabase.storage.from('public-post-photos').getPublicUrl(photo.storage_path).data.publicUrl
        }))
      }));
      setPosts(normalized);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadPosts();
  }, [session?.user?.id]);

  const galleryItems = useMemo(() => posts
    .filter((post) => post.entry_date === selectedDate)
    .flatMap((post) => (post.photos || []).map((photo) => ({
      id: photo.id,
      url: photo.url,
      title: post.title || photo.caption || '',
      post
    }))), [posts, selectedDate]);

  function changeYear(nextYear) {
    setYear(nextYear);
    setDay(Math.min(day, daysInMonth(nextYear, month)));
  }
  function changeMonth(nextMonth) {
    setMonth(nextMonth);
    setDay(Math.min(day, daysInMonth(year, nextMonth)));
  }

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
    try {
      const { data: post, error: postError } = await supabase
        .from('diary_posts')
        .insert({
          title: caption.trim(),
          body: '',
          entry_date: selectedDate,
          status: 'published',
          author_id: session.user.id
        })
        .select('id')
        .single();
      if (postError) throw postError;
      createdPostId = post.id;

      const extension = uploadFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${post.id}/${crypto.randomUUID()}.${extension}`;
      const { error: storageError } = await supabase.storage
        .from('public-post-photos')
        .upload(storagePath, uploadFile, { upsert: false, contentType: uploadFile.type });
      if (storageError) throw storageError;

      const { error: photoError } = await supabase.from('post_photos').insert({
        post_id: post.id,
        storage_path: storagePath,
        caption: caption.trim()
      });
      if (photoError) throw photoError;

      setUploadFile(null);
      setCaption('');
      event.target.reset();
      await loadPosts();
    } catch (uploadError) {
      // If upload failed after creating the post, keep the error visible for diagnosis.
      setError(errorMessage(uploadError));
      if (createdPostId) {
        console.error('Photo upload did not finish for diary post:', createdPostId, uploadError);
      }
    } finally {
      setUploading(false);
    }
  }

  async function logOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(false);
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <button className="nav-link" onClick={() => setPage('diary')}>diary</button>
        <button className="nav-link" onClick={() => setPage('about')}>about</button>
        {isAdmin ? (
          <button className="nav-link" onClick={logOut}>log out</button>
        ) : (
          <button className="nav-link" onClick={() => setLoginOpen(true)}>log in</button>
        )}
      </header>

      {page === 'home' && (
        <main className="home-page">
          <div className="home-copy">
            <p>Jew,the creator</p>
            <p>find me in another universe</p>
            <p>call me if u get lost</p>
          </div>
        </main>
      )}

      {page === 'about' && (
        <main className="about-page">
          <p>where the flower blooms</p>
        </main>
      )}

      {page === 'diary' && (
        <main className="diary-page">
          <section className="date-picker" aria-label="Choose a date">
            <div className="date-columns">
              <DateWheel label="Year" value={year} values={yearValues} onChange={changeYear} />
              <div className="month-column">
                <button className="star-button" aria-label="Open photos for selected date"
                  onClick={() => { setPage('gallery'); loadPosts(); }}>★</button>
                <DateWheel label="Month" value={month} values={Array.from({ length: 12 }, (_, i) => i + 1)}
                  onChange={changeMonth} pad />
              </div>
              <DateWheel label="Day" value={day} values={dayValues} onChange={setDay} pad />
            </div>
            <p className="date-hint">{selectedDate.replaceAll('-', ' ')}</p>
          </section>
        </main>
      )}

      {page === 'gallery' && (
        <main className="gallery-page">
          <div className="gallery-heading">
            <button className="back-link" onClick={() => setPage('diary')}>← diary</button>
            <span>{selectedDate.replaceAll('-', ' ')}</span>
          </div>

          {isAdmin && (
            <form className="upload-form" onSubmit={uploadPhoto}>
              <label className="file-label">
                <span>choose photo</span>
                <input type="file" accept="image/*" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
              </label>
              <input className="caption-input" type="text" maxLength={120}
                value={caption} onChange={(event) => setCaption(event.target.value)}
                placeholder="one-line title" aria-label="Photo title" required />
              <button className="plain-button" disabled={uploading}>
                {uploading ? 'uploading…' : 'upload'}
              </button>
            </form>
          )}

          {error && <p className="error-message" role="alert">{error}</p>}
          {busy && <p className="subtle-message">loading</p>}
          {!busy && galleryItems.length === 0 && <p className="subtle-message">nothing here yet</p>}

          <section className="photo-gallery" aria-label="Photos">
            {galleryItems.map((item) => (
              <article className="photo-item" key={item.id}>
                <img src={item.url} alt={item.title || 'Diary photo'} loading="lazy" />
                {item.title && <p className="photo-title">{item.title}</p>}
                {isAdmin && (
                  <button className="delete-link" onClick={async () => {
                    if (!window.confirm('Delete this photo entry?')) return;
                    const { error: deleteError } = await supabase.from('diary_posts').delete().eq('id', item.post.id);
                    if (deleteError) setError(errorMessage(deleteError));
                    else await loadPosts();
                  }}>delete</button>
                )}
              </article>
            ))}
          </section>
        </main>
      )}

      {!supabaseConfigured && (
        <p className="config-warning">Supabase is not connected. Check your .env values and GitHub Actions secrets.</p>
      )}
      {loginOpen && <LoginPanel onClose={() => setLoginOpen(false)} onLogin={(nextSession) => {
        setSession(nextSession);
        setIsAdmin(nextSession?.user?.app_metadata?.role === 'admin');
      }} />}
    </div>
  );
}

export default App;
