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

@app.get("/api/models")
async def get_models():
    try:
        res = ollama.list()  # returns dict with "models"
        models = [m.model for m in res["models"]]
        return JSONResponse(content=models)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

async def stream_ollama(model: str, prompt: str):
    """
    Uses ollama.chat with stream=True to stream responses.
    """
    # You may pass simple chat messages as list of dicts
    messages = [{"role": "user", "content": prompt}]
    try:
        stream = ollama.chat(model=model, messages=messages, stream=True)
        for chunk in stream:
            # chunk is a dict, e.g. {'message': {'content': '...' } }
            yield chunk["message"]["content"]
            await asyncio.sleep(0)
    except Exception as e:
        yield f"[Error: {e}]"

@app.get("/api/stream")
async def stream_response(model: str = "", prompt: str = ""):
    if not model or not prompt:
        return JSONResponse(content={"error": "model and prompt required"}, status_code=400)

    async def event_gen():
        async for part in stream_ollama(model, prompt):
            yield part

    return StreamingResponse(event_gen(), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
