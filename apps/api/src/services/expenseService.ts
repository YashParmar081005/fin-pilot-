/**
 * Expense claims (plan.md §32 Phase 8). submitted → approved | rejected.
 * THE rule: an expense can never be approved by its own submitter, no
 * matter what permissions they hold. Approval posts Dr expense account,
 * Cr Salaries Payable (2160 — staff reimbursements payable).
 */
import type { CreateExpenseInput } from '@finpilot/shared';
import { GeneralLedger } from '../engines/ledger/GeneralLedger';
import { Expense, type ExpenseDoc } from '../models/Expense';
import { accountRepo } from '../repositories/accountRepo';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';
import { withTransaction } from '../utils/withTransaction';

export const expenseService = {
  async submit(input: CreateExpenseInput): Promise<ExpenseDoc> {
    const ctx = requireCompanyContext();
    const expenseAccount = await accountRepo.findById(input.expenseAccountId);
    if (!expenseAccount || expenseAccount.type !== 'expense') {
      throw new AppError('LEDGER_ACCOUNT_INACTIVE', 422, {
        expenseAccountId: input.expenseAccountId,
      });
    }
    const created = await Expense.create({
      ...input,
      status: 'submitted',
      submittedBy: ctx.userId,
      journalEntryId: null,
    });
    return created.toObject();
  },

  async approve(id: string): Promise<ExpenseDoc> {
    const ctx = requireCompanyContext();
    return withTransaction(async (session) => {
      const expense = await Expense.findOne({ _id: id }).session(session);
      if (!expense) throw new AppError('SYS_NOT_FOUND', 404);
      if (expense.status !== 'submitted') {
        throw new AppError('DOC_INVALID_STATE', 409, { status: expense.status });
      }
      // the §2.1 rule permissions cannot express: submitter ≠ approver
      if (String(expense.submittedBy) === String(ctx.userId)) {
        throw new AppError('DOC_SELF_APPROVAL_FORBIDDEN', 403);
      }

      const payable = await accountRepo.findByCode('2160'); // Salaries Payable
      if (!payable) throw new AppError('LEDGER_ACCOUNT_INACTIVE', 422, { missing: '2160' });

      const entry = await GeneralLedger.post(
        ctx.companyId,
        {
          date: expense.date,
          narration: `Expense claim: ${expense.description}`,
          source: { type: 'expense', documentId: expense._id, documentModel: 'Expense' },
          lines: [
            { accountId: expense.expenseAccountId, debitPaise: expense.amountPaise },
            { accountId: payable._id, creditPaise: expense.amountPaise },
          ],
        },
        ctx.userId!,
        session,
      );

      expense.status = 'approved';
      expense.approvedBy = ctx.userId!;
      expense.journalEntryId = entry._id;
      await expense.save({ session });
      return expense.toObject();
    });
  },

  async reject(id: string, reason: string): Promise<ExpenseDoc> {
    const ctx = requireCompanyContext();
    const expense = await Expense.findOne({ _id: id });
    if (!expense) throw new AppError('SYS_NOT_FOUND', 404);
    if (expense.status !== 'submitted') {
      throw new AppError('DOC_INVALID_STATE', 409, { status: expense.status });
    }
    if (String(expense.submittedBy) === String(ctx.userId)) {
      throw new AppError('DOC_SELF_APPROVAL_FORBIDDEN', 403);
    }
    expense.status = 'rejected';
    expense.rejectedReason = reason;
    await expense.save();
    return expense.toObject();
  },

  async get(id: string): Promise<ExpenseDoc> {
    const expense = await Expense.findOne({ _id: id }).lean();
    if (!expense) throw new AppError('SYS_NOT_FOUND', 404);
    return expense;
  },

  list(status?: string): Promise<ExpenseDoc[]> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    return Expense.find(filter).sort({ date: -1, _id: -1 }).limit(200).lean();
  },
};
