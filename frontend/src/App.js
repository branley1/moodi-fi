// src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import config from './config';
import './App.css';

function App() {
  const [jwtToken, setJwtToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [topTracks, setTopTracks] = useState([]);
  const [summary, setSummary] = useState('');
  const [audio, setAudio] = useState(null);
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Extract JWT from URL on initial load
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1)); // Remove the '#'
      const token = params.get('token');
      if (token) {
        setJwtToken(token);
        setIsAuthenticated(true);
        // Optionally, remove the token from the URL
        window.history.replaceState(null, null, ' ');
      }
    }
  }, []);

  // Set Authorization header for axios
  const setAuthToken = (token) => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  useEffect(() => {
    setAuthToken(jwtToken);
  }, [jwtToken]);

  const fetchTopTracks = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.post(
        `${config.API_BASE_URL}/api/listening-data`
      );
      setTopTracks(response.data.items || []);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch top tracks.');
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    if (!topTracks || topTracks.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const response = await axios.post(
        `${config.API_BASE_URL}/api/gemini-2.0-flash-exp`,
        { listeningData: topTracks }
      );
      setSummary(response.data.summary);
    } catch (err) {
      console.error(err);
      setError('Failed to generate summary.');
    } finally {
      setLoading(false);
    }
  };

  const generateAudio = async () => {
    if (!summary) return;
    setLoading(true);
    setError('');
    try {
      const response = await axios.post(
        `${config.API_BASE_URL}/api/gemini-2-0-flash-exp`,
        { summary }
      );
      // Since TTS not implemented, this may return an error by design.
      if (response.data.audio) {
        setAudio(response.data.audio);
      } else {
        setError('Audio generation is currently unavailable.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to generate audio.');
    } finally {
      setLoading(false);
    }
  };

  const createPlaylist = async () => {
    if (!topTracks || topTracks.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const trackUris = topTracks.map((track) => track.uri);
      const response = await axios.post(
        `${config.API_BASE_URL}/api/generate-playlist`,
        { trackUris }
      );
      setPlaylist(response.data);
    } catch (err) {
      console.error(err);
      setError('Failed to create playlist.');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await axios.get(`${config.API_BASE_URL}/api/logout`);
      setIsAuthenticated(false);
      setTopTracks([]);
      setSummary('');
      setAudio(null);
      setPlaylist(null);
    } catch (error) {
      console.error('Logout failed:', error);
      setError('Failed to logout.');
    }
  };

  return (
    <div style={styles.container}>
      <h1>Moodi-Fi</h1>
      {!isAuthenticated ? (
        <a href={`${config.API_BASE_URL}/auth/spotify`} style={styles.button}>Login with Spotify</a>
      ) : (
        <div>
          <button onClick={fetchTopTracks} style={styles.button} disabled={loading}>
            {loading ? 'Fetching Data...' : 'Fetch Top Tracks'}
          </button>
          
          {topTracks.length > 0 && (
            <div style={styles.section}>
              <h2>Your Top Tracks</h2>
              <div style={styles.topTracks}>
                {topTracks.map((track) => (
                  <iframe
                    key={track.id}
                    src={`https://open.spotify.com/embed/track/${track.id}`}
                    width="300"
                    height="80"
                    frameBorder="0"
                    allow="encrypted-media"
                    title={track.name}
                  ></iframe>
                ))}
              </div>
            </div>
          )}

          <div style={styles.actions}>
            <button onClick={generateSummary} style={styles.button} disabled={loading || topTracks.length === 0}>
              {loading && !summary ? 'Generating Summary...' : 'Generate Summary'}
            </button>
            <button onClick={generateAudio} style={styles.button} disabled={loading || !summary}>
              {loading && !audio ? 'Generating Audio...' : 'Generate Audio'}
            </button>
            <button onClick={createPlaylist} style={styles.button} disabled={loading || topTracks.length === 0}>
              {loading && !playlist ? 'Creating Playlist...' : 'Create Playlist'}
            </button>
          </div>

          {summary && (
            <div style={styles.section}>
              <h2>Summary</h2>
              <p>{summary}</p>
            </div>
          )}

          {audio && (
            <div style={styles.section}>
              <h2>Audio Summary</h2>
              <audio controls src={audio}></audio>
            </div>
          )}

          {playlist && (
            <div style={styles.section}>
              <h2>Generated Playlist</h2>
              <iframe
                title="Spotify Embed: Generated Playlist"
                src={`https://open.spotify.com/embed/playlist/${playlist.id}`}
                width="100%"
                height="380"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                style={{ borderRadius: '8px' }}
              ></iframe>
            </div>
          )}

          {error && <p style={styles.error}>{error}</p>}
          <button onClick={logout} style={styles.button} disabled={loading}>Logout</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '800px',
    margin: '50px auto',
    padding: '20px',
    textAlign: 'center',
    fontFamily: 'IBM Plex Mono, monospace',
  },
  button: {
    padding: '10px 20px',
    fontSize: '16px',
    margin: '10px',
    borderRadius: '5px',
    border: 'none',
    backgroundColor: '#1DB954',
    color: '#fff',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  section: {
    marginTop: '30px',
    textAlign: 'center',
  },
  topTracks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    justifyContent: 'center',
    marginTop: '20px',
  },
  actions: {
    marginTop: '20px',
  },
  error: {
    color: 'red',
    marginTop: '20px',
  },
};

export default App;
