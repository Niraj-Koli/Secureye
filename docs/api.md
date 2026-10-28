# API reference

The API is served under `/api/v1`: on <http://localhost:8000> in development, and through the
web app's Nginx on <http://localhost:8080> in the Docker setup. In development the interactive
documentation (Swagger UI) is at <http://localhost:8000/docs> and the schema at
`/api/v1/openapi.json`; both are turned off in production. The same schema is committed as
`frontend/openapi.json`.

## Conventions

- **Authentication:** send `Authorization: Bearer <access token>`. Access tokens come from
  `POST /auth/login` or `POST /auth/refresh` and last 15 minutes.
- **Refresh token:** an `httpOnly`, `SameSite=Lax` cookie named `secureye_refresh`, scoped to
  `/api/v1/auth`. It is rotated on every refresh. Replaying an already-used refresh token revokes
  that whole login session, so send one refresh request at a time.
- **Errors** share one JSON shape: `{"detail": <message or list>, "code": "<machine code>"}`.
  Common codes: `not_authenticated` (401), `forbidden` (403), `not_found` (404),
  `validation_error` (422, `detail` lists the fields), `rate_limited` (429), `internal_error`
  (500). Endpoints add their own codes, such as `invalid_or_expired_link`.
- **Request IDs:** every response has an `X-Request-ID` header. 500 responses also include it in
  the body, and it appears on every log line for that request.
- **Lists** are paged with `limit` and `offset` and return `{items, total, limit, offset}`,
  newest first.
- **Stored files** (images, videos, clips) are returned as signed links,
  `/api/v1/files/<key>?expires=…&signature=…`, valid for an hour. They need no header, so they work
  in `<img>` and `<video>` tags.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness: `{"status": "ok"}` |
| GET | `/health/ready` | none | Readiness: database reachable, or 503 |
| POST | `/auth/signup` | none | `{name, email, password}`. Creates an inactive account and emails an activation link. |
| POST | `/auth/activate` | none | `{uid, token}` from the link. Activates the account. |
| POST | `/auth/activate/resend` | none | `{email}`. Resends the activation email; always 202. |
| POST | `/auth/login` | none | `{email, password}`. Returns `{access_token, token_type, expires_in}` and sets the refresh cookie. |
| POST | `/auth/refresh` | cookie | Rotates the refresh cookie and returns a new access token. |
| POST | `/auth/logout` | cookie | Revokes the session and clears the cookie. |
| POST | `/auth/password-reset` | none | `{email}`. Emails a reset link; always 202. |
| POST | `/auth/password-reset/confirm` | none | `{uid, token, new_password, re_new_password}`. Sets the password, signs out every session and sends a confirmation email. |
| GET | `/users/me` | bearer | The signed-in user. |
| POST | `/images` | bearer | Multipart field `image`. Runs detection and returns the result with links to both images. |
| GET | `/images` | bearer | Your image detections. |
| GET | `/images/{id}` | bearer | One image detection. |
| DELETE | `/images/{id}` | bearer | Deletes a detection and its files. |
| POST | `/videos` | bearer | Multipart field `video`. Validates and stores the video and queues a job (202). |
| GET | `/videos` | bearer | Your video jobs. |
| GET | `/videos/{id}` | bearer | A job's status and its tracked objects, with clip links. |
| GET | `/videos/{id}/events` | bearer | Progress stream (Server-Sent Events, below). |
| POST | `/videos/{id}/cancel` | bearer | Stops a queued or running job. |
| DELETE | `/videos/{id}` | bearer | Deletes a finished job, its video and clips. |
| GET | `/live/cameras` | bearer | Enabled server cameras (id and name). |
| GET | `/live/sessions` | bearer | Your live sessions. |
| GET | `/live/sessions/{id}` | bearer | A session with its report rows (objects first seen, with clip links). |
| DELETE | `/live/sessions/{id}` | bearer | Deletes a finished session and its clips. |
| GET, POST | `/live/admin/cameras` | superuser | Lists all cameras with their sources; registers one (`{name, source, enabled}`). |
| DELETE | `/live/admin/cameras/{id}` | superuser | Removes a camera. |
| WS | `/live/ws` | first message | Live detection (protocol below). |
| GET | `/files/{key}` | signed link | Downloads a stored file. A missing, invalid or expired signature gives 403. |

