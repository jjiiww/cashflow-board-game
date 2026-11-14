import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Bot, Landmark, Sparkles, TrendingUp, Users } from 'lucide-react';
import { DREAM_OPTIONS, FAST_TRACK_WIN_CASHFLOW_TARGET } from '../../shared/board';
import { GameRoomState, Language, Player } from '../../shared/types';
import { t } from '../i18n';
import { getAssetDetailLines, getAssetTypeLabel } from '../utils/assetDisplay';
import { CashflowBoard } from './CashflowBoard';
import { PlayerAvatar } from './PlayerAvatar';
import { ResizeHandle } from './ResizeHandle';
import { StepActionPanel } from './StepActionPanel';

const DEFAULT_ADMIN_LEFT_PCT = 50;
const MIN_ADMIN_LEFT_PCT = 26;
const MAX_ADMIN_LEFT_PCT = 72;

const DEFAULT_ADMIN_BOTTOM_PCT = 44;
const MIN_ADMIN_BOTTOM_PCT = 20;
const MAX_ADMIN_BOTTOM_PCT = 75;

function readStoredPct(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  } catch {
    return fallback;
  }
}

interface AdminDashboardProps {
  roomState: GameRoomState;
  uiState: GameRoomState;
  localPlayerId: string;
  language: Language;
  errorMsg: string | null;
  isBoardAnimating: boolean;
  onSelectDealDeck: (deckType: 'small_deal' | 'big_deal') => void;
  onAnimationChange: (animating: boolean) => void;
  onRollDice: (diceCount?: number) => void;
  onNextBotStep: () => void;
  onChooseDealType: (deck: 'small_deal' | 'big_deal') => void;
  onBuyDeal: (shareQty?: number) => void;
  onSellStock: (shareQty: number) => void;
  onSkipStockSell: () => void;
  onPassDeal: () => void;
  onStartAuction: (startingBid: number) => void;
  onPlaceBid: (amount: number) => void;
  onPassAuction: () => void;
  onCloseAuction: () => void;
  onMarketRespond: (sellAssetIds: string[]) => void;
  onPayDoodad: () => void;
  onDecideCharity: (donate: boolean) => void;
  onChooseDream: (dreamId: string) => void;
  onDecideFastTrack: (buy: boolean) => void;
  onEndTurn: () => void;
}

function formatDelta(val: number): string {
  if (val === 0) return '0';
  return `${val > 0 ? '+' : ''}${val.toLocaleString()} ฿`;
}

