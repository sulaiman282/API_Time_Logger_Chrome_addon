document.addEventListener("DOMContentLoaded", () => {
  const logsContainer = document.getElementById("logs");
  const exportButton = document.getElementById("export");
  const clearButton = document.getElementById("clear");
  const filterButtons = document.querySelectorAll('.filter-btn');
  
  let currentProfile = '';
  let currentLogs = {};
  let activeFilter = 'All';

  // Load saved filter for domain
  async function loadSavedFilter(domain) {
    const result = await chrome.storage.local.get(['domainFilters']);
    const domainFilters = result.domainFilters || {};
    activeFilter = domainFilters[domain] || 'All';
    updateFilterButtons();
  }

  // Save filter for domain
  async function saveFilter(domain) {
    const result = await chrome.storage.local.get(['domainFilters']);
    const domainFilters = result.domainFilters || {};
    domainFilters[domain] = activeFilter;
    await chrome.storage.local.set({ domainFilters });
  }

  function updateFilterButtons() {
    filterButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === activeFilter);
    });
  }

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

  function formatResponseTime(ms) {
    return ms.toFixed(2).padStart(7) + 'ms';
  }

  function updateLogsDisplay(profileLogs) {
    currentLogs = profileLogs;
    console.log(`[Endpoint Eye] Updating logs display`, profileLogs);
    
    if (Object.keys(profileLogs).length === 0) {
      logsContainer.textContent = "No API calls logged yet.";
      return;
    }
    
    // Convert logs to an array and sort by log number
    const sortedLogs = Object.entries(profileLogs)
      .filter(([logKey]) => {
        if (activeFilter === 'All') return true;
        const requestType = getRequestType(logKey);
        return requestType === activeFilter;
      })
      .sort((a, b) => {
        const logNumA = parseInt(a[0].split('.')[0]);
        const logNumB = parseInt(b[0].split('.')[0]);
        return logNumA - logNumB;
      });
    
    const logs = sortedLogs
      .map(([logKey, responseTime]) => {
        // Format response time with 2 decimal places and fixed width
        return `${logKey} - ${formatResponseTime(responseTime)}`;
      })
      .join("\n");

    logsContainer.textContent = logs || "No matching logs found.";
  }

  async function fetchProfileLogs() {
    // Request profile logs from background script
    chrome.runtime.sendMessage({ action: "getProfileLogs" }, async (response) => {
      if (response && response.logs) {
        console.log(`[Endpoint Eye] Fetched logs for profile: ${response.profile}`, response.logs);
        currentProfile = response.profile;
        await loadSavedFilter(currentProfile);
        updateLogsDisplay(response.logs);
      }
    });
  }

  // Handle filter button clicks
  filterButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const filterType = btn.dataset.type;
      
      // If clicking the already active filter, do nothing
      if (filterType === activeFilter) return;
      
      activeFilter = filterType;
      updateFilterButtons();
      await saveFilter(currentProfile);
      updateLogsDisplay(currentLogs);
      
      // Update badge count with new filter
      chrome.runtime.sendMessage({ 
        action: "updateBadgeCount",
        filterType: activeFilter
      });
    });
  });

  exportButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const profile = new URL(tabs[0].url).hostname;

      chrome.storage.local.get(['profileLogs'], (result) => {
        const profileLogs = result.profileLogs || {};
        const profileData = profileLogs[profile] || { logs: {} };
        
        const filteredLogs = Object.fromEntries(
          Object.entries(profileData.logs).filter(([logKey]) => {
            if (activeFilter === 'All') return true;
            const requestType = getRequestType(logKey);
            return requestType === activeFilter;
          })
        );
        
        const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
          url: url,
          filename: `endpoint-eye-logs-${profile}-${new Date().toISOString()}.json`
        });
      });
    });
  });

  clearButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "clearLogs" }, async (response) => {
      if (response && response.success) {
        logsContainer.textContent = "Logs cleared.";
        currentLogs = {};
        // Reset filter to 'All' when clearing logs
        activeFilter = 'All';
        updateFilterButtons();
        await saveFilter(currentProfile);
        
        // Update badge count after clearing
        chrome.runtime.sendMessage({ 
          action: "updateBadgeCount",
          filterType: 'All'
        });
      }
    });
  });

  // Initial fetch of logs
  fetchProfileLogs();

  // Refresh logs and badge count on tab change
  chrome.tabs.onActivated.addListener(() => {
    fetchProfileLogs();
    chrome.runtime.sendMessage({ 
      action: "updateBadgeCount",
      filterType: activeFilter
    });
  });
});