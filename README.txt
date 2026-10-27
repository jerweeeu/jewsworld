Jewsworld / Always Be There — navigation star and memory management update

Files included:
- App.jsx: complete React component file
- styles.css: complete stylesheet

Navigation behavior:
- Exactly one star is shown, beside the currently selected Home, Map, Diary, or About navigation item.
- Home star has no action.
- Map star opens Add a Trip on the map overview, or Modify This Trip while viewing a trip.
- Diary star opens a date/photo/subtitle form; the Diary page also has a separate “view day” button to open that date's gallery.
- About star opens the login dialog when not an administrator. When an administrator is logged in, it signs out.
- The navigation's separate log in/log out item has been removed.
- Inactive navigation labels are grey; the selected label is black.

Admin features:
- Modify trip details, edit photo subtitles, reorder existing photos, add photos, and delete photos.
- Delete an entire travel record or a city and its travel records.
- Add diary photo entries by date and subtitle; delete an individual diary entry/photo or all entries on a selected date.

Important:
- Replace your repository's src/App.jsx and src/styles.css with these files.
- No database schema changes or SQL migration are included.
- The app relies on the existing Supabase tables and storage buckets and on your existing RLS/Storage policies allowing admin operations. If Supabase denies a change, the UI will show the error.
