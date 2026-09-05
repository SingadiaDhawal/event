// ============================================================
// EVENT PHOTO FINDER — FRONTEND CONFIG
//
// This is the ONLY file that changes when the Colab backend
// restarts and gets a new Cloudflare Quick Tunnel URL.
//
// index.html / app.js never need to change.
// ============================================================

const CONFIG = {

  // Paste the current Cloudflare Quick Tunnel URL printed by
  // the Colab notebook (Cell: "START CLOUDFLARE QUICK TUNNEL").
  BACKEND_URL: "https://words-qualifying-possible-strictly.trycloudflare.com",

  APP_NAME: "Find Your Photos",

  MAX_UPLOAD_MB: 15
};