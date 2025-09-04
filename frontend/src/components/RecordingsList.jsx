import React, { useState, useEffect } from 'react';

const RecordingsList = ({ apiUrl }) => {
  const [recordings, setRecordings] = useState([]);
  const [activeTab, setActiveTab] = useState('my-recordings');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRecordings();
  }, []);

  const fetchRecordings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/recordings`);
      
      if (response.ok) {
        const data = await response.json();
        setRecordings(data);
        setError('');
      } else {
        setError('Failed to fetch recordings');
      }
    } catch (error) {
      console.error('Error fetching recordings:', error);
      setError('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  const deleteRecording = async (id) => {
    try {
      const response = await fetch(`${apiUrl}/api/recordings/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Remove from local state
        setRecordings(recordings.filter(rec => rec.id !== id));
      } else {
        alert('Failed to delete recording');
      }
    } catch (error) {
      console.error('Error deleting recording:', error);
      alert('Error deleting recording');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-effect p-6 rounded-2xl">
      <div className="flex border-b border-gray-700 mb-6 overflow-x-auto">
        <button 
          className={`px-6 py-3 font-medium transition-colors ${activeTab === 'my-recordings' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400 hover:text-gray-300'}`}
          onClick={() => setActiveTab('my-recordings')}
        >
          <i className="fas fa-film mr-2"></i>
          My Recordings
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors ${activeTab === 'uploaded' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400 hover:text-gray-300'}`}
          onClick={() => setActiveTab('uploaded')}
        >
          <i className="fas fa-cloud mr-2"></i>
          Uploaded
        </button>
      </div>
      
      <h2 className="text-2xl font-semibold mb-6 flex items-center">
        <i className="fas fa-history mr-3 text-blue-500"></i>
        Previous Recordings
      </h2>
      
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-400">
          <i className="fas fa-exclamation-triangle text-3xl mb-3"></i>
          <p>{error}</p>
          <button 
            onClick={fetchRecordings}
            className="mt-4 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      ) : recordings.length > 0 ? (
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-800 text-left">
                <th className="py-4 px-4 font-medium">Name</th>
                <th className="py-4 px-4 font-medium">Date</th>
                <th className="py-4 px-4 font-medium">Size</th>
                <th className="py-4 px-4 font-medium">Duration</th>
                <th className="py-4 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((recording, index) => (
                <tr key={recording.id} className={`${index % 2 === 0 ? 'bg-gray-900 bg-opacity-50' : 'bg-gray-900'}`}>
                  <td className="py-4 px-4">
                    <div className="flex items-center">
                      <i className="fas fa-video text-gray-400 mr-3"></i>
                      <span className="truncate max-w-xs">{recording.filename}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4">{formatDate(recording.createdAt)}</td>
                  <td className="py-4 px-4">{formatFileSize(recording.filesize)}</td>
                  <td className="py-4 px-4">{formatDuration(recording.duration)}</td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <a
                        href={`${apiUrl}/api/recordings/${recording.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <i className="fas fa-play"></i>
                      </a>
                      <a
                        href={`${apiUrl}/api/recordings/${recording.id}/download`}
                        className="p-2 text-green-400 hover:text-green-300 transition-colors"
                      >
                        <i className="fas fa-download"></i>
                      </a>
                      <button 
                        onClick={() => deleteRecording(recording.id)}
                        className="p-2 text-red-400 hover:text-red-300 transition-colors"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12">
          <i className="fas fa-inbox text-5xl text-gray-600 mb-4"></i>
          <h3 className="text-xl font-medium text-gray-400 mb-2">No recordings yet</h3>
          <p className="text-gray-500">Start recording to see your screen captures here</p>
        </div>
      )}
    </div>
  );
};

export default RecordingsList;
