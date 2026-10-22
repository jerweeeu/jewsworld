import React, { useEffect, useMemo, useState } from 'react';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth,
  isToday, startOfMonth, startOfWeek, subMonths
} from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { ArrowLeft, ArrowRight, BookHeart, CalendarDays, Camera, LogIn, LogOut, MessageCircle, Plus, Send, Sparkles, X } from 'lucide-react';
import { supabase, supabaseConfigured } from './supabase';

const todayKey = () => format(new Date(), 'yyyy-MM-dd');
const errorText = (error) => error?.message || '發生未知錯誤，請稍後再試。';

function AuthPanel({ onClose, onDone }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMessage('');
    try {
      if (!supabase) throw new Error('網站尚未連接 Supabase，請先檢查 .env 設定。');
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('密碼至少需要 8 個字元。');
        const cleanName = displayName.trim();
        if (cleanName.length < 2 || cleanName.length > 40) throw new Error('顯示名稱請輸入 2–40 個字元。');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: cleanName } }
        });
        if (error) throw error;
        if (data.session) {
          setMessage('註冊成功！歡迎加入。');
          onDone(data.session.user);
        } else {
          setMessage('註冊已完成。若未能直接登入，請確認 Supabase 已關閉電郵確認。');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(), password
        });
        if (error) throw error;
        onDone(data.user);
      }
    } catch (err) { setMessage(errorText(err)); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="modal auth-modal">
      <button className="icon-button close" onClick={onClose} aria-label="關閉"><X size={18}/></button>
      <div className="eyebrow">ALWAYS BE THERE</div>
      <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      <p className="muted">登入後，進入屬於你的生活記錄空間。</p>
      <form onSubmit={submit} className="stack">
        {mode === 'signup' && <label>點樣稱呼？<input value={displayName} onChange={e=>setDisplayName(e.target.value)} required minLength={2} maxLength={40} autoComplete="nickname" placeholder="What should we call you?"/></label>}
        <label>電郵地址<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" placeholder="name@example.com"/></label>
        <label>密碼<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="至少 8 個字元"/></label>
        {mode === 'signup' && <p className="muted">請使用自己可以登入的電郵地址，並記好密碼。關閉電郵確認後，註冊時不會要求點擊驗證連結。</p>}
        <button className="primary-button" disabled={busy}>{busy ? '處理中…' : mode === 'login' ? '登入' : '註冊'}</button>
      </form>
      {message && <p className="notice">{message}</p>}
      <button className="text-button" onClick={()=>{setMode(mode==='login'?'signup':'login');setMessage('')}}>
        {mode === 'login' ? '還沒有帳號？建立帳號' : '已經有帳號？返回登入'}
      </button>
    </section>
  </div>;
}

