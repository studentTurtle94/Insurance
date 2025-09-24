import React, { useState, useEffect, useRef } from 'react';
import { X, User, Bot, Settings, Clock, Send, MessageCircle } from 'lucide-react';

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
  type: 'user' | 'agent' | 'system' | 'admin';
  content: string;
  sender?: string;
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
  const [messages, setMessages] = useState<ConversationMessage[]>(caseData.conversation);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [adminUser] = useState('Admin User'); // In real app, get from auth context
  const websocketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'user':
        return <User size={16} />;
      case 'agent':
        return <Bot size={16} />;
      case 'admin':
        return <MessageCircle size={16} />;
      case 'system':
        return <Settings size={16} />;
      default:
        return <Bot size={16} />;
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // WebSocket connection setup
  useEffect(() => {
    const conversationId = caseData.claim.claim_id;
    const wsUrl = `ws://localhost:8000/ws/admin/${conversationId}`;
    
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(wsUrl);
        websocketRef.current = ws;

        ws.onopen = () => {
          console.log('Admin WebSocket connected');
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          if (data.type === 'client_message') {
            const newMsg: ConversationMessage = {
              timestamp: data.timestamp,
              type: 'user',
              content: data.content,
              sender: data.sender
            };
            setMessages(prev => [...prev, newMsg]);
          }
        };

        ws.onclose = () => {
          console.log('Admin WebSocket disconnected');
          setIsConnected(false);
          // Attempt to reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (error) => {
          console.error('Admin WebSocket error:', error);
          setIsConnected(false);
        };
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        setIsConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, [caseData.claim.claim_id]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !isConnected) return;

    try {
      // Send via WebSocket for real-time delivery
      if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
        websocketRef.current.send(JSON.stringify({
          type: 'admin_message',
          content: newMessage,
          admin_user: adminUser
        }));
      }

      // Also send via HTTP API for persistence (fallback)
      await fetch(`http://localhost:8000/api/admin/conversations/${caseData.claim.claim_id}/admin_message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_user: adminUser,
          message: newMessage
        })
      });

      // Add message to local state
      const newMsg: ConversationMessage = {
        timestamp: new Date().toISOString(),
        type: 'admin',
        content: newMessage,
        sender: adminUser
      };
      setMessages(prev => [...prev, newMsg]);
      setNewMessage('');

    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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

        {/* Live Conversation */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ marginBottom: '15px', borderBottom: '2px solid rgba(255,255,255,0.2)', paddingBottom: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            Live Conversation
            <span style={{ 
              fontSize: '12px', 
              padding: '2px 8px', 
              borderRadius: '12px', 
              backgroundColor: isConnected ? '#28a745' : '#dc3545',
              color: 'white'
            }}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
          </h3>
          
          {/* Messages */}
          <div className="conversation-history" style={{ 
            maxHeight: '400px', 
            overflowY: 'auto', 
            marginBottom: '15px',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            padding: '10px'
          }}>
            {messages.map((message, index) => (
              <div key={index} className={`conversation-message message-${message.type}`}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                  {getMessageIcon(message.type)}
                  <span style={{ marginLeft: '8px', fontWeight: 'bold', textTransform: 'capitalize' }}>
                    {message.type === 'user' ? 'Customer' : 
                     message.type === 'agent' ? 'AI Agent' : 
                     message.type === 'admin' ? (message.sender || 'Admin') :
                     'System'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', opacity: 0.7 }}>
                    <Clock size={12} style={{ marginRight: '4px' }} />
                    {formatTimestamp(message.timestamp)}
                  </span>
                </div>
                <div style={{
                  backgroundColor: message.type === 'admin' ? 'rgba(0, 123, 255, 0.1)' : 'transparent',
                  padding: message.type === 'admin' ? '8px' : '0',
                  borderRadius: message.type === 'admin' ? '4px' : '0',
                  borderLeft: message.type === 'admin' ? '3px solid #007bff' : 'none'
                }}>
                  {message.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Admin Message Input */}
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            padding: '10px',
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)'
          }}>
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isConnected ? "Type your message to the customer..." : "Connecting..."}
              disabled={!isConnected}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '6px',
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: 'white',
                resize: 'vertical',
                minHeight: '60px',
                maxHeight: '120px'
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim() || !isConnected}
              style={{
                padding: '8px 16px',
                backgroundColor: (!newMessage.trim() || !isConnected) ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: (!newMessage.trim() || !isConnected) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                alignSelf: 'flex-start'
              }}
            >
              <Send size={16} />
              Send
            </button>
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
