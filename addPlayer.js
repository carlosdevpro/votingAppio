const mongoose = require('mongoose');
const Player = require('./models/player'); // Adjust path if needed

mongoose
  .connect(
    'mongodb+srv://admin:player123@voting-cluster.ycajzdq.mongodb.net/votingApp?retryWrites=true&w=majority&appName=voting-cluster'
  )

  .then(() => console.log('✅ DB connected'))
  .catch((err) => console.error('❌ DB connection error:', err));

const newPlayer = new Player({
  firstName: 'Tommy',
  lastName: 'Jones',
  email: 'tommy.jones@email.com',
  shirtNumber: 14,
  position: 'MID', // ✅ required field
  isPlayer: true,
});

newPlayer
  .save()
  .then(() => {
    console.log('✅ New player added!');
    mongoose.connection.close();
  })
  .catch((err) => {
    console.error('❌ Failed to add player:', err);
    mongoose.connection.close();
  });
