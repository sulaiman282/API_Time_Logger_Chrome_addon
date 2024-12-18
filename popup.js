document.addEventListener("DOMContentLoaded", () => {
    const logsContainer = document.getElementById("logs");
    const exportButton = document.getElementById("export");
    const clearButton = document.getElementById("clear");
  
    function updateLogsDisplay(profileLogs) {
      console.log(`[Popup] Updating logs display`, profileLogs);
      
      if (Object.keys(profileLogs).length === 0) {
        logsContainer.textContent = "No API calls logged yet.";
        return;
      }
      
      // Convert logs to an array and sort by log number
      const sortedLogs = Object.entries(profileLogs)
        .sort((a, b) => {
          // Extract log number from the key
          const logNumA = parseInt(a[0].split('.')[0]);
          const logNumB = parseInt(b[0].split('.')[0]);
          return logNumA - logNumB;
        });
      
      const logs = sortedLogs
        .map(([logKey, responseTime]) => {
          // The logKey already contains the log number, method, and endpoint
          return `${logKey} - ${responseTime.toFixed(2)}ms`;
        })
        .join("\n");

      logsContainer.textContent = logs;
    }
  
    function fetchProfileLogs() {
      // Request profile logs from background script
      chrome.runtime.sendMessage({ action: "getProfileLogs" }, (response) => {
        if (response && response.logs) {
          console.log(`[Popup] Fetched logs for profile: ${response.profile}`, response.logs);
          updateLogsDisplay(response.logs);
        }
      });
    }
  
    exportButton.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const profile = new URL(tabs[0].url).hostname;
  
        chrome.storage.local.get(['profileLogs'], (result) => {
          const profileLogs = result.profileLogs || {};
          const profileData = profileLogs[profile] || { logs: {} };
          
          const blob = new Blob([JSON.stringify(profileData.logs, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
  
          const a = document.createElement("a");
          a.href = url;
          a.download = `${profile}_logs.json`;
          a.click();
          URL.revokeObjectURL(url);
        });
      });
    });
  
    clearButton.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const profile = new URL(tabs[0].url).hostname;
  
        // Send message to background script to clear profile logs
        chrome.runtime.sendMessage({ 
          action: "clearProfileLogs", 
          profile: profile 
        }, (response) => {
          if (response && response.success) {
            logsContainer.textContent = "Logs cleared.";
          }
        });
      });
    });
  
    // Listen for updates from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "apiLogsUpdated") {
        console.log(`[Popup] Received logs update for profile: ${request.profile}`);
        fetchProfileLogs();
      }
    });
  
    // Request badge count maintenance when popup opens
    chrome.runtime.sendMessage({ action: "getBadgeCount" });
  
    // Fetch logs when popup opens
    fetchProfileLogs();
});