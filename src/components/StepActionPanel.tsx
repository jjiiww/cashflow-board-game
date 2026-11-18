import React, { useEffect, useRef, useState } from 'react';
import {
  Dices,
  ArrowRight,
  Gavel,
  Sparkles,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { DREAM_OPTIONS } from '../../shared/board';
import { formatStockSymbol } from '../../shared/cards';
import {
  DealCard,
  DoodadCard,
  GameRoomState,
  Language,
  MarketCard,
} from '../../shared/types';
import { t } from '../i18n';
import { ActivityLogPanel } from './ActivityLogPanel';
import { ResizeHandle } from './ResizeHandle';

const DEFAULT_ADMIN_SPLIT_PCT = 56;
const MIN_ADMIN_SPLIT_PCT = 25;
const MAX_ADMIN_SPLIT_PCT = 78;

function readStoredSplitPct(key: string, fallback: number, min: number, max: number): number {
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

interface StepActionPanelProps {
  layoutMode?: 'sidebar' | 'adminBottom';
  roomState: GameRoomState;
  localPlayerId: string;
  language: Language;
  errorMsg: string | null;
  isAnimating?: boolean;
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

export const StepActionPanel: React.FC<StepActionPanelProps> = ({
  layoutMode = 'sidebar',
  roomState,
  localPlayerId,
  language,
  errorMsg,
  isAnimating = false,
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
  const [shareQty, setShareQty] = useState('10');
  const [otherSellQty, setOtherSellQty] = useState('');
  const [auctionStartFee, setAuctionStartFee] = useState('1000');
  const [bidAmount, setBidAmount] = useState('1000');
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([]);
  const [adminSplitPct, setAdminSplitPct] = useState<number>(() =>
    readStoredSplitPct(
      'cashflow_admin_bottom_split_pct',
      DEFAULT_ADMIN_SPLIT_PCT,
      MIN_ADMIN_SPLIT_PCT,
      MAX_ADMIN_SPLIT_PCT
    )
  );
  const [adminContainerWidth, setAdminContainerWidth] = useState<number>(800);
  const adminBottomRef = useRef<HTMLElement | null>(null);
  const dragStartSplitPctRef = useRef<number>(DEFAULT_ADMIN_SPLIT_PCT);

  const isAdminBottom = layoutMode === 'adminBottom';
  const isAdminSideBySide = isAdminBottom && adminContainerWidth >= 460;

  useEffect(() => {
    try {
      localStorage.setItem('cashflow_admin_bottom_split_pct', String(adminSplitPct));
    } catch {
      // ignore storage quota errors
    }
  }, [adminSplitPct]);

  useEffect(() => {
    if (!isAdminBottom) return;
    const el = adminBottomRef.current;
    if (!el) return;
    setAdminContainerWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setAdminContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isAdminBottom]);

  const currentPlayer = roomState.players[roomState.currentTurnIndex];
  const localPlayer = roomState.players.find((p) => p.id === localPlayerId);
  const isMyTurn = currentPlayer?.id === localPlayerId;
  const isHost = roomState.hostId === localPlayerId;

  const activeCard = roomState.activeCard;
  const myPendingStockSell = !isMyTurn
    ? roomState.pendingStockSells.find((s) => s.playerId === localPlayerId && !s.responded)
    : undefined;

  useEffect(() => {
    if (myPendingStockSell) {
      setOtherSellQty(String(myPendingStockSell.sharesOwned));
    }
  }, [activeCard?.id, myPendingStockSell?.playerId, myPendingStockSell?.sharesOwned]);

  useEffect(() => {
    if (roomState.auction) {
      const nextMin = roomState.auction.highestBidderId
        ? roomState.auction.highestBid + 1000
        : Math.max(0, roomState.auction.startingBid);
      setBidAmount(String(nextMin));
    }
  }, [
    roomState.auction?.highestBid,
    roomState.auction?.highestBidderId,
    roomState.auction?.startingBid,
  ]);

  const formatMarketTag = (tag: string): string => {
    const map: Record<string, { th: string; en: string }> = {
      tuktaw: { th: 'ตึกแถว (1/2/4 คูหา)', en: 'Row House (1/2/4-Unit)' },
      rental_house: { th: 'บ้านเช่า', en: 'Rental House' },
      condo: { th: 'ห้องพักคอนโดมิเนียม', en: 'Condo' },
      apartment: { th: 'กิจการอพาร์ตเมนต์', en: 'Apartment' },
      guesthouse: { th: 'กิจการเกสต์เฮ้าส์', en: 'Guesthouse' },
      carwash: { th: 'กิจการล้างรถ', en: 'Car Wash' },
      software: { th: 'บริษัทซอฟต์แวร์', en: 'Software Co.' },
      semiconductor: { th: 'บริษัทผลิตตัวนำไฟฟ้า', en: 'Semiconductor Co.' },
      lp: { th: 'ห้างหุ้นส่วนจำกัด', en: 'Limited Partnership' },
      land_10rai: { th: 'ที่ดิน 10 ไร่', en: '10 Rai Land' },
      land_100sqw: { th: 'ที่ดิน 100 ตารางวา', en: '100 Sq.Wah Land' },
      gold: { th: 'เหรียญทอง / ทองคำ', en: 'Gold Coins' },
      mini_mall: { th: 'ห้างขนาดเล็ก', en: 'Mini-Mall' },
      small_business: { th: 'กิจการขนาดเล็ก', en: 'Small Business' },
      vending_no_buyer: { th: 'ตู้ขายเครื่องดื่มอัตโนมัติ', en: 'Vending Business' },
      carwash_no_buyer: { th: 'กิจการล้างรถอัตโนมัติ', en: 'Automated Car Wash' },
      arcade_no_buyer: { th: 'กิจการตู้เกมหยอดเหรียญ', en: 'Arcade Business' },
    };
    return map[tag]?.[language] || tag;
  };

  const renderCardBox = () => {
    if (!activeCard) return null;

    if (activeCard.deck === 'small_deal' || activeCard.deck === 'big_deal') {
      const card = activeCard as DealCard;
      if (card.kind === 'deal_expense') {
        return (
          <div className="bg-pink-50 text-slate-900 rounded-xl p-3.5 border-2 border-pink-400 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-pink-600">
                {card.deck === 'small_deal' ? t(language, 'smallDeal') : t(language, 'bigDeal')} ·{' '}
                {language === 'th' ? 'ค่าใช้จ่ายทรัพย์สิน' : 'Property Expense'}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-pink-100 text-pink-800 border border-pink-300">
                {language === 'th' ? 'มีผลเฉพาะผู้ที่มีทรัพย์สินตามเงื่อนไข' : 'Applies to matching owners'}
              </span>
            </div>
            <h4 className="font-display font-bold text-base text-slate-900">{card.title[language]}</h4>
            <p className="text-xs text-slate-700 leading-relaxed">{card.description[language]}</p>
            <div className="bg-white p-2 rounded-lg border border-pink-200 flex items-center justify-between text-xs">
              <span className="text-slate-500">{language === 'th' ? 'ยอดที่ต้องจ่าย' : 'Expense Amount'}</span>
              <span className="font-mono font-bold text-pink-600 text-sm tabular-nums">
                -{card.cost.toLocaleString()} ฿
              </span>
            </div>
          </div>
        );
      }

      const isStock = card.kind === 'stock';
      const isSplit = card.kind === 'stock_split';
      const canSellRight =
        card.canSellRight !== undefined
          ? card.canSellRight
          : !isStock && !isSplit && card.kind !== 'cd';
      const localStockHolding = localPlayer?.finance.assets.find(
        (a) => a.category === 'stock' && a.symbol === card.symbol
      );
      const annualRoi =
        card.downPayment > 0 && card.cashFlow !== 0
          ? Math.round(((card.cashFlow * 12) / card.downPayment) * 100)
          : null;

      return (
        <div className="bg-emerald-50/80 text-slate-900 rounded-xl p-3.5 border-2 border-emerald-400 space-y-2.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-emerald-700">
                {card.deck === 'small_deal' ? t(language, 'smallDeal') : t(language, 'bigDeal')}
              </span>
              {card.symbol && (
                <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-emerald-500 text-white shrink-0">
                  {formatStockSymbol(card.symbol, language)}
                </span>
              )}
            </div>
            <div
              className={`w-full text-[11px] font-bold px-2.5 py-1 rounded-md border ${
                canSellRight
                  ? 'bg-orange-100 text-orange-800 border-orange-300'
                  : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              {isStock
                ? t(language, 'stockRuleBadge')
                : isSplit
                ? t(language, 'splitRuleBadge')
                : canSellRight
                ? t(language, 'dealSellableBadge')
                : t(language, 'dealExclusiveBadge')}
            </div>
            <h4 className="w-full font-display font-bold text-base text-slate-900">
              {card.title[language]}
            </h4>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed">{card.description[language]}</p>

          {isStock ? (
            <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-emerald-200">
              <div>
                <span className="text-slate-500">{t(language, 'pricePerShare')}</span>
                <div className="font-mono font-bold text-slate-900 tabular-nums">
                  {(card.pricePerShare || card.cost).toLocaleString()} ฿
                </div>
              </div>
              <div>
                <span className="text-slate-500">{t(language, 'tradingRange')}</span>
                <div className="font-mono font-semibold text-slate-700 tabular-nums">
                  {card.tradingRange || '-'}
                </div>
              </div>
              {card.dividendPerMonth ? (
                <div className="col-span-2 pt-1 border-t border-slate-100 flex justify-between">
                  <span className="text-slate-600">{t(language, 'dividendLabel')}</span>
                  <span className="font-mono font-bold text-emerald-600 tabular-nums">
                    +{card.dividendPerMonth.toLocaleString()} ฿/mo
                  </span>
                </div>
              ) : null}
            </div>
          ) : isSplit ? (
            <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-emerald-200">
              <div>
                <span className="text-slate-500">{t(language, 'splitRatioLabel')}</span>
                <div className="font-mono font-bold text-emerald-700 tabular-nums">
                  {card.splitRatio === 2 ? '2 : 1 (×2)' : '1 : 2 (÷2)'}
                </div>
              </div>
              {localStockHolding && (
                <div>
                  <span className="text-slate-500">{t(language, 'ownedShares')}</span>
                  <div className="font-mono font-bold text-violet-700 tabular-nums">
                    {(localStockHolding.shares || 0).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-emerald-200">
              <div>
                <span className="text-slate-500">{t(language, 'cost')}</span>
                <div className="font-mono font-bold text-slate-900 tabular-nums">
                  {card.cost.toLocaleString()} ฿
                </div>
              </div>
              <div>
                <span className="text-slate-500">{t(language, 'downPayment')}</span>
                <div className="font-mono font-bold text-orange-600 tabular-nums">
                  {card.downPayment.toLocaleString()} ฿
                </div>
              </div>
              <div>
                <span className="text-slate-500">{t(language, 'mortgage')}</span>
                <div className="font-mono font-semibold text-slate-700 tabular-nums">
                  {card.mortgage.toLocaleString()} ฿
                </div>
              </div>
              <div>
                <span className="text-slate-500">{t(language, 'cashflowPerMonth')}</span>
                <div
                  className={`font-mono font-bold tabular-nums ${
                    card.cashFlow >= 0 ? 'text-emerald-600' : 'text-pink-600'
                  }`}
                >
                  {card.cashFlow >= 0 ? '+' : ''}
                  {card.cashFlow.toLocaleString()} ฿
                </div>
              </div>
              {card.units ? (
                <div>
                  <span className="text-slate-500">{t(language, 'unitsLabel')}</span>
                  <div className="font-mono font-bold text-slate-800 tabular-nums">
                    {card.units.toLocaleString()}
                  </div>
                </div>
              ) : null}
              {annualRoi !== null ? (
                <div>
                  <span className="text-slate-500">{t(language, 'annualRoiLabel')}</span>
                  <div className="font-mono font-bold text-violet-700 tabular-nums">
                    {annualRoi.toLocaleString()}%
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      );
    }

    if (activeCard.deck === 'market') {
      const card = activeCard as MarketCard;
      const offerSummary = (() => {
        if (card.offerType === 'per_unit') {
          return `${card.offerAmount.toLocaleString()} ฿ (${t(language, 'perUnitLabel')})`;
        }
        if (card.offerType === 'multiplier') {
          return language === 'th'
            ? `${card.offerAmount} เท่าของเงินลงทุน`
            : `${card.offerAmount}x investment`;
        }
        if (card.offerType === 'cost_plus') {
          return language === 'th'
            ? `ราคาซื้อเดิม +${card.offerAmount.toLocaleString()} ฿`
            : `Cost +${card.offerAmount.toLocaleString()} ฿`;
        }
        if (card.offerType === 'cashflow_boost') {
          return language === 'th'
            ? `+${card.offerAmount.toLocaleString()} ฿/เดือน ต่อธุรกิจ`
            : `+${card.offerAmount.toLocaleString()} ฿/mo per business`;
        }
        if (card.offerType === 'cashflow_adjust') {
          return language === 'th'
            ? `${card.offerAmount.toLocaleString()} ฿/เดือน`
            : `${card.offerAmount.toLocaleString()} ฿/mo`;
        }
        if (card.offerType === 'foreclose_refund') {
          return language === 'th' ? 'คืนธนาคารและรับเงินดาวน์คืน' : 'Return to bank & refund down payment';
        }
        return `${card.offerAmount.toLocaleString()} ฿ (${t(language, 'fixedOfferLabel')})`;
      })();

      const targetText =
        card.offerType === 'cashflow_boost'
          ? language === 'th'
            ? 'ธุรกิจทุกชนิด'
            : 'All Businesses'
          : Array.from(new Set(card.targetTags.map(formatMarketTag))).join(', ');

      return (
        <div className="bg-sky-50 text-slate-900 rounded-xl p-3.5 border-2 border-sky-400 space-y-2.5">
          <div className="text-[11px] font-bold text-sky-700">{t(language, 'marketTitle')}</div>
          <h4 className="font-display font-bold text-base text-slate-900">{card.title[language]}</h4>
          <p className="text-xs text-slate-700 leading-relaxed">{card.description[language]}</p>
          <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-sky-200">
            <div>
              <span className="text-slate-500">{t(language, 'marketOfferLabel')}</span>
              <div className="font-mono font-bold text-sky-700 tabular-nums">{offerSummary}</div>
            </div>
            <div>
              <span className="text-slate-500">{t(language, 'marketTargetLabel')}</span>
              <div className="font-semibold text-slate-800">{targetText}</div>
            </div>
          </div>
        </div>
      );
    }

    const card = activeCard as DoodadCard;
    const activeChildrenCount = currentPlayer?.finance.childrenCount ?? localPlayer?.finance.childrenCount ?? 0;
    const effectiveCost = card.onlyIfHasChildren && activeChildrenCount === 0
      ? 0
      : card.perChildCost
      ? card.cost * activeChildrenCount
      : card.cost;

    return (
      <div className="bg-pink-50 text-slate-900 rounded-xl p-3.5 border-2 border-pink-400 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-pink-600">
            {language === 'th' ? 'จ่ายซะ' : 'Doodad Expense'}
          </span>
          {card.onlyIfHasChildren && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-pink-100 text-pink-800 border border-pink-300">
              {t(language, 'childrenOnlyRule')}
            </span>
          )}
        </div>
        <h4 className="font-display font-bold text-base text-slate-900">{card.title[language]}</h4>
        <p className="text-xs text-slate-700 leading-relaxed">{card.description[language]}</p>
        <div className="bg-white p-2 rounded-lg border border-pink-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            {language === 'th' ? 'ยอดที่ต้องจ่าย' : 'Expense Amount'}
            {card.perChildCost && activeChildrenCount > 0
              ? ` (${card.cost.toLocaleString()} × ${activeChildrenCount})`
              : ''}
          </span>
          <span className="font-mono font-bold text-pink-600 text-sm tabular-nums">
            -{effectiveCost.toLocaleString()} ฿
          </span>
        </div>
      </div>
    );
  };

  const renderPhaseControls = () => {
    const phase = roomState.phase;

    const renderOtherStockSellBox = (
      pending: { sharesOwned: number; pricePerShare: number }
    ) => {
      const parsedSellQty = Math.floor(Number(otherSellQty));
      const isValidSellQty =
        otherSellQty.trim() !== '' &&
        Number.isFinite(parsedSellQty) &&
        parsedSellQty >= 1 &&
        parsedSellQty <= pending.sharesOwned;
      const previewQty = isValidSellQty ? parsedSellQty : 0;

      return (
        <div className="bg-sky-50 border border-sky-300 rounded-xl p-3 space-y-2.5">
          <p className="text-xs font-bold text-sky-800">{t(language, 'stockSellPrompt')}</p>

          <div className="space-y-2 text-xs text-slate-800 bg-white/85 border border-sky-200 rounded-lg p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-600">{t(language, 'sharesOwnedColon')} :</span>
              <span className="font-mono font-bold text-violet-700 tabular-nums">
                {pending.sharesOwned.toLocaleString()} {t(language, 'sharesUnit')}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <label className="font-medium text-slate-700 whitespace-nowrap">
                {t(language, 'sellQuantityLabel')} :
              </label>
              <input
                type="number"
                min={1}
                max={pending.sharesOwned}
                value={otherSellQty}
                onChange={(e) => setOtherSellQty(e.target.value)}
                className="w-20 px-2 py-1 rounded-md bg-white border border-sky-300 text-slate-900 font-mono font-bold text-xs tabular-nums"
              />
              <span className="text-slate-600 whitespace-nowrap">{t(language, 'sharesUnit')}</span>
              <button
                type="button"
                onClick={() => setOtherSellQty(String(pending.sharesOwned))}
                className="ml-auto px-2.5 py-1 rounded-md bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-300 font-bold text-[11px] transition-colors whitespace-nowrap cursor-pointer"
              >
                {t(language, 'sellAllBtn')}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-sky-100 text-[11px]">
              <span className="text-slate-500 font-mono tabular-nums">
                {previewQty.toLocaleString()} × {pending.pricePerShare.toLocaleString()} ฿
              </span>
              <span className="font-mono font-bold text-emerald-600 tabular-nums">
                = {(previewQty * pending.pricePerShare).toLocaleString()} ฿
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!isValidSellQty}
              onClick={() => isValidSellQty && onSellStock(parsedSellQty)}
              className="flex-1 py-2.5 px-3 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs transition-colors cursor-pointer"
            >
              {t(language, 'sellShares')}
            </button>
            <button
              type="button"
              onClick={onSkipStockSell}
              className="flex-1 py-2.5 px-3 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs transition-colors cursor-pointer"
            >
              {t(language, 'keepShares')}
            </button>
          </div>
        </div>
      );
    };

    // 1. Robot Step-by-Step Control
    if (phase === 'BOT_THINKING') {
      const myPending = roomState.pendingStockSells.find(
        (s) => s.playerId === localPlayerId && !s.responded
      );
      return (
        <div className="space-y-2.5">
          {myPending && renderOtherStockSellBox(myPending)}
          <div className="flex items-center justify-between gap-3 bg-sky-50 border border-sky-200 rounded-xl p-3">
            <div className="text-xs font-semibold text-sky-800">
              {language === 'th'
                ? `ตาของ ${currentPlayer?.name}`
                : `${currentPlayer?.name}'s Turn`}
            </div>
            <button
              type="button"
              onClick={onNextBotStep}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm transition-colors whitespace-nowrap shrink-0 shadow-xs"
            >
              <span>{t(language, 'nextStep')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    // 2. Roll Dice
    if (phase === 'ROLL_DICE') {
      if (!isMyTurn || localPlayer?.hasWon || localPlayer?.isBankrupt) {
        return (
          <div className="space-y-2">
            {localPlayer?.hasWon && (
              <div className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-300 rounded-xl p-3 leading-relaxed">
                {t(language, 'winnerRetiredBannerMsg')}
              </div>
            )}
            {localPlayer?.isBankrupt && (
              <div className="text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-300 rounded-xl p-3 leading-relaxed">
                {t(language, 'bankruptBannerMsg')}
              </div>
            )}
            <div className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-xl p-3">
              {language === 'th'
                ? `กำลังรอ ${currentPlayer?.name} ทอยลูกเต๋า...`
                : `Waiting for ${currentPlayer?.name} to roll the dice...`}
            </div>
          </div>
        );
      }

      const isFastTrack = localPlayer?.track === 'fast_track';
      const hasCharityRR = !isFastTrack && (localPlayer?.charityTurnsLeft || 0) > 0;
      const hasThreeDice = isFastTrack && Boolean(localPlayer?.hasThreeDiceForever);

      if (isFastTrack && !hasThreeDice) {
        return (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onRollDice(2)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-400 hover:bg-orange-500 text-white font-bold text-sm transition-colors whitespace-nowrap shadow-xs"
            >
              <Dices className="w-4 h-4" />
              <span>{t(language, 'rollDiceTwoFT')}</span>
            </button>
          </div>
        );
      }

      if (isFastTrack && hasThreeDice) {
        return (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onRollDice(1)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-200 hover:bg-orange-300 text-orange-950 font-bold text-sm transition-colors whitespace-nowrap shadow-xs"
            >
              <Dices className="w-4 h-4" />
              <span>{t(language, 'rollDice')}</span>
            </button>
            <button
              type="button"
              onClick={() => onRollDice(2)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-400 hover:bg-orange-500 text-white font-bold text-sm transition-colors whitespace-nowrap shadow-xs"
            >
              <Dices className="w-4 h-4" />
              <span>{t(language, 'rollDiceTwo')}</span>
            </button>
            <button
              type="button"
              onClick={() => onRollDice(3)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm transition-colors whitespace-nowrap shadow-xs"
            >
              <Dices className="w-4 h-4" />
              <span>{t(language, 'rollDiceThree')}</span>
            </button>
          </div>
        );
      }

      return (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onRollDice(1)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-200 hover:bg-orange-300 text-orange-950 font-bold text-sm transition-colors whitespace-nowrap shadow-xs"
          >
            <Dices className="w-4 h-4" />
            <span>{t(language, 'rollDice')}</span>
          </button>
          {hasCharityRR && (
            <button
              type="button"
              onClick={() => onRollDice(2)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-400 hover:bg-orange-500 text-white font-bold text-sm transition-colors whitespace-nowrap shadow-xs"
            >
              <Dices className="w-4 h-4" />
              <span>{t(language, 'rollDiceTwo')}</span>
            </button>
          )}
        </div>
      );
    }

    // 3. Choose Deal Deck (Small / Big)
    if (phase === 'CHOOSE_DEAL_TYPE') {
      if (!isMyTurn) {
        return (
          <div className="text-xs text-slate-500 bg-slate-100 rounded-xl p-3">
            {language === 'th'
              ? `${currentPlayer?.name} กำลังเลือกกองการ์ดโอกาส...`
              : `${currentPlayer?.name} is choosing Small or Big Deal...`}
          </div>
        );
      }
      return (
        <div className="space-y-2.5">
          <p className="text-xs text-emerald-700 font-semibold">{t(language, 'chooseDealPrompt')}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onChooseDealType('small_deal')}
              className="py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-colors shadow-xs"
            >
              {t(language, 'smallDeal')}
            </button>
            <button
              type="button"
              onClick={() => onChooseDealType('big_deal')}
              className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors shadow-xs"
            >
              {t(language, 'bigDeal')}
            </button>
          </div>
        </div>
      );
    }

    // 4. Deal Decision
    if (phase === 'DEAL_DECISION' && activeCard && (activeCard.deck === 'small_deal' || activeCard.deck === 'big_deal')) {
      const card = activeCard as DealCard;
      const isStock = card.kind === 'stock';
      const canSellRight =
        card.canSellRight !== undefined
          ? card.canSellRight
          : !isStock && card.kind !== 'stock_split' && card.kind !== 'cd';
      const sameTrackCount = roomState.players.filter(
        (p) => !p.isBankrupt && !p.hasWon && p.track === (currentPlayer?.track || 'rat_race')
      ).length;
      const parsedStartFee =
        auctionStartFee.trim() !== '' && Number.isFinite(Number(auctionStartFee))
          ? Math.max(0, Math.round(Number(auctionStartFee)))
          : 0;
      const localHolding = localPlayer?.finance.assets.find(
        (a) => a.category === 'stock' && a.symbol === card.symbol
      );

      const myPending = !isMyTurn
        ? roomState.pendingStockSells.find((s) => s.playerId === localPlayerId && !s.responded)
        : undefined;

      return isMyTurn ? (
        isStock ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
            {localHolding && (localHolding.shares || 0) > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                <div>
                  <span className="text-slate-600 font-medium">{t(language, 'sharesOwnedColon')} : </span>
                  <span className="font-mono font-bold text-violet-700 tabular-nums">
                    {(localHolding.shares || 0).toLocaleString()} {t(language, 'sharesUnit')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShareQty(String(localHolding.shares || 0))}
                  className="px-2 py-0.5 rounded-md bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-300 font-bold text-[11px] transition-colors whitespace-nowrap cursor-pointer"
                >
                  {t(language, 'sellAllBtn')}
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-700 font-medium whitespace-nowrap">{t(language, 'sharesQty')}:</label>
              <input
                type="number"
                min={1}
                value={shareQty}
                onChange={(e) => setShareQty(e.target.value)}
                className="w-24 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-mono text-xs"
              />
              <span className="text-xs font-mono font-bold text-emerald-600 tabular-nums">
                = {((Number(shareQty) || 0) * (card.pricePerShare || card.cost)).toLocaleString()} ฿
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onBuyDeal(Number(shareQty) || 1)}
                className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs whitespace-nowrap cursor-pointer"
              >
                {t(language, 'buyShares')}
              </button>
              {localHolding && (localHolding.shares || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => onSellStock(Number(shareQty) || 1)}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs whitespace-nowrap cursor-pointer"
                >
                  {t(language, 'sellShares')}
                </button>
              )}
              <button
                type="button"
                onClick={onPassDeal}
                className="py-2.5 px-4 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs whitespace-nowrap cursor-pointer"
              >
                {t(language, 'passDeal')}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onBuyDeal(1)}
                className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs whitespace-nowrap"
              >
                {t(language, 'buyAsset')} ({card.downPayment.toLocaleString()} ฿)
              </button>
              <button
                type="button"
                onClick={onPassDeal}
                className="py-2.5 px-4 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs whitespace-nowrap"
              >
                {t(language, 'passDeal')}
              </button>
            </div>

            {canSellRight && sameTrackCount >= 2 ? (
              <div className="pt-2.5 border-t border-slate-200 space-y-1.5">
                <p className="text-[11px] text-orange-700 font-medium">{t(language, 'auctionRuleHint')}</p>
                <div className="flex items-stretch gap-2 min-w-0">
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={auctionStartFee}
                    onChange={(e) => setAuctionStartFee(e.target.value)}
                    aria-label={t(language, 'startingFee')}
                    placeholder="0"
                    className="w-24 shrink-0 px-2 py-1.5 rounded-lg bg-white border border-orange-300 text-slate-900 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => onStartAuction(parsedStartFee)}
                    className="flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs text-center leading-tight"
                  >
                    <Gavel className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {t(language, 'sellDealRight')}{' '}
                      <span className="block font-mono text-[11px] font-semibold">
                        ({parsedStartFee.toLocaleString()} ฿)
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            ) : !canSellRight ? (
              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 font-medium">
                {t(language, 'dealExclusiveBadge')}
              </div>
            ) : null}
          </div>
        )
      ) : (
        <div className="space-y-2.5">
          {myPending && renderOtherStockSellBox(myPending)}
          <div className="text-xs text-slate-500 bg-slate-100 rounded-xl p-3">
            {language === 'th'
              ? `${currentPlayer?.name} กำลังตัดสินใจ...`
              : `${currentPlayer?.name} is deciding...`}
          </div>
        </div>
      );
    }

    // 5. Stock Market Sell for OTHER players (SELL ONLY)
    if (phase === 'STOCK_MARKET_SELL' && activeCard && (activeCard.deck === 'small_deal' || activeCard.deck === 'big_deal')) {
      const myPending = roomState.pendingStockSells.find(
        (s) => s.playerId === localPlayerId && !s.responded
      );

      return myPending ? (
        renderOtherStockSellBox(myPending)
      ) : (
        <div className="text-xs text-slate-500 bg-slate-100 rounded-xl p-3">
          {language === 'th'
            ? 'กำลังรอผู้เล่นอื่นที่ถือหุ้นตัดสินใจว่าจะขายหรือไม่...'
            : 'Waiting for other stockholders to decide whether to sell...'}
        </div>
      );
    }

    // 6. Auction Active
    if (phase === 'AUCTION_ACTIVE' && roomState.auction) {
      const auction = roomState.auction;
      const isSeller = auction.sellerId === localPlayerId;
      const hasPassed = auction.passedPlayerIds.includes(localPlayerId);
      const isHighest = auction.highestBidderId === localPlayerId;
      const isSameTrack = localPlayer?.track === (roomState.players.find((p) => p.id === auction.sellerId)?.track || 'rat_race');
      const nextMinBid = auction.highestBidderId
        ? auction.highestBid + 1
        : Math.max(0, auction.startingBid);
      const parsedBid =
        bidAmount.trim() !== '' && Number.isFinite(Number(bidAmount))
          ? Math.max(nextMinBid, Math.round(Number(bidAmount)))
          : nextMinBid;

      return (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-orange-700 flex items-center gap-1.5">
              <Gavel className="w-4 h-4" />
              <span>{t(language, 'auctionTitle')}</span>
            </span>
            <span className="text-xs text-slate-600">
              {language === 'th' ? 'ผู้ขายสิทธิ์:' : 'Seller:'} {auction.sellerName}
            </span>
          </div>

          <p className="text-[11px] text-orange-800/90 leading-relaxed">
            {t(language, 'auctionRuleHint')}
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-orange-200">
            <div>
              <div className="text-slate-500">
                {auction.highestBidderId ? t(language, 'highestBid') : t(language, 'minAcceptablePrice')}
              </div>
              <div className="font-mono font-bold text-orange-600 text-sm tabular-nums">
                {auction.highestBidderId
                  ? `${auction.highestBid.toLocaleString()} ฿`
                  : `${auction.startingBid.toLocaleString()} ฿`}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{t(language, 'highestBidder')}</div>
              <div className="font-bold text-emerald-600 text-sm truncate">
                {auction.highestBidderName || t(language, 'noBidsYet')}
              </div>
            </div>
          </div>

          {!isSeller && !localPlayer?.isBankrupt && !localPlayer?.hasWon && isSameTrack && !hasPassed && !isHighest && (
            <div className="space-y-2">
              <div className="flex items-stretch gap-1.5 min-w-0">
                <input
                  type="number"
                  min={nextMinBid}
                  step={100}
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="w-20 shrink-0 px-2 py-2 rounded-lg bg-white border border-orange-300 text-slate-900 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => onPlaceBid(parsedBid)}
                  className="flex-1 min-w-0 py-1.5 px-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs leading-tight text-center"
                >
                  <span className="block">{t(language, 'placeBid')}</span>
                  <span className="block font-mono text-[11px] font-semibold">
                    ({parsedBid.toLocaleString()} ฿)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onPassAuction}
                  className="shrink-0 py-2 px-3 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold whitespace-nowrap"
                >
                  {t(language, 'passAuction')}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setBidAmount(String(nextMinBid))}
                  className="px-2 py-1 rounded bg-white border border-orange-200 text-[11px] font-mono font-semibold text-orange-700 hover:bg-orange-100"
                >
                  Min ({nextMinBid.toLocaleString()} ฿)
                </button>
                <button
                  type="button"
                  onClick={() => setBidAmount(String(nextMinBid + 500))}
                  className="px-2 py-1 rounded bg-white border border-orange-200 text-[11px] font-mono font-semibold text-orange-700 hover:bg-orange-100"
                >
                  +500 ฿
                </button>
                <button
                  type="button"
                  onClick={() => setBidAmount(String(nextMinBid + 1000))}
                  className="px-2 py-1 rounded bg-white border border-orange-200 text-[11px] font-mono font-semibold text-orange-700 hover:bg-orange-100"
                >
                  +1,000 ฿
                </button>
              </div>
            </div>
          )}

          {isHighest && (
            <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">
              {t(language, 'leadingBidNote')}
            </div>
          )}

          {(isSeller || isHost) && (
            <button
              type="button"
              onClick={onCloseAuction}
              className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors"
            >
              {t(language, 'closeAuction')}
            </button>
          )}
        </div>
      );
    }

    // 7. Market Response
    if (phase === 'MARKET_RESPONSE' && activeCard && activeCard.deck === 'market') {
      const card = activeCard as MarketCard;
      const myPending = roomState.pendingMarketResponses.find(
        (r) => r.playerId === localPlayerId && !r.responded
      );
      const matchingAssets =
        myPending && localPlayer
          ? localPlayer.finance.assets.filter((a) => myPending.assetIds.includes(a.id))
          : [];

      const toggleAsset = (id: string) => {
        setSelectedMarketIds((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
      };

      return myPending ? (
        <div className="bg-sky-50 border border-sky-300 rounded-xl p-3.5 space-y-3">
          <p className="text-xs font-bold text-sky-800">{t(language, 'marketPrompt')}</p>
          <div className="space-y-1.5">
            {matchingAssets.map((a) => {
              const isCashflowAdjust = card.offerType === 'cashflow_adjust';
              const gross = (() => {
                if (card.offerType === 'per_unit') return card.offerAmount * (a.units || 1);
                if (card.offerType === 'multiplier') return a.downPayment * card.offerAmount + a.mortgage;
                if (card.offerType === 'cost_plus') return a.cost + card.offerAmount;
                return card.offerAmount;
              })();
              const net = gross - a.mortgage;
              const checked = selectedMarketIds.includes(a.id);
              return (
                <label
                  key={a.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-sky-200 cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAsset(a.id)}
                      className="accent-sky-500"
                    />
                    <span className="font-semibold text-slate-900">
                      {language === 'th'
                        ? a.name.th.replace(/^ต้องการขาย/, '').replace(/^ต้องการ/, '').trim()
                        : a.name.en.replace(/\s+For Sale$/i, '').trim()}
                    </span>
                  </div>
                  {isCashflowAdjust ? (
                    <span className="font-mono font-bold text-pink-600 tabular-nums">
                      {card.offerAmount.toLocaleString()} ฿/ด.
                    </span>
                  ) : (
                    <span className="font-mono font-bold text-emerald-600 tabular-nums">
                      {net >= 0 ? '+' : ''}
                      {net.toLocaleString()} ฿
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={selectedMarketIds.length === 0}
              onClick={() => {
                onMarketRespond(selectedMarketIds);
                setSelectedMarketIds([]);
              }}
              className="flex-1 py-2.5 px-3 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-bold text-xs"
            >
              {card.offerType === 'cashflow_adjust'
                ? language === 'th'
                  ? 'ตกลงขายให้น้องเขย'
                  : 'Sell to Brother-in-Law'
                : t(language, 'sellSelected')}
            </button>
            <button
              type="button"
              onClick={() => {
                onMarketRespond([]);
                setSelectedMarketIds([]);
              }}
              className="flex-1 py-2.5 px-3 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs"
            >
              {t(language, 'keepAssets')}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-500 bg-slate-100 rounded-xl p-3">
          {language === 'th'
            ? 'กำลังรอผู้เล่นที่มีทรัพย์สินตัดสินใจขาย/ไม่ขาย...'
            : 'Waiting for asset owners to respond to the Market offer...'}
        </div>
      );
    }

    // 8. Doodad Pay (Pink)
    if (phase === 'DOODAD_PAY') {
      return isMyTurn ? (
        <button
          type="button"
          onClick={onPayDoodad}
          className="w-full py-3 px-4 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-sm transition-colors shadow-xs"
        >
          {t(language, 'payDoodad')}
        </button>
      ) : null;
    }

    // 9. Charity Decision
    if (phase === 'CHARITY_DECISION') {
      const donation = Math.round((localPlayer?.finance.totalIncome || 0) * 0.1);
      return isMyTurn ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onDecideCharity(true)}
            className="flex-1 py-2.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs"
          >
            {t(language, 'donateCharity')} ({donation.toLocaleString()} ฿)
          </button>
          <button
            type="button"
            onClick={() => onDecideCharity(false)}
            className="py-2.5 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs"
          >
            {t(language, 'passCharity')}
          </button>
        </div>
      ) : null;
    }

    // 10. Choose Dream
    if (phase === 'CHOOSE_DREAM') {
      return isMyTurn ? (
        <div className="bg-pink-50 border border-pink-300 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-pink-700 font-bold text-sm">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{t(language, 'chooseDreamTitle')}</span>
          </div>
          {currentPlayer?.career && (
            <div className="text-xs font-semibold text-pink-900">
              {currentPlayer.name} ·{' '}
              {language === 'th'
                ? `อาชีพ: ${currentPlayer.career.name.th}`
                : currentPlayer.career.name.en}
            </div>
          )}
          <p className="text-xs text-slate-700">{t(language, 'chooseDreamSub')}</p>
          <div className="space-y-2">
            {DREAM_OPTIONS.map((dream) => (
              <button
                key={dream.id}
                type="button"
                onClick={() => onChooseDream(dream.id)}
                className="w-full text-left p-2.5 rounded-lg bg-white hover:bg-pink-100/70 border border-pink-200 transition-colors flex items-center justify-between gap-2"
              >
                <div>
                  <div className="text-xs font-bold text-slate-900">{dream.name[language]}</div>
                  <div className="text-[11px] text-slate-500">{dream.description[language]}</div>
                </div>
                <span className="font-mono text-xs font-bold text-orange-600 shrink-0">
                  {dream.cost.toLocaleString()} ฿
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null;
    }

    // 11. Fast Track Space Decision
    if (phase === 'FAST_TRACK_DECISION' && roomState.activeFastTrackSpace) {
      const space = roomState.activeFastTrackSpace;
      const isDream = space.type === 'dream';
      const isCharity = space.type === 'charity';
      const isOwnDream = isDream && space.dreamId === currentPlayer?.dreamId;

      const boxTheme = isDream
        ? 'bg-pink-50 border-pink-300'
        : isCharity
        ? 'bg-orange-50 border-orange-300'
        : 'bg-emerald-50 border-emerald-300';
      const titleTheme = isDream
        ? 'text-pink-800'
        : isCharity
        ? 'text-orange-800'
        : 'text-emerald-800';
      const buyBtnTheme = isDream
        ? 'bg-pink-500 hover:bg-pink-600'
        : isCharity
        ? 'bg-orange-500 hover:bg-orange-600'
        : 'bg-emerald-500 hover:bg-emerald-600';

      return (
        <div className={`border-2 rounded-xl p-3.5 space-y-3 ${boxTheme}`}>
          <div>
            <div className={`text-sm font-bold ${titleTheme}`}>{space.label[language]}</div>
            {(isCharity || space.subLabel) && (
              <div className="text-xs text-slate-600 mt-0.5">
                {isCharity
                  ? language === 'th'
                    ? 'ทอยลูกเต๋า 1/2/3 ลูกตลอดไป'
                    : 'Roll 1/2/3 Dice Forever'
                  : space.subLabel?.[language]}
              </div>
            )}
          </div>

          <div className="text-xs font-mono text-slate-800 flex flex-wrap gap-3 bg-white/80 p-2 rounded-lg border border-slate-200">
            {space.cost && (
              <span>
                {t(language, 'cost')}: <strong>{space.cost.toLocaleString()} ฿</strong>
              </span>
            )}
            {space.cashFlow && (
              <span className="text-emerald-600 font-bold">+{space.cashFlow.toLocaleString()} ฿/mo</span>
            )}
            {space.rollWinCashFlow && (
              <span className="text-emerald-600 font-bold">
                🎲 {space.rollThreshold}+ → +{space.rollWinCashFlow.toLocaleString()} ฿/mo
              </span>
            )}
            {space.rollWinTotalPayout && (
              <span className="text-emerald-600 font-bold">
                🎲 {space.rollThreshold}+ → +{space.rollWinTotalPayout.toLocaleString()} ฿
              </span>
            )}
          </div>

          {isDream && (
            <div
              className={`text-xs font-bold px-2.5 py-1.5 rounded-lg ${
                isOwnDream
                  ? 'bg-yellow-300 text-slate-950'
                  : 'bg-white text-pink-700 border border-pink-200'
              }`}
            >
              {isOwnDream ? t(language, 'yourDreamMatch') : t(language, 'otherDreamNote')}
            </div>
          )}

          {isMyTurn && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onDecideFastTrack(true)}
                className={`flex-1 py-2.5 px-3 rounded-lg text-white font-bold text-xs ${buyBtnTheme}`}
              >
                {space.type === 'business_roll' || space.type === 'ipo_roll'
                  ? t(language, 'investAndRoll')
                  : t(language, 'buyFastTrack')}
              </button>
              <button
                type="button"
                onClick={() => onDecideFastTrack(false)}
                className="py-2.5 px-4 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs"
              >
                {t(language, 'passFastTrack')}
              </button>
            </div>
          )}
        </div>
      );
    }

    // 12. Turn Complete
    if (phase === 'TURN_COMPLETE') {
      return (isMyTurn || isHost) ? (
        <button
          type="button"
          onClick={onEndTurn}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-colors shadow-xs"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{t(language, 'endTurn')}</span>
        </button>
      ) : null;
    }

    return null;
  };

  const narrationZone = (
    <div
      style={isAdminSideBySide ? { width: `${adminSplitPct}%` } : undefined}
      className={
        isAdminBottom
          ? isAdminSideBySide
            ? 'p-3 space-y-2.5 h-full shrink-0 min-w-0 overflow-y-auto'
            : 'p-3 space-y-2.5 shrink-0'
          : 'flex-1 min-h-0 p-3.5 space-y-3 overflow-y-auto'
      }
    >
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-orange-600">
            {t(language, 'stepExplanation')}
          </span>
          {currentPlayer && (
            <span className="text-xs text-slate-700 font-semibold">
              {currentPlayer.name}
            </span>
          )}
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 leading-relaxed font-medium space-y-2.5">
          {isAnimating ? (
            <span className="flex items-center gap-2 text-orange-600 font-bold">
              <Dices className="w-4 h-4 animate-spin" />
              <span>{t(language, 'rollingWait')}</span>
            </span>
          ) : (
            <>
              <div className="space-y-1">
                {roomState.currentStepText[language].split('\n').map((line, lineIdx) => {
                  const cleanLine = line
                    .replace(/[\p{Extended_Pictographic}\u2600-\u27BF]\uFE0F?/gu, '')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
                  const isNoHolderLine =
                    cleanLine.includes('ไม่มีผู้เล่นที่มีทรัพย์สินนี้') ||
                    cleanLine.includes('ไม่มีผู้เล่นขายทรัพย์สินนี้') ||
                    cleanLine.includes('No players own this asset') ||
                    cleanLine.includes('No players sold this asset');
                  return (
                    <p
                      key={lineIdx}
                      className={isNoHolderLine ? 'font-extrabold text-slate-950' : undefined}
                    >
                      {cleanLine}
                    </p>
                  );
                })}
              </div>
              {activeCard && renderCardBox()}
            </>
          )}
        </div>
      </div>

      {/* Market Card Sales Summary Frame (directly below blue Market card) */}
      {!isAnimating &&
        activeCard?.deck === 'market' &&
        roomState.marketSummary &&
        roomState.marketSummary.length > 0 &&
        ((activeCard as MarketCard).offerType !== 'cashflow_boost' ||
          !roomState.lastStepDelta ||
          roomState.marketSummary.length > 1) && (
          <div className="px-3 py-2 rounded-lg text-xs bg-sky-50 border border-sky-200 text-slate-800 space-y-1">
            <div className="font-bold text-sky-800">
              {language === 'th' ? 'สรุปการซื้อขาย' : 'Market Summary'}
            </div>
            <div className="space-y-0.5 font-medium">
              {roomState.marketSummary.map((entry, idx) => (
                <div key={idx}>{entry[language]}</div>
              ))}
            </div>
          </div>
        )}

      {/* Last Step Financial Delta Highlight (waits until pawn finishes walking) */}
      {!isAnimating && roomState.lastStepDelta && (() => {
        const delta = roomState.lastStepDelta;
        const cleanDeltaReason = delta.reason[language]
          .replace(/[\p{Extended_Pictographic}\u2600-\u27BF]\uFE0F?/gu, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        const isPenaltyTone =
          roomState.logs[0]?.type === 'PLAYER_BANKRUPT' ||
          roomState.logs[0]?.type === 'FT_PENALTY' ||
          roomState.logs[0]?.type === 'DOODAD_PAID' ||
          roomState.logs[0]?.type === 'BOT_PAY_DOODAD' ||
          roomState.logs[0]?.type === 'DOWNSIZED' ||
          roomState.logs[0]?.type === 'BOT_DOWNSIZED' ||
          roomState.activeFastTrackSpace?.type === 'divorce' ||
          roomState.activeFastTrackSpace?.type === 'tax_audit' ||
          roomState.activeFastTrackSpace?.type === 'lawsuit' ||
          (delta.cashDelta < 0 && delta.passiveIncomeDelta <= 0);
        return (
          <div
            className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono tabular-nums ${
              isPenaltyTone
                ? 'bg-rose-50 border-2 border-rose-300'
                : 'bg-emerald-50 border border-emerald-200'
            }`}
          >
            <span
              className={`font-sans font-medium ${
                isPenaltyTone ? 'text-rose-900' : 'text-slate-700'
              }`}
            >
              {cleanDeltaReason}:
            </span>
            {delta.cashDelta !== 0 && (
              <span
                className={
                  delta.cashDelta > 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'
                }
              >
                {language === 'th' ? 'เงินสด' : 'Cash'} {delta.cashDelta > 0 ? '+' : ''}
                {delta.cashDelta.toLocaleString()} ฿
              </span>
            )}
            {delta.passiveIncomeDelta !== 0 && (
              <span className="text-violet-600 font-bold">
                {language === 'th' ? 'รายได้จากทรัพย์สิน' : 'Passive'} {delta.passiveIncomeDelta > 0 ? '+' : ''}
                {delta.passiveIncomeDelta.toLocaleString()} ฿/m
              </span>
            )}
            {delta.totalExpensesDelta !== 0 && (
              <span
                className={
                  delta.totalExpensesDelta > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'
                }
              >
                {language === 'th' ? 'รายจ่าย' : 'Expenses'} {delta.totalExpensesDelta > 0 ? '+' : ''}
                {delta.totalExpensesDelta.toLocaleString()} ฿/m
              </span>
            )}
          </div>
        );
      })()}

      {/* Deal Pass / Auction No-Bid Summary Frame (when no financial delta occurred) */}
      {!isAnimating && !roomState.lastStepDelta && (() => {
        const topLog = roomState.logs[0];
        if (
          topLog?.type !== 'PASS_DEAL' &&
          topLog?.type !== 'BOT_PASS_DEAL' &&
          topLog?.type !== 'BOT_PASS_STOCK' &&
          topLog?.type !== 'AUCTION_NO_BID' &&
          topLog?.type !== 'FT_PASS'
        ) {
          return null;
        }
        const rawTitle =
          activeCard && (activeCard.deck === 'small_deal' || activeCard.deck === 'big_deal')
            ? activeCard.title[language]
            : '';
        const cleanTitle =
          language === 'th'
            ? rawTitle.replace(/^ต้องการขาย/, '').replace(/^ต้องการ/, '').trim()
            : rawTitle.replace(/\s+For Sale$/i, '').trim();
        const summaryText =
          topLog.type === 'AUCTION_NO_BID' || topLog.type === 'FT_PASS'
            ? topLog.message[language]
                .replace(/[\p{Extended_Pictographic}\u2600-\u27BF]\uFE0F?/gu, '')
                .replace(/\s{2,}/g, ' ')
                .trim()
            : cleanTitle
            ? language === 'th'
              ? `${topLog.actorName} ตัดสินใจสละสิทธิ์ ${cleanTitle}`
              : `${topLog.actorName} passed on ${cleanTitle}`
            : topLog.message[language]
                .replace(/[\p{Extended_Pictographic}\u2600-\u27BF]\uFE0F?/gu, '')
                .replace(/\s{2,}/g, ' ')
                .trim();

        return (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg text-xs bg-slate-100 border border-slate-300 text-slate-800 font-medium">
            <span>{summaryText}</span>
          </div>
        );
      })()}

      {errorMsg && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-50 border border-pink-200 text-pink-700 text-xs font-medium">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!isAnimating && renderPhaseControls()}
    </div>
  );

  if (isAdminBottom) {
    const resizeHint =
      language === 'th'
        ? 'ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อรีเซ็ต'
        : 'Drag to resize · Double-click to reset';

    return (
      <aside ref={adminBottomRef} className="h-full bg-white overflow-hidden">
        <div
          className={
            isAdminSideBySide
              ? 'h-full flex flex-row overflow-hidden'
              : 'h-full flex flex-col overflow-y-auto'
          }
        >
          {narrationZone}
          {isAdminSideBySide && (
            <ResizeHandle
              orientation="vertical"
              title={resizeHint}
              className="flex z-20 shrink-0"
              onDragStart={() => {
                dragStartSplitPctRef.current = adminSplitPct;
              }}
              onDragMove={(deltaPx) => {
                const totalWidth = adminBottomRef.current?.clientWidth || 0;
                if (totalWidth <= 0) return;
                const deltaPct = (deltaPx / totalWidth) * 100;
                const next = Math.min(
                  MAX_ADMIN_SPLIT_PCT,
                  Math.max(MIN_ADMIN_SPLIT_PCT, dragStartSplitPctRef.current + deltaPct)
                );
                setAdminSplitPct(Math.round(next * 10) / 10);
              }}
              onDoubleClick={() => setAdminSplitPct(DEFAULT_ADMIN_SPLIT_PCT)}
            />
          )}
          <ActivityLogPanel
            logs={roomState.logs}
            language={language}
            orientation="vertical"
            className={
              isAdminSideBySide
                ? 'flex-1 min-w-0 h-full overflow-hidden border-l border-slate-200'
                : 'min-h-[200px] shrink-0 border-t border-slate-200'
            }
          />
        </div>
      </aside>
    );
  }

  return (
    <aside className="h-full flex flex-col bg-white border-l border-slate-200 overflow-hidden">
      {narrationZone}
    </aside>
  );
};
