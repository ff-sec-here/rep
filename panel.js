// panel.js

// State
let requests = [];
let selectedRequest = null;
let currentFilter = 'all';
let currentSearchTerm = '';
let useRegex = false;
let requestHistory = [];
let historyIndex = -1;

const STAR_ICON_FILLED = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
const STAR_ICON_OUTLINE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.01 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>';

// DOM Elements
const requestList = document.getElementById('request-list');
const searchBar = document.getElementById('search-bar');
const regexToggle = document.getElementById('regex-toggle');
const rawRequestInput = document.getElementById('raw-request-input');
const useHttpsCheckbox = document.getElementById('use-https');
const sendBtn = document.getElementById('send-btn');
const rawResponseDisplay = document.getElementById('raw-response-display');
const resStatus = document.getElementById('res-status');
const resTime = document.getElementById('res-time');
const historyBackBtn = document.getElementById('history-back');
const historyFwdBtn = document.getElementById('history-fwd');
const copyReqBtn = document.getElementById('copy-req-btn');
const copyResBtn = document.getElementById('copy-res-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNetworkListener();
    setupEventListeners();
    setupResizeHandle();
    setupSidebarResize();

    // Global error handler to catch any uncaught errors
    window.addEventListener('error', (e) => {
        console.error('Global error caught:', e.error);
        if (rawResponseDisplay) {
            rawResponseDisplay.textContent = `UNCAUGHT ERROR: \n${e.error} \n\nCheck console for details.`;
            rawResponseDisplay.style.display = 'block';
        }
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
        if (rawResponseDisplay) {
            rawResponseDisplay.textContent = `PROMISE REJECTION: \n${e.reason} \n\nCheck console for details.`;
            rawResponseDisplay.style.display = 'block';
        }
    });
});

function setupNetworkListener() {
    chrome.devtools.network.onRequestFinished.addListener((request) => {
        // Filter out data URLs or extension schemes
        if (!request.request.url.startsWith('http')) return;

        // Filter out static resources (JS, CSS, images, fonts, etc.)
        const url = request.request.url.toLowerCase();
        const staticExtensions = [
            '.js', '.css', '.map',
            '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
            '.woff', '.woff2', '.ttf', '.eot', '.otf',
            '.mp4', '.webm', '.mp3', '.wav',
            '.pdf', '.zip', '.tar', '.gz'
        ];

        // Check if URL ends with any static extension
        const isStatic = staticExtensions.some(ext => {
            return url.endsWith(ext) || url.includes(ext + '?');
        });

        if (isStatic) {
            console.log('Skipping static resource:', request.request.url);
            return;
        }

        // Store the capture time for relative time display
        request.capturedAt = Date.now();
        
        requests.push(request);
        renderRequestItem(request, requests.length - 1);
    });
}

