/* =========================================================
   Lumen — app logic
   Backend contract (unchanged, matches event_seprate.ipynb):
     POST  {API_BASE}/api/start-scan   (FormData: selfies[], gallery_url?)
     GET   {API_BASE}/api/job/{id}
     GET   {API_BASE}/api/image/{id}/{idx}
     GET   {API_BASE}/api/download/{id}/{idx}

   NOTE: every interactive element in index.html calls these
   functions directly via onclick/onchange attributes (same
   pattern as the known-working version) instead of relying on
   a single init()/DOMContentLoaded wiring pass. That way one
   broken binding can never silently disable every other button.
   ========================================================= */

var API_BASE = String((typeof CONFIG !== "undefined" && CONFIG.BACKEND_URL) || "").replace(/\/+$/, "");

function $(id) { return document.getElementById(id); }

/* ---------- THEMES ---------- */
var THEMES = [
  { id: "light",    name: "Light",    desc: "Clean & bright",        bg: "#f5f6fa", primary: "#4f46e5" },
  { id: "dark",     name: "Dark",     desc: "Easy on the eyes",      bg: "#0b0e17", primary: "#8b8ffc" },
  { id: "midnight", name: "Midnight", desc: "Deep blue, sky accent", bg: "#040914", primary: "#38bdf8" },
  { id: "sunset",   name: "Sunset",   desc: "Warm & golden",         bg: "#fff8f1", primary: "#ea580c" },
  { id: "forest",   name: "Forest",   desc: "Dark green, calm",      bg: "#0a120e", primary: "#34d399" },
  { id: "rose",     name: "Rose",     desc: "Soft & elegant",        bg: "#fdf5f8", primary: "#db2777" }
];
var THEME_KEY = "lumen-theme";

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

function selectTheme(id) {
  applyTheme(id);
  closeThemeMenu();
}

function applyTheme(id) {
  var theme = null;
  for (var i = 0; i < THEMES.length; i++) { if (THEMES[i].id === id) { theme = THEMES[i]; break; } }
  if (!theme) theme = THEMES[0];
  document.documentElement.setAttribute("data-theme", theme.id);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.primary);
  if ($("theme-name")) $("theme-name").textContent = theme.name;
  try { localStorage.setItem(THEME_KEY, theme.id); } catch (e) {}
  renderThemeList();
}

function renderThemeList() {
  var list = $("theme-list");
  if (!list) return;
  var active = currentTheme();
  list.innerHTML = "";
  THEMES.forEach(function (t) {
    var li = document.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(t.id === active));
    li.className = "theme-item";
    li.tabIndex = 0;
    li.setAttribute("onclick", "selectTheme('" + t.id + "')");
    li.innerHTML =
      '<span class="theme-swatch" style="background:' + t.bg + '; --sw-primary:' + t.primary + '"></span>' +
      '<span class="theme-item-text">' + t.name + '<small>' + t.desc + '</small></span>' +
      '<svg class="theme-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    list.appendChild(li);
  });
}

function openThemeMenu() {
  if (!$("theme-list")) return;
  $("theme-list").hidden = false;
  $("theme-trigger").setAttribute("aria-expanded", "true");
  document.addEventListener("click", closeThemeMenuOnOutsideClick);
}
function closeThemeMenu() {
  if (!$("theme-list")) return;
  $("theme-list").hidden = true;
  $("theme-trigger").setAttribute("aria-expanded", "false");
  document.removeEventListener("click", closeThemeMenuOnOutsideClick);
}
function toggleThemeMenu() {
  if (!$("theme-list")) return;
  if ($("theme-list").hidden) openThemeMenu(); else closeThemeMenu();
}
function closeThemeMenuOnOutsideClick(e) {
  var menu = $("theme-menu");
  if (menu && !menu.contains(e.target)) closeThemeMenu();
}

/* ---------- STATE ---------- */
var selectedFiles = [];
var currentJobId = null;
var cameraStream = null;
var useFrontCamera = true;
var isMultiUpload = false;
var isMultiCam = false;
var cachedResults = [];

