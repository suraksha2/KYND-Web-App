import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { App } from '@capacitor/app'

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return

  // Mark <html> so CSS can target native
  document.documentElement.classList.add('native', `platform-${Capacitor.getPlatform()}`)

  try {
    // Light status bar with dark icons over the warm linen app background
    await StatusBar.setStyle({ style: Style.Light })
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#F5F1EA' })
      // We handle the inset via CSS env(safe-area-inset-top)
      await StatusBar.setOverlaysWebView({ overlay: true })
    }
  } catch (e) { /* no-op */ }

  // Hide splash once React has hydrated
  try { await SplashScreen.hide() } catch (e) { /* no-op */ }

  // Android hardware back button: navigate back, exit on root
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else App.exitApp()
  })
}
