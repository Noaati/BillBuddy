const mongoose = require('mongoose');

const groupMemberSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', index: true },
    member: { type: String, ref: 'Account', default: null, index: true },
    email:  { type: String, lowercase: true, trim: true, required: true, index: true },
    name:   { type: String, trim: true },
    active: { type: Boolean, default: true }
  },
  {
    timestamps: true,            // createdAt, updatedAt
    versionKey: false,
    collection: 'group_members',
  }
);

groupMemberSchema.index(
  { group: 1, member: 1 },
  { unique: true, partialFilterExpression: { member: { $type: 'string' } } }
);

groupMemberSchema.index(
  { group: 1, email: 1 },
  { unique: true, partialFilterExpression: { member: null } }
);

module.exports = mongoose.model('GroupMember', groupMemberSchema);
