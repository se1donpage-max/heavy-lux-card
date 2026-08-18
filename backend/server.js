const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const http = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* =========================================================
   POSTGRESQL
========================================================= */

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

/* =========================================================
   DATABASE
========================================================= */

async function initDatabase() {

    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username TEXT,
                first_name TEXT,

                balance BIGINT NOT NULL DEFAULT 5000,

                xp INTEGER NOT NULL DEFAULT 0,
                level INTEGER NOT NULL DEFAULT 1,
                title TEXT,

                wins INTEGER NOT NULL DEFAULT 0,
                losses INTEGER NOT NULL DEFAULT 0,
                games INTEGER NOT NULL DEFAULT 0,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Database initialized");

    } catch (error) {

        console.error(
            "Database initialization error:",
            error
        );

        throw error;
    }
}

/* =========================================================
   TITLES
========================================================= */

function getTitle(level) {

    if (level >= 100) {
        return "Покровитель";
    }

    if (level >= 80) {
        return "Попечитель";
    }

    if (level >= 60) {
        return "Почётный член клуба";
    }

    if (level >= 40) {
        return "Старший член клуба";
    }

    if (level >= 20) {
        return "Член клуба";
    }

    return null;
}

/* =========================================================
   TELEGRAM AUTH
========================================================= */

function validateTelegramInitData(initData) {

    if (!initData) {
        return null;
    }

    const botToken =
        process.env.BOT_TOKEN;

    if (!botToken) {
        throw new Error(
            "BOT_TOKEN is not configured"
        );
    }

    const params =
        new URLSearchParams(initData);

    const receivedHash =
        params.get("hash");

    if (!receivedHash) {
        return null;
    }

    params.delete("hash");

    const dataCheckString =
        Array.from(params.entries())
            .sort(([a], [b]) =>
                a.localeCompare(b)
            )
            .map(
                ([key, value]) =>
                    `${key}=${value}`
            )
            .join("\n");

    const secretKey =
        crypto
            .createHmac(
                "sha256",
                "WebAppData"
            )
            .update(botToken)
            .digest();

    const calculatedHash =
        crypto
            .createHmac(
                "sha256",
                secretKey
            )
            .update(dataCheckString)
            .digest("hex");

    if (
        calculatedHash.length !==
        receivedHash.length
    ) {
        return null;
    }

    if (
        !crypto.timingSafeEqual(
            Buffer.from(calculatedHash),
            Buffer.from(receivedHash)
        )
    ) {
        return null;
    }

    const authDate =
        Number(
            params.get("auth_date")
        );

    if (!authDate) {
        return null;
    }

    const currentTime =
        Math.floor(
            Date.now() / 1000
        );

    /*
        Не принимаем данные
        старше 24 часов.
    */

    if (
        currentTime - authDate > 86400 ||
        authDate > currentTime + 60
    ) {
        return null;
    }

    const userString =
        params.get("user");

    if (!userString) {
        return null;
    }

    try {

        return JSON.parse(
            userString
        );

    } catch {

        return null;
    }
}

/* =========================================================
   PLAYER
========================================================= */

async function getOrCreatePlayer(
    telegramUser
) {

    const telegramId =
        telegramUser.id;

    const username =
        telegramUser.username || null;

    const firstName =
        telegramUser.first_name || null;

    const existing =
        await pool.query(
            `
            SELECT *
            FROM players
            WHERE telegram_id = $1
            `,
            [telegramId]
        );

    if (existing.rows.length > 0) {

        const player =
            existing.rows[0];

        const updated =
            await pool.query(
                `
                UPDATE players

                SET username = $1,
                    first_name = $2,
                    title = $3

                WHERE telegram_id = $4

                RETURNING *
                `,
                [
                    username,
                    firstName,
                    getTitle(player.level),
                    telegramId
                ]
            );

        return updated.rows[0];
    }

    const created =
        await pool.query(
            `
            INSERT INTO players
            (
                telegram_id,
                username,
                first_name,
                balance,
                xp,
                level,
                title
            )

            VALUES
            (
                $1,
                $2,
                $3,
                5000,
                0,
                1,
                NULL
            )

            RETURNING *
            `,
            [
                telegramId,
                username,
                firstName
            ]
        );

    return created.rows[0];
}

/* =========================================================
   BASIC ROUTES
========================================================= */

app.get("/", (req, res) => {

    res.json({
        success: true,
        project: "Heavy Lux Card",
        status: "online",
        multiplayer: true
    });
});

