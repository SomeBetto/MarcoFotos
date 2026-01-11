import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Settings, Upload, Trash2, LogOut, Maximize, Play, Pause } from 'lucide-react';

// Connect to socket
const socket = io();

// Constants
const SLIDE_DURATION = 10000; // 10 seconds

function App() {
    const [viewMode, setViewMode] = useState('frame'); // 'frame' | 'admin' | 'login'
    const [photos, setPhotos] = useState([]);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);

    // Auth state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [token, setToken] = useState(localStorage.getItem('auth_token') || null);
    const [loginError, setLoginError] = useState('');

    // Upload state
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    // --- Real-time Sync ---
    useEffect(() => {
        socket.on('photos_updated', (updatedPhotos) => {
            console.log('Photos updated:', updatedPhotos);
            setPhotos(updatedPhotos);
            // Reset index if out of bounds
            setCurrentPhotoIndex(prev => (prev >= updatedPhotos.length ? 0 : prev));
        });

        // Initial fetch fallback
        fetch('/api/photos')
            .then(res => res.json())
            .then(data => setPhotos(data))
            .catch(err => console.error(err));

        return () => {
            socket.off('photos_updated');
        };
    }, []);

    // --- Slideshow Logic ---
    useEffect(() => {
        let interval;
        if (viewMode === 'frame' && isPlaying && photos.length > 0) {
            interval = setInterval(() => {
                setCurrentPhotoIndex(prev => (prev + 1) % photos.length);
            }, SLIDE_DURATION);
        }
        return () => clearInterval(interval);
    }, [viewMode, isPlaying, photos]);


    // --- Auth Handlers ---
    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                setToken(data.token);
                localStorage.setItem('auth_token', data.token);
                setViewMode('admin');
                setLoginError('');
            } else {
                setLoginError(data.error);
            }
        } catch (err) {
            setLoginError('Login failed');
        }
    };

    const logout = () => {
        setToken(null);
        localStorage.removeItem('auth_token');
        setViewMode('frame');
    };

    // --- Admin Actions ---
    const handleUpload = async (e) => {
        e.preventDefault();
        if (!fileInputRef.current.files.length) return;

        const formData = new FormData();
        for (let i = 0; i < fileInputRef.current.files.length; i++) {
            formData.append('photos', fileInputRef.current.files[i]);
        }

        setUploading(true);
        try {
            await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            // Clear input
            fileInputRef.current.value = null;
        } catch (err) {
            console.error("Upload failed", err);
            alert("Upload failed");
        }
        setUploading(false);
    };

    const handleDelete = async (filename) => {
        if (!confirm('Are you sure you want to delete this photo?')) return;
        try {
            await fetch(`/api/photos/${filename}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (err) {
            console.error("Delete failed", err);
        }
    };

    // --- Render ---

    // 1. Login View
    if (viewMode === 'login') {
        return (
            <div className="auth-container">
                <h2>Admin Login</h2>
                <form onSubmit={handleLogin}>
                    <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
                    <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
                    <button type="submit">Login</button>
                </form>
                {loginError && <p style={{ color: 'red' }}>{loginError}</p>}
                <button onClick={() => setViewMode('frame')} style={{ marginTop: '1rem', background: 'transparent', border: '1px solid white' }}>Back to Frame</button>
            </div>
        );
    }

    // 2. Admin View
    if (viewMode === 'admin') {
        if (!token) { setViewMode('login'); return null; }
        return (
            <div className="admin-container">
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1>Photo Manager</h1>
                    <div>
                        <button onClick={() => setViewMode('frame')} title="View Frame"><Maximize size={20} /></button>
                        <button onClick={logout} title="Logout" style={{ background: '#d32f2f', marginLeft: '10px' }}><LogOut size={20} /></button>
                    </div>
                </header>

                <div style={{ background: '#333', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
                    <h3>Upload Photos</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input type="file" multiple accept="image/*" ref={fileInputRef} />
                        <button onClick={handleUpload} disabled={uploading}>
                            {uploading ? 'Uploading...' : 'Upload'} <Upload size={16} style={{ marginLeft: '5px' }} />
                        </button>
                    </div>
                </div>

                <div className="gallery-grid">
                    {photos.map(photo => (
                        <div key={photo.name} className="gallery-item">
                            <img src={photo.url} alt={photo.name} loading="lazy" />
                            <button className="delete-btn" onClick={() => handleDelete(photo.name)}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // 3. Frame View (Default)
    return (
        <div className="frame-container">
            {photos.length > 0 ? (
                <img
                    key={photos[currentPhotoIndex]?.name} // Key change triggers animation
                    src={photos[currentPhotoIndex]?.url}
                    className="frame-image"
                    alt="Digital Frame"
                />
            ) : (
                <div style={{ textAlign: 'center', color: '#666' }}>
                    <h1>No Photos</h1>
                    <p>Upload photos to start the slideshow</p>
                </div>
            )}

            <div className="controls">
                <button onClick={() => setIsPlaying(!isPlaying)} style={{ marginRight: '10px' }}>
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button onClick={() => {
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen();
                    } else {
                        if (document.exitFullscreen) {
                            document.exitFullscreen();
                        }
                    }
                }} style={{ marginRight: '10px' }}>
                    <Maximize size={20} />
                </button>
                <button onClick={() => {
                    if (token) setViewMode('admin');
                    else setViewMode('login');
                }}>
                    <Settings size={20} />
                </button>
            </div>
        </div>
    );
}

export default App;
