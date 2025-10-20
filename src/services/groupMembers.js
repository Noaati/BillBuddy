const GroupMember = require('../models/GroupMember');
const Account = require('../models/Account');

async function upsertGroupMemberByEmail({ groupId, email, name = '', session }) {
  const normEmail = String(email || '').trim().toLowerCase();
  if (!groupId || !normEmail) throw new Error('groupId and email are required');

  const acc = await Account.findOne({ email: normEmail })
    .select('_id firstName lastName email')
    .lean();

  if (acc?._id) {
    const displayName =
      name.trim() ||
      `${acc.firstName || ''} ${acc.lastName || ''}`.trim() ||
      normEmail.split('@')[0];

    const doc = await GroupMember.findOneAndUpdate(
      { group: groupId, member: String(acc._id) },
      {
        $setOnInsert: { group: groupId, member: String(acc._id), email: normEmail },
        $set: { active: true, name: displayName },
      },
      { new: true, upsert: true, session }
    );

    const reactivated = !!doc && doc.active === true;
    return { doc, created: doc?.wasNew, reactivated };
  }

  const displayName = name.trim() || normEmail.split('@')[0];

  const doc = await GroupMember.findOneAndUpdate(
    { group: groupId, member: null, email: normEmail },
    {
      $setOnInsert: { group: groupId, member: null, email: normEmail },
      $set: { active: false, name: displayName },
    },
    { new: true, upsert: true, session }
  );

  return { doc, created: doc?.wasNew, reactivated: false };
}

module.exports = { upsertGroupMemberByEmail };
