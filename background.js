// Store start times of requests
const requestTimes = new Map();

// Track when requests start
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    requestTimes.set(details.requestId, details.timeStamp);
  },
  { urls: ["<all_urls>"] }
);

// Track when requests complete and calculate response time
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const startTime = requestTimes.get(details.requestId);
    if (!startTime) return;

    const responseTime = details.timeStamp - startTime;
    requestTimes.delete(details.requestId);

    const domain = new URL(details.url).hostname;
    
    // Only log API calls (adjust these conditions based on your needs)
    if (details.type === 'xmlhttprequest' || details.url.includes('/api/')) {
      // Fetch domain-specific data
      chrome.storage.local.get([domain], (result) => {
        const domainData = result[domain] || {};
        const endpoint = details.url;

        // Update only if response time is higher
        if (!domainData[endpoint] || domainData[endpoint] < responseTime) {
          domainData[endpoint] = responseTime;

          // Save updated data
          chrome.storage.local.set({ [domain]: domainData }, () => {
            // Update badge count after saving
            const count = Object.keys(domainData).length;
            chrome.action.setBadgeText({ text: count.toString() });
          });
        }
      });
    }
  },
  { urls: ["<all_urls>"] }
);

// Clean up if requests fail or are cancelled
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    requestTimes.delete(details.requestId);
  },
  { urls: ["<all_urls>"] }
);