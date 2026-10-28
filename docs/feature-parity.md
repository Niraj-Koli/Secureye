# Feature Parity Checklist

The original project is the specification. `Old/` paths below refer to files in its code
([the original Django + React app](https://github.com/Niraj-Koli/Secureye/tree/442796b)); other paths refer to this repository. Every
behavior below must exist in the
modernized app before the overhaul counts as complete. Each item records the old behavior
(with its source location), the acceptance criteria for the new implementation, and the phase that
delivers it.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done and verified

Items marked **Changed (approved)** intentionally differ from the old behavior; the reason is given.
Items marked **Old bug** describe broken behavior that will *not* be reproduced.

---

## 1. Authentication & accounts

Old implementation: Djoser + SimpleJWT (`Old/Secureye/settings.py`), custom user model
`Old/users/models.py`, screens in `Old/src/components/Authentication/*`.

> **Status:** every account flow is implemented in the API (Phase 2) and the UI (Phase 7,
> `frontend/src/features/auth/`), and was verified end to end against the real backend with
> the emails read from Mailpit.

### 1.1 User model
- [x] Fields: `name`, `email` (unique, login identifier), `password` (hashed), `is_active`, `is_staff`, `is_superuser`. — Phase 2
- [x] Superuser can be created from the command line (old: `manage.py createsuperuser`). — Phase 2
      → `uv run python -m app.cli create-superuser --email … --name …`

### 1.2 Signup — `/signup`
Old: `Signup.jsx`, `POST /auth/users/`.
- [x] Fields: Username (`name`), Email Address, Password. — Phase 2/7
- [x] Client and server validation with the same rules (client errors now show under each field
      instead of one generic dialog): — Phase 2/7
  - name matches `^[a-zA-Z0-9 ]+$`
  - email matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`
  - password has more than 7 characters after trimming and contains no whitespace
- [x] Server also applies password-strength checks (old: Django's four password validators: similarity to user attributes, minimum length, common password, all-numeric). — Phase 2
- [x] Duplicate email is rejected with a clear message: the server's own reason ("An account with this
      email already exists.", or which password rule failed) replaces the old catch-all "already exists
      or password is similar to email". — Phase 2/7
- [x] On success an **activation email** is sent and the user sees the success dialog (same three
      lines; "sent to your Gmail" now says "your email"), then goes to `/login`. — Phase 2/7
- [x] Show/hide password toggle (now labelled for screen readers). — Phase 7

### 1.3 Account activation — `/activate/:uid/:token`
Old: `Activation.jsx`, `POST /auth/users/activation/`.
- [x] The URL shape `/activate/:uid/:token` is kept so the email link format stays the same. — Phase 2/7
- [x] Valid token activates the account; the token is single-use and expires (48 h). — Phase 2
- [x] *New:* `POST /auth/activate/resend` re-sends the activation email (Djoser offered this endpoint;
      the old UI never used it). — Phase 2
- [x] **Changed (approved):** the page waits for the result and shows success or failure, with a
      Login button. *(Old bug: it navigated away immediately, so errors were never shown.)* Opening
      the link again says the account is already active. — Phase 7
- [x] *New:* an invalid or expired activation link offers to email a new one (uses the resend
      endpoint above). — Phase 7

### 1.4 Login / logout — `/login`
Old: `Login.jsx`, `POST /auth/jwt/create/`, `GET /auth/users/me/`.
- [x] Email + password login; inactive accounts cannot log in. — Phase 2
- [x] Same client validation as signup for email/password. — Phase 7
- [x] Success dialog "Welcome! You have successfully logged in." → "Explore" goes to `/` (or to
      the page the user was sent from); error dialog "Invalid email or password. Please try again."
      (also for an account that isn't activated yet, as before). — Phase 7
- [x] Current user is loaded after login (name/email available to the UI). — Phase 2/7
- [x] Logout from the navbar clears the session and returns to `/` (also from a protected page,
      which goes home rather than to login). — Phase 6
- [x] **Changed (approved):** access token kept in memory, refresh token in an httpOnly cookie with
      rotation, and silent refresh. *(Old: both tokens in `localStorage`; refresh token never used;
      access token lifetime 120 min, refresh 1 day.)* The client refreshes once for requests that
      fail together and serialises refreshes across tabs (Web Locks), so rotation's reuse detection
      doesn't sign the user out when two tabs refresh at once. A reload restores the session from
      the cookie. — Phase 2/6

### 1.5 Password reset
Old: `Reset.jsx` (`POST /auth/users/reset_password/`), `Password.jsx`
(`POST /auth/users/reset_password_confirm/`).
- [x] `/reset-password`: enter email → reset email is sent. The response is the same whether or not
      the account exists, so the endpoint can't be used to find out which emails are registered. The
      dialog is worded to match ("If an account exists for that email, we've sent…"). — Phase 2/7
- [x] The URL shape `/password/reset/confirm/:uid/:token` is kept. — Phase 2/7
- [x] New password + confirm password; must match ("Passwords do not match.") and meet the password
      rules. A used or expired link offers "Get a new link". — Phase 2/7
- [x] A **"password changed" confirmation email** is sent after a successful reset
      (old: `PASSWORD_CHANGED_EMAIL_CONFIRMATION`). — Phase 2
- [x] Success dialog "Password Changed!" → `/login`. — Phase 7

### 1.6 Access control
- [x] Image, Video and Live pages require login: signed-out visitors (including the footer links)
      go to `/login?next=<page>` and, after logging in, on to the page they wanted (the old app
      linked to `/login` and dropped the destination). `next` only accepts same-site paths. If the
      session expires while a page is open, the page sends the user to login. — Phase 6
      The home page's tool cards work the same way. — Phase 7
- [x] **Changed (approved):** the server *enforces* authentication on every detection endpoint
      (API tests check the 401 for each one).
      *(Old: every `/prediction/*` endpoint was unauthenticated and CSRF-exempt.)* — Phase 3–5

---

## 2. Public pages

Old: `Old/src/components/HomeSection/*`, `Elementals/*`.

### 2.1 Home — `/` (and `/home` redirects to `/`)
- [x] Hero section with the banner image under the camouflage header (logo + "Secureye", Login/Signup or Logout).
      The crop keeps the banner's tagline in view; phones show the whole banner. — Phase 7
- [x] **"Secureye Tools"** feature cards: — Phase 7
  - Image File: "Our image detection system utilizes Machine Learning for object tracking in images, ensuring precise recognition to enable rapid responses."
  - Video File: "Our video analysis module utilizes advanced Machine Learning for offline video processing, generating timestamps for any identified object instantaneously."
  - Live Video: "Our live footage module improves surveillance with real-time video analysis, focusing on immediate threat detection and generating alerts for potential danger."
  - Each card button goes to its tool if signed in, otherwise to `/login`.
- [x] **"Image Comparison"** before/after slider (`react-compare-slider` v4, starts at 50%, keyboard step 5%),
      with descriptive alt text. — Phase 7
- [x] **"About Us"**: "Our Vision" and "Our Mission" with their images and text. — Phase 7
- [x] *New:* the home page works on phones (cards stack; the old layout overflowed the screen). — Phase 7
- [x] Footer: brand "Secureye ©", tagline "Safeguarding Sovereignty, Defending the Protectors.",
      social links, contacts (phone, email, city), "Navigate" links to the three tools
      (auth-aware). The placeholder contact details are kept. The social icons linked nowhere; they
      now open the platforms' home pages in a new tab until real profile URLs are supplied
      (`SOCIALS` in `frontend/src/shared/ui/Footer.tsx`). — Phase 6

### 2.2 Shared
- [x] Navbar on tool pages: logo/brand, links Home / Image / Video / Live Video, Login/Signup or Logout.
      *New:* the current page is underlined, and below 900 px the links move into a menu (the old
      layout had no small-screen version). — Phase 6
- [x] Home/auth header (the old `Navigation`): logo + Login/Signup or Logout, on the camouflage strip
      (home) or transparent over the page photo (auth pages). — Phase 6
- [x] 404 page: "Oops! The page you are looking for doesn't exist." + "Return Home" (old text said
      "doesn't exists"). — Phase 6
- [x] Loading fallback while the first route loads, plus a thin progress bar while later pages load. — Phase 6
- [x] Per-page titles ("Secureye | Image Page", and so on), via React 19 `<title>` (replaces the unmaintained `react-helmet`). — Phase 6
- [x] **Old bug fixed:** the meta description said "farm field fertility" (copy-paste leftover); it now describes Secureye. — Phase 6
- [x] Montserrat font (now self-hosted: no Google Fonts request), existing palette and background pattern. — Phase 6
- [x] **Old accessibility bugs fixed:** the global `outline: none` hid keyboard focus (now a visible orange
      focus ring), `transition: all` on every element and a malformed `*: :before` selector are gone,
      animations respect "reduce motion", and buttons are no longer nested inside links. Hover text on
      the orange buttons is black instead of white (white on `#ff5c33` fails WCAG contrast). — Phase 6
- [x] *New:* friendly error screen if a page crashes, which asks for a reload when a new deploy replaced
      the page's code. — Phase 6
- [x] Images converted to WebP and resized: 5.1 MB → 1.4 MB in total (banner 1.4 MB → 279 KB). — Phase 6

---

## 3. Detection models

Old: `Old/prediction/mlModel/bestM.pt` (YOLOv8m, 52 MB), `bestS.pt` (YOLOv8s, 22 MB).

- [x] Both weight files are reused unchanged (SHA-256 identical, `ml-models/`). — Phase 3
- [x] Classes **confirmed by loading both models**: Army Vehicle, Handgun, Helicopter, RPG, Rifle,
      Soldier, Tank. — Phase 3
- [x] `bestM` is used for image and video; `bestS` is used for live (checked in Phases 3–5 and in the Phase 8 browser runs). — Phase 3–5
- [x] Models load once at startup (plus one warm-up inference). — Phase 3
- [x] **Parity verified:** on the old app's own output (`Old/public/afterSliderImage.jpg`) all 5
      old detections are reproduced (box overlap ≥ 0.9, confidence ±0.03). Newer Ultralytics also
      reports 2 extra soldiers at 0.25/0.23 confidence. See `ml-models/README.md`. — Phase 3

---

## 4. Image detection — `/image`

Old: `Old/prediction/views.py::imagePrediction`, `Old/src/components/PredictionSection/Image/Image.jsx`.

| Parameter | Old value |
|---|---|
| Model | `bestM.pt` |
| Confidence threshold | 0.2 |
| NMS IoU | 0.3 |

New: uploads are validated by decoding (JPEG/PNG/WebP/BMP, ≤ 15 MB, ≤ 50 MP), EXIF rotation is
applied, and images are served through signed, expiring links.

- [x] Upload one image; the upload button is disabled once a file is chosen or a prediction is running (and
      while a result is shown, until Reset). The file picker offers the formats the API accepts, and other
      files are refused with a message before uploading. — Phase 8a
- [x] Original image preview next to the annotated result. Images are shown whole instead of stretched to
      the frame. **Old bug fixed:** preview URLs were created on every render and never released. — Phase 8a
- [x] **Predict** runs detection; a spinner is shown while it runs. **Old bug fixed:** a failed upload showed
      nothing (and threw a second error); the reason is now shown. — Phase 3/8a
- [x] Annotated image with boxes and labels, drawn with the **old app's palette and style**
      (Soldier green, Rifle yellow-green, white labels). — Phase 3
- [x] **Report** table columns: `No.`, `Objects` (class), `Confidence` (rounded to a whole %); says
      "No objects detected." when there are none. — Phase 8a
- [x] **Reset** clears the file, the result and the table. — Phase 8a
- [x] **Print** (enabled after a prediction) downloads `image_prediction_report.pdf` (jsPDF, loaded only
      when printing): — Phase 8a
  - Page 1: title "Image Prediction Report", "Original Image", "Predicted Image"
  - Page 2: "Prediction Analysis" grid table (No. / Objects / Confidence), footer "© Secureye"
  - Same layout as before; images keep their proportions (they were stretched to 165 x 110 mm) and are
    scaled to at most 1600 px, which keeps the file under 1 MB for a 2880 x 1920 photo. Any upload
    format works (the original assumed JPEG).
- [x] Both the uploaded image and the annotated image are stored, linked to each other. — Phase 3
- [x] **Old bug fixed:** the stored annotated image was base64 *text* saved with a `.jpg` name, so it couldn't be opened. It's now a real JPEG (tested). — Phase 3
- [x] **Old bug fixed:** confidence was computed as `round(conf, 2) * 100`, which gave floating-point artifacts. The API now returns 0–1 (4 decimals); the UI shows a whole %. — Phase 3
- [x] Each detection is stored per user, with history: `GET /api/v1/images`, `GET/DELETE /api/v1/images/{id}`; other users get 404. — Phase 3
- [x] *New:* a **History** list under the report (thumbnail, file name, date, object count; "Show more"),
      to reopen an earlier result (and print it again) or delete it after confirming. The open result's
      id is in the address (`/image?id=12`), so a reload keeps it. — Phase 8a

---

## 5. Video detection — `/video`

Old: `views.py::VideoProcessor / videoPrediction / videoSSEFrames / fetchTrackData`,
`Video.jsx`, `VideoServerSentEvents.jsx`.

| Parameter | Old value |
|---|---|
| Model | `bestM.pt` |
| Tracker | ByteTrack (`bytetrack.yaml`), `persist=True` |
| Confidence threshold | 0.5 |
| NMS IoU | 0.6 |
| Class-agnostic NMS | yes |
| Sampling | target 10 fps (old code assumed 30 fps input: every 3rd frame) |

- [x] Upload one video (`accept="video/*"`); the original plays in the left frame (the local file
      before upload, the stored copy when reopened); placeholder image until frames arrive. — Phase 8b
- [x] **Predict** starts processing; annotated frames stream to the page while it runs. — Phase 4/8b
      **Old bug fixed:** every frame was appended to the page as another `<img>` (memory grew for the
      whole video); only the latest frame is kept now. *New:* a status line and progress bar
      ("Processing: 57% · 3.40 sec of 6.00 sec · 3 objects so far"), queued state, and Cancel. If the
      connection drops (or the page is reloaded) it reconnects and carries on.
- [x] Each detected track gets an id; the **first-seen timestamp in seconds** is recorded per track. — Phase 4
      Ids now start at 1 for every video (Ultralytics' counter is process-wide). As before, ByteTrack
      confirms a new object on its second sighting, so first-seen is one sample (0.1 s) after it appears
      (objects already in the first frame report 0.0).
- [x] **One clip per track** is saved (the unannotated frames the object appears in, at 10 fps, as before). — Phase 4
- [x] **Report** button (enabled when processing finishes) loads the results table:
      `No.`, `Objects` (class), `Timestamps` (`x.xx sec`), ordered by track id. — Phase 4/8b
- [x] *New:* a **Clip** column plays each object's saved clip in a dialog (H.264, plays in the
      browser), with a Download button. — Phase 8b
- [x] **Reset** clears everything (a job still processing carries on and stays in the history). — Phase 8b
- [x] **Print** downloads `video_prediction_report.pdf`: title "Video Prediction Report", grid table
      (No. / Objects / Timestamps), footer "© Secureye". — Phase 8b
  - **Old bug:** the PDF added two blank pages before the footer. It won't be reproduced.
- [x] **Changed (approved):** processing runs as a background job per user (Celery + Redis), and you follow its progress
      over SSE. *(Old: one global processor and a global `Track` table wiped on every upload;
      processing was started by the SSE GET request after a hard-coded 5 s wait.)* — Phase 4
- [x] **Changed (approved):** sampling uses the video's real timestamps instead of assuming 30 fps (tested at 5/15/25/30/60 fps). — Phase 4
- [x] **Changed (approved):** clips are encoded as H.264 so browsers can play them (old: `mp4v`). — Phase 4
- [x] **Old bug fixed:** temp video files were never deleted. Working files now live in a temp directory removed after each job; clips of failed or cancelled runs are discarded. — Phase 4
- [x] *New:* cancel a queued or running job; delete finished jobs with their files; per-user history;
      upload validation (≤ 500 MB, ≤ 10 min, ≤ 4K, must decode as a video, still images rejected). — Phase 4
- [x] *New:* a **History** list (name, date, length, status, kept up to date while a job runs) to
      reopen a job with its report or delete it; jobs still processing can't be deleted. The open
      job's id is in the address (`/video?id=7`). — Phase 8b

---

## 6. Live detection — `/live` (old address `/webcam` redirects there)

Old: `views.py::userWebcam / webcamSSEFrames`, `Webcam.jsx`, `WebcamServerSentEvents.jsx`.

| Parameter | Old value |
|---|---|
| Model | `bestS.pt` |
| Tracker | ByteTrack, `persist=True` |
| Confidence threshold | 0.4 |
| NMS IoU | 0.0, now **0.45** (approved in Phase 5: 0.0 dropped overlapping same-class objects, about 12% fewer detections) |
| Sampling | every 3rd frame (target 10 fps) |

- [x] **Start** opens a "Choose Webcam" dialog listing the browser's video input devices (after asking
      for camera permission, so their names show) and the server's cameras; **Select** starts detection.
      **Stop** ends it. The dialog is a radio list rather than a dropdown (MUI's grouped Select announces
      group headings as choices to screen readers). — Phase 8c
- [x] An annotated live view is shown while running: in browser mode the page draws the boxes over the
      user's own video (same colours and `id:<n> <class> <conf>` labels as the server's images); camera
      mode shows the server's annotated frames. A status line shows the analysed frame rate and object
      count. **Old bug fixed:** every frame was appended to the page as another `<img>`. — Phase 5/8c
- [x] **Report** table: `No.`, `Objects` (class), `Timestamps` (format `DD-Month-YYYY HH:MM AM/PM`, in the
      viewer's local time), with one row per **newly seen track**. — Phase 5/8c
- [x] *New:* after a session ends, a **Clip** column plays each object's saved clip; **Print** downloads
      `live_video_report.pdf` (the original Live page had no PDF); a **sound on/off** toggle. — Phase 8c
- [x] **Alert sound** (the original `alertSound.mp3`) plays whenever a new object appears (once per
      `new_object` message). — Phase 8c
- [x] **One clip per track** of annotated frames is recorded, grouped by date (old: `media/webcam_footage/<DD Month YYYY>/<time>track_id<id>_<class>.mp4`;
      now `live/<user>/<session>/<YYYY-MM-DD>/<hhmmssam>_track_<id>_<class>.mp4`, H.264). — Phase 5
- [x] **Changed (approved):** by default the browser captures the camera and streams frames to the server
      over WebSocket (scaled to ≤ 960 px wide, JPEG, at most one frame in flight), so it works when
      deployed. A **server-attached camera / RTSP** source is still available (the old behavior). Server
      cameras are registered by an admin (API now; admin UI in Phase 9). — Phase 5/8c
- [x] **Old bugs fixed:** the browser device index didn't match OpenCV's index; the stream started before a
      camera was chosen (the session now starts only after Select); error responses inside the SSE
      generator never reached the client (refusals such as "too many sessions" or a blocked camera are
      shown); concurrent streams shared tracker state. — Phase 5/8c
- [x] **Bug found in Phase 8c and fixed (backend):** leaving the page during a server-camera session was
      logged as a crash and saved with end reason "error" (the disconnect arrived wrapped in an
      ExceptionGroup); it's now saved as "disconnected". — Phase 8c
- [x] *New:* a **History** list of past sessions (date, source, length, how it ended) to reopen one with
      its report and clips (`/live?session=12`) or delete it; running sessions can't be deleted. — Phase 8c
- [x] *New:* live sessions are saved with their report rows and clips (`/live/sessions`); only the newest
      frame is analysed (no growing lag); 2 sessions per user; 60-minute limit; unreachable streams fail
      within 5 s. — Phase 5

---

## 7. Admin

Old: Django admin at `/admin` with `ImageDetectionModel` and `PredictedImage` registered.

- [x] Superuser-only admin site at `/admin` (SQLAdmin): users, image detections (with links to the
      original and annotated images), video jobs and tracks, live sessions and events, cameras. — Phase 9
  - Detections, jobs and sessions are read-only there: deleting them must also delete their stored
    files, which the API (and the user's History lists) does. Users can be activated, deactivated and
    given or denied admin rights, but not created (CLI) or deleted (their files would be orphaned).
  - Cameras for live detection can be added, edited and removed (this was API-only until now).
  - Login: superusers only, 5 attempts a minute, an 8-hour signed cookie limited to `/admin`
    (`SameSite=Strict`, HTTPS-only in production). Rights are re-checked on every request, so revoking
    them or changing the password ends the admin session at once.

---

## 8. Not carried over

These existed in `Old/` but have no user-facing function; they are dropped:

- `WebcamIndex` table: replaced by the source selection in the live WebSocket handshake.
- The `csrf` Redux slice (it stored an `X-CSRFToken` header the server never sent).
- Unused Python dependencies (pandas, seaborn, matplotlib, social-auth, sympy, and others).
