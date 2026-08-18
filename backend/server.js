const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.get("/", (req, res) => {
    res.json({
        status: "ok",
        game: "Heavy Lux Card",
        mode: "online",
        players: getOnlinePlayers()
    });
});

/* =========================================================
   CARD DATA
========================================================= */

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

/* =========================================================
   GLOBAL STATE
========================================================= */

const rooms = new Map();
const waitingPlayers = [];

let nextRoomId = 1;

/* =========================================================
   HELPERS
========================================================= */

function createDeck() {
    const deck = [];
    let id = 0;

    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({
                id: `card_${id++}`,
                suit,
                rank: rank.name,
                value: rank.value
            });
        }
    }

    return shuffle(deck);
}

function shuffle(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [result[i], result[j]] =
            [result[j], result[i]];
    }

    return result;
}

function isTrump(card, game) {
    return card && card.suit === game.trumpSuit;
}

function canBeat(attack, defense, game) {
    if (!attack || !defense) {
        return false;
    }

    const attackTrump = isTrump(attack, game);
    const defenseTrump = isTrump(defense, game);

    if (!attackTrump && defenseTrump) {
        return true;
    }

    if (attackTrump && !defenseTrump) {
        return false;
    }

    return (
        attack.suit === defense.suit &&
        defense.value > attack.value
    );
}

function removeCard(hand, cardId) {
    const index = hand.findIndex(
        card => card.id === cardId
    );

    if (index === -1) {
        return null;
    }

    return hand.splice(index, 1)[0];
}

function getPlayer(game, socketId) {
    if (game.players.player.socketId === socketId) {
        return game.players.player;
    }

    if (
        game.players.defender &&
        game.players.defender.socketId === socketId
    ) {
        return game.players.defender;
    }

    return null;
}

function getOpponent(game, socketId) {
    if (game.players.player.socketId === socketId) {
        return game.players.defender;
    }

    return game.players.player;
}

function getAttacker(game) {
    return game.players[game.attacker];
}

function getDefender(game) {
    return game.players[game.defender];
}

function getTableRanks(game) {
    const ranks = [];

    for (const pair of game.table) {
        ranks.push(pair.attack.rank);

        if (pair.defense) {
            ranks.push(pair.defense.rank);
        }
    }

    return ranks;
}

function canAddCard(game, card) {
    if (!card) {
        return false;
    }

    if (game.table.length >= game.attackLimit) {
        return false;
    }

    if (game.table.length === 0) {
        return true;
    }

    return getTableRanks(game).includes(card.rank);
}

function getFirstUnbeaten(game) {
    for (let i = 0; i < game.table.length; i++) {
        if (!game.table[i].defense) {
            return i;
        }
    }

    return -1;
}

function allBeaten(game) {
    return (
        game.table.length > 0 &&
        getFirstUnbeaten(game) === -1
    );
}

/* =========================================================
   FIRST ATTACKER
========================================================= */

function determineFirstAttacker(game) {
    const player =
        game.players.player;

    const defender =
        game.players.defender;

    const playerTrumps =
        player.hand
            .filter(card => isTrump(card, game))
            .sort((a, b) => a.value - b.value);

    const defenderTrumps =
        defender.hand
            .filter(card => isTrump(card, game))
            .sort((a, b) => a.value - b.value);

    if (
        playerTrumps.length &&
        defenderTrumps.length
    ) {
        return (
            playerTrumps[0].value <=
            defenderTrumps[0].value
        )
            ? "player"
            : "defender";
    }

    if (playerTrumps.length) {
        return "player";
    }

    if (defenderTrumps.length) {
        return "defender";
    }

    const playerMin =
        Math.min(
            ...player.hand.map(c => c.value)
        );

    const defenderMin =
        Math.min(
            ...defender.hand.map(c => c.value)
        );

    return playerMin <= defenderMin
        ? "player"
        : "defender";
}

/* =========================================================
   GAME CREATION
========================================================= */

