const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// ===============================
// СОЗДАНИЕ ТАБЛИЦЫ ИГРОКОВ
// ===============================

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE,
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

// ===============================
// ТИТУЛ ИГРОКА
// ===============================

function getTitle(level) {
    if (level >= 100) return "Покровитель";
    if (level >= 80) return "Попечитель";
    if (level >= 60) return "Почётный член клуба";
    if (level >= 40) return "Старший член клуба";
    if (level >= 20) return "Член клуба";

    return null;
}

// ===============================
// ГЛАВНАЯ
// ===============================

app.get("/", (req, res) => {
    res.json({
        success: true,
        project: "Heavy Lux Card",
        status: "online"
    });
});

// ===============================
// ПРОВЕРКА СЕРВЕРА И БАЗЫ
// ===============================

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

// ===============================
// ТЕСТОВОЕ СОЗДАНИЕ ИГРОКА
// ===============================

app.post("/api/test-player", async (req, res) => {
    try {
        const {
            telegram_id,
            username,
            first_name
        } = req.body;

        if (!telegram_id) {
            return res.status(400).json({
                success: false,
                error: "telegram_id is required"
            });
        }

        const existingPlayer = await pool.query(
            "SELECT * FROM players WHERE telegram_id = $1",
            [telegram_id]
        );

        if (existingPlayer.rows.length > 0) {
            return res.json({
                success: true,
                new_player: false,
                player: existingPlayer.rows[0]
            });
        }

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
                telegram_id,
                username || null,
                first_name || null
            ]
        );

        res.json({
            success: true,
            new_player: true,
            player: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Database error"
        });
    }
});

// ===============================
// ПОЛУЧЕНИЕ ИГРОКА
// ===============================

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

// ===============================
// ЗАПУСК
// ===============================

async function startServer() {
    await initDatabase();

    app.listen(PORT, () => {
        console.log(
            `Heavy Lux Card backend running on port ${PORT}`
        );
    });
}

startServer();
