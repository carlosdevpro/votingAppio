// deleteUsers.js
const mongoose = require('mongoose');
const User = require('./models/user'); // adjust path if needed

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://admin:player123@voting-cluster.ycajzdq.mongodb.net/votingApp?retryWrites=true&w=majority&appName=voting-cluster';

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas');

    const result = await User.deleteMany({});
    console.log(`🧹 Deleted ${result.deletedCount} users from the database.`);

    mongoose.connection.close();
  })
  .catch((err) => {
    console.error('❌ Error connecting:', err);
  });
