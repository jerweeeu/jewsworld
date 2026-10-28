import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from './supabase';
import './styles.css';

const getErrorMessage = (error) =>
  error?.message || 'Something went wrong. Please try again.';

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
  const [editTripOpen, setEditTripOpen] = useState(false);
  const [editTripForm, setEditTripForm] = useState({});
  const [editTripPhotos, setEditTripPhotos] = useState([]);
  const [editNewFiles, setEditNewFiles] = useState([]);
  const [editNewTitles, setEditNewTitles] = useState([]);
  const [editTripSaving, setEditTripSaving] = useState(false);

  async function loadTrips() {

  if (!supabase) {

    setLoadingTrips(false);

    setError('Supabase is not configured.');

    return;

  }

  setLoadingTrips(true);

  try {

    const { data, error } = await supabase

      .from('travel_trips')

      .select(

        'id, city_name, city_display_name, latitude, longitude, title, start_date, end_date, description, cover_storage_path, status, author_id, created_at, travel_photos(id, storage_path, title, sort_order)'

      )

      .eq('status', 'published')

      .order('start_date', { ascending: false });

    if (error) {

      console.error('Map data query failed:', error);

      setError(

        `Map data error: ${error.message || 'Unknown database error'}`

      );

      setTrips([]);

      return;

    }

    const normalized = (data || []).map((trip) => {

      const photos = [...(trip.travel_photos || [])]

        .sort((a, b) => a.sort_order - b.sort_order)

        .map((photo) => ({

          ...photo,

          url: supabase.storage

            .from('travel-photos')

            .getPublicUrl(photo.storage_path).data.publicUrl,

        }));

      return {

        ...trip,

        photos,

        coverUrl: trip.cover_storage_path

          ? supabase.storage

              .from('travel-photos')

              .getPublicUrl(trip.cover_storage_path).data.publicUrl

          : photos[0]?.url || '',

      };

    });

    setTrips(normalized);

  } catch (error) {

    console.error('Map network request failed:', error);

    setTrips([]);

    setError(

      `Map loading failed: ${

        error?.message || 'Please check your network connection.'

      }`

    );

  } finally {

    setLoadingTrips(false);

  }

}

  useEffect(() => { loadTrips(); }, [supabase]);

  useEffect(() => {
    const handleMapStar = () => {
      if (!isAdmin) return;
      if (selectedTrip) {
        const active = trips.find((trip) => trip.id === selectedTrip.id) || selectedTrip;
        setEditTripForm({
          city_name: active.city_name || '',
          city_display_name: active.city_display_name || active.city_name || '',
          latitude: String(active.latitude ?? ''),
          longitude: String(active.longitude ?? ''),
          title: active.title || '',
          start_date: active.start_date || '',
          end_date: active.end_date || '',
          description: active.description || '',
        });
        setEditTripPhotos([...(active.photos || [])].sort((a, b) => a.sort_order - b.sort_order).map((photo) => ({ ...photo, editTitle: photo.title || '' })));
        setEditNewFiles([]);
        setEditNewTitles([]);
        setEditTripOpen(true);
      } else {
        setFormOpen(true);
      }
    };
    window.addEventListener('jewsworld-map-star', handleMapStar);
    return () => window.removeEventListener('jewsworld-map-star', handleMapStar);
  }, [isAdmin, selectedTrip, trips]);


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

  async function deleteTravelRecord(trip, { refresh = true } = {}) {
    if (!supabase || !isAdmin) {
      setError('Admin access is required to delete travel records.');
      return false;
    }

    const photoPaths = (trip.photos || []).map((photo) => photo.storage_path).filter(Boolean);
    const { error: photosError } = await supabase
      .from('travel_photos')
      .delete()
      .eq('trip_id', trip.id);
    if (photosError) {
      setError(photosError.message || 'Could not delete the travel photos.');
      return false;
    }

    const { error: tripError } = await supabase
      .from('travel_trips')
      .delete()
      .eq('id', trip.id);
    if (tripError) {
      setError(tripError.message || 'Could not delete the travel record.');
      return false;
    }

    if (photoPaths.length) {
      const { error: storageError } = await supabase.storage.from('travel-photos').remove(photoPaths);
      if (storageError) console.error('Travel photo storage cleanup failed:', storageError);
    }

    if (selectedTrip?.id === trip.id) {
      setSelectedTrip(null);
      setTripLightbox(null);
    }
    if (refresh) await loadTrips();
    return true;
  }

  async function deleteTravelPhoto(trip, photo) {
    if (!supabase || !isAdmin) {
      setError('Admin access is required to delete travel photos.');
      return;
    }

    if ((trip.photos || []).length <= 1) {
      const confirmed = window.confirm('This is the last photo in this trip. Delete the entire travel record and its city entry?');
      if (!confirmed) return;
      const deleted = await deleteTravelRecord(trip);
      if (deleted) setSelectedCity(null);
      return;
    }

    const confirmed = window.confirm('Delete this travel photo? This cannot be undone.');
    if (!confirmed) return;

    const { error: rowError } = await supabase.from('travel_photos').delete().eq('id', photo.id);
    if (rowError) {
      setError(rowError.message || 'Could not delete this travel photo.');
      return;
    }

    const remaining = trip.photos.filter((item) => item.id !== photo.id);
    const nextCoverPath = trip.cover_storage_path === photo.storage_path
      ? (remaining[0]?.storage_path || null)
      : trip.cover_storage_path;
    const { error: coverError } = await supabase
      .from('travel_trips')
      .update({ cover_storage_path: nextCoverPath, updated_at: new Date().toISOString() })
      .eq('id', trip.id);
    if (coverError) {
      setError(coverError.message || 'Photo deleted, but the cover could not be updated.');
    }

    const { error: storageError } = await supabase.storage.from('travel-photos').remove([photo.storage_path]);
    if (storageError) console.error('Travel photo storage cleanup failed:', storageError);

    setTripLightbox(null);
    await loadTrips();
  }

  async function deleteCity(city) {
    if (!isAdmin) {
      setError('Admin access is required to delete cities.');
      return;
    }
    const cityTrips = trips.filter((trip) => trip.city_name.trim().toLowerCase() === city.key);
    const confirmed = window.confirm(`Delete ${city.city_display_name} and all ${cityTrips.length} travel record(s) in this city? This cannot be undone.`);
    if (!confirmed) return;

    setSaving(true);
    setError('');
    try {
      for (const trip of cityTrips) {
        const deleted = await deleteTravelRecord(trip, { refresh: false });
        if (!deleted) return;
      }
      setSelectedCity(null);
      setSelectedTrip(null);
      setTripLightbox(null);
      await loadTrips();
    } finally {
      setSaving(false);
    }
  }

  function moveEditPhoto(index, direction) {
    setEditTripPhotos((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function removeEditPhoto(photo) {
    if (!isAdmin || !supabase || !selectedTrip) return;
    if (editTripPhotos.length <= 1 && editNewFiles.length === 0) {
      setError('A trip must keep at least one photo. Add another photo before deleting this one.');
      return;
    }
    if (!window.confirm('Delete this photo from the trip? This cannot be undone.')) return;
    const { error: rowError } = await supabase.from('travel_photos').delete().eq('id', photo.id);
    if (rowError) {
      setError(rowError.message || 'Could not delete this photo.');
      return;
    }
    const { error: storageError } = await supabase.storage.from('travel-photos').remove([photo.storage_path]);
    if (storageError) console.error('Travel photo storage cleanup failed:', storageError);
    const remaining = editTripPhotos.filter((item) => item.id !== photo.id);
    setEditTripPhotos(remaining);
    const active = trips.find((trip) => trip.id === selectedTrip.id) || selectedTrip;
    const nextCover = active.cover_storage_path === photo.storage_path ? (remaining[0]?.storage_path || null) : active.cover_storage_path;
    const { error: coverError } = await supabase.from('travel_trips').update({ cover_storage_path: nextCover, updated_at: new Date().toISOString() }).eq('id', active.id);
    if (coverError) setError(coverError.message || 'Photo deleted, but the cover could not be updated.');
    await loadTrips();
  }

  async function saveTripChanges(event) {
    event.preventDefault();
    if (!isAdmin || !session || !supabase || !selectedTrip) {
      setError('Admin access is required to edit travel records.');
      return;
    }
    if (!editTripPhotos.length && !editNewFiles.length) {
      setError('Please keep at least one photo in this trip.');
      return;
    }
    const latitude = Number(editTripForm.latitude);
    const longitude = Number(editTripForm.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setError('Please enter valid latitude and longitude.');
      return;
    }
    if (editTripForm.end_date < editTripForm.start_date) {
      setError('The end date must be on or after the start date.');
      return;
    }
    setEditTripSaving(true);
    setError('');
    const uploadedPaths = [];
    try {
      const { error: tripError } = await supabase.from('travel_trips').update({
        city_name: editTripForm.city_name.trim(),
        city_display_name: editTripForm.city_display_name.trim() || editTripForm.city_name.trim().toUpperCase(),
        latitude,
        longitude,
        title: editTripForm.title.trim(),
        start_date: editTripForm.start_date,
        end_date: editTripForm.end_date,
        description: editTripForm.description.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', selectedTrip.id);
      if (tripError) throw tripError;

      for (let index = 0; index < editTripPhotos.length; index += 1) {
        const photo = editTripPhotos[index];
        const { error: photoError } = await supabase.from('travel_photos').update({ title: photo.editTitle.trim() || null, sort_order: index }).eq('id', photo.id);
        if (photoError) throw photoError;
      }

      const newRows = [];
      for (let index = 0; index < editNewFiles.length; index += 1) {
        const file = editNewFiles[index];
        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${selectedTrip.id}/${crypto.randomUUID()}.${extension}`;
        const { error: storageError } = await supabase.storage.from('travel-photos').upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
        if (storageError) throw storageError;
        uploadedPaths.push(path);
        newRows.push({ trip_id: selectedTrip.id, storage_path: path, title: (editNewTitles[index] || '').trim() || null, sort_order: editTripPhotos.length + index });
      }
      if (newRows.length) {
        const { error: insertError } = await supabase.from('travel_photos').insert(newRows);
        if (insertError) throw insertError;
      }

      const firstPath = editTripPhotos[0]?.storage_path || uploadedPaths[0] || null;
      const { error: coverError } = await supabase.from('travel_trips').update({ cover_storage_path: firstPath, updated_at: new Date().toISOString() }).eq('id', selectedTrip.id);
      if (coverError) throw coverError;

      setEditTripOpen(false);
      setEditNewFiles([]);
      setEditNewTitles([]);
      await loadTrips();
    } catch (editError) {
      setError(editError.message || 'Could not save trip changes.');
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from('travel-photos').remove(uploadedPaths);
        if (cleanupError) console.error('Could not clean up newly uploaded photos:', cleanupError);
      }
    } finally {
      setEditTripSaving(false);
    }
  }

  const selectedCityTrips = selectedCity
    ? trips.filter((trip) => trip.city_name.trim().toLowerCase() === selectedCity.key)
    : [];

  if (selectedTrip) {
    const activeTrip = trips.find((trip) => trip.id === selectedTrip.id) || selectedTrip;
    return (
      <main className="trip-detail-page">
        <header className="trip-detail-heading">
          <div>
            <h1>{activeTrip.title}</h1>
            <p>{formatDateRange(activeTrip.start_date, activeTrip.end_date)}</p>
          </div>
        </header>
        {activeTrip.description && <p className="trip-description">{activeTrip.description}</p>}
        <section className="trip-photo-grid">
          {activeTrip.photos.map((photo, index) => (
            <article className="trip-photo-item" key={photo.id}>
              <button className="trip-photo-tile" type="button" onClick={() => setTripLightbox(index)} aria-label={`Open photo ${index + 1}`}>
                <img src={photo.url} alt={photo.title || activeTrip.title} loading="lazy" />
                <span className="trip-photo-caption">{photo.title || ''}</span>
              </button>
            </article>
          ))}
        </section>
        {editTripOpen && isAdmin && (
          <div className="city-panel-shade form-shade" onClick={(event) => { if (event.target === event.currentTarget && !editTripSaving) setEditTripOpen(false); }}>
            <section className="travel-form-panel edit-trip-panel" role="dialog" aria-modal="true" aria-label="Edit travel record">
              <p className="edit-panel-kicker">ADMIN · EDIT MEMORY</p>
              <h2>modify this trip</h2>
              <form className="travel-form" onSubmit={saveTripChanges}>
                <label>City<input value={editTripForm.city_name || ''} onChange={(event) => setEditTripForm((old) => ({ ...old, city_name: event.target.value }))} required /></label>
                <label>City display name<input value={editTripForm.city_display_name || ''} onChange={(event) => setEditTripForm((old) => ({ ...old, city_display_name: event.target.value }))} required /></label>
                <div className="travel-coordinate-row"><label>Latitude<input type="number" step="any" value={editTripForm.latitude || ''} onChange={(event) => setEditTripForm((old) => ({ ...old, latitude: event.target.value }))} required /></label><label>Longitude<input type="number" step="any" value={editTripForm.longitude || ''} onChange={(event) => setEditTripForm((old) => ({ ...old, longitude: event.target.value }))} required /></label></div>
                <label>Trip title<input value={editTripForm.title || ''} onChange={(event) => setEditTripForm((old) => ({ ...old, title: event.target.value }))} required /></label>
                <div className="travel-coordinate-row"><label>Start date<input type="date" value={editTripForm.start_date || ''} onChange={(event) => setEditTripForm((old) => ({ ...old, start_date: event.target.value }))} required /></label><label>End date<input type="date" min={editTripForm.start_date || undefined} value={editTripForm.end_date || ''} onChange={(event) => setEditTripForm((old) => ({ ...old, end_date: event.target.value }))} required /></label></div>
                <label>Description<textarea rows="3" value={editTripForm.description || ''} onChange={(event) => setEditTripForm((old) => ({ ...old, description: event.target.value }))} placeholder="A few words, if you want…" /></label>
                <div className="edit-photo-list"><p className="edit-section-label">Existing photos · drag order with arrows</p>
                  {editTripPhotos.map((photo, index) => <div className="edit-photo-row" key={photo.id}><img src={photo.url} alt={photo.editTitle || 'Trip photo'} /><div className="edit-photo-fields"><label>Photo {index + 1} subtitle<input value={photo.editTitle} onChange={(event) => setEditTripPhotos((old) => old.map((item) => item.id === photo.id ? { ...item, editTitle: event.target.value } : item))} placeholder="optional subtitle" /></label><div className="edit-photo-actions"><button type="button" disabled={index === 0} onClick={() => moveEditPhoto(index, -1)} aria-label="Move photo up">↑</button><button type="button" disabled={index === editTripPhotos.length - 1} onClick={() => moveEditPhoto(index, 1)} aria-label="Move photo down">↓</button><button type="button" className="edit-remove-photo" disabled={editTripPhotos.length <= 1 && editNewFiles.length === 0} onClick={() => removeEditPhoto(photo)}>delete</button></div></div></div>)}
                </div>
                <label>Add more photos<input type="file" accept="image/*" multiple onChange={(event) => { const files = Array.from(event.target.files || []); setEditNewFiles(files); setEditNewTitles(files.map(() => '')); }} /></label>
                {editNewFiles.length > 0 && <div className="edit-new-photo-list">{editNewFiles.map((file, index) => <label key={`${file.name}-${index}`}>New photo {index + 1} · {file.name}<input value={editNewTitles[index] || ''} onChange={(event) => setEditNewTitles((old) => old.map((value, i) => i === index ? event.target.value : value))} placeholder="optional subtitle" /></label>)}</div>}
                <div className="edit-trip-footer"><button className="travel-publish-button" type="submit" disabled={editTripSaving}>{editTripSaving ? 'saving…' : 'save changes'}</button><button className="edit-cancel-button" type="button" onClick={() => setEditTripOpen(false)} disabled={editTripSaving}>cancel</button><button className="edit-cancel-button delete-trip-in-editor" type="button" disabled={editTripSaving} onClick={async () => { const active = trips.find((trip) => trip.id === selectedTrip.id) || selectedTrip; if (!window.confirm(`Delete “${active.title}” and all of its photos? This cannot be undone.`)) return; const deleted = await deleteTravelRecord(active); if (deleted) setEditTripOpen(false); }}>delete this trip</button></div>
              </form>
            </section>
          </div>
        )}
        {tripLightbox !== null && activeTrip.photos[tripLightbox] && (
          <div className="trip-lightbox" role="dialog" aria-modal="true" onClick={(event) => { if (event.target === event.currentTarget) setTripLightbox(null); }}>
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
      {loadingTrips && <p className="map-status">loading places…</p>}
      <section className="travel-city-grid" aria-label="Travel cities">
        {cities.map((city) => {
          const latestTrip = city.trips[0];
          return (
            <button
              type="button"
              className="travel-city-card"
              key={city.key}
              onClick={() => setSelectedCity(city)}
              aria-label={`Open ${city.city_display_name}, ${city.trips.length} travel records`}
            >
              <span className="travel-city-image">
                {latestTrip?.coverUrl
                  ? <img src={latestTrip.coverUrl} alt="" loading="lazy" />
                  : <span className="travel-city-image-placeholder">{city.city_display_name.slice(0, 1)}</span>}
              </span>
              <span className="travel-city-card-info">
                <span className="travel-city-name">{city.city_display_name}</span>
              </span>
            </button>
          );
        })}
      </section>
      {selectedCity && (
        <div className="city-panel-shade" onClick={(event) => { if (event.target === event.currentTarget) setSelectedCity(null); }}>
          <section className="city-panel" role="dialog" aria-modal="true" aria-label={`${selectedCity.city_display_name} travel records`}>
            <div className="city-panel-heading">
              <h2>{selectedCity.city_display_name}</h2>
            </div>
            <div className="city-trip-list">
              {selectedCityTrips.map((trip) => (
                <article className="city-trip-card" key={trip.id}>
                  <button className="city-trip-cover" onClick={() => { setSelectedTrip(trip); setSelectedCity(null); }} aria-label={`View ${trip.title}`}>
                    {trip.coverUrl ? <img src={trip.coverUrl} alt="Trip cover" /> : <span>no cover</span>}
                  </button>
                  <div className="city-trip-info">
                    <h3>{trip.title}</h3>
                    <p>{formatDateRange(trip.start_date, trip.end_date)}</p>
                    <div className="city-trip-actions">
                      <button className="view-more-button" onClick={() => { setSelectedTrip(trip); setSelectedCity(null); }}>★</button>

                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      {formOpen && (
        <div className="city-panel-shade form-shade" onClick={(event) => { if (event.target === event.currentTarget && !saving) setFormOpen(false); }}>
          <section className="travel-form-panel" role="dialog" aria-modal="true" aria-label="Add travel record">
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
   Archive / movie poster carousel + film pages
======================================== */
function ArchivePage({ supabase, isAdmin, session, setError }) {
  const [movies, setMovies] = useState([]);
  const [items, setItems] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMode, setEditMode] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posterFile, setPosterFile] = useState(null);
  const [itemFile, setItemFile] = useState(null);
  const [detailMovie, setDetailMovie] = useState(null);
  useEffect(() => {
  const returnToArchive = () => {

    setDetailMovie(null);

    setMenuOpen(false);

    setEditMode('');

    setModalOpen(false);

  };

  window.addEventListener('jewsworld-archive-home', returnToArchive);

  return () => {

    window.removeEventListener('jewsworld-archive-home', returnToArchive);

  };

}, []);
  const [transitioningId, setTransitioningId] = useState(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [form, setForm] = useState({ title: '', translated_title: '', info_heading: 'Actor', info_content: '', trailer_note: '' });
  const [itemForm, setItemForm] = useState({ type: 'text', text: '' });
  const [editingItemId, setEditingItemId] = useState(null);
  const startX = useRef(null);

  async function loadMovies() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('archive_movies').select('*').order('created_at', { ascending: true });
    if (error) setError(error.message);
    else {
      const rows = (data || []).map((movie) => ({
        ...movie,
        poster_url: movie.poster_storage_path
          ? supabase.storage.from('movie-posters').getPublicUrl(movie.poster_storage_path).data.publicUrl
          : movie.poster_url,
      }));
      setMovies(rows);
      setActiveIndex((current) => Math.min(current, Math.max(0, rows.length - 1)));
      setDetailMovie((current) => current ? rows.find((movie) => movie.id === current.id) || null : null);
    }
    setLoading(false);
  }

  async function loadItems(movieId) {
    if (!supabase || !movieId) { setItems([]); return; }
    const { data, error } = await supabase.from('archive_items').select('*').eq('movie_id', movieId).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (error) { setError(error.message); setItems([]); return; }
    setItems((data || []).map((item) => ({
      ...item,
      image_url: item.storage_path ? supabase.storage.from('movie-posters').getPublicUrl(item.storage_path).data.publicUrl : null,
    })));
  }

  useEffect(() => { loadMovies(); }, [supabase]);
  useEffect(() => { if (detailMovie?.id) loadItems(detailMovie.id); else setItems([]); }, [detailMovie?.id, supabase]);
  useEffect(() => {
    const open = () => {
      if (!isAdmin) return;

      // Reuse the single star beside Archive in the main navigation.
      // On a film detail page it opens that film's action menu; on the poster
      // carousel it opens the upload-poster form.
      if (detailMovie) {
        setMenuOpen((value) => !value);
        setEditMode('');
        setModalOpen(false);
        return;
      }

      setMenuOpen(false);
      setPosterFile(null);
      setForm({ title: '', translated_title: '', info_heading: 'Actor', info_content: '', trailer_note: '' });
      setModalOpen(true);
    };
    window.addEventListener('jewsworld-archive-star', open);
    return () => window.removeEventListener('jewsworld-archive-star', open);
  }, [isAdmin, detailMovie]);

  const move = (amount) => {
    if (!movies.length) return;
    setActiveIndex((current) => (current + amount + movies.length) % movies.length);
    setTilt({ x: 0, y: 0 });
  };

  function handlePointerMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    setTilt({ x: (0.5 - y) * 7, y: (x - 0.5) * 10 });
  }

  async function uploadFile(file, prefix = 'archive') {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${session.user.id}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const { error } = await supabase.storage.from('movie-posters').upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
    if (error) throw error;
    return path;
  }

  async function saveMovie(event) {
    event.preventDefault();
    if (!supabase || !session || !isAdmin) { setError('Please log in as administrator to add a movie.'); return; }
    if (!posterFile) { setError('Please choose a movie poster.'); return; }
    setSaving(true);
    let storagePath = '';
    try {
      storagePath = await uploadFile(posterFile, 'poster');
      const { data, error } = await supabase.from('archive_movies').insert({
        title: form.title.trim() || 'Untitled film',
        translated_title: form.translated_title.trim() || null,
        info_heading: form.info_heading.trim() || 'Actor',
        info_content: form.info_content.trim() || null,
        trailer_note: form.trailer_note.trim() || null,
        poster_storage_path: storagePath,
        created_by: session.user.id,
      }).select('*').single();
      if (error) throw error;
      setModalOpen(false);
      await loadMovies();
      setDetailMovie({ ...data, poster_url: supabase.storage.from('movie-posters').getPublicUrl(storagePath).data.publicUrl });
      setActiveIndex(Math.max(0, movies.length));
    } catch (error) {
      setError(error.message || 'Could not save this movie.');
      if (storagePath) await supabase.storage.from('movie-posters').remove([storagePath]);
    } finally { setSaving(false); }
  }

  async function saveFilmInformation(event) {
    event.preventDefault();
    if (!detailMovie || !isAdmin) return;
    setSaving(true);
    const { data, error } = await supabase.from('archive_movies').update({
      title: form.title.trim() || 'Untitled film', translated_title: form.translated_title.trim() || null,
      info_heading: form.info_heading.trim() || 'Actor', info_content: form.info_content.trim() || null,
      trailer_note: form.trailer_note.trim() || null,
    }).eq('id', detailMovie.id).select('*').single();
    if (error) setError(error.message);
    else { setDetailMovie({ ...data, poster_url: detailMovie.poster_url }); setEditMode(''); await loadMovies(); }
    setSaving(false);
  }

  async function changePoster(event) {
    event.preventDefault();
    if (!detailMovie || !posterFile || !isAdmin) return;
    setSaving(true);
    let newPath = '';
    try {
      newPath = await uploadFile(posterFile, 'poster');
      const oldPath = detailMovie.poster_storage_path;
      const { data, error } = await supabase.from('archive_movies').update({ poster_storage_path: newPath }).eq('id', detailMovie.id).select('*').single();
      if (error) throw error;
      const nextMovie = { ...data, poster_url: supabase.storage.from('movie-posters').getPublicUrl(newPath).data.publicUrl };
      setDetailMovie(nextMovie); setPosterFile(null); setEditMode(''); await loadMovies();
      if (oldPath) await supabase.storage.from('movie-posters').remove([oldPath]);
    } catch (error) { setError(error.message || 'Could not change poster.'); if (newPath) await supabase.storage.from('movie-posters').remove([newPath]); }
    setSaving(false);
  }

  async function saveItem(event) {
    event.preventDefault();
    if (!detailMovie || !isAdmin || !supabase) return;
    if (itemForm.type === 'image' && !itemFile) { setError('Please choose a photo.'); return; }
    if (itemForm.type === 'text' && !itemForm.text.trim()) { setError('Please enter some text.'); return; }
    setSaving(true);
    let path = '';
    try {
      if (itemForm.type === 'image') path = await uploadFile(itemFile, 'still');
      const { error } = await supabase.from('archive_items').insert({
        movie_id: detailMovie.id, item_type: itemForm.type,
        content: itemForm.type === 'text' ? itemForm.text.trim() : null,
        storage_path: path || null, sort_order: items.length,
        created_by: session.user.id,
      });
      if (error) throw error;
      setEditMode(''); setItemFile(null); setItemForm({ type: 'text', text: '' }); await loadItems(detailMovie.id);
    } catch (error) { setError(error.message || 'Could not add this content.'); if (path) await supabase.storage.from('movie-posters').remove([path]); }
    setSaving(false);
  }

  async function deleteItem(item) {
    if (!isAdmin || !window.confirm('Delete this item?')) return;
    const { error } = await supabase.from('archive_items').delete().eq('id', item.id);
    if (error) { setError(error.message); return; }
    if (item.storage_path) await supabase.storage.from('movie-posters').remove([item.storage_path]);
    await loadItems(detailMovie.id);
  }

  async function saveManagedItem(event, item) {
  event.preventDefault();

  if (!supabase || !isAdmin || !detailMovie) return;

  setSaving(true);
  setError?.('');

  let newPath = '';

  try {
    const updates = {};

    if (item.item_type === 'text') {
      const nextText = String(itemForm.text || '').trim();

      if (!nextText) {
        throw new Error('Please enter some text.');
      }

      updates.content = nextText;
    } else if (itemFile) {
      newPath = await uploadFile(itemFile, 'still');
      updates.storage_path = newPath;
    }

    const { data, error } = await supabase
      .from('archive_items')
      .update(updates)
      .eq('id', item.id)
      .select('*')
      .single();

    if (error) throw error;

    if (newPath && item.storage_path) {
      const { error: removeError } = await supabase
        .storage.from('movie-posters')
        .remove([item.storage_path]);

      if (removeError) {
        console.error('Old photo cleanup failed:', removeError);
      }
    }

    setItemFile(null);
    setItemForm({ type: 'text', text: '' });
    setEditMode('manage-content');
    await loadItems(detailMovie.id);
  } catch (error) {
    setError(error.message || 'Could not update this content.');

    if (newPath) {
      await supabase.storage.from('movie-posters').remove([newPath]);
    }
  } finally {
    setSaving(false);
  }
}

  async function shiftItem(index, direction) {
    const target = index + direction;
    if (!isAdmin || target < 0 || target >= items.length) return;
    const next = [...items]; [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    const results = await Promise.all(next.map((item, sort_order) => supabase.from('archive_items').update({ sort_order }).eq('id', item.id)));
    const failed = results.find((result) => result.error);
    if (failed) setError(failed.error.message); else await loadItems(detailMovie.id);
  }

  async function deleteMovie() {
    if (!detailMovie || !isAdmin || !window.confirm(`Delete “${detailMovie.title || 'this film'}” and all its content? This cannot be undone.`)) return;
    const { error } = await supabase.from('archive_movies').delete().eq('id', detailMovie.id);
    if (error) { setError(error.message); return; }
    if (detailMovie.poster_storage_path) await supabase.storage.from('movie-posters').remove([detailMovie.poster_storage_path]);
    for (const item of items) if (item.storage_path) await supabase.storage.from('movie-posters').remove([item.storage_path]);
    setDetailMovie(null); setMenuOpen(false); setEditMode(''); await loadMovies();
  }

  function openMovie(movie, index) {
    if (index !== activeIndex) {
      setTransitioningId(movie.id);
      window.setTimeout(() => { setActiveIndex(index); setDetailMovie(movie); setTransitioningId(null); }, 420);
    } else setDetailMovie(movie);
  }

  const currentForm = detailMovie ? {
    title: detailMovie.title || '', translated_title: detailMovie.translated_title || '',
    info_heading: detailMovie.info_heading || 'Actor', info_content: detailMovie.info_content || '',
    trailer_note: detailMovie.trailer_note || '',
  } : form;
  const setCurrentForm = (next) => setForm((old) => ({ ...old, ...next }));

  return (
    <main className={`archive-page ${detailMovie ? 'archive-detail-page' : ''}`} onKeyDown={(event) => { if (event.key === 'ArrowLeft' && !detailMovie) move(-1); if (event.key === 'ArrowRight' && !detailMovie) move(1); }} tabIndex={0}>
      {!detailMovie && <section className="archive-carousel" aria-label="Movie poster carousel"
        onWheel={(event) => { if (Math.abs(event.deltaX) > 8 || Math.abs(event.deltaY) > 18) { event.preventDefault(); move((event.deltaX || event.deltaY) > 0 ? 1 : -1); } }}>
        {!loading && movies.map((movie, index) => {
          let offset = index - activeIndex;
          if (offset > movies.length / 2) offset -= movies.length;
          if (offset < -movies.length / 2) offset += movies.length;
          if (Math.abs(offset) > 2) return null;
          const isActive = offset === 0;
          return <button type="button" key={movie.id} className={`archive-poster-card ${isActive ? 'is-current' : ''} ${transitioningId === movie.id ? 'is-awakening' : ''}`}
            style={{ '--poster-offset': offset, '--poster-depth': Math.abs(offset), '--pointer-rotate-x': isActive ? `${tilt.x}deg` : '0deg', '--pointer-rotate-y': isActive ? `${tilt.y}deg` : `${offset * -18}deg` }}
            onMouseMove={isActive ? handlePointerMove : undefined} onMouseLeave={() => setTilt({ x: 0, y: 0 })}
            onTouchStart={(event) => { startX.current = event.touches[0]?.clientX ?? null; }}
            onTouchEnd={(event) => { const endX = event.changedTouches[0]?.clientX; if (startX.current != null && endX != null && Math.abs(endX - startX.current) > 35) move(endX < startX.current ? 1 : -1); startX.current = null; }}
            onClick={() => openMovie(movie, index)} aria-label={movie.title || 'Movie poster'}>
            <img src={movie.poster_url} alt={movie.title || 'Movie poster'} draggable="false" />
          </button>;
        })}
      </section>}

      {detailMovie && <>
        {menuOpen && <div className="archive-action-menu">
          <button onClick={() => { setPosterFile(null); setEditMode('poster'); setMenuOpen(false); }}>Change Poster</button>
          <button onClick={() => { setForm(currentForm); setEditMode('information'); setMenuOpen(false); }}>Edit Information</button>
          <button onClick={() => { setItemForm({ type: 'text', text: '' }); setItemFile(null); setEditMode('add-content'); setMenuOpen(false); }}>Add Photo &amp; Text</button>
          <button onClick={() => { setEditMode('manage-content'); setMenuOpen(false); }}>Manage Content</button>
          <button className="archive-delete-action" onClick={deleteMovie}>Delete Film</button>
        </div>}
        <header className="archive-film-header">
          <h1>{detailMovie.title || 'Untitled film'}</h1>
          {detailMovie.translated_title && <h2>{detailMovie.translated_title}</h2>}
          <div className="archive-film-meta">
            <section><h3>{detailMovie.info_heading || 'Actor'}</h3><p>{detailMovie.info_content || ''}</p></section>
            <section><h3>Synopsis</h3><p>{detailMovie.trailer_note || ''}</p></section>
          </div>
        </header>
        <section className="archive-film-content">
          {items.map((item, index) => <article key={item.id} className={`archive-content-item ${item.item_type === 'image' ? 'is-image' : 'is-text'} ${index % 2 ? 'is-reversed' : ''}`}>
            {item.item_type === 'image' ? <img src={item.image_url} alt="Film memory" /> : <div className="archive-content-text" tabIndex={0}>

  {item.content}

</div>}
            
          </article>)}
        </section>
        {movies.length > 1 && <nav className="archive-neighbor-nav" aria-label="Previous and next films">
          {[-1, 1].map((direction) => { const index = (activeIndex + direction + movies.length) % movies.length; const movie = movies[index]; return <button key={direction} type="button" className={`archive-neighbor archive-neighbor-${direction < 0 ? 'prev' : 'next'}`} onClick={() => openMovie(movie, index)} aria-label={direction < 0 ? 'Previous film' : 'Next film'}><img src={movie.poster_url} alt={movie.title || 'Film poster'} /></button>; })}
        </nav>}
      </>}

      {modalOpen && <div className="modal-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><section className="archive-form-panel archive-upload-only" aria-label="Upload poster"><button type="button" className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">×</button>
        <form onSubmit={saveMovie}>
          <label className="archive-upload-prompt">{posterFile ? posterFile.name : 'Upload poster'}<input type="file" accept="image/*" required onChange={(event) => setPosterFile(event.target.files?.[0] || null)} /></label>
          <button className="archive-upload-submit" type="submit" disabled={saving || !posterFile}>{saving ? 'uploading…' : 'Upload poster'}</button>
        </form>
      </section></div>}

      {editMode && <div className="modal-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditMode(''); }}><section className="archive-form-panel archive-editor-panel"><button type="button" className="modal-close" onClick={() => setEditMode('')} aria-label="Close">×</button>
        {editMode === 'information' && <form onSubmit={saveFilmInformation} className="archive-editor-form"><h2>Edit Information</h2>
          <label>Film title<input value={form.title} onChange={(e) => setCurrentForm({ title: e.target.value })} required /></label>
          <label>Translated title<input value={form.translated_title} onChange={(e) => setCurrentForm({ translated_title: e.target.value })} /></label>
          <label>Information heading<input value={form.info_heading} onChange={(e) => setCurrentForm({ info_heading: e.target.value })} placeholder="Actor / Actress / Director" /></label>
          <label>Information content<input className="archive-information-content-input" value={form.info_content} onChange={(e) => setCurrentForm({ info_content: e.target.value })} /></label>
          <label>trailer note<textarea rows="3" value={form.trailer_note} onChange={(e) => setCurrentForm({ trailer_note: e.target.value })} /></label>
          <button className="archive-upload-submit" disabled={saving}>{saving ? 'saving…' : 'Save changes'}</button></form>}
        {editMode === 'poster' && <form onSubmit={changePoster} className="archive-editor-form"><h2>Change Poster</h2><label className="archive-upload-prompt">{posterFile ? posterFile.name : 'Choose a new poster'}<input type="file" accept="image/*" required onChange={(e) => setPosterFile(e.target.files?.[0] || null)} /></label><button className="archive-upload-submit" disabled={saving || !posterFile}>{saving ? 'saving…' : 'Change poster'}</button></form>}
        {editMode === 'add-content' && <form onSubmit={saveItem} className="archive-editor-form"><h2>Add Photo &amp; Text</h2><label>Content type<select value={itemForm.type} onChange={(e) => setItemForm({ type: e.target.value, text: '' })}><option value="text">Text</option><option value="image">Photo</option></select></label>{itemForm.type === 'text' ? <label>Text<textarea className="archive-information-content-input archive-content-text-input" rows="6" value={itemForm.text} onChange={(e) => setItemForm({ ...itemForm, text: e.target.value })} required /></label> : <label className="archive-upload-prompt">{itemFile ? itemFile.name : 'Choose a photo'}<input type="file" accept="image/*" required onChange={(e) => setItemFile(e.target.files?.[0] || null)} /></label>}<button className="archive-upload-submit" disabled={saving}>{saving ? 'saving…' : 'Add to film'}</button></form>}
        {editMode === 'edit-content' && (
  <form
    className="archive-editor-form"
    onSubmit={(event) => {
      const item = items.find((entry) => entry.id === editingItemId);

      if (!item) {
        event.preventDefault();
        setError('Could not find this content.');
        return;
      }

      saveManagedItem(event, item);
    }}
  >
    <h2>Edit Content</h2>

    {(() => {
      const item = items.find((entry) => entry.id === editingItemId);

      if (!item) return <p>Content not found.</p>;

      if (item.item_type === 'text') {
        return (
          <label>
            Text
            <textarea
              rows="8"
              value={itemForm.text}
              onChange={(event) =>
                setItemForm({
                  ...itemForm,
                  text: event.target.value,
                })
              }
              required
            />
          </label>
        );
      }

      return (
        <>
          <p>Choose a replacement photo, or leave this empty to keep the current photo.</p>

          {item.image_url && (
            <img
              src={item.image_url}
              alt="Current content"
              className="archive-manage-thumbnail"
            />
          )}

          <label className="archive-upload-prompt">
            {itemFile ? itemFile.name : 'Choose replacement photo'}
            <input
              type="file"
              accept="image/*"
              onChange={(event) =>
                setItemFile(event.target.files?.[0] || null)
              }
            />
          </label>
        </>
      );
    })()}

    <button
      type="submit"
      className="archive-upload-submit"
      disabled={saving}
    >
      {saving ? 'saving…' : 'Save changes'}
    </button>

    <button
      type="button"
      onClick={() => setEditMode('manage-content')}
    >
      Cancel
    </button>
  </form>
)}
        {editMode === 'manage-content' && (
  <div className="archive-editor-form archive-manage-editor">
    <h2>Manage Content</h2>

    {items.length === 0 && <p>No content yet.</p>}

    {items.map((item, index) => (
      <div className="archive-manage-row" key={item.id}>
        <div className="archive-manage-preview">
          <strong>
            {index + 1}. {item.item_type === 'image' ? 'Photo' : 'Text'}
          </strong>

          {item.item_type === 'image' ? (
            <img
              src={item.image_url}
              alt={`Content ${index + 1}`}
              className="archive-manage-thumbnail"
            />
          ) : (
            <p>{(item.content || '').slice(0, 100)}</p>
          )}
        </div>

        <div className="archive-manage-actions">
          <button
            type="button"
            disabled={index === 0 || saving}
            onClick={() => shiftItem(index, -1)}
          >
            ↑ Move up
          </button>

          <button
            type="button"
            disabled={index === items.length - 1 || saving}
            onClick={() => shiftItem(index, 1)}
          >
            ↓ Move down
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEditingItemId(item.id);
              setItemForm({
                type: item.item_type,
                text: item.content || '',
              });
              setItemFile(null);
              setEditMode('edit-content');
            }}
          >
            Edit
          </button>

          <button
            type="button"
            className="archive-delete-action"
            disabled={saving}
            onClick={() => deleteItem(item)}
          >
            Delete
          </button>
        </div>
      </div>
    ))}

    <button
      type="button"
      className="archive-upload-submit"
      onClick={() => {
        setEditingItemId(null);
        setItemFile(null);
        setItemForm({ type: 'text', text: '' });
        setEditMode('add-content');
      }}
    >
      Add content
    </button>
  </div>
)}
      </section></div>}
    </main>
  );
}

/* ========================================
   Main website
======================================== */

function App() {
  const [page, setPage] = useState('home');
  const [mapViewKey, setMapViewKey] = useState(0);

  const [loginOpen, setLoginOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
        {['home', 'map', 'archive', 'about'].map((navPage) => {
          const active = page === navPage;
          const starAction = () => {
            if (navPage === 'home') return;
            if (navPage === 'about') {
              if (isAdmin) logOut();
              else setLoginOpen(true);
              return;
            }
            if (!isAdmin) return;
            if (navPage === 'map') {
              window.dispatchEvent(new Event('jewsworld-map-star'));
            } else if (navPage === 'archive') {
              window.dispatchEvent(new Event('jewsworld-archive-star'));
            }
          };
          return (
            <div className="nav-item-wrap" key={navPage}>
              <button type="button" className={`nav-link ${active ? 'is-active' : ''}`} onClick={() => {
                if (navPage === 'map') {
  setPage('map');
  setMapViewKey((key) => key + 1);
} else {
  if (navPage === 'archive' && page === 'archive') {
    window.dispatchEvent(new Event('jewsworld-archive-home'));
  }


  setPage(navPage);
}
              }}>{navPage}</button>
              {active && <button type="button" className="map-star-button nav-star-button" onClick={starAction} aria-label={`${navPage} options`} title={navPage === 'about' ? (isAdmin ? 'Log out' : 'Log in') : navPage === 'map' ? 'Add or modify a trip' : navPage === 'archive' ? 'Add a movie' : 'Home'}>★</button>}
            </div>
          );
        })}
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
            key={mapViewKey}
            supabase={supabase}
            isAdmin={isAdmin}
            session={session}
            setError={setError}
          />
          {error && <div className="map-global-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
        </>
      )}

      {/* Archive */}
      {page === 'archive' && <ArchivePage supabase={supabase} isAdmin={isAdmin} session={session} setError={setError} />}

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
