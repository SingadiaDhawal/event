// ============================================================
// EVENT PHOTO FINDER — MULTI-STAGE PROGRESS LOGIC
// ============================================================

let selectedBlob = null;
let currentJobId = null;
let cameraStream = null;
let pollTimer = null;

const API_BASE = String(CONFIG.BACKEND_URL || "").replace(/\/+$/, "");

document.getElementById("file-input").addEventListener("change", handleFile);

function switchTab(tab) {
  const isUpload = tab === "upload";

  document.getElementById("upload-tab").classList.toggle("active", isUpload);
  document.getElementById("camera-tab").classList.toggle("active", !isUpload);
  document.getElementById("upload-content").classList.toggle("active", isUpload);
  document.getElementById("camera-content").classList.toggle("active", !isUpload);

  if (!isUpload) {
    document.getElementById("camera-box").style.display = "block";
    startCamera();
  } else {
    stopCamera();
  }
}

function handleFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  selectedBlob = file;
  const url = URL.createObjectURL(file);
  document.getElementById("preview-image").src = url;
  document.getElementById("upload-preview").style.display = "block";
  document.getElementById("find-button").disabled = false;

  hideError();
  hideAlert();
}

async function startCamera() {
  hideError();
  hideAlert();
  try {
    stopCamera();
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false
    });
    document.getElementById("video").srcObject = cameraStream;
  } catch (error) {
    showError("Unable to access the camera. Please allow permissions or upload a photo.");
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
}

function capturePhoto() {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");

  if (!video.videoWidth || !video.videoHeight) {
    showError("Please start the camera first.");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(
    function (blob) {
      selectedBlob = blob;
      document.getElementById("find-button").disabled = false;
      document.getElementById("preview-image").src = URL.createObjectURL(blob);
      document.getElementById("upload-preview").style.display = "block";
      hideError();
      hideAlert();
    },
    "image/jpeg",
    0.92
  );
}

function updateGallerySource() {
  const isCustom = document.querySelector('input[name="gallery-source"]:checked').value === "custom";
  document.getElementById("custom-gallery-input").style.display = isCustom ? "block" : "none";
}

function getSelectedGalleryUrl() {
  const isCustom = document.querySelector('input[name="gallery-source"]:checked').value === "custom";
  if (!isCustom) return "";
  return document.getElementById("gallery-url-input").value.trim();
}

function updateStageChecklist(progress, message) {
  const setStage = (id, state, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (state === "done") {
      el.innerHTML = `✓ <span style="color: #166534; font-weight: 600;">${text}</span>`;
    } else if (state === "active") {
      el.innerHTML = `● <span style="color: #1d4ed8; font-weight: 700;">${text}</span>`;
    } else {
      el.innerHTML = `○ <span style="color: #64748b;">${text}</span>`;
    }
  };

  if (progress < 10) {
    setStage("stage-received", "done", "Photo received");
    setStage("stage-face", "active", "Detecting your face...");
    setStage("stage-connect", "wait", "Connecting to Google Drive");
    setStage("stage-download", "wait", "Downloading event photos");
    setStage("stage-scan", "wait", "Scanning photos");
    setStage("stage-match", "wait", "Finding your matches");
  } else if (progress >= 10 && progress < 15) {
    setStage("stage-received", "done", "Photo received");
    setStage("stage-face", "done", "Face detected");
    setStage("stage-connect", "active", "Connecting to Google Drive...");
    setStage("stage-download", "wait", "Downloading event photos");
    setStage("stage-scan", "wait", "Scanning photos");
    setStage("stage-match", "wait", "Finding your matches");
  } else if (progress >= 15 && progress < 30) {
    setStage("stage-received", "done", "Photo received");
    setStage("stage-face", "done", "Face detected");
    setStage("stage-connect", "done", "Connected to Google Drive");
    setStage("stage-download", "active", message || "Downloading event photos...");
    setStage("stage-scan", "wait", "Scanning photos");
    setStage("stage-match", "wait", "Finding your matches");
  } else if (progress >= 30 && progress < 90) {
    setStage("stage-received", "done", "Photo received");
    setStage("stage-face", "done", "Face detected");
    setStage("stage-connect", "done", "Connected to Google Drive");
    setStage("stage-download", "done", "Photos downloaded successfully");
    setStage("stage-scan", "active", message || "Scanning photos...");
    setStage("stage-match", "wait", "Finding your matches");
  } else {
    setStage("stage-received", "done", "Photo received");
    setStage("stage-face", "done", "Face detected");
    setStage("stage-connect", "done", "Connected to Google Drive");
    setStage("stage-download", "done", "Photos downloaded successfully");
    setStage("stage-scan", "done", "Photos scanned");
    setStage("stage-match", "active", message || "Finding your best matches...");
  }
}

async function startSearch() {
  hideError();
  hideAlert();

  if (!selectedBlob) {
    showError("Please upload or capture a photo first.");
    return;
  }

  if (!API_BASE) {
    showError("Backend URL is not configured in config.js.");
    return;
  }

  const galleryUrl = getSelectedGalleryUrl();
  const usingCustomGallery = document.querySelector('input[name="gallery-source"]:checked').value === "custom";

  if (usingCustomGallery) {
    const drivePattern = /^https:\/\/drive\.google\.com\/drive\/folders\/[a-zA-Z0-9_-]+/;
    if (!drivePattern.test(galleryUrl)) {
      showError("Please paste a valid Google Drive folder link.");
      return;
    }
  }

  document.getElementById("find-button").disabled = true;
  document.getElementById("input-card").style.display = "none";
  document.getElementById("status").style.display = "block";
  document.getElementById("status-text").innerText = "Initializing search process...";
  document.getElementById("progress-bar").style.width = "5%";
  updateStageChecklist(5, "Initializing search process...");

  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50)));

  try {
    const formData = new FormData();
    formData.append("selfie", selectedBlob, "selfie.jpg");

    if (usingCustomGallery) {
      formData.append("gallery_url", galleryUrl);
    }

    const response = await fetch(API_BASE + "/api/start-scan", {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error("Server rejected the request.");

    const data = await response.json();
    if (!data.success) throw new Error(data.message || "Failed to start scan.");

    currentJobId = data.job_id;
    pollJob();
  } catch (error) {
    showError(error.message || "Connection failed.");
    resetToInput();
  }
}

async function pollJob() {
  try {
    const response = await fetch(API_BASE + "/api/job/" + encodeURIComponent(currentJobId));
    if (!response.ok) throw new Error("Lost connection to job queue.");

    const job = await response.json();

    const progress = job.progress || 0;
    const message = job.message || "Processing photos...";

    document.getElementById("status-text").innerText = message;
    document.getElementById("progress-bar").style.width = progress + "%";
    updateStageChecklist(progress, message);

    if (job.message && job.message.includes("Note: Folder contains")) {
      showAlert(job.message);
    }

    if (job.status === "completed") {
      showResults(job);
      return;
    }

    if (job.status === "error") {
      throw new Error(job.message || "Processing encountered an error.");
    }

    pollTimer = setTimeout(pollJob, 500);
  } catch (error) {
    showError(error.message || "An error occurred during search polling.");
    resetToInput();
  }
}

function resetToInput() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  document.getElementById("status").style.display = "none";
  document.getElementById("input-card").style.display = "block";
  document.getElementById("find-button").disabled = false;
}

