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

/* =========================================================
   CONFIG
========================================================= */

const START_MONEY = 10000;
const START_LEVEL = 1;

const TABLES = {
    100: {
        name: "НОВИЧОК",
        bet: 100
    },
    500: {
        name: "СТАНДАРТ",
        bet: 500
    },
    2000: {
        name: "ВЫСОКИЙ",
        bet: 2000
    },
    10000: {
        name: "VIP",
        bet: 10000
    }
};

/* =========================================================
   PLAYERS
========================================================= */

const players = new Map();

/*
player:

{
    id,
    name,
    avatar,
    money,
    level,
    exp,
    wins,
    losses,
    games
}
*/

/* =========================================================
   ROOMS
========================================================= */

const rooms = new Map();

/*
room:

{
    id,
    bet,
    bank,
    players: {
        socketId: {
            socketId,
            playerId,
            name,
            hand: []
        }
    },

    deck: [],
    trumpSuit: null,
    table: [],

    attacker: socketId,
    defender: socketId,

    phase: "waiting",

    winner: null
}
*/

/* =========================================================
   CARDS
========================================================= */

const SUITS = [
    "♠",
    "♥",
    "♦",
    "♣"
];

const RANKS = [
    {
        name: "6",
        value: 6
    },
    {
        name: "7",
        value: 7
    },
    {
        name: "8",
        value: 8
    },
    {
        name: "9",
        value: 9
    },
    {
        name: "10",
        value: 10
    },
    {
        name: "В",
        value: 11
    },
    {
        name: "Д",
        value: 12
    },
    {
        name: "К",
        value: 13
    },
    {
        name: "Т",
        value: 14
    }
];

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

    for (
        let i = result.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() * (i + 1)
            );

        [
            result[i],
            result[j]
        ] = [
            result[j],
            result[i]
        ];
    }

    return result;
}

/* =========================================================
   PLAYER
========================================================= */

function getPlayer(socketId) {

    if (!players.has(socketId)) {

        players.set(socketId, {
            id: socketId,
            name: "Игрок",
            avatar: "",
            money: START_MONEY,
            level: START_LEVEL,
            exp: 0,
            wins: 0,
            losses: 0,
            games: 0
        });
    }

    return players.get(socketId);
}

/* =========================================================
   SAFE PLAYER
========================================================= */

function publicPlayer(player) {

    return {
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        money: player.money,
        level: player.level,
        exp: player.exp,
        wins: player.wins,
        losses: player.losses,
        games: player.games
    };
}

/* =========================================================
   ROOM ID
========================================================= */

function generateRoomId() {

    return Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();
}

/* =========================================================
   FIND OPEN ROOM
========================================================= */

function findWaitingRoom(bet) {

    for (const room of rooms.values()) {

        if (
            room.bet === bet &&
            Object.keys(room.players).length === 1 &&
            room.phase === "waiting"
        ) {

            return room;
        }
    }

    return null;
}

/* =========================================================
   CREATE ROOM
========================================================= */

function createRoom(socket, bet) {

    const player = getPlayer(socket.id);

    if (player.money < bet) {

        socket.emit("error_message", {
            message: "Недостаточно HC"
        });

        return null;
    }

    player.money -= bet;

    const room = {

        id: generateRoomId(),

        bet,

        bank: bet,

        players: {},

        deck: [],

        trumpSuit: null,

        table: [],

        attacker: null,

        defender: null,

        phase: "waiting",

        winner: null
    };

    room.players[socket.id] = {

        socketId: socket.id,

        playerId: player.id,

        name: player.name,

        hand: []
    };

    rooms.set(
        room.id,
        room
    );

    socket.join(room.id);

    socket.roomId = room.id;

    return room;
}

/* =========================================================
   JOIN ROOM
========================================================= */

function joinRoom(socket, room) {

    const player = getPlayer(socket.id);

    if (player.money < room.bet) {

        socket.emit("error_message", {
            message: "Недостаточно HC"
        });

        return false;
    }

    player.money -= room.bet;

    room.bank += room.bet;

    room.players[socket.id] = {

        socketId: socket.id,

        playerId: player.id,

        name: player.name,

        hand: []
    };

    socket.join(room.id);

    socket.roomId = room.id;

    return true;
}

