const mongoose = require('mongoose');
const zlib = require('zlib');

const FactSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    rawQuote: { type: String, default: '' },
    location: { type: String, default: 'General' }
  },
  { _id: false }
);

const RedirectHopSchema = new mongoose.Schema(
  {
    fromUrl: { type: String, required: true },
    toUrl: { type: String, required: true },
    statusCode: { type: Number, required: true }
  },
  { _id: false }
);

const SnapshotSchema = new mongoose.Schema(
  {
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Source', required: true, index: true },
    capturedAt: { type: Date, default: Date.now, index: true },
    httpStatus: { type: Number },
    finalUrl: { type: String, required: true },
    redirectChain: [RedirectHopSchema],
    rawHtmlHash: { type: String },
    rawHtml: { type: Buffer }, // gzipped buffer
    mainText: { type: String },
    facts: [FactSchema],
    screenshotPath: { type: String, default: null },
    outcome: { type: String, required: true }
  },
  { timestamps: true }
);

// Helper method to set raw HTML as gzipped buffer
SnapshotSchema.methods.setRawHtml = function (htmlString) {
  if (htmlString) {
    this.rawHtml = zlib.gzipSync(Buffer.from(htmlString, 'utf-8'));
  } else {
    this.rawHtml = null;
  }
};

// Helper method to get decompressed raw HTML string
SnapshotSchema.methods.getRawHtmlString = function () {
  if (!this.rawHtml) return '';
  try {
    return zlib.gunzipSync(this.rawHtml).toString('utf-8');
  } catch (err) {
    return '';
  }
};

module.exports = mongoose.model('Snapshot', SnapshotSchema);
