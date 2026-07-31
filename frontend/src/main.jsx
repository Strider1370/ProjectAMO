import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import App from './app/App.jsx'
import { appLightTheme } from './shared/theme/fluentTheme.js'
import 'pretendard-gov/dist/web/static/pretendard-gov-dynamic-subset.css'
import './shared/theme/tokens.css'
import './app/App.css'
import { loadStoredFont, shouldLoadStoredFont } from './shared/theme/fontPrefs.js'

// /terminal is a fixed public-display route: ignore stored comparison-font
// preferences so no remote stylesheet request can leak into signage playback.
if (shouldLoadStoredFont(window.location.pathname)) loadStoredFont()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* display:contents → 레이아웃에 박스 영향 없이 테마/컨텍스트만 전역 제공 */}
    <FluentProvider theme={appLightTheme} style={{ display: 'contents' }}>
      <App />
    </FluentProvider>
  </StrictMode>,
)
