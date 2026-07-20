import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/app'
import { AppProvider } from './app/app-context'
import { AuthProvider } from './features/auth/auth-context'
import { ErrorBoundary } from './components/ui/error-boundary'
import { PreferencesProvider } from './features/settings/preferences-context'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <AuthProvider>
      <AppProvider>
        <PreferencesProvider>
          <App />
        </PreferencesProvider>
      </AppProvider>
    </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
