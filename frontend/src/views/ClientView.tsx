import { useEffect, useRef, useState } from "react";

export default function ClientView() {
  const [state, setState] = useState<any>({ step: 0 });
  const [assistantReply, setAssistantReply] = useState<string>("Hello! I'm here to help with your roadside assistance request. Can you briefly describe what's happening with your vehicle?");
  const [statusMessage, setStatusMessage] = useState<string>("No updates yet.");
  const [input, setInput] = useState<string>("");
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    synthesisRef.current = window.speechSynthesis || null;
    
    // Initialize conversation by calling the API with step 0
    const initConversation = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "", state: { step: 0 } }),
        });
        const data = await res.json();
        setState(data.state || { step: 1 });
        setAssistantReply(data.reply || "Hello! I'm here to help with your roadside assistance request. Can you briefly describe what's happening with your vehicle?");
        localStorage.setItem("copilot_state", JSON.stringify(data.state || {}));
        localStorage.setItem("copilot_transcript", `Agent: ${data.reply || ""}`);
        speak(data.reply || "");
      } catch (error) {
        console.error("Failed to initialize conversation:", error);
        // Keep the default greeting if API fails
      }
    };
    
    void initConversation();
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:8000/api/get_status");
        const data = await res.json();
        if (data?.message) setStatusMessage(data.message);
      } catch (error) {
        console.error("Failed to fetch status:", error);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const speak = (text: string) => {
    try {
      if (!text) return;
      const utter = new SpeechSynthesisUtterance(text);
      synthesisRef.current?.speak(utter);
    } catch {}
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
      speak(data.reply || "");
    } catch (error) {
      console.error("[DEBUG] Error in sendToConversation:", error);
    }
  };

  const startListening = () => {
    const Rec: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!Rec) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    const recognition = new Rec();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      console.log("[DEBUG] Speech recognition result:", transcript);
      localStorage.setItem("copilot_transcript", (localStorage.getItem("copilot_transcript") || "") + `\nClient: ${transcript}`);
      void sendToConversation(transcript);
    };
    recognition.onerror = () => {};
    recognition.onend = () => {};
    recognition.start();
    recognitionRef.current = recognition;
  };

  const sendText = async () => {
    const text = input.trim();
    console.log("[DEBUG] sendText called with:", text);
    if (!text) return;
    localStorage.setItem(
      "copilot_transcript",
      (localStorage.getItem("copilot_transcript") || "") + `\nClient: ${text}`
    );
    await sendToConversation(text);
    setInput("");
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
            <button onClick={startListening}>Speak</button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type here if mic not available..."
            />
            <button onClick={sendText}>Send</button>
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
