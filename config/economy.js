module.exports = {
  CURRENCY: "HC",

  START_MONEY: 10000,

  DAILY_BONUS: 300,

  DAILY_TASK_REWARD: 200,

  FIRST_DAILY_WIN_BONUS: 50,

  FREE_GAME_XP: 10,

  WIN_XP: 40,

  COMMISSION_RATE: 0.10,

  TABLES: {
    FREE: {
      id: "free",
      name: "Свободная игра",
      deposit: 0,
      completionXP: 10,
      winXP: 40
    },

    LOW: {
      id: "low",
      name: "100 HC",
      deposit: 100,
      completionXP: 10,
      winXP: 40
    },

    MEDIUM: {
      id: "medium",
      name: "500 HC",
      deposit: 500,
      completionXP: 15,
      winXP: 50
    },

    HIGH: {
      id: "high",
      name: "2 000 HC",
      deposit: 2000,
      completionXP: 20,
      winXP: 60
    },

    VIP: {
      id: "vip",
      name: "10 000 HC",
      deposit: 10000,
      completionXP: 25,
      winXP: 75
    }
  }
};
