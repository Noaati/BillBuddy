const mongoose = require('mongoose');
const autopopulate = require('mongoose-autopopulate');
const { ALLOWED_CURRENCIES } = require('../config/currencies');

const groupSchema = new mongoose.Schema(
  {
    ownerId: { type: String, index: true, required: true },
    name: { type: String, trim: true },
    active: { type: Boolean, default: true },
    currency: {
      type: String,
      enum: ALLOWED_CURRENCIES,
      required: true,
      trim: true,
      uppercase: true,
      default: 'USD'
    },
    image: { type: String, trim: true },
    inviteToken: { type: String, index: true, unique: true, sparse: true }
  },
  {
    timestamps: true,            // createdAt, updatedAt
    versionKey: false,
    collection: 'groups',
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

groupSchema.plugin(autopopulate);
groupSchema.virtual('numberOfMembers', {
  ref: 'GroupMember',
  localField: '_id',
  foreignField: 'group',
  match: { active: true },
  count: true,
  autopopulate: true
});

module.exports = mongoose.model('Group', groupSchema);
