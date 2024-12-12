import mongoose from 'mongoose';

// User Schema
const UserSchema = new mongoose.Schema({
    spotifyId: { type: String, required: true, unique: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    tokenExpiration: { type: Date },
    profile: { type: Object },
    email: { type: String },
    displayName: { type: String }
})

export const Summary = mongoose.model('Summary', UserSchema);

