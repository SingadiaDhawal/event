let selectedFiles = []; 
let currentJobId = null;
let cameraStream = null;
let useFrontCamera = true;
let isMultiUpload = false;
let isMultiCam = false;

const guideSteps = [
  { pose: "front", label: "Look Straight Ahead" },
  { pose: "left", label: "Turn Slightly Left" },
  { pose: "right", label: "Turn Slightly Right" },
  { pose: "up", label: "Tilt Chin Up" },
  { pose: "down", label: "Tilt Chin Down" }
];
let currentStepIndex = 0;
let guidedBlobs = []; 

const API_BASE = String(CONFIG.BACKEND_URL || "").replace(/\/+$/, "");

document.getElementById("file-input").addEventListener("change", handleFileSelect);

function switchTab(tab) {
  const isUpload = tab === "upload";
  document.getElementById("upload-tab").classList.toggle("active", isUpload);
  document.getElementById("camera-tab").classList.toggle("active", !isUpload);
  document.getElementById("upload-content").classList.toggle("active", isUpload);
  document.getElementById("camera-content").classList.toggle("active", !isUpload);

  if (!isUpload) {
    startCamera();
  } else {
    stopCamera();
  }
}

function toggleUploadMode() {
  isMultiUpload = document.querySelector('input[name="upload-mode"]:checked').value === "multiple";
  const fileInput = document.getElementById("file-input");
  fileInput.value = "";
  
  if (isMultiUpload) {
    fileInput.setAttribute("multiple", "multiple");
  } else {
    fileInput.removeAttribute("multiple");
  }

  document.getElementById("upload-label-text").innerText = isMultiUpload ? "Choose multiple angle photos" : "Choose your photo";
  selectedFiles = [];
  document.getElementById("upload-preview").style.display = "none";
  document.getElementById("find-button").disabled = true;
}

function toggleCamMode() {
  isMultiCam = document.querySelector('input[name="cam-mode"]:checked').value === "multiple";
  document.getElementById("camera-instruction").style.display = isMultiCam ? "block" : "none";
  currentStepIndex = 0;
  guidedBlobs = [];
  document.getElementById("cam-preview").innerHTML = "";
  document.getElementById("capture-btn").disabled = false;
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  selectedFiles = files;
  renderUploadPreviews();

  document.getElementById("find-button").disabled = false;
  hideError();
}

function renderUploadPreviews() {
  const container = document.getElementById("upload-preview");
  container.innerHTML = "";
  container.style.display = selectedFiles.length ? "flex" : "none";

  selectedFiles.forEach((file, idx) => {
    const item = document.createElement("div");
    item.className = "preview-item";
    
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerText = "Remove";
    btn.onclick = () => {
      selectedFiles.splice(idx, 1);
      renderUploadPreviews();
      if (!selectedFiles.length) {
        document.getElementById("upload-preview").style.display = "none";
        document.getElementById("find-button").disabled = true;
      }
    };

    item.appendChild(img);
    item.appendChild(btn);
    container.appendChild(item);
  });
}

function renderCamPreviews() {
  const container = document.getElementById("cam-preview");
  container.innerHTML = "";
  container.style.display = guidedBlobs.length ? "flex" : "none";

  guidedBlobs.forEach((blob, idx) => {
    const item = document.createElement("div");
    item.className = "preview-item";
    
    const img = document.createElement("img");
    img.src = URL.createObjectURL(blob);
    
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerText = "Retake";
    btn.onclick = () => {
      guidedBlobs.splice(idx, 1);
      selectedFiles = guidedBlobs;
      currentStepIndex = guidedBlobs.length;
      renderCamPreviews();
      
      if (isMultiCam && currentStepIndex < guideSteps.length) {
        document.getElementById("camera-instruction").innerText = guideSteps[currentStepIndex].label;
        document.getElementById("capture-btn").disabled = false;
      }
      if (!guidedBlobs.length) {
        document.getElementById("find-button").disabled = true;
      }
    };

    item.appendChild(img);
    item.appendChild(btn);
    container.appendChild(item);
  });
}

