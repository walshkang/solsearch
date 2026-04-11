/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';
import MapComponent from './MapComponent';

export default function App() {
  const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-100">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <MapPin className="w-8 h-8 text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">API Key Required</h2>
          <p className="text-gray-600 mb-6 leading-relaxed">
            To view the 3D sunlight map and search for places, please add your Google Maps API key to the environment variables.
          </p>
          <div className="bg-gray-50 p-4 rounded-lg text-sm text-left font-mono text-gray-800 break-all border border-gray-200 shadow-inner">
            VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
          </div>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <MapComponent />
    </APIProvider>
  );
}

