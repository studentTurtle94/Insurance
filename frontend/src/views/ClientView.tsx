import { useEffect, useRef, useState } from "react";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { tool } from "@openai/agents/realtime";
import { z } from "zod";

export default function ClientView() {
  const [state, setState] = useState<any>({ step: 0 });
  const [assistantReply, setAssistantReply] = useState<string>("Hello! I'm here to help with your roadside assistance request. Can you briefly describe what's happening with your vehicle?");
  const [statusMessage, setStatusMessage] = useState<string>("No updates yet.");
  const [input, setInput] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const agentRef = useRef<RealtimeAgent | null>(null);
  const clientSecretRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    // Initialize OpenAI Realtime Agent using the official SDK
    const initRealtimeAgent = async () => {
      try {
        // Clean up any existing connections first
        if (sessionRef.current) {
          console.log('Cleaning up existing session before creating new one');
          await sessionRef.current.disconnect();
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

        // Check if component is still mounted
        if (!isMounted) return;

        // Define tools for collecting insurance information
        const collectInfoTool = tool({
          name: 'collect_customer_info',
          description: 'Collect and store customer information for roadside assistance. IMPORTANT: Always check coverage for the issue before proceeding with dispatch.',
          parameters: z.object({
            name: z.string().nullable(),
            location: z.string().nullable(),
            issue: z.string().nullable(),
            ready: z.boolean().nullable()
          }),
          async execute({ name, location, issue, ready }) {
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
                  ...(name && { customer_name: name }),
                  ...(location && { location_description: location }),
                  ...(issue && { problem_description: issue, problem_type: issue }),
                },
                ...(ready && { ready_for_dispatch: true })
              };
              
              // Store in localStorage
              localStorage.setItem("copilot_state", JSON.stringify(newState));
              
              return newState;
            });
            
            return `Information collected successfully. ${name ? `Name: ${name}. ` : ''}${location ? `Location: ${location}. ` : ''}${issue ? `Issue: ${issue}. ` : ''}`;
          },
        });

        // Create the Realtime Agent
        const agent = new RealtimeAgent({
          name: 'Insurance Assistant',
          instructions: `You are a helpful insurance assistant for roadside assistance. 

Your job is to collect the following information from the customer:
1. Description of their vehicle problem (FIRST - to check coverage)
2. Customer name (only if problem is covered)
3. Location (only if problem is covered)

IMPORTANT PROCESS:
- ALWAYS ask for the problem description first
- When you get the problem description, immediately use the collect_customer_info tool with just the "issue" parameter
- The tool will check coverage and tell you if the service is covered
- If NOT covered, the tool will return a denial message - relay this message exactly to the customer and end the conversation
- If covered, continue collecting name and location

Be conversational, empathetic, and professional. Ask one question at a time and listen carefully to their responses. 

When you have collected a piece of information, immediately use the collect_customer_info tool to store it.

Once you have all three pieces of information (name, location, and covered issue), use the collect_customer_info tool with ready=true to indicate the conversation is complete.

Keep your responses concise and focused on gathering the required information for dispatch.`,
          tools: [collectInfoTool],
        });

        if (!isMounted) return;
        agentRef.current = agent;

        // Create the Realtime Session with manual audio control
        const session = new RealtimeSession(agent, {
          model: 'gpt-realtime',
          config: {
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

        // Don't auto-connect - wait for user to click start
        if (isMounted) {
          setIsConnected(true); // Session is ready but not connected
          setIsListening(false); // Start with listening off
          console.log('Realtime Agent initialized successfully - ready for manual control');
        }

      } catch (error) {
        console.error("Failed to initialize Realtime Agent:", error);
        if (isMounted) {
          setIsConnected(false);
        }
      }
    };

    void initRealtimeAgent();
    
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
        sessionRef.current.disconnect().catch(console.error);
        sessionRef.current = null;
        agentRef.current = null;
        setIsConnected(false);
      }
    };
  }, []);

  const startListening = async () => {
    if (!isConnected || !sessionRef.current || !clientSecretRef.current) {
      alert("Not ready to connect. Please refresh the page.");
      return;
    }

    try {
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
      await sessionRef.current.interrupt();
      setIsListening(false);
      console.log('Interrupted session - stopped listening');
    } catch (error) {
      console.error('Failed to stop listening:', error);
    }
  };

  const sendToConversation = async (message: string) => {
    console.log("[DEBUG] sendToConversation called with:", { message, currentState: state });
    
    try {
      const res = await fetch("http://localhost:8000/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, state }),
      });
      
      console.log("[DEBUG] API response status:", res.status);
      
      const data = await res.json();
      console.log("[DEBUG] API response data:", data);
      
      setState(data.state || {});
      setAssistantReply(data.reply || "");
      localStorage.setItem("copilot_state", JSON.stringify(data.state || {}));
      localStorage.setItem(
        "copilot_transcript",
        (localStorage.getItem("copilot_transcript") || "") + `\nAgent: ${data.reply || ""}`
      );
      // Audio output is now handled by the Realtime API
    } catch (error) {
      console.error("[DEBUG] Error in sendToConversation:", error);
    }
  };


  const sendText = async () => {
    const text = input.trim();
    console.log("[DEBUG] sendText called with:", text);
    if (!text) return;
    
    if (!isConnected || !sessionRef.current) {
      alert("Not connected to OpenAI Realtime API. Please refresh the page.");
      return;
    }

    localStorage.setItem(
      "copilot_transcript",
      (localStorage.getItem("copilot_transcript") || "") + `\nClient: ${text}`
    );

    // Send text message through Agents SDK only - no fallback to avoid double audio
    try {
      await sessionRef.current.sendMessage(text);
      setInput("");
    } catch (error) {
      console.error('Error sending text message:', error);
      setInput("");
      // Don't fall back to avoid double audio
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
    <div className="app-shell">
      <div className="card stack">
        <div className="stack">
          <h1 className="title">Insurance Co-Pilot</h1>
          <p className="subtitle">Client Interface</p>
        </div>


        <section>
          <h2>Voice Assistant</h2>
          <div className="row">
            <button 
              onClick={isListening ? stopListening : startListening}
              disabled={!isConnected}
              style={{ 
                backgroundColor: isListening ? '#ff4444' : isConnected ? '#4CAF50' : '#cccccc',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '4px',
                border: 'none',
                cursor: isConnected ? 'pointer' : 'not-allowed'
              }}
            >
              {isListening ? '🛑 Stop Listening' : '🎤 Start Speaking'}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type here if voice not working..."
              onKeyDown={(e) => e.key === 'Enter' && sendText()}
            />
            <button onClick={sendText} disabled={!input.trim()}>Send</button>
          </div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: isConnected ? 'green' : 'red' }}>
            Status: {isConnected ? 'Connected via OpenAI Agents SDK' : 'Disconnected'}
            {isListening && ' • 🎤 Listening...'}
          </div>
        </section>

        <section>
          <h2>Assistant</h2>
          <div>{assistantReply || '(waiting...)'}</div>
        </section>

        <section>
          <h2>Collected Information</h2>
          <div>
            {state?.collected?.customer_name ? `Name: ${state.collected.customer_name}` : '(no name)'}<br/>
            {state?.collected?.problem_type ? `Issue: ${state.collected.problem_type}` : ''}<br/>
            {state?.collected?.location_description ? `Location: ${state.collected.location_description}` : ''}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={submitClaim} disabled={!state?.ready_for_dispatch}>
              {state?.ready_for_dispatch ? 'Process Request' : 'Complete Conversation First'}
            </button>
          </div>
        </section>

        <section>
          <h2>Status Updates</h2>
          <div id="status">{statusMessage}</div>
        </section>
      </div>
    </div>
  );
}
