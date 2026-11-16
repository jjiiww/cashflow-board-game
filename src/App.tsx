import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Trophy } from 'lucide-react';
import { BilingualText, GameLogEntry, GameRoomState, Language, Player } from '../shared/types';
import { AdminDashboard } from './components/AdminDashboard';
import { CashflowBoard } from './components/CashflowBoard';
import {
  BankruptcyAnnouncementModal,
  ConfettiBurst,
  RatRaceEscapeCelebration,
} from './components/CelebrationOverlay';
import { FinancialStatement } from './components/FinancialStatement';
import { GameHeader } from './components/GameHeader';
import { LobbyView } from './components/LobbyView';
import { PlayerAvatar } from './components/PlayerAvatar';
import { ResizeHandle } from './components/ResizeHandle';
import { StepActionPanel } from './components/StepActionPanel';
import { t } from './i18n';
import { soundFX } from './utils/sound';

const DEFAULT_LEFT_WIDTH = 300;
const DEFAULT_RIGHT_WIDTH = 320;
const MIN_LEFT_WIDTH = 220;
const MIN_RIGHT_WIDTH = 240;
const MAX_SIDE_WIDTH = 580;
const MIN_BOARD_WIDTH = 340;

function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
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

function getOrCreatePlayerId(): string {
  const key = 'cashflow_player_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export default function App() {
  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [language, setLanguage] = useState<Language>('th');
  const [muted, setMuted] = useState(false);
  const [roomState, setRoomState] = useState<GameRoomState | null>(null);
  const [settledState, setSettledState] = useState<GameRoomState | null>(null);
  const [isBoardAnimating, setIsBoardAnimating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [victoryModalDismissed, setVictoryModalDismissed] = useState(false);
  const [escapeCelebration, setEscapeCelebration] = useState<{
    log: GameLogEntry;
    player?: Player;
  } | null>(null);
  const [bankruptAnnouncement, setBankruptAnnouncement] = useState<{
    log: GameLogEntry;
    player?: Player;
  } | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  const [leftWidth, setLeftWidth] = useState<number>(() =>
    readStoredNumber('cashflow_player_left_w', DEFAULT_LEFT_WIDTH, MIN_LEFT_WIDTH, MAX_SIDE_WIDTH)
  );
  const [rightWidth, setRightWidth] = useState<number>(() =>
    readStoredNumber('cashflow_player_right_w', DEFAULT_RIGHT_WIDTH, MIN_RIGHT_WIDTH, MAX_SIDE_WIDTH)
  );
  const [mainWidth, setMainWidth] = useState<number>(0);

  const socketRef = useRef<Socket | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const dragStartLeftRef = useRef<number>(DEFAULT_LEFT_WIDTH);
  const dragStartRightRef = useRef<number>(DEFAULT_RIGHT_WIDTH);
  const prevLogIdRef = useRef<string | null>(null);
  const prevRoomRef = useRef<GameRoomState | null>(null);
  const latestRoomRef = useRef<GameRoomState | null>(null);
  const languageRef = useRef<Language>(language);
  const seenEscapeLogIdsRef = useRef<Set<string>>(new Set());
  const seenBankruptLogIdsRef = useRef<Set<string>>(new Set());
  const seenWinRoomRef = useRef<string | null>(null);
  const escapeTimerRef = useRef<number | null>(null);
  const bankruptTimerRef = useRef<number | null>(null);

  languageRef.current = language;

  const triggerEscapeCelebration = useCallback((state: GameRoomState) => {
    const newEscapeLog = state.logs
      .slice(0, 6)
      .find((entry) => entry.type === 'FAST_TRACK_ESCAPE' && !seenEscapeLogIdsRef.current.has(entry.id));

    if (newEscapeLog) {
      seenEscapeLogIdsRef.current.add(newEscapeLog.id);
      const escapedPlayer = state.players.find((p) => p.id === newEscapeLog.actorId);
      setEscapeCelebration({ log: newEscapeLog, player: escapedPlayer });
      soundFX.escapeFanfare();

      if (escapeTimerRef.current) {
        window.clearTimeout(escapeTimerRef.current);
      }
      escapeTimerRef.current = window.setTimeout(() => {
        setEscapeCelebration(null);
      }, 7500);
    }
  }, []);

  const triggerBankruptcyAnnouncement = useCallback((state: GameRoomState) => {
    const newBankruptLog = state.logs
      .slice(0, 8)
      .find((entry) => entry.type === 'PLAYER_BANKRUPT' && !seenBankruptLogIdsRef.current.has(entry.id));

    if (newBankruptLog) {
      seenBankruptLogIdsRef.current.add(newBankruptLog.id);
      const bankruptPlayer = state.players.find((p) => p.id === newBankruptLog.actorId);
      setBankruptAnnouncement({ log: newBankruptLog, player: bankruptPlayer });
      soundFX.bankrupt();

      if (bankruptTimerRef.current) {
        window.clearTimeout(bankruptTimerRef.current);
      }
      bankruptTimerRef.current = window.setTimeout(() => {
        setBankruptAnnouncement(null);
      }, 10000);
    }
  }, []);

  const playStateSound = useCallback((state: GameRoomState) => {
    if (state.phase === 'GAME_OVER') {
      const winKey = `${state.roomCode}_${state.winnerId || 'win'}_${state.turnCount}`;
      if (seenWinRoomRef.current !== winKey) {
        seenWinRoomRef.current = winKey;
        soundFX.victory();
      }
    }

    const topLog = state.logs[0];
    if (topLog && topLog.id !== prevLogIdRef.current) {
      prevLogIdRef.current = topLog.id;
      if (topLog.type.includes('WIN')) {
        const winKey = `${state.roomCode}_${state.winnerId || 'win'}_${state.turnCount}`;
        if (seenWinRoomRef.current !== winKey) {
          seenWinRoomRef.current = winKey;
          soundFX.victory();
        }
      } else if (topLog.type === 'FAST_TRACK_ESCAPE') {
        // Sound already triggered by triggerEscapeCelebration
      } else if (topLog.type === 'PLAYER_BANKRUPT') {
        // Sound already triggered by triggerBankruptcyAnnouncement
      } else if (topLog.type.includes('DEAL') || topLog.type.includes('MARKET')) {
        soundFX.card();
      } else if (
        topLog.type.includes('DOODAD') ||
        topLog.type.includes('DOWNSIZED') ||
        topLog.type.includes('PENALTY')
      ) {
        soundFX.expense();
      } else if (topLog.delta && topLog.delta.cashDelta > 0) {
        soundFX.payday();
      }
    }
  }, []);

  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      const activeRoom = latestRoomRef.current;
      if (activeRoom?.roomCode) {
        socket.emit('room:join', {
          roomCode: activeRoom.roomCode,
          playerId,
          playerName: '',
        });
      }
    });

    socket.on('room:joined', ({ state }: { state: GameRoomState }) => {
      const isSameRoom = latestRoomRef.current?.roomCode === state.roomCode;
      setErrorMsg(null);
      prevRoomRef.current = state;
      latestRoomRef.current = state;
      setRoomState(state);
      setSettledState(state);
      setIsBoardAnimating(false);

      if (!isSameRoom) {
        seenEscapeLogIdsRef.current = new Set(
          state.logs.filter((l) => l.type === 'FAST_TRACK_ESCAPE').map((l) => l.id)
        );
        seenBankruptLogIdsRef.current = new Set(
          state.logs.filter((l) => l.type === 'PLAYER_BANKRUPT').map((l) => l.id)
        );
        seenWinRoomRef.current = null;
        setVictoryModalDismissed(false);
        setEscapeCelebration(null);
        setBankruptAnnouncement(null);
        setLanguage(state.language);
      }
    });

    socket.on('room:state', (state: GameRoomState) => {
      const prev = prevRoomRef.current;
      prevRoomRef.current = state;
      latestRoomRef.current = state;
      setRoomState(state);
      if (state.phase !== 'GAME_OVER') {
        setVictoryModalDismissed(false);
        seenWinRoomRef.current = null;
      }

      const hasMovement =
        Boolean(prev) &&
        state.phase !== 'LOBBY' &&
        state.players.some((p) => {
          const old = prev!.players.find((op) => op.id === p.id);
          return Boolean(old && old.track === p.track && old.position !== p.position);
        });
      const hasDiceSeqChange = Boolean(prev) && state.phase !== 'LOBBY' && state.diceRollSeq !== prev!.diceRollSeq;

      if (hasMovement || hasDiceSeqChange) {
        // Defer narration text, card reveal, financial deltas, and landing sound until dice + walk finish
        setIsBoardAnimating(true);
      } else {
        setIsBoardAnimating(false);
        setSettledState(state);
        triggerEscapeCelebration(state);
        triggerBankruptcyAnnouncement(state);
        playStateSound(state);
      }
    });

    socket.on('room:closed', () => {
      prevRoomRef.current = null;
      latestRoomRef.current = null;
      setRoomState(null);
      setSettledState(null);
      setIsBoardAnimating(false);
      setVictoryModalDismissed(false);
      setEscapeCelebration(null);
      setBankruptAnnouncement(null);
      seenWinRoomRef.current = null;
      setErrorMsg(null);
    });

    socket.on('room:error', (err: BilingualText | string) => {
      const lang = languageRef.current;
      const msg = typeof err === 'string' ? err : err[lang] || err.th;
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4500);
    });

    // Keepalive heartbeat so proxies & background tabs never time out while waiting 3-5+ mins
    const keepaliveId = window.setInterval(() => {
      const code = latestRoomRef.current?.roomCode;
      if (!code) return;
      if (socket.disconnected) {
        socket.connect();
      } else {
        socket.emit('room:ping', { roomCode: code, playerId });
      }
    }, 25000);

    const handleResumeSync = () => {
      if (document.visibilityState === 'hidden') return;
      const code = latestRoomRef.current?.roomCode;
      if (!code) return;
      if (socket.disconnected) {
        socket.connect();
      } else {
        socket.emit('room:sync', { roomCode: code, playerId });
      }
    };

    document.addEventListener('visibilitychange', handleResumeSync);
    window.addEventListener('focus', handleResumeSync);

    return () => {
      window.clearInterval(keepaliveId);
      if (escapeTimerRef.current) {
        window.clearTimeout(escapeTimerRef.current);
      }
      if (bankruptTimerRef.current) {
        window.clearTimeout(bankruptTimerRef.current);
      }
      document.removeEventListener('visibilitychange', handleResumeSync);
      window.removeEventListener('focus', handleResumeSync);
      socket.disconnect();
    };
  }, [playerId, playStateSound, triggerBankruptcyAnnouncement, triggerEscapeCelebration]);

  const handleAnimationChange = useCallback(
    (animating: boolean) => {
      setIsBoardAnimating(animating);
      if (!animating && latestRoomRef.current) {
        setSettledState(latestRoomRef.current);
        triggerEscapeCelebration(latestRoomRef.current);
        triggerBankruptcyAnnouncement(latestRoomRef.current);
        playStateSound(latestRoomRef.current);
      }
    },
    [playStateSound, triggerBankruptcyAnnouncement, triggerEscapeCelebration]
  );

  const handleToggleLanguage = (lang: Language) => {
    setLanguage(lang);
    if (roomState && socketRef.current) {
      if (socketRef.current.disconnected) socketRef.current.connect();
      socketRef.current.emit('room:language', { roomCode: roomState.roomCode, language: lang });
    }
  };

  const handleToggleMute = () => {
    const next = !muted;
    soundFX.muted = next;
    setMuted(next);
  };

  const emit = (event: string, payload: Record<string, unknown> = {}) => {
    if (!socketRef.current) return;
    if (socketRef.current.disconnected) {
      socketRef.current.connect();
    }
    setErrorMsg(null);
    socketRef.current.emit(event, {
      roomCode: roomState?.roomCode,
      playerId,
      ...payload,
    });
  };

  const handleLeaveRoom = () => {
    prevRoomRef.current = null;
    latestRoomRef.current = null;
    setRoomState(null);
    setSettledState(null);
    setIsBoardAnimating(false);
    setVictoryModalDismissed(false);
    setEscapeCelebration(null);
    setBankruptAnnouncement(null);
    seenWinRoomRef.current = null;
    setErrorMsg(null);
    socketRef.current?.disconnect();
    socketRef.current?.connect();
  };

  const handleCloseGame = () => {
    if (!roomState || !socketRef.current) return;
    if (socketRef.current.disconnected) socketRef.current.connect();
    socketRef.current.emit('game:close', {
      roomCode: roomState.roomCode,
      playerId,
    });
  };

  const uiState = settledState || roomState;
  const currentPlayer = uiState?.players[uiState.currentTurnIndex];
  const winnerPlayer = uiState?.winnerId
    ? uiState.players.find((p) => p.id === uiState.winnerId)
    : undefined;
  const isHost = Boolean(roomState && roomState.hostId === playerId);
  const isAdminSpectator = Boolean(roomState?.isAdminSpectator && isHost);
  const isGameOver = Boolean(uiState?.phase === 'GAME_OVER' && !isBoardAnimating);
  const isPlayerBoardView = Boolean(roomState && roomState.phase !== 'LOBBY' && !isAdminSpectator);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cashflow_player_left_w', String(leftWidth));
    } catch {
      // ignore storage quota errors
    }
  }, [leftWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('cashflow_player_right_w', String(rightWidth));
    } catch {
      // ignore storage quota errors
    }
  }, [rightWidth]);

  useEffect(() => {
    const el = mainRef.current;
    if (!isPlayerBoardView || !el) return;
    setMainWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMainWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isPlayerBoardView]);

  const maxSideTotal = mainWidth > 0 ? Math.max(460, mainWidth - MIN_BOARD_WIDTH) : 1200;
  const effectiveLeftWidth = Math.min(
    Math.max(MIN_LEFT_WIDTH, leftWidth),
    MAX_SIDE_WIDTH,
    Math.max(MIN_LEFT_WIDTH, maxSideTotal - MIN_RIGHT_WIDTH)
  );
  const effectiveRightWidth = Math.min(
    Math.max(MIN_RIGHT_WIDTH, rightWidth),
    MAX_SIDE_WIDTH,
    Math.max(MIN_RIGHT_WIDTH, maxSideTotal - effectiveLeftWidth)
  );
  const resizeHint =
    language === 'th'
      ? 'ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อรีเซ็ต'
      : 'Drag to resize · Double-click to reset';

  return (
    <div className="h-screen w-screen flex flex-col felt-surface overflow-hidden">
      <GameHeader
        language={language}
        onToggleLanguage={handleToggleLanguage}
        muted={muted}
        onToggleMute={handleToggleMute}
        roomCode={roomState?.roomCode}
        hideRoomCode={Boolean(roomState?.isSoloMode)}
        turnCount={uiState && uiState.phase !== 'LOBBY' ? uiState.turnCount : undefined}
        activePlayerName={uiState && uiState.phase !== 'LOBBY' ? currentPlayer?.name : undefined}
        isAdminObserver={isAdminSpectator}
        onLeaveRoom={roomState && !isGameOver ? handleLeaveRoom : undefined}
        onCloseGame={roomState && isGameOver && isHost ? handleCloseGame : undefined}
      />

      {isGameOver && (
        <div className="bg-amber-50 border-b-2 border-orange-300 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <Trophy className="w-5 h-5 text-orange-500 shrink-0" />
            <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {t(language, 'gameOverTitle')}:{' '}
              <span className="font-semibold text-orange-700">{uiState?.winReason?.[language]}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isHost ? (
              <button
                type="button"
                onClick={handleCloseGame}
                className="px-4 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs transition-colors shadow-xs"
              >
                {t(language, 'closeGame')}
              </button>
            ) : (
              <span className="text-xs font-medium text-slate-600">
                {t(language, 'waitingAdminCloseGame')}
              </span>
            )}
          </div>
        </div>
      )}

      {!roomState || roomState.phase === 'LOBBY' ? (
        <LobbyView
          language={language}
          roomState={roomState}
          playerId={playerId}
          errorMsg={errorMsg}
          onCreateRoom={(playerName, botCount, adminPlays, adminPassword, isSolo) =>
            socketRef.current?.emit('room:create', {
              playerId,
              playerName,
              language,
              botCount,
              adminPlays,
              adminPassword,
              isSolo,
            })
          }
          onJoinRoom={(roomCode, playerName) =>
            socketRef.current?.emit('room:join', {
              roomCode,
              playerId,
              playerName,
            })
          }
          onAddBot={() => emit('room:add_bot')}
          onToggleAdminPlay={() => emit('room:toggle_admin_play')}
          onRemovePlayer={(targetId) =>
            emit('room:remove_player', { requesterId: playerId, targetId })
          }
          onAssignCareer={(targetId, careerId) =>
            socketRef.current?.emit('room:assign_career', {
              roomCode: roomState?.roomCode,
              playerId: targetId,
              careerId,
            })
          }
          onAssignDream={(targetId, dreamId) =>
            socketRef.current?.emit('room:assign_dream', {
              roomCode: roomState?.roomCode,
              playerId: targetId,
              dreamId,
            })
          }
          onCustomizePlayer={(targetId, avatarId, color) =>
            emit('player:customize', { requesterId: playerId, targetId, avatarId, color })
          }
          onStartGame={() => emit('game:start')}
        />
      ) : isAdminSpectator ? (
        <AdminDashboard
          roomState={roomState}
          uiState={uiState || roomState}
          localPlayerId={playerId}
          language={language}
          errorMsg={errorMsg}
          isBoardAnimating={isBoardAnimating}
          onSelectDealDeck={(deckType) => emit('game:choose_deal_type', { deckType })}
          onAnimationChange={handleAnimationChange}
          onRollDice={(diceCount = 1) => emit('game:roll_dice', { diceCount })}
          onNextBotStep={() => emit('game:next_bot_step')}
          onChooseDealType={(deckType) => emit('game:choose_deal_type', { deckType })}
          onBuyDeal={(shareQuantity = 1) => emit('game:buy_deal', { shareQuantity })}
          onSellStock={(shareQuantity) => emit('game:sell_stock', { shareQuantity })}
          onSkipStockSell={() => emit('game:skip_stock_sell')}
          onPassDeal={() => emit('game:pass_deal')}
          onStartAuction={(startingBid) => emit('game:start_auction', { startingBid })}
          onPlaceBid={(amount) => emit('game:place_bid', { amount })}
          onPassAuction={() => emit('game:pass_auction')}
          onCloseAuction={() => emit('game:close_auction')}
          onMarketRespond={(sellAssetIds) => emit('game:market_respond', { sellAssetIds })}
          onPayDoodad={() => emit('game:pay_doodad')}
          onDecideCharity={(donate) => emit('game:decide_charity', { donate })}
          onChooseDream={(dreamId) => emit('game:choose_dream', { dreamId })}
          onDecideFastTrack={(buy) => emit('game:decide_fast_track', { buy })}
          onEndTurn={() => emit('game:end_turn')}
        />
      ) : (
        <main
          ref={mainRef}
          className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden"
        >
          {/* Left: Financial Statement Dashboard */}
          <div
            style={isDesktop ? { width: effectiveLeftWidth } : undefined}
            className="min-h-[420px] lg:min-h-0 lg:h-full lg:shrink-0 overflow-hidden"
          >
            <FinancialStatement
              players={(uiState || roomState).players}
              localPlayerId={playerId}
              activeTurnPlayerId={currentPlayer?.id || ''}
              language={language}
              onTakeLoan={(amount) => emit('game:take_loan', { amount })}
              onRepayLoan={(amount) => emit('game:repay_loan', { amount })}
              onPayOffLiability={(key) => emit('game:payoff_liability', { key })}
            />
          </div>

          <ResizeHandle
            orientation="vertical"
            title={resizeHint}
            className="hidden lg:flex z-20 shrink-0"
            onDragStart={() => {
              dragStartLeftRef.current = effectiveLeftWidth;
            }}
            onDragMove={(deltaPx) => {
              const maxAllowed = Math.min(
                MAX_SIDE_WIDTH,
                Math.max(MIN_LEFT_WIDTH, maxSideTotal - effectiveRightWidth)
              );
              const next = Math.round(
                Math.min(maxAllowed, Math.max(MIN_LEFT_WIDTH, dragStartLeftRef.current + deltaPx))
              );
              setLeftWidth(next);
            }}
            onDoubleClick={() => setLeftWidth(DEFAULT_LEFT_WIDTH)}
          />

          {/* Center: Cashflow Board (receives live roomState to animate dice & walking steps) */}
          <div className="flex-1 min-w-0 flex items-center justify-center p-1 lg:p-1.5 min-h-[460px] lg:min-h-0 lg:h-full overflow-hidden">
            <CashflowBoard
              roomState={roomState}
              language={language}
              localPlayerId={playerId}
              onSelectDealDeck={(deckType) => emit('game:choose_deal_type', { deckType })}
              onAnimationChange={handleAnimationChange}
            />
          </div>

          <ResizeHandle
            orientation="vertical"
            title={resizeHint}
            className="hidden lg:flex z-20 shrink-0"
            onDragStart={() => {
              dragStartRightRef.current = effectiveRightWidth;
            }}
            onDragMove={(deltaPx) => {
              const maxAllowed = Math.min(
                MAX_SIDE_WIDTH,
                Math.max(MIN_RIGHT_WIDTH, maxSideTotal - effectiveLeftWidth)
              );
              const next = Math.round(
                Math.min(maxAllowed, Math.max(MIN_RIGHT_WIDTH, dragStartRightRef.current - deltaPx))
              );
              setRightWidth(next);
            }}
            onDoubleClick={() => setRightWidth(DEFAULT_RIGHT_WIDTH)}
          />

          {/* Right: Step-by-Step Guide, Cards, Auctions, & Activity Log */}
          <div
            style={isDesktop ? { width: effectiveRightWidth } : undefined}
            className="min-h-[420px] lg:min-h-0 lg:h-full lg:shrink-0 overflow-hidden"
          >
            <StepActionPanel
              roomState={uiState || roomState}
              localPlayerId={playerId}
              language={language}
              errorMsg={errorMsg}
              isAnimating={isBoardAnimating}
              onRollDice={(diceCount = 1) => emit('game:roll_dice', { diceCount })}
              onNextBotStep={() => emit('game:next_bot_step')}
              onChooseDealType={(deckType) => emit('game:choose_deal_type', { deckType })}
              onBuyDeal={(shareQuantity = 1) => emit('game:buy_deal', { shareQuantity })}
              onSellStock={(shareQuantity) => emit('game:sell_stock', { shareQuantity })}
              onSkipStockSell={() => emit('game:skip_stock_sell')}
              onPassDeal={() => emit('game:pass_deal')}
              onStartAuction={(startingBid) => emit('game:start_auction', { startingBid })}
              onPlaceBid={(amount) => emit('game:place_bid', { amount })}
              onPassAuction={() => emit('game:pass_auction')}
              onCloseAuction={() => emit('game:close_auction')}
              onMarketRespond={(sellAssetIds) => emit('game:market_respond', { sellAssetIds })}
              onPayDoodad={() => emit('game:pay_doodad')}
              onDecideCharity={(donate) => emit('game:decide_charity', { donate })}
              onChooseDream={(dreamId) => emit('game:choose_dream', { dreamId })}
              onDecideFastTrack={(buy) => emit('game:decide_fast_track', { buy })}
              onEndTurn={() => emit('game:end_turn')}
            />
          </div>
        </main>
      )}

      {/* Escaped Rat Race Celebration Modal & Sound Effect (visible to everyone) */}
      {escapeCelebration && !isGameOver && (
        <RatRaceEscapeCelebration
          log={escapeCelebration.log}
          player={escapeCelebration.player}
          language={language}
          onDismiss={() => setEscapeCelebration(null)}
        />
      )}

      {/* Bankruptcy Announcement Modal & Sound Effect (visible to everyone) */}
      {bankruptAnnouncement && !isGameOver && (
        <BankruptcyAnnouncementModal
          log={bankruptAnnouncement.log}
          player={bankruptAnnouncement.player}
          language={language}
          onDismiss={() => setBankruptAnnouncement(null)}
        />
      )}

      {/* Game Over Victory Modal & Confetti Effect (dismissible so everyone can inspect results; only Admin/Creator can close game) */}
      {isGameOver && !victoryModalDismissed && (
        <>
          <ConfettiBurst variant="victory" />
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="animate-celebrate-pop max-w-md w-full bg-white border-4 border-orange-400 rounded-3xl p-8 text-center space-y-5 shadow-2xl relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-amber-200/40 blur-xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-orange-200/40 blur-xl pointer-events-none" />

              <div className="relative flex items-center justify-center gap-3">
                <div className="w-16 h-16 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center text-orange-500 shadow-sm">
                  <Trophy className="w-8 h-8" />
                </div>
                {winnerPlayer && (
                  <PlayerAvatar
                    avatarId={winnerPlayer.avatarId}
                    color={winnerPlayer.color}
                    isBot={winnerPlayer.isBot}
                    isActiveTurn
                    size="lg"
                  />
                )}
              </div>

              <div>
                <div className="inline-block px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold mb-2">
                  {t(language, 'winnerBadge')}
                  {winnerPlayer ? ` · ${winnerPlayer.name}` : ''}
                </div>
                <h2 className="font-display text-2xl font-extrabold text-slate-900">
                  {t(language, 'gameOverTitle')}
                </h2>
                <p className="text-sm text-slate-700 mt-2 leading-relaxed">
                  {uiState?.winReason?.[language]}
                </p>
              </div>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setVictoryModalDismissed(true)}
                  className="w-full py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-colors"
                >
                  {t(language, 'reviewGameResults')}
                </button>
                {isHost ? (
                  <button
                    type="button"
                    onClick={handleCloseGame}
                    className="w-full py-2.5 px-5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-sm transition-colors"
                  >
                    {t(language, 'closeGame')}
                  </button>
                ) : (
                  <p className="text-xs text-slate-500 font-medium pt-1">
                    {t(language, 'waitingAdminCloseGame')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