/* =========================================================
   START GAME
========================================================= */

function startGame(room) {

    const socketIds =
        Object.keys(room.players);

    if (socketIds.length !== 2) {
        return;
    }

    room.deck =
        createDeck();

    const trump =
        room.deck[room.deck.length - 1];

    room.trumpSuit =
        trump.suit;

    room.table = [];

    const p1 =
        room.players[socketIds[0]];

    const p2 =
        room.players[socketIds[1]];

    p1.hand = [];
    p2.hand = [];

    for (let i = 0; i < 6; i++) {

        p1.hand.push(
            room.deck.shift()
        );

        p2.hand.push(
            room.deck.shift()
        );
    }

    /*
        Определяем первого атакующего
        по младшему козырю.
    */

    const p1Trumps =
        p1.hand
            .filter(
                card =>
                    card.suit ===
                    room.trumpSuit
            )
            .sort(
                (a, b) =>
                    a.value - b.value
            );

    const p2Trumps =
        p2.hand
            .filter(
                card =>
                    card.suit ===
                    room.trumpSuit
            )
            .sort(
                (a, b) =>
                    a.value - b.value
            );

    let attacker;

    if (
        p1Trumps.length &&
        p2Trumps.length
    ) {

        attacker =
            p1Trumps[0].value <=
            p2Trumps[0].value
                ? socketIds[0]
                : socketIds[1];

    } else if (p1Trumps.length) {

        attacker =
            socketIds[0];

    } else if (p2Trumps.length) {

        attacker =
            socketIds[1];

    } else {

        const p1Min =
            Math.min(
                ...p1.hand.map(
                    c => c.value
                )
            );

        const p2Min =
            Math.min(
                ...p2.hand.map(
                    c => c.value
                )
            );

        attacker =
            p1Min <= p2Min
                ? socketIds[0]
                : socketIds[1];
    }

    room.attacker =
        attacker;

    room.defender =
        attacker === socketIds[0]
            ? socketIds[1]
            : socketIds[0];

    room.phase =
        "attack";

    refillHands(room);

    broadcastRoom(room);
}

/* =========================================================
   REFILL
========================================================= */

function refillHands(room) {

    const ids =
        Object.keys(room.players);

    /*
        Сначала атакующий.
    */

    const order = [
        room.attacker,
        room.defender
    ];

    for (const socketId of order) {

        const player =
            room.players[socketId];

        while (
            player.hand.length < 6 &&
            room.deck.length > 0
        ) {

            player.hand.push(
                room.deck.shift()
            );
        }
    }
}

/* =========================================================
   TRUMP
========================================================= */

function isTrump(room, card) {

    return (
        card &&
        card.suit ===
        room.trumpSuit
    );
}

/* =========================================================
   CAN BEAT
========================================================= */

function canBeat(
    room,
    attack,
    defense
) {

    if (!attack || !defense) {
        return false;
    }

    const attackTrump =
        isTrump(room, attack);

    const defenseTrump =
        isTrump(room, defense);

    if (
        defenseTrump &&
        !attackTrump
    ) {
        return true;
    }

    if (
        attackTrump &&
        !defenseTrump
    ) {
        return false;
    }

    return (
        attack.suit === defense.suit &&
        defense.value > attack.value
    );
}

/* =========================================================
   TABLE RANKS
========================================================= */

function tableRanks(room) {

    const ranks = [];

    for (
        const pair of room.table
    ) {

        ranks.push(
            pair.attack.rank
        );

        if (pair.defense) {

            ranks.push(
                pair.defense.rank
            );
        }
    }

    return ranks;
}

/* =========================================================
   CAN ADD
========================================================= */

function canAdd(
    room,
    card
) {

    if (!card) {
        return false;
    }

    if (
        room.table.length >=
        room.players[
            room.defender
        ].hand.length
    ) {

        return false;
    }

    if (
        room.table.length === 0
    ) {

        return true;
    }

    return tableRanks(room)
        .includes(card.rank);
}

