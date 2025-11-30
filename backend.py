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

# Store conversation history per sessionId
# Structure:
# sessions = {
#   "session_id": {
#       "name": "My Chat",
#       "messages": [ {role, content}, ... ]
#   }
# }
sessions = {}

# --------------------------
#  SESSION MANAGEMENT ROUTES
# --------------------------

@app.get("/api/sessions")
async def get_sessions():
    """
    Returns a list of all sessions.
    """
    return [
        {"session_id": sid, "name": data["name"]}
        for sid, data in sessions.items()
    ]


@app.post("/api/sessions/new")
async def new_session():
    """
    Create a new session.
    """
    sid = str(uuid.uuid4())[:8]
    sessions[sid] = {
        "name": f"Session {len(sessions) + 1}",
        "messages": []
    }
    return {"session_id": sid, "name": sessions[sid]["name"]}


@app.post("/api/sessions/rename")
async def rename_session(request: Request):
    """
    Rename a session.
    """
    data = await request.json()
    sid = data.get("session_id")
    new_name = data.get("new_name")

    if sid not in sessions:
        return JSONResponse(content={"error": "Session not found"}, status_code=404)

    sessions[sid]["name"] = new_name
    return {"success": True}


@app.post("/api/sessions/delete")
async def delete_session(request: Request):
    """
    Delete a session and its history.
    """
    data = await request.json()
    sid = data.get("session_id")

    if sid in sessions:
        del sessions[sid]
        return {"success": True}
    else:
        return JSONResponse(content={"error": "Session not found"}, status_code=404)


@app.post("/api/sessions/reset")
async def reset_session(request: Request):
    """
    Clears the conversation history but keeps the session.
    """
    data = await request.json()
    sid = data.get("session_id")

    if sid not in sessions:
        return JSONResponse(content={"error": "Session not found"}, status_code=404)

    sessions[sid]["messages"] = []
    return {"success": True}


# --------------------------
#     MODEL LIST ROUTE
# --------------------------

@app.get("/api/models")
async def get_models():
    try:
        res = ollama.list()
        models = [m["model"] for m in res["models"]]
        return JSONResponse(content=models)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# --------------------------
#      STREAMING LOGIC
# --------------------------

async def stream_ollama(model: str, session_id: str, prompt: str):
    """
    Stream a response from Ollama WITH conversation memory.
    """

    # Create session if it does not exist
    if session_id not in sessions:
        sessions[session_id] = {
            "name": f"Session {len(sessions)+1}",
            "messages": []
        }

    memory = sessions[session_id]["messages"]

    # Add user message
    memory.append({"role": "user", "content": prompt})

    try:
        # Stream from ollama using entire history
        stream = ollama.chat(
            model=model,
            messages=memory,
            stream=True
        )

        collected = ""

        for chunk in stream:
            if "message" in chunk and "content" in chunk["message"]:
                text = chunk["message"]["content"]
                collected += text
                yield text
                await asyncio.sleep(0)

        # Save assistant message
        memory.append({"role": "assistant", "content": collected})

    except Exception as e:
        yield f"[Error: {e}]"


@app.get("/api/stream")
async def stream_response(model: str = "", prompt: str = "", session_id: str = "default"):
    """
    Stream endpoint for frontend.
    """

    if not model or not prompt:
        return JSONResponse(content={"error": "model and prompt required"}, status_code=400)

    # Start generator
    async def gen():
        async for part in stream_ollama(model, session_id, prompt):
            yield part

    return StreamingResponse(gen(), media_type="text/plain")


# --------------------------
#      DEVELOPMENT SERVER
# --------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
