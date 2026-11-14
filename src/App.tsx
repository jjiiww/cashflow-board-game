import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Trophy } from 'lucide-react';
import { BilingualText, GameRoomState, Language } from '../shared/types';
import { AdminDashboard } from './components/AdminDashboard';
import { CashflowBoard } from './components/CashflowBoard';
import { FinancialStatement } from './components/FinancialStatement';
import { GameHeader } from './components/GameHeader';
import { LobbyView } from './components/LobbyView';
import { StepActionPanel } from './components/StepActionPanel';
import { t } from './i18n';
import { soundFX } from './utils/sound';

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

  const socketRef = useRef<Socket | null>(null);
  const prevLogIdRef = useRef<string | null>(null);
  const prevRoomRef = useRef<GameRoomState | null>(null);
  const latestRoomRef = useRef<GameRoomState | null>(null);

  const playStateSound = useCallback((state: GameRoomState) => {
    const topLog = state.logs[0];
    if (topLog && topLog.id !== prevLogIdRef.current) {
      prevLogIdRef.current = topLog.id;
      if (topLog.type.includes('WIN')) soundFX.victory();
      else if (topLog.type.includes('DEAL') || topLog.type.includes('MARKET')) soundFX.card();
      else if (topLog.type.includes('DOODAD') || topLog.type.includes('DOWNSIZED') || topLog.type.includes('PENALTY'))
        soundFX.expense();
      else if (topLog.delta && topLog.delta.cashDelta > 0) soundFX.payday();
    }
  }, []);

  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('room:joined', ({ state }: { state: GameRoomState }) => {
      setErrorMsg(null);
      prevRoomRef.current = state;
      latestRoomRef.current = state;
      setRoomState(state);
      setSettledState(state);
      setIsBoardAnimating(false);
      setLanguage(state.language);
    });

    socket.on('room:state', (state: GameRoomState) => {
      const prev = prevRoomRef.current;
      prevRoomRef.current = state;
      latestRoomRef.current = state;
      setRoomState(state);

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
        playStateSound(state);
      }
    });

    socket.on('room:error', (err: BilingualText | string) => {
      const msg = typeof err === 'string' ? err : err[language] || err.th;
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4500);
    });

    return () => {
      socket.disconnect();
    };
  }, [playStateSound]);

  const handleAnimationChange = useCallback(
    (animating: boolean) => {
      setIsBoardAnimating(animating);
      if (!animating && latestRoomRef.current) {
        setSettledState(latestRoomRef.current);
        playStateSound(latestRoomRef.current);
      }
    },
    [playStateSound]
  );

  const handleToggleLanguage = (lang: Language) => {
    setLanguage(lang);
    if (roomState && socketRef.current) {
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
    setErrorMsg(null);
    socketRef.current?.disconnect();
    socketRef.current?.connect();
  };

  const uiState = settledState || roomState;
  const currentPlayer = uiState?.players[uiState.currentTurnIndex];
  const isAdminSpectator = Boolean(roomState?.isAdminSpectator && roomState?.hostId === playerId);

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
        onLeaveRoom={roomState ? handleLeaveRoom : undefined}
      />

      {!roomState || roomState.phase === 'LOBBY' ? (
        <LobbyView
          language={language}
          roomState={roomState}
          playerId={playerId}
          errorMsg={errorMsg}
          onCreateRoom={(playerName, botCount, adminPlays, adminPassword) =>
            socketRef.current?.emit('room:create', {
              playerId,
              playerName,
              language,
              botCount,
              adminPlays,
              adminPassword,
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
        <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_320px] xl:grid-cols-[320px_minmax(0,1fr)_340px] overflow-y-auto lg:overflow-hidden">
          {/* Left: Financial Statement Dashboard */}
          <div className="min-h-[420px] lg:min-h-0 lg:h-full overflow-hidden">
            <FinancialStatement
              players={(uiState || roomState).players}
              localPlayerId={playerId}
              activeTurnPlayerId={currentPlayer?.id || ''}
              language={language}
              onTakeLoan={(amount) => emit('game:take_loan', { amount })}
              onRepayLoan={(amount) => emit('game:repay_loan', { amount })}
              onPayOffLiability={(key) => emit('game:payoff_liability', { key })}
              onCustomizePlayer={(targetId, avatarId, color) =>
                emit('player:customize', { requesterId: playerId, targetId, avatarId, color })
              }
            />
          </div>

          {/* Center: Cashflow Board (receives live roomState to animate dice & walking steps) */}
          <div className="flex items-center justify-center p-2 lg:p-3 min-h-[460px] lg:min-h-0 lg:h-full overflow-hidden">
            <CashflowBoard
              roomState={roomState}
              language={language}
              localPlayerId={playerId}
              onSelectDealDeck={(deckType) => emit('game:choose_deal_type', { deckType })}
              onAnimationChange={handleAnimationChange}
            />
          </div>

          {/* Right: Step-by-Step Guide, Cards, Auctions, & Activity Log */}
          <div className="min-h-[420px] lg:min-h-0 lg:h-full overflow-hidden">
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

      {/* Game Over Victory Modal */}
      {uiState?.phase === 'GAME_OVER' && !isBoardAnimating && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border-2 border-orange-400 rounded-2xl p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-full bg-orange-100 border border-orange-300 flex items-center justify-center text-orange-500">
              <Trophy className="w-8 h-8" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900">
                {t(language, 'gameOverTitle')}
              </h2>
              <p className="text-sm text-slate-700 mt-2 leading-relaxed">
                {uiState.winReason?.[language]}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="w-full py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-colors"
            >
              {t(language, 'playAgain')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