/* =========================================================
   FIND CARD
========================================================= */

function findCard(
    player,
    cardId
) {

    return player.hand.find(
        card =>
            card.id === cardId
    );
}

/* =========================================================
   REMOVE CARD
========================================================= */

function removeCard(
    player,
    cardId
) {

    const index =
        player.hand.findIndex(
            card =>
                card.id === cardId
        );

    if (index === -1) {
        return null;
    }

    return player.hand.splice(
        index,
        1
    )[0];
}

/* =========================================================
   FIRST UNBEATEN
========================================================= */

function firstUnbeaten(room) {

    for (
        let i = 0;
        i < room.table.length;
        i++
    ) {

        if (
            !room.table[i].defense
        ) {

            return i;
        }
    }

    return -1;
}

/* =========================================================
   ALL BEATEN
========================================================= */

function allBeaten(room) {

    return (
        room.table.length > 0 &&
        firstUnbeaten(room) === -1
    );
}

/* =========================================================
   ATTACK
========================================================= */

function attackCard(
    socket,
    cardId
) {

    const room =
        rooms.get(
            socket.roomId
        );

    if (!room) return;

    if (
        room.phase !== "attack"
    ) {
        return;
    }

    if (
        room.attacker !== socket.id
    ) {

        socket.emit(
            "error_message",
            {
                message:
                    "Сейчас не твой ход"
            }
        );

        return;
    }

    const player =
        room.players[socket.id];

    const card =
        findCard(
            player,
            cardId
        );

    if (!card) return;

    if (
        !canAdd(
            room,
            card
        )
    ) {

        socket.emit(
            "error_message",
            {
                message:
                    "Эту карту нельзя подкинуть"
            }
        );

        return;
    }

    removeCard(
        player,
        cardId
    );

    room.table.push({
        attack: card,
        defense: null
    });

    room.phase =
        "defense";

    broadcastRoom(room);
}

/* =========================================================
   DEFEND
========================================================= */

function defendCard(
    socket,
    cardId
) {

    const room =
        rooms.get(
            socket.roomId
        );

    if (!room) return;

    if (
        room.phase !== "defense"
    ) {
        return;
    }

    if (
        room.defender !== socket.id
    ) {

        return;
    }

    const index =
        firstUnbeaten(room);

    if (index === -1) {
        return;
    }

    const player =
        room.players[socket.id];

    const card =
        findCard(
            player,
            cardId
        );

    if (!card) return;

    const target =
        room.table[index].attack;

    if (
        !canBeat(
            room,
            target,
            card
        )
    ) {

        socket.emit(
            "error_message",
            {
                message:
                    "Этой картой нельзя отбиться"
            }
        );

        return;
    }

    removeCard(
        player,
        cardId
    );

    room.table[index].defense =
        card;

    broadcastRoom(room);
}

/* =========================================================
   TAKE
========================================================= */

function takeCards(socket) {

    const room =
        rooms.get(
            socket.roomId
        );

    if (!room) return;

    if (
        room.phase !== "defense"
    ) {
        return;
    }

    if (
        room.defender !== socket.id
    ) {
        return;
    }

    const player =
        room.players[socket.id];

    for (
        const pair of room.table
    ) {

        player.hand.push(
            pair.attack
        );

        if (pair.defense) {

            player.hand.push(
                pair.defense
            );
        }
    }

    room.table = [];

    /*
        Защищающийся забрал карты.

        Атакующий сохраняет право атаки.
    */

    refillHands(room);

    if (
        checkWinner(room)
    ) {
        return;
    }

    room.phase =
        "attack";

    broadcastRoom(room);
}

/* =========================================================
   BITO
========================================================= */

