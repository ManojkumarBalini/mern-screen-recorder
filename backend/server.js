const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}.webm`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Initialize SQLite database
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/data/database.db' 
  : path.join(__dirname, 'database.db');

// Ensure data directory exists in production
if (process.env.NODE_ENV === 'production') {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

const db = new sqlite3.Database(dbPath);

// Create recordings table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      duration INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Routes
app.post('/api/recordings', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const { filename, path: filepath, size } = req.file;
  const { duration } = req.body;
  
  // Save to database
  const stmt = db.prepare(`
    INSERT INTO recordings (filename, filepath, filesize, duration) 
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(filename, filepath, size, duration, function(err) {
    if (err) {
      console.error('Error saving recording to database:', err);
      return res.status(500).json({ error: 'Failed to save recording' });
    }
    
    res.status(201).json({
      message: 'Recording uploaded successfully',
      recording: {
        id: this.lastID,
        filename,
        filepath,
        filesize: size,
        duration,
        createdAt: new Date().toISOString()
      }
    });
  });
  
  stmt.finalize();
});

app.get('/api/recordings', (req, res) => {
  db.all('SELECT * FROM recordings ORDER BY createdAt DESC', (err, rows) => {
    if (err) {
      console.error('Error fetching recordings:', err);
      return res.status(500).json({ error: 'Failed to fetch recordings' });
    }
    
    res.json(rows);
  });
});

app.get('/api/recordings/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM recordings WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Error fetching recording:', err);
      return res.status(500).json({ error: 'Failed to fetch recording' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    const filePath = path.join(__dirname, row.filepath);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    
    // Stream the video file
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/webm',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/webm',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

app.get('/api/recordings/:id/download', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM recordings WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Error fetching recording:', err);
      return res.status(500).json({ error: 'Failed to fetch recording' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    const filePath = path.join(__dirname, row.filepath);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    
    res.download(filePath, row.filename);
  });
});

app.delete('/api/recordings/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM recordings WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Error fetching recording:', err);
      return res.status(500).json({ error: 'Failed to fetch recording' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    const filePath = path.join(__dirname, row.filepath);
    
    // Delete file from filesystem
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Delete from database
    db.run('DELETE FROM recordings WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Error deleting recording:', err);
        return res.status(500).json({ error: 'Failed to delete recording' });
      }
      
      res.json({ message: 'Recording deleted successfully' });
    });
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  // Serve frontend build files
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port} in ${process.env.NODE_ENV || 'development'} mode`);
});
