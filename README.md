# API Response Time Logger by Sulaiman

### Author: Sk Sulaiman

---

## Project Description

The **API Response Time Logger** is a Google Chrome extension designed to monitor, log, and display REST API calls made from the currently active browser tab. The extension tracks the following details for each API call:
- **Endpoint URL**
- **Response time (ms)**

### Core Features

1. **Automatic Logging**
   - Logs all REST API calls made from the current tab.
   - Automatically creates a domain-specific JSON object in Chrome's local storage for storing API data.
   - Continues logging even when the popup is not open.

2. **Domain-Specific Storage**
   - Saves API data in a JSON object specific to the current domain.
   - Automatically persists data across tab reloads and Chrome restarts.

3. **Filtering**
   - If the same API endpoint is logged multiple times, only keeps the one with the highest response time.

4. **Badge Count**
   - Displays the total count of logged API calls for the current domain over the extension's icon in real time.

5. **Popup UI**
   - Displays the logged API calls for the current domain in a scrollable code block.
   - Allows users to:
     - **Export Logs**: Download the domain-specific JSON as a `.json` file.
     - **Clear Logs**: Delete the saved API logs for the active domain.

6. **Responsive Design**
   - Real-time updates of logs in the popup.
   - Clean and user-friendly UI.

---

## Directory Structure

```plaintext
API_Time_Logger/
│
├── icons/                  # Folder containing extension icons
│   ├── logo.png
│   ├── logo.png
│   ├── logo.png
│
├── manifest.json           # Chrome extension manifest file
│
├── background.js           # Service worker handling background tasks
│
├── popup.html              # HTML file for the popup interface
│
├── popup.js                # JavaScript handling popup functionality
│
├── styles.css              # CSS for popup styling
│
└── README.md               # Documentation file
