from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import ollama
import json
import uuid
from datetime import datetime
from typing import Optional, List
import asyncio
import httpx
from urllib.parse import quote_plus
from contextlib import asynccontextmanager

# ============================================================================
# SEARCH CONFIGURATION
# ============================================================================
SEARXNG_URL = "http://localhost:8080"
SEARCH_TIMEOUT = 5.0
MAX_SEARCH_RESULTS = 5

class SearchEngine:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=SEARCH_TIMEOUT)
    
    async def search_searxng(self, query: str) -> List[dict]:
        try:
            params = {
                'q': query,
                'format': 'json',
                'categories': 'general',
                'language': 'en',
                'safesearch': 1,
                'pageno': 1
            }
            
            response = await self.client.get(f"{SEARXNG_URL}/search", params=params)
            
            if response.status_code == 200:
                data = response.json()
                results = []
                
                for result in data.get('results', [])[:MAX_SEARCH_RESULTS]:
                    results.append({
                        'title': result.get('title', ''),
                        'url': result.get('url', ''),
                        'snippet': result.get('content', ''),
                        'source': 'searxng'
                    })
                
                return results
        except Exception as e:
            print(f"SearXNG search failed: {e}")
            return []
    
    async def search_duckduckgo(self, query: str) -> List[dict]:
        try:
            params = {
                'q': query,
                'format': 'json',
                'no_html': 1,
                'skip_disambig': 1
            }
            
            response = await self.client.get('https://api.duckduckgo.com/', params=params)
            
            if response.status_code == 200:
                data = response.json()
                results = []
                
                if data.get('Abstract'):
                    results.append({
                        'title': data.get('Heading', query),
                        'url': data.get('AbstractURL', ''),
                        'snippet': data.get('Abstract', ''),
                        'source': 'duckduckgo'
                    })
                
                for topic in data.get('RelatedTopics', [])[:MAX_SEARCH_RESULTS-1]:
                    if isinstance(topic, dict) and 'Text' in topic:
                        results.append({
                            'title': topic.get('Text', '')[:100],
                            'url': topic.get('FirstURL', ''),
                            'snippet': topic.get('Text', ''),
                            'source': 'duckduckgo'
                        })
                
                return results
        except Exception as e:
            print(f"DuckDuckGo search failed: {e}")
            return []
    
    async def search(self, query: str) -> List[dict]:
        results = await self.search_searxng(query)
        if not results:
            results = await self.search_duckduckgo(query)
        return results
    
    async def close(self):
        await self.client.aclose()

search_engine = SearchEngine()

# ============================================================================
# DATA STORAGE
# ============================================================================
sessions = {}
conversations = {}

class Message(BaseModel):
    role: str
    content: str
    timestamp: str

class SessionRename(BaseModel):
    session_id: str
    new_name: str

class SessionDelete(BaseModel):
    session_id: str

class SessionReset(BaseModel):
    session_id: str

class ImportMessages(BaseModel):
    messages: List[Message]

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================
def format_search_results(results: List[dict]) -> str:
    if not results:
        return "No search results found."
    
    formatted = "Search Results:\n\n"
    for i, result in enumerate(results, 1):
        formatted += f"{i}. {result['title']}\n"
        formatted += f"   URL: {result['url']}\n"
        formatted += f"   {result['snippet'][:200]}...\n\n"
    
    return formatted

def should_search(prompt: str) -> bool:
    search_indicators = [
        'search', 'find', 'look up', 'what is', 'who is', 'when did',
        'latest', 'recent', 'current', 'news', 'today', 'weather',
        'price', 'stock', 'how much', 'where is', 'information about'
    ]
    
    prompt_lower = prompt.lower()
    return any(indicator in prompt_lower for indicator in search_indicators)

# ============================================================================
# LIFESPAN MANAGEMENT
# ============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Server starting up...")
    try:
        models = ollama.list()
        if hasattr(models, 'models'):
            model_count = len(models.models)
        elif isinstance(models, dict):
            model_count = len(models.get('models', []))
        else:
            model_count = 0
        print(f"✅ Ollama connected. Models available: {model_count}")
    except Exception as e:
        print(f"⚠️  Warning: Could not connect to Ollama: {e}")
    
    yield
    
    await search_engine.close()
    print("Server shutting down...")

# ============================================================================
# CREATE APP
# ============================================================================
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# SESSION ENDPOINTS
# ============================================================================
@app.post("/api/sessions/new")
async def create_session():
    session_id = str(uuid.uuid4())
    timestamp = datetime.now().isoformat()
    
    sessions[session_id] = {
        "session_id": session_id,
        "name": f"Chat {len(sessions) + 1}",
        "created_at": timestamp
    }
    conversations[session_id] = []
    
    return sessions[session_id]

@app.get("/api/sessions")
async def list_sessions():
    return list(sessions.values())

@app.post("/api/sessions/rename")
async def rename_session(data: SessionRename):
    if data.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    sessions[data.session_id]["name"] = data.new_name
    return {"success": True}

@app.post("/api/sessions/delete")
async def delete_session(data: SessionDelete):
    if data.session_id in sessions:
        del sessions[data.session_id]
        if data.session_id in conversations:
            del conversations[data.session_id]
    return {"success": True}

@app.post("/api/sessions/reset")
async def reset_session(data: SessionReset):
    if data.session_id in conversations:
        conversations[data.session_id] = []
    return {"success": True}

@app.get("/api/sessions/{session_id}/messages")
async def get_messages(session_id: str):
    if session_id not in conversations:
        return []
    return conversations[session_id]

@app.post("/api/sessions/{session_id}/import")
async def import_messages(session_id: str, data: ImportMessages):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    conversations[session_id] = [msg.dict() for msg in data.messages]
    return {"success": True}

