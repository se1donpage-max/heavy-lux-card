const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

require("dotenv").config();


// =========================================================
// CONFIG
// =========================================================

const app = express();

const PORT = process.env.PORT || 3000;


// =========================================================
// MIDDLEWARE
// =========================================================

app.use(cors());

app.use(express.json());


// =========================================================
// DATABASE
// =========================================================

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not configured");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: {
        rejectUnauthorized: false
    }
});


// =========================================================
// GAME CONFIG
// =========================================================

const START_BALANCE = 5000;

const MAX_LEVEL = 100;


// =========================================================
// TITLES
// =========================================================

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


// =========================================================
// TELEGRAM INIT DATA VALIDATION
// =========================================================

function validateTelegramInitData(initData) {

    if (!initData) {
        return null;
    }

    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
        throw new Error(
            "BOT_TOKEN is not configured"
        );
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

    const authDate = Number(
        params.get("auth_date")
    );

    if (!authDate) {
        return null;
    }

    const currentTime =
        Math.floor(Date.now() / 1000);

    // INIT DATA старше 24 часов недействительна
    if (
        currentTime - authDate > 86400
    ) {
        return null;
    }

    // Дата не должна быть сильно в будущем
    if (
        authDate - currentTime > 60
    ) {
        return null;
    }

    const userString =
        params.get("user");

    if (!userString) {
        return null;
    }

    try {

        return JSON.parse(userString);

    } catch {

        return null;

    }
}


// =========================================================
// DATABASE INITIALIZATION
// =========================================================

async function initDatabase() {

    try {

        const schemaPath = path.join(
            __dirname,
            "schema.sql"
        );

        const schema =
            fs.readFileSync(
                schemaPath,
                "utf8"
            );

        await pool.query(schema);

        console.log(
            "Database initialized successfully"
        );

    } catch (error) {

        console.error(
            "Database initialization error:",
            error
        );

        throw error;
    }
}


// =========================================================
// GET PLAYER
// =========================================================

async function getPlayer(
    telegramId
) {

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
        return null;
    }

    const player =
        result.rows[0];

    player.title =
        getTitle(player.level);

    return player;
}


// =========================================================
// CREATE PLAYER
// =========================================================

