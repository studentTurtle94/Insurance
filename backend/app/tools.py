import json
import uuid
import os
from typing import Any, Dict, List, Optional
from datetime import datetime
import math
from openai import OpenAI

# OpenAI client - initialized lazily
_client = None

def get_openai_client():
    """Get OpenAI client, initializing it lazily"""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key and api_key != "your_openai_api_key_here":
            _client = OpenAI(api_key=api_key)
        else:
            _client = None  # Will trigger fallback
    return _client

# Mock Policy Data for John Doe
JOHN_DOE_POLICY = {
    "policy_holder": "John Doe",
    "policy_number": "XYZ-12345",
    "start_date": "2024-01-01",
    "end_date": "2026-01-01",
    "coverage": {
        "roadside_assistance": {
            "is_covered": True,
            "service_limit_per_year": 3,
            "services": {
                "towing": {"is_covered": True, "max_distance_km": 100},
                "battery_jumpstart": {"is_covered": True},
                "flat_tire_service": {"is_covered": True},
                "fuel_delivery": {"is_covered": False},
                "lockout_service": {"is_covered": True}
            }
        }
    },
    "exclusions": ["commercial_use", "racing_events", "off_road_use"]
}

# Service Providers Database
SERVICE_PROVIDERS = {
    "repair_trucks": [
        {"name": "Awesome Roadside Repair", "lat": 51.563125, "lon": -0.239530, "type": "repair_truck"},
        {"name": "Swift Lift Towing", "lat": 51.549700, "lon": -0.264947, "type": "tow_truck"},
        {"name": "24/7 Roadside Rescue", "lat": 51.545117, "lon": -0.297145, "type": "repair_truck"},
        {"name": "Guardian Angel Towing", "lat": 51.552307, "lon": -0.298172, "type": "tow_truck"}
    ],
    "garages": [
        {"name": "Apex Automotive Solutions", "lat": 51.552307, "lon": -0.298172},
        {"name": "Velocity Vehicle Works", "lat": 51.545117, "lon": -0.297145},
        {"name": "Reliable Auto Repair", "lat": 51.549700, "lon": -0.264947}
    ]
}

# Customer's fixed location (51.554257, -0.293532)
CUSTOMER_LOCATION = {"lat": 51.554257, "lon": -0.293532}

# Claims file path
CLAIMS_FILE = "claims.json"

