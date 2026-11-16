import React, { useEffect, useRef, useState } from 'react';
import { DREAM_OPTIONS, FAST_TRACK_SPACES, RAT_RACE_SPACES } from '../../shared/board';
import {
  FastTrackSpace,
  GameRoomState,
  Language,
  RatRaceSpace,
  RatRaceSpaceType,
} from '../../shared/types';
import { soundFX } from '../utils/sound';

interface CashflowBoardProps {
  roomState: GameRoomState;
  language: Language;
  localPlayerId: string;
  onSelectDealDeck?: (deck: 'small_deal' | 'big_deal') => void;
  onAnimationChange?: (animating: boolean) => void;
}

// Inner Rat Race colors matching user's specification:
// - Opportunity: Green
// - Payday: Yellow (same as Cashflow Day)
// - Charity (บริจาค): Orange (same as Fast Track Charity)
// - Doodad (จ่ายซะ): Pink (same as Fast Track Lifestyle/Dream)
// - Market (ซื้อขาย): Sky Blue
// - Baby / Downsized: Purple
const RAT_SPACE_COLORS: Record<RatRaceSpaceType, { fill: string; stroke: string; text: string }> = {
  opportunity: { fill: '#10b981', stroke: '#059669', text: '#ffffff' },
  payday: { fill: '#facc15', stroke: '#eab308', text: '#0f172a' },
  market: { fill: '#0ea5e9', stroke: '#0284c7', text: '#ffffff' },
  doodad: { fill: '#ec4899', stroke: '#db2777', text: '#ffffff' },
  charity: { fill: '#f97316', stroke: '#ea580c', text: '#ffffff' },
  baby: { fill: '#8b5cf6', stroke: '#7c3aed', text: '#ffffff' },
  downsized: { fill: '#8b5cf6', stroke: '#7c3aed', text: '#ffffff' },
};

// 1640x920 SVG viewBox for 48-space rectangular perimeter (16 cols x 10 rows)
// Center of inner circle = (820, 460)
const BOARD_CX = 820;
const BOARD_CY = 460;
const RAT_RACE_START_ANGLE = 225;

function getFastTrackRect(
  index: number
): { x: number; y: number; w: number; h: number; cx: number; cy: number; isSide: boolean; isCorner: boolean } {
  // 0: Top-Left Corner (CASHFLOW)
  if (index === 0) {
    return { x: 12, y: 12, w: 136, h: 112, cx: 80, cy: 68, isSide: false, isCorner: true };
  }
  // 1..14: Top Edge (Left to Right)
  if (index >= 1 && index <= 14) {
    const x = 148 + (index - 1) * 96;
    return { x, y: 12, w: 96, h: 112, cx: x + 48, cy: 68, isSide: false, isCorner: false };
  }
  // 15: Top-Right Corner (CASHFLOW)
  if (index === 15) {
    return { x: 1492, y: 12, w: 136, h: 112, cx: 1560, cy: 68, isSide: false, isCorner: true };
  }
  // 16..23: Right Edge (Top to Bottom)
  if (index >= 16 && index <= 23) {
    const y = 124 + (index - 16) * 84;
    return { x: 1492, y, w: 136, h: 84, cx: 1560, cy: y + 42, isSide: true, isCorner: false };
  }
  // 24: Bottom-Right Corner (CASHFLOW)
  if (index === 24) {
    return { x: 1492, y: 796, w: 136, h: 112, cx: 1560, cy: 852, isSide: false, isCorner: true };
  }
  // 25..38: Bottom Edge (Right to Left)
  if (index >= 25 && index <= 38) {
    const colFromLeft = 13 - (index - 25);
    const x = 148 + colFromLeft * 96;
    return { x, y: 796, w: 96, h: 112, cx: x + 48, cy: 852, isSide: false, isCorner: false };
  }
  // 39: Bottom-Left Corner (CASHFLOW)
  if (index === 39) {
    return { x: 12, y: 796, w: 136, h: 112, cx: 80, cy: 852, isSide: false, isCorner: true };
  }
  // 40..47: Left Edge (Bottom to Top)
  const rowFromTop = 7 - (index - 40);
  const y = 124 + rowFromTop * 84;
  return { x: 12, y, w: 136, h: 84, cx: 80, cy: y + 42, isSide: true, isCorner: false };
}

