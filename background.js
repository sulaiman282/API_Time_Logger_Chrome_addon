chrome.webRequest.onCompleted.addListener(
    (details) => {
      const domain = new URL(details.url).hostname;
  
      // Fetch domain-specific data
      chrome.storage.local.get([domain], (result) => {
        const domainData = result[domain] || {};
        const endpoint = details.url;
  
        // Update only if response time is higher
        if (!domainData[endpoint] || domainData[endpoint] < details.timeStamp) {
          domainData[endpoint] = details.timeStamp;
  
          // Save updated data
          chrome.storage.local.set({ [domain]: domainData });
        }
      });
  
      // Update badge count
      chrome.storage.local.get([domain], (result) => {
        const count = Object.keys(result[domain] || {}).length;
        chrome.action.setBadgeText({ text: count.toString() });
      });
    },
    { urls: ["<all_urls>"] } // Monitor all URLs
  );
  