var guideSteps = [
  { pose: "front", label: "Front face" },
  { pose: "left",  label: "Left profile" },
  { pose: "right", label: "Right profile" },
  { pose: "up",    label: "Looking up" },
  { pose: "down",  label: "Looking down" }
];
var currentStepIndex = 0;
var guidedBlobs = [];

/* ---------- HELPERS ---------- */
function setFindEnabled(enabled) {
  if ($("find-button")) $("find-button").disabled = !enabled;
}

function show(el, on) {
  if (!el) return;
  el.classList.toggle("show", !!on);
}

var toastTimer;
function toast(msg) {
  var el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
}

function showError(msg) {
  var el = $("error");
  if (!el) return;
  el.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><span></span>';
  el.querySelector("span").textContent = msg;
  show(el, true);
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function hideError() { show($("error"), false); }

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
  });
}

/* ---------- TABS ---------- */
function switchTab(tab) {
  var isUpload = tab === "upload";
  $("upload-tab").classList.toggle("active", isUpload);
  $("camera-tab").classList.toggle("active", !isUpload);
  $("upload-tab").setAttribute("aria-selected", String(isUpload));
  $("camera-tab").setAttribute("aria-selected", String(!isUpload));
  $("upload-content").classList.toggle("active", isUpload);
  $("camera-content").classList.toggle("active", !isUpload);
  if ($("tabs")) $("tabs").dataset.active = tab;

  if (!isUpload) startCamera();
  else stopCamera();
}

/* ---------- UPLOAD ---------- */
function toggleUploadMode() {
  var el = document.querySelector('input[name="upload-mode"]:checked');
  isMultiUpload = !!el && el.value === "multiple";
  var fileInput = $("file-input");
  fileInput.value = "";
  if (isMultiUpload) fileInput.setAttribute("multiple", "multiple");
  else fileInput.removeAttribute("multiple");
  $("upload-label-text").textContent = isMultiUpload ? "Choose photos from multiple angles" : "Choose your photo";
  selectedFiles = [];
  renderUploadPreviews();
  setFindEnabled(false);
}

function acceptFiles(fileList) {
  var images = Array.prototype.filter.call(fileList, function (f) { return f.type.indexOf("image/") === 0; });
  if (!images.length) { showError("Please choose image files (JPG, PNG, HEIC)."); return; }
  selectedFiles = isMultiUpload ? selectedFiles.concat(images) : [images[0]];
  renderUploadPreviews();
  setFindEnabled(true);
  hideError();
  toast(selectedFiles.length + " photo" + (selectedFiles.length > 1 ? "s" : "") + " ready");
}

function handleFileSelect(event) {
  var files = event.target.files;
  if (!files || !files.length) return;
  acceptFiles(files);
  event.target.value = "";
}

function buildPreviewItem(opts) {
  var item = document.createElement("div");
  item.className = "preview-item";

  var img = document.createElement("img");
  img.src = opts.src;
  img.alt = opts.label;
  img.addEventListener("click", function () { openLightbox(opts.src); });

  var badge = document.createElement("div");
  badge.className = "preview-badge";
  badge.textContent = opts.label;

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "preview-delete";
  btn.title = opts.removeTitle;
  btn.setAttribute("aria-label", opts.removeTitle);
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  btn.addEventListener("click", function (e) { e.stopPropagation(); opts.onRemove(); });

  item.appendChild(img);
  item.appendChild(badge);
  item.appendChild(btn);
  return item;
}

function renderUploadPreviews() {
  var container = $("upload-preview");
  container.innerHTML = "";
  container.classList.toggle("has-items", selectedFiles.length > 0);

  selectedFiles.forEach(function (file, idx) {
    container.appendChild(buildPreviewItem({
      src: URL.createObjectURL(file),
      label: "Image " + (idx + 1),
      removeTitle: "Remove image",
      onRemove: function () {
        selectedFiles.splice(idx, 1);
        renderUploadPreviews();
        if (!selectedFiles.length) setFindEnabled(false);
      }
    }));
  });
}

