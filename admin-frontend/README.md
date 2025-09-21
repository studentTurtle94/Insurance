# Insurance Admin Dashboard

A React-based admin dashboard for monitoring insurance cases, viewing conversation histories, and tracking agent decisions.

## Features

- **Cases Dashboard**: View all open cases with real-time status updates
- **Conversation History**: See complete conversation transcripts between customers and AI agents
- **Agent Decision Timeline**: Track step-by-step decisions made by each AI agent
- **Manual Takeover**: Take control of cases when customer requests human intervention
- **Real-time Updates**: Auto-refreshes every 30 seconds to show latest case status

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to http://localhost:5175

## Backend Requirements

Make sure the main backend API is running on port 8000 with the following endpoints:
- `GET /api/admin/cases` - Fetch all cases
- `POST /api/admin/cases/{case_id}/takeover` - Take over a case

## Port Configuration

The admin dashboard runs on port 5175 to avoid conflicts with:
- Client frontend (port 5173)
- Other services (port 5174)

## Usage

### Viewing Cases
- All cases are displayed in a grid layout
- Each card shows case summary, status, and key information
- Click "View Details" to see full case information

### Case Details Modal
- **Case Information**: Basic case data and status
- **Conversation History**: Complete chat transcript
- **Agent Decision Timeline**: Step-by-step agent actions
- **Status History**: Audit trail of status changes

### Taking Over Cases
- Click "Take Over" button on any active case
- Case status changes to "MANUAL_TAKEOVER"
- Customer is notified that a human agent is taking over

## Development

Built with:
- React 18
- TypeScript
- Vite
- Lucide React (icons)
- Modern CSS with backdrop filters and glassmorphism effects