function getFastTrackColors(type: FastTrackSpace['type'], isPlayerDream: boolean) {
  // Cashflow Day -> Yellow (same as Rat Race Payday)
  if (type === 'cashflow_day') {
    return { fill: '#facc15', stroke: '#eab308', text: '#0f172a', sub: '#713f12' };
  }
  // Business / Investment / IPO -> Green (same as Rat Race Opportunity)
  if (type === 'business' || type === 'business_roll' || type === 'ipo_roll') {
    return { fill: '#10b981', stroke: '#059669', text: '#ffffff', sub: '#ecfdf5' };
  }
  // Charity -> Orange (same as Rat Race Charity)
  if (type === 'charity') {
    return { fill: '#f97316', stroke: '#ea580c', text: '#ffffff', sub: '#ffedd5' };
  }
  // Tax Audit / Lawsuit / Divorce -> Purple (same as Rat Race Baby / Downsized)
  if (type === 'tax_audit' || type === 'lawsuit' || type === 'divorce') {
    return { fill: '#8b5cf6', stroke: '#7c3aed', text: '#ffffff', sub: '#ede9fe' };
  }
  // Travel / Lifestyle / Dreams -> Pink (chosen Dream uses bold dark border for high contrast)
  if (isPlayerDream) {
    return {
      fill: '#be185d',
      stroke: '#0f172a',
      text: '#ffffff',
      sub: '#fce7f3',
    };
  }
  return {
    fill: '#ec4899',
    stroke: '#db2777',
    text: '#ffffff',
    sub: '#fce7f3',
  };
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeAnnularSector(
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  startAngle: number,
  endAngle: number
): string {
  const p1 = polarToCartesian(cx, cy, rOut, startAngle);
  const p2 = polarToCartesian(cx, cy, rOut, endAngle);
  const p3 = polarToCartesian(cx, cy, rIn, endAngle);
  const p4 = polarToCartesian(cx, cy, rIn, startAngle);
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOut} ${rOut} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rIn} ${rIn} 0 0 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function splitVisualClusters(text: string): string[] {
  const clusters: string[] = [];
  const isThaiCombining = /[\u0E31\u0E33\u0E34-\u0E3A\u0E47-\u0E4E]/;
  for (const ch of text) {
    if (clusters.length > 0 && isThaiCombining.test(ch)) {
      clusters[clusters.length - 1] += ch;
    } else {
      clusters.push(ch);
    }
  }
  return clusters;
}

function visualLength(text: string): number {
  return splitVisualClusters(text).length;
}

function wrapLabelLines(text: string, maxChars: number, maxLines = 3): string[] {
  if (visualLength(text) <= maxChars) return [text];
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];

  if (words.length > 1) {
    let current = '';
    for (const w of words) {
      if (!current) {
        current = w;
      } else if (visualLength(current + ' ' + w) <= maxChars) {
        current += ' ' + w;
      } else {
        lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
  } else {
    const clusters = splitVisualClusters(text);
    for (let i = 0; i < clusters.length; i += maxChars) {
      lines.push(clusters.slice(i, i + maxChars).join(''));
    }
  }

  if (lines.length <= maxLines) return lines;
  const tail = splitVisualClusters(lines.slice(maxLines - 1).join(' '))
    .slice(0, maxChars)
    .join('');
  return [...lines.slice(0, maxLines - 1), tail];
}

function renderDicePips(value: number, x: number, y: number, size: number, rolling: boolean) {
  const pips: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [
      [0.28, 0.28],
      [0.72, 0.72],
    ],
    3: [
      [0.26, 0.26],
      [0.5, 0.5],
      [0.74, 0.74],
    ],
    4: [
      [0.28, 0.28],
      [0.72, 0.28],
      [0.28, 0.72],
      [0.72, 0.72],
    ],
    5: [
      [0.26, 0.26],
      [0.74, 0.26],
      [0.5, 0.5],
      [0.26, 0.74],
      [0.74, 0.74],
    ],
    6: [
      [0.28, 0.24],
      [0.72, 0.24],
      [0.28, 0.5],
      [0.72, 0.5],
      [0.28, 0.76],
      [0.72, 0.76],
    ],
  };

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={10}
        fill="#ffffff"
        stroke={rolling ? '#f97316' : '#94a3b8'}
        strokeWidth={rolling ? 3.5 : 2.5}
      />
      {(pips[value] || pips[1]).map(([px, py], i) => (
        <circle
          key={i}
          cx={x + px * size}
          cy={y + py * size}
          r={size * 0.1}
          fill={value === 1 ? '#ec4899' : '#0f172a'}
        />
      ))}
    </g>
  );
}

