const express = require("express");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");

const { Server } = require("socket.io");

const GAME_CONFIG = require("./config/game");

const {
  createWallet
} = require("./systems/economy");

const {
  getTitle
} = require("./systems/economy");

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

app.use(cors());
app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

const PORT =
  process.env.PORT || 3000;

/*
=========================================================
GLOBAL STATE
=========================================================
*/

const players = new Map();

const rooms = new Map();

/*
=========================================================
PLAYER
=========================================================
*/

function createPlayer(id, nickname) {
  const wallet = createWallet();

  return {
    id,

    nickname:
      nickname ||
      `Игрок ${id.slice(0, 4)}`,

    balance: wallet.balance,

    xp: 0,

    level: 1,

    stats: {
      games: 0,
      wins: 0,
      losses: 0
    },

    cars: [],

    properties: [],

    businesses: [],

    plates: [],

    activeRoomId: null,

    socketId: null,

    connected: true,

    createdAt: Date.now()
  };
}

/*
=========================================================
API
=========================================================
*/

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    game: GAME_CONFIG.GAME_NAME,
    players: players.size,
    rooms: rooms.size,
    uptime: process.uptime()
  });
});

app.get("/api/profile/:id", (req, res) => {
  const player =
    players.get(req.params.id);

  if (!player) {
    return res.status(404).json({
      error: "Игрок не найден"
    });
  }

  res.json({
    id: player.id,
    nickname: player.nickname,
    balance: player.balance,
    xp: player.xp,
    level: player.level,
    title: getTitle(player.level),
    stats: player.stats,
    cars: player.cars,
    properties: player.properties,
    businesses: player.businesses,
    plates: player.plates
  });
});

/*
=========================================================
SOCKET
=========================================================
*/

io.on("connection", socket => {
  console.log(
    `[SOCKET] connected ${socket.id}`
  );

  socket.on("auth", data => {
    try {
      const nickname =
        typeof data?.nickname === "string"
          ? data.nickname.trim().slice(0, 24)
          : "";

      const requestedId =
        typeof data?.playerId === "string"
          ? data.playerId
          : null;

      let player = null;

      if (
        requestedId &&
        players.has(requestedId)
      ) {
        player =
          players.get(requestedId);

        player.connected = true;
        player.socketId = socket.id;
      } else {
        const playerId =
          crypto.randomUUID();

        player =
          createPlayer(
            playerId,
            nickname
          );

        player.socketId =
          socket.id;

        players.set(
          playerId,
          player
        );
      }

      socket.playerId =
        player.id;

      socket.emit(
        "auth_success",
        {
          player: {
            id: player.id,
            nickname: player.nickname,
            balance: player.balance,
            xp: player.xp,
            level: player.level,
            title: getTitle(player.level)
          }
        }
      );

      console.log(
        `[AUTH] ${player.nickname} (${player.id})`
      );

    } catch (error) {
      console.error(
        "[AUTH ERROR]",
        error
      );

      socket.emit(
        "error_message",
        {
          message:
            "Ошибка авторизации"
        }
      );
    }
  });

  socket.on("disconnect", () => {
    const playerId =
      socket.playerId;

    if (!playerId) {
      return;
    }

    const player =
      players.get(playerId);

    if (!player) {
      return;
    }

    player.connected = false;

    player.socketId = null;

    console.log(
      `[SOCKET] disconnected ${player.nickname}`
    );

    /*
     * ВАЖНО:
     * игрок не удаляется сразу.
     *
     * Это основа нормального reconnect.
     */

    setTimeout(() => {
      const current =
        players.get(playerId);

      if (!current) {
        return;
      }

      if (
        !current.connected &&
        !current.activeRoomId
      ) {
        players.delete(playerId);
      }
    }, GAME_CONFIG.RECONNECT_GRACE_MS);
  });
});

/*
=========================================================
START
=========================================================
*/

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Heavy Lux Card running on port ${PORT}`
    );
  }
);
