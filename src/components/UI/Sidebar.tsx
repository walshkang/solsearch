import React from 'react'
import TimeController from './TimeController'
import SearchBar from './SearchBar'
import useAppStore from '../../store/useAppStore'

interface SidebarProps {
  googleApiKey: string
  geminiApiKey: string
}

const badgeClassFor = (score?: number) => {
  if (score == null) return 'bg-gray-600 text-white'
  if (score > 70) return 'bg-green-500 text-black'
  if (score >= 40) return 'bg-yellow-400 text-black'
  return 'bg-red-500 text-white'
}

const Sidebar: React.FC<SidebarProps> = ({ googleApiKey, geminiApiKey }) => {
  const discoveredPlaces = useAppStore((s) => s.discoveredPlaces)
  const isDiscovering = useAppStore((s) => s.isDiscovering)
  const layerToggles = useAppStore((s) => s.layerToggles)
  const toggleLayer = useAppStore((s) => s.toggleLayer)

  return (
    <aside className="fixed left-0 top-0 h-full w-80 bg-gray-900 text-white p-4 z-50 overflow-y-auto">
      <div className="space-y-3">
        <TimeController />

        <SearchBar googleApiKey={googleApiKey} geminiApiKey={geminiApiKey} />

        <div className="mt-3">
          <div className="flex items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={layerToggles.showBuildings} onChange={() => toggleLayer('showBuildings')} className="form-checkbox" />
              <span>Buildings</span>
            </label>

            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={layerToggles.showShadows} onChange={() => toggleLayer('showShadows')} className="form-checkbox" />
              <span>Shadows</span>
            </label>
          </div>
        </div>

        <div className="mt-3">
          {discoveredPlaces.length === 0 && !isDiscovering ? (
            <div className="text-sm text-gray-400">Click Discover to find sun-friendly venues nearby</div>
          ) : (
            <div className="space-y-2">
              {discoveredPlaces.map((p) => (
                <div key={p.id} className="bg-gray-800 rounded p-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-gray-400">{p.address}</div>
                    </div>

                    <div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${badgeClassFor(p.sunScore)}`}>{p.sunScore ?? '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export default Sidebar

