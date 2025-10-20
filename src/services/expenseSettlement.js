const mongoose = require('mongoose');

async function recomputeExpenseSettled(expenseId, session) {
  const id = typeof expenseId === 'string' ? new mongoose.Types.ObjectId(expenseId) : expenseId;

  const ExpenseShare = mongoose.model('ExpenseShare');
  const Expense = mongoose.model('Expense');

  let query = ExpenseShare.countDocuments({
    expense: id,
    status: { $ne: 'Fully Paid' }
  });

  if (session) query = query.session(session);

  const openCount = await query.exec();

  await Expense.findByIdAndUpdate(
    id,
    { settled: openCount === 0 },
    { session }
  );
}

module.exports = { recomputeExpenseSettled };
