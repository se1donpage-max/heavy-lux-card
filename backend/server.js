const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
  "https://se1donpage-max.github.io",
  "https://heavy-lux-card.onrender.com"
];

app.use(cors({
  origin: true,
  methods: ["GET", "POST"]
}));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Heavy Lux Card multiplayer server",
    version: "2.0.0"
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, players: io.engine.clientsCount });
});

const rooms = new Map();

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
  { name: "6", value: 6 },
  { name: "7", value: 7 },
  { name: "8", value: 8 },
  { name: "9", value: 9 },
  { name: "10", value: 10 },
  { name: "В", value: 11 },
  { name: "Д", value: 12 },
  { name: "К", value: 13 },
  { name: "Т", value: 14 }
];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck() {
  let id = 0;
  return shuffle(SUITS.flatMap(suit =>
    RANKS.map(rank => ({
      id: `c${id++}`,
      suit,
      rank: rank.name,
      value: rank.value
    }))
  ));
}

function isTrump(game, card) {
  return card && card.suit === game.trumpSuit;
}

function canBeat(game, attack, defense) {
  if (!attack || !defense) return false;

  if (isTrump(game, defense) && !isTrump(game, attack)) return true;
  if (!isTrump(game, defense) && isTrump(game, attack)) return false;

  return attack.suit === defense.suit && defense.value > attack.value;
}

function tableRanks(game) {
  const ranks = [];
  for (const p of game.table) {
    ranks.push(p.attack.rank);
    if (p.defense) ranks.push(p.defense.rank);
  }
  return ranks;
}

function canAdd(game, card) {
  if (!card || game.table.length >= game.limit) return false;
  if (game.table.length === 0) return true;
  return tableRanks(game).includes(card.rank);
}

function firstUnbeaten(game) {
  return game.table.findIndex(p => !p.defense);
}

function allBeaten(game) {
  return game.table.length > 0 && firstUnbeaten(game) === -1;
}

function publicGame(game) {
  return {
    id: game.id,
    status: game.status,
    turn: game.turn,
    defender: game.defender,
    trumpSuit: game.trumpSuit,
    deckCount: game.deck.length,
    limit: game.limit,
    table: game.table,
    players: {
      [game.players[0].id]: {
        id: game.players[0].id,
        name: game.players[0].name,
        cards: game.players[0].hand.length
      },
      [game.players[1].id]: {
        id: game.players[1].id,
        name: game.players[1].name,
        cards: game.players[1].hand.length
      }
    }
  };
}

function emitGame(game) {
  for (const p of game.players) {
    io.to(p.id).emit("game_state", {
      ...publicGame(game),
      you: p.id,
      hand: p.hand
    });
  }
}

function playerById(game, id) {
  return game.players.find(p => p.id === id);
}

function opponent(game, id) {
  return game.players.find(p => p.id !== id);
}

function deal(game) {
  for (let n = 0; n < 6; n++) {
    for (const p of game.players) {
      if (game.deck.length) p.hand.push(game.deck.shift());
    }
  }
}

function refill(game) {
  const order = [game.turn, game.defender];

  for (const role of order) {
    const id = role;
    const p = playerById(game, id);
    if (!p) continue;

    while (p.hand.length < 6 && game.deck.length) {
      p.hand.push(game.deck.shift());
    }
  }
}

function finishIfEmpty(game) {
  if (game.deck.length !== 0) return false;

  const empty = game.players.filter(p => p.hand.length === 0);

  if (empty.length === 2) {
    game.status = "finished";
    game.winner = null;
    return true;
  }

  if (empty.length === 1) {
    game.status = "finished";
    game.winner = empty[0].id;
    return true;
  }

  return false;
}

function nextRoundAfterTake(game, defenderId) {
  const attackerId = game.turn;
  game.table = [];
  refill(game);

  if (finishIfEmpty(game)) return;

  game.turn = attackerId;
  game.defender = defenderId;
  game.limit = playerById(game, defenderId).hand.length;
}

function nextRoundAfterBeat(game) {
  const oldAttacker = game.turn;
  const oldDefender = game.defender;

  game.table = [];
  refill(game);

  if (finishIfEmpty(game)) return;

  game.turn = oldDefender;
  game.defender = oldAttacker;
  game.limit = playerById(game, oldAttacker).hand.length;
}

function chooseFirstAttacker(game) {
  const a = game.players[0];
  const b = game.players[1];

  const at = a.hand.filter(c => isTrump(game, c)).sort((x,y)=>x.value-y.value);
  const bt = b.hand.filter(c => isTrump(game, c)).sort((x,y)=>x.value-y.value);

  if (at.length && bt.length) return at[0].value <= bt[0].value ? a.id : b.id;
  if (at.length) return a.id;
  if (bt.length) return b.id;

  return Math.min(...a.hand.map(c=>c.value)) <= Math.min(...b.hand.map(c=>c.value))
    ? a.id : b.id;
}

