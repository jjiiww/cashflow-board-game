import React from 'react';
import { Volume2, VolumeX, LogOut } from 'lucide-react';
import { Language } from '../../shared/types';
import { t } from '../i18n';

interface GameHeaderProps {
  language: Language;
  onToggleLanguage: (lang: Language) => void;
  muted: boolean;
  onToggleMute: () => void;
  roomCode?: string;
  turnCount?: number;
  activePlayerName?: string;
  isAdminObserver?: boolean;
  onLeaveRoom?: () => void;
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  language,
  onToggleLanguage,
  muted,
  onToggleMute,
  roomCode,
  turnCount,
  activePlayerName,
  isAdminObserver = false,
  onLeaveRoom,
}) => {
  return (
    <header className="h-14 border-b border-slate-200 bg-white/95 backdrop-blur px-5 flex items-center justify-between gap-8 shrink-0 shadow-xs">
      {/* Zone 1: Brand wordmark only */}
      <div className="font-display text-lg font-extrabold tracking-tight text-emerald-600 whitespace-nowrap shrink-0">
        {t(language, 'appTitle')}
      </div>

      {/* Zone 2: Concise single-line session info */}
      <div className="hidden md:flex items-center gap-3 text-xs text-slate-600 whitespace-nowrap truncate">
        {roomCode ? (
          <>
            <span>
              {t(language, 'roomCode')}: <strong className="font-mono text-amber-600">{roomCode}</strong>
            </span>
            {isAdminObserver && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="font-semibold text-orange-600">
                  {t(language, 'adminObserverBadge')}
                </span>
              </>
            )}
            {typeof turnCount === 'number' && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span>
                  {t(language, 'turnLabel')} <strong className="font-mono text-slate-900">{turnCount}</strong>
                </span>
              </>
            )}
            {activePlayerName && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="truncate max-w-[240px]">
                  {t(language, 'activeTurn')}: <strong className="text-emerald-600">{activePlayerName}</strong>
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-slate-500">
            {language === 'th' ? 'บอร์ดเกมการเงินออนไลน์ 2 ภาษา (สูงสุด 6 คน)' : 'Bilingual Online Financial Board Game (Up to 6 Players)'}
          </span>
        )}
      </div>

      {/* Zone 3: Language segmented control, sound toggle, and optional leave action */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => onToggleLanguage('th')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              language === 'th'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ไทย
          </button>
          <button
            type="button"
            onClick={() => onToggleLanguage('en')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              language === 'en'
                ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            EN
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {onLeaveRoom && (
          <button
            type="button"
            onClick={onLeaveRoom}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-pink-200 text-pink-600 hover:bg-pink-50 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t(language, 'leaveRoom')}</span>
          </button>
        )}
      </div>
    </header>
  );
};
