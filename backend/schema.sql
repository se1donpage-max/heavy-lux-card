-- =========================================================
-- HEAVY LUX CARD
-- DATABASE SCHEMA
-- =========================================================

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

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_players_telegram_id
ON players(telegram_id);


-- =========================================================
-- GAME ROOMS
-- =========================================================

CREATE TABLE IF NOT EXISTS game_rooms (
    id UUID PRIMARY KEY,

    status TEXT NOT NULL DEFAULT 'waiting',

    max_players INTEGER NOT NULL DEFAULT 2,

    bet BIGINT NOT NULL DEFAULT 0,

    created_by BIGINT NOT NULL
        REFERENCES players(telegram_id),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    started_at TIMESTAMP,

    finished_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_game_rooms_status
ON game_rooms(status);


-- =========================================================
-- PLAYERS IN ROOMS
-- =========================================================

CREATE TABLE IF NOT EXISTS game_players (
    id SERIAL PRIMARY KEY,

    room_id UUID NOT NULL
        REFERENCES game_rooms(id)
        ON DELETE CASCADE,

    telegram_id BIGINT NOT NULL
        REFERENCES players(telegram_id)
        ON DELETE CASCADE,

    seat INTEGER NOT NULL,

    is_ready BOOLEAN NOT NULL DEFAULT FALSE,

    is_winner BOOLEAN NOT NULL DEFAULT FALSE,

    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(room_id, telegram_id),

    UNIQUE(room_id, seat)
);

CREATE INDEX IF NOT EXISTS idx_game_players_room
ON game_players(room_id);


-- =========================================================
-- GAME MOVES
-- =========================================================

CREATE TABLE IF NOT EXISTS game_moves (
    id BIGSERIAL PRIMARY KEY,

    room_id UUID NOT NULL
        REFERENCES game_rooms(id)
        ON DELETE CASCADE,

    telegram_id BIGINT NOT NULL
        REFERENCES players(telegram_id)
        ON DELETE CASCADE,

    action TEXT NOT NULL,

    card JSONB,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_game_moves_room
ON game_moves(room_id);


-- =========================================================
-- TRANSACTIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,

    telegram_id BIGINT NOT NULL
        REFERENCES players(telegram_id)
        ON DELETE CASCADE,

    amount BIGINT NOT NULL,

    balance_before BIGINT NOT NULL,

    balance_after BIGINT NOT NULL,

    type TEXT NOT NULL,

    description TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_player
ON transactions(telegram_id);


-- =========================================================
-- UPDATED_AT
-- =========================================================

CREATE OR REPLACE FUNCTION update_players_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS players_updated_at
ON players;

CREATE TRIGGER players_updated_at
BEFORE UPDATE ON players
FOR EACH ROW
EXECUTE FUNCTION update_players_updated_at();
