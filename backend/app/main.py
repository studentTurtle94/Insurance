import os
from typing import Optional, Dict, Any
from fastapi import FastAPI, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import tools
import httpx

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="Insurance Co-Pilot API")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

# Phase 2/4 placeholders to unblock frontend wiring
@app.options("/api/conversation")
async def conversation_options():
    """Handle CORS preflight for conversation endpoint"""
    return {"status": "ok"}

@app.post("/api/conversation")
async def conversation(payload: Dict[str, Any] = Body(default={})):
    """Enhanced conversation using Agent 1: Conversational AI Agent"""
    message = (payload or {}).get("message", "").strip()
    state = (payload or {}).get("state") or {}
    
    # Use the new conversational AI agent
    result = tools.conversational_ai_agent(message, state)
    
    return result

_fake_status_message: Optional[str] = None


@app.options("/api/process_claim")
async def process_claim_options():
    """Handle CORS preflight for process_claim endpoint"""
    return {"status": "ok"}

@app.post("/api/process_claim")
async def process_claim(payload: Dict[str, Any] = Body(...)):
    """Multi-agent roadside assistance orchestrator"""
    global _fake_status_message
    
    # Handle both old format and new conversation state format
    if "conversation_state" in payload:
        conversation_state = payload["conversation_state"]
    else:
        # Legacy format support
        conversation_state = {
            "collected": {
                "customer_name": payload.get("name", ""),
                "location_description": payload.get("location", ""),
                "problem_description": payload.get("issue", ""),
                "problem_type": "general roadside assistance"
            },
            "ready_for_dispatch": True
        }
    
    # Use the new multi-agent orchestrator
    result = tools.process_roadside_assistance_request(conversation_state)
    
    # Generate status message from communications
    if result.get("status") == "success":
        communications = result.get("communications", [])
        if communications:
            _fake_status_message = communications[0]  # First communication message
    elif result.get("status") == "denied":
        _fake_status_message = f"Your request could not be processed: {result.get('reason', 'Unknown error')}"
    else:
        _fake_status_message = f"Service request failed: {result.get('reason', 'Unknown error')}"
    
    return result

@app.get("/api/get_status")
async def get_status():
    return {"message": _fake_status_message}

@app.post("/api/check_coverage")
async def check_coverage(payload: Dict[str, Any] = Body(...)):
    """Check if a problem description is covered by policy"""
    problem_description = payload.get("problem_description", "")
    
    if not problem_description:
        raise HTTPException(status_code=400, detail="problem_description is required")
    
    try:
        # Use the same analysis function as the conversation agent
        coverage_analysis = tools.analyze_problem_description(problem_description)
        return coverage_analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Coverage analysis failed: {str(e)}")

@app.post("/api/realtime/client_secret")
async def create_realtime_client_secret():
    """Generate ephemeral API key for Realtime API client connections"""
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
    
    session_config = {
        "session": {
            "type": "realtime",
            "model": "gpt-realtime",
            "audio": {
                "output": { "voice": "alloy" }
            }
        }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/client_secrets",
                headers={
                    "Authorization": f"Bearer {openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=session_config
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code, 
                    detail=f"Failed to create client secret: {response.text}"
                )
            
            data = response.json()
            return {"client_secret": data.get("value")}
            
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Request failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

# Admin endpoints
@app.get("/api/admin/cases")
async def get_admin_cases():
    """Get all cases for admin dashboard"""
    try:
        cases_data = tools.get_all_cases_for_admin()
        return {"cases": cases_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch cases: {str(e)}")

@app.post("/api/admin/cases/{case_id}/takeover")
async def takeover_case(case_id: str, payload: Dict[str, Any] = Body(...)):
    """Take over a case for manual handling"""
    try:
        admin_user = payload.get("admin_user", "Unknown Admin")
        reason = payload.get("reason", "Manual intervention")
        
        result = tools.takeover_case(case_id, admin_user, reason)
        
        if result["success"]:
            return {"message": "Case taken over successfully", "case_id": case_id}
        else:
            raise HTTPException(status_code=400, detail=result["error"])
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to take over case: {str(e)}")
