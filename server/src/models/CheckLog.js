const mongoose = require('mongoose');

const CheckLogSchema = new mongoose.Schema(
  {
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Source', required: true, index: true },
    at: { type: Date, default: Date.now, index: true },
    outcome: { type: String, required: true },
    classification: { type: String, required: true },
    reasons: [{ type: String }],
    durationMs: { type: Number, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CheckLog', CheckLogSchema);
