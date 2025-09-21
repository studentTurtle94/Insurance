# Insurance Co-Pilot (Proto-Agent)

A functional prototype demonstrating a modular, agent-like architecture for an insurance claims co-pilot.

## Stack
- Backend: FastAPI (Python)
- Frontend: React + Vite (TypeScript)
- Architecture: Modular "proto-agent" functions orchestrated by API endpoints, designed to later port to LangGraph.

## Getting Started

### Backend
```bash
cd /Users/mbranescu/Desktop/projects/insurance
source .venv/bin/activate

# Install dependencies (including httpx for Realtime API)
pip install -r backend/requirements.txt

# Set your OpenAI API key
export OPENAI_API_KEY=your_openai_api_key_here

# Start the API (use main:app with the app dir)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload --app-dir backend/app
```
Endpoints:
- GET `/health` → { status: "ok" }
- POST `/api/conversation` → simple dialog state machine
- POST `/api/process_claim` → orchestrator (policy check → damage assessment → garage locator → client update)
- GET `/api/get_status` → latest client-facing SMS-like message
- **POST `/api/realtime/client_secret` → generates ephemeral API keys for secure Realtime API connections**

### Frontend
```bash
cd /Users/mbranescu/Desktop/projects/insurance/frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

Node note: Versions are pinned for Node 18 (Vite 5 + React 18). With Node 20+, you can upgrade Vite/React and router.

## Proto-Agent Architecture

### Modules (`backend/app/tools.py`)
- Policy Check Agent: `check_policy_coverage_tool(customer_name)`
- Damage Assessment Agent: `assess_damage_tool(issue_description)`
- Garage Locator Agent: `find_garage_tool(location, required_service)`
- Client Update Agent: `generate_client_update_tool(analysis_results)`

### Orchestrator (`backend/app/main.py`)
- POST `/api/process_claim`
  1) `check_policy_coverage_tool(name)`; if not covered → `status: denied`.
  2) `assess_damage_tool(issue)` → `required_service`.
  3) `find_garage_tool(location, required_service)`.
  4) Aggregate results and call `generate_client_update_tool(...)`.
  5) Store the message for `/api/get_status`.

### Conversation Flow
- POST `/api/conversation` (steps: name → location → issue → done)
- **Frontend uses OpenAI Realtime API for real-time voice conversations** with secure ephemeral key authentication
- Transcript/state/analysis shared via `localStorage` and rendered on `/dashboard`.

## Demo Flow
1. Open Client View (`/`). Click Speak or type answers.
2. After providing name, location, and issue, click "Submit Claim".
3. Open Dashboard (`/dashboard`) to see transcript, extracted info, and AI analysis.
4. Client View shows a SMS-like message from `/api/get_status`.

## LangGraph-Ready
- Tools are pure, clearly-typed functions with narrow IO.
- Orchestrator is a thin controller that can be replaced by a graph runtime.
- Swapping `/api/process_claim` for a LangGraph executor is straightforward.