function finishRound(socket) {

    const room =
        rooms.get(
            socket.roomId
        );

    if (!room) return;

    if (
        room.phase !== "attack"
    ) {
        return;
    }

    if (
        room.attacker !== socket.id
    ) {
        return;
    }

    if (
        !allBeaten(room)
    ) {

        socket.emit(
            "error_message",
            {
                message:
                    "Не все карты отбиты"
            }
        );

        return;
    }

    room.table = [];

    const oldAttacker =
        room.attacker;

    room.attacker =
        room.defender;

    room.defender =
        oldAttacker;

    refillHands(room);

    if (
        checkWinner(room)
    ) {
        return;
    }

    room.phase =
        "attack";

    broadcastRoom(room);
}

/* =========================================================
   WINNER
========================================================= */

function checkWinner(room) {

    if (
        room.deck.length > 0
    ) {
        return false;
    }

    const ids =
        Object.keys(
            room.players
        );

    for (
        const id of ids
    ) {

        const player =
            room.players[id];

        if (
            player.hand.length === 0
        ) {

            finishGame(
                room,
                id
            );

            return true;
        }
    }

    return false;
}

/* =========================================================
   FINISH GAME
========================================================= */

function finishGame(
    room,
    winnerSocketId
) {

    if (
        room.winner
    ) {
        return;
    }

    room.winner =
        winnerSocketId;

    room.phase =
        "finished";

    const ids =
        Object.keys(
            room.players
        );

    const loserSocketId =
        ids.find(
            id =>
                id !==
                winnerSocketId
        );

    const winner =
        getPlayer(
            winnerSocketId
        );

    const loser =
        getPlayer(
            loserSocketId
        );

    winner.money +=
        room.bank;

    winner.wins++;
    winner.games++;

    loser.losses++;
    loser.games++;

    winner.exp += 100;

    if (
        winner.exp >=
        winner.level * 500
    ) {

        winner.exp = 0;
        winner.level++;
    }

    broadcastRoom(room);

    io.to(room.id).emit(
        "game_finished",
        {
            winner:
                winnerSocketId,
            winnerName:
                room.players[
                    winnerSocketId
                ].name,
            prize:
                room.bank
        }
    );
}

/* =========================================================
   PUBLIC ROOM STATE
========================================================= */

function publicRoom(room) {

    const ids =
        Object.keys(
            room.players
        );

    return {
        roomId: room.id,

        bet: room.bet,

        bank: room.bank,

        deckCount:
            room.deck.length,

        trumpSuit:
            room.trumpSuit,

        phase:
            room.phase,

        attacker:
            room.attacker,

        defender:
            room.defender,

        table:
            room.table,

        players:
            ids.map(
                id => {

                    const p =
                        room.players[id];

                    const profile =
                        getPlayer(id);

                    return {
                        socketId:
                            id,

                        name:
                            p.name,

                        handCount:
                            p.hand.length,

                        hand:
                            p.hand,

                        profile:
                            publicPlayer(
                                profile
                            )
                    };
                }
            )
    };
}

/* =========================================================
   BROADCAST
========================================================= */

function broadcastRoom(room) {

    io.to(room.id).emit(
        "room_state",
        publicRoom(room)
    );
}

/* =========================================================
   SOCKET
========================================================= */

