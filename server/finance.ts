import {
  Asset,
  Career,
  FinancialDelta,
  Player,
  PlayerFinance,
  BilingualText,
} from '../shared/types';

export interface FinanceSnapshot {
  cash: number;
  passiveIncome: number;
  totalIncome: number;
  totalExpenses: number;
  monthlyCashFlow: number;
  totalDebt: number;
}

export class FinancialEngine {
  public static createInitialFinance(career: Career): PlayerFinance {
    const finance: PlayerFinance = {
      cash: career.savings,
      childrenCount: 0,
      assets: [],
      bankLoans: [],
      liabilities: {
        homeMortgageBalance: career.liabilities.homeMortgageBalance,
        schoolLoanBalance: career.liabilities.schoolLoanBalance,
        carLoanBalance: career.liabilities.carLoanBalance,
        creditCardBalance: career.liabilities.creditCardBalance,
        otherDebtBalance: career.liabilities.otherDebtBalance,
      },
      expenses: {
        taxes: career.expenses.taxes,
        homeMortgage: career.expenses.homeMortgage,
        schoolLoan: career.expenses.schoolLoan,
        carLoan: career.expenses.carLoan,
        creditCard: career.expenses.creditCard,
        otherDebt: career.expenses.otherDebt,
        otherExpenses: career.expenses.otherExpenses,
        perChildExpense: career.expenses.perChildExpense,
        bankLoanInterest: 0,
        childrenExpenses: 0,
      },
      passiveIncome: 0,
      totalIncome: career.salary,
      totalExpenses: 0,
      monthlyCashFlow: 0,
      maxLoanLimit: 0,
      totalDebt: 0,
      isEscapedRatRace: false,
      fastTrackCashFlowDay: 0,
      fastTrackAddedCashFlow: 0,
      fastTrackAssets: [],
      fastTrackPinkPurchases: [],
      lastDelta: null,
    };

    this.recalculate(finance, career);
    return finance;
  }

  public static recalculate(finance: PlayerFinance, career: Career): void {
    // 1. Passive Income from all assets (real estate cashflow + business + CD + dividend stocks)
    finance.passiveIncome = finance.assets.reduce(
      (sum, asset) => sum + (asset.cashFlow || 0),
      0
    );

    // 2. Total Income = Salary + Passive Income
    finance.totalIncome = career.salary + finance.passiveIncome;

    // 3. Bank Loan Interest (10% of principal per month)
    finance.expenses.bankLoanInterest = finance.bankLoans.reduce(
      (sum, loan) => sum + loan.monthlyInterest,
      0
    );

    // 4. Children Expenses
    finance.expenses.childrenExpenses =
      finance.childrenCount * finance.expenses.perChildExpense;

    // 5. Total Monthly Expenses
    const e = finance.expenses;
    finance.totalExpenses =
      e.taxes +
      e.homeMortgage +
      e.schoolLoan +
      e.carLoan +
      e.creditCard +
      e.otherDebt +
      e.otherExpenses +
      e.bankLoanInterest +
      e.childrenExpenses;

    // 6. Monthly Cash Flow (Payday)
    finance.monthlyCashFlow = finance.totalIncome - finance.totalExpenses;

    // 7. Max Loan Limit = 10x Monthly Cash Flow (minimum 0)
    finance.maxLoanLimit =
      finance.monthlyCashFlow > 0 ? finance.monthlyCashFlow * 10 : 0;

    // 8. Total Debt across Career Liabilities, Bank Loans, and Asset Mortgages
    const l = finance.liabilities;
    const bankPrincipal = finance.bankLoans.reduce(
      (sum, loan) => sum + loan.principal,
      0
    );
    const assetMortgages = finance.assets.reduce(
      (sum, asset) => sum + (asset.mortgage || 0),
      0
    );
    finance.totalDebt =
      l.homeMortgageBalance +
      l.schoolLoanBalance +
      l.carLoanBalance +
      l.creditCardBalance +
      l.otherDebtBalance +
      bankPrincipal +
      assetMortgages;

    // 9. Escape Rat Race condition: Passive Income > Total Expenses
    finance.isEscapedRatRace = finance.passiveIncome > finance.totalExpenses;
  }

