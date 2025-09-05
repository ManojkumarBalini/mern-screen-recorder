import React, { useState } from 'react';
import RecordScreen from './components/RecordScreen';
import RecordingsList from './components/RecordingsList';
import './App.css';

// Determine API URL based on environment
const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://mern-screen-recorder-backend-6cgg.onrender.com' 
  : 'http://localhost:5000';

function App() {
  const [activeTab, setActiveTab] = useState('record');

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            MERN Screen Recorder
          </h1>
          <p className="text-xl text-gray-300">Record, preview, and manage your screen recordings</p>
        </header>

        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
          <div className="glass-effect rounded-xl p-1 flex">
            <button 
              className={`px-6 py-3 rounded-xl transition-all ${activeTab === 'record' ? 'bg-indigo-600' : 'hover:bg-indigo-800'}`}
              onClick={() => setActiveTab('record')}
            >
              <i className={`fas ${activeTab === 'record' ? 'fa-record-vinyl' : 'fa-video'} mr-2`}></i>
              Record Screen
            </button>
            <button 
              className={`px-6 py-3 rounded-xl transition-all ${activeTab === 'recordings' ? 'bg-indigo-600' : 'hover:bg-indigo-800'}`}
              onClick={() => setActiveTab('recordings')}
            >
              <i className="fas fa-history mr-2"></i>
              My Recordings
            </button>
          </div>
        </div>

        {/* Main Content */}
        <main>
          {activeTab === 'record' ? <RecordScreen apiUrl={API_URL} /> : <RecordingsList apiUrl={API_URL} />}
        </main>

        {/* Footer */}
        <footer className="text-center mt-16 pt-8 border-t border-gray-800">
          <p className="text-gray-400">MERN Screen Recorder Application - Built with React, Express, and SQLite</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
