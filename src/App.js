// src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [accessToken, setAccessToken] = useState('');
  const [listeningData, setListeningData] = useState(null);
  const [summary, setSummary] = useState('');
  const [audio, setAudio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Extract token from URL on initial load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setAccessToken(token);
      window.history.replaceState({}, document.title, "/"); // Remove token from URL
    }
  }, []);

  const fetchListeningData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.post('http://localhost:5000/api/listening-data', { accessToken });
      setListeningData(response.data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch listening data.');
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.post('http://localhost:5000/api/generate-summary', { listeningData });
      setSummary(response.data.summary);
    } catch (err) {
      console.error(err);
      setError('Failed to generate summary.');
    } finally {
      setLoading(false);
    }
  };

  const generateAudio = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.post('http://localhost:5000/api/generate-audio', { summary: summary });
      setAudio(response.data.audio);
    } catch (err) {
      console.error(err);
      setError('Failed to generate audio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (summary) {
      generateAudio();
    }
    // eslint-disable-next-line
  }, [summary]);

  return (
    <div style={styles.container}>
      <h1>Spotify Listening Insights</h1>
      {!accessToken ? (
        <a href="http://localhost:5000/auth/spotify" style={styles.button}>Login with Spotify</a>
      ) : (
        <div>
          <button onClick={fetchListeningData} style={styles.button} disabled={loading}>
            {loading ? 'Fetching Data...' : 'Get Listening Data'}
          </button>
          {listeningData && (
            <div style={styles.section}>
              <h2>Your Top Tracks</h2>
              <ul>
                {listeningData.items.map(track => (
                  <li key={track.id}>{track.name} by {track.artists.map(artist => artist.name).join(', ')}</li>
                ))}
              </ul>
              <button onClick={generateSummary} style={styles.button} disabled={loading}>
                {loading ? 'Generating Summary...' : 'Generate Summary'}
              </button>
            </div>
          )}
          {summary && (
            <div style={styles.section}>
              <h2>Summary</h2>
              <p>{summary}</p>
              {audio && (
                <div>
                  <h3>Audio Summary</h3>
                  <audio controls src={audio}></audio>
                </div>
              )}
            </div>
          )}
          {error && <p style={styles.error}>{error}</p>}
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
    fontFamily: 'Arial, sans-serif',
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
    textAlign: 'left',
  },
  error: {
    color: 'red',
    marginTop: '20px',
  },
};

export default App;