/* ---------- CAMERA ---------- */
function renderSteps() {
  var ol = $("cam-steps");
  if (!ol) return;
  ol.hidden = !isMultiCam;
  ol.innerHTML = "";
  if (!isMultiCam) return;
  guideSteps.forEach(function (s, i) {
    var li = document.createElement("li");
    li.textContent = s.label;
    if (i < currentStepIndex) li.classList.add("done");
    else if (i === currentStepIndex) li.classList.add("current");
    ol.appendChild(li);
  });
}

function setInstruction(text) {
  var el = $("camera-instruction");
  if (!el) return;
  el.hidden = !text;
  if (text) el.textContent = text;
}

function toggleCamMode() {
  var el = document.querySelector('input[name="cam-mode"]:checked');
  isMultiCam = !!el && el.value === "multiple";
  currentStepIndex = 0;
  guidedBlobs = [];
  selectedFiles = [];
  renderCamPreviews();
  renderSteps();
  setInstruction(isMultiCam ? guideSteps[0].label : "");
  if ($("capture-btn")) $("capture-btn").disabled = false;
  setFindEnabled(false);
  if (!cameraStream) startCamera();
}

function renderCamPreviews() {
  var container = $("cam-preview");
  container.innerHTML = "";
  container.classList.toggle("has-items", guidedBlobs.length > 0);

  guidedBlobs.forEach(function (blob, idx) {
    container.appendChild(buildPreviewItem({
      src: URL.createObjectURL(blob),
      label: (isMultiCam && guideSteps[idx]) ? guideSteps[idx].label : ("Snapshot " + (idx + 1)),
      removeTitle: "Retake",
      onRemove: function () {
        guidedBlobs.splice(idx, 1);
        selectedFiles = guidedBlobs;
        currentStepIndex = guidedBlobs.length;
        renderCamPreviews();
        renderSteps();
        if (isMultiCam) {
          setInstruction(guideSteps[currentStepIndex] ? guideSteps[currentStepIndex].label : "");
          if ($("capture-btn")) $("capture-btn").disabled = false;
          if (!cameraStream) startCamera();
        }
        if (!guidedBlobs.length) setFindEnabled(false);
      }
    }));
  });
}

function startCamera() {
  hideError();
  stopCamera();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError("Camera is not supported in this browser. You can still upload photos instead.");
    return;
  }
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: useFrontCamera ? "user" : "environment", width: { ideal: 1280 }, height: { ideal: 1280 } },
    audio: false
  }).then(function (stream) {
    cameraStream = stream;
    $("video").srcObject = stream;
    var vf = document.querySelector(".viewfinder");
    if (vf) vf.classList.toggle("rear", !useFrontCamera);
  }).catch(function () {
    showError("Camera access was denied or is unavailable. You can still upload photos instead.");
  });
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(function (t) { t.stop(); });
    cameraStream = null;
  }
}

function toggleCameraFacing() {
  useFrontCamera = !useFrontCamera;
  startCamera();
}

function flashViewfinder() {
  var f = $("vf-flash");
  if (!f) return;
  f.classList.remove("on");
  void f.offsetWidth;
  f.classList.add("on");
}

function handleCaptureAction() {
  var video = $("video");
  var canvas = $("canvas");
  if (!video.videoWidth) { showError("Camera is not ready yet. Please allow access and try again."); return; }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  var ctx = canvas.getContext("2d");
  if (useFrontCamera) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0);
  flashViewfinder();

  canvas.toBlob(function (blob) {
    if (!isMultiCam) {
      guidedBlobs = [blob];
      selectedFiles = guidedBlobs;
      renderCamPreviews();
      setFindEnabled(true);
      toast("Snapshot captured");
      return;
    }
    if (currentStepIndex >= guideSteps.length) return;

    guidedBlobs.push(blob);
    currentStepIndex++;
    renderCamPreviews();
    renderSteps();

    if (currentStepIndex < guideSteps.length) {
      setInstruction(guideSteps[currentStepIndex].label);
      toast(currentStepIndex + "/" + guideSteps.length + " captured — next: " + guideSteps[currentStepIndex].label);
    } else {
      selectedFiles = guidedBlobs;
      setInstruction("All angles captured");
      $("capture-btn").disabled = true;
      setFindEnabled(true);
      stopCamera();
      toast("All 5 angles captured — ready to search");
    }
  }, "image/jpeg", 0.92);
}

