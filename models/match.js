const mongoose = require('mongoose');

const scorerSchema = new mongoose.Schema({
  name: String,
  goals: Number,
  assist: String,
});

const cardSchema = new mongoose.Schema({
  name: String,
});

const matchSchema = new mongoose.Schema({
  homeTeam: String,
  awayTeam: String,
  homeScore: Number,
  awayScore: Number,
  date: { type: Date, default: Date.now },
  matchType: {
    type: String,
    enum: ['League', 'Cup', 'Friendly'],
    default: 'League',
  },
  firstHalfScorers: [scorerSchema],
  secondHalfScorers: [scorerSchema],
  yellowCards: [cardSchema],
  redCards: [cardSchema],

  // NEW fields for Man of the Match
  parentMotm: { type: String, default: '' },
  motmOpposition: { type: String, default: '' },
});

module.exports = mongoose.model('Match', matchSchema);
