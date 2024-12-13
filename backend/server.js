// backend/server.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from 'path';
import { fileURLToPath } from "url";
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import passport from 'passport';
import SpotifyStrategyLib from 'passport-spotify';
import session from 'express-session';
import cron from 'node-cron';
import { User } from './models/User.js';
// import { Summary } from "./models/Summary.js";
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

const SpotifyStrategy = SpotifyStrategyLib.Strategy;

dotenv.config();
const app = express();

// Access environment variables
const PORT = process.env.PORT || 8888;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET;

// Cors configuration
app.use(cors({
    origin: FRONTEND_URL,
    credentials: false, // No cookies used
}));

// Allow front-end to verify if user is authenticated
app.use(cookieParser());
app.use(express.json());

// Middleware to generate nonce
app.use((req, res, next) => {
    res.locals.nonce = uuidv4();
    next();
  });

// Use Helmet to set secure HTTP headers
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'", `${process.env.API_BASE_URL}`],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
        },
    })
);


app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // In development (HTTP) set secure: false. In production (HTTPS), set secure: true.
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none', // Required for cross-site cookies
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// Environment Configuration Validation
const requiredEnvVars = [
    'SPOTIFY_CLIENT_ID', 
    'SPOTIFY_CLIENT_SECRET', 
    'SPOTIFY_CALLBACK_URL', 
    'GOOGLE_API_KEY', 
    'MONGODB_URI',
    'SESSION_SECRET',
    'NODE_ENV',
    'JWT_SECRET' 
];

requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }
});

// Apply rate limiting to all API routes
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', apiLimiter);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((error) => {
        console.error('MongoDB Connection Error:', error);
        process.exit(1); // Exit
    });

// Initialize Google's Gemini model
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp", // "gemini-1.5-flash"
    generationConfig: {
      candidateCount: 1,
      stopSequences: [],
      maxOutputTokens: 1000,
      temperature: 1.0,
    },
});

// Test the model at startup 
(async () => {
    try {
        const result = await model.generateContent("List ten uncommon fruits.");
        console.log(result.response.text());
    } catch (error) {
        console.error("Error testing GenAI model:", error);
        process.exit(1); // Exit
    }
})();

// Passport configurationx
passport.use(new SpotifyStrategy({
    clientID: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    callbackURL: process.env.SPOTIFY_CALLBACK_URL
}, async (accessToken, refreshToken, expires_in, profile, done) => {
    try {
        let user = await User.findOne({ spotifyId: profile.id });

        if (!user) {
            user = new User({
                spotifyId: profile.id,
                accessToken,
                refreshToken,
                tokenExpiration: new Date(Date.now() + expires_in * 1000),
                profile,
                email: profile.emails ? profile.emails[0].value : null,
                displayName: profile.displayName
            });
        } else {
            user.accessToken = accessToken;
            user.refreshToken = refreshToken;
            user.tokenExpiration = new Date(Date.now() + expires_in * 1000);
        }

        await user.save();
        return done(null, user);
    } catch (error) {
        console.error('Error during Spotify login:', error);
        return done(error, null);
    }
}));

// Session serialization
passport.serializeUser((user, done) => {
    done(null, user.spotifyId);
});

passport.deserializeUser(async (spotifyId, done) => {
    try {
        const user = await User.findOne({ spotifyId });
        done(null, user);
    } catch (error) {
        done(error);
    }
});

// Token refresh logic
const refreshSpotifyToken = async (user) => {
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', 
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: user.refreshToken,
                client_id: process.env.SPOTIFY_CLIENT_ID,
                client_secret: process.env.SPOTIFY_CLIENT_SECRET
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000 // 10-second timeout
            }
        );

        if (response.data.access_token) {
            user.accessToken = response.data.access_token;
            user.tokenExpiration = new Date(Date.now() + (response.data.expires_in || 3600) * 1000);
            await user.save();
            return user.accessToken;
        } else {
            throw new Error('No access token received');
        }
    } catch (error) {
        console.error('Token Refresh failed:', {
            message: error.message,
            response: error.response ? error.response.data : 'No response',
            status: error.response ? error.response.status : 'Unknown'
        });

        if (user) {
            user.accessToken = null;
            user.tokenExpiration = null;
            await user.save();
        }

        throw new Error('Failed to refresh token');
    }
};

