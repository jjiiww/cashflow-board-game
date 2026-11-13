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
});

const rooms = new Map<string, GameRoom>();
const socketToPlayer = new Map<string, { roomCode: string; playerId: string }>();

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
    }: {
      playerId: string;
      playerName: string;
      language?: Language;
      botCount?: number;
    }) => {
      const code = generateRoomCode();
      const room = new GameRoom(code, playerId, language, () => broadcastRoom(code));
      room.addPlayer(playerId, playerName, true);

      const safeBots = Math.min(5, Math.max(0, Math.floor(botCount)));
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

      // Idempotent reconnect check
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

  socket.on('room:add_bot', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const res = room.addBot(playerId);
    if (!res.success && res.error) {
      socket.emit('room:error', res.error);
      return;
    }
    broadcastRoom(roomCode);
  });

  socket.on(
    'room:remove_player',
    ({ roomCode, requesterId, targetId }: { roomCode: string; requesterId: string; targetId: string }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      if (room.removePlayer(requesterId, targetId).success) {
        broadcastRoom(roomCode);
      }
    }
  );

  socket.on(
    'room:assign_career',
    ({ roomCode, playerId, careerId }: { roomCode: string; playerId: string; careerId: string }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      if (room.assignCareer(playerId, careerId).success) {
        broadcastRoom(roomCode);
      }
    }
  );

  socket.on(
    'room:assign_dream',
    ({ roomCode, playerId, dreamId }: { roomCode: string; playerId: string; dreamId: string }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      if (room.assignDream(playerId, dreamId).success) {
        broadcastRoom(roomCode);
      }
    }
  );

  socket.on('room:language', ({ roomCode, language }: { roomCode: string; language: Language }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.setLanguage(language);
    broadcastRoom(roomCode);
  });

  socket.on('game:start', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const res = room.startGame(playerId);
    if (!res.success && res.error) {
      socket.emit('room:error', res.error);
      return;
    }
    broadcastRoom(roomCode);
  });

  socket.on(
    'game:roll_dice',
    ({ roomCode, playerId, diceCount = 1 }: { roomCode: string; playerId: string; diceCount?: number }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const res = room.rollDice(playerId, diceCount);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(roomCode);
    }
  );

  socket.on(
    'game:choose_deal_type',
    ({ roomCode, playerId, deckType }: { roomCode: string; playerId: string; deckType: 'small_deal' | 'big_deal' }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      if (room.chooseDealType(playerId, deckType).success) {
        broadcastRoom(roomCode);
      }
    }
  );

  socket.on(
    'game:buy_deal',
    ({ roomCode, playerId, shareQuantity = 1 }: { roomCode: string; playerId: string; shareQuantity?: number }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const res = room.buyDeal(playerId, shareQuantity);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(roomCode);
    }
  );

  socket.on(
    'game:sell_stock',
    ({ roomCode, playerId, shareQuantity }: { roomCode: string; playerId: string; shareQuantity: number }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const res = room.sellStock(playerId, shareQuantity);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(roomCode);
    }
  );

  socket.on('game:skip_stock_sell', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.skipStockSell(playerId).success) {
      broadcastRoom(roomCode);
    }
  });

  socket.on('game:pass_deal', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.passDeal(playerId).success) {
      broadcastRoom(roomCode);
    }
  });

  socket.on(
    'game:start_auction',
    ({ roomCode, playerId, startingBid = 1000 }: { roomCode: string; playerId: string; startingBid?: number }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const res = room.startAuction(playerId, startingBid);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(roomCode);
    }
  );

  socket.on(
    'game:place_bid',
    ({ roomCode, playerId, amount }: { roomCode: string; playerId: string; amount: number }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const res = room.placeBid(playerId, amount);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(roomCode);
    }
  );

  socket.on('game:pass_auction', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.passAuction(playerId).success) {
      broadcastRoom(roomCode);
    }
  });

  socket.on('game:close_auction', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.closeAuction(playerId).success) {
      broadcastRoom(roomCode);
    }
  });

  socket.on(
    'game:market_respond',
    ({ roomCode, playerId, sellAssetIds }: { roomCode: string; playerId: string; sellAssetIds: string[] }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      if (room.respondToMarket(playerId, sellAssetIds).success) {
        broadcastRoom(roomCode);
      }
    }
  );

  socket.on('game:pay_doodad', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const res = room.payDoodad(playerId);
    if (!res.success && res.error) {
      socket.emit('room:error', res.error);
      return;
    }
    broadcastRoom(roomCode);
  });

  socket.on(
    'game:decide_charity',
    ({ roomCode, playerId, donate }: { roomCode: string; playerId: string; donate: boolean }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const res = room.decideCharity(playerId, donate);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(roomCode);
    }
  );

  socket.on('game:choose_dream', ({ roomCode, playerId, dreamId }: { roomCode: string; playerId: string; dreamId: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.chooseDream(playerId, dreamId).success) {
      broadcastRoom(roomCode);
    }
  });

  socket.on(
    'game:decide_fast_track',
    ({ roomCode, playerId, buy }: { roomCode: string; playerId: string; buy: boolean }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const res = room.decideFastTrackSpace(playerId, buy);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(roomCode);
    }
  );

  socket.on(
    'game:take_loan',
    ({ roomCode, playerId, amount }: { roomCode: string; playerId: string; amount: number }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const res = room.takeLoan(playerId, amount);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(roomCode);
    }
  );

  socket.on(
    'game:repay_loan',
    ({ roomCode, playerId, amount }: { roomCode: string; playerId: string; amount: number }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const res = room.repayBankLoan(playerId, amount);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(roomCode);
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
      const room = rooms.get(roomCode);
      if (!room) return;
      const res = room.payOffLiability(playerId, key);
      if (!res.success && res.error) {
        socket.emit('room:error', res.error);
        return;
      }
      broadcastRoom(roomCode);
    }
  );

  socket.on('game:end_turn', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.endTurn(playerId).success) {
      broadcastRoom(roomCode);
    }
  });

  socket.on('game:next_bot_step', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.nextBotStep(playerId).success) {
      broadcastRoom(roomCode);
    }
  });

  socket.on('disconnect', () => {
    const info = socketToPlayer.get(socket.id);
    if (info) {
      const room = rooms.get(info.roomCode);
      if (room) {
        const player = room.state.players.find((p) => p.id === info.playerId);
        if (player) {
          player.connected = false;
          broadcastRoom(info.roomCode);
        }
      }
      socketToPlayer.delete(socket.id);
    }
  });
});

async function startServer() {
  const PORT = 3000;

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
