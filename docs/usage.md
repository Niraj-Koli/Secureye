# User guide

Secureye detects seven classes, **Army Vehicle, Handgun, Helicopter, RPG, Rifle, Soldier and
Tank**, in photos, uploaded videos and live camera feeds. The detection pages need a signed-in
user. Visitors who open them are sent to the login page and brought back afterwards.

URLs below assume the Docker setup (<http://localhost:8080>). In development the web app is at
<http://localhost:5173>.

## Account

| Page | What happens |
|---|---|
| **Signup** (`/signup`) | Enter a name (letters, digits and spaces), an email and a password. Passwords need at least 8 characters, no spaces, and must not be common, all digits, or similar to your name or email. An activation email is sent. |
| **Activation** (`/activate/:uid/:token`, the link in the email) | Activates the account, then shows the result. Each link works once and expires after 48 hours. |
| **Login** (`/login`) | Email and password. Inactive accounts can't log in until they are activated. The session survives page reloads and renews itself in the background. |
| **Reset password** (`/reset-password`) | Enter your email to get a reset link. The page gives the same answer whether or not the email has an account. |
| **New password** (`/password/reset/confirm/:uid/:token`, the link in the email) | Enter and confirm the new password. Every signed-in session is signed out, and a "password changed" email is sent. Links expire after 2 hours. |
| **Logout** | The navigation bar's logout button ends the session and returns you home. |

In development and in the Docker setup, every email arrives in Mailpit at <http://localhost:8025>.

## Home

The home page shows the banner, a before/after slider comparing a photo with its detections, the
About section (mission and vision), and cards for the three tools. The cards lead to the login page
when you are not signed in.

## Image detection (`/image`)

1. Click **Image** and pick a JPEG, PNG, WebP or BMP file of up to 15 MB. It appears under
   *Original image*.
2. Click **Predict**. The annotated photo appears under *Predicted image* (usually under a second on
   a CPU), and the **Report** table lists each object with its confidence.
3. Click **Print** to download a PDF report with both images and the table.
4. Click **Reset** to start again.

Your past detections are listed below the report. **Open** shows one again, **Delete** removes it
and its stored files, and **Show more** loads older entries.

## Video detection (`/video`)

1. Click **Video** and pick a video of up to 500 MB and 10 minutes (MP4, MOV, WebM, MKV or AVI; the
   server checks the file itself, not its name). It plays under *Original video*.
2. Click **Predict**. The video is uploaded and processed in the background. A progress bar,
   how much of the video is done, the number of objects found so far and the latest annotated
   frame (*Detection preview*) update as the work goes on. **Cancel processing** stops the job.
3. Closing the page doesn't stop processing. Come back later and open the job from the history.
4. When processing has finished, click **Report**. The table lists each tracked object with its
   class and the time it first appeared in the video. **Play** opens the clip recorded for that
   object, which you can also download.
5. Click **Print** for a PDF report.

Processing on a CPU takes several times the video's length (about 7 s per second of 720p video on a
typical laptop). Finished, failed and cancelled jobs can be deleted from the history; running jobs
can't.

## Live detection (`/live`)

1. Click **Start** and choose a camera:
   - **This device:** your browser's cameras. The browser asks for permission the first time.
     Cameras only work on `localhost` or over HTTPS.
   - **Server cameras:** cameras attached to the server, registered by an admin.
2. Boxes and labels appear over the video as objects are detected. With a browser camera, the boxes
   are drawn over your own video; with a server camera, the server sends back annotated frames.
3. Each newly seen object adds a row to the **Report** (class and time) and plays an alert
   sound. The speaker button turns the sound on or off.
4. Click **Stop** to end the session. Sessions also end after 60 minutes or if the connection or
   camera stops. Each session is saved with a clip of every object it saw.
5. Click **Print** for a PDF report. Past sessions are listed below. **Open** shows a session's
   report with its clips, and **Delete** removes it.

The old `/webcam` address leads to `/live`. Each user can run two live sessions at a time.

## Admin site (`/admin`)

Superusers can browse users, image detections, video jobs and their tracks, live sessions and
their events, and register **server cameras** for live detection. A camera's source is a device
index on the server (`0`, `1`, …) or a stream URL (for example RTSP). The login form calls the
email "Username".

Create a superuser from the command line:

```bash
docker compose exec api python -m app.cli create-superuser --email you@example.com --name "You"   # Docker
cd backend && uv run python -m app.cli create-superuser --email you@example.com --name "You"     # development
```

Records that have stored files are read-only in the admin site. Delete them in the app so their
files are deleted too.

## Using the API directly

The REST API is described in the [API reference](api.md), and in development its interactive
documentation is at <http://localhost:8000/docs>. Example with `curl`, run from the repository root
against the Docker setup (use `http://localhost:8000` for the development API):

```bash
# Log in (the account must be activated) and keep the access token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password"}' | python -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

# Detect objects in a photo
curl -s -X POST http://localhost:8080/api/v1/images \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@e2e/fixtures/soldiers.jpg"
```
