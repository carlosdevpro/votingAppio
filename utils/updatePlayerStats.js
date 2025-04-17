const Player = require('../models/player');

async function updatePlayerStats({
  firstHalfScorers,
  secondHalfScorers,
  yellowCards,
  redCards,
  oppositionMotm,
  parentMotm,
}) {
  // Reset all stats (we assume you only call this after clearing existing match impact)
  const playerStatsMap = {};

  const allScorers = [...firstHalfScorers, ...secondHalfScorers];

  // ➕ Goals + Assists
  allScorers.forEach((scorer) => {
    if (!playerStatsMap[scorer.name])
      playerStatsMap[scorer.name] = {
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        motm: 0,
        parentMotm: 0,
      };
    playerStatsMap[scorer.name].goals += scorer.goals || 1;
    if (scorer.assist) {
      if (!playerStatsMap[scorer.assist])
        playerStatsMap[scorer.assist] = {
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
          motm: 0,
          parentMotm: 0,
        };
      playerStatsMap[scorer.assist].assists += 1;
    }
  });

  // 🟨 Yellow Cards
  yellowCards.forEach((entry) => {
    if (!playerStatsMap[entry.name])
      playerStatsMap[entry.name] = {
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        motm: 0,
        parentMotm: 0,
      };
    playerStatsMap[entry.name].yellowCards += 1;
  });

  // 🟥 Red Cards
  redCards.forEach((entry) => {
    if (!playerStatsMap[entry.name])
      playerStatsMap[entry.name] = {
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        motm: 0,
        parentMotm: 0,
      };
    playerStatsMap[entry.name].redCards += 1;
  });

  // 🏆 Man of the Match (Opposition)
  if (oppositionMotm) {
    if (!playerStatsMap[oppositionMotm])
      playerStatsMap[oppositionMotm] = {
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        motm: 0,
        parentMotm: 0,
      };
    playerStatsMap[oppositionMotm].motm += 1;
  }

  // 🏆 Parent Man of the Match
  if (parentMotm) {
    if (!playerStatsMap[parentMotm])
      playerStatsMap[parentMotm] = {
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        motm: 0,
        parentMotm: 0,
      };
    playerStatsMap[parentMotm].parentMotm += 1;
  }

  // 🛠 Update all players in DB
  for (const [name, stats] of Object.entries(playerStatsMap)) {
    await Player.findOneAndUpdate(
      { $expr: { $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, name] } },
      {
        $inc: {
          goals: stats.goals,
          assists: stats.assists,
          yellowCards: stats.yellowCards,
          redCards: stats.redCards,
          motmWins: stats.motm,
          parentMotmWins: stats.parentMotm,
        },
      }
    );
  }
}

module.exports = updatePlayerStats;