/* ---------- GALLERY SOURCE ---------- */
function updateGallerySource() {
  var el = document.querySelector('input[name="gallery-source"]:checked');
  var isCustom = !!el && el.value === "custom";
  $("custom-gallery-input").hidden = !isCustom;
  if (isCustom) $("gallery-url-input").focus();
}
function getSelectedGalleryUrl() {
  var el = document.querySelector('input[name="gallery-source"]:checked');
  var isCustom = !!el && el.value === "custom";
  return isCustom ? $("gallery-url-input").value.trim() : "";
}

/* ---------- SAFE FETCH ---------- */
// Parses JSON only if the response actually looks like JSON. If the backend
// (or the Cloudflare tunnel in front of it) returns an HTML error page, a
// 404, or is simply offline, this throws a clear, human-readable error
// instead of letting res.json() fail with "Unexpected token '<'".
function fetchJson(url, options) {
  return fetch(url, options).then(function (res) {
    var contentType = res.headers.get("content-type") || "";
    if (contentType.indexOf("application/json") === -1) {
      if (res.status === 0) {
        throw new Error("Can't reach the backend. Check your internet connection.");
      }
      throw new Error(
        "Backend didn't return JSON (HTTP " + res.status + "). " +
        "The Colab tunnel may be offline or the URL in config.js is stale — " +
        "re-run the notebook and refresh this page."
      );
    }
    return res.json().then(function (data) {
      if (!res.ok && !("success" in data)) {
        throw new Error(data.message || ("Request failed (HTTP " + res.status + ")."));
      }
      return data;
    });
  }).catch(function (err) {
    if (err instanceof TypeError) {
      // fetch() itself failed: DNS error, CORS block, tunnel fully down, etc.
      throw new Error("Can't reach the backend at " + API_BASE + ". Check that the Colab notebook is still running.");
    }
    throw err;
  });
}

/* ---------- SEARCH FLOW ---------- */
function setProgress(pct, text) {
  var p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  $("progress-bar").style.width = p + "%";
  $("progress-pct").textContent = p + "%";
  $("progress").setAttribute("aria-valuenow", String(p));
  if (text) $("status-text").textContent = text;
}

function startSearch() {
  hideError();
  if (!API_BASE) {
    showError("Backend URL is not configured (config.js didn't load, or CONFIG.BACKEND_URL is empty). Check that config.js loads before app.js.");
    return;
  }
  if (!selectedFiles.length) { showError("Please add at least one reference photo first."); return; }

  var galleryUrl = getSelectedGalleryUrl();
  var el = document.querySelector('input[name="gallery-source"]:checked');
  var isCustom = !!el && el.value === "custom";
  if (isCustom && !galleryUrl) { showError("Please paste a Google Drive folder link, or switch to the event gallery."); return; }

  var displayName = $("user-name").value.trim() || "Guest";
  $("greeting-title").textContent = "Hello, " + displayName + "!";
  $("user-avatar").textContent = displayName.charAt(0).toUpperCase();

  $("input-card").hidden = true;
  show($("status"), true);
  setProgress(0, "Uploading your reference images…");
  window.scrollTo({ top: 0, behavior: "smooth" });

  var formData = new FormData();
  selectedFiles.forEach(function (file, idx) { formData.append("selfies", file, "pose_" + idx + ".jpg"); });
  if (galleryUrl) formData.append("gallery_url", galleryUrl);

  fetchJson(API_BASE + "/api/start-scan", { method: "POST", body: formData })
    .then(function (data) {
      if (!data.success) throw new Error(data.message || "Could not start the scan.");
      currentJobId = data.job_id;
      pollJob();
    })
    .catch(function (e) {
      showError(e.message || "Something went wrong while starting the scan.");
      resetToInput();
    });
}

function pollJob() {
  fetchJson(API_BASE + "/api/job/" + currentJobId)
    .then(function (job) {
      setProgress(job.progress, job.message || "Matching faces across the gallery…");
      if (job.status === "completed") {
        showResults(job.results || []);
      } else if (job.status === "error") {
        throw new Error(job.message || "The scan failed.");
      } else {
        setTimeout(pollJob, 500);
      }
    })
    .catch(function (e) {
      showError(e.message || "Lost connection to the scan.");
      resetToInput();
    });
}

