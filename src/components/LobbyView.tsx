import React, { useState } from 'react';
import { Bot, Copy, Check, Play, Plus, Sparkles, Trash2, Users, UserPlus } from 'lucide-react';
import { DREAM_OPTIONS } from '../../shared/board';
import { CAREERS } from '../../shared/careers';
import { GameRoomState, Language } from '../../shared/types';
import { t } from '../i18n';

interface LobbyViewProps {
  language: Language;
  roomState: GameRoomState | null;
  playerId: string;
  errorMsg: string | null;
  onCreateRoom: (playerName: string, botCount: number, adminPlays: boolean) => void;
  onJoinRoom: (roomCode: string, playerName: string) => void;
  onAddBot: () => void;
  onRemovePlayer: (targetId: string) => void;
  onAssignCareer: (targetId: string, careerId: string) => void;
  onAssignDream: (targetId: string, dreamId: string) => void;
  onStartGame: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  language,
  roomState,
  playerId,
  errorMsg,
  onCreateRoom,
  onJoinRoom,
  onAddBot,
  onRemovePlayer,
  onAssignCareer,
  onAssignDream,
  onStartGame,
}) => {
  const [playerName, setPlayerName] = useState(language === 'th' ? 'ผู้เล่น 1' : 'Player 1');
  const [joinCode, setJoinCode] = useState('');
  const [soloBots, setSoloBots] = useState(2);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!roomState) return;
    navigator.clipboard.writeText(roomState.roomCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!roomState) {
    return (
      <main className="flex-1 overflow-y-auto px-6 py-10 flex items-center justify-center">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Hero Overview */}
          <section className="lg:col-span-6 flex flex-col justify-between bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <div>
              <p className="text-xs font-semibold text-emerald-600 mb-3">
                {language === 'th'
                  ? 'Rat Race · Fast Track · 12 อาชีพ · 4 กองการ์ด'
                  : 'Rat Race · Fast Track · 12 Careers · 4 Card Decks'}
              </p>
              <h1 className="font-display text-3xl lg:text-4xl font-extrabold text-slate-900 leading-tight text-balance mb-4">
                {t(language, 'heroTitle')}
              </h1>
              <p className="text-sm lg:text-base text-slate-600 leading-relaxed mb-8">
                {t(language, 'heroSubtitle')}
              </p>

              <div className="space-y-3 text-sm text-slate-700 border-t border-slate-100 pt-6">
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {language === 'th' ? 'ระบบงบการเงินอัตโนมัติ' : 'Auto Financial Statement'}
                  </span>
                  <span className="font-mono font-semibold text-emerald-600">
                    {language === 'th' ? 'งบดุล + แสดงส่วนต่าง' : 'Live Ledger + Deltas'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {language === 'th' ? 'สินเชื่อธนาคาร' : 'Bank Loan Rule'}
                  </span>
                  <span className="font-mono font-semibold text-orange-600">
                    {language === 'th' ? 'ดอกเบี้ย 10% · สูงสุด 10x Cashflow' : '10%/mo · Max 10x Cashflow'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {language === 'th' ? 'ประมูลสิทธิ์ & หุ้น' : 'Deal Auction & Stocks'}
                  </span>
                  <span className="font-mono font-semibold text-sky-600">
                    {language === 'th' ? 'ขายค่านายหน้า · ขายหุ้นทุกผู้เล่น' : "Finder's Fee · Simultaneous Sell"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {language === 'th' ? 'โหมดฝึกสอน / Robot' : 'Coaching / Robot Mode'}
                  </span>
                  <span className="font-mono font-semibold text-violet-600">
                    {language === 'th' ? 'กดถัดไปทีละ Step' : 'Manual Step-by-Step'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 text-xs text-slate-500">
              {language === 'th'
                ? 'เหมาะสำหรับเล่นส่วนตัว สอนทีมงาน หรือจัดกิจกรรมเวิร์กชอปการเงิน'
                : 'Built for solo practice, team workshops, and live financial training events.'}
            </div>
          </section>

          {/* Right Action Forms */}
          <section className="lg:col-span-6 flex flex-col justify-between bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">
                  {t(language, 'yourName')}
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder={t(language, 'namePlaceholder')}
                  maxLength={24}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              {errorMsg && (
                <div className="px-4 py-2.5 rounded-xl bg-pink-50 border border-pink-200 text-pink-700 text-sm">
                  {errorMsg}
                </div>
              )}

              {/* Create Room / Solo vs Robot */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-slate-800">
                    {t(language, 'robotCount')}
                  </span>
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {[0, 1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSoloBots(num)}
                        className={`w-8 h-8 text-xs font-mono font-bold rounded-lg transition-colors ${
                          soloBots === num
                            ? 'bg-orange-500 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-white'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => onCreateRoom(playerName, 0, false)}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-colors whitespace-nowrap shadow-xs"
                  >
                    <Users className="w-4 h-4" />
                    <span>{t(language, 'createRoom')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onCreateRoom(playerName, Math.max(1, soloBots), true)}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-colors whitespace-nowrap shadow-xs"
                  >
                    <Bot className="w-4 h-4" />
                    <span>{t(language, 'soloMode')} ({Math.max(1, soloBots)})</span>
                  </button>
                </div>
              </div>

              {/* Join Room by Code */}
              <div className="pt-5 border-t border-slate-100">
                <label className="block text-sm font-semibold text-slate-800 mb-2">
                  {t(language, 'joinRoom')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder={t(language, 'roomCodePlaceholder')}
                    maxLength={8}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono tracking-widest uppercase placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    disabled={!joinCode.trim()}
                    onClick={() => onJoinRoom(joinCode, playerName)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{t(language, 'joinButton')}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // Waiting Room Lobby
  const isHost = roomState.hostId === playerId;

  return (
    <main className="flex-1 overflow-y-auto px-6 py-8 flex items-center justify-center">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">{t(language, 'lobbyTitle')}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{t(language, 'maxPlayersNote')}</p>
          </div>

          <div className="flex items-center gap-3 bg-orange-50 px-4 py-2.5 rounded-xl border border-orange-200">
            <span className="text-xs text-orange-700 font-medium">{t(language, 'roomCode')}</span>
            <span className="font-mono text-2xl font-extrabold tracking-widest text-orange-600">
              {roomState.roomCode}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-semibold transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t(language, 'copied') : t(language, 'copyCode')}</span>
            </button>
          </div>
        </div>

        {roomState.isAdminSpectator && isHost && (
          <div className="px-4 py-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-900 text-xs sm:text-sm font-medium flex items-center justify-between gap-3">
            <span>{t(language, 'adminSpectatorLobbyNote')}</span>
            <span className="font-mono text-xs font-bold text-orange-700 shrink-0">
              {t(language, 'hostLabel')}: {roomState.hostName}
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="px-4 py-2.5 rounded-xl bg-pink-50 border border-pink-200 text-pink-700 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Players List (1 to 6) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              {t(language, 'playersInRoom')} ({roomState.players.length}/6)
            </h3>
            {isHost && roomState.players.length < 6 && (
              <button
                type="button"
                onClick={onAddBot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t(language, 'addRobot')}</span>
              </button>
            )}
          </div>

          {roomState.players.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {t(language, 'noPlayersYetLobby')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {roomState.players.map((p) => {
              const canEdit = isHost || p.id === playerId;
              const selectedDream =
                DREAM_OPTIONS.find((d) => d.id === p.dreamId) || DREAM_OPTIONS[0];
              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-4 h-4 rounded-full shrink-0 border border-slate-900/20 shadow-xs"
                        style={{ backgroundColor: p.color }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 truncate">
                          <span className="truncate">{p.name}</span>
                          {p.isHost && (
                            <span className="text-xs font-medium text-orange-600">· {t(language, 'hostLabel')}</span>
                          )}
                          {p.isBot && (
                            <span className="text-xs font-medium text-sky-600">· {t(language, 'robotLabel')}</span>
                          )}
                          {p.id === playerId && !p.isHost && (
                            <span className="text-xs font-medium text-emerald-600">· {t(language, 'youLabel')}</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5 truncate">
                          {p.career.name[language]} · {t(language, 'salary')}: {p.career.salary.toLocaleString()} ฿
                        </div>
                        <div className="text-xs text-pink-600 font-medium mt-0.5 flex items-center gap-1 truncate">
                          <Sparkles className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {selectedDream.name[language]} ({(selectedDream.cost / 1000000).toFixed(1)}M ฿)
                          </span>
                        </div>
                      </div>
                    </div>

                    {isHost && !p.isHost && (
                      <button
                        type="button"
                        onClick={() => onRemovePlayer(p.id)}
                        aria-label="Remove player"
                        className="p-1.5 rounded-md text-slate-400 hover:text-pink-600 hover:bg-pink-50 transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {canEdit && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200/80">
                      <select
                        value={p.career.id}
                        onChange={(e) => onAssignCareer(p.id, e.target.value)}
                        aria-label={t(language, 'selectCareer')}
                        className="w-full text-xs bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
                      >
                        {CAREERS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name[language]}
                          </option>
                        ))}
                      </select>

                      <select
                        value={p.dreamId || DREAM_OPTIONS[0].id}
                        onChange={(e) => onAssignDream(p.id, e.target.value)}
                        aria-label={t(language, 'dreamLabel')}
                        className="w-full text-xs bg-white border border-pink-300 text-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-pink-500"
                      >
                        {DREAM_OPTIONS.map((d) => (
                          <option key={d.id} value={d.id}>
                            ★ {d.name[language]} ({(d.cost / 1000000).toFixed(1)}M)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          )}
        </div>

        {/* Start Game Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            {t(language, 'selectDreamLabel')} ·{' '}
            {isHost
              ? language === 'th'
                ? 'เลือกอาชีพและความฝันเรียบร้อยแล้วกดเริ่มเกมได้ทันที'
                : 'Customize careers & dreams, then start the game whenever ready.'
              : language === 'th'
              ? 'กำลังรอผู้ดูแลห้อง (Host) กดเริ่มเกม...'
              : 'Waiting for the Host to start the game...'}
          </p>

          {isHost && (
            <button
              type="button"
              disabled={roomState.players.length < 1}
              onClick={onStartGame}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors whitespace-nowrap shadow-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{t(language, 'startGame')}</span>
            </button>
          )}
        </div>
      </div>
    </main>
  );
};
