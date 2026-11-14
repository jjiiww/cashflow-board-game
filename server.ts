import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server, Socket } from 'socket.io';
import { GameRoom } from './server/gameRoom';
import { Language } from './shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 20000,
  pingTimeout: 120000,
  connectTimeout: 45000,
});

const rooms = new Map<string, GameRoom>();
const socketToPlayer = new Map<string, { roomCode: string; playerId: string }>();

function ensureSocketMembership(socket: Socket, roomCode: string, playerId?: string): GameRoom | null {
  const code = roomCode?.trim().toUpperCase();
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) {
    socket.emit('room:error', {
      th: 'ไม่พบห้องเกมนี้แล้ว กรุณากลับหน้าหลักเพื่อสร้างหรือเข้าห้องใหม่',
      en: 'Game room no longer exists. Please return home to create or join a room.',
    });
    return null;
  }
  if (playerId) {
    const isHost = room.state.hostId === playerId;
    const player = room.state.players.find((p) => p.id === playerId);
    if (isHost || player) {
      if (!socket.rooms.has(code)) {
        socket.join(code);
      }
      socketToPlayer.set(socket.id, { roomCode: code, playerId });
      if (player && !player.connected) {
        player.connected = true;
      }
    }
  }
  return room;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function broadcastRoom(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit('room:state', room.state);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

app.get('/api/rooms/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    res.status(404).json({ exists: false });
    return;
  }
  res.json({
    exists: true,
    playerCount: room.state.players.length,
    phase: room.state.phase,
  });
});

