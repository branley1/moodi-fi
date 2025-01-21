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
import cron from 'node-cron';
import { User } from './models/User.js';
import { BlacklistedToken } from "./models/BlacklistedToken.js";
import { Summary } from "./models/Summary.js";
import { createLogger, format, transports } from 'winston';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

const SpotifyStrategy = SpotifyStrategyLib.Strategy;

dotenv.config();
const app = express();

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

// Access environment variables
const PORT = process.env.PORT || 8888;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware configuration
app.use(cors({
    origin: FRONTEND_URL,
}));

// Allow front-end to verify if user is authenticated
app.use(cookieParser());
app.use(express.json());

// Middleware to generate nonce for CSP
app.use((req, res, next) => {
    res.locals.nonce = uuidv4();
    next();
  });

// Use Helmet to set secure HTTP headers
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:"],
                connectSrc: ["'self'", `${process.env.API_BASE_URL}`],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
            },
        },
    })
);

app.use(passport.initialize());

// Rate limiting for API routes
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit to 100 requests per window
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', apiLimiter);

const playlistRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: "Too many requests from this IP to generate playlist, please try again later."
})
app.use("/api/generate-playlist", playlistRateLimiter)

// Connect to MongoDB
mongoose
    .connect(process.env.MONGODB_URI)
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

// Test the Gemini model at startup 
(async () => {
    try {
        const result = await model.generateContent("List ten uncommon fruits.");
        console.log(result.response.text());
    } catch (error) {
        console.error("Error testing GenAI model:", error);
        process.exit(1); // Exit
    }
})();

// Passport Spotify Configuration
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
        done(null, user);
    } catch (error) {
        console.error('Error during Spotify login:', error);
        done(error, null);
    }
}));

// Serialize and Deserialize User
passport.serializeUser((user, done) => done(null, user.spotifyId));
passport.deserializeUser(async (spotifyId, done) => {
    try {
        const user = await User.findOne({ spotifyId });
        done(null, user);
    } catch (error) {
        done(error);
    }
});

// Refresh the Spotify access token for a user if it's expired.
const refreshSpotifyToken = async (user) => {
     // Check if the token is valid and not expired
     if (user.tokenExpiration && user.tokenExpiration > new Date()) {
        logger.info('Token is still valid, no refresh needed.');
        return user.accessToken; // Return the existing access token if valid
    }
    logger.info('Token expired or invalid. Attempting to refresh.');

    try {
        // Attempt to refresh the token
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

        // Check if the refresh was successful, returns the new access token
        if (response.data && response.data.access_token) {
            user.accessToken = response.data.access_token;
            const expiresInSeconds = response.data.expires_in || 3600;
            user.tokenExpiration = new Date(Date.now() + expiresInSeconds * 1000); // New expiration date
            await user.save();
            console.log('Token refreshed successfully.');
            return user.accessToken;
        } else {
            console.error('Token refresh failed: No access token received from Spotify.');
            // consider not nulling the user tokens here so you can retry later
            throw new Error('No access token received');
        }
    } catch (error) {
         // Log detailed information about the refresh failure
        console.error('Token Refresh failed:', {
            message: error.message,
            response: error.response ? error.response.data : 'No response',
            status: error.response ? error.response.status : 'Unknown'
        });

        if (user) {
            // Consider not nulling out the user tokens here if you need to retry later.
            // This would help with race conditions if the function is called multiple times at the same time
            user.accessToken = null;
            user.tokenExpiration = null;
            await user.save();
        }
        throw new Error('Failed to refresh token');
    }
};

// Ensure valid Spotify token
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

        req.user = user;
        next();
    }   catch (error) {
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
          jti: uuidv4() // Random ID
      };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

      // Redirect to frontend with JWT in URL fragment
      res.redirect(`${FRONTEND_URL}/#token=${token}`);
  }
);

// Fetch user listening data
app.post('/api/listening-data', ensureValidSpotifyToken, async (req, res) => {
    try {
        // Access user data from req.user
        if (!req.user || !req.user.accessToken) {
            return res.status(401).json({ error: 'User not authenticated or access token missing' });
        }
        const accessToken = req.user.accessToken;

        const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            params: { limit: 20, time_range: 'medium_term' }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching listening data:', error.response ? error.response.data : error.message);
        if (error.response && error.response.status === 401) {
            return res.status(401).json({ error: 'Spotify token expired' }); // Handle token expiration
        }
        res.status(500).json({ error: 'Failed to fetch listening data' });
    }
});

// Generate Summary
app.post('/api/gemini-2.0-flash-exp', ensureValidSpotifyToken, async (req, res) => {
    const { listeningData } = req.body;
    const userId = req.user._id;

    if (!listeningData) {
        return res.status(400).json({ error: 'No listening data provided' });
    }

    try {
        // Check an existing summary for this user
        const existingSummary = await Summary.findOne({ userId });
        if (existingSummary) {
            logger.info(`Returning existing summary for user ${userId}`);
            return res.json({ summary: existingSummary.summaryText });
        }

        const prompt = `Analyze the user's Spotify listening data and create a short, engaging summary. Focus on their top artists, genres, and tracks, and include fun, bite-sized insights. Identify trends or moods in their preferences, and suggest their next favorite genre or artist: ${JSON.stringify(listeningData)}`;
        const result = await model.generateContent(prompt);
        const summaryText = result.response.text();

        // Create and save new summary in the database
        const newSummary = new Summary({
            userId,
            summaryText
        });
        await newSummary.save();
        logger.info(`Generated and saved new summary for user ${userId}`);
        res.json({ summary: summaryText });
    } catch (error) {
        logger.error('Summary Generation Error:', error.message);
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
app.post('/api/logout', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(400).json({ error: 'No authorization token provided' });
      }
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
  
      // Blacklist the token
      const blacklistedToken = new BlacklistedToken({ jti: decoded.jti });
      await blacklistedToken.save();
  
      res.json({ message: 'Logged out successfully.' });
  } catch (error) {
      console.error('Logout failed:', error);
      res.status(500).json({ error: 'Failed to log out' });
  }
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

// Logger
const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.File({ filename: 'app.log' }), // Log to a file
        new transports.Console(), // Log to console
    ]
});

logger.info('Server is starting.');