async function startCamera() {
  hideError();
  try {
    stopCamera();
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: useFrontCamera ? "user" : "environment" },
      audio: false
    });
    document.getElementById("video").srcObject = cameraStream;
  } catch (err) {
    showError("Camera access denied or unavailable.");
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

function handleCaptureAction() {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  if (!video.videoWidth) {
    showError("Please start the camera first.");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  canvas.toBlob(blob => {
    if (!isMultiCam) {
      guidedBlobs = [blob];
      selectedFiles = guidedBlobs;
      renderCamPreviews();
      document.getElementById("find-button").disabled = false;
      showError("Snapshot captured successfully!");
    } else {
      if (currentStepIndex < guideSteps.length) {
        guidedBlobs.push(blob);
        currentStepIndex++;
        
        renderCamPreviews();

        if (currentStepIndex < guideSteps.length) {
          document.getElementById("camera-instruction").innerText = guideSteps[currentStepIndex].label;
        } else {
          selectedFiles = guidedBlobs;
          document.getElementById("camera-instruction").innerText = "All angles captured!";
          document.getElementById("capture-btn").disabled = true;
          document.getElementById("find-button").disabled = false;
          stopCamera();
        }
      }
    }
  }, "image/jpeg", 0.92);
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

async function startSearch() {
  hideError();
  if (!selectedFiles.length) {
    showError("Please provide reference images first.");
    return;
  }

  const rawName = document.getElementById("user-name").value.trim();
  const displayName = rawName || "Guest";
  
  document.getElementById("greeting-title").innerText = `Hello, ${displayName}!`;
  document.getElementById("user-avatar").innerText = displayName.charAt(0).toUpperCase();

  document.getElementById("input-card").style.display = "none";
  document.getElementById("status").style.display = "block";

  const formData = new FormData();
  selectedFiles.forEach((file, idx) => {
    formData.append("selfies", file, `pose_${idx}.jpg`);
  });

  const galleryUrl = getSelectedGalleryUrl();
  if (galleryUrl) {
    formData.append("gallery_url", galleryUrl);
  }

  try {
    const res = await fetch(API_BASE + "/api/start-scan", { method: "POST", body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    currentJobId = data.job_id;
    pollJob();
  } catch (e) {
    showError(e.message);
    resetToInput();
  }
}

async function pollJob() {
  try {
    const res = await fetch(`${API_BASE}/api/job/${currentJobId}`);
    const job = await res.json();
    document.getElementById("status-text").innerText = job.message || "Processing scans...";
    document.getElementById("progress-bar").style.width = (job.progress || 0) + "%";

    if (job.status === "completed") {
      showResults(job.results);
    } else if (job.status === "error") {
      throw new Error(job.message);
    } else {
      setTimeout(pollJob, 500);
    }
  } catch (e) {
    showError(e.message);
    resetToInput();
  }
}

let cachedResults = [];

function showResults(results) {
  cachedResults = results;
  document.getElementById("status").style.display = "none";
  document.getElementById("results").style.display = "block";
  document.getElementById("stats-badge").innerText = `${results.length} Matches Found`;
  
  const gallery = document.getElementById("gallery");
  gallery.innerHTML = results.length ? "" : '<div class="empty" style="grid-column: 1/-1; text-align:center; color:#64748b; padding:40px;">No matching photos found. Try uploading additional face angles.</div>';

  results.forEach((item, idx) => {
    gallery.innerHTML += `
      <div class="photo-card">
        <img src="${API_BASE}/api/image/${currentJobId}/${idx}" loading="lazy" onclick="openLightbox('${API_BASE}/api/image/${currentJobId}/${idx}')">
        <div class="photo-info">
          <div style="font-size:12px; color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.file_name}">${item.file_name}</div>
          <a class="download" href="${API_BASE}/api/download/${currentJobId}/${idx}" target="_blank">Download</a>
        </div>
      </div>`;
  });
}

function openLightbox(imgSrc) {
  const modal = document.getElementById("lightbox-modal");
  const modalImg = document.getElementById("lightbox-img");
  modal.style.display = "flex";
  modalImg.src = imgSrc;
}

function closeLightbox() {
  document.getElementById("lightbox-modal").style.display = "none";
}

function downloadAllPhotos() {
  cachedResults.forEach((item, idx) => {
    const link = document.createElement('a');
    link.href = `${API_BASE}/api/download/${currentJobId}/${idx}`;
    link.download = item.file_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

function startAgain() {
  document.getElementById("results").style.display = "none";
  document.getElementById("input-card").style.display = "block";
  document.getElementById("file-input").value = "";
  selectedFiles = [];
  guidedBlobs = [];
  currentJobId = null;
  document.getElementById("find-button").disabled = true;
  document.getElementById("upload-preview").style.display = "none";
  document.getElementById("cam-preview").style.display = "none";
  stopCamera();
  switchTab("upload");
  hideError();
}

function resetToInput() {
  document.getElementById("status").style.display = "none";
  document.getElementById("input-card").style.display = "block";
}

function showError(msg) {
  const el = document.getElementById("error");
  el.innerText = msg;
  el.style.display = "block";
}

function hideError() {
  document.getElementById("error").style.display = "none";
}