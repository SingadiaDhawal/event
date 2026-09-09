// config.js

var CONFIG = {
  BACKEND_URL: "", 
  APP_NAME: "Find Your Photos",
  MAX_UPLOAD_MB: 15
};

// Automatically fetch the live backend URL from the Gist immediately
(async function() {
  // Replace this with your actual Gist ID!
  var GIST_ID = "PASTE_YOUR_GIST_ID_HERE"; 
  
  try {
    // The ?t=Date.now() prevents the browser from loading a cached/stale URL
    var response = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${Date.now()}`);
    var data = await response.json();
    var content = JSON.parse(data.files["backend.json"].content);
    
    // Update the config
    CONFIG.BACKEND_URL = content.backend_url;
    
    // Dynamically update the API_BASE variable in your app.js
    window.API_BASE = CONFIG.BACKEND_URL.replace(/\/+$/, "");
    console.log("Dynamically loaded live backend URL:", window.API_BASE);
    
  } catch (error) {
    console.error("Failed to load backend URL from Gist:", error);
  }
})();