function formatTime(capturedAt) {
    if (!capturedAt) return '';
    
    const date = new Date(capturedAt);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function renderRequestItem(request, index) {
    const item = document.createElement('div');
    item.className = 'request-item';
    if (request.starred) item.classList.add('starred');
    item.dataset.index = index;
    item.dataset.method = request.request.method;

    const methodSpan = document.createElement('span');
    methodSpan.className = `req-method ${request.request.method}`;
    methodSpan.textContent = request.request.method;

    const urlSpan = document.createElement('span');
    urlSpan.className = 'req-url';

    try {
        const urlObj = new URL(request.request.url);
        urlSpan.textContent = urlObj.pathname + urlObj.search;
    } catch (e) {
        urlSpan.textContent = request.request.url;
    }
    urlSpan.title = request.request.url;

    // Time span
    const timeSpan = document.createElement('span');
    timeSpan.className = 'req-time';
    timeSpan.textContent = formatTime(request.capturedAt);
    if (request.capturedAt) {
        const date = new Date(request.capturedAt);
        timeSpan.title = date.toLocaleTimeString();
    }

    // Actions container
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'item-actions';

    // Star Button
    const starBtn = document.createElement('button');
    starBtn.className = `star-btn ${request.starred ? 'active' : ''}`;
    starBtn.innerHTML = request.starred ? STAR_ICON_FILLED : STAR_ICON_OUTLINE;

    starBtn.title = request.starred ? 'Unstar' : 'Star request';
    starBtn.onclick = (e) => {
        e.stopPropagation();
        toggleStar(request);
    };

    actionsDiv.appendChild(starBtn);

    item.appendChild(methodSpan);
    item.appendChild(urlSpan);
    item.appendChild(timeSpan);
    item.appendChild(actionsDiv);

    item.addEventListener('click', () => selectRequest(index));

    // Remove empty state if present
    const emptyState = requestList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    requestList.appendChild(item);
    filterRequests();
}

function toggleStar(request) {
    request.starred = !request.starred;
    console.log('Toggled star:', request.starred, request.request.url);

    const requestIndex = requests.indexOf(request);
    if (requestIndex !== -1) {
        const item = requestList.querySelector(`.request-item[data-index="${requestIndex}"]`);
        if (item) {
            item.classList.toggle('starred', request.starred);
            const starBtn = item.querySelector('.star-btn');
            if (starBtn) {
                starBtn.classList.toggle('active', request.starred);
                starBtn.innerHTML = request.starred ? STAR_ICON_FILLED : STAR_ICON_OUTLINE;
                starBtn.title = request.starred ? 'Unstar' : 'Star request';
            }
        }
    }

    // Refresh list while maintaining scroll position
    const scrollTop = requestList.scrollTop;
    filterRequests();
    requestList.scrollTop = scrollTop;
}

function selectRequest(index) {
    selectedRequest = requests[index];

    // Highlight in list
    document.querySelectorAll('.request-item').forEach(el => el.classList.remove('selected'));
    requestList.children[index].classList.add('selected');

    // Parse URL
    const urlObj = new URL(selectedRequest.request.url);
    const path = urlObj.pathname + urlObj.search;
    const method = selectedRequest.request.method;
    const httpVersion = selectedRequest.request.httpVersion || 'HTTP/1.1';

    // Set HTTPS toggle
    useHttpsCheckbox.checked = urlObj.protocol === 'https:';

    // Construct Raw Request
    // Line 1: METHOD PATH VERSION
    let rawText = `${method} ${path} ${httpVersion} \n`;

    // Host Header (Ensure it's present and maybe first?)
    // Filter out existing Host header to avoid duplicates if we re-add it,
    // but usually we just list what was captured.
    // However, for clarity, let's just dump headers as is.
    // If Host is missing in captured headers (rare), we might want to add it.

    let headers = selectedRequest.request.headers;

    // Check if Host header exists
    const hasHost = headers.some(h => h.name.toLowerCase() === 'host');
    if (!hasHost) {
        rawText += `Host: ${urlObj.host} \n`;
    }

    rawText += headers
        .map(h => `${h.name}: ${h.value} `)
        .join('\n');

    // Body
    if (selectedRequest.request.postData && selectedRequest.request.postData.text) {
        let bodyText = selectedRequest.request.postData.text;

        // Try to beautify JSON
        try {
            const jsonBody = JSON.parse(bodyText);
            bodyText = JSON.stringify(jsonBody, null, 2);
        } catch (e) {
            // Not JSON or invalid JSON, use as-is
        }

        rawText += '\n\n' + bodyText;
    }

    rawRequestInput.innerHTML = highlightHTTP(rawText);

    // Initialize History
    requestHistory = [];
    historyIndex = -1;
    addToHistory(rawText, useHttpsCheckbox.checked);

    // Clear Response
    rawResponseDisplay.textContent = '';
    resStatus.textContent = '';
    resStatus.className = 'status-badge';
    resTime.textContent = '';
}

function setupEventListeners() {
    // Send Request
    sendBtn.addEventListener('click', async () => {
        await sendRequest();
    });

    // Search Bar
    searchBar.addEventListener('input', (e) => {
        currentSearchTerm = useRegex ? e.target.value : e.target.value.toLowerCase();
        filterRequests();
    });

    // Regex Toggle
    regexToggle.addEventListener('click', () => {
        useRegex = !useRegex;
        regexToggle.classList.toggle('active', useRegex);
        
        // Update search term based on mode
        if (useRegex) {
            currentSearchTerm = searchBar.value;
            searchBar.placeholder = 'Filter with regex (e.g., /user/\\d+)...';
        } else {
            currentSearchTerm = searchBar.value.toLowerCase();
            searchBar.placeholder = 'Filter requests...';
        }
        
        filterRequests();
    });

    // Filter Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active state
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            // Update filter
            currentFilter = e.target.dataset.filter;
            filterRequests();
        });
    });

    // History Navigation
    historyBackBtn.addEventListener('click', () => {
        if (historyIndex > 0) {
            historyIndex--;
            loadHistoryState(historyIndex);
        }
    });

    historyFwdBtn.addEventListener('click', () => {
        if (historyIndex < requestHistory.length - 1) {
            historyIndex++;
            loadHistoryState(historyIndex);
        }
    });

    // Copy Buttons
    copyReqBtn.addEventListener('click', () => {
        const text = rawRequestInput.innerText;
        copyToClipboard(text, copyReqBtn);
    });

    copyResBtn.addEventListener('click', () => {
        const text = rawResponseDisplay.innerText;
        copyToClipboard(text, copyResBtn);
    });
}