function createGame(socket1, socket2) {
    const roomId =
        `room_${nextRoomId++}`;

    const deck = createDeck();

    const game = {
        roomId,

        deck,

        trumpSuit:
            deck[deck.length - 1].suit,

        table: [],

        attacker: null,
        defender: null,

        attackLimit: 6,

        status: "playing",

        players: {
            player: {
                socketId: socket1.id,
                name: socket1.playerName || "Игрок 1",
                hand: []
            },

            defender: {
                socketId: socket2.id,
                name: socket2.playerName || "Игрок 2",
                hand: []
            }
        }
    };

    rooms.set(roomId, game);

    socket1.join(roomId);
    socket2.join(roomId);

    dealInitial(game);

    game.attacker =
        determineFirstAttacker(game);

    game.defender =
        game.attacker === "player"
            ? "defender"
            : "player";

    game.attackLimit =
        game.players[game.defender].hand.length;

    return game;
}

/* =========================================================
   DEAL
========================================================= */

function dealInitial(game) {
    for (let i = 0; i < 6; i++) {
        for (const role of ["player", "defender"]) {
            if (game.deck.length <= 1) {
                return;
            }

            game.players[role].hand.push(
                game.deck.shift()
            );
        }
    }
}

/* =========================================================
   REFILL
========================================================= */

function refillHands(game) {
    const attacker =
        getAttacker(game);

    const defender =
        getDefender(game);

    while (
        attacker.hand.length < 6 &&
        game.deck.length > 0
    ) {
        attacker.hand.push(
            game.deck.shift()
        );
    }

    while (
        defender.hand.length < 6 &&
        game.deck.length > 0
    ) {
        defender.hand.push(
            game.deck.shift()
        );
    }
}

/* =========================================================
   PUBLIC GAME STATE
========================================================= */

function publicState(game, socketId) {
    const me =
        getPlayer(game, socketId);

    const opponent =
        getOpponent(game, socketId);

    if (!me || !opponent) {
        return null;
    }

    const myRole =
        game.players.player.socketId === socketId
            ? "player"
            : "defender";

    return {
        roomId: game.roomId,

        status: game.status,

        role: myRole,

        turn:
            game.attacker === myRole
                ? "attack"
                : "defense",

        attacker: game.attacker,
        defender: game.defender,

        trumpSuit: game.trumpSuit,

        deckCount:
            game.deck.length,

        attackLimit:
            game.attackLimit,

        table:
            game.table.map(pair => ({
                attack: pair.attack,
                defense: pair.defense
            })),

        hand: me.hand,

        opponent: {
            name: opponent.name,
            count: opponent.hand.length
        },

        playerName: me.name,

        winner:
            game.winner || null
    };
}

function sendState(game) {
    for (const role of ["player", "defender"]) {
        const player =
            game.players[role];

        io.to(player.socketId).emit(
            "game_state",
            publicState(
                game,
                player.socketId
            )
        );
    }
}

/* =========================================================
   MESSAGE
========================================================= */

function sendError(socket, message) {
    socket.emit(
        "game_error",
        {
            message
        }
    );
}

/* =========================================================
   GAME OVER
========================================================= */

function checkGameOver(game) {
    if (game.deck.length > 0) {
        return false;
    }

    const player =
        game.players.player;

    const defender =
        game.players.defender;

    if (
        player.hand.length === 0 &&
        defender.hand.length === 0
    ) {
        game.status = "finished";
        game.winner = "draw";

        return true;
    }

    if (player.hand.length === 0) {
        game.status = "finished";
        game.winner = player.socketId;

        return true;
    }

    if (defender.hand.length === 0) {
        game.status = "finished";
        game.winner = defender.socketId;

        return true;
    }

    return false;
}

/* =========================================================
   FINISH ROUND
========================================================= */

function finishSuccessfulRound(game) {
    if (!allBeaten(game)) {
        return false;
    }

    game.table = [];

    refillHands(game);

    if (checkGameOver(game)) {
        return true;
    }

    const oldAttacker =
        game.attacker;

    game.attacker =
        game.defender;

    game.defender =
        oldAttacker;

    game.attackLimit =
        game.players[
            game.defender
        ].hand.length;

    sendState(game);

    return true;
}

