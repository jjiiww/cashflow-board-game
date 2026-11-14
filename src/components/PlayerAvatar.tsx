import React from 'react';
import {
  Briefcase,
  Compass,
  Crown,
  Flame,
  Gem,
  GraduationCap,
  Rocket,
  Shield,
  Bot,
} from 'lucide-react';
import { AVATAR_OPTIONS, PLAYER_COLOR_OPTIONS } from '../../shared/avatars';
import { Language } from '../../shared/types';
import { t } from '../i18n';

export function getAvatarIcon(avatarId?: string, className = 'w-4 h-4') {
  switch (avatarId) {
    case 'tycoon':
      return <Crown className={className} />;
    case 'rocket':
      return <Rocket className={className} />;
    case 'diamond':
      return <Gem className={className} />;
    case 'compass':
      return <Compass className={className} />;
    case 'shield':
      return <Shield className={className} />;
    case 'flame':
      return <Flame className={className} />;
    case 'grad':
      return <GraduationCap className={className} />;
    case 'investor':
    default:
      return <Briefcase className={className} />;
  }
}

interface PlayerAvatarProps {
  avatarId?: string;
  color: string;
  isBot?: boolean;
  isActiveTurn?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  avatarId,
  color,
  isBot = false,
  isActiveTurn = false,
  size = 'md',
}) => {
  const sizeClasses = {
    xs: 'w-5 h-5 rounded-md',
    sm: 'w-7 h-7 rounded-lg',
    md: 'w-8 h-8 rounded-xl',
    lg: 'w-10 h-10 rounded-xl',
  }[size];

  const iconSize = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 text-white shadow-2xs border-2 transition-transform ${sizeClasses} ${
        isActiveTurn ? 'ring-2 ring-orange-400 ring-offset-1 border-white scale-105' : 'border-white/90'
      }`}
      style={{ backgroundColor: color }}
    >
      {getAvatarIcon(avatarId, iconSize)}
      {isBot && size !== 'xs' && (
        <span
          title="Robot"
          className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-slate-900 text-sky-300 border border-white flex items-center justify-center"
        >
          <Bot className="w-2.5 h-2.5" />
        </span>
      )}
    </span>
  );
};

interface AvatarCustomizerPanelProps {
  language: Language;
  currentAvatarId?: string;
  currentColor: string;
  onSelectAvatar: (avatarId: string) => void;
  onSelectColor: (color: string) => void;
  onClose?: () => void;
}

export const AvatarCustomizerPanel: React.FC<AvatarCustomizerPanelProps> = ({
  language,
  currentAvatarId = 'investor',
  currentColor,
  onSelectAvatar,
  onSelectColor,
  onClose,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-slate-800">{t(language, 'customizeAvatarTitle')}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-800 px-1 font-semibold"
          >
            ✕
          </button>
        )}
      </div>

      <div>
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
          {t(language, 'chooseAvatarLabel')}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {AVATAR_OPTIONS.map((opt) => {
            const selected = opt.id === currentAvatarId;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectAvatar(opt.id)}
                title={opt.label[language]}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg border text-[10px] font-medium transition-colors ${
                  selected
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {getAvatarIcon(opt.id, 'w-3.5 h-3.5')}
                <span className="truncate max-w-full">{opt.label[language]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
          {t(language, 'chooseColorLabel')}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PLAYER_COLOR_OPTIONS.map((c) => {
            const selected = c.hex.toLowerCase() === currentColor.toLowerCase();
            return (
              <button
                key={c.hex}
                type="button"
                onClick={() => onSelectColor(c.hex)}
                title={c.label[language]}
                aria-label={c.label[language]}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${
                  selected ? 'border-slate-900 scale-110 ring-2 ring-slate-300' : 'border-white shadow-xs hover:scale-105'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
