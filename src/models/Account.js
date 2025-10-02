const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    firstName: { type: String, trim: true },
    lastName:  { type: String, trim: true },
    email:     { type: String, trim: true, lowercase: true, index: true },
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true, // createdAt, updatedAt
    versionKey: false,
    collection: 'accounts',
  }
);

module.exports = mongoose.model('Account', accountSchema);