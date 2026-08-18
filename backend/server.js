const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors({
    origin: "*"
}));

app.use(express.json());


// =====================================================
// DATABASE
// =====================================================

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not configured");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: {
        rejectUnauthorized: false
    }
});


// =====================================================
// CONSTANTS
// =====================================================

const START_BALANCE = 5000;

const MAX_PLAYERS_PER_ROOM = 2;


// =====================================================
// TITLES
// =====================================================

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


// =====================================================
// TELEGRAM AUTH
// =====================================================

function validateTelegramInitData(initData) {

    if (!initData) {
        return null;
    }

    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
        throw new Error("BOT_TOKEN is not configured");
    }

    const params = new URLSearchParams(initData);

    const receivedHash = params.get("hash");

    if (!receivedHash) {
        return null;
    }

    params.delete("hash");

    const dataCheckString = Array
        .from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

    const secretKey = crypto
        .createHmac("sha256", "WebAppData")
        .update(botToken)
        .digest();

    const calculatedHash = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

    if (
        calculatedHash.length !== receivedHash.length
    ) {
        return null;
    }

    const validHash = crypto.timingSafeEqual(
        Buffer.from(calculatedHash),
        Buffer.from(receivedHash)
    );

    if (!validHash) {
        return null;
    }

    const authDate = Number(
        params.get("auth_date")
    );

    if (!authDate) {
        return null;
    }

    const currentTime = Math.floor(
        Date.now() / 1000
    );

    // Telegram initData старше 24 часов отклоняем
    if (
        currentTime - authDate > 86400
    ) {
        return null;
    }

    // Защита от времени из будущего
    if (
        authDate > currentTime + 60
    ) {
        return null;
    }

    const userString = params.get("user");

    if (!userString) {
        return null;
    }

    try {

        const user = JSON.parse(userString);

        if (!user.id) {
            return null;
        }

        return user;

    } catch {

        return null;

    }
}


// =====================================================
// AUTH MIDDLEWARE
// =====================================================

async function authenticateTelegram(req, res, next) {

    try {

        const initData =
            req.headers["x-telegram-init-data"];

        if (!initData) {

            return res.status(401).json({
                success: false,
                error: "Telegram authorization required"
            });

        }

        const telegramUser =
            validateTelegramInitData(initData);

        if (!telegramUser) {

            return res.status(401).json({
                success: false,
                error: "Invalid Telegram authorization"
            });

        }

        req.telegramUser = telegramUser;

        next();

    } catch (error) {

        console.error(
            "AUTH MIDDLEWARE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Authorization error"
        });

    }
}


// =====================================================
// DATABASE INITIALIZATION
// =====================================================

async function initDatabase() {

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

            created_at TIMESTAMP
                NOT NULL DEFAULT CURRENT_TIMESTAMP,

            updated_at TIMESTAMP
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);


    await pool.query(`
        CREATE TABLE IF NOT EXISTS game_rooms (

            id UUID PRIMARY KEY,

            status TEXT NOT NULL DEFAULT 'waiting',

            host_telegram_id BIGINT NOT NULL,

            max_players INTEGER
                NOT NULL DEFAULT 2,

            created_at TIMESTAMP
                NOT NULL DEFAULT CURRENT_TIMESTAMP,

            updated_at TIMESTAMP
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);


    await pool.query(`
        CREATE TABLE IF NOT EXISTS game_room_players (

            id SERIAL PRIMARY KEY,

            room_id UUID NOT NULL
                REFERENCES game_rooms(id)
                ON DELETE CASCADE,

            telegram_id BIGINT NOT NULL,

            seat INTEGER NOT NULL,

            joined_at TIMESTAMP
                NOT NULL DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(room_id, telegram_id),

            UNIQUE(room_id, seat)
        );
    `);


    await pool.query(`
        CREATE TABLE IF NOT EXISTS game_actions (

            id SERIAL PRIMARY KEY,

            room_id UUID NOT NULL
                REFERENCES game_rooms(id)
                ON DELETE CASCADE,

            telegram_id BIGINT NOT NULL,

            action TEXT NOT NULL,

            payload JSONB,

            created_at TIMESTAMP
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);


    console.log(
        "Database initialized successfully"
    );
}


