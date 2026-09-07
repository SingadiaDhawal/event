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
  fileInput.multiple = isMultiUpload;
  document.getElementById("upload-label-text").innerText = isMultiUpload ? "Choose multiple angle photos" : "Choose your photo";
  selectedFiles = [];
  document.getElementById("upload-preview").style.display = "none";
  document.getElementById("find-button").disabled = true;
}

function toggleCamMode() {
  isMultiCam = document.querySelector('input[name="cam-mode"]:checked').value === "multiple";
  document.getElementById("camera-instruction").style.display = isMultiCam ? "block" : "none";
  document.getElementById("capture-btn").innerText = isMultiCam ? "Capture Step 1 (Straight)" : "Capture Photo";
  currentStepIndex = 0;
  guidedBlobs = [];
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  selectedFiles = files;
  const previewContainer = document.getElementById("upload-preview");
  previewContainer.innerHTML = "";
  previewContainer.style.display = "block";

  files.forEach(file => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    previewContainer.appendChild(img);
  });

  document.getElementById("find-button").disabled = false;
  hideError();
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
      selectedFiles = [blob];
      document.getElementById("upload-preview").innerHTML = `<img src="${URL.createObjectURL(blob)}">`;
      document.getElementById("upload-preview").style.display = "block";
      document.getElementById("find-button").disabled = false;
      showError("Snapshot captured successfully!");
    } else {
      guidedBlobs.push(blob);
      currentStepIndex++;
      if (currentStepIndex < guideSteps.length) {
        document.getElementById("camera-instruction").innerText = guideSteps[currentStepIndex].label;
        document.getElementById("capture-btn").innerText = `Capture Step ${currentStepIndex + 1} (${guideSteps[currentStepIndex].pose})`;
      } else {
        selectedFiles = guidedBlobs;
        document.getElementById("camera-instruction").innerText = "Multi-angle sequence complete!";
        document.getElementById("capture-btn").innerText = "Captured All Poses";
        document.getElementById("capture-btn").disabled = true;
        document.getElementById("find-button").disabled = false;
        stopCamera();
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
    document.getElementById("status-text").innerText = job.message || "Processing...";
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

function showResults(results) {
  document.getElementById("status").style.display = "none";
  document.getElementById("results").style.display = "block";
  const gallery = document.getElementById("gallery");
  gallery.innerHTML = results.length ? "" : '<div class="empty">No matching photos found.</div>';

  results.forEach((item, idx) => {
    gallery.innerHTML += `
      <div class="photo-card">
        <img src="${API_BASE}/api/image/${currentJobId}/${idx}" loading="lazy">
        <div class="photo-info">
          <div class="photo-name">${item.file_name}</div>
          <a class="download" href="${API_BASE}/api/download/${currentJobId}/${idx}" target="_blank">Download</a>
        </div>
      </div>`;
  });
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