const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Use better-sqlite3 instead of sqlite3 for Render compatibility
let Database;
try {
  // Try to use better-sqlite3 which works better on Render
  Database = require('better-sqlite3');
} catch (error) {
  console.warn('better-sqlite3 not available, falling back to sqlite3');
  Database = require('sqlite3').Database;
}

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
  ? '/tmp/database.db'  // Use /tmp directory on Render
  : path.join(__dirname, 'database.db');

// Ensure directory exists
if (process.env.NODE_ENV === 'production') {
  const tmpDir = path.dirname(dbPath);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
}

// Initialize database
let db;
try {
  if (Database.name === 'Database') {
    // Using better-sqlite3
    db = new Database(dbPath);
  } else {
    // Using sqlite3
    db = new Database(dbPath);
  }
  
  // Create recordings table if it doesn't exist
  if (Database.name === 'Database') {
    // better-sqlite3 syntax
    db.prepare(`
      CREATE TABLE IF NOT EXISTS recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        filesize INTEGER NOT NULL,
        duration INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } else {
    // sqlite3 syntax
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
  }
} catch (error) {
  console.error('Database initialization error:', error);
  // Fallback to in-memory database if file-based fails
  db = new (require('sqlite3').Database)(':memory:');
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
}

// Helper function for database operations
const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    if (Database.name === 'Database') {
      // better-sqlite3
      try {
        const stmt = db.prepare(query);
        const result = stmt.run(...params);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    } else {
      // sqlite3
      db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    }
  });
};

const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    if (Database.name === 'Database') {
      // better-sqlite3
      try {
        const stmt = db.prepare(query);
        const result = stmt.all(...params);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    } else {
      // sqlite3
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    }
  });
};

const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    if (Database.name === 'Database') {
      // better-sqlite3
      try {
        const stmt = db.prepare(query);
        const result = stmt.get(...params);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    } else {
      // sqlite3
      db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    }
  });
};

// Routes
app.post('/api/recordings', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const { filename, path: filepath, size } = req.file;
  const { duration } = req.body;
  
  try {
    // Save to database
    const result = await dbRun(
      `INSERT INTO recordings (filename, filepath, filesize, duration) VALUES (?, ?, ?, ?)`,
      [filename, filepath, size, duration]
    );
    
    res.status(201).json({
      message: 'Recording uploaded successfully',
      recording: {
        id: result.lastInsertRowid,
        filename,
        filepath,
        filesize: size,
        duration,
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Error saving recording to database:', err);
    res.status(500).json({ error: 'Failed to save recording' });
  }
});

app.get('/api/recordings', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM recordings ORDER BY createdAt DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching recordings:', err);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

app.get('/api/recordings/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const row = await dbGet('SELECT * FROM recordings WHERE id = ?', [id]);
    
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
  } catch (err) {
    console.error('Error fetching recording:', err);
    res.status(500).json({ error: 'Failed to fetch recording' });
  }
});

app.get('/api/recordings/:id/download', async (req, res) => {
  const { id } = req.params;
  
  try {
    const row = await dbGet('SELECT * FROM recordings WHERE id = ?', [id]);
    
    if (!row) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    const filePath = path.join(__dirname, row.filepath);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    
    res.download(filePath, row.filename);
  } catch (err) {
    console.error('Error fetching recording:', err);
    res.status(500).json({ error: 'Failed to fetch recording' });
  }
});

app.delete('/api/recordings/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const row = await dbGet('SELECT * FROM recordings WHERE id = ?', [id]);
    
    if (!row) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    const filePath = path.join(__dirname, row.filepath);
    
    // Delete file from filesystem
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Delete from database
    await dbRun('DELETE FROM recordings WHERE id = ?', [id]);
    
    res.json({ message: 'Recording deleted successfully' });
  } catch (err) {
    console.error('Error deleting recording:', err);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
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
