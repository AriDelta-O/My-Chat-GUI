# My-Chat-GUI Backend

A clean, simple FastAPI backend that streams responses from local Ollama models. 

Works on any platform that can run Python and Ollama:

* Windows
* Arch Linux
* Debian / Ubuntu
* Fedora

If the machine can run Python, it can run this.

---

## Features

* Multi-session chat system using lightweight UUID-based IDs
* Streaming AI responses via Ollama
* Optional per‑session system prompts
* Message history stored in memory
* REST API for any frontend to speak to
* Minimal, readable backend code

---

## Requirements

* Python 3.10+
* Ollama installed and working
* Basic ability to type commands

---

## Installation Guide

Copy-past stuff

### 1. Install Python

If you don't already have it:

* Arch: `sudo pacman -S python`
* Debian/Ubuntu: `sudo apt install python3 python3-pip`
* Fedora: `sudo dnf install python3 python3-pip`
* Windows: Download from python.org and check "Add to PATH". Don’t skip that.

### 2. Install Ollama

Install it from the official site. Once installed, test it:

```
ollama run llama3.2
```

If it prints something intelligent, you're good.

### 3. Install project dependencies

Inside this project folder:

```
pip install fastapi uvicorn ollama
```

### 4. Start the backend

Either:

```
python backend.py
```

Or the cleaner method:

```
uvicorn backend:app --reload --host 127.0.0.1 --port 8000
```

The API will be available at:

```
http://127.0.0.1:8000
```

---

## Frontend

The frontend is intentionally simple:

```
index.html
script.js
style.css
```

Open `index.html` in your browser. There is no build step.

---

## Project Structure

```
.
├── backend.py
├── index.html
├── script.js
└── style.css
```

Straightforward and maintainable.

---

## API Documentation

FastAPI generates docs for you at:

```
http://127.0.0.1:8000/docs
```

Everything is documented there automatically.

---

## About the AI Usage

Yes - I used AI to help write most of this project becuase I don't know what I am doing.

This backend uses Ollama, which runs models locally. Everything stays on your machine.

The message history is stored only in memory. Restart the backend and it's gone.

---

## Contributing

Fork it, modify it, break it, improve it. Standard open-source etiquette applies.

---

## License

MIT License.