async function copyToClipboard(text, btn) {
    try {
        // Try modern API first
        await navigator.clipboard.writeText(text);
        showCopySuccess(btn);
    } catch (err) {
        console.warn('Clipboard API failed, trying fallback:', err);

        // Fallback: create temporary textarea
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;

            // Ensure it's not visible but part of DOM
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            textArea.style.top = '0';
            document.body.appendChild(textArea);

            textArea.focus();
            textArea.select();

            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (successful) {
                showCopySuccess(btn);
            } else {
                throw new Error('execCommand copy failed');
            }
        } catch (fallbackErr) {
            console.error('Copy failed:', fallbackErr);
            // Show error state on button
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#f28b82"/></svg>';
            setTimeout(() => {
                btn.innerHTML = originalHtml;
            }, 1500);
        }
    }
}

function showCopySuccess(btn) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="#81c995"/></svg>';

    setTimeout(() => {
        btn.innerHTML = originalHtml;
    }, 1500);
}

function testRegex(pattern, text) {
    try {
        const regex = new RegExp(pattern);
        return regex.test(text);
    } catch (e) {
        // Invalid regex pattern - don't match anything
        return false;
    }
}

function filterRequests() {
    const items = requestList.querySelectorAll('.request-item');
    let visibleCount = 0;
    let regexError = false;

    items.forEach((item, index) => {
        const request = requests[parseInt(item.dataset.index)];
        if (!request) return;

        const url = request.request.url;
        const urlLower = url.toLowerCase();
        const method = request.request.method.toUpperCase();

        // Build searchable text from headers
        let headersText = '';
        let headersTextLower = '';
        if (request.request.headers) {
            request.request.headers.forEach(header => {
                const headerLine = `${header.name}: ${header.value} `;
                headersText += headerLine;
                headersTextLower += headerLine.toLowerCase();
            });
        }

        // Get request body if available
        let bodyText = '';
        let bodyTextLower = '';
        if (request.request.postData && request.request.postData.text) {
            bodyText = request.request.postData.text;
            bodyTextLower = bodyText.toLowerCase();
        }

        // Check search term (search in URL, method, headers, and body)
        let matchesSearch = false;
        if (currentSearchTerm === '') {
            matchesSearch = true;
        } else if (useRegex) {
            // Use regex matching
            try {
                const regex = new RegExp(currentSearchTerm);
                matchesSearch = 
                    regex.test(url) ||
                    regex.test(method) ||
                    regex.test(headersText) ||
                    regex.test(bodyText);
            } catch (e) {
                // Invalid regex - mark error but don't break the loop
                if (!regexError) {
                    regexError = true;
                    console.warn('Invalid regex pattern:', currentSearchTerm, e);
                }
                matchesSearch = false;
            }
        } else {
            // Plain text matching (case-insensitive)
            matchesSearch = 
                urlLower.includes(currentSearchTerm) ||
                method.includes(currentSearchTerm.toUpperCase()) ||
                headersTextLower.includes(currentSearchTerm) ||
                bodyTextLower.includes(currentSearchTerm);
        }

        // Check filter
        let matchesFilter = true;
        if (currentFilter !== 'all') {
            // Filter by Method or Starred
            if (currentFilter === 'starred') {
                matchesFilter = request.starred;
            } else {
                matchesFilter = method === currentFilter;
            }
        }

        // Show/hide item
        if (matchesSearch && matchesFilter) {
            item.style.display = 'flex';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });

    // Show error state if regex is invalid
    if (regexError && useRegex && currentSearchTerm) {
        regexToggle.classList.add('error');
        regexToggle.title = 'Invalid regex pattern';
    } else {
        regexToggle.classList.remove('error');
        regexToggle.title = useRegex 
            ? 'Regex mode enabled (click to disable)' 
            : 'Toggle Regex Mode (enable to use regex patterns)';
    }

    // Show empty state if no results
    const emptyState = requestList.querySelector('.empty-state');
    if (visibleCount === 0 && items.length > 0) {
        if (!emptyState) {
            const div = document.createElement('div');
            div.className = 'empty-state';
            div.textContent = regexError && useRegex && currentSearchTerm
                ? 'Invalid regex pattern'
                : 'No requests match your filter';
            requestList.appendChild(div);
        } else {
            emptyState.textContent = regexError && useRegex && currentSearchTerm
                ? 'Invalid regex pattern'
                : 'No requests match your filter';
        }
    } else if (emptyState && visibleCount > 0) {
        emptyState.remove();
    }
}

function addToHistory(rawText, useHttps) {
    // Don't add if same as current
    if (historyIndex >= 0) {
        const current = requestHistory[historyIndex];
        if (current.rawText === rawText && current.useHttps === useHttps) {
            return;
        }
    }

    // If we are in the middle of history and make a change, discard future history
    if (historyIndex < requestHistory.length - 1) {
        requestHistory = requestHistory.slice(0, historyIndex + 1);
    }

    requestHistory.push({ rawText, useHttps });
    historyIndex = requestHistory.length - 1;
    updateHistoryButtons();
}

function loadHistoryState(index) {
    const state = requestHistory[index];
    if (!state) return;

    rawRequestInput.innerHTML = highlightHTTP(state.rawText);
    useHttpsCheckbox.checked = state.useHttps;
    updateHistoryButtons();
}

function updateHistoryButtons() {
    historyBackBtn.disabled = historyIndex <= 0;
    historyFwdBtn.disabled = historyIndex >= requestHistory.length - 1;
}




async function sendRequest() {
    console.log('=== SEND REQUEST STARTED ===');

    // Ensure response display is visible and clear
    rawResponseDisplay.textContent = 'Processing request...';
    rawResponseDisplay.style.display = 'block';
    resStatus.textContent = 'Preparing...';
    resStatus.className = 'status-badge';
    resTime.textContent = '';

    try {
        const rawContent = rawRequestInput.innerText.trim();
        const useHttps = useHttpsCheckbox.checked;

        // Add to history
        addToHistory(rawContent, useHttps);

        const scheme = useHttps ? 'https' : 'http';

        console.log('Raw content length:', rawContent.length);

        // Parse Raw Content
        const lines = rawContent.split('\n');
        if (lines.length === 0) {
            throw new Error('No content to send');
        }

        // Parse Request Line
        const requestLine = lines[0].trim();
        const reqLineParts = requestLine.split(' ');
        if (reqLineParts.length < 2) {
            throw new Error('Invalid Request Line. Format: METHOD PATH HTTP/1.1');
        }

        const method = reqLineParts[0].toUpperCase();
        const path = reqLineParts[1];

        console.log('Method:', method, 'Path:', path);

        // Split Headers and Body
        let headers = {};
        let bodyText = null;
        let isBody = false;
        let host = '';

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];

            if (!isBody) {
                if (line.trim() === '') {
                    isBody = true;
                    continue;
                }

                // Skip HTTP/2 pseudo-headers (start with :)
                if (line.trim().startsWith(':')) {
                    console.log('Skipping HTTP/2 pseudo-header:', line.trim());
                    continue;
                }

                const colonIndex = line.indexOf(':');
                if (colonIndex > 0) {
                    const key = line.substring(0, colonIndex).trim();
                    const value = line.substring(colonIndex + 1).trim();

                    if (key && value) {
                        if (key.toLowerCase() === 'host') {
                            host = value;
                        } else {
                            headers[key] = value;
                        }
                    }
                }
            } else {
                // Body content
                if (bodyText === null) bodyText = line;
                else bodyText += '\n' + line;
            }
        }

        if (!host) {
            throw new Error('Host header is missing!');
        }

        console.log('Host:', host);
        console.log('Headers count:', Object.keys(headers).length);
        console.log('Body length:', bodyText ? bodyText.length : 0);

        const url = `${scheme}://${host}${path}`;

        // Filter out forbidden headers
        const forbiddenHeaders = [
            'accept-charset', 'accept-encoding', 'access-control-request-headers',
            'access-control-request-method', 'connection', 'content-length',
            'cookie', 'cookie2', 'date', 'dnt', 'expect', 'host', 'keep-alive',
            'origin', 'referer', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via'
        ];

        const filteredHeaders = {};
        for (const [key, value] of Object.entries(headers)) {
            const lowerKey = key.toLowerCase();
            const isForbidden = forbiddenHeaders.includes(lowerKey) ||
                lowerKey.startsWith('sec-') ||
                lowerKey.startsWith('proxy-');

            if (!isForbidden) {
                if (/^[a-zA-Z0-9\-_]+$/.test(key)) {
                    filteredHeaders[key] = value;
                }
            }
        }

        console.log('Original headers:', Object.keys(headers));
        console.log('Filtered headers:', Object.keys(filteredHeaders));

        const options = {
            method: method,
            headers: filteredHeaders,
            mode: 'cors',
            credentials: 'omit'
        };

        if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && bodyText) {
            options.body = bodyText;
        }

        resStatus.textContent = 'Sending...';
        resStatus.className = 'status-badge';
        const startTime = performance.now();

        console.log('Sending request to:', url);
        console.log('Method:', method);
        console.log('Headers:', filteredHeaders);

        const response = await fetch(url, options);

        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(0);
        resTime.textContent = `${duration}ms`;

        console.log('Response received:', response.status, response.statusText);

        const responseBody = await response.text();

        console.log('Response body length:', responseBody.length);

        // Display Status
        resStatus.textContent = `${response.status} ${response.statusText}`;
        if (response.status >= 200 && response.status < 300) {
            resStatus.className = 'status-badge status-2xx';
        } else if (response.status >= 400 && response.status < 500) {
            resStatus.className = 'status-badge status-4xx';
        } else if (response.status >= 500) {
            resStatus.className = 'status-badge status-5xx';
        }

        // Build raw HTTP response
        let rawResponse = `HTTP/1.1 ${response.status} ${response.statusText}\n`;

        for (const [key, value] of response.headers) {
            rawResponse += `${key}: ${value}\n`;
        }

        rawResponse += '\n';

        // Try to format JSON
        try {
            const json = JSON.parse(responseBody);
            rawResponse += JSON.stringify(json, null, 2);
        } catch (e) {
            // Not JSON, display as-is
            rawResponse += responseBody;
        }

        console.log('Setting response display text, length:', rawResponse.length);

        // Apply syntax highlighting to response
        rawResponseDisplay.innerHTML = highlightHTTP(rawResponse);

        // Force visibility
        rawResponseDisplay.style.display = 'block';
        rawResponseDisplay.style.visibility = 'visible';

        // Check if it's actually visible
        const computedStyle = window.getComputedStyle(rawResponseDisplay);
        console.log('Response display computed style:', {
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            height: computedStyle.height,
            width: computedStyle.width
        });

        const responsePane = document.querySelector('.response-pane');
        const responsePaneStyle = window.getComputedStyle(responsePane);
        const responsePaneWidth = parseInt(responsePaneStyle.width);

        console.log('Response pane computed style:', {
            display: responsePaneStyle.display,
            flex: responsePaneStyle.flex,
            width: responsePaneStyle.width,
            widthPx: responsePaneWidth
        });

        // Safety check: if response pane is collapsed, force it open
        if (responsePaneWidth < 100) {
            console.warn('Response pane is collapsed! Forcing it open...');
            const requestPane = document.querySelector('.request-pane');
            requestPane.style.flex = '0 0 50%';
            responsePane.style.flex = '0 0 50%';
            console.log('Panes forced to 50/50 split');
        }

        console.log('Response displayed successfully');
        console.log('=== SEND REQUEST COMPLETED ===');

    } catch (err) {
        console.error('=== REQUEST FAILED ===');
        console.error('Error:', err);
        console.error('Stack:', err.stack);

        resStatus.textContent = 'Error';
        resStatus.className = 'status-badge status-5xx';
        resTime.textContent = '0ms';

        let errorMsg = `Error: ${err.message}\n\n`;

        if (err.message === 'Failed to fetch') {
            errorMsg += 'Possible causes:\n';
            errorMsg += '- Invalid Host header or URL\n';
            errorMsg += '- Network connection issue\n';
            errorMsg += '- CORS policy blocking the request\n';
            errorMsg += '- Mixed Content (sending HTTP request from HTTPS context)\n';
            errorMsg += '- Server is unreachable\n\n';
        }

        errorMsg += `Type: ${err.name}\n`;
        if (err.stack) {
            errorMsg += `Stack: ${err.stack}\n`;
        }

        // Use innerHTML to allow styling if needed, but keep it simple for now
        // We can reuse the syntax highlighter if we format it like a response, 
        // but plain text is clearer for errors.
        rawResponseDisplay.textContent = errorMsg;
        rawResponseDisplay.style.display = 'block';

        console.log('=== ERROR DISPLAYED ===');
    }
}