io.on('connection', (socket: Socket) => {
  socket.on(
    'room:create',
    ({
      playerId,
      playerName,
      language = 'th',
      botCount = 0,
      adminPlays = false,
      adminPassword = '',
    }: {
      playerId: string;
      playerName: string;
      language?: Language;
      botCount?: number;
      adminPlays?: boolean;
      adminPassword?: string;
    }) => {
      if (!adminPlays && adminPassword !== 'Bradley') {
        socket.emit('room:error', {
          th: 'รหัสผ่าน Admin ไม่ถูกต้อง กรุณากรอกรหัสผ่านให้ถูกต้อง',
          en: 'Incorrect Admin password. Please enter the valid password.',
        });
        return;
      }

      const code = generateRoomCode();
      const safeName = playerName?.trim() || (adminPlays ? 'Player 1' : 'Admin');
      const isSoloMode = Boolean(adminPlays);
      const room = new GameRoom(
        code,
        playerId,
        language,
        () => broadcastRoom(code),
        safeName,
        !adminPlays,
        isSoloMode
      );

      if (adminPlays) {
        room.addPlayer(playerId, safeName, true);
      }

      const maxBots = adminPlays ? 5 : 6;
      const defaultBots = adminPlays ? Math.max(1, botCount) : botCount;
      const safeBots = Math.min(maxBots, Math.max(0, Math.floor(defaultBots)));
      for (let i = 0; i < safeBots; i++) {
        room.addBot(playerId);
      }

      rooms.set(code, room);
      socketToPlayer.set(socket.id, { roomCode: code, playerId });
      socket.join(code);

      socket.emit('room:joined', { roomCode: code, playerId, state: room.state });
      broadcastRoom(code);
    }
  );

  socket.on(
    'room:join',
    ({
      roomCode,
      playerId,
      playerName,
    }: {
      roomCode: string;
      playerId: string;
      playerName: string;
    }) => {
      const code = roomCode.trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        socket.emit('room:error', {
          th: 'ไม่พบรหัสห้องนี้ กรุณาตรวจสอบรหัสอีกครั้ง',
          en: 'Room code not found. Please check the code.',
        });
        return;
      }

      // Idempotent reconnect check for non-playing Admin Host
      if (room.state.isAdminSpectator && room.state.hostId === playerId) {
        socketToPlayer.set(socket.id, { roomCode: code, playerId });
        socket.join(code);
        socket.emit('room:joined', { roomCode: code, playerId, state: room.state });
        broadcastRoom(code);
        return;
      }

      // Idempotent reconnect check for existing player
      const existing = room.state.players.find((p) => p.id === playerId);
      if (existing) {
        existing.connected = true;
        socketToPlayer.set(socket.id, { roomCode: code, playerId });
        socket.join(code);
        socket.emit('room:joined', { roomCode: code, playerId, state: room.state });
        broadcastRoom(code);
        return;
      }

      const res = room.addPlayer(playerId, playerName, false);
      if (!res.success) {
        socket.emit('room:error', res.error);
        return;
      }

      socketToPlayer.set(socket.id, { roomCode: code, playerId });
      socket.join(code);
      socket.emit('room:joined', { roomCode: code, playerId, state: room.state });
      broadcastRoom(code);
    }
  );

  socket.on('room:ping', ({ roomCode, playerId }: { roomCode: string; playerId?: string }) => {
    const code = roomCode?.trim().toUpperCase();
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    if (playerId && !socket.rooms.has(code)) {
      ensureSocketMembership(socket, code, playerId);
      socket.emit('room:state', room.state);
    }
  });

  socket.on('room:sync', ({ roomCode, playerId }: { roomCode: string; playerId?: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    socket.emit('room:state', room.state);
  });

  socket.on('room:add_bot', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    const res = room.addBot(playerId);
    if (!res.success && res.error) {
      socket.emit('room:error', res.error);
      return;
    }
    broadcastRoom(room.state.roomCode);
  });

  socket.on(
    'room:remove_player',
    ({ roomCode, requesterId, targetId }: { roomCode: string; requesterId: string; targetId: string }) => {
      const room = ensureSocketMembership(socket, roomCode, requesterId);
      if (!room) return;
      if (room.removePlayer(requesterId, targetId).success) {
        broadcastRoom(room.state.roomCode);
      }
    }
  );

  socket.on(
    'room:assign_career',
    ({ roomCode, playerId, careerId }: { roomCode: string; playerId: string; careerId: string }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      if (room.assignCareer(playerId, careerId).success) {
        broadcastRoom(room.state.roomCode);
      }
    }
  );

  socket.on(
    'room:assign_dream',
    ({ roomCode, playerId, dreamId }: { roomCode: string; playerId: string; dreamId: string }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      if (room.assignDream(playerId, dreamId).success) {
        broadcastRoom(room.state.roomCode);
      }
    }
  );

  socket.on(
    'player:customize',
    ({
      roomCode,
      requesterId,
      targetId,
      avatarId,
      color,
    }: {
      roomCode: string;
      requesterId: string;
      targetId: string;
      avatarId?: string;
      color?: string;
    }) => {
      const room = ensureSocketMembership(socket, roomCode, requesterId);
      if (!room) return;
      const res = room.customizePlayer(requesterId, targetId, avatarId, color);
      if (!res.success) {
        if (res.error) socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(room.state.roomCode);
    }
  );

  socket.on('room:language', ({ roomCode, language }: { roomCode: string; language: Language }) => {
    const room = ensureSocketMembership(socket, roomCode);
    if (!room) return;
    room.setLanguage(language);
    broadcastRoom(room.state.roomCode);
  });

  socket.on('game:start', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    const res = room.startGame(playerId);
    if (!res.success && res.error) {
      socket.emit('room:error', res.error);
      return;
    }
    broadcastRoom(room.state.roomCode);
  });

  socket.on(
    'game:roll_dice',
    ({ roomCode, playerId, diceCount = 1 }: { roomCode: string; playerId: string; diceCount?: number }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      const res = room.rollDice(playerId, diceCount);
      if (!res.success) {
        if (res.error) socket.emit('room:error', res.error);
        socket.emit('room:state', room.state);
        return;
      }
      broadcastRoom(room.state.roomCode);
    }
  );

  socket.on(
    'game:choose_deal_type',
    ({ roomCode, playerId, deckType }: { roomCode: string; playerId: string; deckType: 'small_deal' | 'big_deal' }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      if (room.chooseDealType(playerId, deckType).success) {
        broadcastRoom(room.state.roomCode);
      } else {
        socket.emit('room:state', room.state);
      }
    }
  );

  socket.on(
    'game:buy_deal',
    ({ roomCode, playerId, shareQuantity = 1 }: { roomCode: string; playerId: string; shareQuantity?: number }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      const res = room.buyDeal(playerId, shareQuantity);
      if (!res.success) {
        if (res.error) socket.emit('room:error', res.error);
        socket.emit('room:state', room.state);
        return;
      }
      broadcastRoom(room.state.roomCode);
    }
  );

  socket.on(
    'game:sell_stock',
    ({ roomCode, playerId, shareQuantity }: { roomCode: string; playerId: string; shareQuantity: number }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      const res = room.sellStock(playerId, shareQuantity);
      if (!res.success) {
        if (res.error) socket.emit('room:error', res.error);
        socket.emit('room:state', room.state);
        return;
      }
      broadcastRoom(room.state.roomCode);
    }
  );

  socket.on('game:skip_stock_sell', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    if (room.skipStockSell(playerId).success) {
      broadcastRoom(room.state.roomCode);
    } else {
      socket.emit('room:state', room.state);
    }
  });

  socket.on('game:pass_deal', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    if (room.passDeal(playerId).success) {
      broadcastRoom(room.state.roomCode);
    } else {
      socket.emit('room:state', room.state);
    }
  });

  socket.on(
    'game:start_auction',
    ({ roomCode, playerId, startingBid = 1000 }: { roomCode: string; playerId: string; startingBid?: number }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      const res = room.startAuction(playerId, startingBid);
      if (!res.success) {
        if (res.error) socket.emit('room:error', res.error);
        socket.emit('room:state', room.state);
        return;
      }
      broadcastRoom(room.state.roomCode);
    }
  );

  socket.on(
    'game:place_bid',
    ({ roomCode, playerId, amount }: { roomCode: string; playerId: string; amount: number }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      const res = room.placeBid(playerId, amount);
      if (!res.success) {
        if (res.error) socket.emit('room:error', res.error);
        socket.emit('room:state', room.state);
        return;
      }
      broadcastRoom(room.state.roomCode);
    }
  );

  socket.on('game:pass_auction', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    if (room.passAuction(playerId).success) {
      broadcastRoom(room.state.roomCode);
    } else {
      socket.emit('room:state', room.state);
    }
  });

  socket.on('game:close_auction', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    if (room.closeAuction(playerId).success) {
      broadcastRoom(room.state.roomCode);
    } else {
      socket.emit('room:state', room.state);
    }
  });

  socket.on(
    'game:market_respond',
    ({ roomCode, playerId, sellAssetIds }: { roomCode: string; playerId: string; sellAssetIds: string[] }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      if (room.respondToMarket(playerId, sellAssetIds).success) {
        broadcastRoom(room.state.roomCode);
      } else {
        socket.emit('room:state', room.state);
      }
    }
  );

  socket.on('game:pay_doodad', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    const res = room.payDoodad(playerId);
    if (!res.success) {
      if (res.error) socket.emit('room:error', res.error);
      socket.emit('room:state', room.state);
      return;
    }
    broadcastRoom(room.state.roomCode);
  });

  socket.on(
    'game:decide_charity',
    ({ roomCode, playerId, donate }: { roomCode: string; playerId: string; donate: boolean }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      const res = room.decideCharity(playerId, donate);
      if (!res.success) {
        if (res.error) socket.emit('room:error', res.error);
        socket.emit('room:state', room.state);
        return;
      }
      broadcastRoom(room.state.roomCode);
    }
  );

  socket.on('game:choose_dream', ({ roomCode, playerId, dreamId }: { roomCode: string; playerId: string; dreamId: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    if (room.chooseDream(playerId, dreamId).success) {
      broadcastRoom(room.state.roomCode);
    } else {
      socket.emit('room:state', room.state);
    }
  });

  socket.on(
    'game:decide_fast_track',
    ({ roomCode, playerId, buy }: { roomCode: string; playerId: string; buy: boolean }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      const res = room.decideFastTrackSpace(playerId, buy);
      if (!res.success) {
        if (res.error) socket.emit('room:error', res.error);
        socket.emit('room:state', room.state);
        return;
      }
      broadcastRoom(room.state.roomCode);
    }
  );

  socket.on(
    'game:take_loan',
    ({ roomCode, playerId, amount }: { roomCode: string; playerId: string; amount: number }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      const res = room.takeLoan(playerId, amount);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(room.state.roomCode);
    }
  );

  socket.on(
    'game:repay_loan',
    ({ roomCode, playerId, amount }: { roomCode: string; playerId: string; amount: number }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      const res = room.repayBankLoan(playerId, amount);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(room.state.roomCode);
    }
  );

  socket.on(
    'game:payoff_liability',
    ({
      roomCode,
      playerId,
      key,
    }: {
      roomCode: string;
      playerId: string;
      key:
        | 'homeMortgageBalance'
        | 'schoolLoanBalance'
        | 'carLoanBalance'
        | 'creditCardBalance'
        | 'otherDebtBalance';
    }) => {
      const room = ensureSocketMembership(socket, roomCode, playerId);
      if (!room) return;
      const res = room.payOffLiability(playerId, key);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(room.state.roomCode);
    }
  );

  socket.on('game:end_turn', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    if (room.endTurn(playerId).success) {
      broadcastRoom(room.state.roomCode);
    } else {
      socket.emit('room:state', room.state);
    }
  });

  socket.on('game:next_bot_step', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    if (room.nextBotStep(playerId).success) {
      broadcastRoom(room.state.roomCode);
    } else {
      socket.emit('room:state', room.state);
    }
  });

  socket.on('game:close', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = ensureSocketMembership(socket, roomCode, playerId);
    if (!room) return;
    const code = room.state.roomCode;
    if (room.state.hostId !== playerId) {
      socket.emit('room:error', {
        th: 'เฉพาะผู้ดูแลห้องหรือผู้สร้างเกมเท่านั้นที่สามารถปิดเกมได้',
        en: 'Only the Admin or room creator can close the game.',
      });
      return;
    }
    io.to(code).emit('room:closed');
    room.destroy();
    rooms.delete(code);
  });

  socket.on('disconnect', () => {
    const info = socketToPlayer.get(socket.id);
    if (info) {
      socketToPlayer.delete(socket.id);
      const stillConnectedElsewhere = Array.from(socketToPlayer.values()).some(
        (entry) => entry.roomCode === info.roomCode && entry.playerId === info.playerId
      );
      if (!stillConnectedElsewhere) {
        const room = rooms.get(info.roomCode);
        if (room) {
          const player = room.state.players.find((p) => p.id === info.playerId);
          if (player) {
            player.connected = false;
            broadcastRoom(info.roomCode);
          }
        }
      }
    }
  });
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Cashflow Board Online server listening on http://localhost:${PORT}`);
  });
}

startServer();
