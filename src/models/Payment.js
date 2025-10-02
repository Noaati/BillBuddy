const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', index: true },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember', required: true, index: true },
    paidTo: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember', required: true, index: true },
    amount:  { type: Number, required: true }
  },
  {
    timestamps: true,            // createdAt, updatedAt
    versionKey: false,
    collection: 'payments',
  }
);

module.exports = mongoose.model('Payment', paymentSchema);