export const CashflowBoard: React.FC<CashflowBoardProps> = ({
  roomState,
  language,
  localPlayerId,
  onSelectDealDeck,
  onAnimationChange,
}) => {
  const [inspectedSpace, setInspectedSpace] = useState<string | null>(null);

  // Visual animation state for stationary Dice (fast -> slow -> stop) + Step-by-step Pawn Walk
  const [displayDice, setDisplayDice] = useState<number[]>(roomState.lastDiceRoll);
  const [isRollingDice, setIsRollingDice] = useState(false);
  const [displayPositions, setDisplayPositions] = useState<
    Record<string, { track: 'rat_race' | 'fast_track'; position: number }>
  >(() => {
    const init: Record<string, { track: 'rat_race' | 'fast_track'; position: number }> = {};
    roomState.players.forEach((p) => {
      init[p.id] = { track: p.track, position: p.position };
    });
    return init;
  });

  const prevServerPositionsRef = useRef<
    Record<string, { track: 'rat_race' | 'fast_track'; position: number }>
  >({});
  const prevSeqRef = useRef<number>(roomState.diceRollSeq);
  const timersRef = useRef<number[]>([]);
  const onAnimRef = useRef(onAnimationChange);
  onAnimRef.current = onAnimationChange;

  const clearAnimTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => {
    const prevMap = prevServerPositionsRef.current;

    if (Object.keys(prevMap).length === 0) {
      const snap: Record<string, { track: 'rat_race' | 'fast_track'; position: number }> = {};
      roomState.players.forEach((p) => {
        snap[p.id] = { track: p.track, position: p.position };
      });
      prevServerPositionsRef.current = snap;
      prevSeqRef.current = roomState.diceRollSeq;
      setDisplayPositions(snap);
      setDisplayDice(roomState.lastDiceRoll);
      onAnimRef.current?.(false);
      return;
    }

    let movedPlayerId: string | null = null;
    let fromPos = 0;
    let toPos = 0;
    let moveTrack: 'rat_race' | 'fast_track' = 'rat_race';

    for (const p of roomState.players) {
      const prev = prevMap[p.id];
      if (!prev) continue;
      if (prev.track === p.track && prev.position !== p.position) {
        movedPlayerId = p.id;
        fromPos = prev.position;
        toPos = p.position;
        moveTrack = p.track;
        break;
      }
    }

    const nextSnap: Record<string, { track: 'rat_race' | 'fast_track'; position: number }> = {};
    roomState.players.forEach((p) => {
      nextSnap[p.id] = { track: p.track, position: p.position };
    });
    prevServerPositionsRef.current = nextSnap;

    const seqChanged = roomState.diceRollSeq !== prevSeqRef.current;
    prevSeqRef.current = roomState.diceRollSeq;

    if (!movedPlayerId && !seqChanged) {
      setDisplayPositions(nextSnap);
      setDisplayDice(roomState.lastDiceRoll);
      onAnimRef.current?.(false);
      return;
    }

    clearAnimTimers();
    onAnimRef.current?.(true);

    if (movedPlayerId) {
      setDisplayPositions({
        ...nextSnap,
        [movedPlayerId]: { track: moveTrack, position: fromPos },
      });
    } else {
      setDisplayPositions(nextSnap);
    }

    const targetDice = roomState.lastDiceRoll;

    // Phase 1: Stationary dice face changing from fast -> gradually slower -> stop
    const diceDelays = [40, 45, 55, 70, 95, 130, 175, 230, 300];
    let elapsed = 0;
    let lastFaces = targetDice.map(() => 1);
    setIsRollingDice(true);
    soundFX.diceRoll(targetDice.length);

    diceDelays.forEach((gap, idx) => {
      elapsed += gap;
      const tId = window.setTimeout(() => {
        const nextFaces = targetDice.map((_, dIdx) => {
          const prevVal = lastFaces[dIdx] || 1;
          let candidate = Math.floor(Math.random() * 6) + 1;
          if (candidate === prevVal) candidate = (candidate % 6) + 1;
          return candidate;
        });
        lastFaces = nextFaces;
        setDisplayDice(nextFaces);

        if (idx === diceDelays.length - 1) {
          const settleId = window.setTimeout(() => {
            setDisplayDice(targetDice);
            setIsRollingDice(false);
            soundFX.dice(targetDice.length);

            if (!movedPlayerId) {
              const doneId = window.setTimeout(() => {
                onAnimRef.current?.(false);
              }, 220);
              timersRef.current.push(doneId);
            }
          }, 260);
          timersRef.current.push(settleId);
        }
      }, elapsed);
      timersRef.current.push(tId);
    });

    // Phase 2: Step-by-step pawn walk (only if player moved — starts 0.5s after dice settle)
    if (movedPlayerId) {
      const totalSpaces = moveTrack === 'rat_race' ? RAT_RACE_SPACES.length : FAST_TRACK_SPACES.length;
      const stepCount = (toPos - fromPos + totalSpaces) % totalSpaces;
      const walkStart = elapsed + 260 + 500;
      const stepInterval = 340;

      for (let s = 1; s <= stepCount; s++) {
        const hopId = window.setTimeout(() => {
          const nextPos = (fromPos + s) % totalSpaces;
          setDisplayPositions((curr) => ({
            ...curr,
            [movedPlayerId!]: { track: moveTrack, position: nextPos },
          }));
          soundFX.step();

          if (s === stepCount) {
            const finishId = window.setTimeout(() => {
              onAnimRef.current?.(false);
            }, 220);
            timersRef.current.push(finishId);
          }
        }, walkStart + (s - 1) * stepInterval);
        timersRef.current.push(hopId);
      }

      if (stepCount === 0) {
        const finishId = window.setTimeout(() => {
          onAnimRef.current?.(false);
        }, walkStart + 180);
        timersRef.current.push(finishId);
      }

      const maxAnimMs = walkStart + Math.max(1, stepCount) * stepInterval + 900;
      const watchdogId = window.setTimeout(() => {
        setDisplayPositions(nextSnap);
        setDisplayDice(targetDice);
        setIsRollingDice(false);
        onAnimRef.current?.(false);
      }, maxAnimMs);
      timersRef.current.push(watchdogId);
    } else {
      const watchdogId = window.setTimeout(() => {
        setDisplayDice(targetDice);
        setIsRollingDice(false);
        onAnimRef.current?.(false);
      }, elapsed + 700);
      timersRef.current.push(watchdogId);
    }

    return () => {
      clearAnimTimers();
    };
  }, [roomState.players, roomState.lastDiceRoll, roomState.diceRollSeq]);

  const currentPlayer = roomState.players[roomState.currentTurnIndex];
  const localPlayer = roomState.players.find((p) => p.id === localPlayerId);
  const canPickDeck =
    roomState.phase === 'CHOOSE_DEAL_TYPE' && currentPlayer?.id === localPlayerId && onSelectDealDeck;
  const activeDeck = roomState.activeCard?.deck;
  const localDream = DREAM_OPTIONS.find((d) => d.id === localPlayer?.dreamId);

  const getPawnCoordinates = (playerIndex: number) => {
    const player = roomState.players[playerIndex];
    const visual = displayPositions[player.id] || {
      track: player.track,
      position: player.position,
    };

    const sameSpot = roomState.players.filter((p) => {
      const pv = displayPositions[p.id] || { track: p.track, position: p.position };
      return pv.track === visual.track && pv.position === visual.position;
    });
    const subIdx = sameSpot.findIndex((p) => p.id === player.id);
    const totalHere = sameSpot.length;

    let baseX = BOARD_CX;
    let baseY = BOARD_CY;

    if (visual.track === 'rat_race') {
      const angleDeg = RAT_RACE_START_ANGLE + visual.position * 15;
      const pt = polarToCartesian(BOARD_CX, BOARD_CY, 255, angleDeg);
      baseX = pt.x;
      baseY = pt.y;
    } else {
      const rect = getFastTrackRect(visual.position);
      baseX = rect.cx;
      baseY = rect.cy;
    }

    if (totalHere <= 1) return { x: baseX, y: baseY };
    const offsetAngle = (subIdx / totalHere) * Math.PI * 2;
    const offsetRadius = 15;
    return {
      x: baseX + Math.cos(offsetAngle) * offsetRadius,
      y: baseY + Math.sin(offsetAngle) * offsetRadius,
    };
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center select-none">
      <div className="w-full h-full max-h-[calc(100vh-100px)] flex items-center justify-center">
        <svg viewBox="0 0 1640 920" className="w-full h-full drop-shadow-xl">
          {/* Outer Board Frame */}
          <rect
            x="4"
            y="4"
            width="1632"
            height="912"
            rx="24"
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth="3"
          />

          {/* Fast Track Outer Perimeter (Exact 48 Spaces matching PDF Board) */}
          {FAST_TRACK_SPACES.map((space) => {
            const rect = getFastTrackRect(space.index);
            const isDreamMatch = Boolean(localPlayer?.dreamId && space.dreamId === localPlayer.dreamId);
            const colors = getFastTrackColors(space.type, isDreamMatch);
            const visualCurrent = currentPlayer
              ? displayPositions[currentPlayer.id] || {
                  track: currentPlayer.track,
                  position: currentPlayer.position,
                }
              : null;
            const isActivePos =
              visualCurrent?.track === 'fast_track' && visualCurrent.position === space.index;

            const isDreamSpace = space.type === 'dream';
            const maxChars = rect.isCorner ? 11 : rect.isSide ? 17 : 10;
            const lines = isDreamSpace
              ? [space.label[language]]
              : wrapLabelLines(space.label[language], maxChars, rect.isSide ? 2 : 3);
            const longestLine = Math.max(...lines.map((l) => visualLength(l)), 0);
            const dreamTitleLen = visualLength(space.label[language]);
            const fontSize = rect.isCorner
              ? 18
              : isDreamSpace
              ? rect.isSide
                ? dreamTitleLen > 14
                  ? 12.2
                  : 13.5
                : dreamTitleLen >= 15
                ? 9.2
                : dreamTitleLen >= 13
                ? 10
                : dreamTitleLen >= 11
                ? 10.8
                : 11.5
              : rect.isSide
              ? 14
              : longestLine > 10
              ? 11
              : 12;
            const lineH = rect.isSide ? 16 : 14.5;
            const hasSub = Boolean(space.subLabel || space.cashFlow);
            const totalTextH = lines.length * lineH + (hasSub ? 17 : 0);
            const startY = rect.cy - totalTextH / 2 + lineH / 2;
            const dreamGap = rect.isSide ? 17 : 18;

            return (
              <g
                key={`ft_${space.index}`}
                className="cursor-pointer"
                onClick={() =>
                  setInspectedSpace(
                    `Fast Track #${space.index + 1}: ${space.label[language]}${
                      space.subLabel ? ` (${space.subLabel[language]})` : ''
                    }${space.cost ? ` · ${space.cost.toLocaleString()} ฿` : ''}`
                  )
                }
              >
                <rect
                  x={rect.x + 1.5}
                  y={rect.y + 1.5}
                  width={rect.w - 3}
                  height={rect.h - 3}
                  rx="8"
                  fill={colors.fill}
                  stroke={isDreamMatch ? '#0f172a' : colors.stroke}
                  strokeWidth={isDreamMatch ? 4.5 : 1.5}
                />

                {isDreamMatch && (
                  <rect
                    x={rect.x + 4.5}
                    y={rect.y + 4.5}
                    width={rect.w - 9}
                    height={rect.h - 9}
                    rx="5"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="1.5"
                    strokeDasharray="3 2"
                  />
                )}

                {isActivePos && (
                  <rect
                    x={rect.x + 0.5}
                    y={rect.y + 0.5}
                    width={rect.w - 1}
                    height={rect.h - 1}
                    rx="9"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="3.5"
                  />
                )}

                {rect.isCorner ? (
                  <>
                    <text
                      x={rect.cx}
                      y={rect.cy - 11}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={colors.text}
                      fontSize="18"
                      fontWeight="900"
                    >
                      CASHFLOW
                    </text>
                    <text
                      x={rect.cx}
                      y={rect.cy + 13}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={colors.sub}
                      fontSize="16"
                      fontWeight="800"
                    >
                      DAY
                    </text>
                  </>
                ) : (
                  <>
                    {isDreamSpace ? (
                      <>
                        <text
                          x={rect.cx}
                          y={rect.cy - dreamGap}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={colors.text}
                          fontSize={fontSize}
                          fontWeight="800"
                        >
                          {space.label[language]}
                        </text>
                        <text
                          x={rect.cx}
                          y={rect.cy}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={colors.sub}
                          fontSize={
                            rect.isSide
                              ? 11.5
                              : space.subLabel && visualLength(space.subLabel[language]) > 14
                              ? 9.2
                              : 10
                          }
                          fontWeight="700"
                        >
                          {space.subLabel?.[language] || ''}
                        </text>
                        {space.cost && (
                          <text
                            x={rect.cx}
                            y={rect.cy + dreamGap}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#fef08a"
                            fontSize={rect.isSide ? 12 : 10.5}
                            fontWeight="800"
                          >
                            {space.cost.toLocaleString()} ฿
                          </text>
                        )}
                      </>
                    ) : (
                      <>
                        {lines.map((ln, idx) => (
                          <text
                            key={idx}
                            x={rect.cx}
                            y={startY + idx * lineH}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={colors.text}
                            fontSize={fontSize}
                            fontWeight="800"
                          >
                            {ln}
                          </text>
                        ))}

                        {space.subLabel && (
                          <text
                            x={rect.cx}
                            y={startY + lines.length * lineH + 3}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={colors.sub}
                            fontSize={
                              rect.isSide
                                ? 12
                                : visualLength(space.subLabel[language]) > 14
                                ? 9.4
                                : 10.4
                            }
                            fontWeight="700"
                          >
                            {space.subLabel[language]}
                          </text>
                        )}
                      </>
                    )}

                    {isDreamMatch && (
                      <g>
                        <circle cx={rect.x + rect.w - 12} cy={rect.y + 12} r="8.5" fill="#0f172a" />
                        <text
                          x={rect.x + rect.w - 12}
                          y={rect.y + 12.5}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#facc15"
                          fontSize="12.5"
                          fontWeight="900"
                        >
                          ★
                        </text>
                      </g>
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* Left & Right Wing Board Notes centered cleanly in the white space */}
          <g>
            <text
              x="355"
              y="176"
              textAnchor="middle"
              fill="#0f172a"
              fontSize="24"
              fontWeight="800"
            >
              {language === 'th' ? 'เป้าหมายชนะสนามแข่งหนู' : 'RAT RACE GOAL'}
            </text>
            <text
              x="355"
              y="212"
              textAnchor="middle"
              fill="#059669"
              fontSize="21"
              fontWeight="700"
            >
              {language === 'th' ? 'รายได้จากทรัพย์สิน > รายจ่ายรวม' : 'Passive > Total Expenses'}
            </text>

            <text
              x="355"
              y="708"
              textAnchor="middle"
              fill="#0f172a"
              fontSize="24"
              fontWeight="800"
            >
              {language === 'th' ? 'เป้าหมายชนะเส้นทางเศรษฐี' : 'FAST TRACK WIN'}
            </text>
            <text
              x="355"
              y="744"
              textAnchor="middle"
              fill="#7c3aed"
              fontSize="21"
              fontWeight="700"
            >
              {language === 'th' ? '+500,000 ฿/ด. หรือ ซื้อความฝัน' : '+500k/mo or Buy Your Dream'}
            </text>
          </g>

          <g>
            <text
              x="1285"
              y="172"
              textAnchor="middle"
              fill="#0f172a"
              fontSize="24"
              fontWeight="800"
            >
              {language === 'th' ? 'ความฝันของคุณ' : 'YOUR DREAM'}
            </text>
            <text
              x="1285"
              y="208"
              textAnchor="middle"
              fill="#db2777"
              fontSize="21"
              fontWeight="800"
            >
              ★ {localDream ? localDream.name[language].slice(0, 26) : '-'}
            </text>
            {localDream && (
              <text
                x="1285"
                y="240"
                textAnchor="middle"
                fill="#475569"
                fontSize="20.5"
                fontFamily="IBM Plex Mono, monospace"
                fontWeight="700"
              >
                {localDream.cost.toLocaleString()} ฿
              </text>
            )}
          </g>

          {/* Inner Board Ring Background */}
          <circle
            cx={BOARD_CX}
            cy={BOARD_CY}
            r="324"
            fill="#e2e8f0"
            stroke="#cbd5e1"
            strokeWidth="2.5"
          />

          {/* Rat Race 24 Spaces */}
          {RAT_RACE_SPACES.map((space: RatRaceSpace) => {
            const centerAngle = RAT_RACE_START_ANGLE + space.index * 15;
            const normAngle = ((centerAngle % 360) + 360) % 360;
            const startAngle = centerAngle - 7.5;
            const endAngle = centerAngle + 7.5;
            const path = describeAnnularSector(BOARD_CX, BOARD_CY, 194, 316, startAngle, endAngle);
            const colors = RAT_SPACE_COLORS[space.type];

            const visualCurrent = currentPlayer
              ? displayPositions[currentPlayer.id] || {
                  track: currentPlayer.track,
                  position: currentPlayer.position,
                }
              : null;
            const isActivePos =
              visualCurrent?.track === 'rat_race' && visualCurrent.position === space.index;

            const labelPos = polarToCartesian(BOARD_CX, BOARD_CY, 274, centerAngle);
            const numPos = polarToCartesian(BOARD_CX, BOARD_CY, 212, centerAngle);
            let textRotation = centerAngle + 90;
            if (normAngle > 0 && normAngle < 180) {
              textRotation = centerAngle - 90;
            }

            return (
              <g
                key={`rr_${space.index}`}
                className="cursor-pointer"
                onClick={() =>
                  setInspectedSpace(`Rat Race #${space.index + 1}: ${space.label[language]}`)
                }
              >
                <path
                  d={path}
                  fill={colors.fill}
                  stroke={isActivePos ? '#0f172a' : '#ffffff'}
                  strokeWidth={isActivePos ? 4 : 2.5}
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={colors.text}
                  fontSize="15.5"
                  fontWeight="800"
                  transform={`rotate(${textRotation}, ${labelPos.x}, ${labelPos.y})`}
                >
                  {space.label[language]}
                </text>
                <text
                  x={numPos.x}
                  y={numPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={space.type === 'payday' ? 'rgba(15,23,42,0.82)' : 'rgba(255,255,255,0.92)'}
                  fontSize="13"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="700"
                >
                  {space.index + 1}
                </text>
              </g>
            );
          })}

          {/* Center Arena (4 Card Decks + Dice) */}
          <circle
            cx={BOARD_CX}
            cy={BOARD_CY}
            r="186"
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth="3"
          />

          <text
            x={BOARD_CX}
            y="313"
            textAnchor="middle"
            fill="#0f172a"
            fontSize="24"
            fontWeight="900"
            letterSpacing="2"
          >
            CASHFLOW
          </text>

          {/* 4 Card Decks in Center */}
          {/* Top-Left: โอกาสเล็ก */}
          <g
            onClick={() => canPickDeck && onSelectDealDeck('small_deal')}
            className={canPickDeck ? 'cursor-pointer' : ''}
          >
            <rect
              x={BOARD_CX - 146}
              y="336"
              width="138"
              height="70"
              rx="14"
              fill="#10b981"
              stroke={canPickDeck || activeDeck === 'small_deal' ? '#0f172a' : '#059669'}
              strokeWidth={canPickDeck || activeDeck === 'small_deal' ? 4 : 2}
            />
            <text
              x={BOARD_CX - 77}
              y="371"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#ffffff"
              fontSize="21.5"
              fontWeight="800"
            >
              {language === 'th' ? 'โอกาสเล็ก' : 'Small Deal'}
            </text>
          </g>

          {/* Top-Right: โอกาสใหญ่ */}
          <g
            onClick={() => canPickDeck && onSelectDealDeck('big_deal')}
            className={canPickDeck ? 'cursor-pointer' : ''}
          >
            <rect
              x={BOARD_CX + 8}
              y="336"
              width="138"
              height="70"
              rx="14"
              fill="#059669"
              stroke={canPickDeck || activeDeck === 'big_deal' ? '#0f172a' : '#047857'}
              strokeWidth={canPickDeck || activeDeck === 'big_deal' ? 4 : 2}
            />
            <text
              x={BOARD_CX + 77}
              y="371"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#ffffff"
              fontSize="21.5"
              fontWeight="800"
            >
              {language === 'th' ? 'โอกาสใหญ่' : 'Big Deal'}
            </text>
          </g>

          {/* Bottom-Left: ซื้อขาย */}
          <g>
            <rect
              x={BOARD_CX - 146}
              y="514"
              width="138"
              height="70"
              rx="14"
              fill="#0ea5e9"
              stroke={activeDeck === 'market' ? '#0f172a' : '#0284c7'}
              strokeWidth={activeDeck === 'market' ? 4 : 2}
            />
            <text
              x={BOARD_CX - 77}
              y="549"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#ffffff"
              fontSize="21.5"
              fontWeight="800"
            >
              {language === 'th' ? 'ซื้อขาย' : 'Market'}
            </text>
          </g>

          {/* Bottom-Right: จ่ายซะ (Pink) */}
          <g>
            <rect
              x={BOARD_CX + 8}
              y="514"
              width="138"
              height="70"
              rx="14"
              fill="#ec4899"
              stroke={activeDeck === 'doodad' ? '#0f172a' : '#db2777'}
              strokeWidth={activeDeck === 'doodad' ? 4 : 2}
            />
            <text
              x={BOARD_CX + 77}
              y="549"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#ffffff"
              fontSize="21.5"
              fontWeight="800"
            >
              {language === 'th' ? 'จ่ายซะ' : 'Doodads'}
            </text>
          </g>

          {/* Center Dice Display (Supports 1, 2, or 3 Dice with tumble animation) */}
          {displayDice.length <= 1 ? (
            renderDicePips(displayDice[0] || 1, BOARD_CX - 30, BOARD_CY - 30, 60, isRollingDice)
          ) : displayDice.length === 2 ? (
            <>
              {renderDicePips(displayDice[0] || 1, BOARD_CX - 64, BOARD_CY - 28, 56, isRollingDice)}
              {renderDicePips(displayDice[1] || 1, BOARD_CX + 8, BOARD_CY - 28, 56, isRollingDice)}
            </>
          ) : (
            <>
              {renderDicePips(displayDice[0] || 1, BOARD_CX - 90, BOARD_CY - 25, 50, isRollingDice)}
              {renderDicePips(displayDice[1] || 1, BOARD_CX - 25, BOARD_CY - 25, 50, isRollingDice)}
              {renderDicePips(displayDice[2] || 1, BOARD_CX + 40, BOARD_CY - 25, 50, isRollingDice)}
            </>
          )}

          {/* Player Pawns */}
          {roomState.players.map((p, idx) => {
            const coords = getPawnCoordinates(idx);
            const isCurrent = idx === roomState.currentTurnIndex && !p.isBankrupt;
            return (
              <g
                key={p.id}
                opacity={p.isBankrupt ? 0.38 : 1}
                style={{
                  transform: `translate(${coords.x}px, ${coords.y}px)`,
                  transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                {isCurrent && (
                  <circle
                    r="22"
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="3"
                    strokeDasharray="4 3"
                  />
                )}
                {p.isBankrupt && (
                  <circle
                    r="20"
                    fill="none"
                    stroke="#e11d48"
                    strokeWidth="2.5"
                    strokeDasharray="3 2"
                  />
                )}
                <circle r="16" fill={p.color} stroke="#ffffff" strokeWidth="3" />
                <text
                  y="0.5"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#ffffff"
                  fontSize="15"
                  fontWeight="800"
                >
                  {p.isBot ? 'B' : idx + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Inspected Space Bar (only shown when hovering/inspecting a space) */}
      {inspectedSpace && (
        <div className="w-full max-w-[1640px] mt-1 flex items-center justify-end text-xs px-2">
          <div className="text-emerald-700 font-semibold truncate max-w-[420px]">{inspectedSpace}</div>
        </div>
      )}
    </div>
  );
};
