//  backend/models/BlacklistedToken.js
import mongoose from 'mongoose';

const blacklistedTokenSchema = new mongoose.Schema({
    jti: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: '7d' // tokens auto-delete after 7 days
    }
});

export const BlacklistedToken = mongoose.model('BlacklistedToken', blacklistedTokenSchema);