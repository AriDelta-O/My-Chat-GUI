document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById('themeToggle');
  const messagesEl = document.getElementById('messages');
  const promptForm = document.getElementById('promptForm');
  const promptInput = document.getElementById('promptInput');
  const clearBtn = document.getElementById('clearBtn');
  const toast = document.getElementById('toast');
  const sessionInfo = document.getElementById('sessionInfo');
  const connectBtn = document.getElementById('connectBtn');
  const modelSelect = document.getElementById('modelSelect');

  // --- Enable line breaks in Markdown ---
  marked.setOptions({ breaks: true });

  // --- Theme toggle ---
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

  // --- Toast helper ---
  function toastMsg(msg, duration=2500){
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.setAttribute('aria-hidden', 'false');
    setTimeout(()=>{
      toast.style.display='none';
      toast.setAttribute('aria-hidden','true');
    }, duration);
  }

  // --- Create message bubble ---
  function createMessage(text, cls='ai'){
    const el = document.createElement('div');
    el.className = `message ${cls}`;
    el.textContent = text;

    // Only user messages get the tilt effect
    if(cls === 'user'){
      el.setAttribute('data-tilt','1');
      el.addEventListener('mousemove', e=>{
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) - r.width/2;
        const y = (e.clientY - r.top) - r.height/2;
        el.style.transform = `perspective(700px) rotateX(${-(y / r.height)*6}deg) rotateY(${(x / r.width)*6}deg)`;
      });
      el.addEventListener('mouseleave', ()=>{ el.style.transform='none'; });
    }

    return el;
  }

  function scrollBottom(){ messagesEl.scrollTop = messagesEl.scrollHeight; }

  // --- Initial welcome message ---
  messagesEl.appendChild(createMessage('Welcome to My-Chat-GUI — ready when you are!', 'ai'));
  scrollBottom();

  // --- Load models from backend ---
  async function loadModels() {
    if (!modelSelect) return;
    try {
      const res = await fetch('http://localhost:8000/api/models');
      const data = await res.json();
      data.forEach(m=>{
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        modelSelect.appendChild(opt);
      });
      if(data.length>0){
        sessionInfo.textContent = `Connected — Model: ${modelSelect.value}`;
      } else {
        sessionInfo.textContent = "No models available";
        toastMsg("No models found on backend");
      }
    } catch(err) {
      toastMsg("Cannot fetch models from backend");
      sessionInfo.textContent = "Not connected";
      console.error(err);
    }
  }
  loadModels();

  modelSelect.addEventListener('change', ()=>{
    sessionInfo.textContent = `Connected — Model: ${modelSelect.value}`;
  });

  // --- Send prompt & stream response ---
  promptForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const prompt = promptInput.value.trim();
    if(!prompt) return;

    // Add user message
    messagesEl.appendChild(createMessage(prompt, 'user'));
    promptInput.value = '';
    scrollBottom();

    // Add bot placeholder
    const aiEl = createMessage('...', 'ai');
    messagesEl.appendChild(aiEl);
    scrollBottom();

    const model = modelSelect.value || "gemma3:1b";
    const url = `http://localhost:8000/api/stream?model=${encodeURIComponent(model)}&prompt=${encodeURIComponent(prompt)}`;

    try {
      promptInput.disabled = true;
      const res = await fetch(url);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';
      aiEl.textContent = ''; // clear placeholder

      while(true){
        const { value, done } = await reader.read();
        if(done) break;
        buffer += decoder.decode(value, {stream:true});
        aiEl.innerHTML = marked.parse(buffer); // Render Markdown
        scrollBottom();
      }

      sessionInfo.textContent = `Connected — Model: ${model} — Last streamed: ${new Date().toLocaleTimeString()}`;
    } catch(err){
      aiEl.textContent = "[Error: Could not reach backend]";
      sessionInfo.textContent = "Not connected";
      toastMsg("Backend unreachable. Is uvicorn running?");
      console.error(err);
    } finally {
      promptInput.disabled = false;
    }
  });

  // --- Clear chat ---
  clearBtn.addEventListener('click', ()=>{
    messagesEl.innerHTML = '';
    messagesEl.appendChild(createMessage('Chat cleared. Say hi!', 'ai'));
  });

  // --- Connect button (placeholder) ---
  connectBtn.addEventListener('click', ()=>{ toastMsg("Streaming enabled via backend."); });

  // --- Submit on Enter ---
  promptInput.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' && !e.shiftKey){
      e.preventDefault();
      promptForm.requestSubmit();
    }
  });

});