// =====================================================
// ROOT
// =====================================================

app.get("/", (req, res) => {

    res.json({

        success: true,

        project: "Heavy Lux Card",

        status: "online",

        version: "1.0.0"

    });

});


// =====================================================
// HEALTH
// =====================================================

app.get("/api/health", async (req, res) => {

    try {

        const result =
            await pool.query("SELECT NOW()");

        res.json({

            success: true,

            status: "online",

            database: "connected",

            time: result.rows[0].now

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            status: "online",

            database: "error"

        });

    }

});


// =====================================================
// TELEGRAM AUTH
// =====================================================

app.post("/api/auth", async (req, res) => {

    try {

        const { initData } = req.body;

        const telegramUser =
            validateTelegramInitData(initData);

        if (!telegramUser) {

            return res.status(401).json({

                success: false,

                error:
                    "Invalid Telegram authentication"

            });

        }


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


        // =================================================
        // EXISTING PLAYER
        // =================================================

        if (existing.rows.length > 0) {

            const player =
                existing.rows[0];

            const updated =
                await pool.query(
                    `
                    UPDATE players

                    SET
                        username = $1,
                        first_name = $2,
                        title = $3,
                        updated_at = CURRENT_TIMESTAMP

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


            return res.json({

                success: true,

                new_player: false,

                player: updated.rows[0]

            });

        }


        // =================================================
        // NEW PLAYER
        // =================================================

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
                    $4,
                    0,
                    1,
                    NULL
                )

                RETURNING *
                `,
                [
                    telegramId,
                    username,
                    firstName,
                    START_BALANCE
                ]
            );


        res.json({

            success: true,

            new_player: true,

            player: created.rows[0]

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

});


// =====================================================
// GET CURRENT PLAYER
// =====================================================

app.get(
    "/api/me",
    authenticateTelegram,
    async (req, res) => {

        try {

            const telegramId =
                req.telegramUser.id;


            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM players
                    WHERE telegram_id = $1
                    `,
                    [telegramId]
                );


            if (result.rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Player not found"

                });

            }


            const player =
                result.rows[0];

            player.title =
                getTitle(player.level);


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


// =====================================================
// GET PLAYER BY TELEGRAM ID
// =====================================================

app.get(
    "/api/player/:telegram_id",
    authenticateTelegram,
    async (req, res) => {

        try {

            const requestedId =
                req.params.telegram_id;

            const currentId =
                String(req.telegramUser.id);


            // Нельзя смотреть чужие профили
            // через этот endpoint

            if (
                requestedId !== currentId
            ) {

                return res.status(403).json({

                    success: false,

                    error:
                        "Access denied"

                });

            }


            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM players
                    WHERE telegram_id = $1
                    `,
                    [requestedId]
                );


            if (result.rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Player not found"

                });

            }


            const player =
                result.rows[0];

            player.title =
                getTitle(player.level);


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


// =====================================================
// CREATE GAME ROOM
// =====================================================

app.post(
    "/api/game/create",
    authenticateTelegram,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const telegramId =
                req.telegramUser.id;


            const roomId =
                crypto.randomUUID();


            await client.query("BEGIN");


            // Проверяем, нет ли игрока
            // уже в активной комнате

            const activeRoom =
                await client.query(
                    `
                    SELECT gr.id

                    FROM game_rooms gr

                    JOIN game_room_players grp
                        ON grp.room_id = gr.id

                    WHERE grp.telegram_id = $1

                    AND gr.status IN
                        ('waiting', 'playing')

                    LIMIT 1
                    `,
                    [telegramId]
                );


            if (
                activeRoom.rows.length > 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(409).json({

                    success: false,

                    error:
                        "Player already has an active game",

                    room_id:
                        activeRoom.rows[0].id

                });

            }


            await client.query(
                `
                INSERT INTO game_rooms
                (
                    id,
                    status,
                    host_telegram_id,
                    max_players
                )

                VALUES
                (
                    $1,
                    'waiting',
                    $2,
                    $3
                )
                `,
                [
                    roomId,
                    telegramId,
                    MAX_PLAYERS_PER_ROOM
                ]
            );


            await client.query(
                `
                INSERT INTO game_room_players
                (
                    room_id,
                    telegram_id,
                    seat
                )

                VALUES
                (
                    $1,
                    $2,
                    1
                )
                `,
                [
                    roomId,
                    telegramId
                ]
            );


            await client.query("COMMIT");


            res.json({

                success: true,

                room_id: roomId,

                status: "waiting"

            });


        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            console.error(
                "CREATE GAME ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Could not create game"

            });

        } finally {

            client.release();

        }

    }
);


// =====================================================
// JOIN GAME
// =====================================================

app.post(
    "/api/game/join",
    authenticateTelegram,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const telegramId =
                req.telegramUser.id;

            const { room_id } =
                req.body;


            if (!room_id) {

                return res.status(400).json({

                    success: false,

                    error:
                        "room_id is required"

                });

            }


            await client.query("BEGIN");


            const room =
                await client.query(
                    `
                    SELECT *

                    FROM game_rooms

                    WHERE id = $1

                    FOR UPDATE
                    `,
                    [room_id]
                );


            if (room.rows.length === 0) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({

                    success: false,

                    error:
                        "Game room not found"

                });

            }


            const game =
                room.rows[0];


            if (
                game.status !== "waiting"
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({

                    success: false,

                    error:
                        "Game already started"

                });

            }


            const players =
                await client.query(
                    `
                    SELECT *

                    FROM game_room_players

                    WHERE room_id = $1

                    ORDER BY seat
                    `,
                    [room_id]
                );


            if (
                players.rows.length >=
                game.max_players
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({

                    success: false,

                    error:
                        "Game room is full"

                });

            }


            const alreadyJoined =
                players.rows.find(
                    p =>
                        String(
                            p.telegram_id
                        ) ===
                        String(
                            telegramId
                        )
                );


            if (alreadyJoined) {

                await client.query(
                    "COMMIT"
                );

                return res.json({

                    success: true,

                    room_id,

                    status:
                        game.status

                });

            }


            const usedSeats =
                players.rows.map(
                    p => p.seat
                );


            let seat = 1;

            while (
                usedSeats.includes(seat)
            ) {

                seat++;

            }


            await client.query(
                `
                INSERT INTO game_room_players
                (
                    room_id,
                    telegram_id,
                    seat
                )

                VALUES
                (
                    $1,
                    $2,
                    $3
                )
                `,
                [
                    room_id,
                    telegramId,
                    seat
                ]
            );


            const newPlayerCount =
                players.rows.length + 1;


            let newStatus =
                "waiting";


            if (
                newPlayerCount >=
                game.max_players
            ) {

                newStatus =
                    "playing";


                await client.query(
                    `
                    UPDATE game_rooms

                    SET
                        status = 'playing',
                        updated_at =
                            CURRENT_TIMESTAMP

                    WHERE id = $1
                    `,
                    [room_id]
                );

            }


            await client.query(
                "COMMIT"
            );


            res.json({

                success: true,

                room_id,

                status: newStatus,

                seat

            });


        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            console.error(
                "JOIN GAME ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Could not join game"

            });

        } finally {

            client.release();

        }

    }
);


