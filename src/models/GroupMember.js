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

groupMemberSchema.post('updateOne', async function (_res, next) {
  try {
    const doc = await this.model.findOne(this.getQuery()).select('group').lean();
    if (doc) {
      const sess = this.getOptions()?.session;
      await recomputeGroupActive(doc.group, sess);
    }
    next();
  } catch (e) { next(e); }
});

groupMemberSchema.post('updateMany', async function (_res, next) {
  try {
    const doc = await this.model.findOne(this.getQuery()).select('group').lean();
    if (doc) {
      const sess = this.getOptions()?.session;
      await recomputeGroupActive(doc.group, sess);
    }
    next();
  } catch (e) { next(e); }
});

async function recomputeGroupActive(groupId, session) {
  const GroupMember = require('mongoose').model('GroupMember');
  const Group = require('mongoose').model('Group');

  let q = GroupMember.countDocuments({ group: groupId, active: true });
  if (session) q = q.session(session);
  const cnt = await q;

  let u = Group.updateOne({ _id: groupId }, { $set: { active: cnt > 0 } });
  if (session) u = u.session(session);
  await u;
}


module.exports = mongoose.model('GroupMember', groupMemberSchema);
