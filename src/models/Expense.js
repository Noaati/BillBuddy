const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', index: true },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember', required: true, index: true },
    amount:  { type: Number, required: true },
    description:   { type: String, trim: true },
    settled: { type: Boolean, default: false }
  },
  {
    timestamps: true,            // createdAt, updatedAt
    versionKey: false,
    collection: 'expenses',
  }
);

module.exports = mongoose.model('Expense', expenseSchema);