# ==================== AGENT 1: Conversational AI Agent ====================
def conversational_ai_agent(message: str, conversation_state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enhanced conversational agent using OpenAI GPT-5-mini for natural interactions.
    """
    step = conversation_state.get("step", 0)
    collected = conversation_state.get("collected", {})
    
    print(f"[DEBUG] conversational_ai_agent called with:")
    print(f"  - message: '{message}'")
    print(f"  - step: {step}")
    print(f"  - collected: {collected}")
    
    try:
        # Build conversation context for the LLM
        system_prompt = f"""You are a helpful insurance roadside assistance agent. Your job is to guide customers through our assistance process with empathy and professionalism.

CURRENT SITUATION:
- Conversation step: {step}
- Information collected: {collected}

YOUR ROLE BY STEP:
- Step 1: Customer described their problem. Ask for their full name for policy verification.
- Step 2: Customer provided name. Thank them and say you're verifying their policy coverage.
- Step 3: Policy verified! Ask for their exact location (street name, landmarks, etc.).
- Step 4: Location received. Confirm you have everything needed to dispatch help.
- Step 5: Process complete.

GUIDELINES:
- Be empathetic and professional
- Keep responses concise (1-2 sentences max)
- Ask only one question at a time
- Sound natural and human-like
- Show understanding of their situation"""

        user_message = message.strip() if message.strip() else "Hello"
        
        # system_prompt already formatted with f-string above
        prompt = system_prompt
        
        if step == 0:
            # Initial greeting
            reply = "Hello! I'm here to help with your roadside assistance request. Can you briefly describe what's happening with your vehicle?"
            print(f"[DEBUG] Step 0 - returning initial greeting")
            return {
                "reply": reply,
                "state": {"step": 1, "collected": collected}
            }
        
        # Get OpenAI client
        print(f"[DEBUG] Getting OpenAI client for step {step}")
        client = get_openai_client()
        if not client:
            print(f"[DEBUG] No OpenAI client, using fallback")
            # No API key configured, use fallback
            return fallback_conversational_agent(message, conversation_state)
        
        print(f"[DEBUG] Making OpenAI API call for step {step}")
        # Use OpenAI Responses API for natural responses
        response = client.responses.create(
            model="gpt-5-mini",
            instructions=prompt,
            input=f"Customer says: {user_message}",
            max_output_tokens=500,
            temperature=0.7,
            text={"format": {"type": "text"}},
            store=False  # Don't store for privacy
        )
        
        print(f"[DEBUG] OpenAI API response received for step {step}")
        # Extract text from the response output
        reply = ""
        if response.output and len(response.output) > 0:
            output_item = response.output[0]
            if output_item.type == "message" and output_item.content:
                for content in output_item.content:
                    if content.type == "output_text":
                        reply = content.text.strip()
                        print(f"[DEBUG] Extracted reply: '{reply}'")
                        break
        
        if not reply:
            reply = "I'm here to help! Could you please repeat that?"
            print(f"[DEBUG] No reply extracted, using fallback")
        
        # Update state based on step
        if step == 1:
            # Analyze problem and move to name collection
            problem_type = analyze_problem_description(message)
            collected["problem_description"] = message
            collected["problem_type"] = problem_type
            print(f"[DEBUG] Step 1 -> 2: collected problem '{problem_type}'")
            return {
                "reply": reply,
                "state": {"step": 2, "collected": collected}
            }
        elif step == 2:
            # Collect name
            collected["customer_name"] = message
            print(f"[DEBUG] Step 2 -> 3: collected name '{message}'")
            return {
                "reply": reply,
                "state": {"step": 3, "collected": collected}
            }
        elif step == 3:
            # Policy verified, collect location
            print(f"[DEBUG] Step 3 -> 4: policy verification step")
            return {
                "reply": reply,
                "state": {"step": 4, "collected": collected}
            }
        elif step == 4:
            # Location collected, ready for dispatch
            collected["location_description"] = message
            print(f"[DEBUG] Step 4 -> 5: collected location '{message}', ready for dispatch")
            return {
                "reply": reply,
                "state": {"step": 5, "collected": collected, "ready_for_dispatch": True}
            }
        else:
            # Complete
            print(f"[DEBUG] Step {step}: conversation complete")
            return {
                "reply": reply,
                "state": {"step": 5, "collected": collected, "complete": True}
            }
            
    except Exception as e:
        print(f"[DEBUG] Exception in conversational_ai_agent: {e}")
        print(f"[DEBUG] Falling back to rule-based agent")
        # Fallback to rule-based responses if OpenAI fails
        return fallback_conversational_agent(message, conversation_state)

def fallback_conversational_agent(message: str, conversation_state: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback rule-based agent when OpenAI is unavailable"""
    step = conversation_state.get("step", 0)
    collected = conversation_state.get("collected", {})
    
    if step == 0:
        return {
            "reply": "Hello! I'm here to help with your roadside assistance request. Can you briefly describe what's happening with your vehicle?",
            "state": {"step": 1, "collected": collected}
        }
    elif step == 1:
        problem_type = analyze_problem_description(message)
        collected["problem_description"] = message
        collected["problem_type"] = problem_type
        return {
            "reply": f"I understand you're having a {problem_type} issue. To verify your coverage, can you please confirm your full name as it appears on your policy?",
            "state": {"step": 2, "collected": collected}
        }
    elif step == 2:
        collected["customer_name"] = message
        return {
            "reply": "Thank you. I'm now verifying your policy coverage. One moment please...",
            "state": {"step": 3, "collected": collected}
        }
    elif step == 3:
        return {
            "reply": "Great! Your policy is verified and you're covered for this service. For the fastest assistance, I'll need to confirm your exact location. Can you describe where you are? (Street name, nearby landmarks, etc.)",
            "state": {"step": 4, "collected": collected}
        }
    elif step == 4:
        collected["location_description"] = message
        return {
            "reply": "Perfect! I have all the information needed. Let me find the best service provider for your situation and dispatch them to your location.",
            "state": {"step": 5, "collected": collected, "ready_for_dispatch": True}
        }
    else:
        return {
            "reply": "Your request has been processed. You should receive updates shortly!",
            "state": {"step": 5, "collected": collected, "complete": True}
        }

def analyze_problem_description(description: str) -> str:
    """Simple NLP to categorize the problem type"""
    desc_lower = description.lower()
    
    if any(word in desc_lower for word in ["flat", "tire", "puncture", "wheel"]):
        return "flat tire"
    elif any(word in desc_lower for word in ["battery", "dead", "won't start", "wont start", "no start"]):
        return "battery issue"
    elif any(word in desc_lower for word in ["locked", "keys", "lock"]):
        return "lockout"
    elif any(word in desc_lower for word in ["fuel", "gas", "petrol", "empty"]):
        return "fuel delivery"
    elif any(word in desc_lower for word in ["engine", "breakdown", "broken", "tow"]):
        return "breakdown requiring tow"
    else:
        return "general roadside assistance"

# ==================== AGENT 2: Verification & Policy Agent ====================
def verification_policy_agent(customer_name: str) -> Dict[str, Any]:
    """Verifies customer identity and checks policy coverage."""
    if customer_name.lower().strip() == "john doe":
        policy = JOHN_DOE_POLICY
        start_date = datetime.strptime(policy["start_date"], "%Y-%m-%d")
        end_date = datetime.strptime(policy["end_date"], "%Y-%m-%d")
        current_date = datetime.now()
        
        if start_date <= current_date <= end_date:
            return {
                "verified": True,
                "policy": policy,
                "coverage_status": "active",
                "roadside_covered": policy["coverage"]["roadside_assistance"]["is_covered"]
            }
        else:
            return {
                "verified": True,
                "policy": policy,
                "coverage_status": "expired",
                "roadside_covered": False
            }
    else:
        return {
            "verified": False,
            "policy": None,
            "coverage_status": "not_found",
            "roadside_covered": False
        }

# ==================== AGENT 3: Geolocation Agent ====================
def geolocation_agent() -> Dict[str, Any]:
    """Determines customer's exact location."""
    return {
        "location_method": "gps_coordinates",
        "latitude": CUSTOMER_LOCATION["lat"],
        "longitude": CUSTOMER_LOCATION["lon"],
        "accuracy": "high",
        "address_estimate": "Near Harrow, London"
    }

# ==================== AGENT 4: Dispatch & Logistics Agent ====================
def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates using Haversine formula"""
    R = 6371  # Earth's radius in kilometers
    
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    
    a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def dispatch_logistics_agent(problem_type: str, customer_location: Dict[str, float]) -> Dict[str, Any]:
    """Finds the best service provider and dispatches them."""
    customer_lat = customer_location["lat"]
    customer_lon = customer_location["lon"]
    
    # Determine required service type
    if problem_type in ["battery issue", "flat tire"]:
        preferred_type = "repair_truck"
        fallback_type = "tow_truck"
    elif problem_type == "lockout":
        preferred_type = "repair_truck"
        fallback_type = "tow_truck"
    else:
        preferred_type = "tow_truck"
        fallback_type = "repair_truck"
    
    # Find closest providers
    all_providers = SERVICE_PROVIDERS["repair_trucks"]
    
    # Calculate distances and filter by type
    candidates = []
    for provider in all_providers:
        distance = calculate_distance(customer_lat, customer_lon, provider["lat"], provider["lon"])
        if provider["type"] == preferred_type:
            candidates.append({**provider, "distance": distance, "priority": 1})
        elif provider["type"] == fallback_type:
            candidates.append({**provider, "distance": distance, "priority": 2})
    
    # Sort by priority then distance
    candidates.sort(key=lambda x: (x["priority"], x["distance"]))
    
    if candidates:
        best_provider = candidates[0]
        
        # Check if closest garage is > 50km for repair trucks
        if best_provider["type"] == "repair_truck":
            closest_garage_distance = min(
                calculate_distance(customer_lat, customer_lon, garage["lat"], garage["lon"])
                for garage in SERVICE_PROVIDERS["garages"]
            )
            
            if closest_garage_distance > 50:
                tow_candidates = [c for c in candidates if c["type"] == "tow_truck"]
                if tow_candidates:
                    best_provider = tow_candidates[0]
        
        eta_minutes = max(15, int(best_provider["distance"] * 2.5))
        
        return {
            "dispatched": True,
            "provider": best_provider,
            "eta_minutes": eta_minutes,
            "service_type": best_provider["type"],
            "distance_km": round(best_provider["distance"], 1)
        }
    else:
        return {
            "dispatched": False,
            "error": "No available service providers found"
        }

# ==================== AGENT 5: Customer Communications Agent ====================
def send_customer_notification(message_type: str, provider_name: str = None, eta: int = None) -> str:
    """Sends notifications to customer."""
    customer_name = "John Doe"
    
    if message_type == "DISPATCHED":
        return f"[COMMUNICATION] SMS to {customer_name}: Help is on the way! '{provider_name}' has been dispatched."
    elif message_type == "ETA_UPDATE":
        return f"[COMMUNICATION] SMS to {customer_name}: Your service vehicle will arrive in approximately {eta} minutes."
    elif message_type == "ARRIVAL":
        return f"[COMMUNICATION] SMS to {customer_name}: Your service vehicle has arrived."
    else:
        return f"[COMMUNICATION] SMS to {customer_name}: Status update - {message_type}"

# ==================== AGENT 6: Claims & Follow-up Agent ====================
def create_claim(policy_holder: str, policy_number: str, problem_type: str) -> str:
    """Creates a new claim and returns claim_id"""
    claim_id = str(uuid.uuid4())
    
    claim = {
        "claim_id": claim_id,
        "policy_holder": policy_holder,
        "policy_number": policy_number,
        "problem_type": problem_type,
        "status": "OPEN",
        "created_at": datetime.now().isoformat(),
        "history": [
            {
                "timestamp": datetime.now().isoformat(),
                "status": "OPEN",
                "details": f"Claim created for {problem_type}"
            }
        ]
    }
    
    # Load existing claims or create new file
    claims = []
    if os.path.exists(CLAIMS_FILE):
        try:
            with open(CLAIMS_FILE, 'r') as f:
                claims = json.load(f)
        except:
            claims = []
    
    claims.append(claim)
    
    # Save to file
    with open(CLAIMS_FILE, 'w') as f:
        json.dump(claims, f, indent=2)
    
    return claim_id

def update_claim(claim_id: str, new_status: str, details_dict: Dict[str, Any]) -> bool:
    """Updates an existing claim"""
    if not os.path.exists(CLAIMS_FILE):
        return False
    
    try:
        with open(CLAIMS_FILE, 'r') as f:
            claims = json.load(f)
    except:
        return False
    
    # Find and update claim
    for claim in claims:
        if claim["claim_id"] == claim_id:
            claim["status"] = new_status
            claim["history"].append({
                "timestamp": datetime.now().isoformat(),
                "status": new_status,
                "details": details_dict
            })
            
            # Save updated claims
            with open(CLAIMS_FILE, 'w') as f:
                json.dump(claims, f, indent=2)
            return True
    
    return False

# ==================== ORCHESTRATOR FUNCTION ====================
def process_roadside_assistance_request(conversation_state: Dict[str, Any]) -> Dict[str, Any]:
    """Main orchestrator that coordinates all 6 agents."""
    collected = conversation_state.get("collected", {})
    
    if not conversation_state.get("ready_for_dispatch"):
        return {"error": "Conversation not ready for dispatch"}
    
    results = {
        "conversation_data": collected,
        "agents_executed": []
    }
    
    # Agent 2: Verification & Policy
    verification = verification_policy_agent(collected.get("customer_name", ""))
    results["verification"] = verification
    results["agents_executed"].append("verification_policy_agent")
    
    if not verification["verified"] or not verification["roadside_covered"]:
        return {**results, "status": "denied", "reason": "Policy verification failed or no coverage"}
    
    # Agent 3: Geolocation
    location = geolocation_agent()
    results["location"] = location
    results["agents_executed"].append("geolocation_agent")
    
    # Agent 4: Dispatch & Logistics
    dispatch = dispatch_logistics_agent(
        collected.get("problem_type", "general roadside assistance"),
        {"lat": location["latitude"], "lon": location["longitude"]}
    )
    results["dispatch"] = dispatch
    results["agents_executed"].append("dispatch_logistics_agent")
    
    if not dispatch["dispatched"]:
        return {**results, "status": "failed", "reason": "No available service providers"}
    
    # Agent 5: Customer Communications
    comm_dispatched = send_customer_notification("DISPATCHED", dispatch["provider"]["name"])
    comm_eta = send_customer_notification("ETA_UPDATE", eta=dispatch["eta_minutes"])
    results["communications"] = [comm_dispatched, comm_eta]
    results["agents_executed"].append("customer_communications_agent")
    
    # Agent 6: Claims & Follow-up
    claim_id = create_claim(
        verification["policy"]["policy_holder"],
        verification["policy"]["policy_number"],
        collected.get("problem_type", "general roadside assistance")
    )
    
    # Update claim with dispatch details
    update_claim(claim_id, "DISPATCHED", {
        "provider": dispatch["provider"]["name"],
        "eta_minutes": dispatch["eta_minutes"],
        "service_type": dispatch["service_type"]
    })
    
    results["claim"] = {"claim_id": claim_id, "status": "DISPATCHED"}
    results["agents_executed"].append("claims_followup_agent")
    
    # Simulate arrival
    update_claim(claim_id, "RESOLVED", {
        "resolution": "Service provider arrived and assisted customer",
        "completion_time": datetime.now().isoformat()
    })
    
    results["status"] = "success"
    results["summary"] = {
        "provider_name": dispatch["provider"]["name"],
        "eta_minutes": dispatch["eta_minutes"],
        "claim_id": claim_id,
        "service_type": dispatch["service_type"]
    }
    
    return results
