import React from 'react'
import ReactDOM from 'react-dom/client'
import AppLayout from './components/AppLayout'
import ClientView from './views/ClientView'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppLayout>
      <ClientView />
    </AppLayout>
  </React.StrictMode>,
)