  public static snapshot(finance: PlayerFinance): FinanceSnapshot {
    return {
      cash: finance.cash,
      passiveIncome: finance.passiveIncome,
      totalIncome: finance.totalIncome,
      totalExpenses: finance.totalExpenses,
      monthlyCashFlow: finance.monthlyCashFlow,
      totalDebt: finance.totalDebt,
    };
  }

  public static buildDelta(
    before: FinanceSnapshot,
    after: PlayerFinance,
    reason: BilingualText
  ): FinancialDelta {
    const delta: FinancialDelta = {
      cashDelta: after.cash - before.cash,
      passiveIncomeDelta: after.passiveIncome - before.passiveIncome,
      totalIncomeDelta: after.totalIncome - before.totalIncome,
      totalExpensesDelta: after.totalExpenses - before.totalExpenses,
      monthlyCashFlowDelta: after.monthlyCashFlow - before.monthlyCashFlow,
      totalDebtDelta: after.totalDebt - before.totalDebt,
      reason,
      timestamp: Date.now(),
    };
    after.lastDelta = delta;
    return delta;
  }

  public static takeLoan(
    player: Player,
    amount: number
  ): { success: boolean; error?: BilingualText; delta?: FinancialDelta } {
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        success: false,
        error: {
          th: 'จำนวนเงินกู้ต้องมากกว่า 0 บาท',
          en: 'Loan amount must be greater than 0.',
        },
      };
    }

    const roundedAmount = Math.round(amount);
    if (roundedAmount > player.finance.maxLoanLimit) {
      return {
        success: false,
        error: {
          th: `กู้เงินเกินวงเงินสูงสุด (${player.finance.maxLoanLimit.toLocaleString()} ฿)`,
          en: `Loan exceeds your 10x Cashflow limit (${player.finance.maxLoanLimit.toLocaleString()} ฿).`,
        },
      };
    }

    const before = this.snapshot(player.finance);
    const interest = Math.round(roundedAmount * 0.1);
    player.finance.cash += roundedAmount;
    player.finance.bankLoans.push({
      id: `loan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      principal: roundedAmount,
      monthlyInterest: interest,
    });

    this.recalculate(player.finance, player.career);
    const delta = this.buildDelta(before, player.finance, {
      th: `กู้เงินธนาคาร ${roundedAmount.toLocaleString()} ฿ (ดอกเบี้ย ${interest.toLocaleString()} ฿/ด.)`,
      en: `Bank Loan ${roundedAmount.toLocaleString()} ฿ (${interest.toLocaleString()} ฿/mo interest)`,
    });

    return { success: true, delta };
  }

  public static getMaxBorrowable(finance: PlayerFinance): number {
    return Math.floor(Math.max(0, finance.maxLoanLimit) / 1000) * 1000;
  }

  public static canCoverExpenseWithLoan(finance: PlayerFinance, amount: number): boolean {
    if (finance.cash >= amount) return true;
    const shortfall = amount - finance.cash;
    const neededLoan = Math.ceil(shortfall / 1000) * 1000;
    return neededLoan <= this.getMaxBorrowable(finance);
  }

  public static payExpenseOrBankrupt(
    player: Player,
    cost: number,
    paidReason: BilingualText,
    bankruptReason: BilingualText
  ): {
    bankrupt: boolean;
    cashBefore: number;
    loanAmt: number;
    loanInterest: number;
    maxLoanLimit: number;
    delta: FinancialDelta;
  } {
    const before = this.snapshot(player.finance);
    const cashBefore = player.finance.cash;
    const maxLoanLimit = player.finance.maxLoanLimit;
    const safeCost = Math.max(0, cost);
    let loanAmt = 0;
    let loanInterest = 0;

    if (player.finance.cash < safeCost) {
      const shortfall = safeCost - player.finance.cash;
      const neededLoan = Math.ceil(shortfall / 1000) * 1000;
      const maxBorrowable = this.getMaxBorrowable(player.finance);

      if (neededLoan > maxBorrowable) {
        player.isBankrupt = true;
        player.finance.cash = 0;
        const delta = this.buildDelta(before, player.finance, bankruptReason);
        return {
          bankrupt: true,
          cashBefore,
          loanAmt: 0,
          loanInterest: 0,
          maxLoanLimit,
          delta,
        };
      }

      loanAmt = neededLoan;
      loanInterest = Math.round(loanAmt * 0.1);
      player.finance.cash += loanAmt;
      player.finance.bankLoans.push({
        id: `loan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        principal: loanAmt,
        monthlyInterest: loanInterest,
      });
    }

    player.finance.cash -= safeCost;
    this.recalculate(player.finance, player.career);
    const delta = this.buildDelta(before, player.finance, paidReason);
    return {
      bankrupt: false,
      cashBefore,
      loanAmt,
      loanInterest,
      maxLoanLimit,
      delta,
    };
  }

  public static payDownsizedExpense(player: Player): {
    bankrupt: boolean;
    penalty: number;
    cashBefore: number;
    loanAmt: number;
    loanInterest: number;
    maxLoanLimit: number;
    delta: FinancialDelta;
  } {
    const before = this.snapshot(player.finance);
    const cashBefore = player.finance.cash;
    const maxLoanLimit = player.finance.maxLoanLimit;
    const penalty = Math.max(0, player.finance.totalExpenses);
    let loanAmt = 0;
    let loanInterest = 0;

    // 1. If cash on hand is insufficient, check if player can borrow enough within maxLoanLimit
    if (player.finance.cash < penalty) {
      const shortfall = penalty - player.finance.cash;
      const neededLoan = Math.ceil(shortfall / 1000) * 1000;
      const maxBorrowable = this.getMaxBorrowable(player.finance);

      if (neededLoan > maxBorrowable) {
        player.isBankrupt = true;
        player.finance.cash = 0;
        const delta = this.buildDelta(before, player.finance, {
          th: `ล้มละลาย! ตกงานต้องจ่าย ${penalty.toLocaleString()} ฿ แต่เงินสดไม่พอและวงเงินกู้เต็มแล้ว`,
          en: `Bankrupt! Downsized (${penalty.toLocaleString()} ฿ due) with insufficient cash and maxed-out loan limit`,
        });
        return {
          bankrupt: true,
          penalty,
          cashBefore,
          loanAmt: 0,
          loanInterest: 0,
          maxLoanLimit,
          delta,
        };
      }

      loanAmt = neededLoan;
      loanInterest = Math.round(loanAmt * 0.1);
      player.finance.cash += loanAmt;
      player.finance.bankLoans.push({
        id: `loan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        principal: loanAmt,
        monthlyInterest: loanInterest,
      });
    }

    // 2. Deduct penalty from cash on hand
    player.finance.cash -= penalty;

    // 3. Recalculate so bank loan interest is added into bankLoanInterest & totalExpenses
    this.recalculate(player.finance, player.career);

    const reason: BilingualText =
      loanAmt > 0
        ? {
            th: `ตกงาน! กู้ธนาคาร ${loanAmt.toLocaleString()} ฿ (ดอกเบี้ย +${loanInterest.toLocaleString()} ฿/ด.) แล้วจ่ายรายจ่ายรวม ${penalty.toLocaleString()} ฿`,
            en: `Downsized! Borrowed ${loanAmt.toLocaleString()} ฿ (+${loanInterest.toLocaleString()} ฿/mo interest) and paid ${penalty.toLocaleString()} ฿ expenses`,
          }
        : {
            th: `ตกงาน! จ่ายรายจ่ายรวม 1 เดือน (${penalty.toLocaleString()} ฿) และหยุดเล่น 2 ตา`,
            en: `Downsized! Paid 1x Total Expenses (${penalty.toLocaleString()} ฿) and lose 2 turns`,
          };

    const delta = this.buildDelta(before, player.finance, reason);
    return {
      bankrupt: false,
      penalty,
      cashBefore,
      loanAmt,
      loanInterest,
      maxLoanLimit,
      delta,
    };
  }

  public static repayBankLoan(
    player: Player,
    amount: number
  ): { success: boolean; error?: BilingualText; delta?: FinancialDelta } {
    const totalBankPrincipal = player.finance.bankLoans.reduce(
      (s, l) => s + l.principal,
      0
    );
    if (totalBankPrincipal <= 0) {
      return {
        success: false,
        error: { th: 'คุณไม่มีหนี้เงินกู้ธนาคาร', en: 'No bank loans to repay.' },
      };
    }

    const payAmount = Math.min(Math.round(amount), totalBankPrincipal);
    if (payAmount <= 0) {
      return {
        success: false,
        error: { th: 'ยอดชำระไม่ถูกต้อง', en: 'Invalid repayment amount.' },
      };
    }

    if (player.finance.cash < payAmount) {
      return {
        success: false,
        error: { th: 'เงินสดไม่เพียงพอสำหรับชำระคืนเงินกู้', en: 'Insufficient cash to repay loan.' },
      };
    }

    const before = this.snapshot(player.finance);
    player.finance.cash -= payAmount;

    let remainingToPay = payAmount;
    const updatedLoans = [];
    for (const loan of player.finance.bankLoans) {
      if (remainingToPay <= 0) {
        updatedLoans.push(loan);
        continue;
      }
      if (remainingToPay >= loan.principal) {
        remainingToPay -= loan.principal;
      } else {
        const newPrincipal = loan.principal - remainingToPay;
        updatedLoans.push({
          ...loan,
          principal: newPrincipal,
          monthlyInterest: Math.round(newPrincipal * 0.1),
        });
        remainingToPay = 0;
      }
    }

    player.finance.bankLoans = updatedLoans;
    this.recalculate(player.finance, player.career);
    const delta = this.buildDelta(before, player.finance, {
      th: `ชำระคืนเงินกู้ธนาคาร ${payAmount.toLocaleString()} ฿`,
      en: `Repaid Bank Loan ${payAmount.toLocaleString()} ฿`,
    });

    return { success: true, delta };
  }

  public static payOffLiability(
    player: Player,
    liabilityKey:
      | 'homeMortgageBalance'
      | 'schoolLoanBalance'
      | 'carLoanBalance'
      | 'creditCardBalance'
      | 'otherDebtBalance'
  ): { success: boolean; error?: BilingualText; delta?: FinancialDelta } {
    const balance = player.finance.liabilities[liabilityKey];
    if (balance <= 0) {
      return {
        success: false,
        error: { th: 'หนี้สินรายการนี้ถูกชำระหมดแล้ว', en: 'Liability already paid off.' },
      };
    }

    if (player.finance.cash < balance) {
      return {
        success: false,
        error: { th: 'เงินสดไม่เพียงพอสำหรับปิดหนี้สินรายการนี้', en: 'Insufficient cash to pay off liability.' },
      };
    }

    const before = this.snapshot(player.finance);
    player.finance.cash -= balance;
    player.finance.liabilities[liabilityKey] = 0;

    const expenseMap: Record<typeof liabilityKey, keyof PlayerFinance['expenses']> = {
      homeMortgageBalance: 'homeMortgage',
      schoolLoanBalance: 'schoolLoan',
      carLoanBalance: 'carLoan',
      creditCardBalance: 'creditCard',
      otherDebtBalance: 'otherDebt',
    };
    const labelMap: Record<typeof liabilityKey, BilingualText> = {
      homeMortgageBalance: { th: 'ปิดหนี้จำนองบ้าน', en: 'Paid off Home Mortgage' },
      schoolLoanBalance: { th: 'ปิดหนี้กู้ยืมเพื่อการศึกษา', en: 'Paid off School Loan' },
      carLoanBalance: { th: 'ปิดหนี้สินเชื่อรถยนต์', en: 'Paid off Car Loan' },
      creditCardBalance: { th: 'ปิดหนี้บัตรเครดิต', en: 'Paid off Credit Card' },
      otherDebtBalance: { th: 'ปิดหนี้สินอื่นๆ', en: 'Paid off Other Debt' },
    };

    player.finance.expenses[expenseMap[liabilityKey]] = 0;
    this.recalculate(player.finance, player.career);
    const delta = this.buildDelta(before, player.finance, labelMap[liabilityKey]);

    return { success: true, delta };
  }

  public static addAsset(player: Player, asset: Asset): void {
    player.finance.assets.push(asset);
    this.recalculate(player.finance, player.career);
  }
}
