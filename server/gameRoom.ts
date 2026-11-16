import { AVATAR_OPTIONS, PLAYER_COLOR_OPTIONS } from '../shared/avatars';
import { CAREERS } from '../shared/careers';
import {
  DREAM_OPTIONS,
  FAST_TRACK_SPACES,
  FAST_TRACK_WIN_CASHFLOW_TARGET,
  RAT_RACE_SPACES,
} from '../shared/board';
import {
  BIG_DEAL_CARDS,
  DOODAD_CARDS,
  formatStockSymbol,
  MARKET_CARDS,
  SMALL_DEAL_CARDS,
} from '../shared/cards';
import {
  Asset,
  BilingualText,
  DealCard,
  DoodadCard,
  FinancialDelta,
  GameLogEntry,
  GameRoomState,
  Language,
  MarketCard,
  Player,
} from '../shared/types';
import { FinancialEngine } from './finance';

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class GameRoom {
  public state: GameRoomState;
  private smallDealDeck: DealCard[] = [];
  private bigDealDeck: DealCard[] = [];
  private marketDeck: MarketCard[] = [];
  private doodadDeck: DoodadCard[] = [];
  private botAuctionTimer: NodeJS.Timeout | null = null;
  private onStateChange?: () => void;

  constructor(
    roomCode: string,
    hostId: string,
    language: Language = 'th',
    onStateChange?: () => void,
    hostName = 'Admin',
    isAdminSpectator = false,
    isSoloMode = false
  ) {
    this.onStateChange = onStateChange;
    this.smallDealDeck = shuffle(SMALL_DEAL_CARDS);
    this.bigDealDeck = shuffle(BIG_DEAL_CARDS);
    this.marketDeck = shuffle(MARKET_CARDS);
    this.doodadDeck = shuffle(DOODAD_CARDS);

    this.state = {
      roomCode,
      hostId,
      hostName,
      isAdminSpectator,
      isSoloMode,
      language,
      players: [],
      currentTurnIndex: 0,
      phase: 'LOBBY',
      botStepStage: 0,
      lastDiceRoll: [1],
      diceRollSeq: 0,
      activeCard: null,
      activeFastTrackSpace: null,
      auction: null,
      pendingMarketResponses: [],
      pendingStockSells: [],
      currentStepText: {
        th: 'ห้องเกมถูกสร้างแล้ว รอผู้เล่นเข้าร่วมและกดเริ่มเกม',
        en: 'Room created. Waiting for players to join and start the game.',
      },
      lastStepDelta: null,
      logs: [],
      winnerId: null,
      winReason: null,
      turnCount: 1,
    };
  }

  public destroy(): void {
    if (this.botAuctionTimer) {
      clearTimeout(this.botAuctionTimer);
      this.botAuctionTimer = null;
    }
  }

  private emitChange(): void {
    if (this.onStateChange) this.onStateChange();
  }

  private addLog(
    actor: { id: string; name: string; isBot: boolean },
    type: string,
    message: BilingualText,
    delta?: FinancialDelta | null,
    stepText?: BilingualText
  ): void {
    this.state.currentStepText = stepText ?? message;
    if (delta !== undefined) {
      this.state.lastStepDelta = delta;
    }
    const entry: GameLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      actorId: actor.id,
      actorName: actor.name,
      isBot: actor.isBot,
      type,
      message,
      delta: delta ?? null,
    };
    this.state.logs.unshift(entry);
    if (this.state.logs.length > 100) {
      this.state.logs.length = 100;
    }
  }

  private pickUnusedCareer() {
    const usedIds = new Set(this.state.players.map((p) => p.career.id));
    const available = CAREERS.filter((c) => !usedIds.has(c.id));
    const pool = available.length > 0 ? available : CAREERS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private pickUnusedColor(): string {
    const usedColors = new Set(this.state.players.map((p) => p.color.toLowerCase()));
    const available = PLAYER_COLOR_OPTIONS.find((c) => !usedColors.has(c.hex.toLowerCase()));
    return available ? available.hex : PLAYER_COLOR_OPTIONS[0].hex;
  }

  public addPlayer(id: string, name: string, isHost: boolean): { success: boolean; error?: BilingualText } {
    if (this.state.phase !== 'LOBBY') {
      return {
        success: false,
        error: { th: 'เกมเริ่มไปแล้ว ไม่สามารถเข้าร่วมห้องได้', en: 'Game has already started.' },
      };
    }
    if (this.state.players.length >= 6) {
      return {
        success: false,
        error: { th: 'ห้องเต็มแล้ว (สูงสุด 6 คน)', en: 'Room is full (max 6 players).' },
      };
    }

    const career = this.pickUnusedCareer();
    const color = this.pickUnusedColor();
    const avatarId = AVATAR_OPTIONS[this.state.players.length % AVATAR_OPTIONS.length].id;
    const player: Player = {
      id,
      name: name.trim() || `Player ${this.state.players.length + 1}`,
      color,
      avatarId,
      isBot: false,
      isHost,
      connected: true,
      career,
      track: 'rat_race',
      position: 0,
      charityTurnsLeft: 0,
      hasThreeDiceForever: false,
      downsizedTurnsLeft: 0,
      isBankrupt: false,
      dreamId: DREAM_OPTIONS[0].id,
      finance: FinancialEngine.createInitialFinance(career),
    };
    this.state.players.push(player);
    return { success: true };
  }

  public addBot(requesterId: string): { success: boolean; error?: BilingualText } {
    if (requesterId !== this.state.hostId) {
      return { success: false, error: { th: 'เฉพาะ Host เท่านั้นที่เพิ่ม Robot ได้', en: 'Only host can add robots.' } };
    }
    if (this.state.phase !== 'LOBBY') {
      return { success: false, error: { th: 'เพิ่ม Robot ได้เฉพาะในหน้า Lobby', en: 'Can only add robots in lobby.' } };
    }
    if (this.state.players.length >= 6) {
      return { success: false, error: { th: 'ห้องเต็มแล้ว (สูงสุด 6 คน)', en: 'Room is full (max 6 players).' } };
    }

    const botIndex = this.state.players.filter((p) => p.isBot).length + 1;
    const career = this.pickUnusedCareer();
    const color = this.pickUnusedColor();
    const avatarId = AVATAR_OPTIONS[this.state.players.length % AVATAR_OPTIONS.length].id;
    const randomDream = DREAM_OPTIONS[Math.floor(Math.random() * DREAM_OPTIONS.length)];
    const bot: Player = {
      id: `bot_${Date.now()}_${botIndex}`,
      name: `Robot ${botIndex}`,
      color,
      avatarId,
      isBot: true,
      isHost: false,
      connected: true,
      career,
      track: 'rat_race',
      position: 0,
      charityTurnsLeft: 0,
      hasThreeDiceForever: false,
      downsizedTurnsLeft: 0,
      isBankrupt: false,
      dreamId: randomDream.id,
      finance: FinancialEngine.createInitialFinance(career),
    };
    this.state.players.push(bot);
    return { success: true };
  }

  public removePlayer(requesterId: string, targetId: string): { success: boolean } {
    if (requesterId !== this.state.hostId && requesterId !== targetId) return { success: false };
    if (this.state.phase !== 'LOBBY') return { success: false };
    if (targetId === this.state.hostId) return { success: false };

    this.state.players = this.state.players.filter((p) => p.id !== targetId);
    return { success: true };
  }

  public toggleAdminPlay(requesterId: string): { success: boolean; error?: BilingualText } {
    if (requesterId !== this.state.hostId) {
      return {
        success: false,
        error: {
          th: 'เฉพาะ Admin เท่านั้นที่ทำรายการนี้ได้',
          en: 'Only the Admin host can perform this action.',
        },
      };
    }
    if (this.state.phase !== 'LOBBY') {
      return {
        success: false,
        error: {
          th: 'เปลี่ยนสถานะการร่วมเล่นได้เฉพาะในหน้า Lobby',
          en: 'Can only toggle participation in the lobby.',
        },
      };
    }
    if (this.state.isSoloMode) {
      return { success: false };
    }

    if (this.state.isAdminSpectator) {
      if (this.state.players.length >= 6) {
        return {
          success: false,
          error: { th: 'ห้องเต็มแล้ว (สูงสุด 6 คน)', en: 'Room is full (max 6 players).' },
        };
      }
      const res = this.addPlayer(requesterId, 'Admin', true);
      if (!res.success) return res;
      const adminIdx = this.state.players.findIndex((p) => p.id === requesterId);
      if (adminIdx > 0) {
        const [adminPlayer] = this.state.players.splice(adminIdx, 1);
        this.state.players.unshift(adminPlayer);
      }
      this.state.isAdminSpectator = false;
      return { success: true };
    }

    this.state.players = this.state.players.filter((p) => p.id !== requesterId);
    this.state.isAdminSpectator = true;
    return { success: true };
  }

  public assignCareer(playerId: string, careerId: string): { success: boolean } {
    if (this.state.phase !== 'LOBBY') return { success: false };
    const player = this.state.players.find((p) => p.id === playerId);
    const career = CAREERS.find((c) => c.id === careerId);
    if (!player || !career) return { success: false };
    player.career = career;
    player.finance = FinancialEngine.createInitialFinance(career);
    return { success: true };
  }

  public assignDream(playerId: string, dreamId: string): { success: boolean } {
    if (this.state.phase !== 'LOBBY') return { success: false };
    const player = this.state.players.find((p) => p.id === playerId);
    const dream = DREAM_OPTIONS.find((d) => d.id === dreamId);
    if (!player || !dream) return { success: false };
    player.dreamId = dream.id;
    return { success: true };
  }

  public customizePlayer(
    requesterId: string,
    targetId: string,
    avatarId?: string,
    color?: string
  ): { success: boolean; error?: BilingualText } {
    if (requesterId !== targetId && requesterId !== this.state.hostId) {
      return { success: false };
    }
    const player = this.state.players.find((p) => p.id === targetId);
    if (!player) return { success: false };

    if (color) {
      const validColor = PLAYER_COLOR_OPTIONS.find(
        (c) => c.hex.toLowerCase() === color.toLowerCase()
      );
      if (!validColor) {
        return {
          success: false,
          error: { th: 'สีที่เลือกไม่ถูกต้อง', en: 'Invalid color selected.' },
        };
      }
      const isTaken = this.state.players.some(
        (p) => p.id !== player.id && p.color.toLowerCase() === validColor.hex.toLowerCase()
      );
      if (isTaken) {
        return {
          success: false,
          error: {
            th: 'สีนี้ถูกผู้เล่นอื่นเลือกไปแล้ว กรุณาเลือกสีที่เหลือ',
            en: 'This color is already taken. Please pick another color.',
          },
        };
      }
      player.color = validColor.hex;
    }

    if (avatarId && AVATAR_OPTIONS.some((a) => a.id === avatarId)) {
      player.avatarId = avatarId;
    }
    return { success: true };
  }

  public setLanguage(lang: Language): void {
    this.state.language = lang;
  }

  public startGame(requesterId: string): { success: boolean; error?: BilingualText } {
    if (requesterId !== this.state.hostId) {
      return { success: false, error: { th: 'เฉพาะ Host เท่านั้นที่เริ่มเกมได้', en: 'Only host can start the game.' } };
    }
    if (this.state.players.length < 1) {
      return { success: false, error: { th: 'ต้องมีผู้เล่นอย่างน้อย 1 คน', en: 'Need at least 1 player.' } };
    }

    this.state.currentTurnIndex = 0;
    this.state.turnCount = 1;
    const first = this.currentPlayer;
    this.state.phase = first.isBot ? 'BOT_THINKING' : 'ROLL_DICE';
    this.state.botStepStage = 0;

    this.addLog(
      first,
      'GAME_START',
      {
        th: `เริ่มเกม Cashflow! ตาแรกเป็นของ ${first.name} (${first.career.name.th})`,
        en: `Game started! First turn belongs to ${first.name} (${first.career.name.en}).`,
      },
      null
    );
    return { success: true };
  }

  public get currentPlayer(): Player {
    return this.state.players[this.state.currentTurnIndex];
  }

  private drawSmallDeal(): DealCard {
    if (this.smallDealDeck.length === 0) this.smallDealDeck = shuffle(SMALL_DEAL_CARDS);
    return this.smallDealDeck.pop()!;
  }

  private drawBigDeal(): DealCard {
    if (this.bigDealDeck.length === 0) this.bigDealDeck = shuffle(BIG_DEAL_CARDS);
    return this.bigDealDeck.pop()!;
  }

  private drawMarket(): MarketCard {
    if (this.marketDeck.length === 0) this.marketDeck = shuffle(MARKET_CARDS);
    return this.marketDeck.pop()!;
  }

  private drawDoodad(): DoodadCard {
    if (this.doodadDeck.length === 0) this.doodadDeck = shuffle(DOODAD_CARDS);
    return this.doodadDeck.pop()!;
  }

  private rollDieValue(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  private formatDealDetails(card: DealCard): BilingualText {
    if (card.kind === 'stock') {
      const price = (card.pricePerShare || card.cost).toLocaleString();
      const range = card.tradingRange || '-';
      const divTh = card.dividendPerMonth ? ` | ปันผล +${card.dividendPerMonth.toLocaleString()} ฿/ด./หุ้น` : '';
      const divEn = card.dividendPerMonth ? ` | Dividend +${card.dividendPerMonth.toLocaleString()} ฿/mo/sh` : '';
      return {
        th: `${card.title.th} — ${card.description.th} | ราคา/หุ้น: ${price} ฿ | ช่วงราคา: ${range}${divTh}`,
        en: `${card.title.en} — ${card.description.en} | Price/Share: ${price} ฿ | Range: ${range}${divEn}`,
      };
    }
    if (card.kind === 'stock_split') {
      const ratioText = card.splitRatio === 2 ? '2:1' : '1:2';
      const symEn = formatStockSymbol(card.symbol, 'en');
      return {
        th: `${card.title.th} (${card.symbol} ${ratioText}) — ${card.description.th}`,
        en: `${card.title.en} (${symEn} ${ratioText}) — ${card.description.en}`,
      };
    }
    if (card.kind === 'deal_expense') {
      return {
        th: `${card.title.th} — ${card.description.th} | ค่าใช้จ่าย: ${card.cost.toLocaleString()} ฿`,
        en: `${card.title.en} — ${card.description.en} | Expense: ${card.cost.toLocaleString()} ฿`,
      };
    }
    const cfSign = card.cashFlow >= 0 ? '+' : '';
    const unitsTh = card.units ? ` | จำนวน ${card.units} ยูนิต` : '';
    const unitsEn = card.units ? ` | ${card.units} Units` : '';
    return {
      th: `${card.title.th} — ${card.description.th} | ราคา: ${card.cost.toLocaleString()} ฿ | ดาวน์: ${card.downPayment.toLocaleString()} ฿ | จำนอง: ${card.mortgage.toLocaleString()} ฿ | กระแสเงินสด: ${cfSign}${card.cashFlow.toLocaleString()} ฿/ด.${unitsTh}`,
      en: `${card.title.en} — ${card.description.en} | Cost: ${card.cost.toLocaleString()} ฿ | Down: ${card.downPayment.toLocaleString()} ฿ | Mortgage: ${card.mortgage.toLocaleString()} ฿ | Cashflow: ${cfSign}${card.cashFlow.toLocaleString()} ฿/mo${unitsEn}`,
    };
  }

  private formatMarketDetails(card: MarketCard): BilingualText {
    let offerTh = `${card.offerAmount.toLocaleString()} ฿ (ราคาเหมา)`;
    let offerEn = `${card.offerAmount.toLocaleString()} ฿ (fixed)`;
    if (card.offerType === 'per_unit') {
      offerTh = `${card.offerAmount.toLocaleString()} ฿ (ต่อยูนิต)`;
      offerEn = `${card.offerAmount.toLocaleString()} ฿ (per unit)`;
    } else if (card.offerType === 'multiplier') {
      offerTh = `${card.offerAmount} เท่าของเงินลงทุน`;
      offerEn = `${card.offerAmount}x investment`;
    } else if (card.offerType === 'cost_plus') {
      offerTh = `ราคาทุน +${card.offerAmount.toLocaleString()} ฿`;
      offerEn = `Purchase cost +${card.offerAmount.toLocaleString()} ฿`;
    } else if (card.offerType === 'cashflow_boost') {
      offerTh = `+${card.offerAmount.toLocaleString()} ฿/เดือน`;
      offerEn = `+${card.offerAmount.toLocaleString()} ฿/mo`;
    } else if (card.offerType === 'cashflow_adjust') {
      offerTh = `${card.offerAmount.toLocaleString()} ฿/เดือน`;
      offerEn = `${card.offerAmount.toLocaleString()} ฿/mo`;
    } else if (card.offerType === 'foreclose_refund') {
      offerTh = 'คืนบ้านให้ธนาคารและรับเงินดาวน์คืน';
      offerEn = 'Return to bank and refund down payment';
    }
    return {
      th: `${card.title.th} — ${card.description.th} | ข้อเสนอ: ${offerTh}`,
      en: `${card.title.en} — ${card.description.en} | Offer: ${offerEn}`,
    };
  }

  private formatDoodadDetails(card: DoodadCard): BilingualText {
    const childTh = card.perChildCost
      ? ' (ต่อลูก 1 คน)'
      : card.onlyIfHasChildren
      ? ' (มีผลเฉพาะผู้มีลูก)'
      : '';
    const childEn = card.perChildCost
      ? ' (per child)'
      : card.onlyIfHasChildren
      ? ' (Only if you have children)'
      : '';
    return {
      th: `${card.title.th} — ${card.description.th} | ค่าใช้จ่าย: ${card.cost.toLocaleString()} ฿${childTh}`,
      en: `${card.title.en} — ${card.description.en} | Expense: ${card.cost.toLocaleString()} ฿${childEn}`,
    };
  }

  private getDoodadEffectiveCost(card: DoodadCard, player: Player): number {
    if (card.onlyIfHasChildren && player.finance.childrenCount === 0) return 0;
    if (card.perChildCost) return card.cost * player.finance.childrenCount;
    return card.cost;
  }

  private doesDealExpenseApply(card: DealCard, player: Player): boolean {
    if (card.expenseCondition === 'any_rental') {
      return player.finance.assets.some((a) => a.category === 'real_estate');
    }
    if (card.expenseCondition === '4plex_only') {
      return player.finance.assets.some((a) => a.tag === 'tuktaw' && a.units === 4);
    }
    return true;
  }

  private computeMarketAssetSalePrice(card: MarketCard, asset: Asset): number {
    switch (card.offerType) {
      case 'per_unit':
        return card.offerAmount * (asset.units || 1);
      case 'multiplier':
        return asset.downPayment * card.offerAmount + asset.mortgage;
      case 'cost_plus':
        return asset.cost + card.offerAmount;
      default:
        return card.offerAmount;
    }
  }

  private checkEscapedRatRace(player: Player): boolean {
    if (player.track === 'rat_race' && player.finance.isEscapedRatRace) {
      const before = FinancialEngine.snapshot(player.finance);
      player.track = 'fast_track';
      player.position = 0;
      const ftIncome = Math.max(100000, player.finance.passiveIncome * 100);
      player.finance.fastTrackCashFlowDay = ftIncome;
      player.finance.cash += ftIncome;
      const delta = FinancialEngine.buildDelta(before, player.finance, {
        th: `หลุดจากสนามแข่งหนู! เข้าสู่เส้นทางเศรษฐี รับเงินวันรับกระแสเงินสด ${ftIncome.toLocaleString()} ฿`,
        en: `Escaped the Rat Race! Entered Fast Track with ${ftIncome.toLocaleString()} ฿ Cashflow Day!`,
      });
      this.addLog(
        player,
        'FAST_TRACK_ESCAPE',
        {
          th: `🎉 ${player.name} (อาชีพ: ${player.career.name.th}) หลุดจากสนามแข่งหนูแล้ว! รายได้จากทรัพย์สิน (${player.finance.passiveIncome.toLocaleString()} ฿) มากกว่ารายจ่ายรวม (${player.finance.totalExpenses.toLocaleString()} ฿)`,
          en: `🎉 ${player.name} (${player.career.name.en}) escaped the Rat Race! Passive Income (${player.finance.passiveIncome.toLocaleString()} ฿) exceeds Total Expenses (${player.finance.totalExpenses.toLocaleString()} ฿)!`,
        },
        delta
      );

      if (player.isBot && !player.dreamId) {
        const randomDream = DREAM_OPTIONS[Math.floor(Math.random() * DREAM_OPTIONS.length)];
        player.dreamId = randomDream.id;
      }
      return true;
    }
    return false;
  }

  private declareBankruptcy(
    player: Player,
    reason: BilingualText,
    delta?: FinancialDelta | null
  ): void {
    player.isBankrupt = true;
    player.finance.cash = 0;
    this.addLog(
      player,
      'PLAYER_BANKRUPT',
      {
        th: `💥 ${player.name} ล้มละลาย! ${reason.th} — หมดสิทธิ์ทอยลูกเต่าต่อไป`,
        en: `💥 ${player.name} declared Bankruptcy! ${reason.en} — Can no longer roll dice.`,
      },
      delta ?? null
    );
  }

  // ==================== HUMAN DICE & MOVEMENT ====================

  public rollDice(playerId: string, diceCount = 1): { success: boolean; error?: BilingualText } {
    const player = this.currentPlayer;
    if (player.id !== playerId || this.state.phase !== 'ROLL_DICE') {
      return { success: false, error: { th: 'ยังไม่ถึงตาของคุณในการทอยลูกเต๋า', en: 'Not your turn to roll.' } };
    }
    if (player.isBankrupt) {
      return {
        success: false,
        error: { th: 'คุณล้มละลายแล้ว หมดสิทธิ์ทอยลูกเต่า', en: 'You are bankrupt and can no longer roll.' },
      };
    }

    if (player.downsizedTurnsLeft > 0) {
      player.downsizedTurnsLeft -= 1;
      this.addLog(
        player,
        'SKIP_DOWNSIZED',
        {
          th: `${player.name} ต้องหยุดพักจากการตกงาน (เหลืออีก ${player.downsizedTurnsLeft} ตา)`,
          en: `${player.name} skips turn due to being Downsized (${player.downsizedTurnsLeft} turns remaining).`,
        },
        null
      );
      this.state.phase = 'TURN_COMPLETE';
      return { success: true };
    }

    let allowedCount = 1;
    if (player.track === 'fast_track') {
      // Fast Track: roll 2 dice every turn until 1M Charity unlocks choosing 1, 2, or 3 dice
      if (player.hasThreeDiceForever) {
        allowedCount = diceCount === 3 ? 3 : diceCount === 2 ? 2 : 1;
      } else {
        allowedCount = 2;
      }
    } else {
      // Rat Race: 1 die default, or 1-2 dice with Charity buff
      allowedCount = player.charityTurnsLeft > 0 && diceCount === 2 ? 2 : 1;
      if (player.charityTurnsLeft > 0) {
        player.charityTurnsLeft -= 1;
      }
    }

    const rolls = Array.from({ length: allowedCount }, () => this.rollDieValue());
    this.state.lastDiceRoll = rolls;
    this.state.diceRollSeq += 1;
    const totalRoll = rolls.reduce((a, b) => a + b, 0);

    this.moveAndLand(player, totalRoll, rolls);
    return { success: true };
  }

  private moveAndLand(player: Player, totalRoll: number, rolls: number[]): void {
    const rollText = rolls.join(' + ');

    if (player.track === 'rat_race') {
      const oldPos = player.position;
      let paydaysPassed = 0;
      for (let s = 1; s <= totalRoll; s++) {
        const checkPos = (oldPos + s) % RAT_RACE_SPACES.length;
        if (RAT_RACE_SPACES[checkPos].type === 'payday') {
          paydaysPassed++;
        }
      }
      const newPos = (oldPos + totalRoll) % RAT_RACE_SPACES.length;
      player.position = newPos;
      const space = RAT_RACE_SPACES[newPos];

      let paydayDelta: FinancialDelta | null = null;
      if (paydaysPassed > 0) {
        const before = FinancialEngine.snapshot(player.finance);
        const amount = player.finance.monthlyCashFlow * paydaysPassed;
        // Condition 2: Landed on / passed Payday with negative monthly cash flow exceeding cash on hand and max loan limit exhausted
        if (player.finance.monthlyCashFlow < 0 && player.finance.cash + amount < 0 && player.finance.maxLoanLimit <= 0) {
          const cashBefore = player.finance.cash;
          player.finance.cash = 0;
          const bankruptDelta = FinancialEngine.buildDelta(before, player.finance, {
            th: `ล้มละลาย! รับเงินเดือนติดลบ (${amount.toLocaleString()} ฿) เกินเงินสดในมือและวงเงินกู้เต็มแล้ว`,
            en: `Bankrupt! Negative Payday (${amount.toLocaleString()} ฿) exceeded cash on hand and loan limit`,
          });
          this.declareBankruptcy(
            player,
            {
              th: `ตกช่อง "รับเงินเดือน" แต่เงินคงเหลือต่อเดือนติดลบ (${amount.toLocaleString()} ฿) มากกว่าเงินสดในมือ (${cashBefore.toLocaleString()} ฿) และกู้เพิ่มไม่ได้แล้ว`,
              en: `Hit Payday with negative monthly cash flow (${amount.toLocaleString()} ฿) exceeding cash on hand (${cashBefore.toLocaleString()} ฿) and no remaining loan limit`,
            },
            bankruptDelta
          );
          if (!player.isBot) {
            this.state.phase = 'TURN_COMPLETE';
          }
          return;
        }

        player.finance.cash += amount;
        paydayDelta = FinancialEngine.buildDelta(before, player.finance, {
          th: `รับเงินเดือน (${paydaysPassed} ครั้ง) ${amount >= 0 ? '+' : ''}${amount.toLocaleString()} ฿`,
          en: `Payday x${paydaysPassed}: ${amount >= 0 ? '+' : ''}${amount.toLocaleString()} ฿`,
        });
      }

      const paydayMsgTh =
        paydaysPassed > 0
          ? ` และผ่านช่องรับเงินเดือน รับเงิน ${(player.finance.monthlyCashFlow * paydaysPassed).toLocaleString()} ฿`
          : '';
      const paydayMsgEn =
        paydaysPassed > 0
          ? ` and passed Payday (${(player.finance.monthlyCashFlow * paydaysPassed).toLocaleString()} ฿)`
          : '';

      this.addLog(
        player,
        'ROLL_MOVE',
        {
          th: `${player.name} ทอยลูกเต๋าได้ ${rollText}${paydayMsgTh} ไปตกช่อง "${space.label.th}" (ช่องที่ ${newPos + 1})`,
          en: `${player.name} rolled ${rollText}${paydayMsgEn} and landed on "${space.label.en}" (Space ${newPos + 1}).`,
        },
        paydayDelta
      );

      if (!player.isBot) {
        this.applyRatRaceSpace(player, space.type);
      }
    } else {
      // Fast Track Movement
      const oldPos = player.position;
      let cashflowDaysPassed = 0;
      for (let s = 1; s <= totalRoll; s++) {
        const checkPos = (oldPos + s) % FAST_TRACK_SPACES.length;
        if (FAST_TRACK_SPACES[checkPos].type === 'cashflow_day') {
          cashflowDaysPassed++;
        }
      }
      const newPos = (oldPos + totalRoll) % FAST_TRACK_SPACES.length;
      player.position = newPos;
      const space = FAST_TRACK_SPACES[newPos];
      this.state.activeFastTrackSpace = space;

      let cfDelta: FinancialDelta | null = null;
      const dayIncome = player.finance.fastTrackCashFlowDay + player.finance.fastTrackAddedCashFlow;
      if (cashflowDaysPassed > 0) {
        const before = FinancialEngine.snapshot(player.finance);
        player.finance.cash += dayIncome * cashflowDaysPassed;
        cfDelta = FinancialEngine.buildDelta(before, player.finance, {
          th: `วันรับกระแสเงินสด (${cashflowDaysPassed} ครั้ง) +${(dayIncome * cashflowDaysPassed).toLocaleString()} ฿`,
          en: `Cashflow Day x${cashflowDaysPassed}: +${(dayIncome * cashflowDaysPassed).toLocaleString()} ฿`,
        });
      }

      this.addLog(
        player,
        'ROLL_MOVE_FT',
        {
          th: `${player.name} (เส้นทางเศรษฐี) ทอยได้ ${rollText} ตกช่อง "${space.label.th}"`,
          en: `${player.name} (Fast Track) rolled ${rollText} and landed on "${space.label.en}".`,
        },
        cfDelta
      );

      if (!player.isBot) {
        this.applyFastTrackSpace(player, space);
      }
    }
  }

  private applyRatRaceSpace(player: Player, spaceType: string): void {
    switch (spaceType) {
      case 'opportunity': {
        this.state.phase = 'CHOOSE_DEAL_TYPE';
        this.addLog(
          player,
          'CHOOSE_DEAL',
          {
            th: `${player.name} ตกช่องโอกาส! กรุณาเลือกเปิดการ์ด "โอกาสเล็ก" หรือ "โอกาสใหญ่"`,
            en: `${player.name} landed on Opportunity! Choose "Small Deal" or "Big Deal".`,
          },
          this.state.lastStepDelta
        );
        break;
      }
      case 'doodad': {
        const card = this.drawDoodad();
        this.state.activeCard = card;
        const details = this.formatDoodadDetails(card);
        if (card.onlyIfHasChildren && player.finance.childrenCount === 0) {
          this.addLog(
            player,
            'DOODAD_SKIP',
            {
              th: `${player.name} จั่วการ์ดจ่ายซะ: ${details.th} — ยังไม่มีลูก จึงไม่ต้องจ่าย (0 ฿)!`,
              en: `${player.name} drew Doodad: ${details.en} — 0 ฿ because you have no children!`,
            },
            null,
            {
              th: `${player.name} จั่วการ์ดจ่ายซะ — ยังไม่มีลูก จึงไม่ต้องจ่าย (0 ฿)!`,
              en: `${player.name} drew Doodad — 0 ฿ because you have no children!`,
            }
          );
          this.state.phase = 'TURN_COMPLETE';
        } else {
          const cost = this.getDoodadEffectiveCost(card, player);
          if (cost > 0 && !FinancialEngine.canCoverExpenseWithLoan(player.finance, cost)) {
            const before = FinancialEngine.snapshot(player.finance);
            const cashBefore = player.finance.cash;
            const maxLoan = player.finance.maxLoanLimit;
            player.finance.cash = 0;
            const delta = FinancialEngine.buildDelta(before, player.finance, {
              th: `ล้มละลายจาก "${card.title.th}" (${cost.toLocaleString()} ฿)`,
              en: `Bankrupt from "${card.title.en}" (${cost.toLocaleString()} ฿)`,
            });
            this.declareBankruptcy(
              player,
              {
                th: `ตกช่อง "จ่ายซะ" (${card.title.th}: ${cost.toLocaleString()} ฿) แต่เงินสดมี ${cashBefore.toLocaleString()} ฿ และวงเงินกู้คงเหลือ ${maxLoan.toLocaleString()} ฿ ไม่พอจ่าย`,
                en: `Landed on Doodad ("${card.title.en}": ${cost.toLocaleString()} ฿) with ${cashBefore.toLocaleString()} ฿ cash and ${maxLoan.toLocaleString()} ฿ loan limit`,
              },
              delta
            );
            this.state.phase = 'TURN_COMPLETE';
            break;
          }

          this.state.phase = 'DOODAD_PAY';
          this.addLog(
            player,
            'DOODAD_DRAWN',
            {
              th: `${player.name} จั่วการ์ดจ่ายซะ: ${details.th}`,
              en: `${player.name} drew Doodad: ${details.en}`,
            },
            null,
            {
              th: `${player.name} จั่วการ์ดจ่ายซะ`,
              en: `${player.name} drew a Doodad card`,
            }
          );
        }
        break;
      }
      case 'market': {
        const card = this.drawMarket();
        this.state.activeCard = card;
        this.initiateMarketResponse(player, card);
        break;
      }
      case 'charity': {
        this.state.phase = 'CHARITY_DECISION';
        const donation = Math.round(player.finance.totalIncome * 0.1);
        this.addLog(
          player,
          'CHARITY_PROMPT',
          {
            th: `${player.name} ตกช่องการกุศล: สามารถบริจาค 10% ของรายได้ (${donation.toLocaleString()} ฿) เพื่อสิทธิ์เลือกทอย 1-2 ลูกได้ 3 ตา`,
            en: `${player.name} landed on Charity: Donate 10% of Total Income (${donation.toLocaleString()} ฿) to roll 1 or 2 dice for 3 turns.`,
          },
          null
        );
        break;
      }
      case 'baby': {
        if (player.finance.childrenCount < 3) {
          const before = FinancialEngine.snapshot(player.finance);
          player.finance.childrenCount += 1;
          FinancialEngine.recalculate(player.finance, player.career);
          const delta = FinancialEngine.buildDelta(before, player.finance, {
            th: `มีลูกเพิ่ม 1 คน (ค่าเลี้ยงดู +${player.finance.expenses.perChildExpense.toLocaleString()} ฿/เดือน)`,
            en: `New Baby! Monthly expenses +${player.finance.expenses.perChildExpense.toLocaleString()} ฿/mo.`,
          });
          this.addLog(
            player,
            'BABY',
            {
              th: `👶 ยินดีด้วย! ${player.name} มีลูกคนที่ ${player.finance.childrenCount} รายจ่ายเพิ่มขึ้น ${player.finance.expenses.perChildExpense.toLocaleString()} ฿/เดือน`,
              en: `👶 Congratulations! ${player.name} now has ${player.finance.childrenCount} child(ren). Expenses increased by ${player.finance.expenses.perChildExpense.toLocaleString()} ฿/mo.`,
            },
            delta
          );
        } else {
          this.addLog(
            player,
            'BABY_MAX',
            {
              th: `${player.name} ตกช่องมีลูก แต่มีครบ 3 คนแล้ว (ไม่เพิ่มรายจ่าย)`,
              en: `${player.name} landed on Baby, already at max 3 children.`,
            },
            null
          );
        }
        this.state.phase = 'TURN_COMPLETE';
        break;
      }
      case 'downsized': {
        const result = FinancialEngine.payDownsizedExpense(player);
        if (result.bankrupt) {
          this.declareBankruptcy(
            player,
            {
              th: `ตกช่อง "ตกงาน" ต้องจ่ายรายจ่ายรวม ${result.penalty.toLocaleString()} ฿ แต่เงินสดมี ${result.cashBefore.toLocaleString()} ฿ และวงเงินกู้คงเหลือ ${result.maxLoanLimit.toLocaleString()} ฿ ไม่พอจ่าย`,
              en: `Landed on Downsized (${result.penalty.toLocaleString()} ฿ due) with ${result.cashBefore.toLocaleString()} ฿ cash and ${result.maxLoanLimit.toLocaleString()} ฿ loan limit`,
            },
            result.delta
          );
        } else {
          player.downsizedTurnsLeft = 2;
          const loanNoteTh =
            result.loanAmt > 0
              ? ` (กู้ธนาคารเพิ่ม ${result.loanAmt.toLocaleString()} ฿ ดอกเบี้ย +${result.loanInterest.toLocaleString()} ฿/เดือน)`
              : '';
          const loanNoteEn =
            result.loanAmt > 0
              ? ` (borrowed ${result.loanAmt.toLocaleString()} ฿, +${result.loanInterest.toLocaleString()} ฿/mo interest)`
              : '';
          this.addLog(
            player,
            'DOWNSIZED',
            {
              th: `⚠️ ${player.name} ตกงาน! จ่ายค่าใช้จ่าย ${result.penalty.toLocaleString()} ฿${loanNoteTh} และพักการเดิน 2 ตา`,
              en: `⚠️ ${player.name} was Downsized! Paid ${result.penalty.toLocaleString()} ฿${loanNoteEn} and skips 2 turns.`,
            },
            result.delta
          );
        }
        this.state.phase = 'TURN_COMPLETE';
        break;
      }
      case 'payday':
      default: {
        this.state.phase = 'TURN_COMPLETE';
        break;
      }
    }
  }

  private applyFastTrackSpace(player: Player, space: typeof FAST_TRACK_SPACES[number]): void {
    switch (space.type) {
      case 'business':
      case 'business_roll':
      case 'ipo_roll':
      case 'dream':
      case 'charity': {
        this.state.phase = 'FAST_TRACK_DECISION';
        break;
      }
      case 'divorce': {
        const before = FinancialEngine.snapshot(player.finance);
        const lost = Math.max(0, player.finance.cash);
        player.finance.cash = 0;
        const delta = FinancialEngine.buildDelta(before, player.finance, {
          th: `${space.label.th}: เสียเงินสดทั้งหมด (-${lost.toLocaleString()} ฿)`,
          en: `${space.label.en}: Lost all cash (-${lost.toLocaleString()} ฿)`,
        });
        this.addLog(
          player,
          'FT_PENALTY',
          {
            th: `${player.name} ตกช่อง "${space.label.th}" เสียเงินสดทั้งหมด (${lost.toLocaleString()} ฿)`,
            en: `${player.name} hit "${space.label.en}" and lost all cash (${lost.toLocaleString()} ฿).`,
          },
          delta
        );
        this.state.phase = 'TURN_COMPLETE';
        break;
      }
      case 'tax_audit':
      case 'lawsuit': {
        const before = FinancialEngine.snapshot(player.finance);
        const lost = Math.max(0, Math.round(player.finance.cash * 0.5));
        player.finance.cash -= lost;
        const delta = FinancialEngine.buildDelta(before, player.finance, {
          th: `${space.label.th}: เสียเงินสด 50% (-${lost.toLocaleString()} ฿)`,
          en: `${space.label.en}: Lost 50% cash (-${lost.toLocaleString()} ฿)`,
        });
        this.addLog(
          player,
          'FT_PENALTY',
          {
            th: `${player.name} ตกช่อง "${space.label.th}" จ่าย 50% ของเงินสด (${lost.toLocaleString()} ฿)`,
            en: `${player.name} hit "${space.label.en}" and paid 50% cash (${lost.toLocaleString()} ฿).`,
          },
          delta
        );
        this.state.phase = 'TURN_COMPLETE';
        break;
      }
      case 'cashflow_day':
      default: {
        this.state.phase = 'TURN_COMPLETE';
        break;
      }
    }
  }

  // ==================== OPPORTUNITY & DEAL ACTIONS ====================

  public chooseDealType(playerId: string, deckType: 'small_deal' | 'big_deal'): { success: boolean } {
    const player = this.currentPlayer;
    if (player.id !== playerId || this.state.phase !== 'CHOOSE_DEAL_TYPE') {
      return { success: false };
    }
    const card = deckType === 'small_deal' ? this.drawSmallDeal() : this.drawBigDeal();
    this.presentDealCard(player, card);
    return { success: true };
  }

  private presentDealCard(player: Player, card: DealCard): void {
    this.state.activeCard = card;
    const details = this.formatDealDetails(card);

    if (card.kind === 'stock_split') {
      // Apply split/reverse split to all players holding that symbol
      const ratio = card.splitRatio || 2;
      let affectedNames: string[] = [];
      for (const p of this.state.players) {
        if (p.track !== player.track) continue;
        const matching = p.finance.assets.filter((a) => a.symbol === card.symbol);
        if (matching.length > 0) {
          const before = FinancialEngine.snapshot(p.finance);
          for (const a of matching) {
            a.shares = Math.max(1, Math.floor((a.shares || 0) * ratio));
            if (a.cashFlow && a.shares) {
              // preserve dividend per share if applicable
              a.cashFlow = Math.round(a.cashFlow * ratio);
            }
          }
          FinancialEngine.recalculate(p.finance, p.career);
          FinancialEngine.buildDelta(before, p.finance, card.title);
          affectedNames.push(p.name);
        }
      }
      this.addLog(
        player,
        'STOCK_SPLIT',
        {
          th: `${details.th} — ${affectedNames.length > 0 ? `ผู้ถือหุ้นที่ได้รับผล: ${affectedNames.join(', ')}` : 'ยังไม่มีผู้เล่นถือหุ้นตัวนี้'}`,
          en: `${details.en} — ${affectedNames.length > 0 ? `Affected holders: ${affectedNames.join(', ')}` : 'No players currently hold this stock.'}`,
        },
        null,
        {
          th: `${player.name} เปิดการ์ด${card.deck === 'small_deal' ? 'โอกาสเล็ก' : 'โอกาสใหญ่'} — ${affectedNames.length > 0 ? `ผู้ถือหุ้นที่ได้รับผล: ${affectedNames.join(', ')}` : 'ยังไม่มีผู้เล่นถือหุ้นตัวนี้'}`,
          en: `${player.name} drew ${card.deck === 'small_deal' ? 'Small Deal' : 'Big Deal'} — ${affectedNames.length > 0 ? `Affected holders: ${affectedNames.join(', ')}` : 'No players currently hold this stock.'}`,
        }
      );
      this.state.phase = 'TURN_COMPLETE';
      return;
    }

    if (card.kind === 'deal_expense') {
      if (!this.doesDealExpenseApply(card, player)) {
        this.addLog(
          player,
          'DEAL_EXPENSE_SKIP',
          {
            th: `${player.name} เปิดการ์ด "${card.title.th}" — ไม่มีทรัพย์สินที่เข้าเงื่อนไข จึงไม่ต้องจ่าย (0 ฿)`,
            en: `${player.name} drew "${card.title.en}" — no matching property owned (0 ฿).`,
          },
          null,
          {
            th: `${player.name} เปิดการ์ด${card.deck === 'small_deal' ? 'โอกาสเล็ก' : 'โอกาสใหญ่'} — ไม่มีทรัพย์สินที่เข้าเงื่อนไข จึงไม่ต้องจ่าย (0 ฿)`,
            en: `${player.name} drew ${card.deck === 'small_deal' ? 'Small Deal' : 'Big Deal'} — no matching property owned (0 ฿).`,
          }
        );
        this.state.phase = 'TURN_COMPLETE';
        return;
      }

      this.state.phase = 'DOODAD_PAY';
      this.addLog(
        player,
        'DEAL_EXPENSE_DUE',
        {
          th: `${player.name} เปิดการ์ด "${card.title.th}" — ต้องจ่ายค่าซ่อมแซม ${card.cost.toLocaleString()} ฿`,
          en: `${player.name} drew "${card.title.en}" — must pay ${card.cost.toLocaleString()} ฿.`,
        },
        null,
        {
          th: `${player.name} เปิดการ์ด${card.deck === 'small_deal' ? 'โอกาสเล็ก' : 'โอกาสใหญ่'} — กรุณาชำระค่าใช้จ่ายตามการ์ดด้านล่าง`,
          en: `${player.name} drew ${card.deck === 'small_deal' ? 'Small Deal' : 'Big Deal'} — please pay the required expense below.`,
        }
      );
      return;
    }

    this.state.phase = 'DEAL_DECISION';
    this.addLog(
      player,
      'DEAL_DRAWN',
      {
        th: `${player.name} เปิดการ์ด${card.deck === 'small_deal' ? 'โอกาสเล็ก' : 'โอกาสใหญ่'}: ${details.th}`,
        en: `${player.name} drew ${card.deck === 'small_deal' ? 'Small Deal' : 'Big Deal'}: ${details.en}`,
      },
      null,
      {
        th: `${player.name} เปิดการ์ด${card.deck === 'small_deal' ? 'โอกาสเล็ก' : 'โอกาสใหญ่'}`,
        en: `${player.name} drew ${card.deck === 'small_deal' ? 'Small Deal' : 'Big Deal'}`,
      }
    );
  }

  public buyDeal(playerId: string, shareQuantity = 1): { success: boolean; error?: BilingualText } {
    const player = this.currentPlayer;
    if (player.id !== playerId || this.state.phase !== 'DEAL_DECISION') {
      return { success: false, error: { th: 'ไม่สามารถซื้อในขั้นตอนนี้ได้', en: 'Cannot buy right now.' } };
    }
    const rawCard = this.state.activeCard;
    if (!rawCard || (rawCard.deck !== 'small_deal' && rawCard.deck !== 'big_deal')) {
      return { success: false };
    }
    const card = rawCard as DealCard;

    if (card.kind === 'stock') {
      const qty = Math.max(1, Math.floor(shareQuantity));
      const price = card.pricePerShare || card.cost;
      const totalCost = qty * price;
      if (player.finance.cash < totalCost) {
        return {
          success: false,
          error: {
            th: `เงินสดไม่พอ (ต้องการ ${totalCost.toLocaleString()} ฿ — สามารถกู้ธนาคารเพิ่มได้)`,
            en: `Insufficient cash (need ${totalCost.toLocaleString()} ฿ — you can take a bank loan).`,
          },
        };
      }
      const before = FinancialEngine.snapshot(player.finance);
      player.finance.cash -= totalCost;

      const symEn = formatStockSymbol(card.symbol, 'en');
      const existing = player.finance.assets.find((a) => a.category === 'stock' && a.symbol === card.symbol);
      const monthlyDiv = (card.dividendPerMonth || 0) * qty;
      if (existing) {
        existing.shares = (existing.shares || 0) + qty;
        existing.cost += totalCost;
        existing.downPayment += totalCost;
        existing.cashFlow += monthlyDiv;
      } else {
        player.finance.assets.push({
          id: `asset_${Date.now()}`,
          name: {
            th: card.symbol === 'กองทุนรวม' ? 'กองทุนรวม' : `หุ้น ${card.symbol}`,
            en: symEn,
          },
          category: 'stock',
          tag: card.symbol || card.tag,
          symbol: card.symbol,
          shares: qty,
          pricePerShare: price,
          cost: totalCost,
          downPayment: totalCost,
          mortgage: 0,
          cashFlow: monthlyDiv,
        });
      }
      FinancialEngine.recalculate(player.finance, player.career);
      const delta = FinancialEngine.buildDelta(before, player.finance, {
        th: `ซื้อหุ้น ${card.symbol} จำนวน ${qty.toLocaleString()} หุ้น (${totalCost.toLocaleString()} ฿)`,
        en: `Bought ${qty.toLocaleString()} shares of ${symEn} (${totalCost.toLocaleString()} ฿)`,
      });

      this.addLog(
        player,
        'BUY_STOCK',
        {
          th: `${player.name} ซื้อหุ้น ${card.symbol} จำนวน ${qty.toLocaleString()} หุ้น ที่ราคา ${price.toLocaleString()} ฿/หุ้น (รวม ${totalCost.toLocaleString()} ฿)`,
          en: `${player.name} bought ${qty.toLocaleString()} shares of ${symEn} at ${price.toLocaleString()} ฿/share (${totalCost.toLocaleString()} ฿).`,
        },
        delta
      );

      this.afterActiveStockDecision(player, card);
      return { success: true };
    }

    // Real Estate / Business / Gold / Land / CD
    if (player.finance.cash < card.downPayment) {
      return {
        success: false,
        error: {
          th: `เงินสดไม่พอวางเงินดาวน์ (${card.downPayment.toLocaleString()} ฿) สามารถกู้ธนาคารหรือขายสิทธิ์ประมูลได้`,
          en: `Not enough cash for down payment (${card.downPayment.toLocaleString()} ฿). Take a loan or auction the deal!`,
        },
      };
    }

    const before = FinancialEngine.snapshot(player.finance);
    player.finance.cash -= card.downPayment;
    const category =
      card.kind === 'cd'
        ? 'cd'
        : card.kind === 'gold'
        ? 'gold'
        : card.kind === 'land'
        ? 'land'
        : card.kind === 'business'
        ? 'business'
        : 'real_estate';

    const asset: Asset = {
      id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: card.title,
      category,
      tag: card.tag,
      cost: card.cost,
      downPayment: card.downPayment,
      mortgage: card.mortgage,
      cashFlow: card.cashFlow,
      units: card.units,
    };

    const cfSign = card.cashFlow >= 0 ? '+' : '';
    FinancialEngine.addAsset(player, asset);
    const delta = FinancialEngine.buildDelta(before, player.finance, {
      th: `ซื้อทรัพย์สิน: ${card.title.th} (เงินดาวน์ ${card.downPayment.toLocaleString()} ฿, กระแสเงินสด ${cfSign}${card.cashFlow.toLocaleString()} ฿/ด.)`,
      en: `Bought ${card.title.en} (Down ${card.downPayment.toLocaleString()} ฿, Cashflow ${cfSign}${card.cashFlow.toLocaleString()} ฿/mo)`,
    });

    this.addLog(
      player,
      'BUY_ASSET',
      {
        th: `${player.name} ซื้อ "${card.title.th}" จ่ายเงินดาวน์ ${card.downPayment.toLocaleString()} ฿ รับรายได้จากทรัพย์สิน ${cfSign}${card.cashFlow.toLocaleString()} ฿/เดือน`,
        en: `${player.name} bought "${card.title.en}" for ${card.downPayment.toLocaleString()} ฿ down (${cfSign}${card.cashFlow.toLocaleString()} ฿/mo passive income).`,
      },
      delta
    );

    if (this.checkEscapedRatRace(player)) {
      if (player.isBot) {
        this.state.phase = 'BOT_THINKING';
        this.state.botStepStage = 3;
      } else {
        this.state.phase = player.dreamId ? 'TURN_COMPLETE' : 'CHOOSE_DREAM';
      }
    } else {
      this.state.phase = 'TURN_COMPLETE';
    }
    return { success: true };
  }

  public sellStock(playerId: string, shareQuantity: number): { success: boolean; error?: BilingualText } {
    const card = this.state.activeCard as DealCard;
    if (!card || card.kind !== 'stock' || !card.symbol) {
      return { success: false };
    }

    const isActivePlayer = this.currentPlayer.id === playerId && this.state.phase === 'DEAL_DECISION';
    const isOtherSeller = this.state.phase === 'STOCK_MARKET_SELL';
    if (!isActivePlayer && !isOtherSeller) {
      return { success: false, error: { th: 'ไม่สามารถขายหุ้นในขณะนี้ได้', en: 'Cannot sell stock right now.' } };
    }

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { success: false };

    const symEn = formatStockSymbol(card.symbol, 'en');
    const holding = player.finance.assets.find((a) => a.category === 'stock' && a.symbol === card.symbol);
    if (!holding || !holding.shares || holding.shares <= 0) {
      return { success: false, error: { th: `คุณไม่มีหุ้น ${card.symbol} ที่จะขาย`, en: `You do not own any ${symEn} shares.` } };
    }

    const qty = Math.min(Math.max(1, Math.floor(shareQuantity)), holding.shares);
    const price = card.pricePerShare || card.cost;
    const proceeds = qty * price;

    const before = FinancialEngine.snapshot(player.finance);
    player.finance.cash += proceeds;
    if (qty >= holding.shares) {
      player.finance.assets = player.finance.assets.filter((a) => a.id !== holding.id);
    } else {
      const remainRatio = (holding.shares - qty) / holding.shares;
      holding.shares -= qty;
      holding.cost = Math.round(holding.cost * remainRatio);
      holding.downPayment = Math.round(holding.downPayment * remainRatio);
      holding.cashFlow = Math.round(holding.cashFlow * remainRatio);
    }

    FinancialEngine.recalculate(player.finance, player.career);
    const delta = FinancialEngine.buildDelta(before, player.finance, {
      th: `ขายหุ้น ${card.symbol} จำนวน ${qty.toLocaleString()} หุ้น (+${proceeds.toLocaleString()} ฿)`,
      en: `Sold ${qty.toLocaleString()} shares of ${symEn} (+${proceeds.toLocaleString()} ฿)`,
    });

    this.addLog(
      player,
      'SELL_STOCK',
      {
        th: `${player.name} ขายหุ้น ${card.symbol} จำนวน ${qty.toLocaleString()} หุ้น ที่ราคา ${price.toLocaleString()} ฿/หุ้น รับเงิน +${proceeds.toLocaleString()} ฿`,
        en: `${player.name} sold ${qty.toLocaleString()} shares of ${symEn} at ${price.toLocaleString()} ฿/share (+${proceeds.toLocaleString()} ฿).`,
      },
      delta
    );

    if (isActivePlayer) {
      this.afterActiveStockDecision(player, card);
    } else if (isOtherSeller) {
      const pending = this.state.pendingStockSells.find((s) => s.playerId === playerId);
      if (pending) pending.responded = true;
      this.checkStockSellCompletion();
    }
    return { success: true };
  }

  public skipStockSell(playerId: string): { success: boolean } {
    if (this.state.phase !== 'STOCK_MARKET_SELL') return { success: false };
    const pending = this.state.pendingStockSells.find((s) => s.playerId === playerId);
    if (!pending) return { success: false };
    pending.responded = true;
    this.checkStockSellCompletion();
    return { success: true };
  }

  private afterActiveStockDecision(activePlayer: Player, card: DealCard): void {
    // Check if OTHER players hold this stock so they can choose to SELL ONLY at card price
    const symEn = formatStockSymbol(card.symbol, 'en');
    const pending: typeof this.state.pendingStockSells = [];
    for (const p of this.state.players) {
      if (p.id === activePlayer.id || p.isBankrupt || p.track !== activePlayer.track) continue;
      const holding = p.finance.assets.find((a) => a.category === 'stock' && a.symbol === card.symbol);
      if (holding && (holding.shares || 0) > 0) {
        if (p.isBot) {
          // Bot sells if price >= 200 or >= 1.5x avg cost
          const avgBuy = holding.cost / (holding.shares || 1);
          const price = card.pricePerShare || 0;
          if (price >= avgBuy * 1.5 || price >= 250) {
            const before = FinancialEngine.snapshot(p.finance);
            const proceeds = (holding.shares || 0) * price;
            p.finance.cash += proceeds;
            p.finance.assets = p.finance.assets.filter((a) => a.id !== holding.id);
            FinancialEngine.recalculate(p.finance, p.career);
            const delta = FinancialEngine.buildDelta(before, p.finance, {
              th: `${p.name} ขายหุ้น ${card.symbol} (+${proceeds.toLocaleString()} ฿)`,
              en: `${p.name} sold ${symEn} (+${proceeds.toLocaleString()} ฿)`,
            });
            this.addLog(
              p,
              'BOT_SELL_STOCK',
              {
                th: `${p.name} (Robot) ตัดสินใจขายหุ้น ${card.symbol} ทั้งหมด รับเงิน +${proceeds.toLocaleString()} ฿`,
                en: `${p.name} (Robot) sold all ${symEn} shares for +${proceeds.toLocaleString()} ฿.`,
              },
              delta
            );
          }
        } else {
          pending.push({
            playerId: p.id,
            symbol: card.symbol!,
            sharesOwned: holding.shares || 0,
            pricePerShare: card.pricePerShare || card.cost,
            responded: false,
          });
        }
      }
    }

    if (pending.length > 0) {
      this.state.pendingStockSells = pending;
      this.state.phase = 'STOCK_MARKET_SELL';
      this.addLog(
        activePlayer,
        'STOCK_OTHERS_SELL',
        {
          th: `ผู้เล่นอื่นที่ถือหุ้น ${card.symbol} สามารถเลือกขายหุ้นได้ที่ราคา ${card.pricePerShare?.toLocaleString()} ฿/หุ้น (ขายได้อย่างเดียว)`,
          en: `Other players holding ${symEn} may SELL ONLY at ${card.pricePerShare?.toLocaleString()} ฿/share.`,
        },
        null
      );
    } else {
      if (this.checkEscapedRatRace(activePlayer)) {
        if (activePlayer.isBot) {
          this.state.phase = 'BOT_THINKING';
          this.state.botStepStage = 3;
        } else {
          this.state.phase = activePlayer.dreamId ? 'TURN_COMPLETE' : 'CHOOSE_DREAM';
        }
      } else {
        this.state.phase = activePlayer.isBot ? 'BOT_THINKING' : 'TURN_COMPLETE';
        if (activePlayer.isBot) this.state.botStepStage = 3;
      }
    }
  }

  private checkStockSellCompletion(): void {
    const allDone = this.state.pendingStockSells.every((s) => s.responded);
    if (allDone) {
      this.state.pendingStockSells = [];
      const active = this.currentPlayer;
      if (this.checkEscapedRatRace(active)) {
        if (active.isBot) {
          this.state.phase = 'BOT_THINKING';
          this.state.botStepStage = 3;
        } else {
          this.state.phase = active.dreamId ? 'TURN_COMPLETE' : 'CHOOSE_DREAM';
        }
      } else {
        this.state.phase = active.isBot ? 'BOT_THINKING' : 'TURN_COMPLETE';
        if (active.isBot) this.state.botStepStage = 3;
      }
    }
  }

  public passDeal(playerId: string): { success: boolean } {
    const player = this.currentPlayer;
    if (player.id !== playerId || this.state.phase !== 'DEAL_DECISION') return { success: false };
    const card = this.state.activeCard as DealCard;

    this.addLog(
      player,
      'PASS_DEAL',
      {
        th: `${player.name} ตัดสินใจไม่ซื้อการ์ด "${card.title.th}"`,
        en: `${player.name} passed on "${card.title.en}".`,
      },
      null
    );

    if (card.kind === 'stock') {
      this.afterActiveStockDecision(player, card);
    } else {
      this.state.phase = 'TURN_COMPLETE';
    }
    return { success: true };
  }

  // ==================== DEAL AUCTION (SELLING RIGHTS FOR COMMISSION) ====================

  public startAuction(playerId: string, startingBid = 0): { success: boolean; error?: BilingualText } {
    const player = this.currentPlayer;
    if (player.id !== playerId || this.state.phase !== 'DEAL_DECISION') {
      return { success: false };
    }
    const eligibleBidders = this.state.players.filter(
      (p) => p.id !== player.id && !p.isBankrupt && p.track === player.track
    );
    if (eligibleBidders.length < 1) {
      return {
        success: false,
        error: {
          th: 'ไม่มีผู้เล่นคนอื่นในวงในสำหรับขายสิทธิ์หรือประมูลการ์ดนี้',
          en: 'No other players on the same track to sell/auction deal rights.',
        },
      };
    }

    const card = this.state.activeCard as DealCard;
    if (!card || card.kind === 'stock' || card.kind === 'stock_split' || card.kind === 'deal_expense' || card.canSellRight === false) {
      return {
        success: false,
        error: {
          th: 'การ์ดใบนี้ซื้อได้เฉพาะผู้เปิดการ์ดเท่านั้น (ไม่สามารถขายสิทธิ์ต่อหรือประมูลได้)',
          en: 'This card cannot be sold or auctioned to other players.',
        },
      };
    }

    const startFee = Number.isFinite(startingBid) ? Math.max(0, Math.round(startingBid)) : 0;
    this.state.phase = 'AUCTION_ACTIVE';
    this.state.auction = {
      card,
      sellerId: player.id,
      sellerName: player.name,
      startingBid: startFee,
      highestBid: startFee,
      highestBidderId: null,
      highestBidderName: null,
      passedPlayerIds: [],
      endsAt: Date.now() + 25000,
    };

    this.addLog(
      player,
      'AUCTION_START',
      {
        th: `🔨 ${player.name} เปิดขายสิทธิ์/ประมูล "${card.title.th}" (เรียกค่านายหน้าเริ่มต้น ${startFee.toLocaleString()} ฿ — หากมีผู้สนใจมากกว่า 1 คน สามารถประมูลแข่งกันได้)`,
        en: `🔨 ${player.name} offered deal rights for "${card.title.en}" (starting commission ${startFee.toLocaleString()} ฿ — auction if >1 buyer is interested).`,
      },
      null
    );

    this.evaluateBotBids();
    return { success: true };
  }

  private evaluateBotBids(): void {
    if (!this.state.auction || this.state.phase !== 'AUCTION_ACTIVE') return;
    const auction = this.state.auction;
    const card = auction.card;

    const seller = this.state.players.find((p) => p.id === auction.sellerId);
    const sellerTrack = seller?.track || 'rat_race';

    let rounds = 0;
    let placedAny = true;
    while (placedAny && rounds < 10) {
      placedAny = false;
      rounds++;
      for (const p of this.state.players) {
        if (!p.isBot || p.isBankrupt || p.id === auction.sellerId || p.track !== sellerTrack) continue;
        if (auction.passedPlayerIds.includes(p.id) || auction.highestBidderId === p.id) continue;

        const minNextBid = auction.highestBidderId
          ? auction.highestBid + 1000
          : Math.max(0, auction.startingBid);
        const totalNeeded = minNextBid + card.downPayment;
        const maxWillingFee =
          card.cashFlow > 0
            ? Math.min(30000, Math.round(card.cashFlow * 3))
            : card.kind === 'gold' || card.kind === 'land'
            ? 5000
            : 0;
        const wantsDeal = card.cashFlow >= 1000 || card.kind === 'gold' || card.kind === 'land';

        if (wantsDeal && p.finance.cash >= totalNeeded + 5000 && minNextBid <= maxWillingFee) {
          auction.highestBid = minNextBid;
          auction.highestBidderId = p.id;
          auction.highestBidderName = p.name;
          placedAny = true;
          this.addLog(
            p,
            'BOT_BID',
            {
              th: `${p.name} (Robot) เสนอรับสิทธิ์/ประมูลค่านายหน้า ${minNextBid.toLocaleString()} ฿`,
              en: `${p.name} (Robot) bid ${minNextBid.toLocaleString()} ฿ commission.`,
            },
            null
          );
        } else {
          auction.passedPlayerIds.push(p.id);
        }
      }
    }

    this.checkAuctionAutoResolve();
  }

  public placeBid(bidderId: string, amount: number): { success: boolean; error?: BilingualText } {
    if (this.state.phase !== 'AUCTION_ACTIVE' || !this.state.auction) {
      return { success: false, error: { th: 'ไม่มีการประมูลในขณะนี้', en: 'No active auction.' } };
    }

    const auction = this.state.auction;
    if (bidderId === auction.sellerId) {
      return { success: false, error: { th: 'เจ้าของสิทธิ์ไม่สามารถประมูลเองได้', en: 'Seller cannot bid on own deal.' } };
    }

    const bidder = this.state.players.find((p) => p.id === bidderId);
    const seller = this.state.players.find((p) => p.id === auction.sellerId);
    if (!bidder || bidder.isBankrupt || (seller && bidder.track !== seller.track)) {
      return {
        success: false,
        error: {
          th: bidder?.isBankrupt
            ? 'ผู้เล่นที่ล้มละลายแล้วไม่สามารถร่วมประมูลได้'
            : 'ผู้เล่นวงนอกไม่สามารถเข้าร่วมประมูลการ์ดวงในได้',
          en: bidder?.isBankrupt
            ? 'Bankrupt players cannot bid.'
            : 'Players on another track cannot bid.',
        },
      };
    }

    const bidAmount = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
    const minRequired = auction.highestBidderId
      ? auction.highestBid + 1
      : Math.max(0, auction.startingBid);
    if (bidAmount < minRequired) {
      return {
        success: false,
        error: {
          th: `ราคาประมูลต้องไม่น้อยกว่า ${minRequired.toLocaleString()} ฿`,
          en: `Bid must be at least ${minRequired.toLocaleString()} ฿.`,
        },
      };
    }

    const totalCashNeeded = bidAmount + auction.card.downPayment;
    if (bidder.finance.cash < totalCashNeeded) {
      return {
        success: false,
        error: {
          th: `เงินสดไม่พอ (ต้องมีค่านายหน้า ${bidAmount.toLocaleString()} ฿ + เงินดาวน์ ${auction.card.downPayment.toLocaleString()} ฿ = ${totalCashNeeded.toLocaleString()} ฿)`,
          en: `Insufficient cash (need ${totalCashNeeded.toLocaleString()} ฿ for commission + down payment).`,
        },
      };
    }

    auction.highestBid = bidAmount;
    auction.highestBidderId = bidder.id;
    auction.highestBidderName = bidder.name;
    auction.passedPlayerIds = auction.passedPlayerIds.filter((id) => id !== bidder.id);

    this.addLog(
      bidder,
      'AUCTION_BID',
      {
        th: `🔨 ${bidder.name} เสนอค่านายหน้า ${bidAmount.toLocaleString()} ฿ สำหรับ "${auction.card.title.th}"`,
        en: `🔨 ${bidder.name} bid ${bidAmount.toLocaleString()} ฿ finder's fee for "${auction.card.title.en}".`,
      },
      null
    );

    this.evaluateBotBids();
    return { success: true };
  }

  public passAuction(playerId: string): { success: boolean } {
    if (this.state.phase !== 'AUCTION_ACTIVE' || !this.state.auction) return { success: false };
    const auction = this.state.auction;
    if (playerId === auction.sellerId) return { success: false };
    if (!auction.passedPlayerIds.includes(playerId)) {
      auction.passedPlayerIds.push(playerId);
    }
    this.checkAuctionAutoResolve();
    return { success: true };
  }

  public closeAuction(requesterId: string): { success: boolean } {
    if (this.state.phase !== 'AUCTION_ACTIVE' || !this.state.auction) return { success: false };
    if (requesterId !== this.state.auction.sellerId && requesterId !== this.state.hostId) {
      return { success: false };
    }
    this.resolveAuction();
    return { success: true };
  }

  private checkAuctionAutoResolve(): void {
    if (!this.state.auction) return;
    const auction = this.state.auction;
    const seller = this.state.players.find((p) => p.id === auction.sellerId);
    const sellerTrack = seller?.track || 'rat_race';
    const eligibleBidders = this.state.players.filter(
      (p) => p.id !== auction.sellerId && !p.isBankrupt && p.track === sellerTrack
    );
    const remainingActive = eligibleBidders.filter(
      (p) => !auction.passedPlayerIds.includes(p.id) && p.id !== auction.highestBidderId
    );
    if (remainingActive.length === 0) {
      this.resolveAuction();
    }
  }

  private resolveAuction(): void {
    const auction = this.state.auction;
    if (!auction) return;

    const seller = this.state.players.find((p) => p.id === auction.sellerId)!;
    const card = auction.card;

    if (auction.highestBidderId) {
      const winner = this.state.players.find((p) => p.id === auction.highestBidderId)!;

      // Transfer commission (even if 0 ฿)
      const sellerBefore = FinancialEngine.snapshot(seller.finance);
      seller.finance.cash += auction.highestBid;
      const sellerDelta = FinancialEngine.buildDelta(sellerBefore, seller.finance, {
        th: `รับค่านายหน้าขายสิทธิ์ประมูล +${auction.highestBid.toLocaleString()} ฿`,
        en: `Earned finder's fee +${auction.highestBid.toLocaleString()} ฿`,
      });

      // Winner pays commission + downPayment and gets asset
      const winnerBefore = FinancialEngine.snapshot(winner.finance);
      winner.finance.cash -= auction.highestBid + card.downPayment;
      const category =
        card.kind === 'cd'
          ? 'cd'
          : card.kind === 'gold'
          ? 'gold'
          : card.kind === 'land'
          ? 'land'
          : card.kind === 'business'
          ? 'business'
          : 'real_estate';
      FinancialEngine.addAsset(winner, {
        id: `asset_${Date.now()}`,
        name: card.title,
        category,
        tag: card.tag,
        cost: card.cost,
        downPayment: card.downPayment,
        mortgage: card.mortgage,
        cashFlow: card.cashFlow,
        units: card.units,
      });
      FinancialEngine.buildDelta(winnerBefore, winner.finance, {
        th: `ชนะประมูล "${card.title.th}" (ค่านายหน้า ${auction.highestBid.toLocaleString()} + ดาวน์ ${card.downPayment.toLocaleString()} ฿)`,
        en: `Won auction "${card.title.en}"`,
      });

      this.addLog(
        winner,
        'AUCTION_WON',
        {
          th: `🏆 ${winner.name} ได้รับสิทธิ์ซื้อ "${card.title.th}" (ค่านายหน้า ${auction.highestBid.toLocaleString()} ฿ ให้ ${seller.name}) สำเร็จ!`,
          en: `🏆 ${winner.name} won the deal "${card.title.en}" paying ${auction.highestBid.toLocaleString()} ฿ commission to ${seller.name}!`,
        },
        sellerDelta
      );

      this.checkEscapedRatRace(winner);
    } else {
      this.addLog(
        seller,
        'AUCTION_NO_BID',
        {
          th: `ไม่มีผู้ประมูลสิทธิ์การ์ด "${card.title.th}" การ์ดถูกทิ้งลงกอง`,
          en: `No bids placed for "${card.title.en}". Card discarded.`,
        },
        null
      );
    }

    this.state.auction = null;
    if (seller.isBot) {
      this.state.phase = 'BOT_THINKING';
      this.state.botStepStage = 3;
    } else {
      this.state.phase = 'TURN_COMPLETE';
    }
  }

  // ==================== MARKET CARDS ====================

  private initiateMarketResponse(drawer: Player, card: MarketCard): void {
    const details = this.formatMarketDetails(card);

    // 1. Automatic business cashflow boost for all players on the track
    if (card.offerType === 'cashflow_boost') {
      const affectedTh: string[] = [];
      const affectedEn: string[] = [];
      let drawerDelta: FinancialDelta | null = null;

      for (const p of this.state.players) {
        if (p.isBankrupt || p.track !== drawer.track) continue;
        const matching = p.finance.assets.filter((a) => card.targetTags.includes(a.tag));
        if (matching.length === 0) continue;

        const before = FinancialEngine.snapshot(p.finance);
        for (const asset of matching) {
          asset.cashFlow += card.offerAmount;
        }
        FinancialEngine.recalculate(p.finance, p.career);
        const totalGain = matching.length * card.offerAmount;
        const delta = FinancialEngine.buildDelta(before, p.finance, {
          th: `${card.title.th} (+${totalGain.toLocaleString()} ฿/ด.)`,
          en: `${card.title.en} (+${totalGain.toLocaleString()} ฿/mo)`,
        });
        if (p.id === drawer.id) drawerDelta = delta;
        affectedTh.push(`${p.name} (+${totalGain.toLocaleString()} ฿/ด.)`);
        affectedEn.push(`${p.name} (+${totalGain.toLocaleString()} ฿/mo)`);
        this.checkEscapedRatRace(p);
      }

      const summaryTh = affectedTh.length > 0 ? affectedTh.join(', ') : 'ยังไม่มีผู้เล่นที่เป็นเจ้าของธุรกิจ';
      const summaryEn = affectedEn.length > 0 ? affectedEn.join(', ') : 'No players own a business';

      this.addLog(
        drawer,
        'MARKET_BOOST',
        {
          th: `📢 การ์ดซื้อขาย: ${details.th} (${summaryTh})`,
          en: `📢 Market Card: ${details.en} (${summaryEn})`,
        },
        drawerDelta,
        {
          th: `📢 ${drawer.name} เปิดการ์ดซื้อขาย — ${summaryTh}`,
          en: `📢 ${drawer.name} drew Market Card — ${summaryEn}`,
        }
      );

      if (drawer.track === 'fast_track' && !drawer.dreamId && !drawer.isBot) {
        this.state.phase = 'CHOOSE_DREAM';
      } else if (drawer.isBot) {
        this.state.phase = 'BOT_THINKING';
        this.state.botStepStage = 3;
      } else {
        this.state.phase = 'TURN_COMPLETE';
      }
      return;
    }

    // 2. Forced return of matching assets to bank + down payment refund (e.g. 10% inflation)
    if (card.offerType === 'foreclose_refund') {
      const matching = drawer.finance.assets.filter((a) => card.targetTags.includes(a.tag));
      if (matching.length > 0) {
        const before = FinancialEngine.snapshot(drawer.finance);
        const refundTotal = matching.reduce((sum, a) => sum + (a.downPayment || 0), 0);
        const matchingIds = new Set(matching.map((a) => a.id));
        drawer.finance.cash += refundTotal;
        drawer.finance.assets = drawer.finance.assets.filter((a) => !matchingIds.has(a.id));
        FinancialEngine.recalculate(drawer.finance, drawer.career);
        const delta = FinancialEngine.buildDelta(before, drawer.finance, {
          th: `คืนบ้านเช่า ${matching.length} หลังให้ธนาคาร รับเงินดาวน์คืน +${refundTotal.toLocaleString()} ฿`,
          en: `Returned ${matching.length} rental house(s) to bank (+${refundTotal.toLocaleString()} ฿ down payment refunded)`,
        });
        this.addLog(
          drawer,
          'MARKET_FORECLOSE_REFUND',
          {
            th: `📢 ${drawer.name} จั่วการ์ด "${card.title.th}": คืนบ้านเช่า ${matching.length} หลัง รับเงินดาวน์คืน +${refundTotal.toLocaleString()} ฿`,
            en: `📢 ${drawer.name} drew "${card.title.en}": returned ${matching.length} house(s) and refunded +${refundTotal.toLocaleString()} ฿.`,
          },
          delta,
          {
            th: `📢 ${drawer.name} เปิดการ์ดซื้อขาย — คืนบ้านเช่า ${matching.length} หลัง รับเงินดาวน์คืน +${refundTotal.toLocaleString()} ฿`,
            en: `📢 ${drawer.name} drew Market Card — returned ${matching.length} house(s), refunded +${refundTotal.toLocaleString()} ฿`,
          }
        );
      } else {
        this.addLog(
          drawer,
          'MARKET_FORECLOSE_NONE',
          {
            th: `📢 ${drawer.name} จั่วการ์ด "${card.title.th}" (ไม่มีบ้านเช่าในครอบครอง)`,
            en: `📢 ${drawer.name} drew "${card.title.en}" (owns no rental houses).`,
          },
          null,
          {
            th: `📢 ${drawer.name} เปิดการ์ดซื้อขาย — ไม่มีบ้านเช่าในครอบครอง`,
            en: `📢 ${drawer.name} drew Market Card — no rental houses owned.`,
          }
        );
      }

      if (drawer.isBot) {
        this.state.phase = 'BOT_THINKING';
        this.state.botStepStage = 3;
      } else {
        this.state.phase = 'TURN_COMPLETE';
      }
      return;
    }

    // 3. Standard sales & drawer-only offers (including cashflow_adjust)
    const pending: typeof this.state.pendingMarketResponses = [];
    const botSoldMessagesTh: string[] = [];
    const botSoldMessagesEn: string[] = [];

    for (const p of this.state.players) {
      if (p.isBankrupt || p.track !== drawer.track) continue;
      if (card.onlyDrawer && p.id !== drawer.id) continue;

      const matchingAssets = p.finance.assets.filter(
        (a) =>
          card.targetTags.includes(a.tag) &&
          (!card.minUnits || (a.units || 0) >= card.minUnits)
      );
      if (matchingAssets.length === 0) continue;

      if (p.isBot) {
        if (card.offerType === 'cashflow_adjust') {
          continue; // Robot declines negative cashflow deal
        }
        for (const asset of matchingAssets) {
          const salePrice = this.computeMarketAssetSalePrice(card, asset);
          const netCash = salePrice - asset.mortgage;
          if (netCash > asset.downPayment * 1.1) {
            const before = FinancialEngine.snapshot(p.finance);
            p.finance.cash += netCash;
            p.finance.assets = p.finance.assets.filter((a) => a.id !== asset.id);
            FinancialEngine.recalculate(p.finance, p.career);
            FinancialEngine.buildDelta(before, p.finance, {
              th: `${p.name} ขาย ${asset.name.th} รับเงินสุทธิ +${netCash.toLocaleString()} ฿`,
              en: `${p.name} sold ${asset.name.en} (+${netCash.toLocaleString()} ฿)`,
            });
            botSoldMessagesTh.push(`${p.name} ขาย ${asset.name.th} (+${netCash.toLocaleString()} ฿)`);
            botSoldMessagesEn.push(`${p.name} sold ${asset.name.en} (+${netCash.toLocaleString()} ฿)`);
            this.checkEscapedRatRace(p);
          }
        }
      } else {
        pending.push({
          playerId: p.id,
          assetIds: matchingAssets.map((a) => a.id),
          responded: false,
        });
      }
    }

    if (pending.length > 0) {
      this.state.pendingMarketResponses = pending;
      this.state.phase = 'MARKET_RESPONSE';
      this.addLog(
        drawer,
        'MARKET_ACTIVE',
        {
          th: `📢 การ์ดซื้อขาย: ${details.th} — ผู้เล่นที่มีทรัพย์สินตรงเงื่อนไขเลือก "ขาย" หรือ "ไม่ขาย" ได้ทันที!`,
          en: `📢 Market Card: ${details.en} — Players owning matching assets may choose to Sell or Keep!`,
        },
        null,
        {
          th: `📢 ${drawer.name} เปิดการ์ดซื้อขาย — ผู้เล่นที่มีทรัพย์สินตรงเงื่อนไขเลือกดำเนินการได้ทันที!`,
          en: `📢 ${drawer.name} drew Market Card — Players owning matching assets may respond now!`,
        }
      );
    } else {
      const botNoteTh = botSoldMessagesTh.length > 0 ? ` (${botSoldMessagesTh.join(', ')})` : ' (ไม่มีผู้เล่นที่มีทรัพย์สินนี้)';
      const botNoteEn = botSoldMessagesEn.length > 0 ? ` (${botSoldMessagesEn.join(', ')})` : ' (No players own this asset)';
      this.addLog(
        drawer,
        'MARKET_RESOLVED',
        {
          th: `📢 การ์ดซื้อขาย: ${details.th}${botNoteTh}`,
          en: `📢 Market Card: ${details.en}${botNoteEn}`,
        },
        null,
        {
          th: `📢 ${drawer.name} เปิดการ์ดซื้อขาย${botNoteTh}`,
          en: `📢 ${drawer.name} drew Market Card${botNoteEn}`,
        }
      );
      if (drawer.isBot) {
        this.state.phase = 'BOT_THINKING';
        this.state.botStepStage = 3;
      } else {
        this.state.phase = 'TURN_COMPLETE';
      }
    }
  }

  public respondToMarket(playerId: string, sellAssetIds: string[]): { success: boolean } {
    if (this.state.phase !== 'MARKET_RESPONSE') return { success: false };
    const card = this.state.activeCard as MarketCard;
    if (!card || card.deck !== 'market') return { success: false };

    const pending = this.state.pendingMarketResponses.find((r) => r.playerId === playerId);
    if (!pending || pending.responded) return { success: false };

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { success: false };

    const validSellIds = sellAssetIds.filter((id) => pending.assetIds.includes(id));
    if (validSellIds.length > 0) {
      const before = FinancialEngine.snapshot(player.finance);

      if (card.offerType === 'cashflow_adjust') {
        const adjustedNamesTh: string[] = [];
        const adjustedNamesEn: string[] = [];
        for (const assetId of validSellIds) {
          const asset = player.finance.assets.find((a) => a.id === assetId);
          if (!asset) continue;
          asset.cashFlow += card.offerAmount;
          adjustedNamesTh.push(asset.name.th);
          adjustedNamesEn.push(asset.name.en);
        }
        FinancialEngine.recalculate(player.finance, player.career);
        const delta = FinancialEngine.buildDelta(before, player.finance, {
          th: `ปรับกระแสเงินสด (${adjustedNamesTh.join(', ')}) ${card.offerAmount.toLocaleString()} ฿/ด.`,
          en: `Adjusted cashflow (${adjustedNamesEn.join(', ')}) ${card.offerAmount.toLocaleString()} ฿/mo`,
        });
        this.addLog(
          player,
          'MARKET_ADJUSTED',
          {
            th: `${player.name} ตกลงขายบ้านให้น้องเขย (${adjustedNamesTh.join(', ')}) รายได้เปลี่ยน ${card.offerAmount.toLocaleString()} ฿/เดือน`,
            en: `${player.name} accepted brother-in-law deal (${adjustedNamesEn.join(', ')}): ${card.offerAmount.toLocaleString()} ฿/mo cashflow.`,
          },
          delta
        );
      } else {
        let totalNet = 0;
        const soldNamesTh: string[] = [];
        const soldNamesEn: string[] = [];

        for (const assetId of validSellIds) {
          const asset = player.finance.assets.find((a) => a.id === assetId);
          if (!asset) continue;
          const salePrice = this.computeMarketAssetSalePrice(card, asset);
          const netCash = salePrice - asset.mortgage;
          totalNet += netCash;
          soldNamesTh.push(asset.name.th);
          soldNamesEn.push(asset.name.en);
        }

        player.finance.cash += totalNet;
        player.finance.assets = player.finance.assets.filter((a) => !validSellIds.includes(a.id));
        FinancialEngine.recalculate(player.finance, player.career);
        const delta = FinancialEngine.buildDelta(before, player.finance, {
          th: `ขายทรัพย์สินในตลาด (${soldNamesTh.join(', ')}) รับเงินสุทธิ ${totalNet >= 0 ? '+' : ''}${totalNet.toLocaleString()} ฿`,
          en: `Sold on Market (${soldNamesEn.join(', ')}) for ${totalNet >= 0 ? '+' : ''}${totalNet.toLocaleString()} ฿`,
        });

        this.addLog(
          player,
          'MARKET_SOLD',
          {
            th: `💰 ${player.name} ขาย ${soldNamesTh.join(', ')} รับเงินสุทธิ ${totalNet >= 0 ? '+' : ''}${totalNet.toLocaleString()} ฿`,
            en: `💰 ${player.name} sold ${soldNamesEn.join(', ')} for ${totalNet >= 0 ? '+' : ''}${totalNet.toLocaleString()} ฿ net cash.`,
          },
          delta
        );
        this.checkEscapedRatRace(player);
      }
    } else {
      this.addLog(
        player,
        'MARKET_KEPT',
        {
          th: `${player.name} เลือกเก็บทรัพย์สินไว้ (ไม่ขาย)`,
          en: `${player.name} chose to keep their asset.`,
        },
        null
      );
    }

    pending.responded = true;
    const allDone = this.state.pendingMarketResponses.every((r) => r.responded);
    if (allDone) {
      this.state.pendingMarketResponses = [];
      const active = this.currentPlayer;
      if (active.track === 'fast_track' && !active.dreamId && !active.isBot) {
        this.state.phase = 'CHOOSE_DREAM';
      } else if (active.isBot) {
        this.state.phase = 'BOT_THINKING';
        this.state.botStepStage = 3;
      } else {
        this.state.phase = 'TURN_COMPLETE';
      }
    }
    return { success: true };
  }

  // ==================== DOODAD, CHARITY, DREAM, FAST TRACK ====================

  public payDoodad(playerId: string): { success: boolean; error?: BilingualText } {
    const player = this.currentPlayer;
    if (player.id !== playerId || this.state.phase !== 'DOODAD_PAY') return { success: false };
    const card = this.state.activeCard;
    if (!card) return { success: false };

    let cost = 0;
    let isDealExpense = false;
    if (card.deck === 'doodad') {
      cost = this.getDoodadEffectiveCost(card as DoodadCard, player);
    } else if ((card as DealCard).kind === 'deal_expense') {
      cost = (card as DealCard).cost;
      isDealExpense = true;
    } else {
      return { success: false };
    }

    if (player.finance.cash < cost) {
      if (!FinancialEngine.canCoverExpenseWithLoan(player.finance, cost)) {
        const before = FinancialEngine.snapshot(player.finance);
        const cashBefore = player.finance.cash;
        const maxLoan = player.finance.maxLoanLimit;
        player.finance.cash = 0;
        const delta = FinancialEngine.buildDelta(before, player.finance, {
          th: `ล้มละลายจาก "${card.title.th}" (${cost.toLocaleString()} ฿)`,
          en: `Bankrupt from "${card.title.en}" (${cost.toLocaleString()} ฿)`,
        });
        this.declareBankruptcy(
          player,
          {
            th: `ต้องจ่าย "${card.title.th}" (${cost.toLocaleString()} ฿) แต่เงินสดมี ${cashBefore.toLocaleString()} ฿ และวงเงินกู้คงเหลือ ${maxLoan.toLocaleString()} ฿ ไม่พอจ่าย`,
            en: `Owed ${cost.toLocaleString()} ฿ for "${card.title.en}" with ${cashBefore.toLocaleString()} ฿ cash and ${maxLoan.toLocaleString()} ฿ loan limit`,
          },
          delta
        );
        this.state.phase = 'TURN_COMPLETE';
        return { success: true };
      }

      return {
        success: false,
        error: {
          th: `เงินสดไม่พอจ่าย ${cost.toLocaleString()} ฿ กรุณากู้เงินธนาคารก่อน`,
          en: `Not enough cash to pay ${cost.toLocaleString()} ฿. Take a bank loan first.`,
        },
      };
    }

    const before = FinancialEngine.snapshot(player.finance);
    player.finance.cash -= cost;
    const delta = FinancialEngine.buildDelta(before, player.finance, {
      th: `${isDealExpense ? 'ค่าใช้จ่ายทรัพย์สิน' : 'จ่ายซะ'}: ${card.title.th} (-${cost.toLocaleString()} ฿)`,
      en: `${isDealExpense ? 'Property Expense' : 'Doodad'}: ${card.title.en} (-${cost.toLocaleString()} ฿)`,
    });

    this.addLog(
      player,
      'DOODAD_PAID',
      {
        th: `💸 ${player.name} จ่ายค่า "${card.title.th}" เป็นเงิน ${cost.toLocaleString()} ฿`,
        en: `💸 ${player.name} paid ${cost.toLocaleString()} ฿ for "${card.title.en}".`,
      },
      delta
    );
    this.state.phase = 'TURN_COMPLETE';
    return { success: true };
  }

  public decideCharity(playerId: string, donate: boolean): { success: boolean; error?: BilingualText } {
    const player = this.currentPlayer;
    if (player.id !== playerId || this.state.phase !== 'CHARITY_DECISION') return { success: false };

    if (donate) {
      const donation = Math.round(player.finance.totalIncome * 0.1);
      if (player.finance.cash < donation) {
        return {
          success: false,
          error: { th: `เงินสดไม่พอสำหรับบริจาค (${donation.toLocaleString()} ฿)`, en: 'Insufficient cash to donate.' },
        };
      }
      const before = FinancialEngine.snapshot(player.finance);
      player.finance.cash -= donation;
      player.charityTurnsLeft = 3;
      const delta = FinancialEngine.buildDelta(before, player.finance, {
        th: `บริจาคการกุศล (-${donation.toLocaleString()} ฿)`,
        en: `Charity Donation (-${donation.toLocaleString()} ฿)`,
      });
      this.addLog(
        player,
        'CHARITY_DONATED',
        {
          th: `❤️ ${player.name} บริจาค ${donation.toLocaleString()} ฿ (สามารถเลือกทอย 1 หรือ 2 ลูกได้ 3 ตาถัดไป)`,
          en: `❤️ ${player.name} donated ${donation.toLocaleString()} ฿ (may roll 1 or 2 dice for next 3 turns).`,
        },
        delta
      );
    } else {
      this.addLog(
        player,
        'CHARITY_PASSED',
        { th: `${player.name} เลือกไม่บริจาค`, en: `${player.name} passed on Charity.` },
        null
      );
    }

    this.state.phase = 'TURN_COMPLETE';
    return { success: true };
  }

  public chooseDream(playerId: string, dreamId: string): { success: boolean } {
    const player = this.currentPlayer;
    if (player.id !== playerId || this.state.phase !== 'CHOOSE_DREAM') return { success: false };
    const dream = DREAM_OPTIONS.find((d) => d.id === dreamId) || DREAM_OPTIONS[0];
    player.dreamId = dream.id;
    this.addLog(
      player,
      'DREAM_CHOSEN',
      {
        th: `🌟 ${player.name} เลือกความฝันบนเส้นทางเศรษฐี: "${dream.name.th}" (ราคา ${dream.cost.toLocaleString()} ฿)`,
        en: `🌟 ${player.name} chose their Dream: "${dream.name.en}" (${dream.cost.toLocaleString()} ฿).`,
      },
      null
    );
    this.state.phase = 'TURN_COMPLETE';
    return { success: true };
  }

  public decideFastTrackSpace(playerId: string, buy: boolean): { success: boolean; error?: BilingualText } {
    const player = this.currentPlayer;
    const space = this.state.activeFastTrackSpace;
    if (player.id !== playerId || this.state.phase !== 'FAST_TRACK_DECISION' || !space) {
      return { success: false };
    }

    if (!buy) {
      this.addLog(
        player,
        'FT_PASS',
        { th: `${player.name} ข้าม "${space.label.th}"`, en: `${player.name} passed on "${space.label.en}".` },
        null
      );
      this.state.phase = 'TURN_COMPLETE';
      return { success: true };
    }

    const cost = space.cost || 0;
    if (player.finance.cash < cost) {
      return {
        success: false,
        error: { th: `เงินสดไม่พอ (ต้องการ ${cost.toLocaleString()} ฿)`, en: `Insufficient cash (need ${cost.toLocaleString()} ฿).` },
      };
    }

    if (space.type === 'dream') {
      const before = FinancialEngine.snapshot(player.finance);
      player.finance.cash -= cost;
      const isOwnDream = space.dreamId === player.dreamId;
      player.finance.fastTrackPinkPurchases.push({
        id: `pink_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: space.label,
        cost,
        isDreamGoal: isOwnDream,
      });
      if (isOwnDream) {
        const delta = FinancialEngine.buildDelta(before, player.finance, {
          th: `ซื้อความฝันสำเร็จ: ${space.label.th}!`,
          en: `Purchased your Dream: ${space.label.en}!`,
        });
        this.state.winnerId = player.id;
        this.state.winReason = {
          th: `${player.name} ซื้อความฝัน "${space.label.th}" สำเร็จและชนะเกม Cashflow!`,
          en: `${player.name} purchased their Dream "${space.label.en}" and won Cashflow!`,
        };
        this.state.phase = 'GAME_OVER';
        this.addLog(player, 'WIN_DREAM', this.state.winReason, delta);
        return { success: true };
      }

      const delta = FinancialEngine.buildDelta(before, player.finance, {
        th: `ซื้อประสบการณ์ท่องเที่ยว: ${space.label.th} (-${cost.toLocaleString()} ฿)`,
        en: `Visited lifestyle dream: ${space.label.en} (-${cost.toLocaleString()} ฿)`,
      });
      this.addLog(
        player,
        'FT_LIFESTYLE',
        {
          th: `${player.name} จ่าย ${cost.toLocaleString()} ฿ สำหรับ "${space.label.th}" (ไม่ใช่ความฝันที่เลือกไว้ เกมดำเนินต่อ)`,
          en: `${player.name} spent ${cost.toLocaleString()} ฿ on "${space.label.en}" (not their selected Dream).`,
        },
        delta
      );
      this.state.phase = 'TURN_COMPLETE';
      return { success: true };
    }

    if (space.type === 'charity') {
      const before = FinancialEngine.snapshot(player.finance);
      player.finance.cash -= cost;
      player.hasThreeDiceForever = true;
      const delta = FinancialEngine.buildDelta(before, player.finance, {
        th: `บริจาคการกุศลวงนอก (-${cost.toLocaleString()} ฿)`,
        en: `Fast Track Charity Donation (-${cost.toLocaleString()} ฿)`,
      });
      this.addLog(
        player,
        'FT_CHARITY',
        {
          th: `❤️ ${player.name} บริจาคการกุศล ${cost.toLocaleString()} ฿ ได้รับสิทธิ์เลือกทอยได้สูงสุด 3 ลูกตลอดไป!`,
          en: `❤️ ${player.name} donated ${cost.toLocaleString()} ฿ and unlocked rolling up to 3 dice forever!`,
        },
        delta
      );
      this.state.phase = 'TURN_COMPLETE';
      return { success: true };
    }

    if (space.type === 'business') {
      const before = FinancialEngine.snapshot(player.finance);
      player.finance.cash -= cost;
      const cf = space.cashFlow || 0;
      player.finance.fastTrackAddedCashFlow += cf;
      player.finance.fastTrackAssets.push({
        id: `ft_${Date.now()}`,
        name: space.label,
        cost,
        cashFlow: cf,
      });
      const delta = FinancialEngine.buildDelta(before, player.finance, {
        th: `ซื้อธุรกิจวงนอก "${space.label.th}" (+${cf.toLocaleString()} ฿/ด.)`,
        en: `Bought Fast Track Business "${space.label.en}" (+${cf.toLocaleString()} ฿/mo)`,
      });

      if (player.finance.fastTrackAddedCashFlow >= FAST_TRACK_WIN_CASHFLOW_TARGET) {
        this.state.winnerId = player.id;
        this.state.winReason = {
          th: `${player.name} สร้างกระแสเงินสดวงนอกเพิ่มครบ ${FAST_TRACK_WIN_CASHFLOW_TARGET.toLocaleString()} ฿/เดือน และชนะเกม!`,
          en: `${player.name} added ${FAST_TRACK_WIN_CASHFLOW_TARGET.toLocaleString()} ฿/mo Fast Track cashflow and won the game!`,
        };
        this.state.phase = 'GAME_OVER';
        this.addLog(player, 'WIN_CASHFLOW', this.state.winReason, delta);
      } else {
        this.addLog(
          player,
          'FT_BUY_BIZ',
          {
            th: `${player.name} ลงทุน "${space.label.th}" เพิ่มกระแสเงินสดวงนอก +${cf.toLocaleString()} ฿/ด. (สะสม ${player.finance.fastTrackAddedCashFlow.toLocaleString()}/${FAST_TRACK_WIN_CASHFLOW_TARGET.toLocaleString()} ฿)`,
            en: `${player.name} bought "${space.label.en}" (+${cf.toLocaleString()} ฿/mo, total +${player.finance.fastTrackAddedCashFlow.toLocaleString()}/${FAST_TRACK_WIN_CASHFLOW_TARGET.toLocaleString()} ฿).`,
          },
          delta
        );
        this.state.phase = 'TURN_COMPLETE';
      }
      return { success: true };
    }

    if (space.type === 'business_roll') {
      const before = FinancialEngine.snapshot(player.finance);
      player.finance.cash -= cost;
      const roll = this.rollDieValue();
      this.state.lastDiceRoll = [roll];
      this.state.diceRollSeq += 1;
      const threshold = space.rollThreshold || 4;
      const won = roll >= threshold;
      const cf = won ? space.rollWinCashFlow || 0 : 0;

      if (won && cf > 0) {
        player.finance.fastTrackAddedCashFlow += cf;
        player.finance.fastTrackAssets.push({
          id: `ft_${Date.now()}`,
          name: space.label,
          cost,
          cashFlow: cf,
        });
      }

      const delta = FinancialEngine.buildDelta(before, player.finance, {
        th: won
          ? `ลงทุน "${space.label.th}" ทอยได้ ${roll}! (+${cf.toLocaleString()} ฿/ด.)`
          : `ลงทุน "${space.label.th}" ทอยได้ ${roll} (ไม่ถึง ${threshold} · ไม่ได้รับกำไรรายเดือน)`,
        en: won
          ? `Invested in "${space.label.en}", rolled ${roll}! (+${cf.toLocaleString()} ฿/mo)`
          : `Invested in "${space.label.en}", rolled ${roll} (needed ${threshold}+ · 0 ฿/mo)`,
      });

      if (player.finance.fastTrackAddedCashFlow >= FAST_TRACK_WIN_CASHFLOW_TARGET) {
        this.state.winnerId = player.id;
        this.state.winReason = {
          th: `${player.name} ทอยได้ ${roll} ทำกำไรวงนอกครบ ${FAST_TRACK_WIN_CASHFLOW_TARGET.toLocaleString()} ฿/เดือน ชนะเกม!`,
          en: `${player.name} rolled ${roll} to reach ${FAST_TRACK_WIN_CASHFLOW_TARGET.toLocaleString()} ฿/mo Fast Track cashflow and won!`,
        };
        this.state.phase = 'GAME_OVER';
        this.addLog(player, 'WIN_CASHFLOW', this.state.winReason, delta);
      } else {
        this.addLog(
          player,
          'FT_BIZ_ROLL',
          {
            th: won
              ? `🎲 ${player.name} ลงทุน "${space.label.th}" ทอยลูกเต๋าได้ ${roll} (สำเร็จ!) รับ +${cf.toLocaleString()} ฿/ด.`
              : `🎲 ${player.name} ลงทุน "${space.label.th}" ทอยลูกเต๋าได้ ${roll} (ต้องได้ ${threshold}+) จึงไม่ได้รับกระแสเงินสดเพิ่ม`,
            en: won
              ? `🎲 ${player.name} invested in "${space.label.en}" and rolled ${roll} (Success! +${cf.toLocaleString()} ฿/mo).`
              : `🎲 ${player.name} invested in "${space.label.en}" and rolled ${roll} (needed ${threshold}+, +0 ฿/mo).`,
          },
          delta
        );
        this.state.phase = 'TURN_COMPLETE';
      }
      return { success: true };
    }

    if (space.type === 'ipo_roll') {
      const before = FinancialEngine.snapshot(player.finance);
      player.finance.cash -= cost;
      const roll = this.rollDieValue();
      this.state.lastDiceRoll = [roll];
      this.state.diceRollSeq += 1;
      const threshold = space.rollThreshold || 5;
      const won = roll >= threshold;
      const payout = won ? space.rollWinTotalPayout || 0 : 0;
      if (payout > 0) {
        player.finance.cash += payout;
      }

      const delta = FinancialEngine.buildDelta(before, player.finance, {
        th: won
          ? `หุ้นเข้าตลาดฯ "${space.label.th}" ทอยได้ ${roll}! รับเงิน ${payout.toLocaleString()} ฿`
          : `หุ้นเข้าตลาดฯ "${space.label.th}" ทอยได้ ${roll} (ต้องได้ ${threshold}+) พลาดผลตอบแทน`,
        en: won
          ? `IPO "${space.label.en}" rolled ${roll}! Won ${payout.toLocaleString()} ฿`
          : `IPO "${space.label.en}" rolled ${roll} (needed ${threshold}+, no payout)`,
      });

      this.addLog(
        player,
        'FT_IPO_ROLL',
        {
          th: won
            ? `🚀 ${player.name} ซื้อหุ้นเข้าตลาดฯ ทอยลูกเต๋าได้ ${roll}! รับเงินปันผลใหญ่ +${payout.toLocaleString()} ฿!`
            : `🎲 ${player.name} ซื้อหุ้นเข้าตลาดฯ ทอยลูกเต๋าได้ ${roll} (ต้องได้ ${threshold}+) ไม่ได้กำไรจาก IPO`,
          en: won
            ? `🚀 ${player.name} bought IPO stock and rolled ${roll}! Payout +${payout.toLocaleString()} ฿!`
            : `🎲 ${player.name} bought IPO stock and rolled ${roll} (needed ${threshold}+, no payout).`,
        },
        delta
      );
      this.state.phase = 'TURN_COMPLETE';
      return { success: true };
    }

    return { success: false };
  }

  // ==================== FINANCIAL ACTIONS (ANYTIME ON TURN / NEEDED) ====================

  public takeLoan(playerId: string, amount: number): { success: boolean; error?: BilingualText } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isBankrupt) return { success: false };
    const res = FinancialEngine.takeLoan(player, amount);
    if (res.success && res.delta) {
      this.addLog(
        player,
        'TAKE_LOAN',
        {
          th: `🏦 ${player.name} กู้เงินธนาคาร ${amount.toLocaleString()} ฿ (ดอกเบี้ย 10% = ${Math.round(amount * 0.1).toLocaleString()} ฿/เดือน)`,
          en: `🏦 ${player.name} took a bank loan of ${amount.toLocaleString()} ฿ (10% interest = ${Math.round(amount * 0.1).toLocaleString()} ฿/mo).`,
        },
        res.delta
      );
    }
    return { success: res.success, error: res.error };
  }

  public repayBankLoan(playerId: string, amount: number): { success: boolean; error?: BilingualText } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isBankrupt) return { success: false };
    const res = FinancialEngine.repayBankLoan(player, amount);
    if (res.success && res.delta) {
      this.addLog(
        player,
        'REPAY_LOAN',
        {
          th: `✅ ${player.name} ชำระคืนเงินกู้ธนาคาร ${amount.toLocaleString()} ฿`,
          en: `✅ ${player.name} repaid bank loan of ${amount.toLocaleString()} ฿.`,
        },
        res.delta
      );
      this.checkEscapedRatRace(player);
    }
    return { success: res.success, error: res.error };
  }

  public payOffLiability(
    playerId: string,
    key:
      | 'homeMortgageBalance'
      | 'schoolLoanBalance'
      | 'carLoanBalance'
      | 'creditCardBalance'
      | 'otherDebtBalance'
  ): { success: boolean; error?: BilingualText } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isBankrupt) return { success: false };
    const res = FinancialEngine.payOffLiability(player, key);
    if (res.success && res.delta) {
      this.addLog(
        player,
        'PAY_OFF_LIABILITY',
        {
          th: `✅ ${player.name} ${res.delta.reason.th}`,
          en: `✅ ${player.name} ${res.delta.reason.en}`,
        },
        res.delta
      );
      this.checkEscapedRatRace(player);
    }
    return { success: res.success, error: res.error };
  }

  // ==================== TURN ADVANCEMENT & ROBOT STEP-BY-STEP ====================

  public endTurn(playerId: string): { success: boolean } {
    if (this.state.phase !== 'TURN_COMPLETE') return { success: false };
    if (this.currentPlayer.id !== playerId && playerId !== this.state.hostId) return { success: false };
    this.advanceToNextPlayer();
    return { success: true };
  }

  public nextBotStep(requesterId: string): { success: boolean } {
    if (this.state.phase !== 'BOT_THINKING') return { success: false };
    const bot = this.currentPlayer;
    if (!bot.isBot) return { success: false };

    // Stage 0: Roll dice & move
    if (this.state.botStepStage === 0) {
      if (bot.downsizedTurnsLeft > 0) {
        bot.downsizedTurnsLeft -= 1;
        this.addLog(
          bot,
          'BOT_DOWNSIZED_SKIP',
          {
            th: `${bot.name} (Robot) ต้องหยุดพักจากการตกงาน (เหลืออีก ${bot.downsizedTurnsLeft} ตา) — กด "ถัดไป" เพื่อจบเทิร์น`,
            en: `${bot.name} (Robot) skips turn due to Downsized (${bot.downsizedTurnsLeft} turns left). Click Next Step.`,
          },
          null
        );
        this.state.botStepStage = 3;
        return { success: true };
      }

      const diceCount =
        bot.track === 'fast_track'
          ? bot.hasThreeDiceForever
            ? 3
            : 2
          : bot.charityTurnsLeft > 0
          ? 2
          : 1;
      if (bot.track === 'rat_race' && bot.charityTurnsLeft > 0) {
        bot.charityTurnsLeft -= 1;
      }
      const rolls = Array.from({ length: diceCount }, () => this.rollDieValue());
      this.state.lastDiceRoll = rolls;
      this.state.diceRollSeq += 1;
      const total = rolls.reduce((a, b) => a + b, 0);
      this.moveAndLand(bot, total, rolls);
      this.state.botStepStage = bot.isBankrupt ? 3 : 1;
      return { success: true };
    }

    // Stage 1: Draw card / inspect space
    if (this.state.botStepStage === 1) {
      if (bot.track === 'rat_race') {
        const space = RAT_RACE_SPACES[bot.position];
        if (space.type === 'opportunity') {
          const deckType = bot.finance.cash >= 150000 ? 'big_deal' : 'small_deal';
          const card = deckType === 'big_deal' ? this.drawBigDeal() : this.drawSmallDeal();
          this.state.activeCard = card;
          const details = this.formatDealDetails(card);
          this.addLog(
            bot,
            'BOT_DRAW_DEAL',
            {
              th: `${bot.name} (Robot) เลือกเปิดการ์ด${deckType === 'big_deal' ? 'โอกาสใหญ่' : 'โอกาสเล็ก'}: ${details.th}`,
              en: `${bot.name} (Robot) chose ${deckType === 'big_deal' ? 'Big Deal' : 'Small Deal'}: ${details.en}`,
            },
            null,
            {
              th: `${bot.name} (Robot) เลือกเปิดการ์ด${deckType === 'big_deal' ? 'โอกาสใหญ่' : 'โอกาสเล็ก'}`,
              en: `${bot.name} (Robot) chose ${deckType === 'big_deal' ? 'Big Deal' : 'Small Deal'}`,
            }
          );
          this.state.botStepStage = 2;
        } else if (space.type === 'doodad') {
          const card = this.drawDoodad();
          this.state.activeCard = card;
          const details = this.formatDoodadDetails(card);
          this.addLog(
            bot,
            'BOT_DRAW_DOODAD',
            {
              th: `${bot.name} (Robot) จั่วการ์ดจ่ายซะ: ${details.th}`,
              en: `${bot.name} (Robot) drew Doodad: ${details.en}`,
            },
            null,
            {
              th: `${bot.name} (Robot) จั่วการ์ดจ่ายซะ`,
              en: `${bot.name} (Robot) drew a Doodad card`,
            }
          );
          this.state.botStepStage = 2;
        } else if (space.type === 'market') {
          const card = this.drawMarket();
          this.state.activeCard = card;
          this.initiateMarketResponse(bot, card);
          // If no human needs to respond, stage moves to 3 inside initiateMarketResponse
        } else {
          // baby, charity, downsized, payday
          this.executeBotSpaceEffect(bot, space.type);
          this.state.botStepStage = 3;
        }
      } else {
        // Fast Track stage 1
        const space = FAST_TRACK_SPACES[bot.position];
        this.state.activeFastTrackSpace = space;
        this.executeBotFastTrackEffect(bot, space);
        if (!this.state.winnerId) {
          this.state.botStepStage = 3;
        }
      }
      return { success: true };
    }

    // Stage 2: Bot decides on drawn Opportunity or Doodad card
    if (this.state.botStepStage === 2) {
      const card = this.state.activeCard;
      if (!card) {
        this.state.botStepStage = 3;
        return { success: true };
      }

      if (card.deck === 'doodad') {
        const cost = this.getDoodadEffectiveCost(card as DoodadCard, bot);
        if (cost > 0) {
          const res = FinancialEngine.payExpenseOrBankrupt(
            bot,
            cost,
            {
              th: `${bot.name} จ่ายการ์ดจ่ายซะ (-${cost.toLocaleString()} ฿)`,
              en: `${bot.name} paid Doodad (-${cost.toLocaleString()} ฿)`,
            },
            {
              th: `ล้มละลายจาก "${card.title.th}" (${cost.toLocaleString()} ฿)`,
              en: `Bankrupt from "${card.title.en}" (${cost.toLocaleString()} ฿)`,
            }
          );
          if (res.bankrupt) {
            this.declareBankruptcy(
              bot,
              {
                th: `ตกช่อง "จ่ายซะ" (${card.title.th}: ${cost.toLocaleString()} ฿) แต่เงินสดมี ${res.cashBefore.toLocaleString()} ฿ และวงเงินกู้คงเหลือ ${res.maxLoanLimit.toLocaleString()} ฿ ไม่พอจ่าย`,
                en: `Landed on Doodad ("${card.title.en}": ${cost.toLocaleString()} ฿) with ${res.cashBefore.toLocaleString()} ฿ cash and ${res.maxLoanLimit.toLocaleString()} ฿ loan limit`,
              },
              res.delta
            );
            this.state.botStepStage = 3;
            return { success: true };
          }
          const loanNoteTh =
            res.loanAmt > 0
              ? ` (กู้ธนาคารเพิ่ม ${res.loanAmt.toLocaleString()} ฿ ดอกเบี้ย +${res.loanInterest.toLocaleString()} ฿/ด.)`
              : '';
          const loanNoteEn =
            res.loanAmt > 0
              ? ` (borrowed ${res.loanAmt.toLocaleString()} ฿, +${res.loanInterest.toLocaleString()} ฿/mo interest)`
              : '';
          this.addLog(
            bot,
            'BOT_PAY_DOODAD',
            {
              th: `${bot.name} (Robot) จ่ายเงิน ${cost.toLocaleString()} ฿ สำหรับ "${card.title.th}"${loanNoteTh}`,
              en: `${bot.name} (Robot) paid ${cost.toLocaleString()} ฿ for "${card.title.en}"${loanNoteEn}.`,
            },
            res.delta
          );
        } else {
          this.addLog(
            bot,
            'BOT_PAY_DOODAD',
            {
              th: `${bot.name} (Robot) จ่ายเงิน 0 ฿ สำหรับ "${card.title.th}"`,
              en: `${bot.name} (Robot) paid 0 ฿ for "${card.title.en}".`,
            },
            null
          );
        }
        this.state.botStepStage = 3;
        return { success: true };
      }

      if (card.deck === 'small_deal' || card.deck === 'big_deal') {
        this.executeBotDealDecision(bot, card);
        return { success: true };
      }
    }

    // Stage 3: End bot turn and advance to next player
    if (this.state.botStepStage === 3) {
      this.advanceToNextPlayer();
      return { success: true };
    }

    return { success: false };
  }

  private executeBotSpaceEffect(bot: Player, spaceType: string): void {
    if (spaceType === 'charity') {
      const donation = Math.round(bot.finance.totalIncome * 0.1);
      if (bot.finance.cash >= donation + 10000) {
        const before = FinancialEngine.snapshot(bot.finance);
        bot.finance.cash -= donation;
        bot.charityTurnsLeft = 3;
        const delta = FinancialEngine.buildDelta(before, bot.finance, {
          th: `${bot.name} บริจาคการกุศล (-${donation.toLocaleString()} ฿)`,
          en: `${bot.name} donated to Charity (-${donation.toLocaleString()} ฿)`,
        });
        this.addLog(
          bot,
          'BOT_CHARITY',
          {
            th: `${bot.name} (Robot) บริจาค ${donation.toLocaleString()} ฿ เพื่อสิทธิ์ทอย 2 ลูกใน 3 ตาถัดไป`,
            en: `${bot.name} (Robot) donated ${donation.toLocaleString()} ฿ for 2 dice on next 3 turns.`,
          },
          delta
        );
      } else {
        this.addLog(
          bot,
          'BOT_CHARITY_PASS',
          { th: `${bot.name} (Robot) เลือกไม่บริจาค`, en: `${bot.name} (Robot) passed on Charity.` },
          null
        );
      }
    } else if (spaceType === 'baby') {
      if (bot.finance.childrenCount < 3) {
        const before = FinancialEngine.snapshot(bot.finance);
        bot.finance.childrenCount += 1;
        FinancialEngine.recalculate(bot.finance, bot.career);
        const delta = FinancialEngine.buildDelta(before, bot.finance, {
          th: `${bot.name} มีลูกเพิ่ม 1 คน`,
          en: `${bot.name} had a baby`,
        });
        this.addLog(
          bot,
          'BOT_BABY',
          {
            th: `👶 ${bot.name} (Robot) มีลูกคนที่ ${bot.finance.childrenCount} รายจ่ายเพิ่ม ${bot.finance.expenses.perChildExpense.toLocaleString()} ฿/ด.`,
            en: `👶 ${bot.name} (Robot) had child #${bot.finance.childrenCount} (+${bot.finance.expenses.perChildExpense.toLocaleString()} ฿/mo).`,
          },
          delta
        );
      }
    } else if (spaceType === 'downsized') {
      const result = FinancialEngine.payDownsizedExpense(bot);
      if (result.bankrupt) {
        this.declareBankruptcy(
          bot,
          {
            th: `ตกช่อง "ตกงาน" ต้องจ่ายรายจ่ายรวม ${result.penalty.toLocaleString()} ฿ แต่เงินสดมี ${result.cashBefore.toLocaleString()} ฿ และวงเงินกู้คงเหลือ ${result.maxLoanLimit.toLocaleString()} ฿ ไม่พอจ่าย`,
            en: `Landed on Downsized (${result.penalty.toLocaleString()} ฿ due) with ${result.cashBefore.toLocaleString()} ฿ cash and ${result.maxLoanLimit.toLocaleString()} ฿ loan limit`,
          },
          result.delta
        );
      } else {
        bot.downsizedTurnsLeft = 2;
        const loanNoteTh =
          result.loanAmt > 0
            ? ` (กู้ธนาคารเพิ่ม ${result.loanAmt.toLocaleString()} ฿ ดอกเบี้ย +${result.loanInterest.toLocaleString()} ฿/เดือน)`
            : '';
        const loanNoteEn =
          result.loanAmt > 0
            ? ` (borrowed ${result.loanAmt.toLocaleString()} ฿, +${result.loanInterest.toLocaleString()} ฿/mo interest)`
            : '';
        this.addLog(
          bot,
          'BOT_DOWNSIZED',
          {
            th: `⚠️ ${bot.name} (Robot) ตกงาน จ่าย ${result.penalty.toLocaleString()} ฿${loanNoteTh} และหยุดเดิน 2 ตา`,
            en: `⚠️ ${bot.name} (Robot) Downsized! Paid ${result.penalty.toLocaleString()} ฿${loanNoteEn} and loses 2 turns.`,
          },
          result.delta
        );
      }
    } else {
      this.addLog(
        bot,
        'BOT_PAYDAY_ONLY',
        {
          th: `${bot.name} (Robot) จบการตรวจสอบช่องรับเงินเดือน — กด "ถัดไป" เพื่อส่งต่อเทิร์น`,
          en: `${bot.name} (Robot) completed Payday space — click Next Step.`,
        },
        null
      );
    }
  }

  private executeBotFastTrackEffect(bot: Player, space: typeof FAST_TRACK_SPACES[number]): void {
    if (space.type === 'dream' && space.dreamId === bot.dreamId && bot.finance.cash >= (space.cost || 0)) {
      const before = FinancialEngine.snapshot(bot.finance);
      const cost = space.cost || 0;
      bot.finance.cash -= cost;
      bot.finance.fastTrackPinkPurchases.push({
        id: `pink_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: space.label,
        cost,
        isDreamGoal: true,
      });
      const delta = FinancialEngine.buildDelta(before, bot.finance, {
        th: `${bot.name} ซื้อความฝันชนะเกม!`,
        en: `${bot.name} bought Dream and won!`,
      });
      this.state.winnerId = bot.id;
      this.state.winReason = {
        th: `${bot.name} (Robot) ซื้อความฝัน "${space.label.th}" สำเร็จและชนะเกม!`,
        en: `${bot.name} (Robot) bought Dream "${space.label.en}" and won!`,
      };
      this.state.phase = 'GAME_OVER';
      this.addLog(bot, 'WIN_DREAM', this.state.winReason, delta);
      return;
    }

    if (space.type === 'charity' && !bot.hasThreeDiceForever && bot.finance.cash >= (space.cost || 0) + 1500000) {
      const cost = space.cost || 1000000;
      const before = FinancialEngine.snapshot(bot.finance);
      bot.finance.cash -= cost;
      bot.hasThreeDiceForever = true;
      const delta = FinancialEngine.buildDelta(before, bot.finance, {
        th: `${bot.name} บริจาคการกุศลวงนอก (-${cost.toLocaleString()} ฿)`,
        en: `${bot.name} donated Fast Track Charity (-${cost.toLocaleString()} ฿)`,
      });
      this.addLog(
        bot,
        'BOT_FT_CHARITY',
        {
          th: `❤️ ${bot.name} (Robot) บริจาค ${cost.toLocaleString()} ฿ รับสิทธิ์ทอย 3 ลูกตลอดไป`,
          en: `❤️ ${bot.name} (Robot) donated ${cost.toLocaleString()} ฿ for 3 dice forever.`,
        },
        delta
      );
      return;
    }

    if (space.type === 'business' && bot.finance.cash >= (space.cost || 0)) {
      const before = FinancialEngine.snapshot(bot.finance);
      bot.finance.cash -= space.cost || 0;
      const cf = space.cashFlow || 0;
      bot.finance.fastTrackAddedCashFlow += cf;
      bot.finance.fastTrackAssets.push({
        id: `ft_${Date.now()}`,
        name: space.label,
        cost: space.cost || 0,
        cashFlow: cf,
      });
      const delta = FinancialEngine.buildDelta(before, bot.finance, {
        th: `${bot.name} ซื้อธุรกิจวงนอก (+${cf.toLocaleString()} ฿/ด.)`,
        en: `${bot.name} bought Fast Track Business (+${cf.toLocaleString()} ฿/mo)`,
      });
      if (bot.finance.fastTrackAddedCashFlow >= FAST_TRACK_WIN_CASHFLOW_TARGET) {
        this.state.winnerId = bot.id;
        this.state.winReason = {
          th: `${bot.name} (Robot) ทำกำไรวงนอกครบ ${FAST_TRACK_WIN_CASHFLOW_TARGET.toLocaleString()} ฿/เดือน ชนะเกม!`,
          en: `${bot.name} (Robot) reached ${FAST_TRACK_WIN_CASHFLOW_TARGET.toLocaleString()} ฿/mo added cashflow and won!`,
        };
        this.state.phase = 'GAME_OVER';
        this.addLog(bot, 'WIN_CASHFLOW', this.state.winReason, delta);
      } else {
        this.addLog(
          bot,
          'BOT_FT_BUY',
          {
            th: `${bot.name} (Robot) ซื้อธุรกิจ "${space.label.th}" (+${cf.toLocaleString()} ฿/ด.)`,
            en: `${bot.name} (Robot) bought "${space.label.en}" (+${cf.toLocaleString()} ฿/mo).`,
          },
          delta
        );
      }
      return;
    }

    if (space.type === 'business_roll' && bot.finance.cash >= (space.cost || 0) + 500000) {
      const before = FinancialEngine.snapshot(bot.finance);
      bot.finance.cash -= space.cost || 0;
      const roll = this.rollDieValue();
      this.state.lastDiceRoll = [roll];
      this.state.diceRollSeq += 1;
      const won = roll >= (space.rollThreshold || 4);
      const cf = won ? space.rollWinCashFlow || 0 : 0;
      if (won && cf > 0) {
        bot.finance.fastTrackAddedCashFlow += cf;
        bot.finance.fastTrackAssets.push({
          id: `ft_${Date.now()}`,
          name: space.label,
          cost: space.cost || 0,
          cashFlow: cf,
        });
      }
      const delta = FinancialEngine.buildDelta(before, bot.finance, {
        th: `${bot.name} ลงทุน "${space.label.th}" ทอยได้ ${roll}`,
        en: `${bot.name} invested "${space.label.en}", rolled ${roll}`,
      });
      if (bot.finance.fastTrackAddedCashFlow >= FAST_TRACK_WIN_CASHFLOW_TARGET) {
        this.state.winnerId = bot.id;
        this.state.winReason = {
          th: `${bot.name} (Robot) ทอยได้ ${roll} ทำกำไรวงนอกครบ ${FAST_TRACK_WIN_CASHFLOW_TARGET.toLocaleString()} ฿/เดือน ชนะเกม!`,
          en: `${bot.name} (Robot) rolled ${roll} to reach ${FAST_TRACK_WIN_CASHFLOW_TARGET.toLocaleString()} ฿/mo cashflow and won!`,
        };
        this.state.phase = 'GAME_OVER';
        this.addLog(bot, 'WIN_CASHFLOW', this.state.winReason, delta);
      } else {
        this.addLog(
          bot,
          'BOT_FT_BIZ_ROLL',
          {
            th: `${bot.name} (Robot) ลงทุน "${space.label.th}" ทอยได้ ${roll} (${won ? `+${cf.toLocaleString()} ฿/ด.` : 'ไม่สำเร็จ'})`,
            en: `${bot.name} (Robot) invested in "${space.label.en}" and rolled ${roll} (${won ? `+${cf.toLocaleString()} ฿/mo` : 'missed'}).`,
          },
          delta
        );
      }
      return;
    }

    if (space.type === 'ipo_roll' && bot.finance.cash >= (space.cost || 0) + 500000) {
      const before = FinancialEngine.snapshot(bot.finance);
      bot.finance.cash -= space.cost || 0;
      const roll = this.rollDieValue();
      this.state.lastDiceRoll = [roll];
      this.state.diceRollSeq += 1;
      const won = roll >= (space.rollThreshold || 5);
      const payout = won ? space.rollWinTotalPayout || 0 : 0;
      if (payout > 0) bot.finance.cash += payout;
      const delta = FinancialEngine.buildDelta(before, bot.finance, {
        th: `${bot.name} ซื้อหุ้น IPO ทอยได้ ${roll}`,
        en: `${bot.name} IPO rolled ${roll}`,
      });
      this.addLog(
        bot,
        'BOT_FT_IPO',
        {
          th: `${bot.name} (Robot) ซื้อหุ้นเข้าตลาดฯ ทอยได้ ${roll} (${won ? `รับ +${payout.toLocaleString()} ฿` : 'ไม่ได้กำไร'})`,
          en: `${bot.name} (Robot) bought IPO stock and rolled ${roll} (${won ? `+${payout.toLocaleString()} ฿` : 'no payout'}).`,
        },
        delta
      );
      return;
    }

    if (space.type === 'divorce') {
      const before = FinancialEngine.snapshot(bot.finance);
      const lost = Math.max(0, bot.finance.cash);
      bot.finance.cash = 0;
      const delta = FinancialEngine.buildDelta(before, bot.finance, {
        th: `${space.label.th} (-${lost.toLocaleString()} ฿)`,
        en: `${space.label.en} (-${lost.toLocaleString()} ฿)`,
      });
      this.addLog(
        bot,
        'BOT_FT_PENALTY',
        {
          th: `${bot.name} (Robot) ตกช่อง "${space.label.th}" เสียเงินสดทั้งหมด (${lost.toLocaleString()} ฿)`,
          en: `${bot.name} (Robot) hit "${space.label.en}" and lost all cash (${lost.toLocaleString()} ฿).`,
        },
        delta
      );
      return;
    }

    if (space.type === 'tax_audit' || space.type === 'lawsuit') {
      const before = FinancialEngine.snapshot(bot.finance);
      const lost = Math.max(0, Math.round(bot.finance.cash * 0.5));
      bot.finance.cash -= lost;
      const delta = FinancialEngine.buildDelta(before, bot.finance, {
        th: `${space.label.th} (-${lost.toLocaleString()} ฿)`,
        en: `${space.label.en} (-${lost.toLocaleString()} ฿)`,
      });
      this.addLog(
        bot,
        'BOT_FT_PENALTY',
        {
          th: `${bot.name} (Robot) ตกช่อง "${space.label.th}" จ่าย 50% (${lost.toLocaleString()} ฿)`,
          en: `${bot.name} (Robot) hit "${space.label.en}" and paid 50% (${lost.toLocaleString()} ฿).`,
        },
        delta
      );
      return;
    }

    this.addLog(
      bot,
      'BOT_FT_STEP',
      {
        th: `${bot.name} (Robot) จบเทิร์นบนช่อง "${space.label.th}"`,
        en: `${bot.name} (Robot) finished turn on "${space.label.en}".`,
      },
      null
    );
  }

  private executeBotDealDecision(bot: Player, card: DealCard): void {
    if (card.kind === 'stock_split') {
      this.presentDealCard(bot, card);
      this.state.phase = 'BOT_THINKING';
      this.state.botStepStage = 3;
      return;
    }

    if (card.kind === 'deal_expense') {
      const applies = this.doesDealExpenseApply(card, bot);
      if (applies) {
        const cost = card.cost;
        const res = FinancialEngine.payExpenseOrBankrupt(
          bot,
          cost,
          {
            th: `${bot.name} จ่ายค่า "${card.title.th}" (-${cost.toLocaleString()} ฿)`,
            en: `${bot.name} paid "${card.title.en}" (-${cost.toLocaleString()} ฿)`,
          },
          {
            th: `ล้มละลายจาก "${card.title.th}" (${cost.toLocaleString()} ฿)`,
            en: `Bankrupt from "${card.title.en}" (${cost.toLocaleString()} ฿)`,
          }
        );
        if (res.bankrupt) {
          this.declareBankruptcy(
            bot,
            {
              th: `ต้องจ่ายค่า "${card.title.th}" (${cost.toLocaleString()} ฿) แต่เงินสดมี ${res.cashBefore.toLocaleString()} ฿ และวงเงินกู้คงเหลือ ${res.maxLoanLimit.toLocaleString()} ฿ ไม่พอจ่าย`,
              en: `Owed ${cost.toLocaleString()} ฿ for "${card.title.en}" with ${res.cashBefore.toLocaleString()} ฿ cash and ${res.maxLoanLimit.toLocaleString()} ฿ loan limit`,
            },
            res.delta
          );
          this.state.phase = 'BOT_THINKING';
          this.state.botStepStage = 3;
          return;
        }
        this.addLog(
          bot,
          'BOT_DEAL_EXPENSE',
          {
            th: `${bot.name} (Robot) จ่ายเงิน ${cost.toLocaleString()} ฿ สำหรับ "${card.title.th}"`,
            en: `${bot.name} (Robot) paid ${cost.toLocaleString()} ฿ for "${card.title.en}".`,
          },
          res.delta
        );
      } else {
        this.addLog(
          bot,
          'BOT_DEAL_EXPENSE_SKIP',
          {
            th: `${bot.name} (Robot) ไม่มีทรัพย์สินที่เข้าเงื่อนไข "${card.title.th}" จึงไม่ต้องจ่าย (0 ฿)`,
            en: `${bot.name} (Robot) owns no matching property for "${card.title.en}" (0 ฿).`,
          },
          null
        );
      }
      this.state.phase = 'BOT_THINKING';
      this.state.botStepStage = 3;
      return;
    }

    if (card.kind === 'stock') {
      const symEn = formatStockSymbol(card.symbol, 'en');
      const price = card.pricePerShare || card.cost;
      const holding = bot.finance.assets.find((a) => a.category === 'stock' && a.symbol === card.symbol);

      if (holding && price >= 250) {
        // Sell all shares at high price
        const before = FinancialEngine.snapshot(bot.finance);
        const qty = holding.shares || 0;
        const proceeds = qty * price;
        bot.finance.cash += proceeds;
        bot.finance.assets = bot.finance.assets.filter((a) => a.id !== holding.id);
        FinancialEngine.recalculate(bot.finance, bot.career);
        const delta = FinancialEngine.buildDelta(before, bot.finance, {
          th: `${bot.name} ขายหุ้น ${card.symbol} (+${proceeds.toLocaleString()} ฿)`,
          en: `${bot.name} sold ${symEn} (+${proceeds.toLocaleString()} ฿)`,
        });
        this.addLog(
          bot,
          'BOT_SELL_STOCK',
          {
            th: `${bot.name} (Robot) ขายหุ้น ${card.symbol} จำนวน ${qty} หุ้น รับเงิน +${proceeds.toLocaleString()} ฿`,
            en: `${bot.name} (Robot) sold ${qty} shares of ${symEn} for +${proceeds.toLocaleString()} ฿.`,
          },
          delta
        );
      } else if (price <= 100 && bot.finance.cash >= price * 50) {
        const qty = Math.min(200, Math.floor((bot.finance.cash * 0.4) / price));
        const totalCost = qty * price;
        const before = FinancialEngine.snapshot(bot.finance);
        bot.finance.cash -= totalCost;
        if (holding) {
          holding.shares = (holding.shares || 0) + qty;
          holding.cost += totalCost;
          holding.downPayment += totalCost;
        } else {
          bot.finance.assets.push({
            id: `asset_${Date.now()}`,
            name: {
              th: card.symbol === 'กองทุนรวม' ? 'กองทุนรวม' : `หุ้น ${card.symbol}`,
              en: symEn,
            },
            category: 'stock',
            tag: card.symbol || card.tag,
            symbol: card.symbol,
            shares: qty,
            pricePerShare: price,
            cost: totalCost,
            downPayment: totalCost,
            mortgage: 0,
            cashFlow: (card.dividendPerMonth || 0) * qty,
          });
        }
        FinancialEngine.recalculate(bot.finance, bot.career);
        const delta = FinancialEngine.buildDelta(before, bot.finance, {
          th: `${bot.name} ซื้อหุ้น ${card.symbol} ${qty} หุ้น (-${totalCost.toLocaleString()} ฿)`,
          en: `${bot.name} bought ${qty} shares of ${symEn}`,
        });
        this.addLog(
          bot,
          'BOT_BUY_STOCK',
          {
            th: `${bot.name} (Robot) ซื้อหุ้น ${card.symbol} จำนวน ${qty} หุ้น ราคา ${price.toLocaleString()} ฿/หุ้น`,
            en: `${bot.name} (Robot) bought ${qty} shares of ${symEn} at ${price.toLocaleString()} ฿/share.`,
          },
          delta
        );
      } else {
        this.addLog(
          bot,
          'BOT_PASS_STOCK',
          {
            th: `${bot.name} (Robot) ไม่ซื้อขายหุ้น ${card.symbol}`,
            en: `${bot.name} (Robot) passed on ${symEn}.`,
          },
          null
        );
      }

      this.afterActiveStockDecision(bot, card);
      return;
    }

    // Real Estate / Business / Gold / Land
    // Check if bot can buy directly (or with a smart small loan if ROI > 25%)
    const canAfford = bot.finance.cash >= card.downPayment;
    const annualROI = card.downPayment > 0 ? ((card.cashFlow * 12) / card.downPayment) * 100 : 100;

    if (
      canAfford &&
      (card.cashFlow > 0 ||
        card.kind === 'gold' ||
        card.kind === 'land' ||
        card.tag === 'semiconductor' ||
        card.tag === 'software')
    ) {
      const before = FinancialEngine.snapshot(bot.finance);
      bot.finance.cash -= card.downPayment;
      const category =
        card.kind === 'cd'
          ? 'cd'
          : card.kind === 'gold'
          ? 'gold'
          : card.kind === 'land'
          ? 'land'
          : card.kind === 'business'
          ? 'business'
          : 'real_estate';
      FinancialEngine.addAsset(bot, {
        id: `asset_${Date.now()}`,
        name: card.title,
        category,
        tag: card.tag,
        cost: card.cost,
        downPayment: card.downPayment,
        mortgage: card.mortgage,
        cashFlow: card.cashFlow,
        units: card.units,
      });
      const delta = FinancialEngine.buildDelta(before, bot.finance, {
        th: `${bot.name} ซื้อ "${card.title.th}"`,
        en: `${bot.name} bought "${card.title.en}"`,
      });
      this.addLog(
        bot,
        'BOT_BUY_ASSET',
        {
          th: `${bot.name} (Robot) ตัดสินใจซื้อ "${card.title.th}" (ผลตอบแทน ${Math.round(annualROI)}%/ปี) รับรายได้จากทรัพย์สิน ${card.cashFlow >= 0 ? '+' : ''}${card.cashFlow.toLocaleString()} ฿/เดือน`,
          en: `${bot.name} (Robot) bought "${card.title.en}" (${Math.round(annualROI)}% annual ROI, ${card.cashFlow >= 0 ? '+' : ''}${card.cashFlow.toLocaleString()} ฿/mo).`,
        },
        delta
      );
      this.checkEscapedRatRace(bot);
      this.state.botStepStage = 3;
      return;
    }

    // If bot cannot afford a good cashflowing deal and card allows selling right, put up for auction!
    const hasHumans = this.state.players.some((p) => !p.isBot && p.id !== bot.id && p.track === bot.track);
    if (!canAfford && card.cashFlow > 0 && card.canSellRight !== false && hasHumans) {
      this.state.phase = 'DEAL_DECISION';
      this.startAuction(bot.id, 1000);
      return;
    }

    this.addLog(
      bot,
      'BOT_PASS_DEAL',
      {
        th: `${bot.name} (Robot) เงินสดไม่พอจึงสละสิทธิ์ "${card.title.th}"`,
        en: `${bot.name} (Robot) lacked cash and passed on "${card.title.en}".`,
      },
      null
    );
    this.state.botStepStage = 3;
  }

  private advanceToNextPlayer(): void {
    this.state.activeCard = null;
    this.state.activeFastTrackSpace = null;
    this.state.auction = null;
    this.state.pendingMarketResponses = [];
    this.state.pendingStockSells = [];
    this.state.lastStepDelta = null;

    const activePlayers = this.state.players.filter((p) => !p.isBankrupt);
    if (activePlayers.length === 0) {
      this.state.phase = 'GAME_OVER';
      this.state.winnerId = null;
      this.state.winReason = {
        th: 'ผู้เล่นทุกคนล้มละลายหมดแล้ว จบการแข่งขัน',
        en: 'All players went bankrupt. Game Over!',
      };
      this.emitChange();
      return;
    }

    const total = this.state.players.length;
    const prevIndex = this.state.currentTurnIndex;
    let nextIndex = prevIndex;
    for (let offset = 1; offset <= total; offset++) {
      const candidate = (prevIndex + offset) % total;
      if (!this.state.players[candidate].isBankrupt) {
        nextIndex = candidate;
        break;
      }
    }

    if (nextIndex <= prevIndex) {
      this.state.turnCount += 1;
    }
    this.state.currentTurnIndex = nextIndex;

    const next = this.currentPlayer;
    if (next.isBot) {
      this.state.phase = 'BOT_THINKING';
      this.state.botStepStage = 0;
      this.addLog(
        next,
        'TURN_START_BOT',
        {
          th: `ถึงตาของ ${next.name} (Robot) — กดปุ่ม "ถัดไป" เพื่อให้ Robot ทอยลูกเต๋า`,
          en: `${next.name} (Robot)'s turn — Click "Next Step" to roll dice.`,
        },
        null
      );
    } else {
      this.state.phase = 'ROLL_DICE';
      this.state.botStepStage = 0;
      this.addLog(
        next,
        'TURN_START_HUMAN',
        {
          th: `ถึงตาของคุณ ${next.name}! กด "ทอยลูกเต๋า" เพื่อเดินเกม (หรือจัดการกู้/ปิดหนี้ได้ก่อนทอย)`,
          en: `It's ${next.name}'s turn! Click "Roll Dice" to move (or manage loans/debts first).`,
        },
        null
      );
    }
    this.emitChange();
  }
}