function App() {
  const [session, setSession] = useState(null);
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
  const [newComment, setNewComment] = useState('');
  const [activePost, setActivePost] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsAdmin(data.session?.user?.app_metadata?.role === 'admin');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setIsAdmin(next?.user?.app_metadata?.role === 'admin');
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadPosts() {
    if (!supabaseConfigured) return;
    setBusy(true); setError('');
    try {
      const { data, error } = await supabase.from('diary_posts')
        .select('id, title, body, entry_date, created_at, post_photos(id, storage_path, caption)')
        .eq('status', 'published').order('entry_date', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      const withPhotos = (data || []).map(p => ({
        ...p,
        photos: (p.post_photos || []).map(photo => ({
          ...photo,
          url: supabase.storage.from('public-post-photos').getPublicUrl(photo.storage_path).data.publicUrl
        }))
      }));
      setPosts(withPhotos);
      const ids = withPhotos.map(p => p.id);
      if (ids.length) {
        const { data: commentData, error: commentError } = await supabase.from('comments')
          .select('id, post_id, body, created_at, user_id')
          .in('post_id', ids).order('created_at', { ascending: true });
        if (commentError) throw commentError;
        const userIds = [...new Set((commentData || []).map(c => c.user_id))];
        let profileMap = {};
        if (userIds.length) {
          const { data: profileData } = await supabase.from('profiles').select('id, display_name').in('id', userIds);
          profileMap = Object.fromEntries((profileData || []).map(p => [p.id, p.display_name]));
        }
        const grouped = {};
        for (const c of commentData || []) {
          const item = { ...c, profiles: { display_name: profileMap[c.user_id] || '日記朋友' } };
          (grouped[c.post_id] ||= []).push(item);
        }
        setComments(grouped);
      } else setComments({});
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  useEffect(() => { loadPosts(); }, [supabaseConfigured, session?.user?.id]);

  const postDates = useMemo(() => new Set(posts.map(p => p.entry_date)), [posts]);
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);
  const selectedPosts = posts.filter(p => p.entry_date === selectedDate).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  const displayName = session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0];

  async function publishPost(e) {
    e.preventDefault();
    if (!session) { setAuthOpen(true); return; }
    if (!isAdmin) { setError('只有網站管理員可以發布日記。'); return; }
    if (composerMode === 'note' && !body.trim()) { setError('請先寫下日記內容。'); return; }
    if (composerMode === 'photo' && photos.length === 0) { setError('請先選擇至少一張相片。'); return; }
    setBusy(true); setError('');
    try {
      const { data: post, error: postError } = await supabase.from('diary_posts').insert({
        title: title.trim() || null, body: composerMode === 'note' ? body.trim() : '', entry_date: selectedDate, status: 'published', author_id: session.user.id
      }).select().single();
      if (postError) throw postError;
      for (const file of (composerMode === 'photo' ? photos : [])) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${post.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('public-post-photos').upload(path, file, { upsert: false });
        if (uploadError) throw uploadError;
        const { error: photoError } = await supabase.from('post_photos').insert({ post_id: post.id, storage_path: path, caption: '' });
        if (photoError) throw photoError;
      }
      setTitle(''); setBody(''); setPhotos([]); setShowComposer(false); setComposerMode('note');
      await loadPosts();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  async function addComment(postId) {
    if (!session) { setAuthOpen(true); return; }
    const text = (commentDrafts[postId] || '').trim();
    if (!text) return;
    setError('');
    const { error } = await supabase.from('comments').insert({ post_id: postId, body: text, user_id: session.user.id });
    if (error) setError(errorText(error));
    else {
      setCommentDrafts(old => ({ ...old, [postId]: '' }));
      const { data, error: readError } = await supabase.from('comments')
        .select('id, post_id, body, created_at, user_id')
        .eq('post_id', postId).order('created_at', { ascending: true });
      if (readError) setError(errorText(readError));
      else {
        const ids = [...new Set((data || []).map(c => c.user_id))];
        const { data: profiles } = ids.length ? await supabase.from('profiles').select('id, display_name').in('id', ids) : { data: [] };
        const names = Object.fromEntries((profiles || []).map(p => [p.id, p.display_name]));
        setComments(old => ({ ...old, [postId]: (data || []).map(c => ({ ...c, profiles: { display_name: names[c.user_id] || '日記朋友' } })) }));
      }
    }
  }

  async function deleteComment(comment) {
    if (!session) return;
    const { error } = await supabase.from('comments').delete().eq('id', comment.id);
    if (error) setError(errorText(error));
    else setComments(old => ({ ...old, [comment.post_id]: (old[comment.post_id] || []).filter(c => c.id !== comment.id) }));
  }

  async function deletePost(post) {
    if (!confirm('確定要刪除這篇日記嗎？此操作無法復原。')) return;
    const { error } = await supabase.from('diary_posts').delete().eq('id', post.id);
    if (error) setError(errorText(error)); else await loadPosts();
  }

  if (!supabaseConfigured) return <main className="setup-screen">
    <div className="setup-card">
      <div className="brand-mark"><BookHeart/></div>
      <div className="eyebrow">YOUR LITTLE CORNER OF THE INTERNET</div>
      <h1>Always Be There</h1>
      <p>一個收藏生活、相片同小小感想的地方。</p>
      <div className="setup-note"><strong>下一步：連接 Supabase</strong><br/>請複製 <code>.env.example</code> 為 <code>.env</code>，填入 Supabase Project URL 同 Publishable/anon key，再重新啟動網站。</div>
    </div>
  </main>;

  if (!session) return <div className="welcome-screen">
    <div className="welcome-brand">Always Be There <span>♡</span></div>
    <main className="welcome-content">
      <div className="welcome-kicker">A LITTLE SPACE TO KEEP</div>
      <h1>Welcome To<br/><em>A New World</em></h1>
      <p>Little moments, kept forever.<br/>把生活裡的小小瞬間，好好收藏。</p>
      <AuthPanel onClose={()=>{}} onDone={()=>setAuthOpen(false)}/>
    </main>
    <div className="welcome-foot">made of little things · always be there</div>
  </div>;

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark"><BookHeart size={20}/></span><span>Always Be There<small>每一個日子，都值得被記住</small></span></a>
      <nav>
        <span className="user-pill">{displayName}</span><button className="outline-button" onClick={()=>supabase.auth.signOut()}><LogOut size={16}/> 登出</button>
      </nav>
    </header>
    <main className="main-layout">
      {view === 'calendar' && <><section className="intro">
        <div className="eyebrow"><Sparkles size={14}/> A LITTLE SPACE FOR EVERYDAY</div>
        <h1>Always Be There</h1>
        <p>那些看似平凡的小事，日後都會成為閃閃發亮的回憶。</p>
      </section>
      <section className="calendar-card">
        <div className="calendar-head">
          <div><div className="eyebrow">YOUR MEMORY CALENDAR</div><h2>{format(month, 'yyyy 年 M 月', { locale: zhTW })}</h2></div>
          <div className="date-selectors">
            <label className="date-select"><span>年份</span><select aria-label="選擇年份" value={month.getFullYear()} onChange={e=>setMonth(new Date(Number(e.target.value), month.getMonth(), 1))}>{Array.from({length: 51}, (_,i)=>new Date().getFullYear()-25+i).map(year=><option key={year} value={year}>{year} 年</option>)}</select></label>
            <label className="date-select"><span>月份</span><select aria-label="選擇月份" value={month.getMonth()} onChange={e=>setMonth(new Date(month.getFullYear(), Number(e.target.value), 1))}>{Array.from({length:12},(_,i)=><option key={i} value={i}>{i+1} 月</option>)}</select></label>
            <div className="month-nav">
              <button className="icon-button" aria-label="上個月" onClick={()=>setMonth(subMonths(month,1))}><ArrowLeft size={18}/></button>
              <button className="icon-button" aria-label="下個月" onClick={()=>setMonth(addMonths(month,1))}><ArrowRight size={18}/></button>
            </div>
          </div>
        </div>
        <div className="calendar-grid weekday-row">{['一','二','三','四','五','六','日'].map(d=><span key={d}>{d}</span>)}</div>
        <div className="calendar-grid day-grid">{calendarDays.map(day=>{
          const key=format(day,'yyyy-MM-dd');
          return <button key={key} onClick={()=>{setSelectedDate(key);setShowComposer(false);setView('day')}} className={`day-cell ${!isSameMonth(day,month)?'outside':''} ${key===selectedDate?'selected':''} ${isToday(day)?'today':''}`}>
            <span>{format(day,'d')}</span>{postDates.has(key)&&<i/>}
          </button>
        })}</div>
      </section>

      </>}
            {view === 'day' && <section className="entries-section day-view">
        <button className="back-calendar" onClick={()=>setView('calendar')}><ArrowLeft size={17}/> Back to calendar</button>
        <div className="section-heading">
          <div><div className="eyebrow"><CalendarDays size={14}/> DAILY ENTRIES</div><h2>{format(new Date(`${selectedDate}T12:00:00`), 'M 月 d 日 · EEEE', { locale: zhTW })}</h2></div>
          {isAdmin && <button className="primary-button compact" onClick={()=>{setShowComposer(v=>!v);setComposerMode('note')}}><Plus size={16}/> 新增內容</button>}
        </div>
        {error && <div className="error-banner">{error}<button onClick={()=>setError('')}><X size={14}/></button></div>}
        {busy && <p className="muted">正在載入日記…</p>}
        {!busy && selectedPosts.length===0 && !showComposer && <div className="empty-state"><div className="empty-icon"><Camera size={24}/></div><h3>這一天，還沒有日記</h3><p>有些日子平平淡淡，也值得被記住。</p>{isAdmin&&<button className="outline-button" onClick={()=>setShowComposer(true)}><Plus size={16}/> 記錄今天</button>}</div>}
        {showComposer && isAdmin && <form className="composer card" onSubmit={publishPost}>
          <div className="composer-head"><h3>{composerMode === 'note' ? '寫下一篇文字日記' : '新增相片'}</h3><button type="button" className="icon-button" onClick={()=>setShowComposer(false)}><X size={17}/></button></div>
          <div className="composer-mode"><button type="button" className={composerMode==='note'?'mode-active':''} onClick={()=>setComposerMode('note')}><BookHeart size={15}/> 文字日記</button><button type="button" className={composerMode==='photo'?'mode-active':''} onClick={()=>setComposerMode('photo')}><Camera size={15}/> 相片</button></div>
          {composerMode === 'note' ? <><label>標題（選填）<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} placeholder="今天有什麼特別的事？"/></label><label>日記內容<textarea value={body} onChange={e=>setBody(e.target.value)} rows={5} maxLength={10000} placeholder="把今天的心情寫下來…" required/></label></> : <><label>相片標題（選填）<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} placeholder="為這些相片留個名字"/></label><label className="upload-box"><Camera size={20}/><span>選擇相片（可多選）</span><input type="file" accept="image/*" multiple onChange={e=>setPhotos(Array.from(e.target.files||[]).slice(0,10))}/><small>{photos.length ? `已選擇 ${photos.length} 張相片` : '最多 10 張相片'}</small></label></>}
          <button className="primary-button" disabled={busy}>{busy?'發布中…':composerMode==='note'?'儲存文字日記':'上傳相片'}</button>
        </form>}
        <div className="memory-grid">{selectedPosts.flatMap(post=>[
          ...(post.body?.trim() ? [{kind:'note', id:`note-${post.id}`, post}] : []),
          ...(post.photos||[]).map((photo,index)=>({kind:'photo',id:`photo-${photo.id}`,post,photo,index}))
        ]).map(item=>item.kind==='note' ? <article className="memory-card note-memory" key={item.id}>
          <div className="memory-card-top"><span className="memory-kind"><BookHeart size={13}/> NOTE</span>{isAdmin&&<button className="text-button danger-text" onClick={()=>deletePost(item.post)}>刪除</button>}</div>
          {item.post.title&&<h3>{item.post.title}</h3>}<p className="note-preview">{item.post.body}</p><button className="read-note" onClick={()=>setActivePost(item.post)}>閱讀全文 <ArrowRight size={14}/></button>
          <div className="memory-comments"><div className="comments-block"><h4><MessageCircle size={16}/> 留言 {comments[item.post.id]?.length||0}</h4>
            {(comments[item.post.id]||[]).map(c=><div className="comment" key={c.id}><div className="avatar">{(c.profiles?.display_name||'友').slice(0,1)}</div><div className="comment-content"><div className="comment-author">{c.profiles?.display_name||'日記朋友'} <time>{format(new Date(c.created_at),'M/d HH:mm')}</time></div><p>{c.body}</p></div>{(session?.user?.id===c.user_id||isAdmin)&&<button className="icon-button tiny" aria-label="刪除留言" onClick={()=>deleteComment(c)}><X size={14}/></button>}</div>)}
            {session ? <form className="comment-form" onSubmit={e=>{e.preventDefault();addComment(item.post.id)}}><input value={commentDrafts[item.post.id]||''} onChange={e=>setCommentDrafts(old=>({...old,[item.post.id]:e.target.value}))} maxLength={1000} placeholder="留下一句溫柔的話…" required/><button aria-label="送出留言" className="send-button"><Send size={16}/></button></form> : <button className="comment-login" onClick={()=>setAuthOpen(true)}>登入後留言</button>}
          </div></div>
        </article> : <article className="memory-card photo-memory" key={item.id}><div className="memory-photo-wrap"><img src={item.photo.url} alt={item.photo.caption||item.post.title||'日記相片'} loading="lazy"/><span className="photo-date">{format(new Date(`${item.post.entry_date}T12:00:00`),'M/d')}</span></div>{item.post.title&&<p className="photo-caption">{item.post.title}</p>}{isAdmin&&<button className="text-button danger-text photo-delete" onClick={()=>deletePost(item.post)}>刪除這組相片</button>}</article>)}</div>
        {activePost && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setActivePost(null)}><section className="modal note-detail"><button className="icon-button close" onClick={()=>setActivePost(null)} aria-label="關閉"><X size={18}/></button><div className="eyebrow">A LITTLE MEMORY</div><h2>{activePost.title||'未命名日記'}</h2><p className="note-detail-body">{activePost.body}</p><small>{format(new Date(`${activePost.entry_date}T12:00:00`),'yyyy 年 M 月 d 日')}</small></section></div>}
      </section>}
      <footer className="footer">Made with a little love <span>♥</span> · Always Be There</footer>
    </main>
    {authOpen&&<AuthPanel onClose={()=>setAuthOpen(false)} onDone={()=>setAuthOpen(false)}/>}
  </div>;
}

export default App;
