// backend/server.js
import { GoogleGenerativeAI } from "@google/generative-ai";
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
import { Summary } from "./models/Summary.js";

const SpotifyStrategy = SpotifyStrategyLib.Strategy;

dotenv.config();
const app = express();

// Cors configuration
app.use(cors({
    origin: 'http://localhost:3000', // TODO: Update with frontend URL in production
    credentials: true,
}));

// Body Parser Middleware
app.use(express.json());

// Passport Middleware
app.use(passport.initialize());

// Environment COnfiguration Validation
const requiredEnvVars = [
    'SPOTIFY_CLIENT_ID', 
    'SPOTIFY_CLIENT_SECRET', 
    'SPOTIFY_CALLBACK_URL', 
    'GOOGLE_API_KEY', 
    'MONGODB_URI',
    'SESSION_SECRET',
    'NODE_ENV' 
];

requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }
});

// Ensure that GOOGLE_API_KEY is defined
if (!process.env.GOOGLE_API_KEY) {
    console.error('Missing GOOGLE_API_KEY in environment variables.');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      candidateCount: 1,
      stopSequences: ["x"],
      maxOutputTokens: 100,
      temperature: 1.0,
    },
  });

const result = await model.generateContent(
  "Tell me a story about a magic backpack.",
);
console.log(result.response.text());

// Connect to MongoDB database
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch((error) => {
    console.error('MongoDB Connection Error:', error);
    process.exit(1); // Exit process if cannot connect to database
});

// Define Mongoose Models (ensure you have these in separate files and import them)
// const User = require('./models/User');
// const Summary = require('./models/Summary');

// Session management
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Passport configuration with enhanced token management
passport.use(new SpotifyStrategy({
    clientID: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    callbackURL: process.env.SPOTIFY_CALLBACK_URL
    }, async (accessToken, refreshToken, expires_in, profile, done) => {
        try {
            // Find or create user in our database
            let user = await User.findOne({ spotifyId: profile.id });

            if (!user) {
                // Create new user if not exists
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
                // Update existing user's tokens
                user.accessToken = accessToken;
                user.refreshToken = refreshToken;
                user.tokenExpiration = new Date(Date.now() + expires_in * 1000);
            }

        await user.save();
        return done(null, user);
        } catch (error) {
            return done(error, null);
        }
    }
));

// Token refresh middleware
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

        // Update user with new access token
        if (response.data.access_token) {
            user.accessToken = response.data.access_token;
            user.tokenExpiration = new Date(Date.now() + (response.data.expires_in || 3600) * 1000);
            await user.save();
            return user.accessToken
        } else {
            throw new Error('No access token received');
        }
    } catch (error) {
        console.error('Token Refresh failed:', {
            message: error.message,
            response: error.response ? error.response.data : 'No response',
            status: error.response ? error.response.status: 'Unknown'
        });

        // If refresh fails, potentially invalidate user session
        if (user) {
            user.accessToken = null;
            user.tokenExpiration = null;
            await user.save()
        }

        throw new Error('Failed to refresh token');
    }
};

// Middleware to check and refresh token before Spotify API Calls
const ensureValidSpotifyToken = async (req, res, next) => {
    try {
        const user = await User.findOne({ accessToken: req.body.accessToken });
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Check if token is expired or about to expire
        if (!user.tokenExpiration || user.tokenExpiration < new Date(Date.now() + 5 * 60 * 1000)) {
            // Refresh token if it's expired or will expire in next 5 minutes
            await refreshSpotifyToken(user);
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Authentication failed' });
    }
};

// Routes
app.get('/auth/spotify',
  passport.authenticate('spotify', { scope: ['user-read-recently-played', 'playlist-modify-public', 'playlist-modify-private'], showDialog: true }),
);

app.get('/auth/spotify/callback', 
  passport.authenticate('spotify', { failureRedirect: '/login' }),
  function(req, res) {
    // Instead of passing token in URL, use secure method
    res.cookie('spotify_access_token', req.user.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    res.redirect('http://localhost:5172');
  }
);

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

// Fetch user listening data
app.post('/api/listening-data', ensureValidSpotifyToken, async (req, res) => {
    const { accessToken } = req.body;
    try {
        const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            params: { limit: 10, time_range: 'medium_term' }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching listening data:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch listening data' });
    }
});

// Generate Summary
// model api = gemini-2.0-flash-exp
app.post('/api/gemini-1.5-flash', async (req, res) => {
    const { listeningData } = req.body;

    // Validate input
    if (!listeningData) {
        return res.status(400).json({ error: 'No listening data provided' });
    }

    try {
        const prompt = `Provide a summary of the following listening data: ${JSON.stringify(listeningData)}`;
        const response = await axios.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GOOGLE_API_KEY}',
        {
            contents: [{
                parts: [{ text: prompt }]
            }]
        },
        {
            headers: { 
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30-second timeout
        }
        );

        // More robust response extraction
        const summary = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!summary) {
            return res.status(500).json({error: 'Failed to generate summary'})
        }

        res.json({ summary });
    } catch (error) {
        console.error('Detailed Summary Generation Error:', {
            message: error.message,
            response: error.response ? error.response.data : 'No response',
            status: error.response ? error.response.status : 'Unknown'
        });

        res.status(500).json({
            error: 'Failed to generate summary',
            details: error.message
        });
    }
});

// API Route to generate audio
app.post('/api/gemini-1.5-flash', async (req, res) => {
    const { summary } = req.body;
    try {
        const response = await axios.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GOOGLE_API_KEY}', {
            text: summary,
            voice: 'en-US-Standard-B' // Example voice parameter
        }, {
            headers: { 'Authorization': `Bearer ${process.env.TTS_API_KEY}` },
            responseType: 'arraybuffer'
        });
        // Convert binary data to base64
        const audioBuffer = Buffer.from(response.data, 'binary').toString('base64');
        res.json({ audio: `data:audio/mp3;base64,${audioBuffer}` });
    } catch (error) {
        console.error('Error generating audio:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to generate audio' });
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

// Serialization for session management
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