app.get(
    "/api/health",
    async (req, res) => {

        try {

            await pool.query(
                "SELECT NOW()"
            );

            res.json({
                success: true,
                status: "online",
                database: "connected"
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                database: "error"
            });
        }
    }
);

/* =========================================================
   TELEGRAM AUTH
========================================================= */

app.post(
    "/api/auth",
    async (req, res) => {

        try {

            const {
                initData
            } = req.body;

            const telegramUser =
                validateTelegramInitData(
                    initData
                );

            if (!telegramUser) {

                return res
                    .status(401)
                    .json({
                        success: false,
                        error:
                            "Invalid Telegram authentication"
                    });
            }

            const player =
                await getOrCreatePlayer(
                    telegramUser
                );

            res.json({
                success: true,
                player
            });

        } catch (error) {

            console.error(
                "AUTH ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Authentication server error"
            });
        }
    }
);

/* =========================================================
   GET PLAYER
========================================================= */

app.get(
    "/api/player/:telegram_id",
    async (req, res) => {

        try {

            const telegramId =
                req.params.telegram_id;

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM players
                    WHERE telegram_id = $1
                    `,
                    [telegramId]
                );

            if (
                result.rows.length === 0
            ) {

                return res
                    .status(404)
                    .json({
                        success: false,
                        error:
                            "Player not found"
                    });
            }

            const player =
                result.rows[0];

            player.title =
                getTitle(
                    player.level
                );

            res.json({
                success: true,
                player
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error:
                    "Database error"
            });
        }
    }
);

/* =========================================================
   GAME CONSTANTS
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

/* =========================================================
   DECK
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

    for (
        let i = array.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() * (i + 1)
            );

        [
            array[i],
            array[j]
        ] = [
            array[j],
            array[i]
        ];
    }

    return array;
}

/* =========================================================
   MULTIPLAYER GAMES
========================================================= */

/*
    Пока игры храним в памяти сервера.

    Позже перенесём состояние активных
    матчей в Redis/PostgreSQL.

    Для первого MVP этого достаточно.
*/

const games = new Map();

/*
    Игроки, которые ждут соперника.
*/

let matchmakingQueue = [];

/*
    socket.id -> gameId
*/

const playerGames = new Map();

/* =========================================================
   GAME ID
========================================================= */

function createGameId() {

    return crypto
        .randomBytes(8)
        .toString("hex");
}

/* =========================================================
   GAME PLAYER
========================================================= */

function createGamePlayer(
    socket,
    player
) {

    return {
        socketId: socket.id,

        telegramId:
            String(
                player.telegram_id
            ),

        username:
            player.username,

        firstName:
            player.first_name,

        hand: []
    };
}

/* =========================================================
   CARD RULES
========================================================= */

function isTrump(
    card,
    trumpSuit
) {

    return (
        card &&
        card.suit === trumpSuit
    );
}

function canBeat(
    attack,
    defense,
    trumpSuit
) {

    if (!attack || !defense) {
        return false;
    }

    if (
        isTrump(
            defense,
            trumpSuit
        ) &&
        !isTrump(
            attack,
            trumpSuit
        )
    ) {
        return true;
    }

    if (
        !isTrump(
            defense,
            trumpSuit
        ) &&
        isTrump(
            attack,
            trumpSuit
        )
    ) {
        return false;
    }

    return (
        attack.suit === defense.suit &&
        defense.value > attack.value
    );
}

/* =========================================================
   PUBLIC GAME STATE
========================================================= */

function getPublicGameState(
    game,
    telegramId
) {

    const me =
        game.players.find(
            p =>
                p.telegramId ===
                String(telegramId)
        );

    const opponent =
        game.players.find(
            p =>
                p.telegramId !==
                String(telegramId)
        );

    return {

        gameId: game.id,

        status: game.status,

        phase: game.phase,

        trumpSuit:
            game.trumpSuit,

        deckCount:
            game.deck.length,

        myHand:
            me
                ? me.hand
                : [],

        opponent: opponent
            ? {
                telegramId:
                    opponent.telegramId,

                username:
                    opponent.username,

                firstName:
                    opponent.firstName,

                cardCount:
                    opponent.hand.length
            }
            : null,

        table:
            game.table,

        attacker:
            game.attacker,

        defender:
            game.defender
    };
}

/* =========================================================
   SEND GAME STATE
========================================================= */

function sendGameState(
    game
) {

    for (
        const player of game.players
    ) {

        const socket =
            io.sockets.sockets.get(
                player.socketId
            );

        if (!socket) {
            continue;
        }

        socket.emit(
            "game_state",
            getPublicGameState(
                game,
                player.telegramId
            )
        );
    }
}

/* =========================================================
   DEAL
========================================================= */

function dealInitialCards(
    game
) {

    for (let i = 0; i < 6; i++) {

        for (
            const player of game.players
        ) {

            if (
                game.deck.length === 0
            ) {
                return;
            }

            player.hand.push(
                game.deck.shift()
            );
        }
    }
}

/* =========================================================
   FIRST ATTACKER
========================================================= */

function determineFirstAttacker(
    game
) {

    const first =
        game.players[0];

    const second =
        game.players[1];

    const firstTrumps =
        first.hand
            .filter(
                card =>
                    isTrump(
                        card,
                        game.trumpSuit
                    )
            )
            .sort(
                (a, b) =>
                    a.value - b.value
            );

    const secondTrumps =
        second.hand
            .filter(
                card =>
                    isTrump(
                        card,
                        game.trumpSuit
                    )
            )
            .sort(
                (a, b) =>
                    a.value - b.value
            );

    let attacker;

    if (
        firstTrumps.length &&
        secondTrumps.length
    ) {

        attacker =
            firstTrumps[0].value <=
            secondTrumps[0].value
                ? first
                : second;

    } else if (
        firstTrumps.length
    ) {

        attacker = first;

    } else if (
        secondTrumps.length
    ) {

        attacker = second;

    } else {

        const firstMin =
            Math.min(
                ...first.hand.map(
                    c => c.value
                )
            );

        const secondMin =
            Math.min(
                ...second.hand.map(
                    c => c.value
                )
            );

        attacker =
            firstMin <= secondMin
                ? first
                : second;
    }

    return attacker.telegramId;
}

/* =========================================================
   START GAME
========================================================= */

function startGame(
    player1,
    player2
) {

    const deck =
        createDeck();

    const trump =
        deck[deck.length - 1];

    const game = {

        id:
            createGameId(),

        status:
            "playing",

        phase:
            "attack",

        deck,

        trumpSuit:
            trump.suit,

        players: [
            player1,
            player2
        ],

        attacker:
            null,

        defender:
            null,

        table: []
    };

    dealInitialCards(game);

    game.attacker =
        determineFirstAttacker(
            game
        );

    game.defender =
        game.players.find(
            p =>
                p.telegramId !==
                game.attacker
        ).telegramId;

    games.set(
        game.id,
        game
    );

    playerGames.set(
        player1.socketId,
        game.id
    );

    playerGames.set(
        player2.socketId,
        game.id
    );

    return game;
}

/* =========================================================
   FIND PLAYER
========================================================= */

function findPlayerBySocket(
    game,
    socketId
) {

    return game.players.find(
        p =>
            p.socketId ===
            socketId
    );
}

/* =========================================================
   FIND GAME
========================================================= */

function getGameBySocket(
    socketId
) {

    const gameId =
        playerGames.get(
            socketId
        );

    if (!gameId) {
        return null;
    }

    return games.get(
        gameId
    ) || null;
}

/* =========================================================
   MATCHMAKING
========================================================= */

async function joinMatchmaking(
    socket
) {

    if (
        playerGames.has(
            socket.id
        )
    ) {

        socket.emit(
            "matchmaking_error",
            {
                error:
                    "You are already in a game"
            }
        );

        return;
    }

    const existing =
        matchmakingQueue.find(
            item =>
                item.socketId ===
                socket.id
        );

    if (existing) {

        socket.emit(
            "matchmaking_status",
            {
                status: "waiting"
            }
        );

        return;
    }

    const player =
        socket.player;

    /*
        Удаляем мёртвые сокеты
        из очереди.
    */

    matchmakingQueue =
        matchmakingQueue.filter(
            item =>
                io.sockets.sockets.has(
                    item.socketId
                )
        );

    /*
        Ищем другого игрока.
    */

    const opponentIndex =
        matchmakingQueue.findIndex(
            item =>
                item.telegramId !==
                String(
                    player.telegram_id
                )
        );

    if (
        opponentIndex === -1
    ) {

        matchmakingQueue.push({

            socketId:
                socket.id,

            telegramId:
                String(
                    player.telegram_id
                ),

            player
        });

        socket.emit(
            "matchmaking_status",
            {
                status: "waiting"
            }
        );

        return;
    }

    const opponent =
        matchmakingQueue.splice(
            opponentIndex,
            1
        )[0];

    const opponentSocket =
        io.sockets.sockets.get(
            opponent.socketId
        );

    if (!opponentSocket) {

        return joinMatchmaking(
            socket
        );
    }

    const player1 =
        createGamePlayer(
            opponentSocket,
            opponent.player
        );

    const player2 =
        createGamePlayer(
            socket,
            player
        );

    const game =
        startGame(
            player1,
            player2
        );

    opponentSocket.emit(
        "match_found",
        {
            gameId:
                game.id
        }
    );

    socket.emit(
        "match_found",
        {
            gameId:
                game.id
        }
    );

    sendGameState(
        game
    );
}

/* =========================================================
   REMOVE CARD
========================================================= */

function removeCardFromHand(
    player,
    cardId
) {

    const index =
        player.hand.findIndex(
            card =>
                card.id ===
                cardId
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
   TABLE RANKS
========================================================= */

function getTableRanks(game) {

    const ranks = [];

    for (
        const pair of game.table
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
   CAN ATTACK
========================================================= */

function canAddCard(
    game,
    card
) {

    if (
        game.table.length === 0
    ) {
        return true;
    }

    return getTableRanks(game)
        .includes(
            card.rank
        );
}

/* =========================================================
   FIRST UNBEATEN
========================================================= */

function getFirstUnbeaten(
    game
) {

    for (
        let i = 0;
        i < game.table.length;
        i++
    ) {

        if (
            !game.table[i].defense
        ) {

            return i;
        }
    }

    return -1;
}

/* =========================================================
   ALL BEATEN
========================================================= */

function allBeaten(game) {

    return (
        game.table.length > 0 &&
        getFirstUnbeaten(game) === -1
    );
}

/* =========================================================
   PLAY CARD
========================================================= */

function handlePlayCard(
    socket,
    cardId
) {

    const game =
        getGameBySocket(
            socket.id
        );

    if (!game) {

        socket.emit(
            "game_error",
            {
                error:
                    "Game not found"
            }
        );

        return;
    }

    const player =
        findPlayerBySocket(
            game,
            socket.id
        );

    if (!player) {
        return;
    }

    /*
        Только атакующий
        может атаковать.
    */

    if (
        player.telegramId !==
        game.attacker
    ) {

        /*
            Если игрок защищается,
            это должен быть отбой.
        */

        if (
            player.telegramId ===
            game.defender
        ) {

            return handleDefense(
                socket,
                cardId
            );
        }

        socket.emit(
            "game_error",
            {
                error:
                    "Not your turn"
            }
        );

        return;
    }

    const card =
        player.hand.find(
            c =>
                c.id === cardId
        );

    if (!card) {

        socket.emit(
            "game_error",
            {
                error:
                    "Card not found"
            }
        );

        return;
    }

    if (
        !canAddCard(
            game,
            card
        )
    ) {

        socket.emit(
            "game_error",
            {
                error:
                    "This card cannot be played"
            }
        );

        return;
    }

    /*
        Нельзя атаковать
        больше карт, чем
        у защищающегося.
    */

    const defender =
        game.players.find(
            p =>
                p.telegramId ===
                game.defender
        );

    if (
        game.table.length >=
        defender.hand.length
    ) {

        socket.emit(
            "game_error",
            {
                error:
                    "Attack limit reached"
            }
        );

        return;
    }

    removeCardFromHand(
        player,
        cardId
    );

    game.table.push({
        attack: card,
        defense: null
    });

    game.phase =
        "defense";

    sendGameState(
        game
    );
}

/* =========================================================
   DEFENSE
========================================================= */

function handleDefense(
    socket,
    cardId
) {

    const game =
        getGameBySocket(
            socket.id
        );

    if (!game) {
        return;
    }

    const player =
        findPlayerBySocket(
            game,
            socket.id
        );

    if (!player) {
        return;
    }

    if (
        player.telegramId !==
        game.defender
    ) {

        socket.emit(
            "game_error",
            {
                error:
                    "You are not defending"
            }
        );

        return;
    }

    const index =
        getFirstUnbeaten(
            game
        );

    if (index === -1) {

        socket.emit(
            "game_error",
            {
                error:
                    "Nothing to beat"
            }
        );

        return;
    }

    const card =
        player.hand.find(
            c =>
                c.id === cardId
        );

    if (!card) {

        socket.emit(
            "game_error",
            {
                error:
                    "Card not found"
            }
        );

        return;
    }

    const attack =
        game.table[index].attack;

    if (
        !canBeat(
            attack,
            card,
            game.trumpSuit
        )
    ) {

        socket.emit(
            "game_error",
            {
                error:
                    "This card cannot beat"
            }
        );

        return;
    }

    removeCardFromHand(
        player,
        cardId
    );

    game.table[index].defense =
        card;

    if (
        allBeaten(game)
    ) {

        game.phase =
            "attack_finished";

    } else {

        game.phase =
            "defense";
    }

    sendGameState(
        game
    );
}

/* =========================================================
   FINISH ROUND
========================================================= */

function finishRound(
    socket
) {

    const game =
        getGameBySocket(
            socket.id
        );

    if (!game) {
        return;
    }

    const player =
        findPlayerBySocket(
            game,
            socket.id
        );

    if (!player) {
        return;
    }

    /*
        Только атакующий может
        завершить успешную атаку.
    */

    if (
        player.telegramId !==
        game.attacker
    ) {

        return;
    }

    if (
        !allBeaten(game)
    ) {

        socket.emit(
            "game_error",
            {
                error:
                    "Not all cards are beaten"
            }
        );

        return;
    }

    game.table = [];

    refillHands(game);

    /*
        Меняем атакующего.
    */

    const oldAttacker =
        game.attacker;

    game.attacker =
        game.defender;

    game.defender =
        oldAttacker;

    game.phase =
        "attack";

    checkGameEnd(game);

    sendGameState(
        game
    );
}

/* =========================================================
   TAKE CARDS
========================================================= */

function takeCards(
    socket
) {

    const game =
        getGameBySocket(
            socket.id
        );

    if (!game) {
        return;
    }

    const player =
        findPlayerBySocket(
            game,
            socket.id
        );

    if (!player) {
        return;
    }

    if (
        player.telegramId !==
        game.defender
    ) {

        socket.emit(
            "game_error",
            {
                error:
                    "You are not defending"
            }
        );

        return;
    }

    for (
        const pair of game.table
    ) {

        player.hand.push(
            pair.attack
        );

        if (
            pair.defense
        ) {

            player.hand.push(
                pair.defense
            );
        }
    }

    game.table = [];

    /*
        Защищающийся забирает карты.

        Атакующий сохраняет право
        атаки.
    */

    refillHands(game);

    game.phase =
        "attack";

    checkGameEnd(game);

    sendGameState(
        game
    );
}

/* =========================================================
   REFILL
========================================================= */

function refillHands(game) {

    const attacker =
        game.players.find(
            p =>
                p.telegramId ===
                game.attacker
        );

    const defender =
        game.players.find(
            p =>
                p.telegramId ===
                game.defender
        );

    /*
        Сначала атакующий.
    */

    while (
        attacker.hand.length < 6 &&
        game.deck.length > 0
    ) {

        attacker.hand.push(
            game.deck.shift()
        );
    }

    /*
        Затем защищающийся.
    */

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
   GAME END
========================================================= */

async function checkGameEnd(
    game
) {

    if (
        game.deck.length > 0
    ) {
        return false;
    }

    const p1 =
        game.players[0];

    const p2 =
        game.players[1];

    if (
        p1.hand.length === 0 &&
        p2.hand.length === 0
    ) {

        await finishGame(
            game,
            null
        );

        return true;
    }

    if (
        p1.hand.length === 0
    ) {

        await finishGame(
            game,
            p1.telegramId
        );

        return true;
    }

    if (
        p2.hand.length === 0
    ) {

        await finishGame(
            game,
            p2.telegramId
        );

        return true;
    }

    return false;
}

/* =========================================================
   FINISH GAME
========================================================= */

async function finishGame(
    game,
    winnerTelegramId
) {

    if (
        game.status ===
        "finished"
    ) {
        return;
    }

    game.status =
        "finished";

    for (
        const player of game.players
    ) {

        const won =
            winnerTelegramId !== null &&
            player.telegramId ===
            String(
                winnerTelegramId
            );

        await pool.query(
            `
            UPDATE players

            SET games = games + 1,

                wins =
                    wins +
                    $1,

                losses =
                    losses +
                    $2,

                xp =
                    xp +
                    $3

            WHERE telegram_id = $4
            `,
            [
                won ? 1 : 0,
                (
                    winnerTelegramId !== null &&
                    !won
                ) ? 1 : 0,
                won ? 100 : 25,
                player.telegramId
            ]
        );
    }

    sendGameState(
        game
    );

    for (
        const player of game.players
    ) {

        const socket =
            io.sockets.sockets.get(
                player.socketId
            );

        if (!socket) {
            continue;
        }

        let result =
            "draw";

        if (
            winnerTelegramId
        ) {

            result =
                String(
                    winnerTelegramId
                ) ===
                player.telegramId
                    ? "win"
                    : "loss";
        }

        socket.emit(
            "game_finished",
            {
                result
            }
        );
    }
}

/* =========================================================
   SOCKET AUTH
========================================================= */

io.use(
    async (socket, next) => {

        try {

            const initData =
                socket.handshake.auth
                    ?.initData;

            const telegramUser =
                validateTelegramInitData(
                    initData
                );

            if (!telegramUser) {

                return next(
                    new Error(
                        "Invalid Telegram authentication"
                    )
                );
            }

            const player =
                await getOrCreatePlayer(
                    telegramUser
                );

            socket.telegramUser =
                telegramUser;

            socket.player =
                player;

            next();

        } catch (error) {

            console.error(
                "Socket auth error:",
                error
            );

            next(
                new Error(
                    "Authentication failed"
                )
            );
        }
    }
);

/* =========================================================
   SOCKET CONNECTION
========================================================= */

io.on(
    "connection",
    socket => {

        console.log(
            "Player connected:",
            socket.player.telegram_id
        );

        socket.emit(
            "connected",
            {
                success: true,

                player: {
                    telegram_id:
                        socket.player.telegram_id,

                    username:
                        socket.player.username,

                    first_name:
                        socket.player.first_name,

                    balance:
                        socket.player.balance,

                    level:
                        socket.player.level,

                    title:
                        getTitle(
                            socket.player.level
                        )
                }
            }
        );

        /*
            ПОИСК СОПЕРНИКА
        */

        socket.on(
            "find_game",
            async () => {

                try {

                    await joinMatchmaking(
                        socket
                    );

                } catch (error) {

                    console.error(
                        "Matchmaking error:",
                        error
                    );

                    socket.emit(
                        "matchmaking_error",
                        {
                            error:
                                "Matchmaking error"
                        }
                    );
                }
            }
        );

        /*
            ОТМЕНА ПОИСКА
        */

        socket.on(
            "cancel_matchmaking",
            () => {

                matchmakingQueue =
                    matchmakingQueue.filter(
                        item =>
                            item.socketId !==
                            socket.id
                    );

                socket.emit(
                    "matchmaking_status",
                    {
                        status:
                            "cancelled"
                    }
                );
            }
        );

        /*
            ПОЛОЖИТЬ КАРТУ
        */

        socket.on(
            "play_card",
            cardId => {

                try {

                    handlePlayCard(
                        socket,
                        cardId
                    );

                } catch (error) {

                    console.error(
                        "PLAY CARD ERROR:",
                        error
                    );

                    socket.emit(
                        "game_error",
                        {
                            error:
                                "Server error"
                        }
                    );
                }
            }
        );

        /*
            БИТО
        */

        socket.on(
            "beat",
            () => {

                try {

                    finishRound(
                        socket
                    );

                } catch (error) {

                    console.error(
                        "BEAT ERROR:",
                        error
                    );
                }
            }
        );

        /*
            ВЗЯТЬ
        */

        socket.on(
            "take",
            () => {

                try {

                    takeCards(
                        socket
                    );

                } catch (error) {

                    console.error(
                        "TAKE ERROR:",
                        error
                    );
                }
            }
        );

        /*
            ОТКЛЮЧЕНИЕ
        */

        socket.on(
            "disconnect",
            () => {

                console.log(
                    "Player disconnected:",
                    socket.player.telegram_id
                );

                matchmakingQueue =
                    matchmakingQueue.filter(
                        item =>
                            item.socketId !==
                            socket.id
                    );

                const game =
                    getGameBySocket(
                        socket.id
                    );

                if (!game) {
                    return;
                }

                /*
                    Если игрок вышел,
                    второй пока получает
                    победу по disconnect.
                */

                const opponent =
                    game.players.find(
                        p =>
                            p.socketId !==
                            socket.id
                    );

                if (
                    opponent
                ) {

                    finishGame(
                        game,
                        opponent.telegramId
                    );
                }

                playerGames.delete(
                    socket.id
                );
            }
        );
    }
);

/* =========================================================
   SERVER
========================================================= */

async function startServer() {

    await initDatabase();

    server.listen(
        PORT,
        "0.0.0.0",
        () => {

            console.log(
                `Heavy Lux Card multiplayer backend running on port ${PORT}`
            );

        }
    );
}

startServer();
