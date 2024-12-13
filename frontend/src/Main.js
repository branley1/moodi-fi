// frontend/src/Main.js
import React, { useCallback, useState, useEffect } from 'react';
import axios from 'axios';
import config from './config';
import './Main.css';

function Main() {
  const [listeningData, setListeningData] = useState(null);
  const [summary, setSummary] = useState('');
  const [audio, setAudio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch listening data when the component loads
    const fetchListeningData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await axios.post(
          `${config.API_BASE_URL}/api/listening-data`,
          {},
          { withCredentials: true }
        );
        setListeningData(response.data);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch listening data.');
      } finally {
        setLoading(false);
      }
    };
    fetchListeningData();
    }, []);

  const generateSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.post(
        `${config.API_BASE_URL}/api/gemini-2.0-flash-exp`,
        { listeningData },
        { withCredentials: true }
      );
      setSummary(response.data.summary);
    } catch (err) {
      console.error(err);
      setError('Failed to generate summary.');
    } finally {
      setLoading(false);
    }
  };

    // Wrap the function to memoize it
    const generateAudio = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
        const response = await axios.post(
        `${config.API_BASE_URL}/api/gemini-2.0-flash-exp`,
        { summary },
        { withCredentials: true }
        );
        setAudio(response.data.audio);
    } catch (err) {
        console.error(err);
        setError('Failed to generate audio.');
    } finally {
        setLoading(false);
    }
    }, [summary]);


  useEffect(() => {
    if (summary) {
      generateAudio();
    }
  }, [summary, generateAudio]);

  return (
    <div style={styles.container}>
      <h1>Spotify Listening Insights</h1>
      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p style={styles.error}>{error}</p>
      ) : (
        <div>
          {listeningData ? (
            <div style={styles.section}>
              <h2>Your Top Tracks</h2>
              <ul>
                {listeningData.items.map((track) => (
                  <li key={track.id}>
                    {track.name} by {track.artists.map((artist) => artist.name).join(', ')}
                  </li>
                ))}
              </ul>
              <button onClick={generateSummary} style={styles.button} disabled={loading}>
                Generate Summary
              </button>
            </div>
          ) : (
            <p>No listening data available.</p>
          )}
          {summary && (
            <div style={styles.section}>
              <h2>Summary</h2>
              <p>{summary}</p>
              {audio ? (
                <div>
                  <h3>Audio Summary</h3>
                  <audio controls src={audio}></audio>
                </div>
              ) : (
                <p>Audio generation is currently unavailable.</p>
              )}
            </div>
          )}
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
    textAlign: 'left',
  },
  error: {
    color: 'red',
    marginTop: '20px',
  },
};

export default Main;
