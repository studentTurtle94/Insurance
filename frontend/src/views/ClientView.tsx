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

  useEffect(() => {
    // Initialize OpenAI Realtime Agent using the official SDK
    const initRealtimeAgent = async () => {
      try {
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

        // Define tools for collecting insurance information
        const collectInfoTool = tool({
          name: 'collect_customer_info',
          description: 'Collect and store customer information for roadside assistance',
          parameters: z.object({
            name: z.string().nullable(),
            location: z.string().nullable(),
            issue: z.string().nullable(),
            ready: z.boolean().nullable()
          }),
          async execute({ name, location, issue, ready }) {
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
1. Customer name
2. Location (where they are stranded)
3. Description of their vehicle problem

Be conversational, empathetic, and professional. Ask one question at a time and listen carefully to their responses. 

When you have collected a piece of information, immediately use the collect_customer_info tool to store it.

Once you have all three pieces of information (name, location, and issue), use the collect_customer_info tool with ready=true to indicate the conversation is complete.

Keep your responses concise and focused on gathering the required information for dispatch.`,
          tools: [collectInfoTool],
        });

        agentRef.current = agent;

        // Create the Realtime Session
        const session = new RealtimeSession(agent, {
          model: 'gpt-realtime',
        });

        sessionRef.current = session;

        // The Agents SDK handles events automatically
        // Set up basic connection tracking

        // Connect to the session using the ephemeral key
        await session.connect({ apiKey: client_secret });
        
        setIsConnected(true);
        console.log('Realtime Agent initialized successfully');

      } catch (error) {
        console.error("Failed to initialize Realtime Agent:", error);
        setIsConnected(false);
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
      clearInterval(interval);
      // Cleanup will be handled by the Agents SDK
      if (sessionRef.current) {
        console.log('Cleaning up Realtime session');
      }
    };
  }, []);

  // Simplified voice interaction using Agents SDK
  const startListening = () => {
    if (!isConnected || !sessionRef.current) {
      alert("Not connected to OpenAI Realtime API. Please refresh the page.");
      return;
    }

    setIsListening(true);
    // The Agents SDK handles all audio processing automatically
    console.log('Voice interaction active - speak now!');
  };

  const stopListening = () => {
    setIsListening(false);
    console.log('Voice interaction stopped');
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

    // Send text message through Agents SDK
    try {
      await sessionRef.current.sendMessage(text);
      setInput("");
    } catch (error) {
      console.error('Error sending text message:', error);
      // Fallback to original API
      await sendToConversation(text);
      setInput("");
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
                color: 'white'
              }}
            >
              {isListening ? 'Stop Listening' : 'Start Speaking'}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type here if mic not available..."
            />
            <button onClick={sendText}>Send</button>
          </div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: isConnected ? 'green' : 'red' }}>
            Status: {isConnected ? 'Connected via OpenAI Agents SDK' : 'Disconnected'}
            {isListening && ' • Listening...'}
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
