import { useEffect, useRef, useState } from "react";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { tool } from "@openai/agents/realtime";
import { z } from "zod";

export default function ClientView() {
  const [state, setState] = useState<any>({ step: 0 });
  const [, setStatusMessage] = useState<string>("No updates yet.");
  const [input, setInput] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    type: 'user' | 'agent' | 'system';
    content: string;
    timestamp: Date;
    metadata?: {
      hasAudio?: boolean;
      isTranscript?: boolean;
      toolCalls?: any[];
      toolResults?: any[];
      wasInterrupted?: boolean;
      isAdminMessage?: boolean;
      adminUser?: string;
    };
  }>>([{
    id: 'initial',
    type: 'agent',
    content: "Hello! I'm here to help with your roadside assistance request. Can you briefly describe what's happening with your vehicle?",
    timestamp: new Date(),
    metadata: {}
  }]);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const agentRef = useRef<RealtimeAgent | null>(null);
  const clientSecretRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [isHandedOffToHuman, setIsHandedOffToHuman] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    // Initialize OpenAI Realtime Agent using the official SDK
    const initRealtimeAgent = async () => {
      try {
        // Clean up any existing connections first
        if (sessionRef.current) {
          console.log('Cleaning up existing session before creating new one');
          sessionRef.current = null;
          agentRef.current = null;
          setIsConnected(false);
        }

        // Get ephemeral client secret from backend (secure approach)
        const clientSecretResponse = await fetch("http://localhost:8000/api/realtime/client_secret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        
        if (!clientSecretResponse.ok) {
          throw new Error(`Failed to get client secret: ${clientSecretResponse.statusText}`);
        }
        
        const { client_secret } = await clientSecretResponse.json();
        console.log('Got ephemeral client secret');
        
        // Store client secret for later use
        clientSecretRef.current = client_secret;
        
        // Generate conversation ID
        conversationIdRef.current = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Check if component is still mounted
        if (!isMounted) return;

        // Define tools for collecting insurance information
        const collectInfoTool = tool({
          name: 'collect_customer_info',
          description: 'Collect and store customer information for roadside assistance. IMPORTANT: Always check coverage for the issue before proceeding with dispatch.',
          parameters: z.object({
            location: z.string().nullable(),
            issue: z.string().nullable(),
            ready: z.boolean().nullable()
          }),
          async execute({ location, issue, ready }) {

            // Check for human handoff request first - regardless of what parameter it comes in
            const checkForHumanRequest = (text: string) => {
              if (!text) return false;
              const lowerText = text.toLowerCase();
              return lowerText.includes('human') || 
                     lowerText.includes('person') || 
                     lowerText.includes('speak to someone') ||
                     lowerText.includes('talk to someone') ||
                     lowerText.includes('representative') ||
                     lowerText.includes('agent') ||
                     lowerText.includes('need help') ||
                     lowerText.includes('needs human');
            };

            // Check all inputs for human handoff requests
            if (checkForHumanRequest(issue || '') || 
                checkForHumanRequest(location || '')) {
              
              // Interrupt and disconnect the LLM session
              if (sessionRef.current) {
                try {
                  await sessionRef.current.close();
                  console.log('LLM session interrupted for human handoff');
                } catch (error) {
                  console.error('Error interrupting LLM session:', error);
                }
              }
              
              // First, let the LLM respond with a handoff message before interrupting
              const handoffMessage = "I understand you'd like to speak with a human representative. Let me connect you with one of our customer service agents who can assist you personally. Please hold on while I transfer your conversation.";
              
              // Add a small delay to let the LLM message be processed and displayed
              setTimeout(async () => {
                try {
                  // Interrupt and disconnect the LLM session after the message is sent
                  if (sessionRef.current) {
                    try {
                      await sessionRef.current.close();
                      console.log('LLM session interrupted for human handoff');
                    } catch (error) {
                      console.error('Error interrupting LLM session:', error);
                    }
                  }
                  
                  console.log('WebSocket status during handoff:', {
                    isConnected: isWebSocketConnected,
                    websocketExists: !!websocketRef.current,
                    conversationId: conversationIdRef.current
                  });
                  
                  // Mark as handed off to human to prevent further LLM responses
                  setIsHandedOffToHuman(true);
                  
                  // Mark conversation as needing human
                  if (conversationIdRef.current) {
                    try {
                      // First create the conversation entry
                      await fetch("http://localhost:8000/api/admin/conversations", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          conversation_id: conversationIdRef.current,
                          customer_name: "Customer",
                          problem_type: issue || "Human assistance requested"
                        }),
                      }).catch(() => {
                        console.log('Conversation already exists or error creating it');
                      });

                      // Then add the human request message
                      await fetch(`http://localhost:8000/api/admin/conversations/${conversationIdRef.current}/message`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          message_type: "user",
                          content: issue || location || "Customer requested human assistance",
                          sender: "Customer"
                        }),
                      });

                      // Mark conversation as requiring human
                      await fetch(`http://localhost:8000/api/admin/conversations/${conversationIdRef.current}/takeover`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          admin_user: "System"
                        }),
                      });
                      
                      // Add a system message to the chat indicating the handoff
                      setChatMessages(prev => [...prev, {
                        id: `system_handoff_${Date.now()}`,
                        type: 'system' as const,
                        content: '🔄 You are now connected to a human agent. They will assist you shortly.',
                        timestamp: new Date(),
                        metadata: {}
                      }]);
                      
                      // Auto-scroll to bottom after adding system message
                      setTimeout(() => {
                        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    } catch (error) {
                      console.error('Error setting up human handoff:', error);
                    }
                  }
                } catch (error) {
                  console.error('Error during handoff process:', error);
                }
              }, 2000); // 2 second delay to let the LLM message be displayed
              
              return handoffMessage;
            }

            // If we have an issue, check coverage first
            if (issue) {
              try {
                const coverageResponse = await fetch("http://localhost:8000/api/check_coverage", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ problem_description: issue }),
                });
                
                if (coverageResponse.ok) {
                  const coverageData = await coverageResponse.json();
                  
                  if (!coverageData.is_covered) {
                    // Update state to show coverage denial
                    setState((prevState: any) => {
                      const newState = {
                        ...prevState,
                        collected: {
                          ...prevState.collected,
                          problem_description: issue,
                          problem_type: coverageData.problem_type,
                          is_covered: false,
                          coverage_reason: coverageData.coverage_reason
                        },
                        coverage_denied: true
                      };
                      localStorage.setItem("copilot_state", JSON.stringify(newState));
                      return newState;
                    });
                    
                    return `I understand you need help with ${coverageData.problem_type}. Unfortunately, ${coverageData.coverage_reason}. You may want to contact a service provider directly or consider upgrading your policy coverage.`;
                  }
                }
              } catch (error) {
                console.error('Error checking coverage:', error);
              }
            }

            // Update the state with collected information
            setState((prevState: any) => {
              const newState = {
                ...prevState,
                collected: {
                  ...prevState.collected,
                  customer_name: "John Doe", // Set default policy holder name
                  ...(location && { location_description: location }),
                  ...(issue && { problem_description: issue, problem_type: issue }),
                },
                ...(ready && { ready_for_dispatch: true })
              };
              
              // Store in localStorage
              localStorage.setItem("copilot_state", JSON.stringify(newState));
              
              return newState;
            });
            
            return `Information collected successfully. ${location ? `Location: ${location}. ` : ''}${issue ? `Issue: ${issue}. ` : ''}`;
          },
        });

        // Create the Realtime Agent
        const agent = new RealtimeAgent({
          name: 'Insurance Assistant',
          instructions: `You are a helpful insurance assistant for roadside assistance. 

CRITICAL: If the customer asks for a human, representative, person, or says "needs human" - IMMEDIATELY use the collect_customer_info tool with that request as the "issue" parameter. Do not ask for anything else first.

Your job is to collect the following information from the customer:
1. Description of their vehicle problem (FIRST - to check coverage)
2. Location (only if problem is covered)

IMPORTANT PROCESS:
- ALWAYS listen for human handoff requests FIRST - if detected, immediately call the tool
- If no human request, ask for the problem description first
- When you get the problem description, immediately use the collect_customer_info tool with just the "issue" parameter
- The tool will check coverage and tell you if the service is covered
- If NOT covered, the tool will return a denial message - relay this message exactly to the customer and end the conversation
- If covered, continue collecting location

HUMAN HANDOFF KEYWORDS: "human", "person", "representative", "agent", "needs human", "speak to someone", "talk to someone"

Be conversational, empathetic, and professional. Ask one question at a time and listen carefully to their responses. 

When you have collected a piece of information, immediately use the collect_customer_info tool to store it.

Once you have both pieces of information (location and covered issue), use the collect_customer_info tool with ready=true to indicate the conversation is complete.

Keep your responses concise and focused on gathering the required information for dispatch.`,
          tools: [collectInfoTool],
        });

        if (!isMounted) return;
        agentRef.current = agent;

        // Create the Realtime Session with manual audio control
        const session = new RealtimeSession(agent, {
          model: 'gpt-realtime',
          config: {
            outputModalities: ['text', 'audio'],
            inputAudioTranscription: {
              model: 'gpt-4o-mini-transcribe',
            },
            // voice: 'ash',
            turnDetection: {
              type: 'semantic_vad',
              eagerness: 'medium',
              createResponse: true,
              interruptResponse: true,
            },
          },
        });

        if (!isMounted) return;
        sessionRef.current = session;

        // Enhanced history management from RealtimeSession
        session.on('history_updated', (history: any[]) => {
          console.log('History updated:', history);
          
          // Convert session history to chat messages with enhanced handling
          const newChatMessages = history.map((item, index) => {
            let content = '';
            let type: 'user' | 'agent' | 'system' = 'system';
            let metadata: any = {};
            
            if (item.type === 'message') {
              type = item.role === 'user' ? 'user' : 'agent';
              
              // Extract text content from various formats
              if (item.content) {
                if (Array.isArray(item.content)) {
                  // Handle array of content objects
                  const textContent = item.content
                    .filter((c: any) => c.type === 'text' || c.type === 'input_text')
                    .map((c: any) => c.text)
                    .join(' ');
                  
                  // Check for audio content
                  const audioContent = item.content.find((c: any) => c.type === 'input_audio');
                  if (audioContent && !textContent) {
                    content = '[Audio message]';
                    metadata.hasAudio = true;
                  } else {
                    content = textContent;
                  }
                } else if (typeof item.content === 'string') {
                  content = item.content;
                } else if (item.content.text) {
                  content = item.content.text;
                }
              }
              
              // Prioritize transcripts over content for audio messages
              if (item.formatted?.transcript) {
                content = item.formatted.transcript;
                metadata.isTranscript = true;
              } else if (item.transcript) {
                content = item.transcript;
                metadata.isTranscript = true;
              }
              
              // Handle function calls and responses
              if (item.formatted?.tool_calls) {
                metadata.toolCalls = item.formatted.tool_calls;
              }
              if (item.formatted?.tool_call_results) {
                metadata.toolResults = item.formatted.tool_call_results;
              }
              
              // Mark interrupted responses
              if (item.status === 'incomplete') {
                metadata.wasInterrupted = true;
              }
            }
            
            return {
              id: `history_${item.itemId || index}_${Date.now()}`,
              type,
              content: content || (metadata.hasAudio ? '[Audio message]' : 'Processing...'),
              timestamp: new Date(item.created_at || Date.now()),
              metadata
            };
          }).filter(msg => msg.content && msg.content !== 'Processing...');
          
          // Always ensure the initial greeting is present at the beginning
          const initialGreeting = {
            id: 'initial',
            type: 'agent' as const,
            content: "Hello! I'm here to help with your roadside assistance request. Can you briefly describe what's happening with your vehicle?",
            timestamp: new Date(Date.now() - 1000000), // Set timestamp to be older than other messages
            metadata: {}
          };
          
          // Check if initial greeting already exists in the messages
          const hasInitialGreeting = newChatMessages.some(msg => msg.id === 'initial');
          
          // Always add the initial greeting at the beginning if not present
          if (!hasInitialGreeting) {
            newChatMessages.unshift(initialGreeting);
          }
          
          // Update chat messages with the complete history
          setChatMessages(newChatMessages);
          
          // Auto-scroll to bottom
          setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        });

        // Don't auto-connect - wait for user to click start
        if (isMounted) {
          setIsConnected(true); // Session is ready but not connected
          setIsListening(false); // Start with listening off
          console.log('Realtime Agent initialized successfully - ready for manual control');
          
          // Initialize WebSocket connection for admin messages
          initWebSocketConnection();
        }

      } catch (error) {
        console.error("Failed to initialize Realtime Agent:", error);
        if (isMounted) {
          setIsConnected(false);
        }
      }
    };

    void initRealtimeAgent();

    // WebSocket connection for admin messages
    const initWebSocketConnection = () => {
      if (!conversationIdRef.current) {
        console.log('No conversation ID available for WebSocket connection');
        return;
      }

      const wsUrl = `ws://localhost:8000/ws/client/${conversationIdRef.current}`;
      
      const connectWebSocket = () => {
        try {
          const ws = new WebSocket(wsUrl);
          websocketRef.current = ws;

          ws.onopen = () => {
            console.log('Client WebSocket connected');
            setIsWebSocketConnected(true);
          };

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              console.log('WebSocket message received:', data);
              
              if (data.type === 'admin_message') {
                console.log('Processing admin message:', data);
                // Add admin message to chat
                const adminMessage = {
                  id: `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  type: 'agent' as const, // Display admin messages as agent messages in client UI
                  content: `👨‍💼 ${data.admin_user || data.sender}: ${data.content}`,
                  timestamp: new Date(data.timestamp || Date.now()),
                  metadata: {
                    isAdminMessage: true,
                    adminUser: data.admin_user || data.sender
                  }
                };
                
                console.log('Adding admin message to chat:', adminMessage);
                setChatMessages(prev => {
                  const newMessages = [...prev, adminMessage];
                  console.log('Updated chat messages:', newMessages);
                  return newMessages;
                });
                
                // Auto-scroll to bottom
                setTimeout(() => {
                  chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            } catch (error) {
              console.error('Error parsing WebSocket message:', error);
            }
          };

          ws.onclose = () => {
            console.log('Client WebSocket disconnected');
            setIsWebSocketConnected(false);
            // Attempt to reconnect after 3 seconds if still mounted
            if (isMounted) {
              setTimeout(connectWebSocket, 3000);
            }
          };

          ws.onerror = (error) => {
            console.error('Client WebSocket error:', error);
            setIsWebSocketConnected(false);
          };
        } catch (error) {
          console.error('Failed to connect WebSocket:', error);
          setIsWebSocketConnected(false);
        }
      };

      connectWebSocket();
    };
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:8000/api/get_status");
        const data = await res.json();
        if (data?.message) setStatusMessage(data.message);
      } catch (error) {
        console.error("Failed to fetch status:", error);
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      // Proper cleanup of WebSocket connection
      if (sessionRef.current) {
        console.log('Cleaning up Realtime session on unmount');
        // Note: RealtimeSession cleanup is handled internally
        sessionRef.current = null;
        agentRef.current = null;
        setIsConnected(false);
      }
      // Cleanup WebSocket connection
      if (websocketRef.current) {
        console.log('Cleaning up WebSocket connection on unmount');
        websocketRef.current.close();
        websocketRef.current = null;
        setIsWebSocketConnected(false);
      }
    };
  }, []);


  // History management functions using RealtimeSession's updateHistory
  const clearChatHistory = () => {
    if (sessionRef.current) {
      // Clear session history
      sessionRef.current.updateHistory([]);
    }
    // Also clear local chat messages except initial greeting
    setChatMessages([{
      id: 'initial',
      type: 'agent',
      content: "Hello! I'm here to help with your roadside assistance request. Can you briefly describe what's happening with your vehicle?",
      timestamp: new Date(Date.now() - 1000000), // Set timestamp to be older than other messages
      metadata: {}
    }]);
  };

  const removeMessageFromHistory = (messageId: string) => {
    // Prevent removal of initial greeting
    if (messageId === 'initial') {
      console.log('Cannot remove initial greeting message');
      return;
    }

    if (sessionRef.current) {
      // Update session history by filtering out the message
      sessionRef.current.updateHistory((currentHistory) => {
        return currentHistory.filter((item) => {
          // Use itemId property which exists on RealtimeItem
          return !messageId.includes(item.itemId || '');
        });
      });
    }
    
    // Also update local state
    setChatMessages(prev => prev.filter(msg => msg.id !== messageId));
  };

  const removeAgentMessages = () => {
    if (sessionRef.current) {
      // Remove all assistant messages from session history
      sessionRef.current.updateHistory((currentHistory) => {
        return currentHistory.filter(
          (item) => !(item.type === 'message' && item.role === 'assistant')
        );
      });
    }
    
    // Also update local state but preserve initial greeting
    setChatMessages(prev => prev.filter(msg => msg.type !== 'agent' || msg.id === 'initial'));
  };

  // Helper functions for conversation tracking
  const createConversation = async () => {
    if (!conversationIdRef.current) return;
    
    try {
      await fetch("http://localhost:8000/api/admin/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationIdRef.current,
          customer_name: "John Doe",
          problem_type: state?.collected?.problem_type || "Unknown"
        }),
      });
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const addMessageToConversation = async (type: string, content: string) => {
    if (!conversationIdRef.current) return;
    
    try {
      await fetch(`http://localhost:8000/api/admin/conversations/${conversationIdRef.current}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_type: type,
          content: content,
          sender: type === "user" ? "Customer" : "AI Agent"
        }),
      });
    } catch (error) {
      console.error('Failed to add message to conversation:', error);
    }
  };

  const startListening = async () => {
    if (isHandedOffToHuman) {
      alert("This conversation has been transferred to a human agent. Voice chat with AI is no longer available. Please use text chat to communicate with the human agent.");
      return;
    }

    if (!isConnected || !sessionRef.current || !clientSecretRef.current) {
      alert("Not ready to connect. Please refresh the page.");
      return;
    }

    try {
      // Create conversation when first starting
      await createConversation();
      
      // Connect to start listening
      await sessionRef.current.connect({ apiKey: clientSecretRef.current });
      setIsListening(true);
      console.log('Connected to session - started listening');
    } catch (error) {
      console.error('Failed to start listening:', error);
      alert('Failed to start microphone. Please check permissions.');
    }
  };

  const stopListening = async () => {
    if (!sessionRef.current) return;

    try {
      // Interrupt to stop listening while keeping connection alive
      await sessionRef.current.close();
      setIsListening(false);
      console.log('Interrupted session - stopped listening');
    } catch (error) {
      console.error('Failed to stop listening:', error);
    }
  };



  const sendText = async () => {
    const text = input.trim();
    console.log("[DEBUG] sendText called with:", text);
    if (!text) return;
    
    // If conversation is handed off to human, only send via WebSocket, don't send to LLM
    if (isHandedOffToHuman) {
      localStorage.setItem(
        "copilot_transcript",
        (localStorage.getItem("copilot_transcript") || "") + `\nClient: ${text}`
      );

      // Only send via WebSocket for admin visibility, don't send to LLM
      if (conversationIdRef.current && isWebSocketConnected && websocketRef.current) {
        try {
          // Create conversation if it doesn't exist
          await fetch("http://localhost:8000/api/admin/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversation_id: conversationIdRef.current,
              customer_name: "John Doe",
              problem_type: state?.collected?.problem_type || "Roadside Assistance"
            }),
          }).catch(() => {
            console.log('Conversation already exists or error creating it');
          });

          // Send message via WebSocket for real-time admin updates
          websocketRef.current.send(JSON.stringify({
            type: 'message',
            content: text
          }));

          // Track the user message for conversation history
          await addMessageToConversation("user", text);

          // Add message to local chat display
          const userMessage = {
            id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'user' as const,
            content: text,
            timestamp: new Date(),
            metadata: {}
          };
          setChatMessages(prev => [...prev, userMessage]);

          setInput("");
          console.log('Message sent to admin via WebSocket (LLM bypassed due to human handoff)');
          
        } catch (error) {
          console.error('Error sending message via WebSocket:', error);
          setInput("");
        }
      }
      return; // Exit early, don't send to LLM
    }

    // Normal flow - send to LLM
    if (!isConnected || !sessionRef.current) {
      alert("Not connected to OpenAI Realtime API. Please refresh the page.");
      return;
    }

    localStorage.setItem(
      "copilot_transcript",
      (localStorage.getItem("copilot_transcript") || "") + `\nClient: ${text}`
    );

    // Ensure conversation exists and send message via WebSocket for admin visibility
    if (conversationIdRef.current && isWebSocketConnected && websocketRef.current) {
      try {
        // Create conversation if it doesn't exist
        await fetch("http://localhost:8000/api/admin/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversationIdRef.current,
            customer_name: "John Doe",
            problem_type: state?.collected?.problem_type || "Roadside Assistance"
          }),
        }).catch(() => {
          console.log('Conversation already exists or error creating it');
        });

        // Send message via WebSocket for real-time admin updates
        websocketRef.current.send(JSON.stringify({
          type: 'message',
          content: text
        }));
      } catch (error) {
        console.error('Error sending message via WebSocket:', error);
      }
    }

    // Track the user message (chat will be updated via history_updated event)
    await addMessageToConversation("user", text);
    
    // Send text message through RealtimeSession using sendMessage method
    try {
      console.log('Sending message to agent:', text);
      
      if (!sessionRef.current) {
        throw new Error('Session not available');
      }
      
      // Use the correct sendMessage method
      await sessionRef.current.sendMessage(text);
      setInput("");
      console.log('Message sent successfully using sendMessage method');
      
    } catch (error) {
      console.error('Error sending text message via sendMessage:', error);
      setInput("");
      alert('Failed to send message. Please check your connection and try again.');
    }
  };

  const submitClaim = async () => {
    if (!state?.ready_for_dispatch) {
      alert("Please complete the conversation first!");
      return;
    }
    
    const res = await fetch("http://localhost:8000/api/process_claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_state: state }),
    });
    const data = await res.json();
    localStorage.setItem("copilot_analysis", JSON.stringify(data));
    
    // Show communications in the transcript
    if (data.communications) {
      const existingTranscript = localStorage.getItem("copilot_transcript") || "";
      const newMessages = data.communications.join("\n");
      localStorage.setItem("copilot_transcript", existingTranscript + "\n" + newMessages);
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f5f6fa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>

      {/* Header */}
      <div style={{
        backgroundColor: '#007bff',
        color: 'white',
        padding: '16px 20px',
        borderBottom: '1px solid #e0e0e0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Insurance Assistant</h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
              {isHandedOffToHuman ? '👨‍💼 Connected to human agent' : 
               isConnected ? (isListening ? '🎤 Listening...' : 'Ready to help') : 'Connecting...'}
              {isWebSocketConnected && (
                <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.8 }}>
                  • Live chat enabled
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={clearChatHistory}
              disabled={!isConnected}
              style={{ 
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                padding: '6px 12px',
                fontSize: '11px',
                cursor: isConnected ? 'pointer' : 'not-allowed',
                opacity: isConnected ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Clear chat history"
            >
              🗑️ Clear
            </button>
            
            <button 
              onClick={isListening ? stopListening : startListening}
              disabled={!isConnected || isHandedOffToHuman}
              style={{ 
                backgroundColor: isHandedOffToHuman ? '#6c757d' : (isListening ? '#dc3545' : '#28a745'),
                color: 'white',
                border: 'none',
                borderRadius: '20px',
                padding: '8px 16px',
                fontSize: '12px',
                cursor: (isConnected && !isHandedOffToHuman) ? 'pointer' : 'not-allowed',
                opacity: (isConnected && !isHandedOffToHuman) ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title={isHandedOffToHuman ? 'Voice chat disabled - connected to human agent' : ''}
            >
              {isHandedOffToHuman ? '🚫 Voice' : (isListening ? '🛑 Stop' : '🎤 Talk')}
            </button>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div style={{
        flex: 1,
        padding: '20px',
        overflowY: 'auto',
        backgroundColor: '#ffffff',
        minHeight: 0 // Allow flex item to shrink
      }}>
        {chatMessages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              justifyContent: message.type === 'system' ? 'center' :
                             message.type === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: '16px',
              position: 'relative'
            }}
          >
            <div style={{
              maxWidth: message.type === 'system' ? '90%' : '70%',
              padding: '12px 16px',
              borderRadius: message.type === 'system' ? '8px' : 
                           message.type === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              backgroundColor: message.type === 'system' ? '#fff3cd' :
                             message.type === 'user' ? '#007bff' : 
                             message.metadata?.isAdminMessage ? '#e8f4fd' : '#f1f3f5',
              color: message.type === 'system' ? '#856404' :
                     message.type === 'user' ? 'white' : '#333',
              border: message.type === 'system' ? '1px solid #ffeaa7' :
                      message.metadata?.isAdminMessage ? '1px solid #007bff' : 'none',
              fontSize: '14px',
              lineHeight: '1.4',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              position: 'relative',
              textAlign: message.type === 'system' ? 'center' : 'left',
              fontWeight: message.type === 'system' ? '500' : 'normal'
            }}>
              {/* Message content */}
              <div>
                {message.content}
                
                {/* Metadata indicators */}
                {message.metadata?.hasAudio && (
                  <div style={{
                    display: 'inline-block',
                    marginLeft: '8px',
                    fontSize: '12px',
                    opacity: 0.8
                  }}>
                    🎵
                  </div>
                )}
                {message.metadata?.isTranscript && (
                  <div style={{
                    fontSize: '11px',
                    opacity: 0.6,
                    fontStyle: 'italic',
                    marginTop: '2px'
                  }}>
                    (transcript)
                  </div>
                )}
                {message.metadata?.wasInterrupted && (
                  <div style={{
                    fontSize: '11px',
                    opacity: 0.6,
                    fontStyle: 'italic',
                    marginTop: '2px'
                  }}>
                    (interrupted)
                  </div>
                )}
              </div>
              
              {/* Tool calls and results */}
              {message.metadata?.toolCalls && (
                <div style={{
                  marginTop: '8px',
                  padding: '6px 8px',
                  backgroundColor: 'rgba(0,0,0,0.1)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'monospace'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Tool calls:</div>
                  {message.metadata.toolCalls.map((call: any, idx: number) => (
                    <div key={idx}>{call.name}({JSON.stringify(call.parameters)})</div>
                  ))}
                </div>
              )}
              
              {message.metadata?.toolResults && (
                <div style={{
                  marginTop: '4px',
                  padding: '6px 8px',
                  backgroundColor: 'rgba(0,128,0,0.1)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'monospace'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Results:</div>
                  {message.metadata.toolResults.map((result: any, idx: number) => (
                    <div key={idx}>{JSON.stringify(result, null, 2)}</div>
                  ))}
                </div>
              )}
              
              {/* Timestamp and controls */}
              <div style={{
                fontSize: '11px',
                opacity: 0.7,
                marginTop: '4px',
                textAlign: message.type === 'user' ? 'right' : 'left',
                display: 'flex',
                justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {message.id !== 'initial' && (
                  <button
                    onClick={() => removeMessageFromHistory(message.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: message.type === 'user' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)',
                      cursor: 'pointer',
                      fontSize: '10px',
                      padding: '2px',
                      borderRadius: '2px'
                    }}
                    title="Remove message"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        backgroundColor: 'white',
        borderTop: '1px solid #e0e0e0',
        padding: '12px 20px',
        flexShrink: 0 // Prevent input area from shrinking
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isHandedOffToHuman ? "Message human agent..." : "Type your message..."}
            onKeyDown={(e) => e.key === 'Enter' && sendText()}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid #e0e0e0',
              borderRadius: '24px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: '#f8f9fa'
            }}
            onFocus={(e) => e.target.style.borderColor = '#007bff'}
            onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
          />
          <button 
            onClick={sendText} 
            disabled={!input.trim()}
            style={{
              backgroundColor: input.trim() ? '#007bff' : '#e0e0e0',
              color: input.trim() ? 'white' : '#999',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px'
            }}
          >
            ➤
          </button>
        </div>

        {/* Status and Info */}
        <div style={{ 
          marginTop: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: '#666'
        }}>
          <div>
            {state?.collected?.problem_type && `Issue: ${state.collected.problem_type}`}
            {state?.collected?.location_description && ` • Location: ${state.collected.location_description}`}
          </div>
          {state?.ready_for_dispatch && (
            <button 
              onClick={submitClaim}
              style={{
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Process Request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