function makeGame(p1, p2) {
  const game = {
    id: Math.random().toString(36).slice(2, 10),
    status: "playing",
    players: [p1, p2],
    deck: createDeck(),
    trumpSuit: null,
    table: [],
    turn: null,
    defender: null,
    limit: 6,
    winner: null
  };

  game.trumpSuit = game.deck[game.deck.length - 1].suit;
  deal(game);

  game.turn = chooseFirstAttacker(game);
  game.defender = opponent(game, game.turn).id;
  game.limit = playerById(game, game.defender).hand.length;

  return game;
}

function removeCard(player, cardId) {
  const i = player.hand.findIndex(c => c.id === cardId);
  if (i === -1) return null;
  return player.hand.splice(i, 1)[0];
}

function resetRoom(roomId) {
  rooms.delete(roomId);
}

io.on("connection", socket => {
  socket.on("create_room", ({ name } = {}) => {
    const cleanName = String(name || "Игрок").slice(0, 24);

    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();

    socket.join(roomId);
    socket.data.roomId = roomId;

    const waiting = {
      id: socket.id,
      name: cleanName,
      hand: []
    };

    rooms.set(roomId, {
      waiting,
      game: null
    });

    socket.emit("room_created", { roomId });
    socket.emit("waiting", { roomId });
  });

  socket.on("join_room", ({ roomId, name } = {}) => {
    const id = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(id);

    if (!room || !room.waiting) {
      socket.emit("room_error", "Комната не найдена");
      return;
    }

    const cleanName = String(name || "Игрок").slice(0, 24);

    const p1 = room.waiting;
    const p2 = {
      id: socket.id,
      name: cleanName,
      hand: []
    };

    const game = makeGame(p1, p2);
    room.game = game;
    room.waiting = null;

    socket.join(id);
    socket.data.roomId = id;

    io.to(id).emit("game_started", { roomId: id });
    emitGame(game);
  });

  socket.on("start_random", ({ name } = {}) => {
    const cleanName = String(name || "Игрок").slice(0, 24);

    let roomEntry = null;

    for (const [roomId, room] of rooms) {
      if (room.waiting) {
        roomEntry = [roomId, room];
        break;
      }
    }

    if (roomEntry) {
      const [roomId, room] = roomEntry;
      const p1 = room.waiting;
      const p2 = { id: socket.id, name: cleanName, hand: [] };

      const game = makeGame(p1, p2);
      room.game = game;
      room.waiting = null;

      socket.join(roomId);
      socket.data.roomId = roomId;

      io.to(roomId).emit("game_started", { roomId });
      emitGame(game);
    } else {
      const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();

      socket.join(roomId);
      socket.data.roomId = roomId;

      rooms.set(roomId, {
        waiting: {
          id: socket.id,
          name: cleanName,
          hand: []
        },
        game: null
      });

      socket.emit("room_created", { roomId });
      socket.emit("waiting", { roomId });
    }
  });

  socket.on("attack", ({ cardId } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const game = room && room.game;
    if (!game || game.status !== "playing") return;
    if (game.turn !== socket.id) return;

    const player = playerById(game, socket.id);
    const card = player && player.hand.find(c => c.id === cardId);
    if (!card || !canAdd(game, card)) return;

    removeCard(player, card.id);
    game.table.push({ attack: card, defense: null });
    game.defender = opponent(game, socket.id).id;
    game.limit = playerById(game, game.defender).hand.length;

    emitGame(game);
  });

  socket.on("defend", ({ cardId } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const game = room && room.game;
    if (!game || game.status !== "playing") return;
    if (game.defender !== socket.id) return;

    const idx = firstUnbeaten(game);
    if (idx < 0) return;

    const player = playerById(game, socket.id);
    const card = player && player.hand.find(c => c.id === cardId);
    if (!card) return;

    if (!canBeat(game, game.table[idx].attack, card)) return;

    removeCard(player, card.id);
    game.table[idx].defense = card;

    emitGame(game);
  });

  socket.on("take", () => {
    const room = rooms.get(socket.data.roomId);
    const game = room && room.game;
    if (!game || game.status !== "playing") return;
    if (game.defender !== socket.id) return;

    const player = playerById(game, socket.id);

    for (const pair of game.table) {
      player.hand.push(pair.attack);
      if (pair.defense) player.hand.push(pair.defense);
    }

    nextRoundAfterTake(game, socket.id);
    emitGame(game);
  });

  socket.on("beat", () => {
    const room = rooms.get(socket.data.roomId);
    const game = room && room.game;
    if (!game || game.status !== "playing") return;
    if (game.turn !== socket.id) return;
    if (!allBeaten(game)) return;

    nextRoundAfterBeat(game);
    emitGame(game);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    if (room.waiting && room.waiting.id === socket.id) {
      rooms.delete(roomId);
      return;
    }

    if (room.game) {
      const other = opponent(room.game, socket.id);

      if (other) {
        io.to(other.id).emit("opponent_left");
      }

      rooms.delete(roomId);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Heavy Lux Card server listening on ${PORT}`);
});
