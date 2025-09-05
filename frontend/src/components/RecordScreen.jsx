import React, { useState, useRef } from 'react';

const RecordScreen = ({ apiUrl }) => {
  const [recording, setRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState(null);
  const [recordingTime, setRecordingTime] = useState(180);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [timer, setTimer] = useState(0);
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const videoRef = useRef(null);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      // Get screen stream
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: includeAudio
      });
      
      // Get microphone audio if enabled
      let audioStream = null;
      if (includeAudio) {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
      }
      
      // Combine streams
      const combinedStream = new MediaStream();
      screenStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
      
      if (audioStream) {
        audioStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
      }
      
      // Setup media recorder
      mediaRecorderRef.current = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm; codecs=vp9'
      });
      
      const chunks = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        setRecordedVideo({ blob, url: videoUrl, duration: timer });
        
        // Reset timer and progress
        clearInterval(timerRef.current);
        setTimer(0);
        setProgress(0);
      };
      
      // Start recording
      mediaRecorderRef.current.start();
      setRecording(true);
      
      // Start timer
      let timeElapsed = 0;
      timerRef.current = setInterval(() => {
        timeElapsed += 1;
        setTimer(timeElapsed);
        
        // Calculate progress percentage
        const progressValue = (timeElapsed / recordingTime) * 100;
        setProgress(progressValue);
        
        // Stop recording if time limit reached
        if (timeElapsed >= recordingTime) {
          stopRecording();
        }
      }, 1000);
      
      // Handle when user stops sharing screen
      screenStream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };
      
    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Could not start recording. Please make sure to grant screen sharing permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const downloadRecording = () => {
    if (recordedVideo) {
      const a = document.createElement('a');
      a.href = recordedVideo.url;
      a.download = `screen-recording-${new Date().toISOString().slice(0, 19)}.webm`;
      a.click();
    }
  };

  const uploadRecording = async () => {
    if (!recordedVideo) return;
    
    try {
      setUploadStatus('Uploading...');
      const formData = new FormData();
      formData.append('video', recordedVideo.blob, `recording-${Date.now()}.webm`);
      formData.append('duration', recordedVideo.duration.toString());
      
      const response = await fetch(`${apiUrl}/api/recordings`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        setUploadStatus('Upload successful!');
        setTimeout(() => setUploadStatus(''), 3000);
      } else {
        const errorData = await response.json();
        setUploadStatus(`Upload failed: ${errorData.error || 'Please try again.'}`);
      }
    } catch (error) {
      console.error('Error uploading recording:', error);
      setUploadStatus('Error uploading recording. Please check your connection.');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Recording Panel */}
      <div className="glass-effect p-6 rounded-2xl">
        <h2 className="text-2xl font-semibold mb-6 flex items-center">
          <i className="fas fa-record-vinyl mr-3 text-red-500"></i>
          Record Your Screen
        </h2>
        
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="text-lg font-medium">Recording Length</label>
            <span className="font-mono text-xl font-bold">
              {formatTime(recordingTime)}
            </span>
          </div>
          <input 
            type="range" 
            min="30" 
            max="180" 
            value={recordingTime} 
            onChange={(e) => setRecordingTime(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" 
          />
          <div className="flex justify-between text-sm mt-1 text-gray-400">
            <span>30s</span>
            <span>3min</span>
          </div>
        </div>
        
        <div className="mb-6">
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input 
                type="checkbox" 
                checked={includeAudio}
                onChange={() => setIncludeAudio(!includeAudio)}
                className="sr-only" 
              />
              <div className={`block w-14 h-8 rounded-full transition-colors ${includeAudio ? 'bg-blue-500' : 'bg-gray-600'}`}></div>
              <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${includeAudio ? 'translate-x-6' : ''}`}></div>
            </div>
            <div className="ml-3 text-lg">Include Microphone Audio</div>
          </label>
        </div>
        
        <div className="flex space-x-4 mb-6">
          <button 
            onClick={startRecording} 
            disabled={recording}
            className={`flex-1 py-3 px-6 rounded-lg flex items-center justify-center transition-all ${
              recording 
                ? 'bg-gray-600 opacity-50 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg'
            }`}
          >
            <i className="fas fa-circle mr-2"></i> Start Recording
          </button>
          <button 
            onClick={stopRecording} 
            disabled={!recording}
            className={`flex-1 py-3 px-6 rounded-lg flex items-center justify-center transition-all ${
              !recording 
                ? 'bg-gray-600 opacity-50 cursor-not-allowed' 
                : 'bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg'
            }`}
          >
            <i className="fas fa-stop mr-2"></i> Stop Recording
          </button>
        </div>
        
        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-400">Recording Progress</span>
            <span className="text-sm font-mono">{formatTime(timer)} / {formatTime(recordingTime)}</span>
          </div>
          <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
        
        {/* Status Indicator */}
        <div className="text-center">
          <div className={`inline-flex items-center px-4 py-2 rounded-full ${
            recording 
              ? 'bg-red-900 text-red-200 animate-pulse' 
              : recordedVideo 
                ? 'bg-green-900 text-green-200' 
                : 'bg-gray-800 text-gray-300'
          }`}>
            <i className={`fas ${
              recording ? 'fa-circle' : recordedVideo ? 'fa-check-circle' : 'fa-circle-notch'
            } mr-2`}></i>
            {recording ? `Recording... ${formatTime(timer)}` : recordedVideo ? 'Recording complete' : 'Ready to record'}
          </div>
        </div>
      </div>
      
      {/* Preview Panel */}
      <div className="glass-effect p-6 rounded-2xl">
        <h2 className="text-2xl font-semibold mb-6 flex items-center">
          <i className="fas fa-play-circle mr-3 text-green-500"></i>
          Preview Recording
        </h2>
        
        <div className="mb-6 aspect-video bg-black bg-opacity-50 rounded-xl flex items-center justify-center border border-gray-700 overflow-hidden">
          {recordedVideo ? (
            <video 
              ref={videoRef}
              src={recordedVideo.url} 
              controls 
              className="w-full h-full"
            />
          ) : (
            <div className="text-center p-6 text-gray-400">
              <i className="fas fa-video text-5xl mb-4 opacity-50"></i>
              <p className="text-lg">Recording preview will appear here</p>
              <p className="text-sm mt-2">Start recording to see your screen capture</p>
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <button 
            onClick={downloadRecording}
            disabled={!recordedVideo}
            className={`py-3 px-4 rounded-lg flex items-center justify-center transition-all ${
              !recordedVideo 
                ? 'bg-gray-700 opacity-50 cursor-not-allowed' 
                : 'bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 shadow-lg'
            }`}
          >
            <i className="fas fa-download mr-2"></i> Download
          </button>
          <button 
            onClick={uploadRecording}
            disabled={!recordedVideo}
            className={`py-3 px-4 rounded-lg flex items-center justify-center transition-all ${
              !recordedVideo 
                ? 'bg-gray-700 opacity-50 cursor-not-allowed' 
                : 'bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 shadow-lg'
            }`}
          >
            <i className="fas fa-cloud-upload-alt mr-2"></i> Upload
          </button>
        </div>

        {uploadStatus && (
          <div className={`text-center py-2 px-4 rounded-lg ${
            uploadStatus.includes('successful') 
              ? 'bg-green-900 text-green-200' 
              : uploadStatus.includes('Error') || uploadStatus.includes('failed')
                ? 'bg-red-900 text-red-200'
                : 'bg-blue-900 text-blue-200'
          }`}>
            {uploadStatus}
          </div>
        )}
        
        {/* Instructions */}
        <div className="mt-8 pt-6 border-t border-gray-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <i className="fas fa-info-circle mr-2 text-blue-400"></i>
            How to Use
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-start">
              <div className="bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-xs">1</div>
              <p>Adjust recording length and audio settings</p>
            </div>
            
            <div className="flex items-start">
              <div className="bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-xs">2</div>
              <p>Click "Start Recording" and grant permissions</p>
            </div>
            
            <div className="flex items-start">
              <div className="bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-xs">3</div>
              <p>Select the screen or window to record</p>
            </div>
            
            <div className="flex items-start">
              <div className="bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-xs">4</div>
              <p>Stop recording or wait for auto-completion</p>
            </div>
            
            <div className="flex items-start">
              <div className="bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-xs">5</div>
              <p>Preview, download, or upload your recording</p>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-blue-900 bg-opacity-30 rounded-lg text-sm">
            <i className="fas fa-exclamation-circle mr-2 text-blue-300"></i>
            Note: Screen recording requires a secure context (HTTPS) in production, but works on localhost for development.
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordScreen;
