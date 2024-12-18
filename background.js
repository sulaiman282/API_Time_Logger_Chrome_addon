// Store start times and methods of requests
const requestDetails = new Map();

// Function to log debug information
function debugLog(message) {
  console.log(`[Endpoint Eye] ${message}`);
}

// Function to get or initialize profile logs
function getProfileLogs(profile) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['profileLogs'], (result) => {
      let profileLogs = result.profileLogs || {};
      
      // Initialize profile if not exists
      if (!profileLogs[profile]) {
        profileLogs[profile] = {
          logs: {},
          lastLogNumber: 0
        };
      }
      
      // Save updated profile logs
      chrome.storage.local.set({ profileLogs }, () => {
        debugLog(`Initialized/Retrieved logs for profile: ${profile}`);
        resolve(profileLogs[profile]);
      });
    });
  });
}

// Function to update badge count for the current active tab
function updateBadgeForActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const profile = new URL(tabs[0].url).hostname;
      
      chrome.storage.local.get(['profileLogs'], (result) => {
        const profileLogs = result.profileLogs || {};
        const profileData = profileLogs[profile] || { logs: {} };
        const count = Object.keys(profileData.logs).length;
        
        debugLog(`Badge count for active tab (${profile}): ${count}`);
        
        chrome.action.setBadgeText({ text: count > 0 ? count.toString() : "" });
      });
    }
  });
}

// Enhanced request tracking for SPA and traditional websites
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Ignore non-http(s) requests and extensions
    if (!details.url.startsWith('http') || details.type !== 'xmlhttprequest') return;

    const requestId = details.requestId;
    const url = new URL(details.url);
    const profile = url.hostname;

    requestDetails.set(requestId, {
      startTime: Date.now(),
      method: details.method,
      url: details.url,
      profile: profile
    });
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    // Ignore non-http(s) requests and extensions
    if (!details.url.startsWith('http') || details.type !== 'xmlhttprequest') return;

    const requestId = details.requestId;
    const requestInfo = requestDetails.get(requestId);

    if (requestInfo) {
      const endTime = Date.now();
      const responseTime = endTime - requestInfo.startTime;

      // Remove request from tracking
      requestDetails.delete(requestId);

      // Get profile logs and save the log
      chrome.storage.local.get(['profileLogs'], (result) => {
        let profileLogs = result.profileLogs || {};
        let profileData = profileLogs[requestInfo.profile] || { logs: {}, lastLogNumber: 0 };

        // Increment log number
        profileData.lastLogNumber++;
        const logKey = `${profileData.lastLogNumber}.${requestInfo.method}.${new URL(requestInfo.url).pathname}`;

        // Store log entry
        profileData.logs[logKey] = responseTime;
        profileLogs[requestInfo.profile] = profileData;

        // Save updated logs
        chrome.storage.local.set({ profileLogs }, () => {
          debugLog(`Logged API call: ${logKey} - ${responseTime}ms`);
          updateBadgeForActiveTab();
        });
      });
    }
  },
  { urls: ["<all_urls>"] }
);

// Message listener for popup interactions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getProfileLogs") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const profile = new URL(tabs[0].url).hostname;
        
        chrome.storage.local.get(['profileLogs'], (result) => {
          const profileLogs = result.profileLogs || {};
          const profileData = profileLogs[profile] || { logs: {} };
          
          sendResponse({
            profile: profile,
            logs: profileData.logs
          });
        });
        
        return true; // Indicates we wish to send a response asynchronously
      }
    });
    return true;
  }
});

// Clear logs message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "clearLogs") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const profile = new URL(tabs[0].url).hostname;
        
        chrome.storage.local.get(['profileLogs'], (result) => {
          let profileLogs = result.profileLogs || {};
          
          // Clear logs for the current profile
          if (profileLogs[profile]) {
            profileLogs[profile].logs = {};
            profileLogs[profile].lastLogNumber = 0;
          }
          
          chrome.storage.local.set({ profileLogs }, () => {
            debugLog(`Cleared logs for profile: ${profile}`);
            updateBadgeForActiveTab();
            sendResponse({ success: true });
          });
        });
        
        return true;
      }
    });
    return true;
  }
});