// =====================================================
// GET GAME ROOM
// =====================================================

app.get(
    "/api/game/:room_id",
    authenticateTelegram,
    async (req, res) => {

        try {

            const roomId =
                req.params.room_id;

            const telegramId =
                req.telegramUser.id;


            const result =
                await pool.query(
                    `
                    SELECT
                        gr.id,
                        gr.status,
                        gr.host_telegram_id,
                        gr.max_players,
                        gr.created_at,

                        json_agg(
                            json_build_object(
                                'telegram_id',
                                p.telegram_id,

                                'username',
                                p.username,

                                'first_name',
                                p.first_name,

                                'seat',
                                grp.seat
                            )
                            ORDER BY grp.seat
                        ) AS players

                    FROM game_rooms gr

                    JOIN game_room_players grp
                        ON grp.room_id = gr.id

                    JOIN players p
                        ON p.telegram_id =
                           grp.telegram_id

                    WHERE gr.id = $1

                    GROUP BY gr.id
                    `,
                    [roomId]
                );


            if (result.rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Game room not found"

                });

            }


            const game =
                result.rows[0];


            const isPlayer =
                game.players.some(
                    player =>
                        String(
                            player.telegram_id
                        ) ===
                        String(
                            telegramId
                        )
                );


            if (!isPlayer) {

                return res.status(403).json({

                    success: false,

                    error:
                        "You are not in this game"

                });

            }


            res.json({

                success: true,

                game

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


// =====================================================
// SEND GAME ACTION
// =====================================================

app.post(
    "/api/game/:room_id/action",
    authenticateTelegram,
    async (req, res) => {

        try {

            const roomId =
                req.params.room_id;

            const telegramId =
                req.telegramUser.id;

            const {
                action,
                payload
            } = req.body;


            if (!action) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Action is required"

                });

            }


            // Проверяем участие

            const player =
                await pool.query(
                    `
                    SELECT 1

                    FROM game_room_players

                    WHERE room_id = $1

                    AND telegram_id = $2
                    `,
                    [
                        roomId,
                        telegramId
                    ]
                );


            if (
                player.rows.length === 0
            ) {

                return res.status(403).json({

                    success: false,

                    error:
                        "You are not in this game"

                });

            }


            // Пока просто записываем действие.
            // Здесь позже будет игровая логика
            // Дурака / Heavy Lux Card.

            await pool.query(
                `
                INSERT INTO game_actions
                (
                    room_id,
                    telegram_id,
                    action,
                    payload
                )

                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4
                )
                `,
                [
                    roomId,
                    telegramId,
                    action,
                    payload || {}
                ]
            );


            res.json({

                success: true,

                action

            });


        } catch (error) {

            console.error(
                "GAME ACTION ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Could not process action"

            });

        }

    }
);


