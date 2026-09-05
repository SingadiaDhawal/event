# Event Photo Finder

A free, selfie-based "find your event photos" system:

- **Repo root** (`index.html`, `app.js`, `config.js`, `gallery_index.json`,
  `.nojekyll`) — the permanent customer-facing site, deployed with
  **GitHub Pages**. It never changes when the backend restarts.
- **`colab/`** — the backend that runs in **Google Colab**: downloads the public
  gallery from Google Drive, loads a precomputed face-embedding index, and
  serves a Flask API over a **Cloudflare Quick Tunnel**.

```
                         CUSTOMER
                            │  QR code
                            ▼
        https://<you>.github.io/event/           (permanent)
                            │  reads BACKEND_URL from config.js
                            ▼
                Cloudflare Quick Tunnel           (changes on restart)
                            │
                            ▼
                     Google Colab (Flask)
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
     gallery_index.json (GitHub)   Public Google Drive folder
     (precomputed face embeddings)  (original photos)
```

## Why the gallery is precomputed

Only the customer's **selfie** is detected and embedded at request time.
Every gallery photo's face embedding is computed **once**, ahead of time,
and stored in `gallery_index.json`. Matching a selfie against the
whole gallery is then a single NumPy matrix multiplication, not thousands
of face detections.

```
Selfie → detect 1 face → 1 embedding → compare vs precomputed matrix → results
```

## Important: what "one run" actually means

Clicking *Run all* in Colab starts a server that keeps working **as long as
that Colab session stays connected** — it does not exit on its own, and it
does not need to be re-run to keep serving customers.

What it can't do is run forever unattended. Free Google Colab disconnects
idle sessions (roughly ~90 minutes idle) and caps total session length
(roughly ~12 hours), and when that happens the gallery, Flask server, and
tunnel all stop. There's no way around this on free Colab — when it
disconnects, you reopen the notebook and click *Run all* again. What this
setup **does** automate is the annoying part: every time you restart, the
notebook pushes the new backend URL to `config.js` on GitHub for you, so
your permanent GitHub Pages URL and QR code keep working without you
copy-pasting anything.

If you eventually need true 24/7 uptime without babysitting Colab, the
backend (the Flask + face-matching part) would need to move to an
always-on host (e.g. a small paid VM, Render, Railway, etc.) — that's a
separate step from anything here.

## 0. Create a GitHub token (repo is private)

Your repo is private, so the backend needs a token to read `gallery_index.json`
and to push updates to `config.js`.

1. Go to **github.com/settings/tokens** → **Fine-grained tokens** → **Generate new token**.
2. Repository access: **only select repositories** → choose this repo (`event`).
3. Permissions → **Repository permissions → Contents → Read and write**.
4. Generate the token and copy it (you'll only see it once).
5. In Colab, click the **key icon** in the left sidebar (**Secrets**), add a
   secret named `GITHUB_TOKEN` with that value, and toggle **Notebook access** on.

Never paste the token directly into the notebook or commit it to the repo.

## 1. Deploy the website (one-time)

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch**
   → branch `main`, folder `/ (root)`.
3. Note: GitHub Pages serves a **private** repo's Pages site itself as
   public once published — anyone with the URL can view the *site*, even
   though the repo's source code stays private. If you want the source
   code itself hidden, keep the repo private; the Pages content is public
   either way once you turn Pages on.
4. Your permanent customer URL will be:
   `https://<your-username>.github.io/<repo-name>/`
   Put this in your QR code — **never** the Colab/Cloudflare URL.

## 2. Prepare the gallery

1. Upload event photos to a Google Drive folder shared as
   **"Anyone with the link" → Viewer**.
2. In `colab/event_photo_finder_backend.py`, set:
   ```python
   DEFAULT_GALLERY_URL = "https://drive.google.com/drive/folders/XXXXXXXX"
   ```
3. Also check `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_INDEX_PATH`, and
   `GITHUB_CONFIG_PATH` match where your files actually live in the repo.

## 3. Build the face index (once per gallery)

1. In the Colab script, set:
   ```python
   BUILD_NEW_INDEX = True
   USE_GITHUB_INDEX = False
   ```
2. Run the notebook. It downloads the gallery, detects every face,
   computes embeddings, and writes `/content/gallery_index.json`.
3. Download that file from Colab's file browser and upload it to your
   repo at `GITHUB_INDEX_PATH` (overwriting the placeholder), then commit.
4. Set `BUILD_NEW_INDEX = False` and `USE_GITHUB_INDEX = True` so future
   runs just download the precomputed index instead of recomputing it.

> For large galleries (tens of thousands of photos), consider switching
> the index to a compressed `.npz` embedding matrix + a small metadata
> JSON instead of one large JSON file.

## 4. Run the backend

1. Open `colab/event_photo_finder_backend.py` in Google Colab
   (paste it into a notebook, or split at the `# %% [n]` markers into
   separate cells).
2. Make sure the `GITHUB_TOKEN` secret (step 0) is set and enabled.
3. Run all cells. Near the end it starts a Cloudflare Quick Tunnel,
   detects the new `https://*.trycloudflare.com` URL, and — because
   `AUTO_UPDATE_GITHUB_CONFIG = True` — pushes that URL into `config.js`
   on GitHub automatically. GitHub Pages picks up the change within a
   minute or two, no manual copy-paste needed.
4. Every time Colab disconnects and you need to bring it back, just
   reopen the notebook and *Run all* again — same process repeats.

## Letting visitors search their own Google Drive folder

The site now has a second option beyond "search this event's gallery":
a visitor can paste their own public Google Drive folder link and search
that instead. This is handled carefully because it runs an arbitrary,
customer-supplied download on your Colab server:

- Only real `https://drive.google.com/drive/folders/...` links are accepted
  (checked on both the frontend and backend).
- Only the first **150** images found in the folder are scanned
  (`MAX_CUSTOM_GALLERY_IMAGES` in the backend script).
- A simple per-IP limit allows **3 custom-gallery searches per 10 minutes**
  (`CUSTOM_GALLERY_RATE_LIMIT_*` in the backend script).
- Custom galleries are **not** added to your permanent index or pushed to
  GitHub — they're downloaded fresh, scanned, and then their files are
  deleted automatically ~30 minutes after the search finishes.
- Because nothing is precomputed for a custom folder, these searches are
  noticeably slower than searching the event's own indexed gallery
  (every photo has to be detected and embedded on the spot).

If you don't want this option exposed at all, remove the "Search my own
Google Drive folder instead" radio button and its input from `index.html`
— the backend route still works either way and simply defaults to the
event's own gallery when no `gallery_url` is sent.

## Rebuilding the index after adding photos

The precomputed index only knows about the photos it was built from.
After adding photos to Drive, repeat step 3 to rebuild and re-publish
`gallery_index.json`.

## Files

```
event/
├── README.md
├── index.html                        # GitHub Pages site
├── app.js
├── config.js                         # <- auto-updated by Colab on each run
├── gallery_index.json                # <- precomputed face embeddings
├── .nojekyll
└── colab/
    └── event_photo_finder_backend.py # <- paste into Google Colab
```
