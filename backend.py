from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio
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
conversations = {}   # { sessionId: [ {role, content}, ... ] }

@app.get("/api/models")
async def get_models():
    try:
        res = ollama.list()
        models = [m["model"] for m in res["models"]]
        return JSONResponse(content=models)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


async def stream_ollama(model: str, session_id: str, prompt: str):
    """
    Stream a response from Ollama WITH conversation memory.
    """
    # Initialize session if new
    if session_id not in conversations:
        conversations[session_id] = []

    # Add user message to memory
    conversations[session_id].append({"role": "user", "content": prompt})

    try:
        # Feed ENTIRE history to Ollama (this is the fix!)
        stream = ollama.chat(
            model=model,
            messages=conversations[session_id],
            stream=True
        )

        collected_response = ""

        for chunk in stream:
            if "message" in chunk and "content" in chunk["message"]:
                text = chunk["message"]["content"]
                collected_response += text
                yield text
                await asyncio.sleep(0)

        # Save assistant reply in history
        conversations[session_id].append({
            "role": "assistant",
            "content": collected_response
        })

    except Exception as e:
        yield f"[Error: {e}]"


@app.get("/api/stream")
async def stream_response(model: str = "", prompt: str = "", session_id: str = "default"):
    if not model or not prompt:
        return JSONResponse(content={"error": "model and prompt required"}, status_code=400)

    async def event_gen():
        async for part in stream_ollama(model, session_id, prompt):
            yield part

    return StreamingResponse(event_gen(), media_type="text/plain")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
