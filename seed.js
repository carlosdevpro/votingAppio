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
  { firstName: 'Mason', lastName: 'Blake', position: 'GK', shirtNumber: 1 },
  { firstName: 'Elliot', lastName: 'Bennett', position: 'DEF', shirtNumber: 3 },
  { firstName: 'Liam', lastName: 'Carter', position: 'DEF', shirtNumber: 5 },
  { firstName: 'Nathan', lastName: 'Foster', position: 'DEF', shirtNumber: 7 },
  {
    firstName: 'Finley',
    lastName: 'Armstrong',
    position: 'MID',
    shirtNumber: 8,
  },
  {
    firstName: 'Oscar',
    lastName: 'Hamilton',
    position: 'MID',
    shirtNumber: 10,
  },
  { firstName: 'Reuben', lastName: 'Walsh', position: 'MID', shirtNumber: 11 },
  { firstName: 'Jude', lastName: 'Morris', position: 'MID', shirtNumber: 12 },
  { firstName: 'Zac', lastName: 'Simpson', position: 'ST', shirtNumber: 14 },
  {
    firstName: 'Charlie',
    lastName: 'Preston',
    position: 'MID',
    shirtNumber: 17,
  },
  { firstName: 'Riley', lastName: 'White', position: 'ST', shirtNumber: 19 },
  { firstName: 'Jake', lastName: 'Nelson', position: 'ST', shirtNumber: 21 },
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
