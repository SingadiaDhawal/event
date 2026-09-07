/* =========================================================
   Find Yourself — app logic
   ========================================================= */

const API_BASE = String((window.CONFIG && CONFIG.BACKEND_URL) || "").replace(/\/+$/, "");

const $ = (id) => document.getElementById(id);

/* ---------- THEMES ---------- */
const THEMES = [
  { id: "light",    name: "Light",    desc: "Clean & bright",        bg: "#f5f6fa", primary: "#4f46e5" },
  { id: "dark",     name: "Dark",     desc: "Easy on the eyes",      bg: "#0b0e17", primary: "#8b8ffc" },
  { id: "midnight", name: "Midnight", desc: "Deep blue, sky accent", bg: "#040914", primary: "#38bdf8" },
  { id: "sunset",   name: "Sunset",   desc: "Warm & golden",         bg: "#fff8f1", primary: "#ea580c" },
  { id: "forest",   name: "Forest",   desc: "Dark green, calm",      bg: "#0a120e", primary: "#34d399" },
  { id: "rose",     name: "Rose",     desc: "Soft & elegant",        bg: "#fdf5f8", primary: "#db2777" },
];
const THEME_KEY = "find-yourself-theme";

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

function applyTheme(id, persist = true) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  document.documentElement.setAttribute("data-theme", theme.id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.primary);
  if ($("theme-name")) $("theme-name").textContent = theme.name;
  if (persist) {
    try { localStorage.setItem(THEME_KEY, theme.id); } catch (_) {}
  }
  renderThemeList();
}