// Middleware to ensure valid Spotify token
const ensureValidSpotifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;

        // Check if token is blacklisted
        const blacklisted = await BlacklistedToken.findOne({ jti: decoded.jti });
        if (blacklisted) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        if (!user.tokenExpiration || user.tokenExpiration < new Date(Date.now() + 5 * 60 * 1000)) {
            await refreshSpotifyToken(user);
        }

        req.user = user;
        next();
        if (req.user) {
            console.log('Req.USER!')
        }
    } catch (error) {
        console.error('Authentication failed:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

// Routes

// Base route
app.get('/', (req, res) => {
    res.send('Server is running.');
});

// Auth routes
app.get('/auth/spotify', passport.authenticate('spotify', { 
    scope: ['user-read-recently-played', 'playlist-modify-public', 'playlist-modify-private'], 
    showDialog: true 
  }));
  

  app.get('/auth/spotify/callback', 
  passport.authenticate('spotify', { failureRedirect: '/login' }),
  function(req, res) {
      // Generate JWT
      const payload = {
          userId: req.user._id,
      };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

      // Redirect to frontend with JWT in URL fragment
      res.redirect(`${FRONTEND_URL}/#token=${token}`);
  }
);

/* Check if user is authenticated
app.get('/api/check-auth', async (req, res) => {
    try {
        const accessToken = req.cookies.spotify_access_token;
        if (!accessToken) {
            return res.json({ authenticated: false });
        }

        await axios.get('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        res.json({ authenticated: true, accessToken });
    } catch (error) {
        console.error('Auth check error:', error.response ? error.response.data : error.message);
        res.json({ authenticated: false });
    }
}); */

// Fetch user listening data
app.post('/api/listening-data', ensureValidSpotifyToken, async (req, res) => {
    try {
        const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
            headers: { 'Authorization': `Bearer ${req.user.accessToken}` },
            params: { limit: 20, time_range: 'medium_term' }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching listening data:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch listening data' });
    }
});

// Generate Summary
app.post('/api/gemini-2.0-flash-exp', async (req, res) => {
    const { listeningData } = req.body;

    if (!listeningData) {
        return res.status(400).json({ error: 'No listening data provided' });
    }

    try {
        const prompt = `Provide an interesting summary of the following listening data: ${JSON.stringify(listeningData)}`;
        const result = await model.generateContent(prompt);
        const summary = result.response.text();
        res.json({ summary });
    } catch (error) {
        console.error('Summary Generation Error:', error.message);
        res.status(500).json({ error: 'Failed to generate summary', details: error.message });
    }
});

// API Route to generate audio (consider OpenAI for now?)
app.post('/api/gemini-2.0-flash-exp', async (req, res) => {
    const { summary } = req.body;
    if (!summary) {
        return res.status(400).json({ error: 'No summary provided to generate audio from' });
    }

    try {
        // TODO: TTS
        res.status(501).json({ error: 'TTS not implemented. Please integrate a TTS API here.' });
    } catch (error) {
        console.error('Error generating audio:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to generate audio' });
    }
});

app.post('/api/generate-playlist', ensureValidSpotifyToken, async (req, res) => {
    const { trackUris } = req.body;
    if (!trackUris || !Array.isArray(trackUris)) {
        return res.status(400).json({ error: 'trackUris is required and must be an array' });
    }

    try {
        const userResponse = await axios.get('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${req.user.accessToken}` }
        });
        const userId = userResponse.data.id;

        // Create a new playlist
        const playlistResponse = await axios.post(
            `https://api.spotify.com/v1/users/${userId}/playlists`,
            { name: 'Your Top Tracks Playlist', public: false },
            { headers: { 'Authorization': `Bearer ${req.user.accessToken}` } }
        );

        const playlistId = playlistResponse.data.id;

        // Add tracks to the playlist
        await axios.post(
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            { uris: trackUris },
            { headers: { 'Authorization': `Bearer ${req.user.accessToken}` } }
        );

        res.json({ id: playlistId });
    } catch (error) {
        console.error('Failed to create playlist:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to create playlist' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    res.json({ message: 'Logged out successfully.' });
});

// Clean up expired tokens daily
cron.schedule('0 0 * * *', async () => {
    try {
        const expirationThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
        await User.deleteMany({ 
            tokenExpiration: { $lt: expirationThreshold } 
        });
        console.log('Expired user tokens cleaned up');
    } catch (error) {
        console.error('Token cleanup error:', error);
    }
});

// Serve static files from React frontend app
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all handler for unidentified routes, send back React's index.html file
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname + '/public/index.html'));
});  

// Start Server
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
