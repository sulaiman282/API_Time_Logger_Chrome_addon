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
          lastLogNumber: 0,
          endpointMap: {}
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

// Function to get request type
function getRequestType(url) {
  if (!url) return 'Other';
  
  const urlLower = url.toLowerCase();
  const method = url.split(' ')[1]; // Get the HTTP method
  
  if (method === 'GET' || method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH') {
    if (urlLower.includes('/api/') || urlLower.includes('/graphql')) return 'Fetch/XHR';
  }
  
  if (urlLower.endsWith('.js')) return 'JS';
  if (urlLower.endsWith('.css')) return 'CSS';
  if (urlLower.endsWith('.html') || urlLower.endsWith('.htm')) return 'Doc';
  if (urlLower.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/)) return 'Img';
  if (urlLower.match(/\.(woff|woff2|ttf|otf|eot)$/)) return 'Font';
  if (urlLower.match(/\.(mp4|webm|ogg|mp3|wav)$/)) return 'Media';
  if (urlLower.endsWith('.wasm')) return 'Wasm';
  if (urlLower.endsWith('manifest.json')) return 'Manifest';
  if (urlLower.startsWith('ws://') || urlLower.startsWith('wss://')) return 'WS';
  
  return 'Other';
}

// Function to update badge count for the current active tab
function updateBadgeForActiveTab(filterType = 'All') {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const profile = new URL(tabs[0].url).hostname;
      
      chrome.storage.local.get(['profileLogs'], (result) => {
        const profileLogs = result.profileLogs || {};
        const profileData = profileLogs[profile] || { logs: {} };
        
        // Filter logs based on type
        const filteredCount = Object.keys(profileData.logs).filter(logKey => {
          if (filterType === 'All') return true;
          return getRequestType(logKey) === filterType;
        }).length;
        
        debugLog(`Badge count for active tab (${profile}): ${filteredCount}`);
        chrome.action.setBadgeText({ text: filteredCount > 0 ? filteredCount.toString() : "" });
      });
    }
  });
}

// Enhanced request tracking for all API calls
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Ignore non-http(s) requests
    if (!details.url.startsWith('http')) return;

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
    // Ignore non-http(s) requests
    if (!details.url.startsWith('http')) return;

    const requestId = details.requestId;
    const requestInfo = requestDetails.get(requestId);

    if (requestInfo) {
      const endTime = Date.now();
      const responseTime = endTime - requestInfo.startTime;
      const url = new URL(requestInfo.url);

      // Remove request from tracking
      requestDetails.delete(requestId);

      // Get profile logs and save the log
      chrome.storage.local.get(['profileLogs'], (result) => {
        let profileLogs = result.profileLogs || {};
        let profileData = profileLogs[requestInfo.profile] || { 
          logs: {}, 
          lastLogNumber: 0,
          endpointMap: {}
        };

        // Create unique endpoint identifier including query params
        const endpointKey = `${requestInfo.method}:${url.pathname}${url.search}`;
        const existingLogNumber = profileData.endpointMap[endpointKey];

        if (existingLogNumber) {
          // Compare response times and keep the highest
          const existingLogKey = `${existingLogNumber}. ${requestInfo.method} ${url.protocol}//${url.host}${url.pathname}${url.search}`;
          const existingResponseTime = profileData.logs[existingLogKey];

          if (responseTime > existingResponseTime) {
            // Update with new higher response time
            profileData.logs[existingLogKey] = responseTime;
          }
        } else {
          // Increment log number for new endpoint
          profileData.lastLogNumber++;
          const logKey = `${profileData.lastLogNumber}. ${requestInfo.method} ${url.protocol}//${url.host}${url.pathname}${url.search}`;
          
          // Store log entry and map the endpoint
          profileData.logs[logKey] = responseTime;
          profileData.endpointMap[endpointKey] = profileData.lastLogNumber;
        }

        profileLogs[requestInfo.profile] = profileData;

        // Save updated logs
        chrome.storage.local.set({ profileLogs }, () => {
          debugLog(`Logged request: ${endpointKey} - ${responseTime}ms`);
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
        return true;
      }
    });
    return true;
  } else if (request.action === "updateBadgeCount") {
    updateBadgeForActiveTab(request.filterType);
    sendResponse({ success: true });
    return true;
  } else if (request.action === "clearLogs") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const profile = new URL(tabs[0].url).hostname;
        
        chrome.storage.local.get(['profileLogs'], (result) => {
          let profileLogs = result.profileLogs || {};
          
          // Clear logs for the current profile
          if (profileLogs[profile]) {
            profileLogs[profile] = {
              logs: {},
              lastLogNumber: 0,
              endpointMap: {}
            };
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