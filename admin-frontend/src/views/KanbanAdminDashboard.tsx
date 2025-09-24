import React, { useState, useEffect } from 'react';
import { RefreshCw, MessageSquare, User, Clock, CheckCircle, AlertTriangle, Send } from 'lucide-react';

interface Message {
  timestamp: string;
  type: 'user' | 'agent' | 'admin';
  content: string;
  sender: string;
}

interface Conversation {
  conversation_id: string;
  customer_name: string;
  problem_type: string;
  status: 'OPEN' | 'REQUIRES_HUMAN' | 'CLOSED';
  created_at: string;
  last_updated: string;
  messages: Message[];
  requires_human: boolean;
  admin_user?: string;
  is_active: boolean;
}

interface ConversationsData {
  open: Conversation[];
  requires_human: Conversation[];
  closed: Conversation[];
}

export default function KanbanAdminDashboard() {
  const [conversations, setConversations] = useState<ConversationsData>({
    open: [],
    requires_human: [],
    closed: []
  });
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [adminMessage, setAdminMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [websockets, setWebsockets] = useState<Map<string, WebSocket>>(new Map());
  const [connectionStates, setConnectionStates] = useState<Map<string, boolean>>(new Map());

  const fetchConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:8000/api/admin/conversations');
      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.statusText}`);
      }
      
      const data = await response.json();
      setConversations(data.conversations || { open: [], requires_human: [], closed: [] });
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
      
      // Mock data for development
      const mockConversations: ConversationsData = {
        open: [
          {
            conversation_id: 'conv_1',
            customer_name: 'John Doe',
            problem_type: 'battery issue',
            status: 'OPEN',
            created_at: new Date(Date.now() - 300000).toISOString(),
            last_updated: new Date(Date.now() - 60000).toISOString(),
            requires_human: false,
            is_active: true,
            messages: [
              {
                timestamp: new Date(Date.now() - 300000).toISOString(),
                type: 'user',
                content: 'My car won\'t start, I think the battery is dead',
                sender: 'Customer'
              },
              {
                timestamp: new Date(Date.now() - 250000).toISOString(),
                type: 'agent',
                content: 'I understand you\'re having a battery issue. Let me help you with that.',
                sender: 'AI Agent'
              }
            ]
          }
        ],
        requires_human: [
          {
            conversation_id: 'conv_2',
            customer_name: 'Jane Smith',
            problem_type: 'complex issue',
            status: 'REQUIRES_HUMAN',
            created_at: new Date(Date.now() - 600000).toISOString(),
            last_updated: new Date(Date.now() - 120000).toISOString(),
            requires_human: true,
            is_active: true,
            messages: [
              {
                timestamp: new Date(Date.now() - 600000).toISOString(),
                type: 'user',
                content: 'I need help with my claim',
                sender: 'Customer'
              },
              {
                timestamp: new Date(Date.now() - 550000).toISOString(),
                type: 'agent',
                content: 'I can help you with your claim. What seems to be the issue?',
                sender: 'AI Agent'
              },
              {
                timestamp: new Date(Date.now() - 120000).toISOString(),
                type: 'user',
                content: 'This is too complicated, I need to speak to a human',
                sender: 'Customer'
              }
            ]
          }
        ],
        closed: [
          {
            conversation_id: 'conv_3',
            customer_name: 'Bob Wilson',
            problem_type: 'flat tire',
            status: 'CLOSED',
            created_at: new Date(Date.now() - 1200000).toISOString(),
            last_updated: new Date(Date.now() - 900000).toISOString(),
            requires_human: false,
            is_active: false,
            messages: [
              {
                timestamp: new Date(Date.now() - 1200000).toISOString(),
                type: 'user',
                content: 'I have a flat tire',
                sender: 'Customer'
              },
              {
                timestamp: new Date(Date.now() - 1150000).toISOString(),
                type: 'agent',
                content: 'I\'ll dispatch roadside assistance for your flat tire.',
                sender: 'AI Agent'
              }
            ]
          }
        ]
      };
      setConversations(mockConversations);
    } finally {
      setLoading(false);
    }
  };

  // WebSocket management
  const connectToConversation = (conversationId: string) => {
    if (websockets.has(conversationId)) {
      return; // Already connected
    }

    const wsUrl = `ws://localhost:8000/ws/admin/${conversationId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`Admin WebSocket connected to conversation ${conversationId}`);
      setConnectionStates(prev => new Map(prev.set(conversationId, true)));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'client_message') {
          // Update conversation messages in real-time
          setConversations(prev => {
            const updated = { ...prev };
            ['open', 'requires_human', 'closed'].forEach(status => {
              updated[status] = updated[status].map(conv => {
                if (conv.conversation_id === conversationId) {
                  return {
                    ...conv,
                    messages: [...conv.messages, {
                      timestamp: data.timestamp,
                      type: 'user',
                      content: data.content,
                      sender: data.sender
                    }],
                    last_updated: new Date().toISOString()
                  };
                }
                return conv;
              });
            });
            return updated;
          });

          // Update selected conversation if it's the same one
          if (selectedConversation?.conversation_id === conversationId) {
            setSelectedConversation(prev => prev ? {
              ...prev,
              messages: [...prev.messages, {
                timestamp: data.timestamp,
                type: 'user',
                content: data.content,
                sender: data.sender
              }],
              last_updated: new Date().toISOString()
            } : null);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log(`Admin WebSocket disconnected from conversation ${conversationId}`);
      setConnectionStates(prev => new Map(prev.set(conversationId, false)));
      setWebsockets(prev => {
        const updated = new Map(prev);
        updated.delete(conversationId);
        return updated;
      });
    };

    ws.onerror = (error) => {
      console.error(`Admin WebSocket error for conversation ${conversationId}:`, error);
      setConnectionStates(prev => new Map(prev.set(conversationId, false)));
    };

    setWebsockets(prev => new Map(prev.set(conversationId, ws)));
  };

  const disconnectFromConversation = (conversationId: string) => {
    const ws = websockets.get(conversationId);
    if (ws) {
      ws.close();
    }
  };

  const sendAdminMessage = async (conversationId: string) => {
    if (!adminMessage.trim()) return;

    try {
      // First, ensure the conversation exists in the backend
      await fetch("http://localhost:8000/api/admin/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          customer_name: selectedConversation?.customer_name || "Unknown",
          problem_type: selectedConversation?.problem_type || "Unknown"
        }),
      }).catch(() => {
        // Ignore errors - conversation might already exist
        console.log('Conversation already exists or error creating it');
      });

      // Connect to WebSocket if not already connected (for receiving client messages)
      if (!websockets.has(conversationId)) {
        connectToConversation(conversationId);
      }

      // Send via HTTP API (which will broadcast via WebSocket automatically)
      const response = await fetch(`http://localhost:8000/api/admin/conversations/${conversationId}/admin_message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          admin_user: 'Admin User',
          message: adminMessage
        })
      });

      if (response.ok) {
        // Add message to local state immediately
        const newMessage: Message = {
          timestamp: new Date().toISOString(),
          type: 'admin',
          content: adminMessage,
          sender: 'Admin User'
        };

        // Update conversations state
        setConversations(prev => {
          const updated = { ...prev };
          ['open', 'requires_human', 'closed'].forEach(status => {
            updated[status] = updated[status].map(conv => {
              if (conv.conversation_id === conversationId) {
                return {
                  ...conv,
                  messages: [...conv.messages, newMessage],
                  last_updated: new Date().toISOString()
                };
              }
              return conv;
            });
          });
          return updated;
        });

        // Update selected conversation
        if (selectedConversation?.conversation_id === conversationId) {
          setSelectedConversation(prev => prev ? {
            ...prev,
            messages: [...prev.messages, newMessage],
            last_updated: new Date().toISOString()
          } : null);
        }

        setAdminMessage('');
      } else {
        throw new Error('Failed to send message');
      }
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send message. Please try again.');
    }
  };

  const takeoverConversation = async (conversationId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/admin/conversations/${conversationId}/takeover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          admin_user: 'Admin User'
        })
      });

      if (response.ok) {
        await fetchConversations();
      } else {
        throw new Error('Failed to take over conversation');
      }
    } catch (err) {
      console.error('Error taking over conversation:', err);
      alert('Failed to take over conversation. Please try again.');
    }
  };

  const closeConversation = async (conversationId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/admin/conversations/${conversationId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      if (response.ok) {
        await fetchConversations();
        if (selectedConversation?.conversation_id === conversationId) {
          setSelectedConversation(null);
        }
      } else {
        throw new Error('Failed to close conversation');
      }
    } catch (err) {
      console.error('Error closing conversation:', err);
      alert('Failed to close conversation. Please try again.');
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const ConversationCard = ({ conversation, onSelect }: { conversation: Conversation; onSelect: () => void }) => (
    <div 
      className="conversation-card"
      onClick={onSelect}
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        backgroundColor: 'white',
        cursor: 'pointer',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{conversation.customer_name}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{conversation.problem_type}</div>
        </div>
        <div style={{ fontSize: '10px', color: '#999' }}>
          {getTimeAgo(conversation.last_updated)}
        </div>
      </div>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
        {conversation.messages.length} messages
      </div>
      {conversation.messages.length > 0 && (
        <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
          Last: "{conversation.messages[conversation.messages.length - 1].content.substring(0, 50)}..."
        </div>
      )}
    </div>
  );

  const KanbanColumn = ({ title, conversations, color, icon }: { 
    title: string; 
    conversations: Conversation[]; 
    color: string; 
    icon: React.ReactNode;
  }) => (
    <div style={{ flex: 1, margin: '0 8px' }}>
      <div style={{
        backgroundColor: color,
        color: 'white',
        padding: '12px',
        borderRadius: '8px 8px 0 0',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontWeight: 'bold'
      }}>
        {icon}
        {title} ({conversations.length})
      </div>
      <div style={{
        backgroundColor: '#f8f9fa',
        minHeight: '400px',
        padding: '12px',
        borderRadius: '0 0 8px 8px',
        border: '1px solid #e0e0e0',
        borderTop: 'none'
      }}>
        {conversations.map((conversation) => (
          <ConversationCard
            key={conversation.conversation_id}
            conversation={conversation}
            onSelect={() => setSelectedConversation(conversation)}
          />
        ))}
        {conversations.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', marginTop: '20px' }}>
            No conversations
          </div>
        )}
      </div>
    </div>
  );

  useEffect(() => {
    fetchConversations();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchConversations, 10000);
    
    return () => {
      clearInterval(interval);
      // Cleanup all WebSocket connections on unmount
      websockets.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
    };
  }, [websockets]);

  // Auto-connect to WebSocket when a conversation is selected
  useEffect(() => {
    if (selectedConversation && selectedConversation.status === 'REQUIRES_HUMAN') {
      connectToConversation(selectedConversation.conversation_id);
    }
  }, [selectedConversation]);

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f6fa', minHeight: '100vh', color: 'black' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: 'black' }}>Insurance Admin Dashboard</h1>
          <p style={{ margin: '4px 0 0 0', color: '#333' }}>Real-time conversation monitoring</p>
        </div>
        <button 
          onClick={fetchConversations}
          style={{
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ 
          background: 'rgba(244, 67, 54, 0.1)', 
          border: '1px solid rgba(244, 67, 54, 0.3)',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '20px',
          color: '#f44336'
        }}>
          <strong>Error:</strong> {error}
          <br />
          <small>Showing mock data for development</small>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <h3>Loading conversations...</h3>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0' }}>
          <KanbanColumn
            title="Open"
            conversations={conversations.open}
            color="#28a745"
            icon={<AlertTriangle size={16} />}
          />
          <KanbanColumn
            title="Requires Human"
            conversations={conversations.requires_human}
            color="#ffc107"
            icon={<User size={16} />}
          />
          <KanbanColumn
            title="Closed"
            conversations={conversations.closed}
            color="#6c757d"
            icon={<CheckCircle size={16} />}
          />
        </div>
      )}

      {/* Chat Modal */}
      {selectedConversation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '600px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #e0e0e0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0 }}>{selectedConversation.customer_name}</h3>
                <p style={{ margin: '4px 0 0 0', color: '#666' }}>
                  {selectedConversation.problem_type} • {formatTime(selectedConversation.created_at)}
                </p>
              </div>
              <button
                onClick={() => setSelectedConversation(null)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ×
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              padding: '20px',
              overflowY: 'auto',
              maxHeight: '400px'
            }}>
              {selectedConversation.messages.map((message, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div style={{
                    maxWidth: '70%',
                    padding: '12px',
                    borderRadius: '12px',
                    backgroundColor: message.type === 'user' ? '#007bff' : 
                                   message.type === 'admin' ? '#28a745' : '#f1f3f5',
                    color: message.type === 'user' || message.type === 'admin' ? 'white' : 'black'
                  }}>
                    <div style={{ fontSize: '14px' }}>{message.content}</div>
                    <div style={{
                      fontSize: '10px',
                      opacity: 0.7,
                      marginTop: '4px'
                    }}>
                      {message.sender} • {formatTime(message.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Admin Actions */}
            <div style={{
              padding: '20px',
              borderTop: '1px solid #e0e0e0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {selectedConversation.status === 'REQUIRES_HUMAN' && (
                <>
                  <div style={{ 
                    fontSize: '12px', 
                    color: connectionStates.get(selectedConversation.conversation_id) ? '#28a745' : '#dc3545',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {connectionStates.get(selectedConversation.conversation_id) ? '🟢 Connected' : '🔴 Disconnected'} 
                    to live chat
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={adminMessage}
                      onChange={(e) => setAdminMessage(e.target.value)}
                      placeholder="Type your message..."
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        border: '1px solid #e0e0e0',
                        borderRadius: '6px'
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          sendAdminMessage(selectedConversation.conversation_id);
                        }
                      }}
                    />
                    <button
                      onClick={() => sendAdminMessage(selectedConversation.conversation_id)}
                      style={{
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Send size={16} />
                      Send
                    </button>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedConversation.status === 'OPEN' && (
                  <button
                    onClick={() => takeoverConversation(selectedConversation.conversation_id)}
                    style={{
                      backgroundColor: '#ffc107',
                      color: 'black',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      cursor: 'pointer'
                    }}
                  >
                    Take Over
                  </button>
                )}
                
                {selectedConversation.status !== 'CLOSED' && (
                  <button
                    onClick={() => closeConversation(selectedConversation.conversation_id)}
                    style={{
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      cursor: 'pointer'
                    }}
                  >
                    Close Conversation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
