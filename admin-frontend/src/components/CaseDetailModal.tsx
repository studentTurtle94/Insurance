import React from 'react';
import { X, User, Bot, Settings, Clock } from 'lucide-react';

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

interface CaseDetailModalProps {
  caseData: CaseData;
  onClose: () => void;
}

export default function CaseDetailModal({ caseData, onClose }: CaseDetailModalProps) {
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'user':
        return <User size={16} />;
      case 'agent':
        return <Bot size={16} />;
      case 'system':
        return <Settings size={16} />;
      default:
        return <Bot size={16} />;
    }
  };

  const renderDecisionDetails = (details: any) => {
    if (!details || typeof details !== 'object') {
      return <span>{String(details)}</span>;
    }

    return (
      <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '5px' }}>
        {Object.entries(details).map(([key, value]) => (
          <div key={key} style={{ margin: '2px 0' }}>
            <strong>{key.replace(/_/g, ' ')}:</strong> {String(value)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Case Details</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Case Information */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ marginBottom: '15px', borderBottom: '2px solid rgba(255,255,255,0.2)', paddingBottom: '5px' }}>
            Case Information
          </h3>
          <div className="case-info">
            <div className="case-info-item">
              <span className="case-info-label">Case ID:</span>
              <span className="case-info-value" style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                {caseData.claim.claim_id}
              </span>
            </div>
            <div className="case-info-item">
              <span className="case-info-label">Customer:</span>
              <span className="case-info-value">{caseData.claim.policy_holder}</span>
            </div>
            <div className="case-info-item">
              <span className="case-info-label">Policy:</span>
              <span className="case-info-value">{caseData.claim.policy_number}</span>
            </div>
            <div className="case-info-item">
              <span className="case-info-label">Issue Type:</span>
              <span className="case-info-value">{caseData.claim.problem_type}</span>
            </div>
            <div className="case-info-item">
              <span className="case-info-label">Status:</span>
              <span className="case-info-value">
                <span className={`case-status ${caseData.claim.status.toLowerCase()}`}>
                  {caseData.claim.status}
                </span>
              </span>
            </div>
            <div className="case-info-item">
              <span className="case-info-label">Created:</span>
              <span className="case-info-value">{formatTimestamp(caseData.claim.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Conversation History */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ marginBottom: '15px', borderBottom: '2px solid rgba(255,255,255,0.2)', paddingBottom: '5px' }}>
            Conversation History
          </h3>
          <div className="conversation-history">
            {caseData.conversation.map((message, index) => (
              <div key={index} className={`conversation-message message-${message.type}`}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                  {getMessageIcon(message.type)}
                  <span style={{ marginLeft: '8px', fontWeight: 'bold', textTransform: 'capitalize' }}>
                    {message.type === 'user' ? 'Customer' : message.type === 'agent' ? 'AI Agent' : 'System'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', opacity: 0.7 }}>
                    <Clock size={12} style={{ marginRight: '4px' }} />
                    {formatTimestamp(message.timestamp)}
                  </span>
                </div>
                <div>{message.content}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Decisions */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ marginBottom: '15px', borderBottom: '2px solid rgba(255,255,255,0.2)', paddingBottom: '5px' }}>
            Agent Decision Timeline
          </h3>
          <div className="decision-steps">
            {caseData.decisions.map((decision, index) => (
              <div key={index} className="decision-step">
                <div className="step-number">{decision.step}</div>
                <div className="step-content">
                  <div className="step-title">
                    {decision.agent}
                  </div>
                  <div style={{ margin: '5px 0', fontWeight: '500' }}>
                    {decision.decision}
                  </div>
                  {renderDecisionDetails(decision.details)}
                  <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '8px' }}>
                    <Clock size={12} style={{ marginRight: '4px' }} />
                    {formatTimestamp(decision.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Case History */}
        <div>
          <h3 style={{ marginBottom: '15px', borderBottom: '2px solid rgba(255,255,255,0.2)', paddingBottom: '5px' }}>
            Status History
          </h3>
          <div className="decision-steps">
            {caseData.claim.history.map((historyItem, index) => (
              <div key={index} className="decision-step">
                <div className="step-number">{index + 1}</div>
                <div className="step-content">
                  <div className="step-title">
                    Status: {historyItem.status}
                  </div>
                  <div style={{ margin: '5px 0' }}>
                    {typeof historyItem.details === 'string' 
                      ? historyItem.details 
                      : JSON.stringify(historyItem.details, null, 2)
                    }
                  </div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '8px' }}>
                    <Clock size={12} style={{ marginRight: '4px' }} />
                    {formatTimestamp(historyItem.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
