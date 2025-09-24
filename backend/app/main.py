import os
from typing import Optional, Dict, Any
from datetime import datetime
from fastapi import FastAPI, Body, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app import tools
import httpx
import json
import asyncio

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

# WebSocket connection manager for real-time chat
class ConnectionManager:
    def __init__(self):
        # Store connections by conversation_id
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, conversation_id: str, connection_type: str):
        await websocket.accept()
        if conversation_id not in self.active_connections:
            self.active_connections[conversation_id] = {}
        self.active_connections[conversation_id][connection_type] = websocket
        print(f"Connected {connection_type} to conversation {conversation_id}")
    
    def disconnect(self, conversation_id: str, connection_type: str):
        if conversation_id in self.active_connections:
            self.active_connections[conversation_id].pop(connection_type, None)
            if not self.active_connections[conversation_id]:
                del self.active_connections[conversation_id]
        print(f"Disconnected {connection_type} from conversation {conversation_id}")
    
    async def send_to_conversation(self, conversation_id: str, message: dict, exclude_type: str = None):
        """Send message to all connections in a conversation except the sender"""
        if conversation_id in self.active_connections:
            for conn_type, websocket in self.active_connections[conversation_id].items():
                if conn_type != exclude_type:
                    try:
                        await websocket.send_text(json.dumps(message))
                    except Exception as e:
                        print(f"Error sending message to {conn_type}: {e}")
                        # Remove broken connection
                        self.disconnect(conversation_id, conn_type)

manager = ConnectionManager()

@app.get("/health")
async def health():
    return {"status": "ok"}

# WebSocket endpoints
@app.websocket("/ws/client/{conversation_id}")
async def websocket_client_endpoint(websocket: WebSocket, conversation_id: str):
    await manager.connect(websocket, conversation_id, "client")
    try:
        while True:
            # Keep connection alive and handle any client messages
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # If client sends a message, broadcast to admin
            if message_data.get("type") == "message":
                await manager.send_to_conversation(
                    conversation_id,
                    {
                        "type": "client_message",
                        "content": message_data.get("content", ""),
                        "timestamp": datetime.now().isoformat(),
                        "sender": "Client"
                    },
                    exclude_type="client"
                )
                
                # Also save to conversation history
                tools.add_message_to_conversation(
                    conversation_id,
                    "user",
                    message_data.get("content", ""),
                    "Client"
                )
            
    except WebSocketDisconnect:
        manager.disconnect(conversation_id, "client")

@app.websocket("/ws/admin/{conversation_id}")
async def websocket_admin_endpoint(websocket: WebSocket, conversation_id: str):
    await manager.connect(websocket, conversation_id, "admin")
    try:
        while True:
            # Handle admin messages
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            if message_data.get("type") == "admin_message":
                # Send to client
                await manager.send_to_conversation(
                    conversation_id,
                    {
                        "type": "admin_message",
                        "content": message_data.get("content", ""),
                        "timestamp": datetime.now().isoformat(),
                        "sender": message_data.get("sender", "Admin"),
                        "admin_user": message_data.get("admin_user", "Admin")
                    },
                    exclude_type="admin"
                )
                
                # Save to conversation history
                tools.add_message_to_conversation(
                    conversation_id,
                    "admin",
                    message_data.get("content", ""),
                    message_data.get("admin_user", "Admin")
                )
            
    except WebSocketDisconnect:
        manager.disconnect(conversation_id, "admin")

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
    conversation_id = (payload or {}).get("conversation_id")
    
    # Use the new conversational AI agent
    result = tools.conversational_ai_agent(message, state)
    
    # Save conversation messages if conversation_id is provided
    if conversation_id and message:
        # Ensure conversation exists
        collected = state.get("collected", {})
        customer_name = collected.get("customer_name", "Unknown Customer")
        problem_type = collected.get("problem_type", "Unknown")
        
        # Create or update conversation entry
        conversation_data = tools.create_conversation_entry(
            conversation_id, 
            customer_name, 
            problem_type
        )
        tools.save_conversation(conversation_id, conversation_data)
        
        # Add user message
        tools.add_message_to_conversation(
            conversation_id,
            "user",
            message,
            "Customer"
        )
        
        # Add agent response
        if result.get("reply"):
            tools.add_message_to_conversation(
                conversation_id,
                "agent",
                result["reply"],
                "AI Agent"
            )
    
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

@app.options("/api/confirm_dispatch")
async def confirm_dispatch_options():
    return {"status": "ok"}

@app.post("/api/confirm_dispatch")
async def confirm_dispatch(payload: Dict[str, Any] = Body(...)):
    """Handle user confirmations for dispatch and cab request"""
    global _fake_status_message
    
    conversation_state = payload.get("conversation_state", {})
    help_confirmed = payload.get("help_confirmed", False)
    cab_requested = payload.get("cab_requested", False)
    
    # Use the confirmation handler
    result = tools.confirm_dispatch_and_cab(conversation_state, help_confirmed, cab_requested)
    
    # Generate status message from communications
    if result.get("status") == "success":
        communications = result.get("communications", [])
        if communications:
            _fake_status_message = communications[0]  # First communication message
    elif result.get("status") == "cancelled":
        _fake_status_message = result.get("message", "Service request cancelled")
    else:
        _fake_status_message = f"Service request failed: {result.get('reason', 'Unknown error')}"
    
    return result

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