const PlayerAdminFinanceCard: React.FC<{
  player: Player;
  isActiveTurn: boolean;
  language: Language;
}> = ({ player, isActiveTurn, language }) => {
  const f = player.finance;
  const totalBankPrincipal = f.bankLoans.reduce((sum, loan) => sum + loan.principal, 0);
  const totalDebt =
    f.liabilities.homeMortgageBalance +
    f.liabilities.schoolLoanBalance +
    f.liabilities.carLoanBalance +
    f.liabilities.creditCardBalance +
    f.liabilities.otherDebtBalance +
    totalBankPrincipal;

  const escapeRatio = Math.min(100, Math.round((f.passiveIncome / Math.max(1, f.totalExpenses)) * 100));
  const ftProgress = Math.min(
    100,
    Math.round((f.fastTrackAddedCashFlow / FAST_TRACK_WIN_CASHFLOW_TARGET) * 100)
  );
  const dream = player.dreamId ? DREAM_OPTIONS.find((d) => d.id === player.dreamId) : null;
  const delta = f.lastDelta;

  const liabilityRows = [
    { key: 'home', label: t(language, 'homeMortgageExp'), balance: f.liabilities.homeMortgageBalance },
    { key: 'school', label: t(language, 'schoolLoanExp'), balance: f.liabilities.schoolLoanBalance },
    { key: 'car', label: t(language, 'carLoanExp'), balance: f.liabilities.carLoanBalance },
    { key: 'cc', label: t(language, 'creditCardExp'), balance: f.liabilities.creditCardBalance },
    { key: 'other', label: t(language, 'otherDebtExp'), balance: f.liabilities.otherDebtBalance },
  ].filter((row) => row.balance > 0);

  return (
    <article
      className={`flex flex-col bg-white rounded-xl border p-3 shadow-2xs space-y-2.5 text-xs transition-all ${
        isActiveTurn
          ? 'border-orange-400 ring-2 ring-orange-200/80'
          : 'border-slate-200'
      }`}
    >
      {/* Header: Identity, Turn Highlight, Track & Cash */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="flex items-start gap-2 min-w-0">
          <PlayerAvatar
            avatarId={player.avatarId}
            color={player.color}
            isBot={player.isBot}
            isActiveTurn={isActiveTurn}
            size="sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-display font-bold text-sm text-slate-900 truncate">
                {player.name}
              </span>
              {player.isBot && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
                  <Bot className="w-2.5 h-2.5" />
                  Robot
                </span>
              )}
              {isActiveTurn && (
                <span className="text-[10px] font-bold text-orange-800 bg-orange-100 border border-orange-300 px-1.5 py-0.5 rounded">
                  {t(language, 'activeTurnBadge')}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {player.career.name[language]}
              {f.childrenCount > 0 && ` · ${t(language, 'childrenCount')}: ${f.childrenCount}`}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span
            className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
              player.track === 'fast_track'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {player.track === 'fast_track' ? t(language, 'fastTrackTrack') : t(language, 'ratRaceTrack')}
          </span>
          <div className="font-mono font-bold text-sm text-emerald-600 tabular-nums mt-0.5">
            {f.cash.toLocaleString()} ฿
          </div>
        </div>
      </div>

      {/* Dream Badge */}
      {dream && (
        <div className="flex items-center justify-between gap-2 bg-pink-50/80 border border-pink-200 rounded-lg px-2 py-1 text-[11px]">
          <span className="font-semibold text-pink-900 flex items-center gap-1 truncate">
            <Sparkles className="w-3 h-3 text-pink-500 shrink-0" />
            <span className="truncate">{dream.name[language]}</span>
          </span>
          <span className="font-mono font-bold text-pink-700 shrink-0 tabular-nums">
            {(dream.cost / 1000000).toFixed(1)}M ฿
          </span>
        </div>
      )}

      {/* Core Metrics */}
      {player.track === 'rat_race' ? (
        <>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5">
              <div className="text-slate-500 truncate">{t(language, 'totalIncome')}</div>
              <div className="font-mono font-bold text-slate-900 tabular-nums">
                {f.totalIncome.toLocaleString()} ฿
              </div>
              <div className="text-[10px] text-slate-400 font-mono truncate">
                {player.career.salary.toLocaleString()} + {f.passiveIncome.toLocaleString()}
              </div>
            </div>
            <div className="bg-pink-50/60 border border-pink-200/80 rounded-lg px-2 py-1.5">
              <div className="text-pink-700 truncate">{t(language, 'totalExpenses')}</div>
              <div className="font-mono font-bold text-pink-600 tabular-nums">
                {f.totalExpenses.toLocaleString()} ฿
              </div>
              <div className="text-[10px] text-pink-500 font-mono truncate">
                {t(language, 'totalDebtLabel')}: {totalDebt.toLocaleString()}
              </div>
            </div>
            <div className="bg-violet-50/70 border border-violet-200/80 rounded-lg px-2 py-1.5">
              <div className="text-violet-700 truncate">{t(language, 'passiveIncome')}</div>
              <div className="font-mono font-bold text-violet-700 tabular-nums">
                {f.passiveIncome.toLocaleString()} ฿
              </div>
            </div>
            <div className="bg-orange-50/80 border border-orange-200 rounded-lg px-2 py-1.5">
              <div className="text-orange-800 truncate">
                {language === 'th' ? 'เงินคงเหลือต่อเดือน' : 'Payday'}
              </div>
              <div
                className={`font-mono font-bold tabular-nums ${
                  f.monthlyCashFlow >= 0 ? 'text-emerald-600' : 'text-pink-600'
                }`}
              >
                {f.monthlyCashFlow.toLocaleString()} ฿
              </div>
            </div>
          </div>

          {/* Escape Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-600 font-semibold flex items-center gap-1 truncate">
                <TrendingUp className="w-3 h-3 text-violet-600 shrink-0" />
                <span>{language === 'th' ? 'หลุดจากสนามแข่งหนู' : 'Rat Race Escape'}</span>
              </span>
              <span className="font-mono font-bold text-violet-700 tabular-nums">{escapeRatio}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all duration-300"
                style={{ width: `${escapeRatio}%` }}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-2 py-1.5">
              <div className="text-amber-900 font-medium">
                {language === 'th' ? 'วันรับกระแสเงินสด' : 'Cashflow Day'}
              </div>
              <div className="font-mono font-bold text-amber-950 tabular-nums">
                {(f.fastTrackCashFlowDay + f.fastTrackAddedCashFlow).toLocaleString()} ฿
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">
              <div className="text-emerald-800 font-medium">
                {language === 'th' ? 'เพิ่มจากวงนอก' : 'FT Added'}
              </div>
              <div className="font-mono font-bold text-emerald-700 tabular-nums">
                +{f.fastTrackAddedCashFlow.toLocaleString()} / 500k
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-emerald-800 font-semibold">
                {language === 'th' ? 'เป้าหมายเส้นทางเศรษฐี (+500k)' : 'Fast Track Goal (+500k)'}
              </span>
              <span className="font-mono font-bold text-emerald-700 tabular-nums">{ftProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${ftProgress}%` }}
              />
            </div>
          </div>
        </>
      )}

      {/* Bank Loan Badge */}
      {totalBankPrincipal > 0 && (
        <div className="flex items-center justify-between bg-pink-50 border border-pink-200 rounded-lg px-2 py-1 text-[11px]">
          <span className="font-semibold text-pink-800 flex items-center gap-1">
            <Landmark className="w-3 h-3 shrink-0" />
            <span>{language === 'th' ? 'กู้ธนาคาร (10%)' : 'Bank Loan (10%)'}</span>
          </span>
          <span className="font-mono font-bold text-pink-600 tabular-nums">
            {totalBankPrincipal.toLocaleString()} ฿
          </span>
        </div>
      )}

      {/* Last Delta Summary */}
      {delta && (
        <div className="bg-orange-50/80 border border-orange-200 rounded-lg px-2 py-1.5 text-[11px] space-y-0.5">
          <div className="font-semibold text-orange-800 truncate">{delta.reason[language]}</div>
          <div className="flex flex-wrap gap-2 font-mono tabular-nums">
            {delta.cashDelta !== 0 && (
              <span
                className={`inline-flex items-center gap-0.5 font-bold ${
                  delta.cashDelta > 0 ? 'text-emerald-600' : 'text-pink-600'
                }`}
              >
                {delta.cashDelta > 0 ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {language === 'th' ? 'เงินสด' : 'Cash'} {formatDelta(delta.cashDelta)}
              </span>
            )}
            {delta.passiveIncomeDelta !== 0 && (
              <span className="font-bold text-violet-700">
                {language === 'th' ? 'รายได้จากทรัพย์สิน' : 'Passive'} {formatDelta(delta.passiveIncomeDelta)}
              </span>
            )}
            {delta.totalExpensesDelta !== 0 && (
              <span
                className={`font-bold ${
                  delta.totalExpensesDelta < 0 ? 'text-emerald-600' : 'text-pink-600'
                }`}
              >
                {language === 'th' ? 'รายจ่าย' : 'Exp'} {formatDelta(delta.totalExpensesDelta)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Compact Assets List */}
      <div className="border-t border-slate-100 pt-2 space-y-1">
        <div className="font-bold text-slate-700 text-[11px] flex items-center justify-between">
          <span>
            {player.track === 'fast_track'
              ? t(language, 'ftAssetsTitle')
              : t(language, 'assetsSection')}
          </span>
          <span className="font-mono text-slate-500">
            ({player.track === 'fast_track' ? f.fastTrackAssets.length : f.assets.length})
          </span>
        </div>

        {player.track === 'fast_track' ? (
          f.fastTrackAssets.length === 0 ? (
            <div className="text-[11px] text-slate-400 italic">{t(language, 'ftNoAssets')}</div>
          ) : (
            <div className="space-y-1 max-h-24 overflow-y-auto pr-0.5">
              {f.fastTrackAssets.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-1.5 bg-emerald-50/60 border border-emerald-200/80 rounded px-2 py-1 text-[11px]"
                >
                  <span className="truncate font-medium text-slate-800">{a.name[language]}</span>
                  {a.cashFlow !== 0 && (
                    <span className="font-mono font-bold text-emerald-600 shrink-0 tabular-nums">
                      {a.cashFlow > 0 ? '+' : ''}
                      {a.cashFlow.toLocaleString()}/m
                    </span>
                  )}
                </div>
              ))}
            </div>
          )
        ) : f.assets.length === 0 ? (
          <div className="text-[11px] text-slate-400 italic">{t(language, 'noAssets')}</div>
        ) : (
          <div className="space-y-1 max-h-24 overflow-y-auto pr-0.5">
            {f.assets.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-1.5 bg-slate-50 border border-slate-200/80 rounded px-2 py-1 text-[11px]"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-800">
                    {getAssetTypeLabel(a, language)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono leading-snug">
                    {getAssetDetailLines(a, language).map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                </div>
                {a.cashFlow !== 0 && (
                  <span
                    className={`font-mono font-bold shrink-0 tabular-nums ${
                      a.cashFlow < 0 ? 'text-pink-600' : 'text-emerald-600'
                    }`}
                  >
                    {a.cashFlow > 0 ? '+' : ''}
                    {a.cashFlow.toLocaleString()}/m
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fast Track Pink Space Purchases Frame */}
      {player.track === 'fast_track' && (
        <div className="bg-pink-50 border-2 border-pink-300 rounded-lg p-2 space-y-1">
          <div className="font-bold text-pink-800 text-[11px] flex items-center justify-between">
            <span>{t(language, 'ftPinkPurchasesTitle')}</span>
            <span className="font-mono text-pink-700">
              ({(f.fastTrackPinkPurchases || []).length})
            </span>
          </div>
          {!f.fastTrackPinkPurchases || f.fastTrackPinkPurchases.length === 0 ? (
            <div className="text-[11px] text-pink-500/80 italic">{t(language, 'ftNoPinkPurchases')}</div>
          ) : (
            <div className="space-y-1 max-h-24 overflow-y-auto pr-0.5">
              {f.fastTrackPinkPurchases.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-1.5 bg-white border border-pink-200 rounded px-2 py-1 text-[11px]"
                >
                  <span className="truncate font-semibold text-pink-950">
                    {item.isDreamGoal ? '★ ' : ''}
                    {item.name[language]}
                  </span>
                  <span className="font-mono font-bold text-pink-600 shrink-0 tabular-nums">
                    {item.cost.toLocaleString()} ฿
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compact Liabilities List (Rat Race balances > 0) */}
      {player.track === 'rat_race' && liabilityRows.length > 0 && (
        <div className="border-t border-slate-100 pt-2 space-y-1">
          <div className="font-bold text-slate-700 text-[11px]">{t(language, 'liabilitiesSection')}</div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            {liabilityRows.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-1 bg-slate-50 border border-slate-200/70 rounded px-1.5 py-0.5"
              >
                <span className="text-slate-600 truncate">{row.label}</span>
                <span className="font-mono font-semibold text-slate-800 shrink-0 tabular-nums">
                  {row.balance.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  roomState,
  uiState,
  localPlayerId,
  language,
  errorMsg,
  isBoardAnimating,
  onSelectDealDeck,
  onAnimationChange,
  onRollDice,
  onNextBotStep,
  onChooseDealType,
  onBuyDeal,
  onSellStock,
  onSkipStockSell,
  onPassDeal,
  onStartAuction,
  onPlaceBid,
  onPassAuction,
  onCloseAuction,
  onMarketRespond,
  onPayDoodad,
  onDecideCharity,
  onChooseDream,
  onDecideFastTrack,
  onEndTurn,
}) => {
  const players = uiState.players;
  const activeTurnPlayerId = players[uiState.currentTurnIndex]?.id || '';

  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  const [leftPercent, setLeftPercent] = useState<number>(() =>
    readStoredPct(
      'cashflow_admin_left_pct',
      DEFAULT_ADMIN_LEFT_PCT,
      MIN_ADMIN_LEFT_PCT,
      MAX_ADMIN_LEFT_PCT
    )
  );
  const [bottomPercent, setBottomPercent] = useState<number>(() =>
    readStoredPct(
      'cashflow_admin_bottom_pct',
      DEFAULT_ADMIN_BOTTOM_PCT,
      MIN_ADMIN_BOTTOM_PCT,
      MAX_ADMIN_BOTTOM_PCT
    )
  );
  const [leftPaneWidthPx, setLeftPaneWidthPx] = useState<number>(0);

  const mainRef = useRef<HTMLElement | null>(null);
  const leftSectionRef = useRef<HTMLElement | null>(null);
  const rightColRef = useRef<HTMLDivElement | null>(null);
  const dragStartLeftPctRef = useRef<number>(DEFAULT_ADMIN_LEFT_PCT);
  const dragStartBottomPctRef = useRef<number>(DEFAULT_ADMIN_BOTTOM_PCT);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cashflow_admin_left_pct', String(leftPercent));
    } catch {
      // ignore storage quota errors
    }
  }, [leftPercent]);

  useEffect(() => {
    try {
      localStorage.setItem('cashflow_admin_bottom_pct', String(bottomPercent));
    } catch {
      // ignore storage quota errors
    }
  }, [bottomPercent]);

  useEffect(() => {
    const el = leftSectionRef.current;
    if (!el) return;
    setLeftPaneWidthPx(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setLeftPaneWidthPx(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardGridColsClass = !isDesktop
    ? `grid-cols-1 sm:grid-cols-2 ${players.length >= 5 ? '2xl:grid-cols-3' : ''}`
    : leftPaneWidthPx > 0 && leftPaneWidthPx < 480
    ? 'grid-cols-1'
    : leftPaneWidthPx >= 860 && players.length >= 5
    ? 'grid-cols-3'
    : 'grid-cols-2';

  const resizeHint =
    language === 'th'
      ? 'ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อรีเซ็ต'
      : 'Drag to resize · Double-click to reset';

  return (
    <main
      ref={mainRef}
      className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden"
    >
      {/* Frame 1: Left pane — All Players Financial Statements in Columns (horizontally resizable) */}
      <section
        ref={leftSectionRef}
        style={isDesktop ? { width: `${leftPercent}%` } : undefined}
        className="flex flex-col min-h-[460px] lg:min-h-0 lg:h-full lg:shrink-0 bg-slate-50/90 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-hidden"
      >
        <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-emerald-600 shrink-0" />
            <h2 className="text-xs font-bold text-slate-800 truncate">
              {t(language, 'allPlayersFinanceTitle')}
            </h2>
          </div>
          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
            {players.length}/6
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className={`grid ${cardGridColsClass} gap-2.5 items-start`}>
            {players.map((p) => (
              <PlayerAdminFinanceCard
                key={p.id}
                player={p}
                isActiveTurn={p.id === activeTurnPlayerId}
                language={language}
              />
            ))}
          </div>
        </div>
      </section>

      <ResizeHandle
        orientation="vertical"
        title={resizeHint}
        className="hidden lg:flex z-20 shrink-0"
        onDragStart={() => {
          dragStartLeftPctRef.current = leftPercent;
        }}
        onDragMove={(deltaPx) => {
          const totalWidth = mainRef.current?.clientWidth || 0;
          if (totalWidth <= 0) return;
          const deltaPct = (deltaPx / totalWidth) * 100;
          const next = Math.min(
            MAX_ADMIN_LEFT_PCT,
            Math.max(MIN_ADMIN_LEFT_PCT, dragStartLeftPctRef.current + deltaPct)
          );
          setLeftPercent(Math.round(next * 10) / 10);
        }}
        onDoubleClick={() => setLeftPercent(DEFAULT_ADMIN_LEFT_PCT)}
      />

      {/* Right pane: Stacked Top (Game Board) + Bottom (Step Narration & Activity Log) */}
      <div
        ref={rightColRef}
        className="flex-1 min-w-0 flex flex-col min-h-0 lg:h-full overflow-hidden"
      >
        {/* Frame 2: Top-Right — Game Board */}
        <section
          style={isDesktop ? { height: `${100 - bottomPercent}%` } : undefined}
          className="min-h-[380px] lg:min-h-0 lg:shrink-0 flex items-center justify-center p-2 overflow-hidden border-b border-slate-200"
        >
          <CashflowBoard
            roomState={roomState}
            language={language}
            localPlayerId={localPlayerId}
            onSelectDealDeck={onSelectDealDeck}
            onAnimationChange={onAnimationChange}
          />
        </section>

        <ResizeHandle
          orientation="horizontal"
          title={resizeHint}
          className="hidden lg:flex z-20 shrink-0"
          onDragStart={() => {
            dragStartBottomPctRef.current = bottomPercent;
          }}
          onDragMove={(deltaPx) => {
            const totalHeight = rightColRef.current?.clientHeight || 0;
            if (totalHeight <= 0) return;
            const deltaPct = (deltaPx / totalHeight) * 100;
            const next = Math.min(
              MAX_ADMIN_BOTTOM_PCT,
              Math.max(MIN_ADMIN_BOTTOM_PCT, dragStartBottomPctRef.current - deltaPct)
            );
            setBottomPercent(Math.round(next * 10) / 10);
          }}
          onDoubleClick={() => setBottomPercent(DEFAULT_ADMIN_BOTTOM_PCT)}
        />

        {/* Frame 3: Bottom-Right — Game Progression Messages & Log (vertically resizable) */}
        <section
          style={isDesktop ? { height: `${bottomPercent}%` } : undefined}
          className="min-h-[300px] lg:min-h-0 lg:shrink-0 overflow-hidden"
        >
          <StepActionPanel
            layoutMode="adminBottom"
            roomState={uiState}
            localPlayerId={localPlayerId}
            language={language}
            errorMsg={errorMsg}
            isAnimating={isBoardAnimating}
            onRollDice={onRollDice}
            onNextBotStep={onNextBotStep}
            onChooseDealType={onChooseDealType}
            onBuyDeal={onBuyDeal}
            onSellStock={onSellStock}
            onSkipStockSell={onSkipStockSell}
            onPassDeal={onPassDeal}
            onStartAuction={onStartAuction}
            onPlaceBid={onPlaceBid}
            onPassAuction={onPassAuction}
            onCloseAuction={onCloseAuction}
            onMarketRespond={onMarketRespond}
            onPayDoodad={onPayDoodad}
            onDecideCharity={onDecideCharity}
            onChooseDream={onChooseDream}
            onDecideFastTrack={onDecideFastTrack}
            onEndTurn={onEndTurn}
          />
        </section>
      </div>
    </main>
  );
};
