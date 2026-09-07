let selectedFiles = []; 
let currentJobId = null;
let cameraStream = null;
let useFrontCamera = true;
let isMultiUpload = false;
let isMultiCam = false;
let cachedResults = [];

const guideSteps = [
  { pose: "front", label: "Front Face" },
  { pose: "left", label: "Left Profile" },
  { pose: "right", label: "Right Profile" },
  { pose: "up", label: "Looking Up" },
  { pose: "down", label: "Looking Down" }
];
let currentStepIndex = 0;
let guidedBlobs = []; 

const API_BASE = String((window.CONFIG && CONFIG.BACKEND_URL) || "").replace(/\/+$/, "");
const $ = (id) => document.getElementById(id);

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
  const nameEl = $("theme-name");
  if (nameEl) nameEl.textContent = theme.name;
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
  const list = $("theme-list");
  const trig = $("theme-trigger");
  if (list) list.hidden = false;
  if (trig) trig.setAttribute("aria-expanded", "true");
}
function closeThemeMenu() {
  const list = $("theme-list");
  const trig = $("theme-trigger");
  if (list) list.hidden = true;
  if (trig) trig.setAttribute("aria-expanded", "false");
}
function toggleThemeMenu() {
  const list = $("theme-list");
  if (list) list.hidden ? openThemeMenu() : closeThemeMenu();
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

function show(el, on = true) {
  if (el) el.classList.toggle("show", on);
}

function setFindEnabled(enabled) {
  const btn = $("find-button");
  if (btn) btn.disabled = !enabled;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function switchTab(tab) {
  const isUpload = tab === "upload";
  const uploadTab = $("upload-tab");
  const cameraTab = $("camera-tab");
  const uploadContent = $("upload-content");
  const cameraContent = $("camera-content");
  
  if (uploadTab) {
    uploadTab.classList.toggle("active", isUpload);
    uploadTab.setAttribute("aria-selected", String(isUpload));
  }
  if (cameraTab) {
    cameraTab.classList.toggle("active", !isUpload);
    cameraTab.setAttribute("aria-selected", String(!isUpload));
  }
  if (uploadContent) uploadContent.classList.toggle("active", isUpload);
  if (cameraContent) cameraContent.classList.toggle("active", !isUpload);
  
  const tabsContainer = document.querySelector(".tabs");
  if (tabsContainer) tabsContainer.dataset.active = tab;

  if (!isUpload) {
    startCamera();
  } else {
    stopCamera();
  }
}

function toggleUploadMode() {
  const radio = document.querySelector('input[name="upload-mode"]:checked');
  isMultiUpload = radio ? radio.value === "multiple" : false;
  const fileInput = $("file-input");
  if (!fileInput) return;
  
  fileInput.value = "";
  if (isMultiUpload) {
    fileInput.setAttribute("multiple", "multiple");
  } else {
    fileInput.removeAttribute("multiple");
  }

  const labelText = $("upload-label-text");
  if (labelText) {
    labelText.innerText = isMultiUpload ? "Choose multiple angle photos" : "Choose your photo";
  }
  selectedFiles = [];
  const preview = $("upload-preview");
  if (preview) {
    preview.style.display = "none";
    preview.classList.remove("has-items");
  }
  setFindEnabled(false);
}

function toggleCamMode() {
  const radio = document.querySelector('input[name="cam-mode"]:checked');
  isMultiCam = radio ? radio.value === "multiple" : false;
  
  const instruction = $("camera-instruction");
  if (instruction) {
    instruction.style.display = isMultiCam ? "block" : "none";
    instruction.hidden = !isMultiCam;
    if (isMultiCam) instruction.innerText = guideSteps[0].label;
  }
  
  currentStepIndex = 0;
  guidedBlobs = [];
  selectedFiles = [];
  renderSteps();
  
  const camPreview = $("cam-preview");
  if (camPreview) {
    camPreview.innerHTML = "";
    camPreview.classList.remove("has-items");
  }
  
  const capBtn = $("capture-btn");
  if (capBtn) capBtn.disabled = false;
  setFindEnabled(false);
  if (!cameraStream) startCamera();
}

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

function renderUploadPreviews() {
  const container = $("upload-preview");
  if (!container) return;
  container.innerHTML = "";
  container.classList.toggle("has-items", selectedFiles.length > 0);
  container.style.display = selectedFiles.length ? "flex" : "none";

  selectedFiles.forEach((file, idx) => {
    const item = document.createElement("div");
    item.className = "preview-item";
    
    const img = document.createElement("img");
    const blobUrl = URL.createObjectURL(file);
    img.src = blobUrl;
    img.alt = `Image ${idx + 1}`;
    img.onclick = () => openLightbox(blobUrl);
    
    const badge = document.createElement("div");
    badge.className = "preview-badge";
    badge.innerText = `Image ${idx + 1}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preview-delete";
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    btn.title = "Remove image";
    btn.onclick = (e) => {
      e.stopPropagation();
      selectedFiles.splice(idx, 1);
      renderUploadPreviews();
      if (!selectedFiles.length) {
        container.style.display = "none";
        setFindEnabled(false);
      }
    };

    item.appendChild(img);
    item.appendChild(badge);
    item.appendChild(btn);
    container.appendChild(item);
  });
}

function renderCamPreviews() {
  const container = $("cam-preview");
  if (!container) return;
  container.innerHTML = "";
  container.classList.toggle("has-items", guidedBlobs.length > 0);
  container.style.display = guidedBlobs.length ? "flex" : "none";

  guidedBlobs.forEach((blob, idx) => {
    const item = document.createElement("div");
    item.className = "preview-item";
    
    const img = document.createElement("img");
    const blobUrl = URL.createObjectURL(blob);
    img.src = blobUrl;
    img.alt = isMultiCam && guideSteps[idx] ? guideSteps[idx].label : `Snapshot ${idx + 1}`;
    img.onclick = () => openLightbox(blobUrl);
    
    const badge = document.createElement("div");
    badge.className = "preview-badge";
    badge.innerText = isMultiCam && guideSteps[idx] ? guideSteps[idx].label : `Pose ${idx + 1}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preview-delete";
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    btn.title = "Retake pose";
    btn.onclick = (e) => {
      e.stopPropagation();
      guidedBlobs.splice(idx, 1);
      selectedFiles = guidedBlobs;
      currentStepIndex = guidedBlobs.length;
      renderCamPreviews();
      renderSteps();
      
      if (isMultiCam) {
        const instruction = $("camera-instruction");
        if (instruction && currentStepIndex < guideSteps.length) {
          instruction.innerText = guideSteps[currentStepIndex].label;
        }
        const capBtn = $("capture-btn");
        if (capBtn) capBtn.disabled = false;
        if (!cameraStream) startCamera();
      }
      if (!guidedBlobs.length) {
        setFindEnabled(false);
      }
    };

    item.appendChild(img);
    item.appendChild(badge);
    item.appendChild(btn);
    container.appendChild(item);
  });
}

async function startCamera() {
  hideError();
  try {
    stopCamera();
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: useFrontCamera ? "user" : "environment", width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false
    });
    const video = $("video");
    if (video) video.srcObject = cameraStream;
    const viewfinder = document.querySelector(".viewfinder");
    if (viewfinder) viewfinder.classList.toggle("rear", !useFrontCamera);
  } catch (err) {
    showError("Camera access denied or unavailable. You can still upload photos instead.");
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
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
  if (!video || !video.videoWidth) {
    showError("Camera is not ready yet. Please allow access and try again.");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (useFrontCamera) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  flashViewfinder();

  canvas.toBlob(blob => {
    if (!isMultiCam) {
      guidedBlobs = [blob];
      selectedFiles = guidedBlobs;
      renderCamPreviews();
      setFindEnabled(true);
      toast("Snapshot captured successfully!");
    } else {
      if (currentStepIndex < guideSteps.length) {
        guidedBlobs.push(blob);
        currentStepIndex++;
        renderCamPreviews();
        renderSteps();

        const instruction = $("camera-instruction");
        if (currentStepIndex < guideSteps.length) {
          if (instruction) instruction.innerText = guideSteps[currentStepIndex].label;
          toast(`${currentStepIndex}/${guideSteps.length} captured`);
        } else {
          selectedFiles = guidedBlobs;
          if (instruction) instruction.innerText = "All angles captured!";
          const capBtn = $("capture-btn");
          if (capBtn) capBtn.disabled = true;
          setFindEnabled(true);
          stopCamera();
          toast("All 5 angles captured — ready to search");
        }
      }
    }
  }, "image/jpeg", 0.92);
}

function updateGallerySource() {
  const radio = document.querySelector('input[name="gallery-source"]:checked');
  const isCustom = radio ? radio.value === "custom" : false;
  const customInput = $("custom-gallery-input");
  if (customInput) customInput.hidden = !isCustom;
  if (isCustom) {
    const urlInput = $("gallery-url-input");
    if (urlInput) urlInput.focus();
  }
}

function getSelectedGalleryUrl() {
  const radio = document.querySelector('input[name="gallery-source"]:checked');
  const isCustom = radio ? radio.value === "custom" : false;
  if (!isCustom) return "";
  const urlInput = $("gallery-url-input");
  return urlInput ? urlInput.value.trim() : "";
}

function setProgress(pct, text) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  const bar = $("progress-bar");
  const pctEl = $("progress-pct");
  const progressEl = $("progress");
  const statusText = $("status-text");

  if (bar) bar.style.width = p + "%";
  if (pctEl) pctEl.textContent = p + "%";
  if (progressEl) progressEl.setAttribute("aria-valuenow", String(p));
  if (text && statusText) statusText.textContent = text;
}

async function startSearch() {
  hideError();
  if (!selectedFiles.length) {
    showError("Please provide reference images first.");
    return;
  }

  const galleryUrl = getSelectedGalleryUrl();
  const radio = document.querySelector('input[name="gallery-source"]:checked');
  const isCustom = radio ? radio.value === "custom" : false;
  if (isCustom && !galleryUrl) {
    showError("Please paste a Google Drive folder link, or switch to the event gallery.");
    return;
  }

  const rawName = $("user-name") ? $("user-name").value.trim() : "";
  const displayName = rawName || "Guest";
  
  const greetingTitle = $("greeting-title");
  const userAvatar = $("user-avatar");
  if (greetingTitle) greetingTitle.innerText = `Hello, ${displayName}!`;
  if (userAvatar) userAvatar.innerText = displayName.charAt(0).toUpperCase();

  const inputCard = $("input-card");
  const statusSection = $("status");
  if (inputCard) inputCard.hidden = true;
  show(statusSection, true);
  setProgress(0, "Uploading your reference images…");
  window.scrollTo({ top: 0, behavior: "smooth" });

  const formData = new FormData();
  selectedFiles.forEach((file, idx) => {
    formData.append("selfies", file, `pose_${idx}.jpg`);
  });

  if (galleryUrl) {
    formData.append("gallery_url", galleryUrl);
  }

  try {
    const res = await fetch(API_BASE + "/api/start-scan", { method: "POST", body: formData });
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
    setProgress(job.progress, job.message || "Processing scans...");

    if (job.status === "completed") {
      showResults(job.results || []);
    } else if (job.status === "error") {
      throw new Error(job.message || "The scan failed.");
    } else {
      setTimeout(pollJob, 500);
    }
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
  
  const statsBadge = $("stats-badge");
  if (statsBadge) statsBadge.innerText = `${results.length} match${results.length === 1 ? "" : "es"}`;
  
  const downloadAllBtn = $("download-all-btn");
  if (downloadAllBtn) downloadAllBtn.disabled = !results.length;
  
  const gallery = $("gallery");
  if (!gallery) return;
  gallery.innerHTML = "";

  if (!results.length) {
    gallery.innerHTML = '<div class="empty"><strong>No matches found</strong>Try adding photos from more angles or in better lighting.</div>';
    return;
  }

  results.forEach((item, idx) => {
    const src = `${API_BASE}/api/image/${currentJobId}/${idx}`;
    const dl = `${API_BASE}/api/download/${currentJobId}/${idx}`;
    const name = escapeHtml(item.file_name || `photo_${idx + 1}.jpg`);

    const card = document.createElement("div");
    card.className = "photo-card";
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

function openLightbox(imgSrc) {
  const modal = $("lightbox-modal");
  const modalImg = $("lightbox-img");
  if (modal && modalImg) {
    modal.hidden = false;
    modalImg.src = imgSrc;
    document.body.style.overflow = "hidden";
  }
}

function closeLightbox() {
  const modal = $("lightbox-modal");
  const modalImg = $("lightbox-img");
  if (modal && modalImg) {
    modal.hidden = true;
    modalImg.src = "";
    document.body.style.overflow = "";
  }
}

function downloadAllPhotos() {
  if (!cachedResults.length) return;
  toast(`Downloading ${cachedResults.length} photo${cachedResults.length > 1 ? "s" : ""}…`);
  cachedResults.forEach((item, idx) => {
    setTimeout(() => {
      const link = document.createElement('a');
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
  const inputCard = $("input-card");
  if (inputCard) inputCard.hidden = false;
  
  const fileInput = $("file-input");
  if (fileInput) fileInput.value = "";
  
  const userName = $("user-name");
  if (userName) userName.value = "";

  selectedFiles = [];
  guidedBlobs = [];
  currentJobId = null;
  currentStepIndex = 0;
  setFindEnabled(false);
  renderUploadPreviews();
  renderCamPreviews();
  renderSteps();
  
  const instruction = $("camera-instruction");
  if (instruction) instruction.innerText = isMultiCam ? guideSteps[0].label : "";
  
  const capBtn = $("capture-btn");
  if (capBtn) capBtn.disabled = false;
  
  stopCamera();
  switchTab("upload");
  hideError();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetToInput() {
  show($("status"), false);
  const inputCard = $("input-card");
  if (inputCard) inputCard.hidden = false;
}

function showError(msg) {
  const el = $("error");
  if (!el) return;
  el.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><span></span>`;
  const span = el.querySelector("span");
  if (span) span.textContent = msg;
  show(el, true);
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function hideError() {
  show($("error"), false);
}

function init() {
  applyTheme(currentTheme(), false);
  const themeTrigger = $("theme-trigger");
  if (themeTrigger) themeTrigger.addEventListener("click", toggleThemeMenu);

  document.addEventListener("click", (e) => {
    const menu = $("theme-menu");
    if (menu && !menu.contains(e.target)) closeThemeMenu();
  });
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeThemeMenu();
      const lightbox = $("lightbox-modal");
      if (lightbox && !lightbox.hidden) closeLightbox();
    }
  });

  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      const tabName = t.dataset.tab;
      if (tabName) switchTab(tabName);
    });
  });

  const fileInput = $("file-input");
  if (fileInput) fileInput.addEventListener("change", handleFileSelect);

  const dz = $("dropzone");
  if (dz) {
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-over"); }));
    dz.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) acceptFiles(e.dataTransfer.files); });
  }

  window.addEventListener("pagehide", stopCamera);
}

document.addEventListener("DOMContentLoaded", init);