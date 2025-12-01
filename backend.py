from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import uuid
import ollama

app = FastAPI(title="My-Chat-GUI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sessions stored in memory
# sessions = {
#   session_id: {
#       "name": "...",
#       "messages": [ {role, content}, ... ],
#       "system_prompt": "..."
#   }
# }
sessions = {}

# --------------------------
#  SESSION MANAGEMENT ROUTES
# --------------------------

@app.get("/api/sessions")
async def get_sessions():
    return [{"session_id": sid, "name": data["name"]} for sid, data in sessions.items()]


@app.post("/api/sessions/new")
async def new_session():
    sid = str(uuid.uuid4())[:8]
    sessions[sid] = {"name": f"Session {len(sessions) + 1}", "messages": [], "system_prompt": ""}
    return {"session_id": sid, "name": sessions[sid]["name"]}


@app.post("/api/sessions/rename")
async def rename_session(request: Request):
    data = await request.json()
    sid = data.get("session_id")
    new_name = data.get("new_name")

    if sid not in sessions:
        return JSONResponse(content={"error": "Session not found"}, status_code=404)

    sessions[sid]["name"] = new_name
    return {"success": True}


@app.post("/api/sessions/delete")
async def delete_session(request: Request):
    data = await request.json()
    sid = data.get("session_id")

    if sid in sessions:
        del sessions[sid]
        return {"success": True}

    return JSONResponse(content={"error": "Session not found"}, status_code=404)


@app.post("/api/sessions/reset")
async def reset_session(request: Request):
    """
    Clears conversation history AND stored system_prompt for the session.
    """
    data = await request.json()
    sid = data.get("session_id")

    if sid not in sessions:
        return JSONResponse(content={"error": "Session not found"}, status_code=404)

    sessions[sid]["messages"] = []
    sessions[sid]["system_prompt"] = ""
    return {"success": True}


# --------------------------
#          MODELS
# --------------------------

@app.get("/api/models")
async def get_models():
    try:
        res = ollama.list()
        return [m["model"] for m in res["models"]]
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# --------------------------
#        STREAMING HELPERS
# --------------------------

def remove_system_roles_from_history(history):
    """Return a history list without any messages whose role is 'system'."""
    return [m for m in history if m.get("role") != "system"]


async def stream_ollama(model: str, session_id: str, user_prompt: str, system_prompt: str):
    """
    Streams response from Ollama with:
      - session-level system_prompt (updated when provided)
      - previous conversation memory (with any old system roles removed)
      - user message appended
      - assistant reply appended after streaming
    """

    # Ensure session exists
    if session_id not in sessions:
        sessions[session_id] = {"name": f"Session {len(sessions)+1}", "messages": [], "system_prompt": ""}

    sess = sessions[session_id]

    # If a system_prompt param was provided (even empty), update stored system_prompt.
    # The caller must pass system_prompt explicitly to change/clear it.
    if system_prompt is not None:
        # normalize to string
        sess["system_prompt"] = system_prompt

    # Remove any previous system role entries from memory to avoid persistence
    sess["messages"] = remove_system_roles_from_history(sess.get("messages", []))

    # Build messages list to send to model
    messages = []

    # Include system prompt only if non-empty
    stored_sys = (sess.get("system_prompt") or "").strip()
    if stored_sys:
        messages.append({"role": "system", "content": stored_sys})

    # Add conversation memory (user/assistant pairs)
    messages.extend(sess.get("messages", []))

    # Append the new user message
    messages.append({"role": "user", "content": user_prompt})

    # Save the new user message into session memory
    sess["messages"].append({"role": "user", "content": user_prompt})

    try:
        # Stream from ollama (using their chat API)
        stream = ollama.chat(model=model, messages=messages, stream=True)

        collected = ""
        for chunk in stream:
            if "message" in chunk and "content" in chunk["message"]:
                text = chunk["message"]["content"]
                collected += text
                yield text
                await asyncio.sleep(0)
        # Save assistant reply to session memory
        sess["messages"].append({"role": "assistant", "content": collected})

    except Exception as e:
        yield f"[Error: {e}]"


@app.get("/api/stream")
async def stream_response(model: str = "",
                          prompt: str = "",
                          session_id: str = "default",
                          system_prompt: str = None):
    """
    Frontend calls:
      /api/stream?model=...&prompt=...&session_id=...&system_prompt=...
    NOTE: If system_prompt parameter is provided (even empty string) it will
    update the session's stored system prompt immediately.
    """

    if not model or not prompt:
        return JSONResponse({"error": "model and prompt required"}, status_code=400)

    async def gen():
        async for part in stream_ollama(model, session_id, prompt, system_prompt):
            yield part

    return StreamingResponse(gen(), media_type="text/plain")


# --------------------------
#        DEV SERVER
# --------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
