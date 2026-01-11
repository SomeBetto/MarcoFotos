const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const chokidar = require('chokidar');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
// Allow CORS for dev (if running separate ports)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PHOTOS_DIR = path.join(__dirname, 'photos');
const PORT = process.env.PORT || 3000;

// Ensure photos directory exists
if (!fs.existsSync(PHOTOS_DIR)) {
  fs.mkdirSync(PHOTOS_DIR);
}

// Generate Admin Credentials
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || Math.random().toString(36).slice(-8);

console.log('================================================');
console.log(' DIGITAL FRAME SERVER STARTED ');
console.log('------------------------------------------------');
console.log(` USER: ${ADMIN_USER}`);
console.log(` PASSWORD: ${ADMIN_PASS}`);
console.log('================================================');

app.use(cors());
app.use(express.json());

// Serve static photos
app.use('/photos', express.static(PHOTOS_DIR));

// Serve Frontend (Production / Docker)
app.use(express.static(path.join(__dirname, 'public')));


// --- Auth Middleware ---
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No credentials sent' });

  const token = authHeader.split(' ')[1]; // Expecting "Bearer username:password" base64 or just simple text for now? 
  // Let's use simple Custom header or Basic Auth.
  // Simpler: Just send "x-auth-user" and "x-auth-pass" or a simple JSON body for login that returns a token.
  // Let's go with a simple "login" endpoint that returns a token (just the password for simplicity here)
  // and verify that token in headers.
};

// Login Route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ success: true, token: `${username}:${password}` }); // Simple token
  }
  return res.status(401).json({ success: false, error: 'Invalid credentials' });
});

// Protect upload/delete
const checkAuth = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (auth === `Bearer ${ADMIN_USER}:${ADMIN_PASS}`) {
    next();
  } else {
    res.status(403).json({ error: 'Unauthorized' });
  }
}

// --- File Handling ---

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, PHOTOS_DIR)
  },
  filename: function (req, file, cb) {
    // Sanitize filename: remove spaces and special chars
    const sanitizedOriginal = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + sanitizedOriginal);
  }
});

const upload = multer({ storage: storage });

app.get('/api/photos', (req, res) => {
  fs.readdir(PHOTOS_DIR, (err, files) => {
    if (err) {
      console.error("Error reading dir:", err);
      return res.status(500).json({ error: 'Failed to list photos' });
    }
    const images = files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));
    const fileData = images.map(file => ({
      name: file,
      url: `/photos/${encodeURIComponent(file)}`,
      created: fs.statSync(path.join(PHOTOS_DIR, file)).mtime
    })).sort((a, b) => b.created - a.created);

    console.log(`Sending ${fileData.length} photos`);
    res.json(fileData);
  });
});

app.post('/api/upload', checkAuth, upload.array('photos', 50), (req, res) => {
  console.log("Uploaded files:", req.files.length);
  broadcastPhotos(); // Javascript-triggered broadcast in case watcher is slow
  res.json({ success: true, count: req.files.length });
});

app.delete('/api/photos/:filename', checkAuth, (req, res) => {
  // Decode filename from URL param
  const filename = decodeURIComponent(req.params.filename);
  const filepath = path.join(PHOTOS_DIR, filename);

  if (!filepath.startsWith(PHOTOS_DIR)) {
    return res.status(403).json({ error: 'Invalid file path' });
  }

  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    console.log(`Deleted file: ${filename}`);
    broadcastPhotos(); // Immediate broadcast
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});


// --- Real-time Watcher ---
const broadcastPhotos = () => {
  // Debounce or just run?
  fs.readdir(PHOTOS_DIR, (err, files) => {
    if (err) return;
    const images = files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));
    const fileData = images.map(file => ({
      name: file,
      url: `/photos/${encodeURIComponent(file)}`,
      created: fs.statSync(path.join(PHOTOS_DIR, file)).mtime
    })).sort((a, b) => b.created - a.created);

    console.log(`Broadcasting update: ${fileData.length} photos`);
    io.emit('photos_updated', fileData);
  });
};

const watcher = chokidar.watch(PHOTOS_DIR, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true,
  usePolling: true, // <--- CRITICAL for Docker on Windows/Mac
  interval: 1000
});

watcher
  .on('add', path => { console.log(`File added (watcher): ${path}`); broadcastPhotos(); })
  .on('unlink', path => { console.log(`File removed (watcher): ${path}`); broadcastPhotos(); });

io.on('connection', (socket) => {
  console.log('Client connected');
  // Send initial list
  broadcastPhotos();

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Handle SPA routing
app.get('*', (req, res) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/photos') || req.url.startsWith('/socket.io')) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
