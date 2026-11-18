import React from 'react';
import { GameLogEntry, Language } from '../../shared/types';
import { t } from '../i18n';

interface ActivityLogPanelProps {
  logs: GameLogEntry[];
  language: Language;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export const ActivityLogPanel: React.FC<ActivityLogPanelProps> = ({
  logs,
  language,
  className = '',
}) => {
  return (
    <div className={`flex flex-col overflow-hidden bg-white h-full ${className}`}>
      <div className="px-4 py-1.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2 text-xs font-bold text-slate-600 shrink-0">
        <span>{t(language, 'activityLog')}</span>
        <span className="font-mono text-[11px] font-semibold text-slate-400 tabular-nums">
          {logs.length}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
        {logs.map((entry) => {
          const timeStr = new Date(entry.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          const flatMessage = entry.message[language]
            .replace(/\s*\n+\s*/g, ' ')
            .replace(/[\p{Extended_Pictographic}\u2600-\u27BF]\uFE0F?/gu, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
          return (
            <div
              key={entry.id}
              className="flex items-baseline gap-2.5 px-3 py-1.5 text-xs hover:bg-slate-50/80 transition-colors"
            >
              <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                {timeStr}
              </span>
              <span className="font-bold text-emerald-600 shrink-0">{entry.actorName}</span>
              <span className="text-slate-700 truncate min-w-0 flex-1" title={flatMessage}>
                {flatMessage}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
