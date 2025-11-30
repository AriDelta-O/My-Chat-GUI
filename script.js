document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById('themeToggle');
  const messagesEl = document.getElementById('messages');
  const promptForm = document.getElementById('promptForm');
  const promptInput = document.getElementById('promptInput');
  const clearBtn = document.getElementById('clearBtn');
  const toast = document.getElementById('toast');
  const sessionInfo = document.getElementById('sessionIdText');
  const connectBtn = document.getElementById('connectBtn');
  const modelSelect = document.getElementById('modelSelect');

  // --------------------------------------------------------------------
  // 1) SESSION ID (Conversation Memory)
  // --------------------------------------------------------------------
  if (!document.body.dataset.sessionId) {
    document.body.dataset.sessionId = crypto.randomUUID();
  }
  const sessionId = document.body.dataset.sessionId;
  sessionInfo.textContent = sessionId;

  // --------------------------------------------------------------------
  // 2) Markdown Options
  // --------------------------------------------------------------------
  marked.setOptions({ breaks: true });

  // --------------------------------------------------------------------
  // 3) Theme toggle
  // --------------------------------------------------------------------
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

  // --------------------------------------------------------------------
  // 4) Toast message
  // --------------------------------------------------------------------
  function toastMsg(msg, duration = 2500) {
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      toast.style.display = 'none';
      toast.setAttribute('aria-hidden', 'true');
    }, duration);
  }

  // --------------------------------------------------------------------
  // 5) Create message bubble
  // --------------------------------------------------------------------
  function createMessage(text, cls = 'ai') {
    const el = document.createElement('div');
    el.className = `message ${cls}`;

    // Allow markdown in AI messages
    if (cls === 'ai') {
      el.innerHTML = marked.parse(text);
    } else {
      el.textContent = text;
    }

    // Tilt effect (user only)
    if (cls === 'user') {
      el.setAttribute('data-tilt', '1');
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) - r.width / 2;
        const y = (e.clientY - r.top) - r.height / 2;
        el.style.transform = `perspective(700px) rotateX(${-(y / r.height) * 6}deg) rotateY(${(x / r.width) * 6}deg)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = 'none'; });
    }

    return el;
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // --------------------------------------------------------------------
  // 6) Welcome message
  // --------------------------------------------------------------------
  messagesEl.appendChild(createMessage('Welcome to My-Chat-GUI — ready when you are!'));
  scrollBottom();

  // --------------------------------------------------------------------
  // 7) Load models
  // --------------------------------------------------------------------
  async function loadModels() {
    try {
      const res = await fetch('http://localhost:8000/api/models');
      const models = await res.json();

      modelSelect.innerHTML = '';

      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        modelSelect.appendChild(opt);
      });

      if (models.length > 0) {
        toastMsg(`Loaded ${models.length} models`);
      } else {
        toastMsg("No models found");
      }
    } catch (err) {
      toastMsg("Cannot fetch models from backend");
      console.error(err);
    }
  }
  loadModels();

  // --------------------------------------------------------------------
  // 8) Stream messages from backend with memory
  // --------------------------------------------------------------------
  promptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    // Show user message
    messagesEl.appendChild(createMessage(prompt, 'user'));
    promptInput.value = '';
    scrollBottom();

    // Placeholder for AI
    const aiEl = document.createElement('div');
    aiEl.className = 'message ai';
    aiEl.innerHTML = "...";
    messagesEl.appendChild(aiEl);
    scrollBottom();

    const model = modelSelect.value;
    const url =
      `http://localhost:8000/api/stream?model=${encodeURIComponent(model)}`
      + `&prompt=${encodeURIComponent(prompt)}`
      + `&session_id=${encodeURIComponent(sessionId)}`;

    try {
      promptInput.disabled = true;

      const res = await fetch(url);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let finalText = "";

      // Streaming loop
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        finalText += chunk;

        aiEl.innerHTML = marked.parse(finalText);
        scrollBottom();
      }

    } catch (err) {
      aiEl.innerHTML = "[Error: Could not reach backend]";
      toastMsg("Backend unreachable. Is uvicorn running?");
      console.error(err);
    } finally {
      promptInput.disabled = false;
    }
  });

  // --------------------------------------------------------------------
  // 9) Clear chat
  // --------------------------------------------------------------------
  clearBtn.addEventListener('click', () => {
    messagesEl.innerHTML = '';
    messagesEl.appendChild(createMessage('Chat cleared. Say hi!'));
  });

  connectBtn.addEventListener('click', () => {
    toastMsg("Streaming enabled via backend.");
  });

  // --------------------------------------------------------------------
  // 10) Enter to submit
  // --------------------------------------------------------------------
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      promptForm.requestSubmit();
    }
  });

});