let resizeInitialized = false;

function setupResizeHandle() {
    if (resizeInitialized) {
        console.log('Resize already initialized, skipping');
        return;
    }

    const resizeHandle = document.querySelector('.pane-resize-handle');
    const requestPane = document.querySelector('.request-pane');
    const responsePane = document.querySelector('.response-pane');
    const container = document.querySelector('.main-content');

    if (!resizeHandle || !requestPane || !responsePane) {
        console.warn('Resize elements not found');
        return;
    }

    // Only reset flex on first load if not already set
    if (!requestPane.style.flex || requestPane.style.flex === '') {
        requestPane.style.flex = '1';
        responsePane.style.flex = '1';
        console.log('Panes initialized to 50/50 split');
    } else {
        console.log('Preserving existing pane sizes:', requestPane.style.flex, responsePane.style.flex);
    }

    let isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeHandle.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        console.log('Resize started');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const containerRect = container.getBoundingClientRect();
        const offsetX = e.clientX - containerRect.left;
        const containerWidth = containerRect.width;

        // Calculate percentage (between 20% and 80%)
        let percentage = (offsetX / containerWidth) * 100;
        percentage = Math.max(20, Math.min(80, percentage));

        requestPane.style.flex = `0 0 ${percentage}%`;
        responsePane.style.flex = `0 0 ${100 - percentage}%`;
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            console.log('Resize ended. New sizes:', requestPane.style.flex, responsePane.style.flex);
        }
    });

    resizeInitialized = true;
    console.log('Resize handler initialized');
}

function setupSidebarResize() {
    const resizeHandle = document.querySelector('.sidebar-resize-handle');
    const sidebar = document.querySelector('.sidebar');

    if (!resizeHandle || !sidebar) return;

    let isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeHandle.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const newWidth = e.clientX;
        // Constraints (min 150px, max 600px)
        if (newWidth >= 150 && newWidth <= 600) {
            sidebar.style.width = `${newWidth}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}
