import mongoose from 'mongoose';

// Summary Schema
const summarySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    summaryText: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

export const Summary = mongoose.model('Summary', summarySchema);