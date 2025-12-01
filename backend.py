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
    sessions[sid] = {"name": f"Session {len(sessions) + 1}", "messages": []}
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
    data = await request.json()
    sid = data.get("session_id")

    if sid not in sessions:
        return JSONResponse(content={"error": "Session not found"}, status_code=404)

    sessions[sid]["messages"] = []
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
#        STREAMING
# --------------------------

async def stream_ollama(model: str, session_id: str, user_prompt: str, system_prompt: str):
    """
    Streams response from Ollama with:
      ✔ system prompt included
      ✔ full conversation memory
      ✔ correct formatting for models that ignore system messages
    """

    # Create session if missing
    if session_id not in sessions:
        sessions[session_id] = {"name": f"Session {len(sessions)+1}", "messages": []}

    memory = sessions[session_id]["messages"]

    # Build messages list
    messages = []

    # Add system prompt ONLY if provided
    if system_prompt.strip():
        messages.append({"role": "system", "content": system_prompt.strip()})

    # Add memory from previous turns
    messages.extend(memory)

    # Add the new user message
    messages.append({"role": "user", "content": user_prompt})

    # Save user message to session memory now
    memory.append({"role": "user", "content": user_prompt})

    try:
        # Stream completion
        stream = ollama.chat(model=model, messages=messages, stream=True)

        collected = ""

        for chunk in stream:
            if "message" in chunk and "content" in chunk["message"]:
                text = chunk["message"]["content"]
                collected += text
                yield text
                await asyncio.sleep(0)

        # Save assistant reply
        memory.append({"role": "assistant", "content": collected})

    except Exception as e:
        yield f"[Error: {e}]"


@app.get("/api/stream")
async def stream_response(model: str = "",
                          prompt: str = "",
                          session_id: str = "default",
                          system_prompt: str = ""):
    """
    Frontend calls:
      /api/stream?model=...&prompt=...&session_id=...&system_prompt=...
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