Every user-owned resource is filtered by its owner: another user's ID returns 404.

### Upload limits

| Upload | Accepted | Limits |
|---|---|---|
| Image | JPEG, PNG, WebP, BMP. The file is decoded to check it; the name and Content-Type aren't trusted. | 15 MB, 50 megapixels |
| Video | Anything FFmpeg (PyAV) can decode with a video stream. | 500 MB, 10 minutes, 3840×2160 |

## Rate limits

Per client IP address and endpoint, with counters in Redis. Exceeding a limit returns 429 with a
`Retry-After` header.

| Endpoint | Limit |
|---|---|
| `POST /auth/signup` | 5 per minute |
| `POST /auth/activate` | 10 per minute |
| `POST /auth/activate/resend` | 3 per minute |
| `POST /auth/login` | 10 per minute |
| `POST /auth/refresh` | 30 per minute |
| `POST /auth/password-reset` | 5 per minute |
| `POST /auth/password-reset/confirm` | 10 per minute |
| `POST /images` | 30 per minute |
| `POST /videos` | 10 per minute |

## Video progress events (SSE)

`GET /videos/{id}/events` needs the `Authorization` header, so browsers read it with `fetch` (the
standard `EventSource` can't send headers). Each event's `data` is JSON with a `type` field:

| Event | Data |
|---|---|
| `status` | Sent first: `{status, progress}`. Late or reconnecting clients learn where the job is. |
| `progress` | `{progress (0–1), time_seconds, tracks_found}` |
| `frame` | `{image (base64 JPEG), time_seconds}`: the latest annotated frame |
| `completed`, `failed`, `cancelled` | `{status, error}`. The stream ends after this event. |

If no event arrives for 20 seconds, the API re-reads the job from the database, so the stream ends
even if the worker died without reporting.

## Live detection WebSocket

`/api/v1/live/ws`. Connections from origins outside `CORS_ORIGINS` are refused. The full protocol is
documented in `backend/app/api/live_socket.py`.

**Client to server**

1. Within 10 seconds, a JSON start message:
   `{"type": "start", "token": "<access token>", "source": "browser"}` or
   `{"type": "start", "token": "…", "source": "camera", "camera_id": 3}`.
   The token goes in the message rather than the URL so it never appears in access logs.
2. Browser source: binary messages, each one camera frame as an encoded image (the web app sends
   JPEG), up to 2 MB and 1920×1080. Larger or undecodable frames get an `error` message and are
   skipped.
3. `{"type": "stop"}` to end the session, or just close the socket.

**Server to client** (JSON text messages)

| Message | Fields |
|---|---|
| `ready` | `session_id, source, model, confidence, iou, target_fps`; browser clients send frames at `target_fps` |
| `detections` | `frame, width, height, inference_ms, dropped_frames, objects: [{track_id, class_name, confidence, box: {x1, y1, x2, y2}}]` |
| `new_object` | `event_id, track_id, class_name, confidence, detected_at`, sent once per newly seen object |
| `error` | `code, detail`, non-fatal (for example `frame_too_large`) |
| `ended` | `reason`; the socket then closes |

With a server camera, each `detections` message is followed by a binary message holding the
annotated JPEG. Only the newest frame is analysed: frames arriving while the model is busy are
dropped and counted in `dropped_frames`.

**Close codes** for refused connections:

| Code | Meaning |
|---|---|
| 4400 | Bad start message (not JSON, wrong source, missing `camera_id`) |
| 4401 | No start message in time, or an invalid or expired token |
| 4403 | Origin not allowed |
| 4404 | Camera not found |
| 4409 | Too many live sessions for this user (2 at a time) |
| 1013 | Models not loaded; try again later |
