// Store request timings
const requestTimings = new Map();

// Function to log debug information
function debugLog(message) {
  console.log(`[API Logger] ${message}`);
}

// Get or initialize profile logs
function getProfileLogs(profile) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['profileLogs'], (result) => {
      let profileLogs = result.profileLogs || {};
      if (!profileLogs[profile]) {
        profileLogs[profile] = {
          logs: {},
          lastLogNumber: 0,
          endpointMap: {}
        };
      }
      chrome.storage.local.set({ profileLogs }, () => {
        resolve(profileLogs[profile]);
      });
    });
  });
}

// Function to get request type
function getRequestType(url, type = '') {
  if (!url) return 'Other';
  
  const urlLower = url.toLowerCase();
  
  // Check for API endpoints first
  if (urlLower.includes('/api/') || 
      urlLower.includes('/graphql') || 
      urlLower.includes('/v1/') || 
      urlLower.includes('/v2/') ||
      urlLower.match(/\.(json|xml)$/)) {
    return 'Fetch/XHR';
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

// Update badge count
function updateBadgeCount(tabId) {
  chrome.tabs.get(tabId, (tab) => {
    if (tab && tab.url) {
      const profile = new URL(tab.url).hostname;
      chrome.storage.local.get(['profileLogs', 'currentFilter'], (result) => {
        const profileLogs = result.profileLogs || {};
        const profileData = profileLogs[profile] || { logs: {} };
        const filterType = result.currentFilter || 'All';
        
        const count = Object.keys(profileData.logs).filter(logKey => {
          if (filterType === 'All') return true;
          return getRequestType(logKey) === filterType;
        }).length;
        
        chrome.action.setBadgeText({ 
          text: count > 0 ? count.toString() : '',
          tabId: tabId
        });
      });
    }
  });
}

// Track request start
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!details.url.startsWith('http')) return;
    
    requestTimings.set(details.requestId, {
      startTime: Date.now(),
      method: details.method,
      url: details.url,
      type: details.type
    });
  },
  { urls: ["<all_urls>"] }
);

// Track request completion
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (!details.url.startsWith('http')) return;
    
    const timing = requestTimings.get(details.requestId);
    if (!timing) return;
    
    const endTime = Date.now();
    const responseTime = endTime - timing.startTime;
    const url = new URL(details.url);
    const profile = url.hostname;
    
    // Get profile logs
    const profileData = await getProfileLogs(profile);
    
    // Create endpoint key
    const endpointKey = `${timing.method}:${url.pathname}${url.search}`;
    const existingLogNumber = profileData.endpointMap[endpointKey];
    
    if (existingLogNumber) {
      // Update existing log if response time is higher
      const existingLogKey = `${existingLogNumber}. ${timing.method} ${url.protocol}//${url.host}${url.pathname}${url.search}`;
      const existingResponseTime = profileData.logs[existingLogKey];
      
      if (responseTime > existingResponseTime) {
        profileData.logs[existingLogKey] = responseTime;
      }
    } else {
      // Add new log entry
      profileData.lastLogNumber++;
      const logKey = `${profileData.lastLogNumber}. ${timing.method} ${url.protocol}//${url.host}${url.pathname}${url.search}`;
      
      profileData.logs[logKey] = responseTime;
      profileData.endpointMap[endpointKey] = profileData.lastLogNumber;
    }
    
    // Save updated logs
    chrome.storage.local.get(['profileLogs'], (result) => {
      const profileLogs = result.profileLogs || {};
      profileLogs[profile] = profileData;
      
      chrome.storage.local.set({ profileLogs }, () => {
        updateBadgeCount(details.tabId);
        
        // Notify popup about new log
        chrome.runtime.sendMessage({
          action: "newLogAdded",
          profile: profile,
          logs: profileData.logs
        });
      });
    });
    
    requestTimings.delete(details.requestId);
  },
  { urls: ["<all_urls>"] }
);

// Clean up failed requests
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    requestTimings.delete(details.requestId);
  },
  { urls: ["<all_urls>"] }
);

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getProfileLogs") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const profile = new URL(tabs[0].url).hostname;
        chrome.storage.local.get(['profileLogs'], (result) => {
          const profileLogs = result.profileLogs || {};
          const profileData = profileLogs[profile] || { logs: {} };
          sendResponse({ profile, logs: profileData.logs });
        });
      }
    });
    return true;
  }
  
  if (request.action === "clearLogs") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const profile = new URL(tabs[0].url).hostname;
        chrome.storage.local.get(['profileLogs'], (result) => {
          const profileLogs = result.profileLogs || {};
          profileLogs[profile] = {
            logs: {},
            lastLogNumber: 0,
            endpointMap: {}
          };
          
          chrome.storage.local.set({ profileLogs }, () => {
            updateBadgeCount(tabs[0].id);
            sendResponse({ success: true });
          });
        });
      }
    });
    return true;
  }
  
  if (request.action === "updateBadgeCount") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        updateBadgeCount(tabs[0].id);
        sendResponse({ success: true });
      }
    });
    return true;
  }
});