export type Language = 'th' | 'en';

export interface BilingualText {
  th: string;
  en: string;
}

export interface Career {
  id: string;
  name: BilingualText;
  salary: number;
  savings: number;
  expenses: {
    taxes: number;
    homeMortgage: number;
    schoolLoan: number;
    carLoan: number;
    creditCard: number;
    otherDebt: number;
    otherExpenses: number;
    perChildExpense: number;
  };
  liabilities: {
    homeMortgageBalance: number;
    schoolLoanBalance: number;
    carLoanBalance: number;
    creditCardBalance: number;
    otherDebtBalance: number;
  };
}

export type AssetCategory =
  | 'stock'
  | 'fund'
  | 'cd'
  | 'real_estate'
  | 'business'
  | 'gold'
  | 'land';

export interface Asset {
  id: string;
  name: BilingualText;
  category: AssetCategory;
  tag: string; // e.g., '3br2ba', '2br1ba', 'condo', '4plex', '8plex', 'apartment', 'business', 'gold', 'land', 'MYT4U'
  cost: number;
  downPayment: number;
  mortgage: number;
  cashFlow: number;
  units?: number; // for multi-unit properties like 4-plex, 12-unit apt
  shares?: number;
  pricePerShare?: number;
  symbol?: string;
}

export interface FastTrackAsset {
  id: string;
  name: BilingualText;
  cost: number;
  cashFlow: number;
}

export interface BankLoan {
  id: string;
  principal: number;
  monthlyInterest: number; // 10% per month
}

export interface FinancialDelta {
  cashDelta: number;
  passiveIncomeDelta: number;
  totalIncomeDelta: number;
  totalExpensesDelta: number;
  monthlyCashFlowDelta: number;
  totalDebtDelta: number;
  reason: BilingualText;
  timestamp: number;
}

export interface PlayerFinance {
  cash: number;
  childrenCount: number;
  assets: Asset[];
  bankLoans: BankLoan[];
  liabilities: {
    homeMortgageBalance: number;
    schoolLoanBalance: number;
    carLoanBalance: number;
    creditCardBalance: number;
    otherDebtBalance: number;
  };
  expenses: {
    taxes: number;
    homeMortgage: number;
    schoolLoan: number;
    carLoan: number;
    creditCard: number;
    otherDebt: number;
    otherExpenses: number;
    perChildExpense: number;
    bankLoanInterest: number;
    childrenExpenses: number;
  };
  passiveIncome: number;
  totalIncome: number;
  totalExpenses: number;
  monthlyCashFlow: number; // Payday
  maxLoanLimit: number;    // 10x monthlyCashFlow
  totalDebt: number;
  isEscapedRatRace: boolean;
  // Fast Track fields
  fastTrackCashFlowDay: number;
  fastTrackAddedCashFlow: number;
  fastTrackAssets: FastTrackAsset[];
  lastDelta: FinancialDelta | null;
}

export type DealCardKind =
  | 'stock'
  | 'real_estate'
  | 'business'
  | 'gold'
  | 'land'
  | 'cd'
  | 'stock_split'
  | 'deal_expense';

export interface DealCard {
  id: string;
  deck: 'small_deal' | 'big_deal';
  kind: DealCardKind;
  canSellRight?: boolean;
  expenseCondition?: 'any_rental' | '4plex_only';
  title: BilingualText;
  description: BilingualText;
  tag: string;
  // Stock / Fund / CD
  symbol?: string;
  pricePerShare?: number;
  tradingRange?: string;
  dividendPerMonth?: number;
  splitRatio?: number; // 2 for 2:1 split, 0.5 for 1:2 reverse split
  // Real Estate / Business / Land / Gold
  cost: number;
  downPayment: number;
  mortgage: number;
  cashFlow: number;
  units?: number;
}

export type MarketOfferType =
  | 'fixed_price'
  | 'per_unit'
  | 'multiplier'
  | 'cost_plus'
  | 'cashflow_boost'
  | 'cashflow_adjust'
  | 'foreclose_refund';

export interface MarketCard {
  id: string;
  deck: 'market';
  title: BilingualText;
  description: BilingualText;
  targetTags: string[];
  offerType: MarketOfferType;
  offerAmount: number; // fixed price, price per unit, multiplier (2 or 3), bonus/adjust amount
  onlyDrawer?: boolean;
  minUnits?: number;
}

export interface DoodadCard {
  id: string;
  deck: 'doodad';
  title: BilingualText;
  description: BilingualText;
  cost: number;
  onlyIfHasChildren?: boolean;
  perChildCost?: boolean;
}

