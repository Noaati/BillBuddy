const mongoose = require('mongoose');
const STATUSES = [ 'Not Paid', 'Partially Paid', 'Fully Paid' ];
const { recomputeExpenseSettled } = require('../services/expenseSettlement');

const expenseShareSchema = new mongoose.Schema(
  {
    expense: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', index: true },
    owes: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember', required: true, index: true },
    amount:  { type: Number, required: true },
    status:   { type: String, trim: true, enum: STATUSES, default: 'Not Paid' },
    paid: { type: Number, required: true },
  },
  {
    timestamps: true,            // createdAt, updatedAt
    versionKey: false,
    collection: 'expense_shares',
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

expenseShareSchema.virtual('leftToPay').get(function () {
  const left = round2(this.amount) - round2(this.paid);
  return left > 0 ? round2(left) : 0;
});

expenseShareSchema.pre('save', function(next){
  const left = this.leftToPay;
  this.status = left <= 0
    ? 'Fully Paid'
    : (this.paid > 0 ? 'Partially Paid' : 'Not Paid');
  next();
});

expenseShareSchema.post('save', async function (doc, next) {
  try {
    const sess = (typeof this.$session === 'function') ? this.$session() : undefined;
    await recomputeExpenseSettled(doc.expense, sess);
    next();
  } catch (e) { next(e); }
});

expenseShareSchema.post('findOneAndUpdate', async function (_res, next) {
  try {
    const doc = await this.model.findOne(this.getQuery()).select('expense').lean();
    if (doc) {
      const sess = this.getOptions()?.session;
      await recomputeExpenseSettled(doc.expense, sess);
    }
    next();
  } catch (e) { next(e); }
});

expenseShareSchema.post('findOneAndDelete', async function (doc, next) {
  try {
    if (doc) {
      const sess = this.getOptions()?.session;
      await recomputeExpenseSettled(doc.expense, sess);
    }
    next();
  } catch (e) { next(e); }
});


module.exports = mongoose.model('ExpenseShare', expenseShareSchema);