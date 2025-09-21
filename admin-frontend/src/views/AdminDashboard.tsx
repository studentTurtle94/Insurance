import React, { useState, useEffect } from 'react';
import { RefreshCw, Eye, UserCheck, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import CaseDetailModal from '../components/CaseDetailModal';

interface Claim {
  claim_id: string;
  policy_holder: string;
  policy_number: string;
  problem_type: string;
  status: string;
  created_at: string;
  history: Array<{
    timestamp: string;
    status: string;
    details: any;
  }>;
}

interface ConversationMessage {
  timestamp: string;
  type: 'user' | 'agent' | 'system';
  content: string;
}

interface CaseData {
  claim: Claim;
  conversation: ConversationMessage[];
  decisions: Array<{
    step: number;
    agent: string;
    decision: string;
    details: any;
    timestamp: string;
  }>;
}

export default function AdminDashboard() {
  const [cases, setCases] = useState<CaseData[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCases = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:8000/api/admin/cases');
      if (!response.ok) {
        throw new Error(`Failed to fetch cases: ${response.statusText}`);
      }
      
      const data = await response.json();
      setCases(data.cases || []);
    } catch (err) {
      console.error('Error fetching cases:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch cases');
      
      // Mock data for development
      const mockCases: CaseData[] = [
        {
          claim: {
            claim_id: 'claim_123e4567-e89b-12d3-a456-426614174000',
            policy_holder: 'John Doe',
            policy_number: 'XYZ-12345',
            problem_type: 'battery issue',
            status: 'DISPATCHED',
            created_at: '2024-01-15T10:30:00Z',
            history: [
              {
                timestamp: '2024-01-15T10:30:00Z',
                status: 'OPEN',
                details: 'Claim created for battery issue'
              },
              {
                timestamp: '2024-01-15T10:35:00Z',
                status: 'DISPATCHED',
                details: {
                  provider: 'Awesome Roadside Repair',
                  eta_minutes: 25,
                  service_type: 'repair_truck'
                }
              }
            ]
          },
          conversation: [
            {
              timestamp: '2024-01-15T10:25:00Z',
              type: 'user',
              content: 'My car won\'t start, I think it\'s the battery'
            },
            {
              timestamp: '2024-01-15T10:25:30Z',
              type: 'agent',
              content: 'I understand you\'re having a battery issue. To verify your coverage, can you please confirm your full name as it appears on your policy?'
            },
            {
              timestamp: '2024-01-15T10:26:00Z',
              type: 'user',
              content: 'John Doe'
            },
            {
              timestamp: '2024-01-15T10:26:15Z',
              type: 'agent',
              content: 'Thank you. I\'ve verified your policy and you\'re covered for this service! For the fastest assistance, I\'ll need to confirm your exact location.'
            },
            {
              timestamp: '2024-01-15T10:27:00Z',
              type: 'user',
              content: 'I\'m on Harrow Road near the Tesco'
            },
            {
              timestamp: '2024-01-15T10:27:30Z',
              type: 'agent',
              content: 'Perfect! I have all the information needed. Let me find the best service provider for your situation and dispatch them to your location.'
            }
          ],
          decisions: [
            {
              step: 1,
              agent: 'Conversational AI Agent',
              decision: 'Collected problem description: battery issue',
              details: { problem_type: 'battery issue', confidence: 0.95 },
              timestamp: '2024-01-15T10:25:00Z'
            },
            {
              step: 2,
              agent: 'Verification & Policy Agent',
              decision: 'Verified customer identity and policy coverage',
              details: { 
                verified: true, 
                coverage_status: 'active', 
                roadside_covered: true,
                policy_number: 'XYZ-12345'
              },
              timestamp: '2024-01-15T10:26:00Z'
            },
            {
              step: 3,
              agent: 'Geolocation Agent',
              decision: 'Located customer at coordinates',
              details: { 
                latitude: 51.554257, 
                longitude: -0.293532, 
                method: 'gps_coordinates',
                address_estimate: 'Near Harrow, London'
              },
              timestamp: '2024-01-15T10:27:00Z'
            },
            {
              step: 4,
              agent: 'Dispatch & Logistics Agent',
              decision: 'Selected optimal service provider',
              details: { 
                provider: 'Awesome Roadside Repair',
                service_type: 'repair_truck',
                distance_km: 2.1,
                eta_minutes: 25,
                reasoning: 'Closest repair truck for battery service'
              },
              timestamp: '2024-01-15T10:30:00Z'
            },
            {
              step: 5,
              agent: 'Customer Communications Agent',
              decision: 'Sent dispatch confirmation and ETA',
              details: { 
                messages_sent: 2,
                channels: ['SMS'],
                confirmation: 'Help is on the way!'
              },
              timestamp: '2024-01-15T10:30:30Z'
            },
            {
              step: 6,
              agent: 'Claims & Follow-up Agent',
              decision: 'Created claim and initiated tracking',
              details: { 
                claim_id: 'claim_123e4567-e89b-12d3-a456-426614174000',
                status: 'DISPATCHED',
                follow_up_scheduled: true
              },
              timestamp: '2024-01-15T10:31:00Z'
            }
          ]
        }
      ];
      setCases(mockCases);
    } finally {
      setLoading(false);
    }
  };

  const handleTakeOver = async (caseId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/admin/cases/${caseId}/takeover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          admin_user: 'Admin User', // In real app, get from auth context
          reason: 'Manual intervention requested'
        })
      });

      if (response.ok) {
        // Refresh cases after takeover
        await fetchCases();
        alert('Case taken over successfully. Customer will be notified.');
      } else {
        throw new Error('Failed to take over case');
      }
    } catch (err) {
      console.error('Error taking over case:', err);
      alert('Failed to take over case. Please try again.');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'open':
        return <AlertCircle size={16} />;
      case 'dispatched':
        return <Clock size={16} />;
      case 'resolved':
        return <CheckCircle size={16} />;
      default:
        return <AlertCircle size={16} />;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status.toLowerCase()) {
      case 'open':
        return 'status-open';
      case 'dispatched':
        return 'status-dispatched';
      case 'resolved':
        return 'status-resolved';
      default:
        return 'status-open';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  useEffect(() => {
    fetchCases();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchCases, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1 className="admin-title">Insurance Admin Dashboard</h1>
        <p className="admin-subtitle">Monitor cases, conversations, and agent decisions</p>
      </div>

      {error && (
        <div style={{ 
          background: 'rgba(244, 67, 54, 0.1)', 
          border: '1px solid rgba(244, 67, 54, 0.3)',
          borderRadius: '10px',
          padding: '15px',
          marginBottom: '20px',
          color: '#f44336'
        }}>
          <strong>Error:</strong> {error}
          <br />
          <small>Showing mock data for development</small>
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <h3>Loading cases...</h3>
        </div>
      ) : cases.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No active cases</h3>
          <p>All cases have been resolved or no new cases have been created.</p>
        </div>
      ) : (
        <div className="cases-grid">
          {cases.map((caseData) => (
            <div key={caseData.claim.claim_id} className="case-card">
              <div className="case-id">
                Case ID: {caseData.claim.claim_id.split('-')[0]}...
              </div>
              
              <div className="case-header">
                <div className={`case-status ${getStatusClass(caseData.claim.status)}`}>
                  {getStatusIcon(caseData.claim.status)}
                  {caseData.claim.status}
                </div>
              </div>

              <div className="case-info">
                <div className="case-info-item">
                  <span className="case-info-label">Customer:</span>
                  <span className="case-info-value">{caseData.claim.policy_holder}</span>
                </div>
                <div className="case-info-item">
                  <span className="case-info-label">Issue:</span>
                  <span className="case-info-value">{caseData.claim.problem_type}</span>
                </div>
                <div className="case-info-item">
                  <span className="case-info-label">Created:</span>
                  <span className="case-info-value">{formatTimestamp(caseData.claim.created_at)}</span>
                </div>
                <div className="case-info-item">
                  <span className="case-info-label">Messages:</span>
                  <span className="case-info-value">{caseData.conversation.length} exchanges</span>
                </div>
                <div className="case-info-item">
                  <span className="case-info-label">Decisions:</span>
                  <span className="case-info-value">{caseData.decisions.length} agent actions</span>
                </div>
              </div>

              <div className="case-actions">
                <button 
                  className="btn btn-primary"
                  onClick={() => setSelectedCase(caseData)}
                >
                  <Eye size={16} />
                  View Details
                </button>
                {caseData.claim.status !== 'RESOLVED' && (
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleTakeOver(caseData.claim.claim_id)}
                  >
                    <UserCheck size={16} />
                    Take Over
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button 
        className="refresh-btn"
        onClick={fetchCases}
        title="Refresh cases"
      >
        <RefreshCw size={24} />
      </button>

      {selectedCase && (
        <CaseDetailModal 
          caseData={selectedCase}
          onClose={() => setSelectedCase(null)}
        />
      )}
    </div>
  );
}
