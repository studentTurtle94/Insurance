import { useState, ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'policy' | 'help'>('help');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const selectTab = (tab: 'profile' | 'policy' | 'help') => {
    setActiveTab(tab);
    setSidebarOpen(false); // Close menu after selection
  };

  const ProfileTab = () => (
    <div className="tab-content">
      <h3>Profile</h3>
      <div className="profile-info">
        <div className="profile-field">
          <label>Name</label>
          <div>John Doe</div>
        </div>
        <div className="profile-field">
          <label>Email</label>
          <div>john.doe@gmail.com</div>
        </div>
        <div className="profile-field">
          <label>Phone</label>
          <div>+447111812959</div>
        </div>
      </div>
    </div>
  );

  const PolicyTab = () => (
    <div className="tab-content">
      <h3>Policy Document</h3>
      <div className="pdf-container">
        <div style={{ marginBottom: '16px' }}>
          <a 
            href="/Vehicle_Insurance_Certificate.pdf" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '12px 16px',
              backgroundColor: 'var(--primary)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              marginBottom: '16px'
            }}
          >
            📄 Open PDF Document
          </a>
        </div>
        <iframe
          src="/Vehicle_Insurance_Certificate.pdf#toolbar=0&navpanes=0&scrollbar=0"
          width="100%"
          height="600px"
          style={{ 
            border: '1px solid #e2e8f0', 
            borderRadius: '8px',
            display: 'block'
          }}
          title="Insurance Certificate"
          onError={() => {
            // Fallback for mobile - this won't work in React but shows the intent
            console.log('PDF iframe failed to load');
          }}
        />
        <div style={{ 
          marginTop: '16px', 
          padding: '12px', 
          backgroundColor: '#f8fafc', 
          borderRadius: '8px',
          fontSize: '14px',
          color: 'var(--muted)'
        }}>
          <p>💡 <strong>Mobile tip:</strong> If the PDF doesn't display above, tap "Open PDF Document" to view it in your browser or download it.</p>
        </div>
      </div>
    </div>
  );

  const HelpTab = () => (
    <div className="tab-content">
      <h3>Get Help</h3>
      {children}
    </div>
  );

  return (
    <div className="app-layout">
      {/* Mobile menu button */}
      <button 
        className="menu-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Insurance Co-Pilot</h2>
          <button 
            className="close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === 'help' ? 'active' : ''}`}
            onClick={() => selectTab('help')}
          >
            🆘 Get Help
          </button>
          <button 
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => selectTab('profile')}
          >
            👤 Profile
          </button>
          <button 
            className={`nav-item ${activeTab === 'policy' ? 'active' : ''}`}
            onClick={() => selectTab('policy')}
          >
            📄 Policy
          </button>
        </nav>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main content */}
      <div className="main-content">
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'policy' && <PolicyTab />}
        {activeTab === 'help' && <HelpTab />}
      </div>
    </div>
  );
}