export type ActiveCard = DealCard | MarketCard | DoodadCard;

export type RatRaceSpaceType =
  | 'opportunity'
  | 'doodad'
  | 'charity'
  | 'payday'
  | 'market'
  | 'baby'
  | 'downsized';

export interface RatRaceSpace {
  index: number;
  type: RatRaceSpaceType;
  label: BilingualText;
}

export type FastTrackSpaceType =
  | 'cashflow_day'
  | 'business'
  | 'business_roll'
  | 'ipo_roll'
  | 'dream'
  | 'charity'
  | 'tax_audit'
  | 'lawsuit'
  | 'divorce';

export interface FastTrackSpace {
  index: number;
  type: FastTrackSpaceType;
  label: BilingualText;
  subLabel?: BilingualText;
  cost?: number;
  cashFlow?: number;
  dreamId?: string;
  rollThreshold?: number;        // e.g. 4 means roll >= 4 wins
  rollWinCashFlow?: number;      // monthly cashflow if roll succeeds
  rollWinTotalPayout?: number;   // one-time payout if IPO roll succeeds
}

export interface DreamOption {
  id: string;
  name: BilingualText;
  cost: number;
  description: BilingualText;
}

export type TurnPhase =
  | 'LOBBY'
  | 'ROLL_DICE'
  | 'BOT_THINKING'        // Waiting for user to click "Next Step" during robot's turn
  | 'CHOOSE_DEAL_TYPE'    // Player landed on Opportunity -> choose Small Deal or Big Deal
  | 'DEAL_DECISION'       // Card drawn -> Buy / Sell (if stock) / Sell Right (Auction) / Pass
  | 'STOCK_MARKET_SELL'   // Other players can SELL matching stock at card price
  | 'AUCTION_ACTIVE'      // Other players bid Finder's Fee (Commission) for deal right
  | 'MARKET_RESPONSE'     // All players with matching asset choose Sell / Don't Sell
  | 'DOODAD_PAY'          // Player must pay Doodad (can take loan if cash low)
  | 'CHARITY_DECISION'    // Player can donate 10% of Total Income or pass
  | 'CHOOSE_DREAM'        // Fallback if player didn't pick dream in lobby
  | 'FAST_TRACK_DECISION' // Fast Track business / dream / charity purchase decision
  | 'TURN_COMPLETE'       // Step summary before advancing to next player
  | 'GAME_OVER';

export interface Player {
  id: string;
  name: string;
  color: string;
  avatarId: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  career: Career;
  track: 'rat_race' | 'fast_track';
  position: number;
  charityTurnsLeft: number;
  hasThreeDiceForever: boolean;
  downsizedTurnsLeft: number;
  dreamId: string | null;
  finance: PlayerFinance;
}

export interface AuctionState {
  card: DealCard;
  sellerId: string;
  sellerName: string;
  startingBid: number;
  highestBid: number;
  highestBidderId: string | null;
  highestBidderName: string | null;
  passedPlayerIds: string[];
  endsAt: number;
}

export interface PendingMarketResponse {
  playerId: string;
  assetIds: string[];
  responded: boolean;
}

export interface PendingStockSell {
  playerId: string;
  symbol: string;
  sharesOwned: number;
  pricePerShare: number;
  responded: boolean;
}

export interface GameLogEntry {
  id: string;
  timestamp: number;
  actorId: string;
  actorName: string;
  isBot: boolean;
  type: string;
  message: BilingualText;
  delta?: FinancialDelta | null;
}

export interface GameRoomState {
  roomCode: string;
  hostId: string;
  hostName: string;
  isAdminSpectator: boolean;
  isSoloMode: boolean;
  language: Language;
  players: Player[];
  currentTurnIndex: number;
  phase: TurnPhase;
  botStepStage: number; // 0: start turn, 1: rolled & moved, 2: card drawn, 3: bot acted
  lastDiceRoll: number[];
  diceRollSeq: number;
  activeCard: ActiveCard | null;
  activeFastTrackSpace: FastTrackSpace | null;
  auction: AuctionState | null;
  pendingMarketResponses: PendingMarketResponse[];
  pendingStockSells: PendingStockSell[];
  currentStepText: BilingualText;
  lastStepDelta: FinancialDelta | null;
  logs: GameLogEntry[];
  winnerId: string | null;
  winReason: BilingualText | null;
  turnCount: number;
}
