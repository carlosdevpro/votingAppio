require('dotenv').config();

const mongoose = require('mongoose');
const Player = require('./models/player');

mongoose
  .connect(
    process.env.MONGO_URI ||
      'mongodb+srv://admin:player123@voting-cluster.ycajzdq.mongodb.net/votingApp?retryWrites=true&w=majority&appName=voting-cluster'
  )
  .then(() => console.log('✅ Connected to MongoDB Atlas!'))
  .catch((err) => console.error('❌ Connection error:', err));

const players = [
  { firstName: 'Harrison', lastName: 'Shaw', position: 'GK', shirtNumber: 99 },
  { firstName: 'Joshua', lastName: 'Green', position: 'DEF', shirtNumber: 12 },
  { firstName: 'Jack', lastName: 'Wood', position: 'DEF', shirtNumber: 5 },
  {
    firstName: 'Freddie',
    lastName: 'Galloway',
    position: 'DEF',
    shirtNumber: 8,
  },
  {
    firstName: 'Harry',
    lastName: 'Leechwall',
    position: 'MID',
    shirtNumber: 4,
  },
  {
    firstName: 'Logan',
    lastName: 'Hepplestall',
    position: 'MID',
    shirtNumber: 11,
  },
  {
    firstName: 'Theo',
    lastName: 'Swallownest',
    position: 'MID',
    shirtNumber: 6,
  },
  {
    firstName: 'Orryn',
    lastName: 'Leggett',
    position: 'MID',
    shirtNumber: 10,
  },
  {
    firstName: 'Robbie',
    lastName: 'Bray',
    position: 'ST',
    shirtNumber: 15,
  },
  {
    firstName: 'Lucas',
    lastName: 'Lucas',
    position: 'MID',
    shirtNumber: 17,
  },
  { firstName: 'Rares', lastName: 'Costa', position: 'FW', shirtNumber: 13 },
  { firstName: 'Tommy', lastName: 'Ballsack', position: 'A', shirtNumber: 21 },
];

const seedPlayers = async () => {
  console.log('🚀 Seeding/updating players without deleting...');
  for (const data of players) {
    const player = await Player.findOneAndUpdate(
      { firstName: data.firstName, lastName: data.lastName }, // match criteria
      data,
      { new: true, upsert: true }
    );
    console.log(`✅ Upserted: ${player.firstName} ${player.lastName}`);
  }

  const total = await Player.countDocuments();
  console.log(`📦 Total players in DB: ${total}`);
  mongoose.connection.close();
};

seedPlayers();