# Conversation endpoints
@app.get("/api/admin/conversations")
async def get_conversations():
    """Get all active conversations for Kanban board"""
    try:
        conversations = tools.get_all_conversations()
        
        # Organize conversations by status
        organized = {
            "open": [c for c in conversations if c["status"] == "OPEN"],
            "requires_human": [c for c in conversations if c["status"] == "REQUIRES_HUMAN"],
            "closed": [c for c in conversations if c["status"] == "CLOSED"]
        }
        
        return {"conversations": organized}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch conversations: {str(e)}")

@app.post("/api/admin/conversations")
async def create_conversation(payload: Dict[str, Any] = Body(...)):
    """Create a new conversation"""
    try:
        conversation_id = payload.get("conversation_id")
        customer_name = payload.get("customer_name", "Unknown")
        problem_type = payload.get("problem_type", "Unknown")
        
        if not conversation_id:
            raise HTTPException(status_code=400, detail="conversation_id is required")
        
        conversation_data = tools.create_conversation_entry(
            conversation_id, customer_name, problem_type
        )
        
        success = tools.save_conversation(conversation_id, conversation_data)
        
        if success:
            return {"message": "Conversation created successfully", "conversation_id": conversation_id}
        else:
            raise HTTPException(status_code=500, detail="Failed to save conversation")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create conversation: {str(e)}")

@app.post("/api/admin/conversations/{conversation_id}/message")
async def add_conversation_message(conversation_id: str, payload: Dict[str, Any] = Body(...)):
    """Add a message to a conversation (from client or admin)"""
    try:
        message_type = payload.get("message_type", "user")  # 'user', 'agent', 'admin'
        content = payload.get("content", "")
        sender = payload.get("sender", message_type)
        
        if not content:
            raise HTTPException(status_code=400, detail="Message content is required")
        
        success = tools.add_message_to_conversation(
            conversation_id, 
            message_type, 
            content, 
            sender
        )
        
        if success:
            return {"message": "Message added successfully"}
        else:
            raise HTTPException(status_code=404, detail="Conversation not found")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add message: {str(e)}")

@app.post("/api/admin/conversations/{conversation_id}/sync_history")
async def sync_conversation_history(conversation_id: str, payload: Dict[str, Any] = Body(...)):
    """Sync complete conversation history from frontend"""
    try:
        messages = payload.get("messages", [])
        customer_name = payload.get("customer_name", "Customer")
        problem_type = payload.get("problem_type", "Roadside Assistance")
        
        # Create or update conversation entry
        conversation_data = tools.create_conversation_entry(
            conversation_id, 
            customer_name, 
            problem_type
        )
        
        # Clear existing messages and add new ones
        conversation_data["messages"] = []
        for msg in messages:
            conversation_data["messages"].append({
                "timestamp": msg.get("timestamp"),
                "type": msg.get("type"),
                "content": msg.get("content"),
                "sender": msg.get("sender")
            })
        
        # Update last_updated timestamp
        conversation_data["last_updated"] = datetime.now().isoformat()
        
        # Save the complete conversation
        success = tools.save_conversation(conversation_id, conversation_data)
        
        if success:
            return {"message": "Conversation history synced successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to save conversation")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync conversation history: {str(e)}")

@app.post("/api/admin/conversations/{conversation_id}/admin_message")
async def send_admin_message(conversation_id: str, payload: Dict[str, Any] = Body(...)):
    """Send a message as admin to a conversation"""
    try:
        admin_user = payload.get("admin_user", "Admin")
        message = payload.get("message", "")
        
        if not message:
            raise HTTPException(status_code=400, detail="Message content is required")
        
        success = tools.add_message_to_conversation(
            conversation_id, 
            "admin", 
            message, 
            admin_user
        )
        
        if success:
            # Also broadcast via WebSocket to connected clients
            await manager.send_to_conversation(
                conversation_id,
                {
                    "type": "admin_message",
                    "content": message,
                    "timestamp": datetime.now().isoformat(),
                    "sender": admin_user,
                    "admin_user": admin_user
                },
                exclude_type="admin"
            )
            
            return {"message": "Message sent successfully"}
        else:
            raise HTTPException(status_code=404, detail="Conversation not found")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send message: {str(e)}")

@app.post("/api/admin/conversations/{conversation_id}/takeover")
async def takeover_conversation(conversation_id: str, payload: Dict[str, Any] = Body(...)):
    """Take over a conversation"""
    try:
        admin_user = payload.get("admin_user", "Admin")
        
        conversations = tools.get_all_conversations()
        for conv in conversations:
            if conv["conversation_id"] == conversation_id:
                conv["admin_user"] = admin_user
                conv["status"] = "REQUIRES_HUMAN"
                conv["last_updated"] = datetime.now().isoformat()
                tools.save_conversation(conversation_id, conv)
                return {"message": "Conversation taken over successfully"}
        
        raise HTTPException(status_code=404, detail="Conversation not found")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to take over conversation: {str(e)}")

@app.post("/api/admin/conversations/{conversation_id}/close")
async def close_conversation(conversation_id: str, payload: Dict[str, Any] = Body(...)):
    """Close a conversation"""
    try:
        conversations = tools.get_all_conversations()
        for conv in conversations:
            if conv["conversation_id"] == conversation_id:
                conv["status"] = "CLOSED"
                conv["is_active"] = False
                conv["last_updated"] = datetime.now().isoformat()
                tools.save_conversation(conversation_id, conv)
                return {"message": "Conversation closed successfully"}
        
        raise HTTPException(status_code=404, detail="Conversation not found")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to close conversation: {str(e)}")

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