io.on(
    "connection",
    socket => {

        console.log(
            "CONNECTED:",
            socket.id
        );

        const player =
            getPlayer(
                socket.id
            );

        socket.emit(
            "profile",
            publicPlayer(
                player
            )
        );

        /* ==========================================
           PROFILE
        ========================================== */

        socket.on(
            "set_profile",
            data => {

                const player =
                    getPlayer(
                        socket.id
                    );

                if (
                    data &&
                    typeof data.name ===
                    "string"
                ) {

                    player.name =
                        data.name
                            .trim()
                            .slice(
                                0,
                                24
                            ) ||
                        "Игрок";
                }

                if (
                    data &&
                    typeof data.avatar ===
                    "string"
                ) {

                    player.avatar =
                        data.avatar
                            .slice(
                                0,
                                500
                            );
                }

                socket.emit(
                    "profile",
                    publicPlayer(
                        player
                    )
                );
            }
        );

        /* ==========================================
           FIND TABLE
        ========================================== */

        socket.on(
            "find_game",
            bet => {

                bet =
                    Number(bet);

                if (
                    !TABLES[bet]
                ) {

                    socket.emit(
                        "error_message",
                        {
                            message:
                                "Неверный стол"
                        }
                    );

                    return;
                }

                const player =
                    getPlayer(
                        socket.id
                    );

                if (
                    player.money < bet
                ) {

                    socket.emit(
                        "error_message",
                        {
                            message:
                                "Недостаточно HC"
                        }
                    );

                    return;
                }

                /*
                    Уже находится за столом.
                */

                if (
                    socket.roomId
                ) {

                    socket.emit(
                        "error_message",
                        {
                            message:
                                "Ты уже находишься за столом"
                        }
                    );

                    return;
                }

                let room =
                    findWaitingRoom(
                        bet
                    );

                if (room) {

                    if (
                        joinRoom(
                            socket,
                            room
                        )
                    ) {

                        io.to(room.id).emit(
                            "match_found",
                            {
                                roomId:
                                    room.id
                            }
                        );

                        startGame(
                            room
                        );
                    }

                    return;
                }

                room =
                    createRoom(
                        socket,
                        bet
                    );

                if (!room) {
                    return;
                }

                socket.emit(
                    "waiting",
                    {
                        roomId:
                            room.id,
                        bet
                    }
                );

                broadcastRoom(
                    room
                );
            }
        );

        /* ==========================================
           ATTACK
        ========================================== */

        socket.on(
            "attack",
            cardId => {

                attackCard(
                    socket,
                    cardId
                );
            }
        );

        /* ==========================================
           DEFENSE
        ========================================== */

        socket.on(
            "defend",
            cardId => {

                defendCard(
                    socket,
                    cardId
                );
            }
        );

        /* ==========================================
           TAKE
        ========================================== */

        socket.on(
            "take",
            () => {

                takeCards(
                    socket
                );
            }
        );

        /* ==========================================
           BITO
        ========================================== */

        socket.on(
            "bito",
            () => {

                finishRound(
                    socket
                );
            }
        );

        /* ==========================================
           LEAVE
        ========================================== */

        socket.on(
            "leave_room",
            () => {

                leaveRoom(
                    socket
                );
            }
        );

        /* ==========================================
           DISCONNECT
        ========================================== */

        socket.on(
            "disconnect",
            () => {

                console.log(
                    "DISCONNECTED:",
                    socket.id
                );

                leaveRoom(
                    socket
                );

                players.delete(
                    socket.id
                );
            }
        );
    }
);

/* =========================================================
   LEAVE ROOM
========================================================= */

function leaveRoom(socket) {

    if (
        !socket.roomId
    ) {
        return;
    }

    const room =
        rooms.get(
            socket.roomId
        );

    if (!room) {

        socket.roomId =
            null;

        return;
    }

    const ids =
        Object.keys(
            room.players
        );

    /*
        Если игра уже идёт,
        оставшемуся игроку возвращаем
        его ставку + ставку соперника
        как победителю по disconnect.
    */

    if (
        room.phase !== "waiting" &&
        room.phase !== "finished" &&
        ids.length === 2
    ) {

        const opponent =
            ids.find(
                id =>
                    id !== socket.id
            );

        if (opponent) {

            finishGame(
                room,
                opponent
            );
        }
    }

    delete room.players[
        socket.id
    ];

    socket.leave(
        room.id
    );

    socket.roomId =
        null;

    if (
        Object.keys(
            room.players
        ).length === 0
    ) {

        rooms.delete(
            room.id
        );
    }
}

/* =========================================================
   HEALTH
========================================================= */

app.get(
    "/",
    (req, res) => {

        res.json({
            ok: true,
            service:
                "Heavy Lux Card",
            online:
                io.engine.clientsCount,
            rooms:
                rooms.size
        });
    }
);

app.get(
    "/health",
    (req, res) => {

        res.json({
            status: "ok"
        });
    }
);

/* =========================================================
   START
========================================================= */

server.listen(
    PORT,
    () => {

        console.log(
            `Heavy Lux Card server running on port ${PORT}`
        );
    }
);
