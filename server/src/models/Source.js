const mongoose = require('mongoose');

const SourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    originalUrl: { type: String, required: true },
    currentUrl: { type: String, required: true },
    checkIntervalMinutes: { type: Number, default: 60 },
    status: {
      type: String,
      enum: ['active', 'blocked', 'dead', 'moved'],
      default: 'active'
    },
    lastCheckedAt: { type: Date },
    lastOutcome: { type: String },
    etag: { type: String },
    lastModified: { type: String },
    retryAfterUntil: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Source', SourceSchema);
