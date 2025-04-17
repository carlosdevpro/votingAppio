const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const playerSchema = new Schema({
  firstName: String,
  lastName: String,
  shirtNumber: Number,
  goals: {
    type: Number,
    default: 0,
  },
  assists: {
    type: Number,
    default: 0,
  },
  yellowCards: {
    type: Number,
    default: 0,
  },
  redCards: {
    type: Number,
    default: 0,
  },
  motmVotes: {
    type: Number,
    default: 0, // 🟢 Parent Man of the Match votes
  },
  motmOpposition: {
    type: Number,
    default: 0, // 🟠 Opposition manager's MOTM awards
  },
  motmWins: {
    type: Number,
    default: 0,
  },
  parentMotmWins: {
    type: Number,
    default: 0,
  },
  position: {
    type: String,
    enum: ['GK', 'DEF', 'MID', 'ST'], // Only allow these values
    required: true,
  },
});

module.exports = mongoose.model('Player', playerSchema);
