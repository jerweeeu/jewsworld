import React, { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
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
   Map / travel memories
======================================== */

function formatTripDate(value) {
  if (!value) return '';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatDateRange(start, end) {
  const a = formatTripDate(start);
  const b = formatTripDate(end);
  return a && b ? `${a} — ${b}` : a || b;
}

function TravelMap({ supabase, isAdmin, session, setError }) {
  const globeRef = useRef(null);
  const [trips, setTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [tripLightbox, setTripLightbox] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [citySearchBusy, setCitySearchBusy] = useState(false);
  const [cityMessage, setCityMessage] = useState('');
  const [form, setForm] = useState({
    city_name: '', city_display_name: '', latitude: '', longitude: '', title: '',
    start_date: '', end_date: '', description: '', coverIndex: '0',
  });
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoTitles, setPhotoTitles] = useState([]);

  async function loadTrips() {
    if (!supabase) return;
    setLoadingTrips(true);
    const { data, error } = await supabase
      .from('travel_trips')
      .select('id, city_name, city_display_name, latitude, longitude, title, start_date, end_date, description, cover_storage_path, status, author_id, created_at, travel_photos(id, storage_path, title, sort_order)')
      .eq('status', 'published')
      .order('start_date', { ascending: false });
    if (error) {
      setError(error.message);
      setTrips([]);
    } else {
      const normalized = (data || []).map((trip) => {
        const photos = [...(trip.travel_photos || [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((photo) => ({
            ...photo,
            url: supabase.storage.from('travel-photos').getPublicUrl(photo.storage_path).data.publicUrl,
          }));
        return {
          ...trip,
          photos,
          coverUrl: trip.cover_storage_path
            ? supabase.storage.from('travel-photos').getPublicUrl(trip.cover_storage_path).data.publicUrl
            : photos[0]?.url || '',
        };
      });
      setTrips(normalized);
    }
    setLoadingTrips(false);
  }

  useEffect(() => { loadTrips(); }, [supabase]);

  useEffect(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.28;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 115;
      controls.maxDistance = 420;
    }
  }, [loadingTrips]);

  const cities = useMemo(() => {
    const grouped = new Map();
    trips.forEach((trip) => {
      const key = trip.city_name.trim().toLowerCase();
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          city_name: trip.city_name,
          city_display_name: trip.city_display_name || trip.city_name,
          lat: Number(trip.latitude),
          lng: Number(trip.longitude),
          trips: [],
        });
      }
      grouped.get(key).trips.push(trip);
    });
    return [...grouped.values()];
  }, [trips]);

  async function searchCity() {
    if (!form.city_name.trim()) {
      setCityMessage('Enter a city name first.');
      return;
    }
    setCitySearchBusy(true);
    setCityMessage('Searching for city…');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(form.city_name.trim())}`);
      if (!response.ok) throw new Error('City search is temporarily unavailable. You can enter coordinates manually.');
      const results = await response.json();
      if (!results.length) throw new Error('City not found. Try adding the country name, or enter coordinates manually.');
      const result = results[0];
      const display = result.display_name.split(',').slice(0, 2).join(',').trim();
      setForm((old) => ({
        ...old,
        city_display_name: old.city_display_name || display.toUpperCase(),
        latitude: result.lat,
        longitude: result.lon,
      }));
      setCityMessage('Coordinates found. You can still edit them.');
    } catch (error) {
      setCityMessage(error.message || 'Could not find this city.');
    } finally {
      setCitySearchBusy(false);
    }
  }

  async function publishTrip(event) {
    event.preventDefault();
    if (!supabase || !session || !isAdmin) {
      setError('Admin access is required to publish travel records.');
      return;
    }
    if (!photoFiles.length) {
      setError('Please choose at least one travel photo.');
      return;
    }
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError('Please enter valid latitude and longitude.');
      return;
    }
    if (form.end_date < form.start_date) {
      setError('The end date must be on or after the start date.');
      return;
    }
    setSaving(true);
    setError('');
    let tripId = null;
    const uploadedPaths = [];
    try {
      const { data: trip, error: tripError } = await supabase
        .from('travel_trips')
        .insert({
          city_name: form.city_name.trim(),
          city_display_name: form.city_display_name.trim() || form.city_name.trim().toUpperCase(),
          latitude: lat,
          longitude: lng,
          title: form.title.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
          description: form.description.trim() || null,
          status: 'draft',
          author_id: session.user.id,
        })
        .select('id')
        .single();
      if (tripError) throw tripError;
      tripId = trip.id;

      const photoRows = [];
      for (let index = 0; index < photoFiles.length; index += 1) {
        const file = photoFiles[index];
        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${tripId}/${crypto.randomUUID()}.${extension}`;
        const { error: storageError } = await supabase.storage
          .from('travel-photos')
          .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
        if (storageError) throw storageError;
        uploadedPaths.push(path);
        photoRows.push({ trip_id: tripId, storage_path: path, title: (photoTitles[index] || '').trim() || null, sort_order: index });
      }
      const { error: photosError } = await supabase.from('travel_photos').insert(photoRows);
      if (photosError) throw photosError;
      const coverIndex = Math.max(0, Math.min(photoFiles.length - 1, Number(form.coverIndex) || 0));
      const { error: publishError } = await supabase
        .from('travel_trips')
        .update({ cover_storage_path: uploadedPaths[coverIndex], status: 'published', updated_at: new Date().toISOString() })
        .eq('id', tripId);
      if (publishError) throw publishError;

      setForm({ city_name: '', city_display_name: '', latitude: '', longitude: '', title: '', start_date: '', end_date: '', description: '', coverIndex: '0' });
      setPhotoFiles([]);
      setPhotoTitles([]);
      setCityMessage('');
      setFormOpen(false);
      await loadTrips();
    } catch (error) {
      setError(error.message || 'Could not publish travel record.');
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from('travel-photos').remove(uploadedPaths);
        if (cleanupError) console.error('Travel photo cleanup failed:', cleanupError);
      }
      if (tripId) {
        const { error: cleanupTripError } = await supabase.from('travel_trips').delete().eq('id', tripId);
        if (cleanupTripError) console.error('Travel record cleanup failed:', cleanupTripError);
      }
    } finally {
      setSaving(false);
    }
  }

  const selectedCityTrips = selectedCity
    ? trips.filter((trip) => trip.city_name.trim().toLowerCase() === selectedCity.key)
    : [];

  if (selectedTrip) {
    const activeTrip = trips.find((trip) => trip.id === selectedTrip.id) || selectedTrip;
    return (
      <main className="trip-detail-page">
        <button className="trip-back" onClick={() => { setSelectedTrip(null); setTripLightbox(null); }}>← places</button>
        <header className="trip-detail-heading">
          <h1>{activeTrip.title}</h1>
          <p>{formatDateRange(activeTrip.start_date, activeTrip.end_date)}</p>
        </header>
        {activeTrip.description && <p className="trip-description">{activeTrip.description}</p>}
        <section className="trip-photo-grid">
          {activeTrip.photos.map((photo, index) => (
            <button className="trip-photo-tile" key={photo.id} onClick={() => setTripLightbox(index)} aria-label={`Open photo ${index + 1}`}>
              <img src={photo.url} alt={photo.title || activeTrip.title} loading="lazy" />
              {photo.title && <span>{photo.title}</span>}
            </button>
          ))}
        </section>
        {tripLightbox !== null && activeTrip.photos[tripLightbox] && (
          <div className="trip-lightbox" role="dialog" aria-modal="true" onClick={(event) => { if (event.target === event.currentTarget) setTripLightbox(null); }}>
            <button className="trip-lightbox-close" onClick={() => setTripLightbox(null)} aria-label="Close">×</button>
            {activeTrip.photos.length > 1 && <button className="trip-lightbox-arrow left" onClick={() => setTripLightbox((tripLightbox - 1 + activeTrip.photos.length) % activeTrip.photos.length)} aria-label="Previous photo">‹</button>}
            <img src={activeTrip.photos[tripLightbox].url} alt={activeTrip.photos[tripLightbox].title || activeTrip.title} />
            {activeTrip.photos.length > 1 && <button className="trip-lightbox-arrow right" onClick={() => setTripLightbox((tripLightbox + 1) % activeTrip.photos.length)} aria-label="Next photo">›</button>}
            <p>{tripLightbox + 1} / {activeTrip.photos.length}</p>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="map-page">
      <div className="map-topline">
        <div><span className="map-eyebrow">MEMORIES AROUND THE WORLD</span><h1>map</h1></div>
        {isAdmin && <button className="map-star-button" onClick={() => setFormOpen(true)} aria-label="Add a travel record">★</button>}
      </div>
      <div className="globe-stage">
        <Globe
          ref={globeRef}
          width={typeof window !== 'undefined' ? Math.min(window.innerWidth - 24, 1100) : 900}
          height={typeof window !== 'undefined' ? Math.max(420, Math.min(window.innerHeight - 180, 760)) : 620}
          backgroundColor="#050607"
          globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
          showAtmosphere
          atmosphereColor="#a9d9ff"
          atmosphereAltitude={0.13}
          htmlElementsData={cities}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.012}
          htmlElement={(city) => {
            const el = document.createElement('button');
            el.className = 'globe-city-marker';
            el.type = 'button';
            el.innerHTML = `<span class="globe-marker-number">${city.trips.length}</span><span class="globe-marker-label">${city.city_display_name.replace(/[&<>"']/g, '')}</span>`;
            el.title = `${city.city_display_name} · ${city.trips.length} trip${city.trips.length === 1 ? '' : 's'}`;
            el.addEventListener('click', (event) => { event.stopPropagation(); setSelectedCity(city); });
            return el;
          }}
          enablePointerInteraction
        />
        {cities.length === 0 && !loadingTrips && <div className="globe-empty-note">your travels will appear here</div>}
        <p className="globe-hint">drag to explore · pinch to zoom</p>
      </div>
      {loadingTrips && <p className="map-status">loading places…</p>}
      {selectedCity && (
        <div className="city-panel-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCity(null); }}>
          <section className="city-panel" role="dialog" aria-modal="true" aria-label={`${selectedCity.city_display_name} travel records`}>
            <button className="city-panel-close" onClick={() => setSelectedCity(null)} aria-label="Close city panel">×</button>
            <p className="city-panel-kicker">TRAVEL ARCHIVE</p>
            <h2>{selectedCity.city_display_name}</h2>
            <div className="city-trip-list">
              {selectedCityTrips.map((trip) => (
                <article className="city-trip-card" key={trip.id}>
                  <button className="city-trip-cover" onClick={() => { setSelectedTrip(trip); setSelectedCity(null); }} aria-label={`View ${trip.title}`}>
                    {trip.coverUrl ? <img src={trip.coverUrl} alt="Trip cover" /> : <span>no cover</span>}
                  </button>
                  <div className="city-trip-info">
                    <h3>{trip.title}</h3>
                    <p>{formatDateRange(trip.start_date, trip.end_date)}</p>
                    <button className="view-more-button" onClick={() => { setSelectedTrip(trip); setSelectedCity(null); }}>view more <span>↗</span></button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      {formOpen && (
        <div className="city-panel-shade form-shade" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setFormOpen(false); }}>
          <section className="travel-form-panel" role="dialog" aria-modal="true" aria-label="Add travel record">
            <button className="city-panel-close" onClick={() => setFormOpen(false)} disabled={saving} aria-label="Close form">×</button>
            <p className="city-panel-kicker">ADMIN · NEW MEMORY</p>
            <h2>add a trip</h2>
            <form className="travel-form" onSubmit={publishTrip}>
              <label>City search<div className="city-search-row"><input value={form.city_name} onChange={(e) => setForm({ ...form, city_name: e.target.value })} placeholder="Seoul, South Korea" required /><button type="button" onClick={searchCity} disabled={citySearchBusy}>{citySearchBusy ? 'searching…' : 'find'}</button></div></label>
              {cityMessage && <p className="city-search-message">{cityMessage}</p>}
              <label>City display name<input value={form.city_display_name} onChange={(e) => setForm({ ...form, city_display_name: e.target.value })} placeholder="SEOUL, KOREA" required /></label>
              <div className="travel-coordinate-row">
                <label>Latitude<input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="37.5665" required /></label>
                <label>Longitude<input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="126.9780" required /></label>
              </div>
              <label>Trip title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="SEOUL AT NIGHT" required /></label>
              <div className="travel-coordinate-row"><label>Start date<input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></label><label>End date<input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} min={form.start_date || undefined} required /></label></div>
              <label>Photos<input type="file" accept="image/*" multiple required onChange={(e) => { const files = Array.from(e.target.files || []); setPhotoFiles(files); setPhotoTitles(files.map(() => '')); setForm({ ...form, coverIndex: '0' }); }} /></label>
              {photoFiles.length > 0 && <div className="travel-photo-settings"><label>Cover photo<select value={form.coverIndex} onChange={(e) => setForm({ ...form, coverIndex: e.target.value })}>{photoFiles.map((file, index) => <option value={index} key={`${file.name}-${index}`}>{index + 1}. {file.name}</option>)}</select></label>{photoFiles.map((file, index) => <div key={`${file.name}-${index}`} className="travel-photo-row"><label className="travel-photo-title-input">Photo {index + 1} · {file.name}<input value={photoTitles[index] || ''} onChange={(e) => setPhotoTitles((old) => old.map((value, i) => i === index ? e.target.value : value))} placeholder="optional one-line title" /></label><div className="travel-photo-reorder"><button type="button" disabled={index === 0} onClick={() => { setPhotoFiles((old) => { const next = [...old]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; }); setPhotoTitles((old) => { const next = [...old]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; }); setForm((old) => ({ ...old, coverIndex: String(Number(old.coverIndex) === index ? index - 1 : Number(old.coverIndex) === index - 1 ? index : Number(old.coverIndex)) })); }}>↑</button><button type="button" disabled={index === photoFiles.length - 1} onClick={() => { setPhotoFiles((old) => { const next = [...old]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; }); setPhotoTitles((old) => { const next = [...old]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; }); setForm((old) => ({ ...old, coverIndex: String(Number(old.coverIndex) === index ? index + 1 : Number(old.coverIndex) === index + 1 ? index : Number(old.coverIndex)) })); }}>↓</button></div></div>)}</div>}
              <label>Trip description (optional)<textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="A few words, if you want…" /></label>
              <button className="travel-publish-button" type="submit" disabled={saving}>{saving ? 'publishing…' : 'publish trip'}</button>
            </form>
          </section>
        </div>
      )}
    </main>
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
          onClick={() => setPage('map')}
        >
          map
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
          <p>Where This Flower Blooms</p>
        </main>
      )}

      {/* Map */}
      {page === 'map' && (
        <>
          <TravelMap
            supabase={supabase}
            isAdmin={isAdmin}
            session={session}
            setError={setError}
          />
          {error && <div className="map-global-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
        </>
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
                    loading="eager"
                    onLoad={() => console.log('Photo loaded:', item.url)}
                    onError={(event) => {
                    console.error('Photo failed:', item.url);
                    console.error('Image element:', event.currentTarget);
                    }}
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
