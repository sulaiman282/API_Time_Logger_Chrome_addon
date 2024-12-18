document.addEventListener("DOMContentLoaded", () => {
    const logsContainer = document.getElementById("logs");
    const exportButton = document.getElementById("export");
    const clearButton = document.getElementById("clear");
  
    function updateLogs() {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const domain = new URL(tabs[0].url).hostname;
  
        chrome.storage.local.get([domain], (result) => {
          const domainData = result[domain] || {};
          const logs = Object.entries(domainData)
            .map(([endpoint, time]) => `${endpoint} - ${time.toFixed(2)} ms`)
            .join("\n");
  
          logsContainer.textContent = logs;
        });
      });
    }
  
    exportButton.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const domain = new URL(tabs[0].url).hostname;
  
        chrome.storage.local.get([domain], (result) => {
          const domainData = result[domain] || {};
          const blob = new Blob([JSON.stringify(domainData, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
  
          const a = document.createElement("a");
          a.href = url;
          a.download = `${domain}_logs.json`;
          a.click();
          URL.revokeObjectURL(url);
        });
      });
    });
  
    clearButton.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const domain = new URL(tabs[0].url).hostname;
  
        chrome.storage.local.remove([domain], () => {
          logsContainer.textContent = "";
          chrome.action.setBadgeText({ text: "" });
        });
      });
    });
  
    updateLogs();
  
    chrome.storage.onChanged.addListener(updateLogs);
  });
  