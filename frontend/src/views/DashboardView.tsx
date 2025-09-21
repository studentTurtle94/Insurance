import { useEffect, useState } from "react";

export default function DashboardView() {
  const [transcript, setTranscript] = useState<string>("");
  const [state, setState] = useState<any>({});
  const [analysis, setAnalysis] = useState<any>({});

  useEffect(() => {
    const interval = setInterval(() => {
      setTranscript(localStorage.getItem("copilot_transcript") || "");
      try { setState(JSON.parse(localStorage.getItem("copilot_state") || "{}")); } catch { setState({}); }
      try { setAnalysis(JSON.parse(localStorage.getItem("copilot_analysis") || "{}")); } catch { setAnalysis({}); }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-shell">
      <div className="card">
        <div className="stack">
          <h1 className="title">Agent Dashboard</h1>
        </div>

        <section>
          <h2>Live Transcript</h2>
          <pre id="transcript" style={{ whiteSpace: 'pre-wrap' }}>{transcript || '(empty)'}</pre>
        </section>
        <section>
          <h2>Extracted Info</h2>
          <pre id="extracted">{JSON.stringify(state, null, 2)}</pre>
        </section>
        <section>
          <h2>AI Analysis & Next Steps</h2>
          <pre id="analysis">{JSON.stringify(analysis, null, 2)}</pre>
        </section>
      </div>
    </div>
  );
}
