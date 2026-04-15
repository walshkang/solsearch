import React from 'react'
import GoogleMapProvider from './components/Map/GoogleMapProvider'
import Sidebar from './components/UI/Sidebar'

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? ''


type ErrorBoundaryState = { hasError: boolean; error?: Error | null }

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: any) {
    // Log the error — keep UI dark-themed on error
    // eslint-disable-next-line no-console
    console.error('Uncaught error in App:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen flex items-center justify-center bg-zinc-900 text-white p-4">
          <div className="max-w-2xl w-full">
            <h1 className="text-2xl font-semibold mb-2">An error occurred</h1>
            <div className="bg-zinc-800 p-3 rounded text-sm whitespace-pre-wrap">{String(this.state.error?.message ?? this.state.error)}</div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default function App() {
  if (!GOOGLE_MAPS_KEY || !GEMINI_KEY) {
    return (
      <div className="w-screen h-screen relative overflow-hidden bg-zinc-950 text-white flex items-center justify-center">
        Missing API keys. Set VITE_GOOGLE_MAPS_API_KEY and VITE_GEMINI_API_KEY in .env
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="w-screen h-screen relative overflow-hidden bg-zinc-950">
        {/* Map provider fills the screen */}
        <div className="absolute inset-0 pointer-events-auto">
          <GoogleMapProvider apiKey={GOOGLE_MAPS_KEY} />
        </div>

        {/* Sidebar overlays map. Container uses pointer-events-none so the map receives events where sidebar doesn't cover. Sidebar itself handles pointer events. */}
        <div className="absolute left-0 top-0 h-full pointer-events-none">
          <div className="pointer-events-auto">
            <Sidebar googleApiKey={GOOGLE_MAPS_KEY} geminiApiKey={GEMINI_KEY} />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
