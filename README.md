# Always Be There — starter project

A beginner-friendly React + Vite + Supabase starter for a public diary/photo blog.

## Features
- Monthly calendar and date selection
- Public published diary posts and photos
- Email + password sign-up/sign-in; sign-up asks for a display name
- Comment UI showing the registered display name
- Admin-only post creation and photo uploads, enforced by database policies

## Setup
1. Install a current LTS version of Node.js from https://nodejs.org/
2. In the project folder run `npm install`.
3. In Supabase SQL Editor, run `supabase/schema.sql` if this is a new project. If you already ran it, do not run it again just for auth; use the comment policy adjustment shown below.
4. In Supabase Dashboard, open Authentication -> Providers (or Sign In / Providers) -> Email and turn off **Confirm email**. This allows users to sign in immediately after registration.
5. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` to the Project URL (without `/rest/v1/`) and `VITE_SUPABASE_ANON_KEY` to the publishable/anon key. Never put a secret/service-role key in a `VITE_` variable.
6. Run `npm run dev` and open the local URL printed in the terminal.
7. Test registration with an email you control before sharing the site.

## If you already ran the original schema
Because this starter disables email confirmation, open Supabase SQL Editor and run:

```sql
drop policy if exists "Verified users comment on published posts" on public.comments;
create policy "Signed-in users comment on published posts" on public.comments
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.diary_posts p
    where p.id = post_id and p.status = 'published'
  )
);
```

This allows signed-in accounts to comment without relying on an email-confirmation JWT claim. The app's other database policies still control diary publishing and photo uploads.

## Important notes
- Disabling email confirmation means a person can register with an email address they do not control. They will not receive password reset emails reliably for that address. For a public launch, consider enabling confirmation or limiting signups.
- The site uses Supabase Auth for accounts; friends do not need their own Supabase accounts.
- Only set `app_metadata.role = admin` from a trusted dashboard/server workflow. Never allow browser code or user-editable metadata to grant admin rights.
- The public photo bucket is only for images intended to be public. Never upload private photos there.
