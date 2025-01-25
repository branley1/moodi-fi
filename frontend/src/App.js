import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import config from './config';
import './App.css';

// Component to display individual track iframes
const TrackList = ({ tracks }) => (
    <div className='topTracks'>
        {tracks.map((track) => (
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
);

// Component to display playlist iframes
const PlaylistDisplay = ({ playlistId }) => (
    <iframe
        title="Spotify Embed: Generated Playlist"
        src={`https://open.spotify.com/embed/playlist/${playlistId}`}
        width="100%"
        height="380"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        style={{ borderRadius: '8px' }}
    ></iframe>
);

const ErrorDisplay = ({ error }) => (
    <div className='errorContainer'>
        <p className='error'>{error}</p>
    </div>
);

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [topTracks, setTopTracks] = useState([]);
    const [summary, setSummary] = useState('');
    const [audio, setAudio] = useState(null);
    const [playlist, setPlaylist] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Set Authorization header for axios, memoize with useCallback
    const setAuthToken = useCallback((token) => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            console.log("Authorization token set")
        } else {
            delete axios.defaults.headers.common['Authorization'];
            console.log("Authorization token removed")
        }
    }, [])

    // Check and set the token from URL or local storage
    const checkAndSetToken = useCallback(() => {
        const cookies = document.cookie;
        let jwtToken = null;
    
        if (cookies) {
            const jwtCookie = cookies.split(';').find(cookie => cookie.trim().startsWith('jwtToken='));
            if (jwtCookie) {
                jwtToken = jwtCookie.split('=')[1]; // Extract JWT value
            }
        }
    
        if (jwtToken) {
            setAuthToken(jwtToken);
            console.log('JWT Token extracted from cookies', jwtToken);
            return true;
        } else {
            setAuthToken(null); // Clear auth token if no cookie
            return false;
        }
    }, [setAuthToken]);

    const handleAuthCheck = useCallback(() => {
        const isAuthenticated = checkAndSetToken();
        setIsAuthenticated(isAuthenticated);
    }, [checkAndSetToken])

    useEffect(() => { // After initial token exchange (when 'code' is in URL), check for jwtToken cookie.
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
            console.log("Code found in URL:", code);
            const exchangeCodeForToken = async (authCode) => {
                setLoading(true);
                setError('');
                try {
                    console.log("Exchanging code for token with backend...");
                    console.log("Sending authCode to backend:", authCode);
                    const backendUrl = `http://localhost:8888/api/spotify-callback`; // Explicitly use HTTP
                    await axios.post(backendUrl, { code: authCode }, { maxRedirects: 5 }); // Backend sets cookie
                    console.log("Token exchnage complete, JWT should be in HttpOnly cookie.");
                    window.history.replaceState(null, null, '/');
                    handleAuthCheck(); // Re-run auth check after exchange to pick up cookie and set auth status
                } catch (error) {
                    console.error("Error exchanging code for token:", error);
                    setError('Failed to authenticate with Spotify.');
                } finally {
                    setLoading(false);
                }
            };
            exchangeCodeForToken(code);
            return false;
        } else {
            // Handled by initial auth check
        }
        
    }, [handleAuthCheck]); // useEffect to handle initial auth flow and cookies

    // Call checkAndSetToken on mount AND location change
    useEffect(() => {
        handleAuthCheck();
    }, [handleAuthCheck]);


    // Fetch user listening data
    const fetchTopTracks = async () => {
        setLoading(true);
        setError('');
        try {
            console.log("Fetching top tracks");
            const response = await axios.get(`${config.API_BASE_URL}/api/listening-data`);
            setTopTracks(response.data.items || []);
            console.log('Top tracks fetched successfully', response.data);
        } catch (err) {
            console.error('Failed to fetch top tracks:', err);
            if (err.response && err.response.data && err.response.data.error) {
                setError(`Failed to fetch top tracks: ${err.response.data.error}`);
            } else {
                setError('Failed to fetch top tracks.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Generate listening data summary
    const generateSummary = async () => {
        if (!topTracks || topTracks.length === 0) {
            console.warn("Cannot generate summary without top tracks")
            return;
        }
        setLoading(true);
        setError('');
        try {
            console.log('Generating summary')
            const response = await axios.post(
                `${config.API_BASE_URL}/api/gemini-2.0-flash-exp`,
                { listeningData: topTracks }
            );
            setSummary(response.data.summary);
            console.log('Summary generated succesfully', response.data);
        } catch (err) {
            console.error('Failed to generate summary:', err);
            if (err.response && err.response.data && err.response.data.error) {
                setError(`Failed to generate summary: ${err.response.data.error}`);
            } else {
                setError('Failed to generate summary.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Generate audio from summary
    const generateAudio = async () => {
        if (!summary) {
            console.warn('Cannot generate audio without summary')
            return;
        }
        setLoading(true);
        setError('');
        try {
            console.log('Generating audio');
            const response = await axios.post(
                `${config.API_BASE_URL}/api/gemini-2-0-flash-exp`,
                { summary }
            );
            // Since TTS not implemented, this may return an error by design.
            if (response.data.audio) {
                setAudio(response.data.audio);
                console.log('Audio generated successfully', response.data);
            } else {
                setError('Audio generation is currently unavailable.');
                console.warn('Audio generation is currently unavailable.');
            }
        } catch (err) {
            console.error('Failed to generate audio.', err);
            if (err.response && err.response.data && err.response.data.error) {
                setError(`Failed to generate audio: ${err.response.data.error}`);
            } else {
                setError('Failed to generate audio.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Create Spotify Playlist
    const createPlaylist = async () => {
        if (!topTracks || topTracks.length === 0) {
            console.warn('Cannot generate playlist without top tracks');
            return;
        }
        setLoading(true);
        setError('');
        try {
            console.log('Creating playlist');
            const trackUris = topTracks.map((track) => track.uri);
            const response = await axios.post(
                `${config.API_BASE_URL}/api/generate-playlist`,
                { trackUris }
            );
            setPlaylist(response.data);
            console.log('Playlist created successfullly', response.data);
        } catch (err) {
            console.error('Failed to create playlist.', err);
            if (err.response && err.response.data && err.response.data.error) {
                setError(`Failed to create playlist: ${err.response.data.error}`);
            } else {
                setError('Failed to create playlist.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Handle user logout
    const logout = async () => {
        try {
            console.log('Logging out');
            delete axios.defaults.headers.common['Authorization'];
            await axios.post(`${config.API_BASE_URL}/api/logout`);

            setIsAuthenticated(false);
            setTopTracks([]);
            setSummary('');
            setAudio(null);
            setPlaylist(null);

            // Clear jwtToken cookie by setting it to expire immediately
            document.cookie = 'jwtToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT;';
        } catch (error) {
            console.error('Logout failed:', error);
            if (error.response && error.response.data && error.response.data.error) {
                setError(`Logout failed: ${error.response.data.error}`);
            } else {
                setError('Logout failed.');
            }
        }
    };

    // Conditional rendering logic based on user authentication
    return (
        <div className='container'>
            <div>
                <h1>Moodi-Fi</h1>
                <p className='tagline'>Your personalized Spotify Music Insights</p>
                {!isAuthenticated ? (
                    <div>
                        <a href={`${config.API_BASE_URL}/auth/spotify`} className='login-button'>Login with Spotify</a>
                    </div>
                ) : (
                    <div>
                        <div className='button-grid'>
                        <button onClick={fetchTopTracks} className='button primary-button' disabled={loading}>
                        {loading ? 'Fetching Data...' : 'Fetch Top Tracks'}
                        </button>

                        <button onClick={generateSummary} className='button' disabled={loading || topTracks.length === 0}>
                            {loading && !summary ? 'Generating Summary...' : 'Generate Summary'}
                        </button>
                        <button onClick={generateAudio} className='button' disabled={loading || !summary}>
                            {loading && !audio ? 'Generating Audio...' : 'Generate Audio'}
                        </button>
                        <button onClick={createPlaylist} className='button' disabled={loading || topTracks.length === 0}>
                            {loading && !playlist ? 'Creating Playlist...' : 'Create Playlist'}
                        </button>
                    </div>

                    {topTracks.length > 0 && (
                        <div className='section'>
                            <h2>Your Top Tracks</h2>
                            <TrackList tracks={topTracks} />
                        </div>
                        )
                    }

                    {summary && (
                        <div className='section'>
                            <h2>Summary</h2>
                            <p>{summary}</p>
                        </div>
                    )}

                    {audio && (
                        <div className='section'>
                            <h2>Audio Summary</h2>
                            <audio controls src={audio}></audio>
                        </div>
                    )}

                    {playlist && (
                        <div className='section'>
                            <h2>Generated Playlist</h2>
                            <PlaylistDisplay playlistId={playlist.id} />
                        </div>
                    )}

                    {error && <ErrorDisplay error={error} />}
                    <button onClick={logout} className='button logout-button' disabled={loading}>Logout</button>
                </div>
            )}
        </div>
        <footer>
            <p>© {new Date().getFullYear()} Moodi-Fi. All rights reserved.</p>
        </footer>
    </div>
    );
};

export default App;