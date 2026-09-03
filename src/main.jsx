import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { setupIonicReact } from '@ionic/react'
import App from './App.jsx'
// import { CartProvider } from './context/CartContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { BookingsProvider } from './context/BookingsContext.jsx'
import { ServicesProvider } from './context/ServicesContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'

/* Ionic core CSS — required.
   NOTE: structure.css is intentionally NOT imported because it sets
   html/body { height:100%; overflow:hidden; position:fixed } which is
   only appropriate for full Ionic shells (IonApp + IonContent). We use
   Ionic as a UI layer inside a normal scrollable page. */
import '@ionic/react/css/core.css'
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/typography.css'

/* Ionic optional utility CSS */
import '@ionic/react/css/padding.css'
import '@ionic/react/css/float-elements.css'
import '@ionic/react/css/text-alignment.css'
import '@ionic/react/css/text-transformation.css'
import '@ionic/react/css/flex-utils.css'
import '@ionic/react/css/display.css'

import './index.css'
import { initNative } from './native.js'

setupIonicReact({ mode: 'md' })
initNative() // 'md' = Material Design (Android look) | 'ios' for iOS

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <LanguageProvider>
        <AuthProvider>
          {/* <CartProvider> */}
            <BookingsProvider>
              <ServicesProvider>
                <App />
              </ServicesProvider>
            </BookingsProvider>
          {/* </CartProvider> */}
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
)