function renderThemeList() {
  const list = $("theme-list");
  if (!list) return;
  const active = currentTheme();
  list.innerHTML = "";
  THEMES.forEach((t) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(t.id === active));
    li.className = "theme-item";
    li.tabIndex = 0;
    li.dataset.theme = t.id;
    li.innerHTML = `
      <span class="theme-swatch" style="background:${t.bg}; --sw-primary:${t.primary}"></span>
      <span class="theme-item-text">${t.name}<small>${t.desc}</small></span>
      <svg class="theme-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
    const pick = () => { applyTheme(t.id); closeThemeMenu(); };
    li.addEventListener("click", pick);
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    list.appendChild(li);
  });
}

function openThemeMenu() {
  if ($("theme-list")) $("theme-list").hidden = false;
  $("theme-trigger")?.setAttribute("aria-expanded", "true");
}
function closeThemeMenu() {
  if ($("theme-list")) $("theme-list").hidden = true;
  $("theme-trigger")?.setAttribute("aria-expanded", "false");
}
function toggleThemeMenu() {
  const list = $("theme-list");
  if (list) list.hidden ? openThemeMenu() : closeThemeMenu();
}

/* ---------- STATE ---------- */
let selectedFiles = [];
let currentJobId = null;
let cameraStream = null;
let useFrontCamera = true;
let isMultiUpload = false;
let isMultiCam = false;
let cachedResults = [];

const guideSteps = [
  { pose: "front", label: "Front face" },
  { pose: "left",  label: "Left profile" },
  { pose: "right", label: "Right profile" },
  { pose: "up",    label: "Looking up" },
  { pose: "down",  label: "Looking down" },
];
let currentStepIndex = 0;
let guidedBlobs = [];

/* ---------- HELPERS ---------- */
function setFindEnabled(enabled) {
  if ($("find-button")) $("find-button").disabled = !enabled;
}

function show(el, on = true) {
  if (el) el.classList.toggle("show", on);
}

let toastTimer;
function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function showError(msg) {
  const el = $("error");
  if (!el) return;
  el.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><span></span>`;
  el.querySelector("span").textContent = msg;
  show(el, true);
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function hideError() { show($("error"), false); }

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- TABS ---------- */
function switchTab(tab) {
  const isUpload = tab === "upload";
  $("upload-tab")?.classList.toggle("active", isUpload);
  $("camera-tab")?.classList.toggle("active", !isUpload);
  $("upload-tab")?.setAttribute("aria-selected", String(isUpload));
  $("camera-tab")?.setAttribute("aria-selected", String(!isUpload));
  $("upload-content")?.classList.toggle("active", isUpload);
  $("camera-content")?.classList.toggle("active", !isUpload);
  const tabsContainer = document.querySelector(".tabs");
  if (tabsContainer) tabsContainer.dataset.active = tab;

  if (!isUpload) startCamera();
  else stopCamera();
}

/* ---------- UPLOAD ---------- */
function toggleUploadMode() {
  const radio = document.querySelector('input[name="upload-mode"]:checked');
  isMultiUpload = radio ? radio.value === "multiple" : false;
  const fileInput = $("file-input");
  if (!fileInput) return;
  fileInput.value = "";
  fileInput.toggleAttribute("multiple", isMultiUpload);
  if ($("upload-label-text")) {
    $("upload-label-text").textContent = isMultiUpload ? "Choose photos from multiple angles" : "Choose your photo";
  }
  selectedFiles = [];
  renderUploadPreviews();
  setFindEnabled(false);
}

function acceptFiles(files) {
  const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
  if (!images.length) { showError("Please choose image files (JPG, PNG, HEIC)."); return; }
  selectedFiles = isMultiUpload ? [...selectedFiles, ...images] : [images[0]];
  renderUploadPreviews();
  setFindEnabled(true);
  hideError();
  toast(`${selectedFiles.length} photo${selectedFiles.length > 1 ? "s" : ""} ready`);
}

function handleFileSelect(event) {
  if (!event.target.files?.length) return;
  acceptFiles(event.target.files);
  event.target.value = "";
}

function buildPreviewItem({ src, label, onRemove, removeTitle }) {
  const item = document.createElement("div");
  item.className = "preview-item";

  const img = document.createElement("img");
  img.src = src;
  img.alt = label;
  img.addEventListener("click", () => openLightbox(src));

  const badge = document.createElement("div");
  badge.className = "preview-badge";
  badge.textContent = label;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "preview-delete";
  btn.title = removeTitle;
  btn.setAttribute("aria-label", removeTitle);
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
  btn.addEventListener("click", (e) => { e.stopPropagation(); onRemove(); });

  item.append(img, badge, btn);
  return item;
}

function renderUploadPreviews() {
  const container = $("upload-preview");
  if (!container) return;
  container.innerHTML = "";
  container.classList.toggle("has-items", selectedFiles.length > 0);

  selectedFiles.forEach((file, idx) => {
    container.appendChild(buildPreviewItem({
      src: URL.createObjectURL(file),
      label: `Image ${idx + 1}`,
      removeTitle: "Remove image",
      onRemove: () => {
        selectedFiles.splice(idx, 1);
        renderUploadPreviews();
        if (!selectedFiles.length) setFindEnabled(false);
      },
    }));
  });
}

/* ---------- CAMERA ---------- */
function renderSteps() {
  const ol = $("cam-steps");
  if (!ol) return;
  ol.hidden = !isMultiCam;
  ol.innerHTML = "";
  if (!isMultiCam) return;
  guideSteps.forEach((s, i) => {
    const li = document.createElement("li");
    li.textContent = s.label;
    if (i < currentStepIndex) li.classList.add("done");
    else if (i === currentStepIndex) li.classList.add("current");
    ol.appendChild(li);
  });
}

function setInstruction(text) {
  const el = $("camera-instruction");
  if (!el) return;
  el.hidden = !text;
  if (text) el.textContent = text;
}

function toggleCamMode() {
  const radio = document.querySelector('input[name="cam-mode"]:checked');
  isMultiCam = radio ? radio.value === "multiple" : false;
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
  const container = $("cam-preview");
  if (!container) return;
  container.innerHTML = "";
  container.classList.toggle("has-items", guidedBlobs.length > 0);

  guidedBlobs.forEach((blob, idx) => {
    container.appendChild(buildPreviewItem({
      src: URL.createObjectURL(blob),
      label: isMultiCam && guideSteps[idx] ? guideSteps[idx].label : `Snapshot ${idx + 1}`,
      removeTitle: "Retake",
      onRemove: () => {
        guidedBlobs.splice(idx, 1);
        selectedFiles = guidedBlobs;
        currentStepIndex = guidedBlobs.length;
        renderCamPreviews();
        renderSteps();
        if (isMultiCam) {
          setInstruction(guideSteps[currentStepIndex]?.label || "");
          if ($("capture-btn")) $("capture-btn").disabled = false;
          if (!cameraStream) startCamera();
        }
        if (!guidedBlobs.length) setFindEnabled(false);
      },
    }));
  });
}

async function startCamera() {
  hideError();
  try {
    stopCamera();
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: useFrontCamera ? "user" : "environment", width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
    if ($("video")) $("video").srcObject = cameraStream;
    const vf = document.querySelector(".viewfinder");
    if (vf) vf.classList.toggle("rear", !useFrontCamera);
  } catch (err) {
    showError("Camera access was denied or is unavailable. You can still upload photos instead.");
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
}

async function toggleCameraFacing() {
  useFrontCamera = !useFrontCamera;
  await startCamera();
}

function flashViewfinder() {
  const f = $("vf-flash");
  if (!f) return;
  f.classList.remove("on");
  void f.offsetWidth;
  f.classList.add("on");
}

function handleCaptureAction() {
  const video = $("video");
  const canvas = $("canvas");
  if (!video || !video.videoWidth) { showError("Camera is not ready yet. Please allow access and try again."); return; }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (useFrontCamera) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0);
  flashViewfinder();

  canvas.toBlob((blob) => {
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
      toast(`${currentStepIndex}/${guideSteps.length} captured — next: ${guideSteps[currentStepIndex].label}`);
    } else {
      selectedFiles = guidedBlobs;
      setInstruction("All angles captured");
      if ($("capture-btn")) $("capture-btn").disabled = true;
      setFindEnabled(true);
      stopCamera();
      toast("All 5 angles captured — ready to search");
    }
  }, "image/jpeg", 0.92);
}