function showResults(job) {
  document.getElementById("status").style.display = "none";
  document.getElementById("results").style.display = "block";

  const results = job.results || [];
  document.getElementById("results-count").innerText = results.length + " matching photos found";

  const gallery = document.getElementById("gallery");
  gallery.innerHTML = "";

  if (results.length === 0) {
    gallery.innerHTML = '<div class="empty">No matching photos found. Try a clearer selfie.</div>';
    return;
  }

  results.forEach(function (item, index) {
    const card = document.createElement("div");
    card.className = "photo-card";

    const image = document.createElement("img");
    image.src = API_BASE + "/api/image/" + encodeURIComponent(currentJobId) + "/" + index;
    image.loading = "lazy";
    image.alt = "Matched photo";

    const info = document.createElement("div");
    info.className = "photo-info";

    const name = document.createElement("div");
    name.className = "photo-name";
    name.innerText = item.file_name;

    const download = document.createElement("a");
    download.className = "download";
    download.href = API_BASE + "/api/download/" + encodeURIComponent(currentJobId) + "/" + index;
    download.innerText = "📥 Download Photo";
    download.target = "_blank";

    info.appendChild(name);
    info.appendChild(download);
    card.appendChild(image);
    card.appendChild(info);
    gallery.appendChild(card);
  });
}

function startAgain() {
  document.getElementById("results").style.display = "none";
  document.getElementById("input-card").style.display = "block";
  document.getElementById("file-input").value = "";
  selectedBlob = null;
  currentJobId = null;
  document.getElementById("find-button").disabled = true;
  document.getElementById("upload-preview").style.display = "none";
  document.querySelector('input[name="gallery-source"][value="default"]').checked = true;
  document.getElementById("gallery-url-input").value = "";
  updateGallerySource();
  stopCamera();
  switchTab("upload");
  hideAlert();
  hideError();
}

function showError(message) {
  const element = document.getElementById("error");
  element.innerText = message;
  element.style.display = "block";
}

function hideError() {
  document.getElementById("error").style.display = "none";
}

function showAlert(message) {
  const element = document.getElementById("alert-box");
  element.innerText = message;
  element.style.display = "block";
}

function hideAlert() {
  document.getElementById("alert-box").style.display = "none";
}