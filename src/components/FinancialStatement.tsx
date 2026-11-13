import React, { useEffect, useState } from 'react';
import { Landmark, TrendingUp, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';
import { DREAM_OPTIONS, FAST_TRACK_WIN_CASHFLOW_TARGET } from '../../shared/board';
import { Language, Player } from '../../shared/types';
import { t } from '../i18n';

interface FinancialStatementProps {
  players: Player[];
  localPlayerId: string;
  activeTurnPlayerId: string;
  language: Language;
  onTakeLoan: (amount: number) => void;
  onRepayLoan: (amount: number) => void;
  onPayOffLiability: (
    key:
      | 'homeMortgageBalance'
      | 'schoolLoanBalance'
      | 'carLoanBalance'
      | 'creditCardBalance'
      | 'otherDebtBalance'
  ) => void;
}

function formatDelta(val: number): string {
  if (val === 0) return '0';
  return `${val > 0 ? '+' : ''}${val.toLocaleString()} ฿`;
}

export const FinancialStatement: React.FC<FinancialStatementProps> = ({
  players,
  localPlayerId,
  activeTurnPlayerId,
  language,
  onTakeLoan,
  onRepayLoan,
  onPayOffLiability,
}) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(localPlayerId);
  const [ledgerTab, setLedgerTab] = useState<'fast_track' | 'rat_race'>('rat_race');
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanInput, setLoanInput] = useState('10000');
  const [repayInput, setRepayInput] = useState('10000');

  const inspected =
    players.find((p) => p.id === selectedPlayerId) ||
    players.find((p) => p.id === localPlayerId) ||
    players[0];

  useEffect(() => {
    if (inspected) {
      setLedgerTab(inspected.track === 'fast_track' ? 'fast_track' : 'rat_race');
    }
  }, [inspected?.id, inspected?.track]);

  if (!inspected) return null;

  const f = inspected.finance;
  const isOwnPlayer = inspected.id === localPlayerId;
  const totalBankPrincipal = f.bankLoans.reduce((s, l) => s + l.principal, 0);
  const escapeRatio = Math.min(100, Math.round((f.passiveIncome / Math.max(1, f.totalExpenses)) * 100));
  const delta = f.lastDelta;
  const dream = inspected.dreamId ? DREAM_OPTIONS.find((d) => d.id === inspected.dreamId) : null;

  const liabilityRows: {
    key:
      | 'homeMortgageBalance'
      | 'schoolLoanBalance'
      | 'carLoanBalance'
      | 'creditCardBalance'
      | 'otherDebtBalance';
    label: string;
    balance: number;
  }[] = [
    { key: 'homeMortgageBalance', label: t(language, 'homeMortgageExp'), balance: f.liabilities.homeMortgageBalance },
    { key: 'schoolLoanBalance', label: t(language, 'schoolLoanExp'), balance: f.liabilities.schoolLoanBalance },
    { key: 'carLoanBalance', label: t(language, 'carLoanExp'), balance: f.liabilities.carLoanBalance },
    { key: 'creditCardBalance', label: t(language, 'creditCardExp'), balance: f.liabilities.creditCardBalance },
    { key: 'otherDebtBalance', label: t(language, 'otherDebtExp'), balance: f.liabilities.otherDebtBalance },
  ];

  return (
    <aside className="h-full flex flex-col bg-white border-r border-slate-200 overflow-hidden">
      {/* Player Switcher Tabs */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/80 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-slate-600">
            {t(language, 'financialStatement')}
          </h2>
          <span className="text-xs font-mono font-bold text-orange-600">
            {inspected.track === 'fast_track'
              ? t(language, 'fastTrackTrack')
              : t(language, 'ratRaceTrack')}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {players.map((p) => {
            const isSelected = p.id === inspected.id;
            const isTurn = p.id === activeTurnPlayerId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlayerId(p.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/15"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate max-w-[74px]">{p.name}</span>
                {isTurn && <span className={`text-[10px] ${isSelected ? 'text-yellow-200' : 'text-orange-500'}`}>★</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Financial Ledger */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-slate-50/50">
        {/* Identity & Cash Summary */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-3">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <div className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <span>{inspected.name}</span>
                {inspected.isBot && (
                  <span className="text-xs font-medium text-sky-600">· Robot</span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {inspected.career.name[language]}
                {inspected.finance.childrenCount > 0 && (
                  <span>
                    {' · '}
                    {t(language, 'childrenCount')}: {inspected.finance.childrenCount}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-slate-500">{t(language, 'cashOnHand')}</div>
              <div className="font-mono text-lg font-bold text-emerald-600 tabular-nums">
                {f.cash.toLocaleString()} ฿
              </div>
            </div>
          </div>

          {/* 4 Core Numbers */}
          {inspected.track === 'rat_race' ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2">
                  <div className="text-slate-500">{t(language, 'totalIncome')}</div>
                  <div className="font-mono font-bold text-slate-900 text-sm mt-0.5 tabular-nums">
                    {f.totalIncome.toLocaleString()} ฿
                  </div>
                </div>
                <div className="bg-pink-50/70 border border-pink-200/80 rounded-lg p-2">
                  <div className="text-pink-700">{t(language, 'totalExpenses')}</div>
                  <div className="font-mono font-bold text-pink-600 text-sm mt-0.5 tabular-nums">
                    {f.totalExpenses.toLocaleString()} ฿
                  </div>
                </div>
                <div className="bg-violet-50/70 border border-violet-200/80 rounded-lg p-2">
                  <div className="text-violet-700">{t(language, 'passiveIncome')}</div>
                  <div className="font-mono font-bold text-violet-700 text-sm mt-0.5 tabular-nums">
                    {f.passiveIncome.toLocaleString()} ฿
                  </div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
                  <div className="text-orange-800 font-medium">{t(language, 'monthlyCashFlow')}</div>
                  <div
                    className={`font-mono font-bold text-sm mt-0.5 tabular-nums ${
                      f.monthlyCashFlow >= 0 ? 'text-emerald-600' : 'text-pink-600'
                    }`}
                  >
                    {f.monthlyCashFlow.toLocaleString()} ฿
                  </div>
                </div>
              </div>

              {/* Rat Race Escape Meter */}
              <div className="pt-1">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-violet-600" />
                    <span className="truncate">{t(language, 'escapeProgress')}</span>
                  </span>
                  <span className="font-mono font-bold text-violet-700 tabular-nums shrink-0">
                    {escapeRatio}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all duration-300"
                    style={{ width: `${escapeRatio}%` }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-2">
                  <div className="text-amber-900 font-medium">Cashflow Day</div>
                  <div className="font-mono font-bold text-amber-950 text-sm mt-0.5 tabular-nums">
                    {(f.fastTrackCashFlowDay + f.fastTrackAddedCashFlow).toLocaleString()} ฿
                  </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                  <div className="text-emerald-800 font-medium">
                    {language === 'th' ? 'เป้าหมาย (+500k)' : 'Target (+500k)'}
                  </div>
                  <div className="font-mono font-bold text-emerald-700 text-sm mt-0.5 tabular-nums">
                    {f.fastTrackAddedCashFlow.toLocaleString()} / {FAST_TRACK_WIN_CASHFLOW_TARGET.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Fast Track Cashflow Progress Bar */}
              <div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((f.fastTrackAddedCashFlow / FAST_TRACK_WIN_CASHFLOW_TARGET) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {dream && (
                <div className="bg-pink-50 border-2 border-slate-900 rounded-lg p-2 flex justify-between items-center gap-2">
                  <span className="font-bold text-pink-900 truncate">
                    ★ {dream.name[language]}
                  </span>
                  <span className="font-mono font-bold text-slate-900 shrink-0">
                    {dream.cost.toLocaleString()} ฿
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fast Track vs Minimized Rat Race Ledger Tabs */}
        {inspected.track === 'fast_track' && (
          <div className="grid grid-cols-2 gap-1.5 bg-slate-200/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setLedgerTab('fast_track')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-colors ${
                ledgerTab === 'fast_track'
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white/70'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t(language, 'ftLedgerTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => setLedgerTab('rat_race')}
              className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors truncate ${
                ledgerTab === 'rat_race'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              {t(language, 'rrLedgerTab')}
            </button>
          </div>
        )}

        {/* Last Financial Delta Card */}
        {delta && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
            <div className="text-xs font-bold text-orange-800">
              {t(language, 'financialChanges')}
            </div>
            <div className="text-xs text-slate-700">{delta.reason[language]}</div>
            <div className="grid grid-cols-2 gap-1.5 text-xs font-mono tabular-nums pt-1">
              {delta.cashDelta !== 0 && (
                <div
                  className={`flex items-center justify-between px-2 py-1 rounded bg-white border border-slate-200 ${
                    delta.cashDelta > 0 ? 'text-emerald-600' : 'text-pink-600'
                  }`}
                >
                  <span>Cash</span>
                  <span className="flex items-center gap-0.5 font-bold">
                    {delta.cashDelta > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {formatDelta(delta.cashDelta)}
                  </span>
                </div>
              )}
              {delta.passiveIncomeDelta !== 0 && (
                <div
                  className={`flex items-center justify-between px-2 py-1 rounded bg-white border border-slate-200 ${
                    delta.passiveIncomeDelta > 0 ? 'text-violet-600' : 'text-pink-600'
                  }`}
                >
                  <span>Passive</span>
                  <span className="font-bold">{formatDelta(delta.passiveIncomeDelta)}</span>
                </div>
              )}
              {delta.totalExpensesDelta !== 0 && (
                <div
                  className={`flex items-center justify-between px-2 py-1 rounded bg-white border border-slate-200 ${
                    delta.totalExpensesDelta < 0 ? 'text-emerald-600' : 'text-pink-600'
                  }`}
                >
                  <span>{language === 'th' ? 'รายจ่าย' : 'Expenses'}</span>
                  <span className="font-bold">{formatDelta(delta.totalExpensesDelta)}</span>
                </div>
              )}
              {delta.monthlyCashFlowDelta !== 0 && (
                <div
                  className={`flex items-center justify-between px-2 py-1 rounded bg-white border border-slate-200 ${
                    delta.monthlyCashFlowDelta > 0 ? 'text-orange-600' : 'text-pink-600'
                  }`}
                >
                  <span>Payday</span>
                  <span className="font-bold">{formatDelta(delta.monthlyCashFlowDelta)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fast Track Dedicated Assets & Income Account (shown when on Fast Track tab) */}
        {inspected.track === 'fast_track' && ledgerTab === 'fast_track' ? (
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-4 text-xs shadow-2xs">
            <div>
              <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-2">
                {language === 'th' ? 'สรุปกระแสเงินสด Fast Track' : 'Fast Track Cashflow Summary'}
              </h3>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-600">{t(language, 'ftBaseCashflowDay')}</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {f.fastTrackCashFlowDay.toLocaleString()} ฿
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">{t(language, 'ftAddedCashflow')}</span>
                  <span className="font-mono font-bold text-emerald-600 tabular-nums">
                    +{f.fastTrackAddedCashFlow.toLocaleString()} ฿
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-amber-900">
                  <span>{t(language, 'ftTotalCashflowDay')}</span>
                  <span className="font-mono tabular-nums">
                    {(f.fastTrackCashFlowDay + f.fastTrackAddedCashFlow).toLocaleString()} ฿
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-emerald-800 border-b border-emerald-100 pb-1 mb-2">
                {t(language, 'ftAssetsTitle')} ({f.fastTrackAssets.length})
              </h3>
              {f.fastTrackAssets.length === 0 ? (
                <p className="text-slate-400 italic">{t(language, 'ftNoAssets')}</p>
              ) : (
                <div className="space-y-1.5">
                  {f.fastTrackAssets.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 bg-emerald-50/70 border border-emerald-200 rounded-lg px-2.5 py-2"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{a.name[language]}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {t(language, 'cost')}: {a.cost.toLocaleString()} ฿
                        </div>
                      </div>
                      <div className="font-mono font-bold text-emerald-600 shrink-0 tabular-nums">
                        +{a.cashFlow.toLocaleString()}/m
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Detailed Rat Race Income & Expenses Statement (auto-minimized to tab when on Fast Track) */
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-4 text-xs shadow-2xs">
          <div>
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-2">
              {t(language, 'incomeSection')}
            </h3>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">{t(language, 'salary')}</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {inspected.career.salary.toLocaleString()} ฿
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(language, 'passiveIncome')}</span>
                <span className="font-mono font-semibold text-violet-600 tabular-nums">
                  {f.passiveIncome.toLocaleString()} ฿
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1 font-bold text-slate-900">
                <span>{t(language, 'totalIncome')}</span>
                <span className="font-mono tabular-nums">{f.totalIncome.toLocaleString()} ฿</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-2">
              {t(language, 'expensesSection')}
            </h3>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">{t(language, 'taxes')}</span>
                <span className="font-mono text-slate-800 tabular-nums">{f.expenses.taxes.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(language, 'homeMortgageExp')}</span>
                <span className="font-mono text-slate-800 tabular-nums">{f.expenses.homeMortgage.toLocaleString()} ฿</span>
              </div>
              {f.expenses.schoolLoan > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">{t(language, 'schoolLoanExp')}</span>
                  <span className="font-mono text-slate-800 tabular-nums">{f.expenses.schoolLoan.toLocaleString()} ฿</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">{t(language, 'carLoanExp')}</span>
                <span className="font-mono text-slate-800 tabular-nums">{f.expenses.carLoan.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(language, 'creditCardExp')}</span>
                <span className="font-mono text-slate-800 tabular-nums">{f.expenses.creditCard.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(language, 'otherDebtExp')}</span>
                <span className="font-mono text-slate-800 tabular-nums">{f.expenses.otherDebt.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(language, 'otherExpenses')}</span>
                <span className="font-mono text-slate-800 tabular-nums">{f.expenses.otherExpenses.toLocaleString()} ฿</span>
              </div>
              {f.childrenCount > 0 && (
                <div className="flex justify-between text-violet-700 font-medium">
                  <span>
                    {t(language, 'childrenExpenses')} ({f.childrenCount} × {f.expenses.perChildExpense.toLocaleString()})
                  </span>
                  <span className="font-mono tabular-nums">{f.expenses.childrenExpenses.toLocaleString()} ฿</span>
                </div>
              )}
              {f.expenses.bankLoanInterest > 0 && (
                <div className="flex justify-between text-pink-600 font-semibold">
                  <span>{t(language, 'bankLoanInterest')}</span>
                  <span className="font-mono tabular-nums">{f.expenses.bankLoanInterest.toLocaleString()} ฿</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-1 font-bold text-pink-600">
                <span>{t(language, 'totalExpenses')}</span>
                <span className="font-mono tabular-nums">{f.totalExpenses.toLocaleString()} ฿</span>
              </div>
            </div>
          </div>

          {/* Assets Section */}
          <div>
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-2">
              {t(language, 'assetsSection')} ({f.assets.length})
            </h3>
            {f.assets.length === 0 ? (
              <p className="text-slate-400 italic">{t(language, 'noAssets')}</p>
            ) : (
              <div className="space-y-1.5">
                {f.assets.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {a.name[language]}
                        {a.shares ? ` (${a.shares.toLocaleString()})` : ''}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {t(language, 'cost')}: {a.cost.toLocaleString()} · {t(language, 'downPayment')}:{' '}
                        {a.downPayment.toLocaleString()}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-emerald-600 shrink-0 tabular-nums">
                      {a.cashFlow >= 0 ? '+' : ''}
                      {a.cashFlow.toLocaleString()}/m
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Liabilities Section */}
          <div>
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-2">
              {t(language, 'liabilitiesSection')}
            </h3>
            <div className="space-y-1.5">
              {totalBankPrincipal > 0 && (
                <div className="flex items-center justify-between bg-pink-50 border border-pink-200 rounded-lg px-2.5 py-1.5">
                  <span className="font-semibold text-pink-800">
                    {language === 'th' ? 'เงินกู้ธนาคาร (10%/ด.)' : 'Bank Loans (10%/mo)'}
                  </span>
                  <span className="font-mono font-bold text-pink-600 tabular-nums">
                    {totalBankPrincipal.toLocaleString()} ฿
                  </span>
                </div>
              )}

              {liabilityRows.map((row) =>
                row.balance > 0 ? (
                  <div
                    key={row.key}
                    className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                  >
                    <div>
                      <div className="text-slate-700 font-medium">{row.label}</div>
                      <div className="font-mono font-semibold text-slate-900 tabular-nums">
                        {row.balance.toLocaleString()} ฿
                      </div>
                    </div>
                    {isOwnPlayer && (
                      <button
                        type="button"
                        disabled={f.cash < row.balance}
                        onClick={() => onPayOffLiability(row.key)}
                        className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed text-white text-[11px] font-semibold transition-colors whitespace-nowrap"
                      >
                        {t(language, 'payOffDebt')}
                      </button>
                    )}
                  </div>
                ) : null
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Bank Loan Footer Bar (Rat Race only) */}
      {isOwnPlayer && inspected.track === 'rat_race' && (
        <div className="p-3 border-t border-slate-200 bg-white shrink-0 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">{t(language, 'maxLoanAvailable')}</span>
            <span className="font-mono font-bold text-orange-600 tabular-nums">
              {f.maxLoanLimit.toLocaleString()} ฿
            </span>
          </div>

          {!showLoanModal ? (
            <button
              type="button"
              onClick={() => setShowLoanModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs transition-colors"
            >
              <Landmark className="w-4 h-4" />
              <span>{t(language, 'bankLoanTitle')}</span>
            </button>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">{t(language, 'bankLoanTitle')}</span>
                <button
                  type="button"
                  onClick={() => setShowLoanModal(false)}
                  className="text-xs text-slate-400 hover:text-slate-800"
                >
                  ✕
                </button>
              </div>

              <div className="flex gap-1.5">
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={loanInput}
                  onChange={(e) => setLoanInput(e.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-mono text-xs"
                />
                <button
                  type="button"
                  disabled={Number(loanInput) <= 0 || Number(loanInput) > f.maxLoanLimit}
                  onClick={() => onTakeLoan(Number(loanInput))}
                  className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold text-xs whitespace-nowrap"
                >
                  {t(language, 'takeLoan')}
                </button>
              </div>
              <div className="flex gap-1">
                {[1000, 10000, 50000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLoanInput(String(Math.min(preset, f.maxLoanLimit || preset)))}
                    className="flex-1 py-1 text-[11px] font-mono font-semibold rounded-md bg-white hover:bg-orange-50 text-orange-600 border border-slate-200"
                  >
                    {preset.toLocaleString()}
                  </button>
                ))}
              </div>

              {totalBankPrincipal > 0 && (
                <div className="pt-2 border-t border-slate-200 flex gap-1.5">
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    max={totalBankPrincipal}
                    value={repayInput}
                    onChange={(e) => setRepayInput(e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-mono text-xs"
                  />
                  <button
                    type="button"
                    disabled={Number(repayInput) <= 0 || f.cash < Number(repayInput)}
                    onClick={() => onRepayLoan(Number(repayInput))}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold text-xs whitespace-nowrap"
                  >
                    {t(language, 'repayLoan')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
