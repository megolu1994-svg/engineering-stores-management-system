import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeSettingsProvider } from './contexts/ThemeSettingsContext'
import { AppThemeProvider } from './contexts/AppThemeProvider'
import { BrandingProvider } from './contexts/BrandingContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeSettingsProvider>
        <AppThemeProvider>
          <BrowserRouter>
            <BrandingProvider>
              <App />
            </BrandingProvider>
          </BrowserRouter>
        </AppThemeProvider>
      </ThemeSettingsProvider>
    </AuthProvider>
  </React.StrictMode>,
)
