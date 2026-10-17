import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/app'
import { AppProvider } from './app/app-context'
import { AuthProvider } from './features/auth/auth-context'
import { ErrorBoundary } from './components/ui/error-boundary'
import { PreferencesProvider } from './features/settings/preferences-context'
import { ExperienceProvider } from './features/experience/experience-context'
import { installMetadataInspector } from './platform/metadata/metadata-inspector'
import { installUniversalViewInspector } from './platform/views/view-inspector'
import { installRecordPageInspector } from './platform/record-page/record-page-inspector'
import { installCanonicalCommercialInspector } from './platform/canonical/canonical-inspector'
import { installWorkflowRuntimeInspector } from './platform/workflows/workflow-runtime'
import { installPermissionInspector } from './platform/permissions'
import { installExtensionRegistryInspector } from './platform/extensions'
import { installDesignSystemInspector } from './platform/design-system'
import { installUiCohesionRuntime } from './platform/design-system/ui-cohesion-runtime'
import { installCommercialObservability } from './lib/commercial-observability'
import './styles/core-v100.css'
import './styles/dashboard-v100.css'
import './styles/leads-v100.css'
import './styles/pipeline.css'
import './styles/followups.css'
import './styles/calls-core.css'
import './styles/agenda-v100.css'
import './styles/goals-v100.css'
import './styles/metrics-v100.css'
import './styles/automations.css'
import './styles/prospecting-core.css'
import './styles/settings-v100.css'
import './styles/calendar-integration-v10084.css'
import './styles/whatsapp-v10085.css'
import './styles/communications-v10086.css'
import './styles/legacy-overrides-v100.css'
import './styles/motion-system.css'
import './styles/actions-system.css'
import './styles/experience-system.css'
import './styles/help-center-v10091.css'
import './styles/full-page-audit-v10093.css'
import './styles/omnichannel-v10094.css'
import './styles/workspace-personalization-v10095.css'
import './styles/guided-selling-help-v10096.css'
import './styles/product-revenue-v10097.css'
import './styles/prospecting-engine.css'
import './styles/workspace-layout-studio-v100981.css'
import './styles/calling-workspace.css'
import './styles/unified-sales-workspace-v1013.css'
import './styles/lead-workspace-v1015.css'
import './styles/ui-runtime-accessibility-v10152.css'
import './styles/performance-repository-v10153.css'
import './styles/visual-intelligence-v10099.css'
import './styles/territory-ui-system-v101.css'
import './styles/ui-foundation.css'
import './styles/contact-record.css'
import './styles/app-shell.css'
import './styles/contacts.css'
import './styles/workspace-ui.css'
import './styles/calling-intelligence.css'
import './styles/interaction-ui.css'
import './styles/realtalent-connect.css'
import './styles/ui-polish.css'
import './styles/settings-experience-v10110.css'
import './styles/prospecting-workspace.css'
import './styles/selection-controls.css'
import './styles/contact-intelligence.css'
import './styles/prospecting-processing.css'
import './styles/proposals-workspace.css'
import './styles/login-experience.css'
import './styles/work-management.css'
import './styles/h20-product-cohesion.css'
import './styles/prospecting-territory-interaction-hotfix.css'

installMetadataInspector()
installUniversalViewInspector()
installRecordPageInspector()
installCanonicalCommercialInspector()
installWorkflowRuntimeInspector()
installPermissionInspector()
installExtensionRegistryInspector()
installDesignSystemInspector()
installUiCohesionRuntime()
installCommercialObservability()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <AuthProvider>
      <AppProvider>
        <PreferencesProvider>
          <ExperienceProvider>
            <App />
          </ExperienceProvider>
        </PreferencesProvider>
      </AppProvider>
    </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)

;(window as Window & { __REALTALENT_BOOT_OK__?: () => void }).__REALTALENT_BOOT_OK__?.()

