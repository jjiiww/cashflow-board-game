import React, { useMemo } from 'react';
import { AlertTriangle, Ban, Crown, Rocket, Sparkles, Trophy } from 'lucide-react';
import { GameLogEntry, Language, Player } from '../../shared/types';
import { t } from '../i18n';
import { PlayerAvatar } from './PlayerAvatar';

interface ConfettiPiece {
  id: number;
  leftPct: number;
  delaySec: number;
  durationSec: number;
  driftPx: number;
  rotDeg: number;
  width: number;
  height: number;
  color: string;
  isCircle: boolean;
}

const CONFETTI_COLORS_ESCAPE = [
  '#10b981',
  '#facc15',
  '#f97316',
  '#0ea5e9',
  '#ec4899',
  '#8b5cf6',
];

const CONFETTI_COLORS_VICTORY = [
  '#facc15',
  '#f97316',
  '#ec4899',
  '#10b981',
  '#2563eb',
  '#fbbf24',
];

export const ConfettiBurst: React.FC<{ variant?: 'escape' | 'victory' }> = ({
  variant = 'escape',
}) => {
  const pieces = useMemo<ConfettiPiece[]>(() => {
    const palette = variant === 'victory' ? CONFETTI_COLORS_VICTORY : CONFETTI_COLORS_ESCAPE;
    return Array.from({ length: 48 }, (_, i) => {
      const seed = (i * 37 + 13) % 100;
      const driftSign = i % 2 === 0 ? 1 : -1;
      return {
        id: i,
        leftPct: (i * 2.08 + (seed % 7)) % 98,
        delaySec: ((i * 11) % 24) * 0.045,
        durationSec: 2.8 + ((seed % 16) * 0.1),
        driftPx: driftSign * (20 + (seed % 55)),
        rotDeg: driftSign * (360 + (seed % 360)),
        width: 7 + (i % 5) * 2,
        height: i % 3 === 0 ? 7 + (i % 5) * 2 : 12 + (i % 4) * 3,
        color: palette[i % palette.length],
        isCircle: i % 4 === 0,
      };
    });
  }, [variant]);

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="animate-confetti absolute -top-6 block shadow-2xs"
          style={
            {
              left: `${p.leftPct}%`,
              width: `${p.width}px`,
              height: `${p.height}px`,
              backgroundColor: p.color,
              borderRadius: p.isCircle ? '9999px' : '2px',
              animationDelay: `${p.delaySec}s`,
              '--confetti-dur': `${p.durationSec}s`,
              '--confetti-drift': `${p.driftPx}px`,
              '--confetti-rot': `${p.rotDeg}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
};

interface RatRaceEscapeCelebrationProps {
  log: GameLogEntry;
  player?: Player;
  language: Language;
  onDismiss: () => void;
}

export const RatRaceEscapeCelebration: React.FC<RatRaceEscapeCelebrationProps> = ({
  log,
  player,
  language,
  onDismiss,
}) => {
  return (
    <>
      <ConfettiBurst variant="escape" />
      <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="animate-celebrate-pop max-w-lg w-full bg-white border-4 border-emerald-400 rounded-3xl p-7 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-amber-200/40 blur-xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-emerald-200/40 blur-xl pointer-events-none" />

          <div className="relative flex items-center justify-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-600 shadow-xs">
              <Rocket className="w-6 h-6" />
            </span>
            {player && (
              <PlayerAvatar
                avatarId={player.avatarId}
                color={player.color}
                isBot={player.isBot}
                isActiveTurn
                size="lg"
              />
            )}
            <span className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-600 shadow-xs">
              <Crown className="w-6 h-6" />
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t(language, 'escapeCelebrationSub')}</span>
            </div>
            <h2 className="font-display text-base sm:text-xl font-extrabold text-slate-900 leading-snug whitespace-nowrap">
              {t(language, 'escapeCelebrationTitle')}
            </h2>
            <p className="text-sm font-bold text-emerald-700">
              {player?.name || log.actorName}
              {player?.career && (
                <span className="font-semibold text-slate-600">
                  {' · '}
                  {language === 'th' ? `อาชีพ: ${player.career.name.th}` : player.career.name.en}
                </span>
              )}
            </p>
          </div>

          <p className="text-xs sm:text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 leading-relaxed">
            {log.message[language]}
          </p>

          {player && player.finance.fastTrackCashFlowDay > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-900">
                {t(language, 'ftBaseCashflowDay')}
              </span>
              <span className="font-mono font-extrabold text-sm text-emerald-700 tabular-nums">
                +{player.finance.fastTrackCashFlowDay.toLocaleString()} ฿
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-colors shadow-sm"
          >
            {t(language, 'escapeCelebrationBtn')}
          </button>
        </div>
      </div>
    </>
  );
};

interface BankruptcyAnnouncementModalProps {
  log: GameLogEntry;
  player?: Player;
  language: Language;
  onDismiss: () => void;
}

export const BankruptcyAnnouncementModal: React.FC<BankruptcyAnnouncementModalProps> = ({
  log,
  player,
  language,
  onDismiss,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="animate-celebrate-pop max-w-md w-full bg-white border-4 border-rose-500 rounded-3xl p-7 text-center space-y-4 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-rose-200/45 blur-xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-pink-200/45 blur-xl pointer-events-none" />

        <div className="relative flex items-center justify-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600 shadow-xs">
            <AlertTriangle className="w-6 h-6" />
          </span>
          {player && (
            <div className="opacity-80">
              <PlayerAvatar
                avatarId={player.avatarId}
                color={player.color}
                isBot={player.isBot}
                size="lg"
              />
            </div>
          )}
          <span className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600 shadow-xs">
            <Ban className="w-6 h-6" />
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{t(language, 'bankruptPopupSub')}</span>
          </div>
          <h2 className="font-display text-2xl font-extrabold text-rose-700 leading-snug">
            {t(language, 'bankruptPopupTitle')}
          </h2>
          <p className="text-base font-extrabold text-slate-900">
            {player?.name || log.actorName}
            {player?.career && (
              <span className="text-xs font-semibold text-slate-500">
                {' · '}
                {language === 'th' ? `อาชีพ: ${player.career.name.th}` : player.career.name.en}
              </span>
            )}
          </p>
        </div>

        <p className="text-xs sm:text-sm text-rose-950 bg-rose-50 border border-rose-200 rounded-xl p-3 leading-relaxed font-medium">
          {log.message[language]}
        </p>

        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
          {t(language, 'bankruptPopupNote')}
        </p>

        <button
          type="button"
          onClick={onDismiss}
          className="w-full py-3 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition-colors shadow-sm"
        >
          {t(language, 'bankruptPopupBtn')}
        </button>
      </div>
    </div>
  );
};

interface FastTrackWinnerModalProps {
  log: GameLogEntry;
  player?: Player;
  language: Language;
  onDismiss: () => void;
}

export const FastTrackWinnerModal: React.FC<FastTrackWinnerModalProps> = ({
  log,
  player,
  language,
  onDismiss,
}) => {
  return (
    <>
      <ConfettiBurst variant="victory" />
      <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="animate-celebrate-pop max-w-lg w-full bg-white border-4 border-amber-400 rounded-3xl p-7 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-amber-200/45 blur-xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-orange-200/45 blur-xl pointer-events-none" />

          <div className="relative flex items-center justify-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-600 shadow-xs">
              <Trophy className="w-6 h-6" />
            </span>
            {player && (
              <PlayerAvatar
                avatarId={player.avatarId}
                color={player.color}
                isBot={player.isBot}
                isActiveTurn
                size="lg"
              />
            )}
            <span className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-300 flex items-center justify-center text-orange-600 shadow-xs">
              <Crown className="w-6 h-6" />
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {t(language, 'winnerPopupSub')}
                {player?.winRank ? ` (#${player.winRank})` : ''}
              </span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-slate-900 leading-snug">
              {t(language, 'winnerPopupTitle')}
            </h2>
            <p className="text-sm font-bold text-amber-700">
              {player?.name || log.actorName}
              {player?.career && (
                <span className="font-semibold text-slate-600">
                  {' · '}
                  {language === 'th' ? `อาชีพ: ${player.career.name.th}` : player.career.name.en}
                </span>
              )}
            </p>
          </div>

          <p className="text-xs sm:text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed font-medium">
            {log.message[language]}
          </p>

          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
            {t(language, 'winnerPopupNote')}
          </p>

          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-colors shadow-sm cursor-pointer"
          >
            {t(language, 'winnerPopupBtn')}
          </button>
        </div>
      </div>
    </>
  );
};
