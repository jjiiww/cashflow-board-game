import React, { useState } from 'react';
import { Bot, Copy, Check, Lock, Palette, Play, Plus, Sparkles, Trash2, Users, UserPlus, X } from 'lucide-react';
import { PLAYER_COLOR_OPTIONS } from '../../shared/avatars';
import { DREAM_OPTIONS } from '../../shared/board';
import { CAREERS } from '../../shared/careers';
import { GameRoomState, Language } from '../../shared/types';
import { t } from '../i18n';
import { AvatarCustomizerPanel, PlayerAvatar } from './PlayerAvatar';

interface LobbyViewProps {
  language: Language;
  roomState: GameRoomState | null;
  playerId: string;
  errorMsg: string | null;
  onCreateRoom: (
    playerName: string,
    botCount: number,
    adminPlays: boolean,
    adminPassword?: string
  ) => void;
  onJoinRoom: (roomCode: string, playerName: string) => void;
  onAddBot: () => void;
  onRemovePlayer: (targetId: string) => void;
  onAssignCareer: (targetId: string, careerId: string) => void;
  onAssignDream: (targetId: string, dreamId: string) => void;
  onCustomizePlayer?: (targetId: string, avatarId?: string, color?: string) => void;
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
  onCustomizePlayer,
  onStartGame,
}) => {
  const [playerName, setPlayerName] = useState(language === 'th' ? 'ผู้เล่น 1' : 'Player 1');
  const [adminPassword, setAdminPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [editingAppearanceId, setEditingAppearanceId] = useState<string | null>(null);

  const handleCopy = () => {
    if (!roomState) return;
    navigator.clipboard.writeText(roomState.roomCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleCreateAdminRoom = () => {
    if (adminPassword !== 'Bradley') {
      setLocalError(t(language, 'wrongAdminPassword'));
      return;
    }
    setLocalError(null);
    onCreateRoom(playerName, 0, false, adminPassword);
  };

  const isServerAdminPassError = Boolean(
    errorMsg && (errorMsg.includes('Admin') || errorMsg.includes('รหัสผ่าน'))
  );
  const adminError = localError || (isServerAdminPassError ? errorMsg : null);
  const joinError = !isServerAdminPassError ? errorMsg : null;

  if (!roomState) {
    return (
      <main className="flex-1 overflow-y-auto px-6 py-10 flex items-center justify-center">
        <section className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <div className="space-y-5">
            {/* 1. ชื่อผู้เล่นของคุณ & 2. text box กรอกชื่อ */}
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

            {/* 3. เข้าร่วมห้องด้วยรหัส & 4. text box กรอกรหัส และปุ่มเข้าห้องเกม */}
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <label className="block text-sm font-semibold text-slate-800">
                {t(language, 'joinRoom')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && joinCode.trim()) {
                      setLocalError(null);
                      onJoinRoom(joinCode, playerName);
                    }
                  }}
                  placeholder={t(language, 'roomCodePlaceholder')}
                  maxLength={8}
                  className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono tracking-widest uppercase placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
                />
                <button
                  type="button"
                  disabled={!joinCode.trim()}
                  onClick={() => {
                    setLocalError(null);
                    onJoinRoom(joinCode, playerName);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors whitespace-nowrap shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{t(language, 'joinButton')}</span>
                </button>
              </div>
              {joinError && (
                <div className="px-4 py-2.5 rounded-xl bg-pink-50 border border-pink-200 text-pink-700 text-sm">
                  {joinError}
                </div>
              )}
            </div>

            {/* 5. ปุ่มเล่นคนเดียวกับ Robot */}
            <div className="pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setLocalError(null);
                  onCreateRoom(playerName, 1, true);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-colors whitespace-nowrap shadow-xs"
              >
                <Bot className="w-4 h-4" />
                <span>{t(language, 'soloMode')}</span>
              </button>
            </div>

            {/* 6. ปุ่มสร้างห้องใหม่ (Admin) & 7. textbox ใส่รหัสผ่าน admin */}
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <button
                type="button"
                onClick={handleCreateAdminRoom}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-colors whitespace-nowrap shadow-xs"
              >
                <Users className="w-4 h-4" />
                <span>{t(language, 'createRoom')}</span>
              </button>

              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    if (localError) setLocalError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateAdminRoom();
                  }}
                  placeholder={t(language, 'adminPasswordPlaceholder')}
                  aria-label={t(language, 'adminPasswordLabel')}
                  autoComplete="off"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:bg-white"
                />
              </div>

              {adminError && (
                <div className="px-4 py-2.5 rounded-xl bg-pink-50 border border-pink-200 text-pink-700 text-sm">
                  {adminError}
                </div>
              )}
            </div>
          </div>
        </section>
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

          {!roomState.isSoloMode && (
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
          )}
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
              const isCustomizing = editingAppearanceId === p.id;
              const selectedDream =
                DREAM_OPTIONS.find((d) => d.id === p.dreamId) || DREAM_OPTIONS[0];
              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <PlayerAvatar
                        avatarId={p.avatarId}
                        color={p.color}
                        isBot={p.isBot}
                        size="md"
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

                    <div className="flex items-center gap-1 shrink-0">
                      {canEdit && onCustomizePlayer && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingAppearanceId((curr) => (curr === p.id ? null : p.id))
                          }
                          aria-label={t(language, 'customizeAvatarTitle')}
                          title={t(language, 'customizeAvatarTitle')}
                          className={`p-1.5 rounded-md transition-colors ${
                            isCustomizing
                              ? 'text-emerald-700 bg-emerald-100'
                              : 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          <Palette className="w-4 h-4" />
                        </button>
                      )}
                      {isHost && !p.isHost && (
                        <button
                          type="button"
                          onClick={() => onRemovePlayer(p.id)}
                          aria-label="Remove player"
                          className="p-1.5 rounded-md text-slate-400 hover:text-pink-600 hover:bg-pink-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isCustomizing && canEdit && onCustomizePlayer && (
                    <AvatarCustomizerPanel
                      language={language}
                      currentAvatarId={p.avatarId}
                      currentColor={p.color}
                      takenColors={roomState.players.filter((other) => other.id !== p.id).map((other) => other.color)}
                      onSelectAvatar={(avatarId) => onCustomizePlayer(p.id, avatarId, undefined)}
                      onSelectColor={(color) => onCustomizePlayer(p.id, undefined, color)}
                      onClose={() => setEditingAppearanceId(null)}
                    />
                  )}

                  {canEdit && onCustomizePlayer && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                      <span className="text-[11px] font-semibold text-slate-600">
                        {t(language, 'chooseColorLabel')}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {PLAYER_COLOR_OPTIONS.map((c) => {
                          const hexLower = c.hex.toLowerCase();
                          const isSelected = hexLower === p.color.toLowerCase();
                          const isTaken =
                            !isSelected &&
                            roomState.players.some(
                              (other) => other.id !== p.id && other.color.toLowerCase() === hexLower
                            );
                          return (
                            <button
                              key={c.hex}
                              type="button"
                              disabled={isTaken}
                              onClick={() => !isTaken && onCustomizePlayer(p.id, undefined, c.hex)}
                              title={
                                isTaken
                                  ? `${c.label[language]} (${t(language, 'colorTakenNote')})`
                                  : c.label[language]
                              }
                              aria-label={c.label[language]}
                              className={`relative w-6 h-6 rounded-full border-2 flex items-center justify-center transition-transform ${
                                isSelected
                                  ? 'border-slate-900 scale-110 ring-2 ring-slate-300'
                                  : isTaken
                                  ? 'border-slate-300 opacity-30 cursor-not-allowed'
                                  : 'border-white shadow-xs hover:scale-110'
                              }`}
                              style={{ backgroundColor: c.hex }}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                              {isTaken && <X className="w-3.5 h-3.5 text-white drop-shadow" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
