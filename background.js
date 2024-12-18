// Store start times and methods of requests
const requestDetails = new Map();

// Function to log debug information
function debugLog(message) {
  console.log(`[API Response Time Logger] ${message}`);
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

// Track when requests start
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    requestDetails.set(details.requestId, {
      startTime: details.timeStamp,
      method: details.method || 'GET',
      url: details.url
    });
  },
  { urls: ["<all_urls>"] }
);

// Track when requests complete and calculate response time
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const requestInfo = requestDetails.get(details.requestId);
    if (!requestInfo) return;

    const responseTime = details.timeStamp - requestInfo.startTime;
    requestDetails.delete(details.requestId);

    const profile = new URL(details.url).hostname;
    
    // Only log API calls
    if (details.type === 'xmlhttprequest' || 
        details.url.includes('/api/') || 
        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(requestInfo.method)) {
      
      debugLog(`Logging API call: ${requestInfo.method} ${details.url} - ${responseTime}ms`);
      
      // Get or initialize profile logs
      getProfileLogs(profile).then((profileData) => {
        chrome.storage.local.get(['profileLogs'], (result) => {
          let profileLogs = result.profileLogs || {};
          
          // Increment log number
          profileData.lastLogNumber++;
          
          // Create a unique key that includes method and endpoint
          const logKey = `${profileData.lastLogNumber}. ${requestInfo.method} ${details.url}`;

          // Store log with response time
          profileData.logs[logKey] = responseTime;
          profileLogs[profile] = profileData;

          // Save updated data
          chrome.storage.local.set({ profileLogs }, () => {
            // Update badge count for active tab
            updateBadgeForActiveTab();
            
            // Broadcast update to popup
            chrome.runtime.sendMessage({
              action: "apiLogsUpdated",
              profile: profile
            });
          });
        });
      });
    }
  },
  { urls: ["<all_urls>"] }
);

// Clean up if requests fail or are cancelled
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    requestDetails.delete(details.requestId);
  },
  { urls: ["<all_urls>"] }
);

// Listen for tab changes to update badge count
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) {
      updateBadgeForActiveTab();
    }
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getBadgeCount") {
    updateBadgeForActiveTab();
  } else if (request.action === "getProfileLogs") {
    // Handle request to get profile logs when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const profile = new URL(tabs[0].url).hostname;
      
      chrome.storage.local.get(['profileLogs'], (result) => {
        const profileLogs = result.profileLogs || {};
        const profileData = profileLogs[profile] || { logs: {} };
        
        // Send back the profile logs
        sendResponse({
          profile: profile,
          logs: profileData.logs
        });
      });
    });
    return true; // Indicates we wish to send a response asynchronously
  } else if (request.action === "clearProfileLogs") {
    const profile = request.profile;
    chrome.storage.local.get(['profileLogs'], (result) => {
      let profileLogs = result.profileLogs || {};
      delete profileLogs[profile];
      
      chrome.storage.local.set({ profileLogs }, () => {
        updateBadgeForActiveTab();
        sendResponse({ success: true });
      });
    });
    return true; // Indicates we wish to send a response asynchronously
  }
});