/* ---------- GALLERY SOURCE ---------- */
function updateGallerySource() {
  const radio = document.querySelector('input[name="gallery-source"]:checked');
  const isCustom = radio ? radio.value === "custom" : false;
  if ($("custom-gallery-input")) $("custom-gallery-input").hidden = !isCustom;
  if (isCustom && $("gallery-url-input")) $("gallery-url-input").focus();
}
function getSelectedGalleryUrl() {
  const radio = document.querySelector('input[name="gallery-source"]:checked');
  const isCustom = radio ? radio.value === "custom" : false;
  return isCustom && $("gallery-url-input") ? $("gallery-url-input").value.trim() : "";
}

/* ---------- SEARCH FLOW ---------- */
function setProgress(pct, text) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  if ($("progress-bar")) $("progress-bar").style.width = p + "%";
  if ($("progress-pct")) $("progress-pct").textContent = p + "%";
  if ($("progress")) $("progress").setAttribute("aria-valuenow", String(p));
  if (text && $("status-text")) $("status-text").textContent = text;
}

async function startSearch() {
  hideError();
  if (!selectedFiles.length) { showError("Please add at least one reference photo first."); return; }

  const galleryUrl = getSelectedGalleryUrl();
  const radio = document.querySelector('input[name="gallery-source"]:checked');
  const isCustom = radio ? radio.value === "custom" : false;
  if (isCustom && !galleryUrl) { showError("Please paste a Google Drive folder link, or switch to the event gallery."); return; }

  const userNameInput = $("user-name");
  const displayName = userNameInput && userNameInput.value.trim() ? userNameInput.value.trim() : "Guest";
  if ($("greeting-title")) $("greeting-title").textContent = `Hello, ${displayName}!`;
  if ($("user-avatar")) $("user-avatar").textContent = displayName.charAt(0).toUpperCase();

  if ($("input-card")) $("input-card").hidden = true;
  show($("status"), true);
  setProgress(0, "Uploading your reference images…");
  window.scrollTo({ top: 0, behavior: "smooth" });

  const formData = new FormData();
  selectedFiles.forEach((file, idx) => formData.append("selfies", file, `pose_${idx}.jpg`));
  if (galleryUrl) formData.append("gallery_url", galleryUrl);

  try {
    const res = await fetch(`${API_BASE}/api/start-scan`, { method: "POST", body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Could not start the scan.");
    currentJobId = data.job_id;
    pollJob();
  } catch (e) {
    showError(e.message || "Something went wrong while starting the scan.");
    resetToInput();
  }
}

async function pollJob() {
  try {
    const res = await fetch(`${API_BASE}/api/job/${currentJobId}`);
    const job = await res.json();
    setProgress(job.progress, job.message || "Matching faces across the gallery…");

    if (job.status === "completed") showResults(job.results || []);
    else if (job.status === "error") throw new Error(job.message || "The scan failed.");
    else setTimeout(pollJob, 500);
  } catch (e) {
    showError(e.message || "Lost connection to the scan.");
    resetToInput();
  }
}

function showResults(results) {
  cachedResults = results;
  hideError();
  show($("status"), false);
  show($("results"), true);
  if ($("stats-badge")) $("stats-badge").textContent = `${results.length} match${results.length === 1 ? "" : "es"}`;
  if ($("download-all-btn")) $("download-all-btn").disabled = !results.length;

  const gallery = $("gallery");
  if (!gallery) return;
  gallery.innerHTML = "";

  if (!results.length) {
    gallery.innerHTML = `<div class="empty"><strong>No matches found</strong>Try adding photos from more angles or in better lighting.</div>`;
    return;
  }

  results.forEach((item, idx) => {
    const src = `${API_BASE}/api/image/${currentJobId}/${idx}`;
    const dl = `${API_BASE}/api/download/${currentJobId}/${idx}`;
    const name = escapeHtml(item.file_name || `photo_${idx + 1}.jpg`);
    const card = document.createElement("div");
    card.className = "photo-card";
    card.style.animationDelay = `${Math.min(idx, 12) * 40}ms`;
    card.innerHTML = `
      <img src="${src}" loading="lazy" alt="${name}">
      <div class="photo-info">
        <span class="photo-name" title="${name}">${name}</span>
        <a class="download" href="${dl}" target="_blank" rel="noopener" title="Download" aria-label="Download ${name}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        </a>
      </div>`;
    const img = card.querySelector("img");
    img.addEventListener("click", () => openLightbox(src));
    img.addEventListener("error", () => { img.alt = ""; img.classList.add("broken"); }, { once: true });
    gallery.appendChild(card);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function downloadAllPhotos() {
  if (!cachedResults.length) return;
  toast(`Downloading ${cachedResults.length} photo${cachedResults.length > 1 ? "s" : ""}…`);
  cachedResults.forEach((item, idx) => {
    setTimeout(() => {
      const link = document.createElement("a");
      link.href = `${API_BASE}/api/download/${currentJobId}/${idx}`;
      link.download = item.file_name || `photo_${idx + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }, idx * 250);
  });
}

function startAgain() {
  show($("results"), false);
  if ($("input-card")) $("input-card").hidden = false;
  if ($("file-input")) $("file-input").value = "";
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
  if ($("input-card")) $("input-card").hidden = false;
}

/* ---------- LIGHTBOX ---------- */
let lastFocused = null;
function openLightbox(src) {
  lastFocused = document.activeElement;
  const modalImg = $("lightbox-img");
  const modal = $("lightbox-modal");
  if (modalImg) modalImg.src = src;
  if (modal) modal.hidden = false;
  document.body.style.overflow = "hidden";
  $("lightbox-close")?.focus?.();
}
function closeLightbox() {
  const modal = $("lightbox-modal");
  const modalImg = $("lightbox-img");
  if (modal) modal.hidden = true;
  if (modalImg) modalImg.src = "";
  document.body.style.overflow = "";
  lastFocused?.focus?.();
}

/* ---------- WIRING ---------- */
function init() {
  // Theme
  applyTheme(currentTheme(), false);
  $("theme-trigger")?.addEventListener("click", toggleThemeMenu);
  document.addEventListener("click", (e) => {
    const menu = $("theme-menu");
    if (menu && !menu.contains(e.target)) closeThemeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeThemeMenu();
      const modal = $("lightbox-modal");
      if (modal && !modal.hidden) closeLightbox();
    }
  });

  // Tabs
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

  // Upload
  if ($("file-input")) $("file-input").addEventListener("change", handleFileSelect);
  document.querySelectorAll('input[name="upload-mode"]').forEach((r) => r.addEventListener("change", toggleUploadMode));
  const dz = $("dropzone");
  if (dz) {
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-over"); }));
    dz.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) acceptFiles(e.dataTransfer.files); });
  }

  // Camera
  document.querySelectorAll('input[name="cam-mode"]').forEach((r) => r.addEventListener("change", toggleCamMode));
  if ($("capture-btn")) $("capture-btn").addEventListener("click", handleCaptureAction);
  if ($("restart-cam-btn")) $("restart-cam-btn").addEventListener("click", startCamera);
  if ($("flip-cam-btn")) $("flip-cam-btn").addEventListener("click", toggleCameraFacing);

  // Gallery source
  document.querySelectorAll('input[name="gallery-source"]').forEach((r) => r.addEventListener("change", updateGallerySource));

  // Actions
  if ($("find-button")) $("find-button").addEventListener("click", startSearch);
  if ($("download-all-btn")) $("download-all-btn").addEventListener("click", downloadAllPhotos);
  if ($("start-again-btn")) $("start-again-btn").addEventListener("click", startAgain);

  // Lightbox
  if ($("lightbox-close")) $("lightbox-close").addEventListener("click", closeLightbox);
  const modal = $("lightbox-modal");
  if (modal) modal.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeLightbox(); });

  // Release camera when leaving the page
  window.addEventListener("pagehide", stopCamera);
}

document.addEventListener("DOMContentLoaded", init);