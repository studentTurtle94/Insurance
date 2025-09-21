import os
from typing import Optional, Dict, Any
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
import tools

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="Insurance Co-Pilot API")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
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
