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

  // NEW ELEMENTS
  const sessionSelect = document.getElementById('sessionSelect');
  const newSessionBtn = document.getElementById('newSessionBtn');
  const renameSessionBtn = document.getElementById('renameSessionBtn');
  const resetSessionBtn = document.getElementById('resetSessionBtn');
  const deleteSessionBtn = document.getElementById('deleteSessionBtn');
  const memoryToggle = document.getElementById('memoryToggle');
  const tempSlider = document.getElementById('tempSlider');
  const topPSlider = document.getElementById('topPSlider');
  const systemPromptInput = document.getElementById('systemPromptInput');
  const saveSystemPromptBtn = document.getElementById('saveSystemPromptBtn');
  const modelInfoBtn = document.getElementById('modelInfoBtn');
  const modelInfoBox = document.getElementById('modelInfoBox');
  const modelInfoText = document.getElementById('modelInfoText');


  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  // Current session ID used by the chat
  let currentSession = "";

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
    }

    return list;
  }

  async function createSession() {
    const res = await fetch("http://localhost:8000/api/sessions/new", {
      method: "POST"
    });
    const data = await res.json();

    await loadSessions();
    currentSession = data.session_id;
    sessionSelect.value = currentSession;
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
    } else {
      currentSession = "";
      sessionSelect.innerHTML = "";
    }
    toastMsg("Session deleted.");
  }

  async function resetSession() {
    await fetch("http://localhost:8000/api/sessions/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: currentSession })
    });

    toastMsg("Session memory cleared.");
  }

  sessionSelect.addEventListener("change", () => {
    currentSession = sessionSelect.value;
    toastMsg(`Switched to session: ${currentSession}`);
  });

  newSessionBtn.addEventListener("click", createSession);
  renameSessionBtn.addEventListener("click", renameSession);
  deleteSessionBtn.addEventListener("click", deleteSession);
  resetSessionBtn.addEventListener("click", resetSession);

  // Load sessions initially
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
    setTimeout(() => { toast.style.display = 'none'; }, duration);
  }


  // ===========================================================================
  // MESSAGE HELPERS
  // ===========================================================================
  function createMessage(text, cls = 'ai') {
    const el = document.createElement('div');
    el.className = `message ${cls}`;

    if (cls === 'ai') el.innerHTML = marked.parse(text);
    else el.textContent = text;

    return el;
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }


  // ===========================================================================
  // WELCOME MESSAGE
  // ===========================================================================
  messagesEl.appendChild(createMessage("Welcome to My-Chat-GUI — ready when you are!"));
  scrollBottom();


  // ===========================================================================
  // LOAD MODELS
  // ===========================================================================
  async function loadModels() {
    try {
      const res = await fetch("http://localhost:8000/api/models");
      const models = await res.json();

      modelSelect.innerHTML = "";
      models.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        modelSelect.appendChild(opt);
      });

    } catch (err) {
      toastMsg("Could not load models.");
    }
  }
  loadModels();


  // ===========================================================================
  // MODEL INFO
  // ===========================================================================
  modelInfoBtn.addEventListener("click", () => {
    const name = modelSelect.value;
    if (!name) return;

    // For now we show basic info (Ollama list does not return details)
    modelInfoText.textContent = `Model: ${name}\nNo extended info available.`;
    modelInfoBox.classList.toggle("hidden");
  });


  // ===========================================================================
  // SEND MESSAGE (STREAMING)
  // ===========================================================================
  promptForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentSession) return toastMsg("Select or create a session first.");

    const userText = promptInput.value.trim();
    if (!userText) return;

    // Show user message
    messagesEl.appendChild(createMessage(userText, "user"));
    promptInput.value = "";
    scrollBottom();

    // Placeholder AI message
    const aiEl = document.createElement("div");
    aiEl.className = "message ai";
    aiEl.innerHTML = "...";
    messagesEl.appendChild(aiEl);
    scrollBottom();

    const params = new URLSearchParams({
      model: modelSelect.value,
      prompt: userText,
      session_id: currentSession
    });

    const url = `http://localhost:8000/api/stream?${params.toString()}`;

    try {
      promptInput.disabled = true;

      const res = await fetch(url);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let finalText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        finalText += chunk;
        aiEl.innerHTML = marked.parse(finalText);
        scrollBottom();
      }

    } catch (err) {
      aiEl.innerHTML = "[Error: Backend unreachable]";
    } finally {
      promptInput.disabled = false;
    }
  });


  // ===========================================================================
  // CLEAR CHAT
  // ===========================================================================
  clearBtn.addEventListener("click", () => {
    messagesEl.innerHTML = "";
    messagesEl.appendChild(createMessage("Chat cleared. Say hi!"));
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
  // SYSTEM PROMPT APPLY
  // ===========================================================================
  saveSystemPromptBtn.addEventListener("click", () => {
    const sys = systemPromptInput.value.trim();
    localStorage.setItem("systemPrompt", sys);
    toastMsg("System prompt saved.");
  });

});
