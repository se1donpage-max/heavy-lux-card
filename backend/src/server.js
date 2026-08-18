const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// ======================================
// DATABASE
// ======================================

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

        console.log("Database initialized successfully");
    } catch (error) {
        console.error("Database initialization error:", error);
    }
}

// ======================================
// TITLES
// ======================================

function getTitle(level) {
    if (level >= 100) return "Покровитель";
    if (level >= 80) return "Попечитель";
    if (level >= 60) return "Почётный член клуба";
    if (level >= 40) return "Старший член клуба";
    if (level >= 20) return "Член клуба";

    return null;
}

// ======================================
// TELEGRAM INIT DATA VALIDATION
// ======================================

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

    const dataCheckString = Array.from(params.entries())
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

    if (calculatedHash.length !== receivedHash.length) {
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

    const authDate = Number(params.get("auth_date"));

    if (!authDate) {
        return null;
    }

    const currentTime = Math.floor(Date.now() / 1000);

    // Данные старше 24 часов считаем недействительными
    if (currentTime - authDate > 86400) {
        return null;
    }

    const userString = params.get("user");

    if (!userString) {
        return null;
    }

    try {
        return JSON.parse(userString);
    } catch {
        return null;
    }
}

// ======================================
// MAIN
// ======================================

app.get("/", (req, res) => {
    res.json({
        success: true,
        project: "Heavy Lux Card",
        status: "online"
    });
});

// ======================================
// HEALTH
// ======================================

app.get("/api/health", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

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

// ======================================
// TELEGRAM AUTH
// ======================================

app.post("/api/auth", async (req, res) => {
    try {
        const { initData } = req.body;

        const telegramUser = validateTelegramInitData(initData);

        if (!telegramUser) {
            return res.status(401).json({
                success: false,
                error: "Invalid Telegram authentication"
            });
        }

        const telegramId = telegramUser.id;
        const username = telegramUser.username || null;
        const firstName = telegramUser.first_name || null;

        // Проверяем, существует ли игрок
        const existingPlayer = await pool.query(
            "SELECT * FROM players WHERE telegram_id = $1",
            [telegramId]
        );

        if (existingPlayer.rows.length > 0) {
            const player = existingPlayer.rows[0];

            // Обновляем актуальные данные Telegram
            const updatedPlayer = await pool.query(
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

            return res.json({
                success: true,
                new_player: false,
                player: updatedPlayer.rows[0]
            });
        }

        // Создаём нового игрока
        const result = await pool.query(
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
            VALUES ($1, $2, $3, 5000, 0, 1, NULL)
            RETURNING *
            `,
            [
                telegramId,
                username,
                firstName
            ]
        );

        return res.json({
            success: true,
            new_player: true,
            player: result.rows[0]
        });

    } catch (error) {
        console.error("AUTH ERROR:", error);

        res.status(500).json({
            success: false,
            error: "Authentication server error"
        });
    }
});

// ======================================
// GET PLAYER
// ======================================

app.get("/api/player/:telegram_id", async (req, res) => {
    try {
        const { telegram_id } = req.params;

        const result = await pool.query(
            "SELECT * FROM players WHERE telegram_id = $1",
            [telegram_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Player not found"
            });
        }

        const player = result.rows[0];

        player.title = getTitle(player.level);

        res.json({
            success: true,
            player
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Database error"
        });
    }
});

// ======================================
// SERVER
// ======================================

async function startServer() {
    await initDatabase();

    app.listen(PORT, () => {
        console.log(
            `Heavy Lux Card backend running on port ${PORT}`
        );
    });
}

startServer();
