import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import WindowBuilderApp from '../window_builder_pro'
import AuthGate from './AuthGate'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      <WindowBuilderApp />
    </AuthGate>
  </React.StrictMode>,
)