// =====================================================
// GET GAME ACTIONS
// =====================================================

app.get(
    "/api/game/:room_id/actions",
    authenticateTelegram,
    async (req, res) => {

        try {

            const roomId =
                req.params.room_id;

            const telegramId =
                req.telegramUser.id;


            const player =
                await pool.query(
                    `
                    SELECT 1

                    FROM game_room_players

                    WHERE room_id = $1

                    AND telegram_id = $2
                    `,
                    [
                        roomId,
                        telegramId
                    ]
                );


            if (
                player.rows.length === 0
            ) {

                return res.status(403).json({

                    success: false,

                    error:
                        "You are not in this game"

                });

            }


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        telegram_id,
                        action,
                        payload,
                        created_at

                    FROM game_actions

                    WHERE room_id = $1

                    ORDER BY id ASC
                    `,
                    [roomId]
                );


            res.json({

                success: true,

                actions:
                    result.rows

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


// =====================================================
// 404
// =====================================================

app.use((req, res) => {

    res.status(404).json({

        success: false,

        error: "Route not found"

    });

});


// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "SERVER ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            error:
                "Internal server error"

        });

    }
);


// =====================================================
// START SERVER
// =====================================================

async function startServer() {

    try {

        await initDatabase();


        app.listen(
            PORT,
            () => {

                console.log(
                    `Heavy Lux Card backend running on port ${PORT}`
                );

            }
        );

    } catch (error) {

        console.error(
            "SERVER START ERROR:",
            error
        );

        process.exit(1);

    }

}


startServer();
