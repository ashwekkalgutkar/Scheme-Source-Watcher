const mongoose = require('mongoose');

const ChangeItemSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    key: { type: String, required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    beforeQuote: { type: String, default: '' },
    afterQuote: { type: String, default: '' },
    location: { type: String, default: 'General' }
  },
  { _id: false }
);

const ReviewItemSchema = new mongoose.Schema(
  {
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Source', required: true, index: true },
    type: {
      type: String,
      enum: ['meaningful_change', 'text_changed', 'source_moved', 'source_dead', 'source_blocked'],
      required: true,
      index: true
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium'
    },
    status: {
      type: String,
      enum: ['open', 'accepted', 'dismissed'],
      default: 'open',
      index: true
    },
    changes: [ChangeItemSchema],
    beforeSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Snapshot', default: null },
    afterSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Snapshot', default: null },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: null },
    dismissReason: { type: String, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReviewItem', ReviewItemSchema);
