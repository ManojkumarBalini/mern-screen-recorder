const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 5000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Initialize SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

// Create recordings table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'recording-' + uniqueSuffix + '.webm');
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Middleware
app.use(express.json());
app.use(express.static('uploads'));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Routes
app.post('/api/recordings', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const { filename, path: filepath, size } = req.file;
  
  // Save to database
  const stmt = db.prepare(`
    INSERT INTO recordings (filename, filepath, filesize) 
    VALUES (?, ?, ?)
  `);
  
  stmt.run(filename, filepath, size, function(err) {
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

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});