/* =========================================================
   PLAYER ATTACK
========================================================= */

function handleAttack(socket, cardId) {
    const roomId =
        socket.roomId;

    const game =
        rooms.get(roomId);

    if (!game) {
        return;
    }

    const player =
        getPlayer(game, socket.id);

    if (!player) {
        return;
    }

    const role =
        game.players.player.socketId === socket.id
            ? "player"
            : "defender";

    if (game.status !== "playing") {
        return;
    }

    if (game.attacker !== role) {
        sendError(
            socket,
            "Сейчас не твой ход."
        );

        return;
    }

    const card =
        player.hand.find(
            c => c.id === cardId
        );

    if (!card) {
        sendError(
            socket,
            "Карта не найдена."
        );

        return;
    }

    if (!canAddCard(game, card)) {
        sendError(
            socket,
            "Эту карту нельзя подкинуть."
        );

        return;
    }

    removeCard(
        player.hand,
        cardId
    );

    game.table.push({
        attack: card,
        defense: null
    });

    game.attackLimit =
        Math.min(
            6,
            game.players[
                game.defender
            ].hand.length
        );

    sendState(game);
}

/* =========================================================
   PLAYER DEFENSE
========================================================= */

function handleDefense(socket, cardId) {
    const roomId =
        socket.roomId;

    const game =
        rooms.get(roomId);

    if (!game) {
        return;
    }

    const defender =
        getPlayer(game, socket.id);

    if (!defender) {
        return;
    }

    const role =
        game.players.player.socketId === socket.id
            ? "player"
            : "defender";

    if (game.defender !== role) {
        sendError(
            socket,
            "Ты не защищающийся."
        );

        return;
    }

    const index =
        getFirstUnbeaten(game);

    if (index === -1) {
        return;
    }

    const card =
        defender.hand.find(
            c => c.id === cardId
        );

    if (!card) {
        sendError(
            socket,
            "Карта не найдена."
        );

        return;
    }

    const attack =
        game.table[index].attack;

    if (!canBeat(attack, card, game)) {
        sendError(
            socket,
            "Этой картой нельзя побить."
        );

        return;
    }

    removeCard(
        defender.hand,
        cardId
    );

    game.table[index].defense =
        card;

    sendState(game);
}

/* =========================================================
   TAKE
========================================================= */

function handleTake(socket) {
    const game =
        rooms.get(socket.roomId);

    if (!game) {
        return;
    }

    const role =
        game.players.player.socketId === socket.id
            ? "player"
            : "defender";

    if (game.defender !== role) {
        sendError(
            socket,
            "Сейчас нельзя брать карты."
        );

        return;
    }

    if (allBeaten(game)) {
        sendError(
            socket,
            "Все карты уже отбиты."
        );

        return;
    }

    const defender =
        game.players[role];

    for (const pair of game.table) {
        defender.hand.push(pair.attack);

        if (pair.defense) {
            defender.hand.push(pair.defense);
        }
    }

    game.table = [];

    refillHands(game);

    if (checkGameOver(game)) {
        sendState(game);
        return;
    }

    /*
        Защищающийся забирает карты.
        Атакующий сохраняет право атаки.
    */

    game.attackLimit =
        Math.min(
            6,
            game.players[
                game.defender
            ].hand.length
        );

    sendState(game);
}

/* =========================================================
   BITO
========================================================= */

function handleBeatOff(socket) {
    const game =
        rooms.get(socket.roomId);

    if (!game) {
        return;
    }

    const role =
        game.players.player.socketId === socket.id
            ? "player"
            : "defender";

    if (game.attacker !== role) {
        sendError(
            socket,
            "Только атакующий может завершить атаку."
        );

        return;
    }

    if (!allBeaten(game)) {
        sendError(
            socket,
            "Не все карты отбиты."
        );

        return;
    }

    finishSuccessfulRound(game);
}

/* =========================================================
   CONNECTION
========================================================= */