function showResults(results) {
  cachedResults = results;
  hideError();
  show($("status"), false);
  show($("results"), true);
  $("stats-badge").textContent = results.length + " match" + (results.length === 1 ? "" : "es");
  if ($("download-all-btn")) $("download-all-btn").disabled = !results.length;

  var gallery = $("gallery");
  gallery.innerHTML = "";

  if (!results.length) {
    gallery.innerHTML = '<div class="empty"><strong>No matches found</strong>Try adding photos from more angles or in better lighting.</div>';
    return;
  }

  results.forEach(function (item, idx) {
    var src = API_BASE + "/api/image/" + currentJobId + "/" + idx;
    var dl = API_BASE + "/api/download/" + currentJobId + "/" + idx;
    var name = escapeHtml(item.file_name || ("photo_" + (idx + 1) + ".jpg"));
    var card = document.createElement("div");
    card.className = "photo-card";
    card.innerHTML =
      '<img src="' + src + '" loading="lazy" alt="' + name + '">' +
      '<div class="photo-info">' +
      '<span class="photo-name" title="' + name + '">' + name + '</span>' +
      '<a class="download" href="' + dl + '" target="_blank" rel="noopener" title="Download" aria-label="Download ' + name + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>' +
      '</a></div>';
    var img = card.querySelector("img");
    img.addEventListener("click", function () { openLightbox(src); });
    img.addEventListener("error", function () { img.alt = ""; img.classList.add("broken"); }, { once: true });
    gallery.appendChild(card);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function downloadAllPhotos() {
  if (!cachedResults.length) return;
  toast("Downloading " + cachedResults.length + " photo" + (cachedResults.length > 1 ? "s" : "") + "…");
  cachedResults.forEach(function (item, idx) {
    setTimeout(function () {
      var link = document.createElement("a");
      link.href = API_BASE + "/api/download/" + currentJobId + "/" + idx;
      link.download = item.file_name || ("photo_" + (idx + 1) + ".jpg");
      document.body.appendChild(link);
      link.click();
      link.remove();
    }, idx * 250);
  });
}

function startAgain() {
  show($("results"), false);
  $("input-card").hidden = false;
  $("file-input").value = "";
  selectedFiles = [];
  guidedBlobs = [];
  currentJobId = null;
  currentStepIndex = 0;
  setFindEnabled(false);
  renderUploadPreviews();
  renderCamPreviews();
  renderSteps();
  setInstruction(isMultiCam ? guideSteps[0].label : "");
  if ($("capture-btn")) $("capture-btn").disabled = false;
  stopCamera();
  switchTab("upload");
  hideError();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetToInput() {
  show($("status"), false);
  $("input-card").hidden = false;
}

/* ---------- LIGHTBOX ---------- */
var lastFocused = null;
function openLightbox(src) {
  lastFocused = document.activeElement;
  $("lightbox-img").src = src;
  $("lightbox-modal").hidden = false;
  document.body.style.overflow = "hidden";
  $("lightbox-close").focus();
}
function closeLightbox() {
  $("lightbox-modal").hidden = true;
  $("lightbox-img").src = "";
  document.body.style.overflow = "";
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}
function handleModalBackdropClick(e) {
  if (e.target === e.currentTarget) closeLightbox();
}

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    closeThemeMenu();
    if ($("lightbox-modal") && !$("lightbox-modal").hidden) closeLightbox();
  }
});

/* ---------- Drag & drop enhancement (optional, non-critical) ---------- */
document.addEventListener("DOMContentLoaded", function () {
  try {
    applyTheme(currentTheme());
    var dz = $("dropzone");
    if (dz) {
      ["dragenter", "dragover"].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("is-over"); });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("is-over"); });
      });
      dz.addEventListener("drop", function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) acceptFiles(e.dataTransfer.files);
      });
    }
  } catch (e) {
    console.error("Lumen: non-critical init step failed", e);
  }
});

window.addEventListener("pagehide", stopCamera);