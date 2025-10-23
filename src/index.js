require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const connectDB = require('./config/db');
const admin = require('./firebaseAdmin');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
let nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { Types } = mongoose;
const { upsertGroupMemberByEmail } = require('./services/groupMembers');

//Models
const Expense = require('./models/Expense');
const ExpenseShare = require('./models/ExpenseShare');
const Payment = require('./models/Payment');
const Account = require('./models/Account'); 
const Group = require('./models/Group');
const GroupMember = require('./models/GroupMember');

app.head('/health', (req, res) => {
  res.status(200).send('OK');
});

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const allowed = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowed,
  credentials: true,
}));

app.use(express.json());
const PORT = process.env.PORT || 5000;

async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [, token] = authHeader.split(' ');
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (e) {
    console.error('verifyFirebaseToken error:', e.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

const uploadDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
app.use('/uploads', express.static(uploadDir));

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// Routes

// Creates or updates the signed-in user’s Account
app.post('/api/accounts/init', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid, email } = req.user;
    const { firstName = '', lastName = '' } = req.body || {};

    const update = {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: email || null,
      updatedAt: new Date(),
    };

    const account = await Account.findOneAndUpdate(
      { _id: uid },
      { $setOnInsert: { _id: uid, createdAt: new Date() }, $set: update },
      { new: true, upsert: true }
    );

    return res.json({ ok: true, account });
  } catch (err) {
    console.error('init account error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Returns the signed-in user’s Account details.
app.get('/api/accounts/current', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const account = await Account.findById(uid);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ account });
  } catch (err) {
    console.error('get account error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Creates a new group or updates an existing one owned by the user.
app.post('/api/groups/init', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const { groupId = null, groupName = '', currencyCode, imageUrl = null, inviteToken = null } = req.body || {};

    const doc = {
      ownerId: uid,
      name: String(groupName).trim(),
      currency: String(currencyCode || 'USD').toUpperCase(),
      image: imageUrl || null,
      active: true,
      ...(inviteToken ? { inviteToken } : {})
    };

    let group;

    if (groupId) {
      group = await Group.findOneAndUpdate(
        { _id: groupId, ownerId: uid },
        { $set: doc },
        { new: true, upsert: true }
      );
    } else {
      group = await Group.create(doc);
    }

    return res.json({ ok: true, group });
  } catch (err) {
    console.error('create/update group error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Adds multiple members to a group and send emails to unregistered ones).
app.post('/api/groups/:groupId/members/bulk', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const inviter = await Account.findById(uid).lean();
    const { groupId } = req.params;
    const { invites = [] } = req.body || {};

    const cleaned = Array.isArray(invites)
      ? invites
          .map(i => ({
            name:  (i?.name || '').trim(),
            email: (i?.email || '').trim().toLowerCase(),
          }))
          .filter(i => i.name && i.email)
      : [];

    if (!cleaned.length) return res.json({ ok: true, result: null });

    const inviterName = [inviter?.firstName, inviter?.lastName].filter(Boolean).join(' ') || 'Member';

    const uniqueByEmail = Array.from(
      new Map(cleaned.map(x => [x.email, x])).values()
    );

    const results = [];
    for (const inv of uniqueByEmail) {
      const r = await upsertGroupMemberByEmail({
        groupId,
        email: inv.email,
        name: inv.name,
        inviterName,
      });
      results.push(r);

      if (!r.accountId && r.active === false) {
        console.log('[invite email] sending to:', r.email);
        const body = `Hi ${r.name || ''},\n\nYou've been invited by ${inviterName} to a BillBuddy group.`;
        try {
          await sendEmail(r.email, 'BillBuddy Invite', body);
        } catch (e) {
          console.error('[invite email] FAILED:', r.email, e?.message || e);
        }
      }
    }

    return res.json({
      ok: true,
      upserts: results.map(r => ({
        memberId: r.memberId,
        email: r.email,
        active: r.active,
        created: r.created,
        updated: r.updated,
        accountId: r.accountId || null,
      })),
    });
  } catch (err) {
    console.error('bulk add members error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Link pending email invites to the current user (set member=uid, active=true)
app.post('/api/invites/claim', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid, email } = req.user;

    const cleanEmail = String(email).trim().toLowerCase();
    const result = await GroupMember.updateMany(
      { member: null, email: cleanEmail },
      { $set: { member: uid, active: true } }
    );

    res.json({
      ok: true,
      matched: result.matchedCount ?? result.n,
      modified: result.modifiedCount ?? result.nModified
    });
  } catch (err) {
    console.error('claim invites error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get the current user's groups
app.get('/api/groups', verifyFirebaseToken, async (req, res) => {
  try {
    const status = (req.query.status || 'active').toLowerCase();
    const { uid } = req.user;

    const memberDocs = await GroupMember.find(
      { member: uid, active: true },
      { group: 1 }
    ).lean();

    const groupIds = [
      ...new Set([
        ...memberDocs.map(d => String(d.group)),
      ])
    ].map(id => require('mongoose').Types.ObjectId.createFromHexString(id));

    if (!groupIds.length) return res.json({ ok: true, groups: [] });

    const groupFilter = { _id: { $in: groupIds } };
    if (status === 'active') groupFilter.active = true;

    const groups = await Group.find(
        groupFilter,
        { name: 1, image: 1, currency: 1, active: 1 }
    )
    .populate('numberOfMembers')
    .sort({ active: -1, createdAt: -1 })
    .lean({ virtuals: true });

    const payload = groups.map(g => ({
      id: g._id,
      name: g.name,
      image: g.image || null,
      currency: g.currency || 'USD',
      active: !!g.active,
      numberOfMembers: g.numberOfMembers ?? 0
    }));

    const hasArchived = await Group.exists({ _id: { $in: groupIds }, active: false });

    res.json({ ok: true, groups: payload, hasArchived: !!hasArchived });
  } catch (err) {
    console.error('list groups error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get active members (with Accounts) of a group.
app.get('/api/groups/:groupId/members', verifyFirebaseToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    const membersDocs = await GroupMember.find(
      { group: groupId, active: true },
      { _id: 1, member: 1, name: 1, email: 1, active: 1 }
    ).lean();

    const memberIds = membersDocs
      .map(d => d.member)
      .filter(Boolean);

    let accountsById = new Map();
    if (memberIds.length) {
      const accounts = await Account.find(
        { _id: { $in: memberIds } },
        { _id: 1, firstName: 1, lastName: 1, email: 1 }
      ).lean();
      accountsById = new Map(accounts.map(a => [String(a._id), a]));
    }

    const members = membersDocs.map(d => {
      const acc = d.member ? accountsById.get(String(d.member)) : null;
      const fullName = acc
        ? `${acc.firstName || ''} ${acc.lastName || ''}`.trim()
        : (d.name || '').trim();

      return {
        id: String(d._id),
        accountId: d.member ? String(d.member) : null,
        name: fullName || (acc?.email || d.email || 'Member'),
        email: acc?.email || d.email || null,
        active: !!d.active,
      };
    });

    res.json({ ok: true, members });
  } catch (err) {
    console.error('get group members error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Creates a new expense record.
app.post('/api/expenses/init', verifyFirebaseToken, async (req, res) => {
  try {
    const { group, paidBy, amount, description, settled = false } = req.body || {};

    const expense = await Expense.create({ group, paidBy, amount, description, settled });
    return res.json({ ok: true, expense });
  } catch (err) {
    console.error('create/update expense error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Inserts expense shares in bulk and auto-offsets against prior debts/credits.
app.post('/api/expenses/:expense/shares/bulk', verifyFirebaseToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { expense } = req.params;
    const { shares = [] } = req.body || {};

    console.log('shares:', shares);

    if (!Array.isArray(shares) || shares.length === 0) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ ok: false, error: 'No shares provided' });
    }

    const exp = await Expense.findById(expense).select('paidBy amount').lean();
    if (!exp){
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ ok: false, error: 'Expense not found' });
    } 
    const payerId = String(exp.paidBy);
    const totalExpense = Number(exp.amount) || 0;

    if (!Array.isArray(shares) || shares.length === 0) {
      return res.status(400).json({ ok: false, error: 'No shares provided' });
    }

    const docs = shares.map(s => {
      const amount = Number(s.amount) || 0;
      const isPayer = String(s.owes) === payerId;
      const paid   = isPayer ? totalExpense : 0;
      return {
        expense,
        owes: s.owes,
        amount,
        paid,
        status: paid >= amount ? 'Fully Paid' : (paid > 0 ? 'Partially Paid' : 'Not Paid')
      };
    });

    const inserted = await ExpenseShare.insertMany(docs, { ordered: false, session });

    const offsetResult = await autoOffsetNewExpenseShares({
      expenseId: expense,
      payerId,
      session,
    });

    await session.commitTransaction();
    session.endSession();

    return res.json({
      ok: true,
      inserted: inserted.length,
      offsetsApplied: offsetResult?.totalApplied || 0,
      offsetDetails:  offsetResult?.offsets || [],
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('create share error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Returns group details, including computed number of members.
app.get('/api/groups/:groupId', verifyFirebaseToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId)
      .populate('numberOfMembers')
      .lean({ virtuals: true });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    return res.json({ ok: true, group });
  } catch (err) {
    console.error('get group error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Returns a group’s expenses with payer info.
app.get('/api/expenses/:groupId', verifyFirebaseToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    const expenses = await Expense
      .find({ group: groupId })
      .sort({ createdAt: -1 })
      .populate({
        path: 'paidBy',
        select: 'name member',
        populate: {
          path: 'member',
          model: 'Account',
          select: 'firstName lastName'
        }
      })
      .lean();

    return res.json({ ok: true, expenses });
  } catch (err) {
    console.error('get group error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Returns all shares for a specific expense.
app.get('/api/expenses/:expenseId/shares', verifyFirebaseToken, async (req, res) => {
  try {
    const { expenseId } = req.params;

    const docs = await ExpenseShare.find({ expense: expenseId })
      .select('owes amount paid status')
      .populate({
        path: 'owes',
        select: 'name member',
        populate: {
          path: 'member',
          model: 'Account',
          select: 'firstName lastName'
        }
      })
      .lean();

    return res.json({ ok: true, docs });
  } catch (err) {
    console.error('get expense shares error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});


// Computes balances: who you owe / who owes you.
app.get('/api/groups/:groupId/payees', verifyFirebaseToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { uid } = req.user;
    const direction = String(req.query.direction || '').toLowerCase(); // '', 'you-owe', 'owed-to-you', 'both'

    const currMember = await GroupMember.findOne(
      { group: groupId, member: uid, active: true },
      { _id: 1 }
    ).lean();
    if (!currMember) {
      const emptyNew = { ok: true, youOwe: [], othersOweYou: [], totals: { youOwe: 0, owedToYou: 0 } };
      return direction === 'both' ? res.json(emptyNew) : res.json({ ok: true, payees: [] });
    }

    async function buildYouOwe() {
      const expenses = await Expense.find({
        group: groupId,
        settled: false,
        paidBy: { $ne: currMember._id }
      }).select('_id').lean();
      const expenseIds = expenses.map(e => e._id);
      if (!expenseIds.length) return { list: [], total: 0 };

      const docs = await ExpenseShare.find({
        expense: { $in: expenseIds },
        owes: currMember._id,
        $expr: { $lt: ['$paid', '$amount'] }
      })
        .select('_id owes amount paid expense')
        .populate({
          path: 'owes',
          select: 'name member',
          populate: { path: 'member', model: 'Account', select: 'firstName lastName' }
        })
        .populate({
          path: 'expense',
          select: 'paidBy group description createdAt',
          populate: {
            path: 'paidBy',
            select: 'name member',
            populate: { path: 'member', model: 'Account', select: 'firstName lastName' }
          }
        })
        .lean({ virtuals: true });

      const byPayee = new Map();
      let total = 0;

      for (const d of docs) {
        const p = d?.expense?.paidBy;
        if (!p?._id) continue;

        const id = String(p._id);
        const name =
          p.name ||
          [d.expense?.paidBy?.member?.firstName, d.expense?.paidBy?.member?.lastName].filter(Boolean).join(' ') ||
          'Member';

        const left = Math.max(0, Number(d.leftToPay ?? (d.amount - d.paid)) || 0);
        if (left <= 0) continue;

        const acc = byPayee.get(id) || { memberId: id, name, totalLeft: 0, shares: [] };
        acc.totalLeft = +(acc.totalLeft + left).toFixed(2);

        acc.shares.push({
          shareId: String(d._id),
          expenseId: String(d.expense._id),
          description: d.expense.description || '',
          date: d.expense.createdAt,
          amount: Number(d.amount) || 0,
          paid: Number(d.paid) || 0,
          leftToPay: +left.toFixed(2),
        });

        byPayee.set(id, acc);
        total = +(total + left).toFixed(2);
      }

      const list = Array.from(byPayee.values()).sort((a, b) => b.totalLeft - a.totalLeft);
      return { list, total };
    }

    async function buildOwedToYou() {
      const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : null);
      const expenses = await Expense.find({
        group: groupId,
        settled: false,
        paidBy: currMember._id
      }).select('_id').lean();
      const expenseIds = expenses.map(e => e._id);
      if (!expenseIds.length) return { list: [], total: 0 };

      const docs = await ExpenseShare.find({
        expense: { $in: expenseIds },
        owes: { $ne: currMember._id },
        $expr: { $lt: ['$paid', '$amount'] }
      })
        .select('_id owes amount paid expense')
        .populate({
          path: 'owes',
          model: 'GroupMember',
          select: 'name member email',
          populate: { path: 'member', model: 'Account', select: 'firstName lastName email' }
        })
        .populate({ path: 'expense', select: 'paidBy group description createdAt' })
        .lean({ virtuals: true });

      const byDebtor = new Map();
      let total = 0;

      for (const d of docs) {
        const o = d?.owes;
        if (!o?._id) continue;

        const id = String(o._id);
        const name =
          o.name ||
          [o.member?.firstName, o.member?.lastName].filter(Boolean).join(' ') ||
          'Member';

        const email = norm(o?.email) || norm(o?.member?.email);

        const left = Math.max(0, Number(d.leftToPay ?? (d.amount - d.paid)) || 0);
        if (left <= 0) continue;

        const acc = byDebtor.get(id) || { memberId: id, name, email, totalLeft: 0, shares: [] };
        if (!acc.email && email) acc.email = email;
        acc.totalLeft = +(acc.totalLeft + left).toFixed(2);

        acc.shares.push({
          shareId: String(d._id),
          expenseId: String(d.expense._id),
          description: d.expense.description || '',
          date: d.expense.createdAt,
          amount: Number(d.amount) || 0,
          paid: Number(d.paid) || 0,
          leftToPay: +left.toFixed(2),
        });

        byDebtor.set(id, acc);
        total = +(total + left).toFixed(2);
      }

      const list = Array.from(byDebtor.values()).sort((a, b) => b.totalLeft - a.totalLeft);
      return { list, total };
    }

    if (direction === 'both') {
      const youOweRes = await buildYouOwe();
      const owedToYouRes = await buildOwedToYou();
      return res.json({
        ok: true,
        youOwe: youOweRes.list,
        othersOweYou: owedToYouRes.list,
        totals: { youOwe: youOweRes.total, owedToYou: owedToYouRes.total }
      });
    } else {
      const base = direction === 'owed-to-you' ? await buildOwedToYou() : await buildYouOwe();
      const payees = base.list.map(x => ({
        payeeId: x.memberId,
        name: x.name,
        email: x.email || null,
        totalLeft: x.totalLeft,
        shares: x.shares
      }));
      return res.json({ ok: true, payees });
    }

  } catch (err) {
    console.error('get payees/balances error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Creates a payment, allocates the amount to expense shares and updates balances.
app.post('/api/groups/:groupId/payments', verifyFirebaseToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { groupId } = req.params;
    const { uid } = req.user;
    const { payeeId, totalAmount, shareIds } = req.body || {};

    if (!payeeId) return res.status(400).json({ ok: false, error: 'payeeId is required' });
    if (!(totalAmount > 0)) return res.status(400).json({ ok: false, error: 'amount must be > 0' });

    const currMember = await GroupMember.findOne(
      { group: groupId, member: uid, active: true },
      { _id: 1 }
    ).lean();
    let amountApplied = 0, updates = [];

    const [paymentDoc] = await Payment.create([{
      group: groupId,
      paidBy: currMember._id,
      paidTo: payeeId,
      amount: totalAmount,
    }], { session });

    const hasSelected = Array.isArray(shareIds) && shareIds.length > 0;

    let shares;
    if (hasSelected) {
      shares = await fetchSelectedShares({
        shareIds,
        payeeId,
        groupId,
      });
      if (shares.length === 0) throw new Error('No selected shares');
      const resFull = await fullySettleSelectedShares({ shares, session });
      amountApplied = resFull.amountApplied;
      updates = resFull.updates;
    } else {
        shares = await fetchCandidateSharesForCustom({
          groupId,
          owesId: currMember._id,
          payeeId,
        });
        if (shares.length === 0) throw new Error('No shares found');
        const alloc = await allocateAmountOverShares({ total: totalAmount, shares, session });
          amountApplied = alloc.amountApplied;
          updates = alloc.updates;
    }
    const perExpense = new Map();
    for (const u of updates) {
      const key = String(u.expenseId);
      const sum = perExpense.get(key) || 0;
      perExpense.set(key, round2(sum + Number(u.applied || 0)));
    }

    for (const [expenseId, reduceBy] of perExpense.entries()) {
      await reducePayerSharePaid({ expenseId, reduceBy, session });
    }
    await session.commitTransaction();
    session.endSession();

    return res.json({
      ok: true,
      paymentId: String(paymentDoc._id),
      amountSent: totalAmount,
      amountApplied,
      updatedShares: updates,
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('create payment error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Returns a group's payments.
app.get('/api/payments/:groupId', verifyFirebaseToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    const payments = await Payment
      .find({ group: groupId })
      .sort({ createdAt: -1 })
      .populate({
        path: 'paidBy',
        select: 'name member',
        populate: {
          path: 'member',
          model: 'Account',
          select: 'firstName lastName'
        }
      })
      .populate({
        path: 'paidTo',
        select: 'name member',
        populate: {
          path: 'member',
          model: 'Account',
          select: 'firstName lastName'
        }
      })
      .lean();

    return res.json({ ok: true, payments });
  } catch (err) {
    console.error('get payments error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Sends a reminder email.
app.post('/api/email/remind', verifyFirebaseToken, async (req, res) => {
  try {
    const { to, subject, text } = req.body || {};
    console.log(to);
    console.log(subject);
        console.log(text);

    if (!to || !subject || !text) {
      return res.status(400).json({ error: 'to, subject, text are required' });
    }
    await sendEmail(to, subject, text);
    res.json({ ok: true });
  } catch (err) {
    console.error('send reminder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Deactivates multiple GroupMember.
app.post('/api/members/deactivate-bulk', verifyFirebaseToken, async (req, res) => {
  try {
    const { memberIds = [] } = req.body;
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'must have memberIds' });
    }

    const r = await GroupMember.updateMany(
      { _id: { $in: memberIds } },
      { $set: { active: false } }
    );

    return res.json({ ok: true, modifiedCount: r.modifiedCount });
  } catch (err) {
    console.error('deactivate-bulk error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Deactivate/activate group.
app.post('/api/groups/:groupId/updateActive', verifyFirebaseToken, async (req, res) => {
  try {
    const { active } = req.body;
    const { groupId } = req.params;

    const g = await Group.findByIdAndUpdate(
      groupId,
      { $set: { active: active } },
      { new: true }
    );

    if (!g) return res.status(404).json({ error: 'Group not found' });
    return res.json({ ok: true, groupId: String(g._id), active: g.active });
  } catch (err) {
    console.error('deactivate group error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Accepts a group invite token and adds/activates the current user as a member.
app.post('/api/invite/accept', verifyFirebaseToken, async (req, res) => {
  try {
    const { token } = req.body;
    const { uid, email: tokenEmail } = req.user;

    const g = await Group.findOne(
      { inviteToken: token },
      { _id: 1, active: 1 }
    ).lean();
    if (!g) return res.status(404).json({ error: 'Group not found' });

    const acc = await Account.findById(uid).select('firstName lastName email').lean();
    const email = (acc?.email || tokenEmail || '').trim().toLowerCase();
    const name =
      `${acc?.firstName || ''} ${acc?.lastName || ''}`.trim() ||
      (email ? email.split('@')[0] : 'Member');

    await upsertGroupMemberByEmail({
      groupId: g._id,
      email,
      name,
      accountId: uid,
      forceActive: true,
    });

    return res.json({ ok: true, groupId: String(g._id) });
  } catch (err) {
    console.error('Failed to accept group invite:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Returns a list of other members from the current user's groups.
app.get('/api/myMembers', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user;

    const myMemberships = await GroupMember.find(
      { member: uid, active: true },
      { group: 1, _id: 1 }
    ).lean();

    const groupIds = myMemberships.map(m => m.group).filter(Boolean);
    if (!groupIds.length) return res.json({ contacts: [] });

    const myMemberIds = new Set(myMemberships.map(m => String(m._id)));
    console.log('groupIds:', groupIds); 

    const docs = await GroupMember.find(
      {
        group: { $in: groupIds },
        _id: { $nin: Array.from(myMemberIds) }
      },
      { name: 1, email: 1, member: 1, updatedAt: 1 }
    )
    .populate({ path: 'member', model: 'Account', select: 'firstName lastName email' })
    .sort({ updatedAt: -1 })
    .lean();

    console.log(`docs`, docs);

    const seen = new Set();
    const contacts = [];
    for (const d of docs) {
      const email = (d.email || d.member?.email || '').trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);

      const fullName =
        d.name ||
        `${d.member?.firstName || ''} ${d.member?.lastName || ''}`.trim() ||
        email.split('@')[0];

      contacts.push({ name: fullName, email });
      if (contacts.length >= 50) break;
    }

    return res.json({ contacts });
  } catch (err) {
    console.error('[myMembers] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});


// Deactivates membership in the specified group.
app.post('/api/groups/:groupId/leave', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const { groupId } = req.params;

    const current = await GroupMember.findOne({ group: groupId, member: uid }).lean();

    const r = await GroupMember.updateOne(
      { _id: current._id },
      { $set: { active: false } }
    );

    return res.json({
      ok: true,
      left: true,
      memberId: String(current._id),
      modifiedCount: r.modifiedCount ?? r.nModified ?? 0
    });
  } catch (err) {
    console.error('[leave group] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});


////////////
const metaRoutes = require('./routes/meta');
app.use('/api/meta', metaRoutes);

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to DB:', err.message);
});

async function sendEmail(recipientEmail, subject = 'BillBuddy Invite', text = 'Join my group on BillBuddy') {
  console.log('[sendEmail] start ->', recipientEmail);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    const verifyRes = await transporter.verify();
    console.log('[mailer] verify:', verifyRes);
  } catch (e) {
    console.error('[mailer] verify FAILED:', e);
    throw e;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: recipientEmail,
    subject,
    text,
    html: `<p>${text}</p>`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[mailer] sent:', info.messageId, info.response || '');
    return info;
  } catch (err) {
    console.error('[mailer] send FAILED:', err);
    throw err;
  }
}

async function autoOffsetNewExpenseShares({ expenseId, session }) {
  const exp = await Expense.findById(expenseId)
    .select('group paidBy')
    .session(session)
    .lean();
  if (!exp) return { totalOffsetsApplied: 0, details: [] };

  const payerId = exp.paidBy;
  const groupId = exp.group;

  let qNew = ExpenseShare.find({
    expense: expenseId,
    owes: { $ne: payerId },
    $expr: { $lt: ['$paid', '$amount'] },
  }).populate({ path: 'expense', select: 'createdAt' });
  if (session) qNew = qNew.session(session);
  const newShares = await qNew.exec();

  const byCounter = new Map();
  for (const s of newShares) {
    const left = Number(s.leftToPay);
    if (left <= 0) continue;
    const key = String(s.owes);
    const arr = byCounter.get(key) || [];
    arr.push(s);
    byCounter.set(key, arr);
  }

  let totalApplied = 0;
  const perOldExpenseReduce = new Map();

  for (const [counterId, sharesForCounter] of byCounter.entries()) {
    const candidates = await fetchCandidateSharesForCustom({
      groupId,
      owesId: payerId,
      payeeId: counterId,
      session,
    });
    if (!candidates.length) continue;

    for (const newShare of sharesForCounter) {
      const leftNew = Number(newShare.leftToPay);
      if (leftNew <= 0) continue;

      const alloc = await allocateAmountOverShares({
        total: leftNew,
        shares: candidates,
        session,
      });

      if (alloc.amountApplied > 0) {
        await applyDeltaToShare(newShare, alloc.amountApplied, session);
        totalApplied = round2(totalApplied + alloc.amountApplied);

        for (const u of alloc.updates) {
          const k = String(u.expenseId);
          const prev = perOldExpenseReduce.get(k) || 0;
          perOldExpenseReduce.set(k, round2(prev + u.applied));
        }
      }
    }
  }

  for (const [oldExpenseId, reduceBy] of perOldExpenseReduce.entries()) {
    await reducePayerSharePaid({ expenseId: oldExpenseId, reduceBy, session });
  }

  if (totalApplied > 0) {
    await reducePayerSharePaid({ expenseId, reduceBy: totalApplied, session });
  }

  return {
    totalOffsetsApplied: totalApplied,
    details: Array.from(perOldExpenseReduce, ([expenseId, applied]) => ({ expenseId, applied })),
  };
}

async function applyDeltaToShare(share, delta, session) {
  const left = Number(share.leftToPay);
  if (left <= 0 || delta <= 0) {
    return { applied: 0, prevPaid: share.paid, newPaid: share.paid };
  }

  const applied  = Math.min(left, delta);
  const prevPaid = Number(share.paid) || 0;
  share.paid     = round2(prevPaid + applied);

  await share.save({ session });

  return { applied: round2(applied), prevPaid, newPaid: share.paid };
}

async function fetchCandidateSharesForCustom({ groupId, owesId, payeeId, session }) {
  const expenses = await Expense.find({
    group: groupId,
    settled: false,
    paidBy: payeeId,
  }).select('_id createdAt').lean();

  const expenseIds = expenses.map(e => e._id);
  if (expenseIds.length === 0) return [];

  let q = ExpenseShare.find({
    expense: { $in: expenseIds },
    owes: owesId,
    $expr: { $lt: ['$paid', '$amount'] },
  }).populate({ path: 'expense', select: 'createdAt' });

  if (session) q = q.session(session);
  const shares = await q.exec();

  shares.sort((a, b) =>
    new Date(b?.expense?.createdAt || 0) - new Date(a?.expense?.createdAt || 0)
  );

  return shares;
}

async function fetchSelectedShares({ shareIds, session }) {
  let q = ExpenseShare.find({ _id: { $in: shareIds } })
    .populate({ path: 'expense', select: 'createdAt' });
  if (session) q = q.session(session);
  const shares = await q.exec();

  const order = new Map(shareIds.map((id, i) => [String(id), i]));
  shares.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));

  return shares;
}

async function allocateAmountOverShares({ total, shares, session }) {
  const target = round2(total);
  let appliedSoFar = 0;
  const updates = [];

  for (const share of shares) {
    const toApply = round2(target - appliedSoFar);
    if (toApply <= 0) break;

    const { applied, prevPaid, newPaid } =
      await applyDeltaToShare(share, toApply, session);

    if (applied > 0) {
      appliedSoFar = round2(appliedSoFar + applied);
      updates.push({
        shareId: String(share._id),
        expenseId: String(share.expense?._id ?? share.expense),
        applied: round2(applied),
        prevPaid,
        newPaid
      });
    }
  }

  return { amountApplied: appliedSoFar, updates };
}


async function fullySettleSelectedShares({ shares, session }) {
  let amountApplied = 0;
  const updates = [];

  for (const share of shares) {
    const left = Number(share.leftToPay);
    if (left <= 0) continue;

    const prevPaid = Number(share.paid) || 0;
    share.paid = round2(Number(share.amount) || 0);
    await share.save({ session });

    amountApplied = round2(amountApplied + left);
    updates.push({ shareId: String(share._id), expenseId: String(share.expense?._id ?? share.expense), applied: round2(left), prevPaid, newPaid: share.paid });
  }

  return { amountApplied, updates };
}

async function reducePayerSharePaid({ expenseId, reduceBy, session }) {
  const amt = Number(reduceBy) || 0;
  if (amt <= 0) return null;

  const exp = await Expense.findById(expenseId)
    .select('paidBy')
    .session(session)
    .lean();
  if (!exp?.paidBy) return null;

  let q = ExpenseShare.findOne({ expense: expenseId, owes: exp.paidBy });
  if (session) q = q.session(session);
  const payerShare = await q.exec();
  if (!payerShare) return null;

  const prev = Number(payerShare.paid) || 0;
  const floor = Number(payerShare.amount) || 0;
  const next = Math.max(floor, round2(prev - amt));

  if (next !== prev) {
    payerShare.paid = next;
    await payerShare.save({ session });
    return { payerShareId: String(payerShare._id), decreasedBy: round2(prev - next), prevPaid: prev, newPaid: next };
  }
  return { payerShareId: String(payerShare._id), decreasedBy: 0, prevPaid: prev, newPaid: prev };
}