# ============================================================================
# MODEL ENDPOINTS - FIXED FOR OLLAMA ListResponse
# ============================================================================
@app.get("/api/models")
async def list_models():
    try:
        models_response = ollama.list()
        
        print(f"🔍 Model response type: {type(models_response)}")
        
        # Handle Ollama ListResponse object
        if hasattr(models_response, 'models'):
            models_list = models_response.models
            print(f"✅ Found models attribute with {len(models_list)} models")
        elif isinstance(models_response, dict):
            models_list = models_response.get('models', [])
            print(f"✅ Found dict with {len(models_list)} models")
        elif isinstance(models_response, list):
            models_list = models_response
            print(f"✅ Already a list with {len(models_list)} models")
        else:
            print(f"❌ Unexpected format: {type(models_response)}")
            return []
        
        # Convert Model objects to JSON-serializable dicts
        result = []
        for model in models_list:
            if hasattr(model, 'model'):
                # It's a Model object - extract all fields
                model_dict = {
                    'name': model.model,
                    'modified_at': model.modified_at.isoformat() if hasattr(model.modified_at, 'isoformat') else str(model.modified_at),
                    'size': model.size,
                    'digest': model.digest,
                }
                
                # Add details if available
                if hasattr(model, 'details') and model.details:
                    model_dict['details'] = {
                        'format': model.details.format if hasattr(model.details, 'format') else None,
                        'family': model.details.family if hasattr(model.details, 'family') else None,
                        'parameter_size': model.details.parameter_size if hasattr(model.details, 'parameter_size') else None,
                        'quantization_level': model.details.quantization_level if hasattr(model.details, 'quantization_level') else None,
                    }
                
                result.append(model_dict)
            elif isinstance(model, dict):
                # Already a dict
                result.append(model)
        
        print(f"📤 Returning {len(result)} models")
        return result
        
    except Exception as e:
        print(f"❌ Error in list_models: {e}")
        import traceback
        traceback.print_exc()
        return []

@app.get("/api/models/{model_name}")
async def get_model_info(model_name: str):
    try:
        models_response = ollama.list()
        
        # Handle different response types
        if hasattr(models_response, 'models'):
            models_list = models_response.models
        elif isinstance(models_response, dict):
            models_list = models_response.get('models', [])
        elif isinstance(models_response, list):
            models_list = models_response
        else:
            models_list = []
        
        for model in models_list:
            # Get model name
            if hasattr(model, 'model'):
                model_id = model.model
            elif isinstance(model, dict):
                model_id = model.get('name') or model.get('model')
            else:
                continue
            
            if model_id == model_name:
                # Convert to dict if Model object
                if hasattr(model, 'model'):
                    result = {
                        'name': model.model,
                        'modified_at': model.modified_at.isoformat() if hasattr(model.modified_at, 'isoformat') else str(model.modified_at),
                        'size': model.size,
                        'digest': model.digest,
                    }
                    
                    if hasattr(model, 'details') and model.details:
                        result['details'] = {
                            'format': model.details.format if hasattr(model.details, 'format') else None,
                            'family': model.details.family if hasattr(model.details, 'family') else None,
                            'parameter_size': model.details.parameter_size if hasattr(model.details, 'parameter_size') else None,
                            'quantization_level': model.details.quantization_level if hasattr(model.details, 'quantization_level') else None,
                        }
                    
                    return result
                else:
                    return model
        
        raise HTTPException(status_code=404, detail="Model not found")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting model info: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# SEARCH ENDPOINT
# ============================================================================
@app.get("/api/search")
async def web_search(q: str):
    try:
        results = await search_engine.search(q)
        return {
            "query": q,
            "results": results,
            "count": len(results)
        }
    except Exception as e:
        print(f"Search error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# STREAMING CHAT WITH AUTO-SEARCH
# ============================================================================
@app.get("/api/stream")
async def stream_response(
    model: str,
    prompt: str,
    session_id: str,
    system_prompt: Optional[str] = "",
    temperature: float = 1.0,
    top_p: float = 1.0,
    enable_search: bool = True
):
    if session_id not in conversations:
        conversations[session_id] = []
    
    user_message = {
        "role": "user",
        "content": prompt,
        "timestamp": datetime.now().isoformat()
    }
    conversations[session_id].append(user_message)
    
    search_results = []
    search_context = ""
    
    if enable_search and should_search(prompt):
        try:
            print(f"🔍 Searching for: {prompt}")
            search_results = await search_engine.search(prompt)
            if search_results:
                search_context = format_search_results(search_results)
                print(f"✅ Found {len(search_results)} results")
        except Exception as e:
            print(f"❌ Search error: {e}")
    
    messages = []
    
    if system_prompt or search_context:
        system_content = system_prompt or ""
        if search_context:
            system_content += f"\n\n{search_context}\n\nUse the search results above to provide accurate, up-to-date information. Cite sources when relevant."
        
        messages.append({
            "role": "system",
            "content": system_content
        })
    
    for msg in conversations[session_id]:
        messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })
    
    async def generate():
        full_response = ""
        try:
            stream = ollama.chat(
                model=model,
                messages=messages,
                stream=True,
                options={
                    "temperature": temperature,
                    "top_p": top_p
                }
            )
            
            for chunk in stream:
                if chunk['message']['content']:
                    content = chunk['message']['content']
                    full_response += content
                    yield content
            
            assistant_message = {
                "role": "assistant",
                "content": full_response,
                "timestamp": datetime.now().isoformat()
            }
            conversations[session_id].append(assistant_message)
            
        except Exception as e:
            error_msg = f"Error: {str(e)}"
            yield error_msg
    
    return StreamingResponse(generate(), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)