async function createPlayer(
    telegramUser
) {

    const result =
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
                $5,
                $6,
                $7
            )
            RETURNING *
            `,
            [
                telegramUser.id,

                telegramUser.username ||
                    null,

                telegramUser.first_name ||
                    null,

                START_BALANCE,

                0,

                1,

                null
            ]
        );

    return result.rows[0];
}


// =========================================================
// MAIN
// =========================================================

app.get(
    "/",
    (req, res) => {

        res.json({

            success: true,

            project:
                "Heavy Lux Card",

            status:
                "online"

        });

    }
);


// =========================================================
// HEALTH CHECK
// =========================================================

app.get(
    "/api/health",
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    "SELECT NOW()"
                );

            res.json({

                success: true,

                status:
                    "online",

                database:
                    "connected",

                time:
                    result.rows[0].now

            });

        } catch (error) {

            console.error(
                "HEALTH ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                status:
                    "online",

                database:
                    "error"

            });

        }

    }
);


// =========================================================
// TELEGRAM AUTHORIZATION
// =========================================================

app.post(
    "/api/auth",
    async (req, res) => {

        try {

            const {
                initData
            } = req.body;

            if (!initData) {

                return res.status(400).json({

                    success: false,

                    error:
                        "initData is required"

                });

            }

            const telegramUser =
                validateTelegramInitData(
                    initData
                );

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
                telegramUser.username ||
                null;

            const firstName =
                telegramUser.first_name ||
                null;


            // -------------------------------------------------
            // SEARCH PLAYER
            // -------------------------------------------------

            let player =
                await getPlayer(
                    telegramId
                );


            // -------------------------------------------------
            // NEW PLAYER
            // -------------------------------------------------

            if (!player) {

                player =
                    await createPlayer(
                        telegramUser
                    );

                return res.json({

                    success: true,

                    new_player: true,

                    player

                });

            }


            // -------------------------------------------------
            // UPDATE TELEGRAM DATA
            // -------------------------------------------------

            const updated =
                await pool.query(
                    `
                    UPDATE players

                    SET
                        username = $1,
                        first_name = $2,
                        title = $3

                    WHERE telegram_id = $4

                    RETURNING *
                    `,
                    [
                        username,

                        firstName,

                        getTitle(
                            player.level
                        ),

                        telegramId
                    ]
                );

            player =
                updated.rows[0];


            res.json({

                success: true,

                new_player: false,

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


// =========================================================
// GET PLAYER
// =========================================================

app.get(
    "/api/player/:telegram_id",
    async (req, res) => {

        try {

            const telegramId =
                req.params.telegram_id;

            const player =
                await getPlayer(
                    telegramId
                );

            if (!player) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Player not found"

                });

            }

            res.json({

                success: true,

                player

            });

        } catch (error) {

            console.error(
                "PLAYER ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Database error"

            });

        }

    }
);


// =========================================================
// CREATE GAME ROOM
// =========================================================

app.post(
    "/api/rooms",
    async (req, res) => {

        try {

            const {
                telegram_id,
                bet = 0
            } = req.body;

            if (!telegram_id) {

                return res.status(400).json({

                    success: false,

                    error:
                        "telegram_id is required"

                });

            }

            const player =
                await getPlayer(
                    telegram_id
                );

            if (!player) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Player not found"

                });

            }

            const numericBet =
                Number(bet);

            if (
                !Number.isInteger(
                    numericBet
                ) ||
                numericBet < 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid bet"

                });

            }

            if (
                numericBet >
                Number(player.balance)
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Insufficient balance"

                });

            }


            // -------------------------------------------------
            // CREATE ROOM
            // -------------------------------------------------

            const result =
                await pool.query(
                    `
                    INSERT INTO game_rooms
                    (
                        id,
                        status,
                        max_players,
                        bet,
                        created_by
                    )
                    VALUES
                    (
                        gen_random_uuid(),
                        'waiting',
                        2,
                        $1,
                        $2
                    )
                    RETURNING *
                    `,
                    [
                        numericBet,
                        telegram_id
                    ]
                );

            const room =
                result.rows[0];


            // -------------------------------------------------
            // ADD CREATOR
            // -------------------------------------------------

            await pool.query(
                `
                INSERT INTO game_players
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
                    room.id,
                    telegram_id
                ]
            );


            res.json({

                success: true,

                room

            });

        } catch (error) {

            console.error(
                "CREATE ROOM ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Could not create room"

            });

        }

    }
);


// =========================================================
// GET WAITING ROOMS
// =========================================================