io.on("connection", socket => {
    console.log(
        "Connected:",
        socket.id
    );

    socket.emit(
        "connected",
        {
            socketId: socket.id
        }
    );

    /* =====================================================
       SET PLAYER
    ===================================================== */

    socket.on(
        "set_player",
        data => {

            socket.playerName =
                String(
                    data?.name ||
                    "Игрок"
                ).slice(0, 30);

            socket.emit(
                "player_ready",
                {
                    name: socket.playerName
                }
            );
        }
    );

    /* =====================================================
       FIND GAME
    ===================================================== */

    socket.on(
        "find_game",
        () => {

            if (socket.roomId) {
                return;
            }

            /*
                Удаляем отключившиеся сокеты
                из очереди.
            */

            for (
                let i = waitingPlayers.length - 1;
                i >= 0;
                i--
            ) {
                if (
                    !waitingPlayers[i].connected
                ) {
                    waitingPlayers.splice(i, 1);
                }
            }

            /*
                Если никого нет —
                становимся первым игроком.
            */

            if (waitingPlayers.length === 0) {

                waitingPlayers.push(socket);

                socket.emit(
                    "waiting",
                    {
                        message:
                            "Ищем соперника..."
                    }
                );

                console.log(
                    "Waiting:",
                    socket.id
                );

                return;
            }

            /*
                Берём первого ожидающего.
            */

            const opponent =
                waitingPlayers.shift();

            if (
                !opponent ||
                !opponent.connected
            ) {
                waitingPlayers.push(socket);

                socket.emit(
                    "waiting",
                    {
                        message:
                            "Ищем соперника..."
                    }
                );

                return;
            }

            const game =
                createGame(
                    opponent,
                    socket
                );

            opponent.roomId =
                game.roomId;

            socket.roomId =
                game.roomId;

            opponent.emit(
                "game_found"
            );

            socket.emit(
                "game_found"
            );

            sendState(game);

            console.log(
                "Game started:",
                game.roomId
            );
        }
    );

    /* =====================================================
       PLAY CARD
    ===================================================== */

    socket.on(
        "play_card",
        data => {

            const game =
                rooms.get(
                    socket.roomId
                );

            if (!game) {
                return;
            }

            const role =
                game.players.player.socketId === socket.id
                    ? "player"
                    : "defender";

            if (
                game.attacker === role
            ) {
                handleAttack(
                    socket,
                    data?.cardId
                );
            } else if (
                game.defender === role
            ) {
                handleDefense(
                    socket,
                    data?.cardId
                );
            }
        }
    );

    /* =====================================================
       TAKE
    ===================================================== */

    socket.on(
        "take_cards",
        () => {
            handleTake(socket);
        }
    );

    /* =====================================================
       BITO
    ===================================================== */

    socket.on(
        "beat_off",
        () => {
            handleBeatOff(socket);
        }
    );

    /* =====================================================
       DISCONNECT
    ===================================================== */

    socket.on(
        "disconnect",
        () => {

            console.log(
                "Disconnected:",
                socket.id
            );

            /*
                Удаляем из очереди.
            */

            const waitingIndex =
                waitingPlayers.indexOf(socket);

            if (waitingIndex !== -1) {
                waitingPlayers.splice(
                    waitingIndex,
                    1
                );
            }

            /*
                Если игрок был в игре —
                уведомляем соперника.
            */

            if (!socket.roomId) {
                return;
            }

            const game =
                rooms.get(
                    socket.roomId
                );

            if (!game) {
                return;
            }

            game.status =
                "opponent_left";

            const opponent =
                getOpponent(
                    game,
                    socket.id
                );

            if (opponent) {
                io.to(
                    opponent.socketId
                ).emit(
                    "opponent_left"
                );
            }

            rooms.delete(
                socket.roomId
            );
        }
    );
});

/* =========================================================
   STATS
========================================================= */

function getOnlinePlayers() {
    return io.sockets.sockets.size;
}

/* =========================================================
   START
========================================================= */

server.listen(
    PORT,
    () => {

        console.log(
            `Heavy Lux Card server started on port ${PORT}`
        );

    }
);
