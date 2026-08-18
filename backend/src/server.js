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

app.get("/", (req, res) => {
    res.json({
        success: true,
        project: "Heavy Lux Card",
        status: "online"
    });
});

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

app.listen(PORT, () => {
    console.log(`Heavy Lux Card backend running on port ${PORT}`);
});
