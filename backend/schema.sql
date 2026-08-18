-- ==========================================
-- HEAVY LUX CARD DATABASE
-- ==========================================

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

-- ==========================================
-- GAME ROOMS
-- ==========================================

CREATE TABLE IF NOT EXISTS game_rooms (
    id UUID PRIMARY KEY,

    status TEXT NOT NULL DEFAULT 'waiting',

    host_telegram_id BIGINT NOT NULL,

    max_players INTEGER NOT NULL DEFAULT 2,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- PLAYERS IN ROOMS
-- ==========================================

CREATE TABLE IF NOT EXISTS game_room_players (
    id SERIAL PRIMARY KEY,

    room_id UUID NOT NULL
        REFERENCES game_rooms(id)
        ON DELETE CASCADE,

    telegram_id BIGINT NOT NULL,

    seat INTEGER NOT NULL,

    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(room_id, telegram_id),
    UNIQUE(room_id, seat)
);

-- ==========================================
-- GAME ACTIONS
-- ==========================================

CREATE TABLE IF NOT EXISTS game_actions (
    id SERIAL PRIMARY KEY,

    room_id UUID NOT NULL
        REFERENCES game_rooms(id)
        ON DELETE CASCADE,

    telegram_id BIGINT NOT NULL,

    action TEXT NOT NULL,

    payload JSONB,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_players_telegram_id
ON players(telegram_id);

CREATE INDEX IF NOT EXISTS idx_game_rooms_status
ON game_rooms(status);

CREATE INDEX IF NOT EXISTS idx_room_players_room
ON game_room_players(room_id);

CREATE INDEX IF NOT EXISTS idx_game_actions_room
ON game_actions(room_id);
