document.addEventListener("DOMContentLoaded", () => {

  // ===========================================================================
  // BASIC ELEMENTS
  // ===========================================================================
  const themeToggle = document.getElementById('themeToggle');
  const messagesEl = document.getElementById('messages');
  const promptForm = document.getElementById('promptForm');
  const promptInput = document.getElementById('promptInput');
  const clearBtn = document.getElementById('clearBtn');
  const toast = document.getElementById('toast');
  const modelSelect = document.getElementById('modelSelect');

  const sendBtn = document.getElementById("sendBtn");

  // Session control elements
  const sessionSelect = document.getElementById('sessionSelect');
  const newSessionBtn = document.getElementById('newSessionBtn');
  const renameSessionBtn = document.getElementById('renameSessionBtn');
  const deleteSessionBtn = document.getElementById('deleteSessionBtn');

  const memoryToggle = document.getElementById('memoryToggle');
  const tempSlider = document.getElementById('tempSlider');
  const topPSlider = document.getElementById('topPSlider');
  const tempValue = document.getElementById('tempValue');
  const topPValue = document.getElementById('topPValue');
  const systemPromptInput = document.getElementById('systemPromptInput');
  const saveSystemPromptBtn = document.getElementById('saveSystemPromptBtn');
  const modelInfoBtn = document.getElementById('modelInfoBtn');
  const modelInfoBox = document.getElementById('modelInfoBox');
  const modelInfoText = document.getElementById('modelInfoText');
  const tokenCounter = document.getElementById('tokenCounter');

  // Export/Import buttons
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');

  // Search elements
  const searchToggle = document.getElementById('searchToggle');
  const manualSearchInput = document.getElementById('manualSearchInput');
  const manualSearchBtn = document.getElementById('manualSearchBtn');

  // ===========================================================================
  // ENABLE SPELLCHECK + SMART INPUT
  // ===========================================================================
  promptInput.setAttribute("spellcheck", "true");
  promptInput.setAttribute("autocomplete", "on");
  promptInput.setAttribute("autocorrect", "on");
  promptInput.setAttribute("autocapitalize", "sentences");

  // ===========================================================================
  // AUTO-RESIZE INPUT
  // ===========================================================================
  function autoResize() {
    promptInput.style.height = "auto";
    promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px";
  }
  promptInput.addEventListener("input", autoResize);

  // ===========================================================================
  // SEND BUTTON ACTIVE STATE WITH CHATGPT-LIKE STATES
  // ===========================================================================
  function updateSendState() {
    if (promptInput.value.trim().length > 0) {
      sendBtn.classList.add("active");
      sendBtn.classList.remove("disabled");
      sendBtn.disabled = false;
    } else {
      sendBtn.classList.remove("active");
      sendBtn.classList.add("disabled");
      sendBtn.disabled = true;
    }
  }
  promptInput.addEventListener("input", () => {
    updateSendState();
    autoResize();
    updateTokenCount();
  });
  updateSendState();
  autoResize();

  // ===========================================================================
  // SLIDER: load and sync with VALUE DISPLAY (Feature #17)
  // ===========================================================================
  tempSlider.value = localStorage.getItem("temperature") || 1.0;
  topPSlider.value = localStorage.getItem("top_p") || 1.0;
  
  tempValue.textContent = parseFloat(tempSlider.value).toFixed(2);
  topPValue.textContent = parseFloat(topPSlider.value).toFixed(2);

  tempSlider.addEventListener("input", () => {
    localStorage.setItem("temperature", tempSlider.value);
    tempValue.textContent = parseFloat(tempSlider.value).toFixed(2);
  });
  topPSlider.addEventListener("input", () => {
    localStorage.setItem("top_p", topPSlider.value);
    topPValue.textContent = parseFloat(topPSlider.value).toFixed(2);
  });

  // ===========================================================================
  // SYSTEM PROMPT LOAD
  // ===========================================================================
  systemPromptInput.value = localStorage.getItem("systemPrompt") || "";

  // ===========================================================================
  // SEARCH SETTINGS
  // ===========================================================================
  // Load search preference
  searchToggle.checked = localStorage.getItem('enableSearch') !== 'false';

  searchToggle.addEventListener('change', () => {
    localStorage.setItem('enableSearch', searchToggle.checked);
    toastMsg(searchToggle.checked ? 'Web search enabled' : 'Web search disabled');
  });

  // Manual search function
  manualSearchBtn.addEventListener('click', async () => {
    const query = manualSearchInput.value.trim();
    if (!query) {
      toastMsg('Enter a search query');
      return;
    }
    
    try {
      manualSearchBtn.disabled = true;
      manualSearchBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 6v6l4 2"></path>
        </svg>
        Searching...
      `;
      
      const response = await fetch(`http://localhost:8000/api/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        // Display results in chat
        let resultsText = `Search results for "${query}":\n\n`;
        data.results.forEach((result, i) => {
          resultsText += `${i + 1}. **${result.title}**\n`;
          resultsText += `   ${result.url}\n`;
          resultsText += `   ${result.snippet.substring(0, 150)}...\n\n`;
        });
        
        messagesEl.appendChild(createMessage(resultsText, "ai"));
        scrollBottom();
        updateTokenCount();
        
        toastMsg(`Found ${data.results.length} results`);
      } else {
        toastMsg('No results found');
      }
      
      manualSearchInput.value = '';
    } catch (err) {
      toastMsg('Search failed');
      console.error('Search error:', err);
    } finally {
      manualSearchBtn.disabled = false;
      manualSearchBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        Search Web
      `;
    }
  });

  // Enter key for manual search
  manualSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      manualSearchBtn.click();
    }
  });

  // ===========================================================================
  // BACKEND AS SOURCE OF TRUTH (Feature #16 - Removed localStorage chat logs)
  // ===========================================================================
  async function loadChatLog(session_id) {
    messagesEl.innerHTML = "";
    
    try {
      const res = await fetch(`http://localhost:8000/api/sessions/${session_id}/messages`);
      const messages = await res.json();

      if (!messages || messages.length === 0) {
        messagesEl.appendChild(createMessage("New session. Say something!"));
        updateTokenCount();
        return;
      }

      messages.forEach(msg => {
        messagesEl.appendChild(createMessage(msg.content, msg.role === "user" ? "user" : "ai", msg.timestamp));
      });

      scrollBottom();
      updateTokenCount();
    } catch (err) {
      messagesEl.appendChild(createMessage("Error loading messages."));
    }
  }

  // ===========================================================================
  // TOKEN COUNTER (Feature #8)
  // ===========================================================================
  function estimateTokens(text) {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  function updateTokenCount() {
    const messages = messagesEl.querySelectorAll('.message');
    let totalChars = 0;
    
    messages.forEach(msg => {
      totalChars += msg.textContent.length;
    });
    
    totalChars += promptInput.value.length;
    
    const tokens = estimateTokens(totalChars);
    tokenCounter.textContent = `~${tokens} tokens`;
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================
  let currentSession = "";
  let autoScrollEnabled = true;

  async function loadSessions() {
    const res = await fetch("http://localhost:8000/api/sessions");
    const list = await res.json();

    sessionSelect.innerHTML = "";
    list.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.session_id;
      opt.textContent = s.name;
      sessionSelect.appendChild(opt);
    });

    if (!currentSession && list.length > 0) {
      currentSession = list[0].session_id;
      sessionSelect.value = currentSession;
      await loadChatLog(currentSession);
    }

    return list;
  }

  async function createSession() {
    const res = await fetch("http://localhost:8000/api/sessions/new", { method: "POST" });
    const data = await res.json();

    await loadSessions();
    currentSession = data.session_id;
    sessionSelect.value = currentSession;

    localStorage.removeItem("systemPrompt");
    systemPromptInput.value = "";

    await loadChatLog(currentSession);

    toastMsg("New session created.");
  }

  async function renameSession() {
    const newName = prompt("Enter new session name:");
    if (!newName) return;

    await fetch("http://localhost:8000/api/sessions/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: currentSession, new_name: newName })
    });

    await loadSessions();
    toastMsg("Session renamed.");
  }

  async function deleteSession() {
    const ok = confirm("Delete this session?");
    if (!ok) return;

    await fetch("http://localhost:8000/api/sessions/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: currentSession })
    });

    const sessions = await loadSessions();
    if (sessions.length > 0) {
      currentSession = sessions[0].session_id;
      sessionSelect.value = currentSession;
      await loadChatLog(currentSession);
    } else {
      currentSession = "";
      sessionSelect.innerHTML = "";
      messagesEl.innerHTML = "";
    }

    toastMsg("Session deleted.");
  }

  sessionSelect.addEventListener("change", async () => {
    currentSession = sessionSelect.value;
    toastMsg(`Switched to: ${currentSession}`);
    await loadChatLog(currentSession);
  });

  newSessionBtn.addEventListener("click", createSession);
  renameSessionBtn.addEventListener("click", renameSession);
  deleteSessionBtn.addEventListener("click", deleteSession);

  loadSessions();

  // ===========================================================================
  // MARKDOWN
  // ===========================================================================
  marked.setOptions({ breaks: true });

  // ===========================================================================
  // THEME TOGGLE
  // ===========================================================================
  const applyTheme = () => {
    const light = localStorage.getItem('theme') === 'light';
    document.body.classList.toggle('light', light);
    themeToggle.textContent = light ? '☀️' : '🌙';
  };
  applyTheme();

  themeToggle.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeToggle.textContent = isLight ? '☀️' : '🌙';
  });

  // ===========================================================================
  // TOAST
  // ===========================================================================
  function toastMsg(msg, duration = 2000) {
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.setAttribute('aria-hidden', 'false');
    setTimeout(() => { 
      toast.style.display = 'none'; 
      toast.setAttribute('aria-hidden', 'true');
    }, duration);
  }

  // ===========================================================================
  // MESSAGE HELPERS WITH TIMESTAMPS (Feature #13)
  // ===========================================================================
  function createMessage(text, cls = 'ai', timestamp = null) {
    const el = document.createElement('div');
    el.className = `message ${cls}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (cls === 'ai') {
      contentDiv.innerHTML = marked.parse(text);
    } else {
      contentDiv.textContent = text;
    }
    
    el.appendChild(contentDiv);
    
    // Add timestamp (Feature #13)
    if (timestamp || cls !== 'ai' || text !== "New session. Say something!") {
      const timeEl = document.createElement('div');
      timeEl.className = 'message-timestamp';
      const time = timestamp ? new Date(timestamp) : new Date();
      timeEl.textContent = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      el.appendChild(timeEl);
    }
    
    // Add message actions (Feature #6)
    if (cls === 'ai' && text !== "New session. Say something!" && !text.includes("...")) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'message-actions';
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn';
      copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      `;
      copyBtn.title = 'Copy';
      copyBtn.setAttribute('aria-label', 'Copy message');
      copyBtn.onclick = () => copyToClipboard(text);
      
      const regenerateBtn = document.createElement('button');
      regenerateBtn.className = 'action-btn';
      regenerateBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
      `;
      regenerateBtn.title = 'Regenerate';
      regenerateBtn.setAttribute('aria-label', 'Regenerate response');
      regenerateBtn.onclick = () => regenerateResponse(el);
      
      actionsDiv.appendChild(copyBtn);
      actionsDiv.appendChild(regenerateBtn);
      el.appendChild(actionsDiv);
    }
    
    return el;
  }

  // Copy to clipboard action (Feature #6)
  function copyToClipboard(text) {
    // Remove markdown rendering, get plain text
    const temp = document.createElement('div');
    temp.innerHTML = marked.parse(text);
    const plainText = temp.textContent;
    
    navigator.clipboard.writeText(plainText).then(() => {
      toastMsg('Copied to clipboard!');
    }).catch(() => {
      toastMsg('Failed to copy');
    });
  }

  // Regenerate response (Feature #6)
  async function regenerateResponse(messageEl) {
    // Find the previous user message
    let prevEl = messageEl.previousElementSibling;
    while (prevEl && !prevEl.classList.contains('user')) {
      prevEl = prevEl.previousElementSibling;
    }
    
    if (!prevEl) {
      toastMsg('Cannot find previous message');
      return;
    }
    
    const userText = prevEl.querySelector('.message-content').textContent;
    
    // Remove the AI message
    messageEl.remove();
    
    // Resend the request
    await sendMessage(userText, true);
  }

  // Auto-scroll control (Feature #10)
  let isUserScrolling = false;
  messagesEl.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = messagesEl;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    if (!isAtBottom && !isUserScrolling) {
      isUserScrolling = true;
      autoScrollEnabled = false;
    } else if (isAtBottom) {
      isUserScrolling = false;
      autoScrollEnabled = true;
    }
  });

  function scrollBottom() {
    if (autoScrollEnabled) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  // ===========================================================================
  // LOAD MODELS WITH INFO (Feature #9)
  // ===========================================================================
  let modelsList = [];

  async function loadModels() {
    try {
      const res = await fetch("http://localhost:8000/api/models");
      modelsList = await res.json();

      modelSelect.innerHTML = "";
      if (!modelsList || modelsList.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No models available";
        modelSelect.appendChild(opt);
        return;
      }

      modelsList.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.name;
        opt.textContent = m.name;
        modelSelect.appendChild(opt);
      });

      modelSelect.value = modelsList[0].name;

    } catch (err) {
      toastMsg("Could not load models.");
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Error loading models";
      modelSelect.appendChild(opt);
    }
  }
  loadModels();

  // ===========================================================================
  // MODEL INFO (Feature #9)
  // ===========================================================================
  modelInfoBtn.addEventListener("click", async () => {
    const name = modelSelect.value;
    if (!name) return;
    
    try {
      const res = await fetch(`http://localhost:8000/api/models/${encodeURIComponent(name)}`);
      const info = await res.json();
      
      modelInfoText.innerHTML = `
        <strong>Model:</strong> ${info.name}<br>
        <strong>Size:</strong> ${(info.size / 1e9).toFixed(2)} GB<br>
        <strong>Family:</strong> ${info.details?.family || 'N/A'}<br>
        <strong>Parameters:</strong> ${info.details?.parameter_size || 'N/A'}<br>
        <strong>Context:</strong> ${info.details?.context_length || 'N/A'} tokens<br>
        <strong>Format:</strong> ${info.details?.format || 'N/A'}
      `;
      modelInfoBox.classList.toggle("hidden");
    } catch (err) {
      modelInfoText.textContent = `Error loading model info: ${err.message}`;
      modelInfoBox.classList.remove("hidden");
    }
  });

  // ===========================================================================
  // EXPORT CONVERSATION (Feature #7)
  // ===========================================================================
  exportBtn.addEventListener('click', async () => {
    if (!currentSession) {
      toastMsg('No session to export');
      return;
    }
    
    try {
      const res = await fetch(`http://localhost:8000/api/sessions/${currentSession}/messages`);
      const messages = await res.json();
      
      const sessionName = sessionSelect.options[sessionSelect.selectedIndex].text;
      
      // Export as JSON
      const exportData = {
        session_name: sessionName,
        session_id: currentSession,
        exported_at: new Date().toISOString(),
        messages: messages
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sessionName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      toastMsg('Conversation exported!');
    } catch (err) {
      toastMsg('Export failed');
    }
  });

  // ===========================================================================
  // IMPORT CONVERSATION (Feature #7)
  // ===========================================================================
  importBtn.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.messages || !Array.isArray(data.messages)) {
        toastMsg('Invalid conversation file');
        return;
      }
      
      // Create new session
      const res = await fetch("http://localhost:8000/api/sessions/new", { method: "POST" });
      const newSession = await res.json();
      
      // Import messages
      await fetch(`http://localhost:8000/api/sessions/${newSession.session_id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: data.messages })
      });
      
      // Rename session if name exists
      if (data.session_name) {
        await fetch("http://localhost:8000/api/sessions/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            session_id: newSession.session_id, 
            new_name: data.session_name 
          })
        });
      }
      
      await loadSessions();
      currentSession = newSession.session_id;
      sessionSelect.value = currentSession;
      await loadChatLog(currentSession);
      
      toastMsg('Conversation imported!');
      e.target.value = '';
    } catch (err) {
      toastMsg('Import failed');
      e.target.value = '';
    }
  });

  // ===========================================================================
  // SEND MESSAGE (with typing indicator and search)
  // ===========================================================================
  async function sendMessage(userText, isRegenerate = false) {
    if (!currentSession) {
      toastMsg("Select or create a session first.");
      return;
    }
    if (!modelSelect.value) {
      toastMsg("Please select a model first.");
      return;
    }

    if (!isRegenerate) {
      messagesEl.appendChild(createMessage(userText, "user"));
      scrollBottom();
    }

    // Typing indicator
    const aiEl = document.createElement("div");
    aiEl.className = "message ai typing-indicator";
    aiEl.innerHTML = `
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot"></div>
    `;
    messagesEl.appendChild(aiEl);
    scrollBottom();

    // Send button loading state
    const iconSpan = sendBtn.querySelector('.icon');
    const spinnerSpan = sendBtn.querySelector('.spinner');
    iconSpan.style.display = 'none';
    spinnerSpan.style.display = 'inline-flex';
    sendBtn.classList.add("loading");
    sendBtn.disabled = true;

    const systemPrompt = localStorage.getItem("systemPrompt") || "";

    const params = new URLSearchParams({
      model: modelSelect.value,
      prompt: userText,
      session_id: currentSession,
      system_prompt: systemPrompt,
      temperature: localStorage.getItem("temperature") || "1",
      top_p: localStorage.getItem("top_p") || "1",
      enable_search: searchToggle.checked
    });

    const url = `http://localhost:8000/api/stream?${params.toString()}`;

    try {
      promptInput.disabled = true;

      const res = await fetch(url);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let finalText = "";

      // Remove typing indicator, add real message
      aiEl.remove();
      const realAiEl = document.createElement("div");
      realAiEl.className = "message ai";
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      realAiEl.appendChild(contentDiv);
      messagesEl.appendChild(realAiEl);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        finalText += chunk;
        contentDiv.innerHTML = marked.parse(finalText);
        scrollBottom();
      }

      // Add timestamp and actions
      const timeEl = document.createElement('div');
      timeEl.className = 'message-timestamp';
      timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      realAiEl.appendChild(timeEl);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'message-actions';
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn';
      copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      `;
      copyBtn.title = 'Copy';
      copyBtn.setAttribute('aria-label', 'Copy message');
      copyBtn.onclick = () => copyToClipboard(finalText);
      
      const regenerateBtn = document.createElement('button');
      regenerateBtn.className = 'action-btn';
      regenerateBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
      `;
      regenerateBtn.title = 'Regenerate';
      regenerateBtn.setAttribute('aria-label', 'Regenerate response');
      regenerateBtn.onclick = () => regenerateResponse(realAiEl);
      
      actionsDiv.appendChild(copyBtn);
      actionsDiv.appendChild(regenerateBtn);
      realAiEl.appendChild(actionsDiv);

      updateTokenCount();

    } catch (err) {
      aiEl.className = "message ai";
      aiEl.innerHTML = "[Error: Backend unreachable]";
    } finally {
      promptInput.disabled = false;
      iconSpan.style.display = 'inline';
      spinnerSpan.style.display = 'none';
      sendBtn.classList.remove("loading");
      sendBtn.disabled = false;
      updateSendState();
    }
  }

  promptForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userText = promptInput.value.trim();
    if (!userText) return;
    
    promptInput.value = "";
    autoResize();
    updateSendState();
    
    await sendMessage(userText);
  });

  // ===========================================================================
  // CLEAR CHAT + BACKEND MEMORY
  // ===========================================================================
  clearBtn.addEventListener("click", async () => {
    if (!currentSession) return toastMsg("No session selected.");

    try {
      await fetch("http://localhost:8000/api/sessions/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: currentSession })
      });

      await loadChatLog(currentSession);

      toastMsg("Chat cleared and session memory reset.");
    } catch (err) {
      toastMsg("Error clearing session memory.");
    }
  });

  // ===========================================================================
  // KEYBOARD SHORTCUTS (Feature #12)
  // ===========================================================================
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + K: New session
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      createSession();
    }
    
    // Cmd/Ctrl + /: Focus input
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      promptInput.focus();
    }
    
    // ESC: Unfocus input (stop generation would require backend support)
    if (e.key === 'Escape') {
      promptInput.blur();
    }
  });

  // ===========================================================================
  // ENTER KEY SUBMIT
  // ===========================================================================
  promptInput.addEventListener("keydown", (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      promptForm.requestSubmit();
    }
  });

  // ===========================================================================
  // SAVE SYSTEM PROMPT
  // ===========================================================================
  saveSystemPromptBtn.addEventListener("click", () => {
    const sys = systemPromptInput.value.trim();

    if (sys === "") {
      localStorage.removeItem("systemPrompt");
      toastMsg("System prompt cleared.");
    } else {
      localStorage.setItem("systemPrompt", sys);
      toastMsg("System prompt saved.");
    }
  });

});