document.addEventListener("DOMContentLoaded", () => {
  const logsContainer = document.getElementById("logs");
  const exportButton = document.getElementById("export");
  const clearButton = document.getElementById("clear");
  const filterButtons = document.querySelectorAll('.filter-btn');
  
  let currentProfile = '';
  let currentLogs = {};
  let activeFilters = new Set(['All']);

  // Load saved filters for domain
  async function loadSavedFilters(domain) {
    const result = await chrome.storage.local.get(['domainFilters']);
    const domainFilters = result.domainFilters || {};
    if (domainFilters[domain]) {
      activeFilters = new Set(domainFilters[domain]);
      updateFilterButtons();
    } else {
      activeFilters = new Set(['All']);
      updateFilterButtons();
    }
  }

  // Save filters for domain
  async function saveFilters(domain) {
    const result = await chrome.storage.local.get(['domainFilters']);
    const domainFilters = result.domainFilters || {};
    domainFilters[domain] = Array.from(activeFilters);
    await chrome.storage.local.set({ domainFilters });
  }

  function updateFilterButtons() {
    filterButtons.forEach(btn => {
      btn.classList.toggle('active', activeFilters.has(btn.dataset.type));
    });
  }

  function getRequestType(logKey) {
    const parts = logKey.split('.');
    if (parts.length < 3) return 'Other';
    
    const method = parts[1];
    const path = parts[2].toLowerCase();
    
    if (method === 'GET' || method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH') {
      return 'Fetch/XHR';
    }
    
    if (path.endsWith('.js')) return 'JS';
    if (path.endsWith('.css')) return 'CSS';
    if (path.endsWith('.html') || path.endsWith('.htm')) return 'Doc';
    if (path.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/)) return 'Img';
    if (path.match(/\.(woff|woff2|ttf|otf|eot)$/)) return 'Font';
    if (path.match(/\.(mp4|webm|ogg|mp3|wav)$/)) return 'Media';
    if (path.endsWith('.wasm')) return 'Wasm';
    if (path.endsWith('manifest.json')) return 'Manifest';
    if (path.startsWith('ws://') || path.startsWith('wss://')) return 'WS';
    
    return 'Other';
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
        if (activeFilters.has('All')) return true;
        const requestType = getRequestType(logKey);
        return activeFilters.has(requestType);
      })
      .sort((a, b) => {
        const logNumA = parseInt(a[0].split('.')[0]);
        const logNumB = parseInt(b[0].split('.')[0]);
        return logNumA - logNumB;
      });
    
    const logs = sortedLogs
      .map(([logKey, responseTime]) => {
        const type = getRequestType(logKey);
        return `[${type}] ${logKey} - ${responseTime.toFixed(2)}ms`;
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
        await loadSavedFilters(currentProfile);
        updateLogsDisplay(response.logs);
      }
    });
  }

  // Handle filter button clicks
  filterButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const filterType = btn.dataset.type;
      
      if (filterType === 'All') {
        activeFilters.clear();
        activeFilters.add('All');
      } else {
        activeFilters.delete('All');
        if (activeFilters.has(filterType)) {
          activeFilters.delete(filterType);
          if (activeFilters.size === 0) {
            activeFilters.add('All');
          }
        } else {
          activeFilters.add(filterType);
        }
      }
      
      updateFilterButtons();
      await saveFilters(currentProfile);
      updateLogsDisplay(currentLogs);
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
            if (activeFilters.has('All')) return true;
            const requestType = getRequestType(logKey);
            return activeFilters.has(requestType);
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
    chrome.runtime.sendMessage({ action: "clearLogs" }, (response) => {
      if (response && response.success) {
        logsContainer.textContent = "Logs cleared.";
        currentLogs = {};
      }
    });
  });

  // Initial fetch of logs
  fetchProfileLogs();

  // Refresh logs on tab change
  chrome.tabs.onActivated.addListener(fetchProfileLogs);
});