app.get(
    "/api/rooms",
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        r.id,
                        r.status,
                        r.max_players,
                        r.bet,
                        r.created_at,

                        COUNT(gp.id)::INTEGER
                            AS players

                    FROM game_rooms r

                    LEFT JOIN game_players gp
                        ON gp.room_id = r.id

                    WHERE r.status = 'waiting'

                    GROUP BY r.id

                    ORDER BY r.created_at DESC
                    `
                );

            res.json({

                success: true,

                rooms:
                    result.rows

            });

        } catch (error) {

            console.error(
                "ROOMS ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Database error"

            });

        }

    }
);


// =========================================================
// JOIN ROOM
// =========================================================

app.post(
    "/api/rooms/:roomId/join",
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const {
                telegram_id
            } = req.body;

            if (!telegram_id) {

                return res.status(400).json({

                    success: false,

                    error:
                        "telegram_id is required"

                });

            }

            await client.query(
                "BEGIN"
            );


            // -------------------------------------------------
            // ROOM
            // -------------------------------------------------

            const roomResult =
                await client.query(
                    `
                    SELECT *
                    FROM game_rooms
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        req.params.roomId
                    ]
                );

            if (
                roomResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({

                    success: false,

                    error:
                        "Room not found"

                });

            }

            const room =
                roomResult.rows[0];


            if (
                room.status !== "waiting"
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


            // -------------------------------------------------
            // PLAYER
            // -------------------------------------------------

            const player =
                await getPlayer(
                    telegram_id
                );

            if (!player) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({

                    success: false,

                    error:
                        "Player not found"

                });

            }


            // -------------------------------------------------
            // CHECK EXISTING
            // -------------------------------------------------

            const existing =
                await client.query(
                    `
                    SELECT *
                    FROM game_players
                    WHERE room_id = $1
                    AND telegram_id = $2
                    `,
                    [
                        room.id,
                        telegram_id
                    ]
                );

            if (
                existing.rows.length > 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({

                    success: false,

                    error:
                        "Player already joined"

                });

            }


            // -------------------------------------------------
            // COUNT PLAYERS
            // -------------------------------------------------

            const countResult =
                await client.query(
                    `
                    SELECT COUNT(*)::INTEGER
                    FROM game_players
                    WHERE room_id = $1
                    `,
                    [
                        room.id
                    ]
                );

            const playerCount =
                countResult.rows[0].count;

            if (
                playerCount >=
                room.max_players
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({

                    success: false,

                    error:
                        "Room is full"

                });

            }


            // -------------------------------------------------
            // JOIN
            // -------------------------------------------------

            const seat =
                playerCount + 1;

            await client.query(
                `
                INSERT INTO game_players
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
                    room.id,
                    telegram_id,
                    seat
                ]
            );


            // -------------------------------------------------
            // START WHEN 2 PLAYERS
            // -------------------------------------------------

            if (
                seat >= room.max_players
            ) {

                await client.query(
                    `
                    UPDATE game_rooms
                    SET
                        status = 'playing',
                        started_at = CURRENT_TIMESTAMP

                    WHERE id = $1
                    `,
                    [
                        room.id
                    ]
                );

            }


            await client.query(
                "COMMIT"
            );


            const updatedRoom =
                await pool.query(
                    `
                    SELECT *
                    FROM game_rooms
                    WHERE id = $1
                    `,
                    [
                        room.id
                    ]
                );


            res.json({

                success: true,

                room:
                    updatedRoom.rows[0]

            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            console.error(
                "JOIN ROOM ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Could not join room"

            });

        } finally {

            client.release();

        }

    }
);


// =========================================================
// ROOM DETAILS
// =========================================================

app.get(
    "/api/rooms/:roomId",
    async (req, res) => {

        try {

            const roomResult =
                await pool.query(
                    `
                    SELECT *
                    FROM game_rooms
                    WHERE id = $1
                    `,
                    [
                        req.params.roomId
                    ]
                );

            if (
                roomResult.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Room not found"

                });

            }

            const playersResult =
                await pool.query(
                    `
                    SELECT
                        gp.seat,
                        gp.telegram_id,
                        gp.is_ready,
                        gp.is_winner,

                        p.username,
                        p.first_name,
                        p.level,
                        p.title

                    FROM game_players gp

                    JOIN players p
                        ON p.telegram_id =
                           gp.telegram_id

                    WHERE gp.room_id = $1

                    ORDER BY gp.seat
                    `,
                    [
                        req.params.roomId
                    ]
                );


            res.json({

                success: true,

                room:
                    roomResult.rows[0],

                players:
                    playersResult.rows

            });

        } catch (error) {

            console.error(
                "ROOM DETAILS ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Database error"

            });

        }

    }
);


// =========================================================
// 404
// =========================================================

app.use(
    (req, res) => {

        res.status(404).json({

            success: false,

            error:
                "Endpoint not found"

        });

    }
);


// =========================================================
// ERROR HANDLER
// =========================================================

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


// =========================================================
// START SERVER
// =========================================================

async function startServer() {

    try {

        await initDatabase();

        app.listen(
            PORT,
            () => {

                console.log(
                    "================================="
                );

                console.log(
                    "Heavy Lux Card backend"
                );

                console.log(
                    `Server: http://localhost:${PORT}`
                );

                console.log(
                    "Database: connected"
                );

                console.log(
                    "Telegram Auth: enabled"
                );

                console.log(
                    "================================="
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
