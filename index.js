require('dotenv').config();
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const crypto = require('crypto');
const User = require('./models/user');
const Player = require('./models/player');
const Match = require('./models/match');
const { sendPasswordReset } = require('./mailer');
const { sendVoteReminder, sendFinalReminder } = require('./sms');
const updatePlayerStats = require('./utils/updatePlayerStats');
const { isLoggedIn } = require('./middleware');

app.locals.teamName = 'Your team name...'; // You can later replace this with a DB config

// 🟢 Connect to MongoDB
console.log('Using MONGO_URI:', process.env.MONGO_URI);
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MONGO CONNECTION OPEN!'))
  .catch((err) => console.log('❌ MONGO CONNECTION ERROR:', err));

// ✅ Set up view engine and middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: true,
  })
);

// ✅ Flash (must come after session)
app.use(flash());

// ✅ Load currentUser and messages into res.locals
app.use(async (req, res, next) => {
  if (req.session.user_id) {
    try {
      const user = await User.findById(req.session.user_id);
      res.locals.currentUser = user;
    } catch (err) {
      console.error('❌ Error loading user:', err);
      res.locals.currentUser = null;
    }
  } else {
    res.locals.currentUser = null;
  }
  res.locals.messages = req.flash();
  next();
});

// 🛡 Route protection
function requireLogin(req, res, next) {
  if (!req.session.user_id) {
    req.flash('error', 'You must be logged in.');
    return res.redirect('/login');
  }
  next();
}

const requireAdmin = async (req, res, next) => {
  const user = await User.findById(req.session.user_id);
  if (!user || !user.isAdmin) {
    req.flash('error', 'Unauthorized access');
    return res.redirect('/');
  }
  next();
};

// 🌐 Homepage
app.get('/', async (req, res) => {
  let user = null;
  let showBecomeAdmin = false;
  const error = req.flash('error'); // ✅ grab flash error message
  const success = req.flash('success'); // if needed

  if (req.session.user_id) {
    user = await User.findById(req.session.user_id).populate('linkedPlayer');
  }

  if (!(await User.exists({ isMainAdmin: true })) && user) {
    showBecomeAdmin = true;
  }

  res.render('home', { user, showBecomeAdmin, error, success });
});

// ✅ Main Admin Setup Route
app.post('/become-main-admin', async (req, res) => {
  const { adminPassword } = req.body;

  if (adminPassword !== process.env.MAIN_ADMIN_PASSWORD) {
    req.flash('error', 'Incorrect admin password');
    return res.redirect('/');
  }

  const existing = await User.findOne({ isMainAdmin: true });
  if (existing) {
    req.flash('error', 'Main admin already set up.');
    return res.redirect('/');
  }

  // Fetch current user
  const user = await User.findById(req.session.user_id);
  if (!user) {
    req.flash('error', 'You must be logged in to become admin.');
    return res.redirect('/');
  }

  user.isAdmin = true;
  user.isMainAdmin = true;
  await user.save();

  req.flash('success', 'You are now the main admin!');
  res.redirect('/admin');
});

// 📝 Registration pages
app.get('/register', (req, res) => res.render('register'));

app.get('/register/parent', async (req, res) => {
  const players = await Player.find();
  const users = await User.find({ isParent: true }).populate('linkedPlayer');

  const playerCounts = {};
  users.forEach((user) => {
    const id = user.linkedPlayer?._id?.toString();
    if (id) playerCounts[id] = (playerCounts[id] || 0) + 1;
  });

  const availablePlayers = players.filter((p) => {
    const count = playerCounts[p._id.toString()] || 0;
    return count < 2;
  });

  res.render('registerParent', { players: availablePlayers });
});

app.get('/register/player', async (req, res) => {
  const allPlayers = await Player.find().sort({ firstName: 1 });
  const registeredUsers = await User.find({ isPlayer: true }, 'linkedPlayer');
  const usedIds = registeredUsers.map((u) => u.linkedPlayer.toString());

  const availablePlayers = allPlayers.filter(
    (p) => !usedIds.includes(p._id.toString())
  );
  res.render('registerPlayer', { players: availablePlayers });
});

// ✅ Register routes
function formatUKNumber(number) {
  return number.replace(/^0/, '+44').replace(/\s+/g, '');
}

app.post('/register/parent', async (req, res) => {
  let { email, password, firstName, lastName, linkedPlayer, mobileNumber } =
    req.body;

  mobileNumber = formatUKNumber(mobileNumber);

  try {
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      linkedPlayer,
      mobileNumber,
      isParent: true,
    });

    await user.save();
    req.session.user_id = user._id;
    req.flash('success', 'Parent registered!');
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Email already in use or error occurred.');
    res.redirect('/register/parent');
  }
});

app.post('/register/player', async (req, res) => {
  const { email, password, linkedPlayer, shirtNumber } = req.body;
  const player = await Player.findById(linkedPlayer);

  if (!player || player.shirtNumber !== parseInt(shirtNumber)) {
    req.flash('error', 'Invalid player or shirt number.');
    return res.redirect('/register/player');
  }

  const existing = await User.findOne({ linkedPlayer, isPlayer: true });
  if (existing) {
    req.flash('error', 'Player already registered.');
    return res.redirect('/register/player');
  }

  const user = new User({
    email,
    password,
    linkedPlayer,
    isPlayer: true,
    firstName: player.firstName,
    lastName: player.lastName,
  });

  await user.save();
  req.session.user_id = user._id;
  req.flash('success', 'Player account created!');
  res.redirect('/');
});

// 🛠 Admin dashboard
app.get('/admin', requireLogin, requireAdmin, async (req, res) => {
  const parents = await User.find({ isParent: true }).populate('linkedPlayer');
  const players = await User.find({ isPlayer: true }).populate('linkedPlayer');

  const now = new Date();
  const threshold = 2 * 60 * 1000;

  const withStatus = (users) =>
    users.map((u) => {
      const isOnline = u.lastSeen && now - u.lastSeen < threshold;
      return { ...u.toObject(), isOnline };
    });

  res.render('admin', {
    parents: withStatus(parents),
    players: withStatus(players),
  });
});

// ✅ Logout
app.post('/logout', async (req, res) => {
  const user = await User.findById(req.session.user_id);
  if (user) {
    user.isOnline = false;
    user.lastActive = new Date();
    await user.save();
  }
  req.session.user_id = null;
  req.flash('success', 'Logged out.');
  res.redirect('/login');
});

// ✅ Login
app.get('/login/player', (req, res) => res.render('playerLogin'));

app.post('/login/player', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, isPlayer: true });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    req.flash('error', 'Invalid credentials.');
    return res.redirect('/login/player');
  }

  req.session.user_id = user._id;
  user.isOnline = true;
  user.lastSeen = new Date();
  await user.save();

  res.redirect('/');
});

// ✅ Render the login page
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/login');
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    req.flash('error', 'Incorrect password.');
    return res.redirect('/login');
  }

  // ✅ Set session
  req.session.user_id = user._id;

  // ✅ Set online status
  user.isOnline = true;
  user.lastActive = new Date();
  await user.save();

  console.log('✅ Logged in as:', {
    _id: user._id,
    email: user.email,
    isAdmin: user.isAdmin,
  });
  console.log('➡️ Session object:', req.session);

  // 🧠 Save session before redirect
  req.session.save((err) => {
    if (err) {
      console.error('❌ Session save error:', err);
      req.flash('error', 'Session error. Please try again.');
      return res.redirect('/login');
    }

    // ✅ Send admin to /admin, everyone else to /
    res.redirect('/');
  });
});

// ✅ Voting GET route - only opens after a match ends and before a winner is revealed
app.get('/vote', isLoggedIn, async (req, res) => {
  const user = await User.findById(req.session.user_id);

  if (!user || !user.isParent) {
    req.flash('error', 'Only parents can vote.');
    return res.redirect('/');
  }

  // Only allow voting on today's match with no parent MOTM submitted
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const match = await Match.findOne({
    date: { $gte: today },
    parentMotm: null,
  }).sort({ date: -1 });

  if (!match) {
    req.flash('error', '🕓 No match available to vote on currently.');
    return res.redirect('/');
  }

  if (user.hasVoted) {
    req.flash('error', 'You have already voted.');
    return res.redirect('/');
  }

  const players = await Player.find({});
  res.render('vote', { user, players, matchAvailable: true });
});

app.post('/vote', isLoggedIn, async (req, res) => {
  const user = await User.findById(req.session.user_id);

  if (!user || !user.isParent || user.hasVoted) {
    req.flash('error', 'You are not eligible to vote or have already voted.');
    return res.redirect('/');
  }

  const { playerId } = req.body;
  if (!playerId) {
    req.flash('error', 'No player selected.');
    return res.redirect('/vote');
  }

  const player = await Player.findById(playerId);
  if (!player) {
    req.flash('error', 'Selected player not found.');
    return res.redirect('/vote');
  }

  user.votedFor = player._id;
  user.hasVoted = true;
  await user.save();

  req.flash('success', '✅ Your vote has been submitted.');
  res.redirect('/');
});

// Reset votes
app.post('/admin/reset-votes', requireLogin, requireAdmin, async (req, res) => {
  try {
    // ✅ Reset vote status for all parents
    await User.updateMany({ isParent: true }, { $set: { hasVoted: false } });

    // ✅ Reset all player vote counts to 0
    await Player.updateMany({}, { $set: { votes: 0 } });

    req.flash(
      'success',
      '✅ All parent votes and leaderboard totals have been reset!'
    );
  } catch (err) {
    console.error('❌ Failed to reset votes:', err);
    req.flash('error', 'Something went wrong while resetting votes.');
  }

  res.redirect('/admin');
});

// Leaderboards
app.get('/leaderboard', async (req, res) => {
  let players = await Player.aggregate([
    {
      $addFields: {
        totalMotm: { $add: ['$motmOpposition', '$parentMotmWins'] },
      },
    },
  ]);

  const allZero = players.every(
    (p) => p.motmOpposition === 0 && p.parentMotmWins === 0
  );

  if (allZero) {
    players.sort((a, b) =>
      (a.firstName + ' ' + a.lastName).localeCompare(
        b.firstName + ' ' + b.lastName
      )
    );
  } else {
    players.sort((a, b) => b.totalMotm - a.totalMotm);
  }

  // ⏳ Voting leaderboard (live votes)
  const voteLeaderboard = await Player.find({ motmVotes: { $gt: 0 } }).sort({
    motmVotes: -1,
  });

  res.render('leaderboard', { players, voteLeaderboard });
});

// GET /stats
app.get('/stats', requireLogin, async (req, res) => {
  // Check if anyone has stats
  const statPlayers = await Player.find({
    $or: [
      { goals: { $gt: 0 } },
      { assists: { $gt: 0 } },
      { motmOpposition: { $gt: 0 } },
      { parentMotmWins: { $gt: 0 } },
      { yellowCards: { $gt: 0 } },
      { redCards: { $gt: 0 } },
    ],
  });

  // 🟢 If players have stats, sort by goals descending
  const allPlayers = statPlayers.length
    ? await Player.find().sort({ goals: -1, assists: -1 })
    : await Player.find().sort({ firstName: 1, lastName: 1 }); // default alpha

  const topGoals = await Player.find({ goals: { $gt: 0 } })
    .sort({ goals: -1 })
    .limit(3);

  const topAssists = await Player.find({ assists: { $gt: 0 } })
    .sort({ assists: -1 })
    .limit(3);

  const combinedMotm = await Player.aggregate([
    {
      $addFields: {
        totalMotm: {
          $add: ['$motmOpposition', '$parentMotmWins'],
        },
      },
    },
    {
      $match: {
        totalMotm: { $gt: 0 },
      },
    },
    { $sort: { totalMotm: -1 } },
    { $limit: 3 },
  ]);

  res.render('stats', {
    allPlayers,
    topGoals,
    topAssists,
    combinedMotm,
    messages: req.flash(),
  });
});

// Edit Stats
app.get('/admin/stats-edit', requireLogin, requireAdmin, async (req, res) => {
  try {
    const players = await Player.find().sort({ firstName: 1 });
    res.render('adminStatsEdit', { players });
  } catch (err) {
    console.error('❌ Failed to load player stats for editing:', err);
    req.flash('error', 'Something went wrong loading the stats page.');
    res.redirect('/admin');
  }
});

app.post('/admin/stats-edit', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { stats } = req.body;

    for (const playerId in stats) {
      const { goals, assists, motmWins } = stats[playerId];

      await Player.findByIdAndUpdate(playerId, {
        goals: parseInt(goals),
        assists: parseInt(assists),
        motmWins: parseInt(motmWins),
      });
    }

    req.flash('success', '✅ Player stats updated!');
  } catch (err) {
    console.error('❌ Failed to update player stats:', err);
    req.flash('error', 'Something went wrong while updating stats.');
  }

  res.redirect('/admin/stats-edit');
});

/// 🔐 Admin-only route with secret code to reset all player stats
app.get('/admin/reset-stats', requireLogin, requireAdmin, (req, res) => {
  res.render('adminResetStats');
});

app.post(
  '/admin/reset-player-stats',
  requireLogin,
  requireAdmin,
  async (req, res) => {
    try {
      await Player.updateMany(
        {},
        {
          $set: {
            goals: 0,
            assists: 0,
            yellowCards: 0,
            redCards: 0,
            motmOpposition: 0, // 🟢 THIS is the real field being used
            parentMotmWins: 0,
            // 🏅 Parents' MoTM
          },
        }
      );

      req.flash('success', '✅ All player stats have been reset.');
      res.redirect('/stats'); // Or redirect wherever you like
    } catch (err) {
      console.error('❌ Failed to reset stats:', err);
      req.flash('error', 'Something went wrong while resetting stats.');
      res.redirect('/admin');
    }
  }
);

app.post('/vote', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user_id);

  // Block players
  if (!user || user.isPlayer) {
    req.flash('error', 'Players are not allowed to vote.');
    return res.redirect('/');
  }

  // If already voted, stop here — no other logic should run
  if (user.hasVoted) {
    req.flash('error', 'You have already voted!');
    return res.redirect('/vote');
  }

  // 🟢 This block only runs once per user
  try {
    await Player.findByIdAndUpdate(req.body.playerId, { $inc: { votes: 1 } });
    user.hasVoted = true;
    await user.save();
    req.flash('success', '✅ Your vote has been submitted.');
    return res.redirect('/vote');
  } catch (err) {
    console.error('❌ Vote submission error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    return res.redirect('/vote');
  }
});

// Logout
app.post('/logout', async (req, res) => {
  const user = await User.findById(req.session.user_id);
  if (user) {
    user.isOnline = false;
    user.lastActive = new Date();
    await user.save();
  }
  req.session.user_id = null;
  req.flash('success', 'Logged out successfully.');
  res.redirect('/login');
});

// Admin: Send SMS to Individual Parent
app.post(
  '/admin/send-reminder/:id',
  requireLogin,
  requireAdmin,
  async (req, res) => {
    try {
      const parent = await User.findById(req.params.id).populate(
        'linkedPlayer'
      );

      if (!parent || !parent.mobileNumber || !parent.linkedPlayer) {
        req.flash('error', 'Parent or player not found.');
        return res.redirect('/admin');
      }

      const formatUKNumber = (number) =>
        number.replace(/^0/, '+44').replace(/\s+/g, '');

      const to = formatUKNumber(parent.mobileNumber);
      const from = process.env.TWILIO_PHONE_NUMBER;

      if (to === from) {
        req.flash('error', 'Cannot send SMS to your own number.');
        return res.redirect('/admin');
      }

      await sendFinalReminder(to, parent.linkedPlayer.firstName);

      req.flash(
        'success',
        `📩 Final reminder sent to ${parent.firstName} ${parent.lastName}`
      );
    } catch (err) {
      console.error('❌ Failed to send individual SMS reminder:', err);
      req.flash('error', 'Something went wrong sending the SMS.');
    }

    res.redirect('/admin');
  }
);

app.get('/admin/create-match', requireLogin, requireAdmin, async (req, res) => {
  try {
    const players = await Player.find({});
    res.render('createMatch', { messages: req.flash(), players });
  } catch (err) {
    console.error('❌ Failed to load players:', err);
    req.flash('error', 'Could not load players for match creation.');
    res.redirect('/admin');
  }
});

// POST route to show the match creation form
app.post(
  '/admin/create-match',
  requireLogin,
  requireAdmin,
  async (req, res) => {
    try {
      const {
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        scorers,
        yellowCards,
        redCards,
      } = req.body;

      const newMatch = new Match({
        homeTeam,
        awayTeam,
        homeScore: parseInt(homeScore),
        awayScore: parseInt(awayScore),
        scorers: scorers ? JSON.parse(scorers) : [],
        yellowCards: yellowCards ? JSON.parse(yellowCards) : [], // ✅
        redCards: redCards ? JSON.parse(redCards) : [], // ✅
        date: req.body.date || Date.now(),
      });

      await newMatch.save();

      req.flash('success', '✅ Match created successfully.');
      res.redirect('/matches');
    } catch (err) {
      console.error('❌ Failed to save match:', err);
      req.flash('error', 'Something went wrong saving the match.');
      res.redirect('/admin/create-match');
    }
  }
);

// Show all saved matches
app.get('/matches', async (req, res) => {
  const matches = await Match.find().sort({ date: -1 }).populate('parentMotm'); // ✅ allows match.parentMotm.firstName to work

  console.log('✅ Current user:', res.locals.currentUser?.email);

  res.render('matchResults', {
    matches,
    currentUser: res.locals.currentUser,
    messages: req.flash(),
  });
});

// ✅ DELETE route for a single match
// ✅ DELETE route for a single match
app.delete(
  '/admin/matches/:id',
  requireLogin,
  requireAdmin,
  async (req, res) => {
    try {
      const match = await Match.findById(req.params.id);
      if (!match) {
        req.flash('error', 'Match not found.');
        return res.redirect('/matches');
      }

      // ✅ Combine scorers for stat reversal
      const allScorers = [
        ...(match.firstHalfScorers || []),
        ...(match.secondHalfScorers || []),
      ];

      for (const s of allScorers) {
        const player = await Player.findOne({
          $expr: {
            $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, s.name],
          },
        });
        if (player) {
          player.goals = Math.max((player.goals || 0) - 1, 0);
          await player.save();
        }

        if (s.assist) {
          const assister = await Player.findOne({
            $expr: {
              $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, s.assist],
            },
          });
          if (assister) {
            assister.assists = Math.max((assister.assists || 0) - 1, 0);
            await assister.save();
          }
        }
      }

      // ✅ Revert yellow cards
      for (const yc of match.yellowCards || []) {
        const player = await Player.findOne({
          $expr: {
            $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, yc.name],
          },
        });
        if (player) {
          player.yellowCards = Math.max((player.yellowCards || 0) - 1, 0);
          await player.save();
        }
      }

      // ✅ Revert red cards
      for (const rc of match.redCards || []) {
        const player = await Player.findOne({
          $expr: {
            $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, rc.name],
          },
        });
        if (player) {
          player.redCards = Math.max((player.redCards || 0) - 1, 0);
          await player.save();
        }
      }

      // ✅ Revert Opposition MOTM
      if (match.motmOpposition) {
        const player = await Player.findOne({
          $expr: {
            $eq: [
              { $concat: ['$firstName', ' ', '$lastName'] },
              match.motmOpposition,
            ],
          },
        });
        if (player) {
          player.motmOpposition = Math.max((player.motmOpposition || 0) - 1, 0);
          await player.save();
        }
      }

      // ✅ Revert Parent MOTM (including joint winners)
      if (match.parentMotm && typeof match.parentMotm === 'string') {
        const names = match.parentMotm
          .replace(' (Joint Winners)', '')
          .split(', ')
          .map((n) => n.trim());

        for (const fullName of names) {
          const player = await Player.findOne({
            $expr: {
              $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, fullName],
            },
          });
          if (player) {
            player.parentMotmWins = Math.max(
              (player.parentMotmWins || 0) - 1,
              0
            );
            await player.save();
          }
        }
      }

      // ✅ Finally delete the match
      await Match.findByIdAndDelete(req.params.id);
      req.flash('success', '✅ Match and all related stats deleted!');
      res.redirect('/matches');
    } catch (err) {
      console.error('❌ Error deleting match and stats:', err);
      req.flash('error', 'Something went wrong while deleting the match.');
      res.redirect('/matches');
    }
  }
);

// // ✅ GET route to render edit form
// app.get(
//   '/admin/matches/:id/edit',
//   requireLogin,
//   requireAdmin,
//   async (req, res) => {
//     try {
//       const match = await Match.findById(req.params.id);
//       const players = await Player.find({}); // ✅ Fetch players for dropdown

//       if (!match) throw new Error('Match not found');

//       res.render('editMatch', {
//         match,
//         players, // ✅ Pass players to the EJS view
//         messages: req.flash(),
//       });
//     } catch (err) {
//       console.error('❌ Failed to load match edit page:', err);
//       req.flash('error', 'Could not load match for editing.');
//       res.redirect('/matches');
//     }
//   }
// );

// ✅ PUT route to update a match
// ✅ PUT route with automatic stat updates
// app.put('/admin/matches/:id', requireLogin, requireAdmin, async (req, res) => {
//   try {
//     const {
//       homeTeam,
//       awayTeam,
//       homeScore,
//       awayScore,
//       firstHalfScorers,
//       secondHalfScorers,
//       yellowCards,
//       redCards,
//       motmOpposition,
//       parentsMotm,
//     } = req.body;

//     // Parse JSON safely
//     const parsedFirstHalf = firstHalfScorers
//       ? JSON.parse(firstHalfScorers)
//       : [];
//     const parsedSecondHalf = secondHalfScorers
//       ? JSON.parse(secondHalfScorers)
//       : [];
//     const parsedYellows = yellowCards ? JSON.parse(yellowCards) : [];
//     const parsedReds = redCards ? JSON.parse(redCards) : [];

//     // 🧹 Revert stats by finding the original match first
//     const existingMatch = await Match.findById(req.params.id);

//     if (existingMatch) {
//       const allOldScorers = [
//         ...(existingMatch.firstHalfScorers || []),
//         ...(existingMatch.secondHalfScorers || []),
//       ];

//       for (const s of allOldScorers) {
//         const player = await Player.findOne({ fullName: s.name });
//         if (player) {
//           player.goals -= s.goals || 1;
//           if (s.assist) player.assists -= 1;
//           await player.save();
//         }
//       }

//       for (const y of existingMatch.yellowCards || []) {
//         const player = await Player.findOne({ fullName: y.name });
//         if (player) {
//           player.yellowCards -= 1;
//           await player.save();
//         }
//       }

//       for (const r of existingMatch.redCards || []) {
//         const player = await Player.findOne({ fullName: r.name });
//         if (player) {
//           player.redCards -= 1;
//           await player.save();
//         }
//       }

//       if (existingMatch.motmOpposition) {
//         const player = await Player.findOne({
//           fullName: existingMatch.motmOpposition,
//         });
//         if (player) {
//           player.motmOpposition -= 1;
//           await player.save();
//         }
//       }

//       if (existingMatch.parentsMotm) {
//         const player = await Player.findOne({
//           fullName: existingMatch.parentsMotm,
//         });
//         if (player) {
//           player.motmParents -= 1;
//           await player.save();
//         }
//       }
//     }

//     // 🧮 Update stats from new input
//     const allNewScorers = [...parsedFirstHalf, ...parsedSecondHalf];
//     for (const s of allNewScorers) {
//       const player = await Player.findOne({ fullName: s.name });
//       if (player) {
//         player.goals += s.goals || 1;
//         if (s.assist) {
//           const assister = await Player.findOne({ fullName: s.assist });
//           if (assister) {
//             assister.assists += 1;
//             await assister.save();
//           }
//         }
//         await player.save();
//       }
//     }

//     for (const y of parsedYellows) {
//       const player = await Player.findOne({ fullName: y.name });
//       if (player) {
//         player.yellowCards += 1;
//         await player.save();
//       }
//     }

//     for (const r of parsedReds) {
//       const player = await Player.findOne({ fullName: r.name });
//       if (player) {
//         player.redCards += 1;
//         await player.save();
//       }
//     }

//     if (motmOpposition) {
//       const player = await Player.findOne({ fullName: motmOpposition });
//       if (player) {
//         player.motmOpposition += 1;
//         await player.save();
//       }
//     }

//     if (parentsMotm) {
//       const player = await Player.findOne({ fullName: parentsMotm });
//       if (player) {
//         player.motmParents += 1;
//         await player.save();
//       }
//     }

//     // ✅ Save updated match
//     await Match.findByIdAndUpdate(req.params.id, {
//       homeTeam,
//       awayTeam,
//       homeScore: parseInt(homeScore),
//       awayScore: parseInt(awayScore),
//       firstHalfScorers: parsedFirstHalf,
//       secondHalfScorers: parsedSecondHalf,
//       yellowCards: parsedYellows,
//       redCards: parsedReds,
//       motmOpposition,
//       parentsMotm,
//     });

//     req.flash('success', '✅ Match updated successfully and stats adjusted.');
//     res.redirect('/matches');
//   } catch (err) {
//     console.error('❌ Failed to update match:', err);
//     req.flash('error', 'Something went wrong updating the match.');
//     res.redirect('/matches');
//   }
// });

// ✅ DELETE player and linked parents
app.delete(
  '/admin/players/:id',
  requireLogin,
  requireAdmin,
  async (req, res) => {
    try {
      const player = await Player.findById(req.params.id);
      if (!player) {
        req.flash('error', 'Player not found.');
        return res.redirect('/admin');
      }

      // 🧹 Remove all parent users linked to this player
      await User.deleteMany({ linkedPlayer: player._id });

      // 🗑 Delete the player
      await Player.findByIdAndDelete(player._id);
      console.log(`🔁 Deleting player ${player.firstName} ${player.lastName}`);
      console.log(`🔁 Deleting parents linked to player ID: ${player._id}`);

      req.flash('success', 'Player and linked parents deleted successfully.');
      res.redirect('/admin');
    } catch (err) {
      console.error('❌ Error deleting player and parents:', err);
      req.flash('error', 'Something went wrong deleting the player.');
      res.redirect('/admin');
    }
  }
);

// ✅ GET Live Match Page
app.get('/admin/live-match', requireLogin, requireAdmin, async (req, res) => {
  const players = await Player.find({});
  res.render('liveMatch', { players, messages: req.flash() });
});

app.post('/admin/live-match/end', async (req, res) => {
  try {
    const {
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      matchType,
      firstHalfScorers,
      secondHalfScorers,
      yellowCards,
      redCards,
      motmOpposition, // ✅ corrected this
      parentsMotm,
    } = req.body;

    const match = new Match({
      homeTeam,
      awayTeam,
      homeScore: parseInt(homeScore),
      awayScore: parseInt(awayScore),
      matchType,
      firstHalfScorers: JSON.parse(firstHalfScorers),
      secondHalfScorers: JSON.parse(secondHalfScorers),
      yellowCards: JSON.parse(yellowCards),
      redCards: JSON.parse(redCards),
      motmOpposition,
      parentMotm: null,
      date: new Date(),
    });

    await match.save();

    const allScorers = [
      ...JSON.parse(firstHalfScorers),
      ...JSON.parse(secondHalfScorers),
    ];

    for (const scorer of allScorers) {
      const player = await Player.findOne({
        $expr: {
          $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, scorer.name],
        },
      });
      if (player) {
        player.goals += 1;
        await player.save();
      }

      if (scorer.assist) {
        const assister = await Player.findOne({
          $expr: {
            $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, scorer.assist],
          },
        });
        if (assister) {
          assister.assists += 1;
          await assister.save();
        }
      }
    }

    // ✅ Update Yellow Cards
    for (const yellow of JSON.parse(yellowCards)) {
      const player = await Player.findOne({
        $expr: {
          $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, yellow.name],
        },
      });
      if (player) {
        player.yellowCards += 1;
        await player.save();
      }
    }

    // ✅ Update Red Cards
    for (const red of JSON.parse(redCards)) {
      const player = await Player.findOne({
        $expr: {
          $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, red.name],
        },
      });
      if (player) {
        player.redCards += 1;
        await player.save();
      }
    }

    // ✅ Update Opposition MOTM
    if (motmOpposition) {
      const player = await Player.findOneAndUpdate(
        {
          $expr: {
            $eq: [
              { $concat: ['$firstName', ' ', '$lastName'] },
              motmOpposition,
            ],
          },
        },
        { $inc: { motmOpposition: 1 } },
        { new: true }
      );
      if (player) {
        console.log(
          '✅ Updated Opposition MOTM:',
          player.firstName,
          player.lastName
        );
      }
    }

    // ✅ Update Parent MOTM
    if (parentsMotm) {
      const player = await Player.findOneAndUpdate(
        {
          $expr: {
            $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, parentsMotm],
          },
        },
        { $inc: { parentMotmWins: 1 } },
        { new: true }
      );
      if (player) {
        console.log(
          '✅ Updated Parent MOTM:',
          player.firstName,
          player.lastName
        );
      }
    }

    req.flash('success', '✅ Match saved and stats updated.');
    res.redirect('/matches');
  } catch (err) {
    console.error('❌ Error saving match:', err);
    req.flash('error', 'Something went wrong saving the match.');
    res.redirect('/admin/live-match');
  }
});

// ✅ Only show this page for your user account
app.get('/admin/secret-tools', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user_id);
  if (!user || !user.isAdmin || user.email !== 'carlos.wood1@icloud.com') {
    req.flash('error', 'Access denied.');
    return res.redirect('/');
  }

  // ✅ Fetch voters
  const voters = await User.find({
    isParent: true,
    hasVoted: true,
    votedFor: { $ne: null }, // ⬅️ Make sure vote was actually saved
  }).populate('votedFor linkedPlayer');

  // ✅ Render with voters data
  res.render('adminSecretTools', { voters });
});

// Add new player
app.get('/admin/players/new', requireLogin, requireAdmin, (req, res) => {
  console.log('🧪 Flash messages:', req.flash()); // this will be empty here — that’s okay!
  res.render('adminAddPlayer');
});

app.post('/admin/players/add', requireLogin, requireAdmin, async (req, res) => {
  console.log('📥 Hit POST /admin/players/add (test)');
  try {
    const { firstName, lastName, shirtNumber, position } = req.body;

    const existing = await Player.findOne({ firstName, lastName, shirtNumber });
    if (existing) {
      req.flash('error', 'Player already exists.');
      return res.redirect('/admin/players/new');
    }

    const player = new Player({
      firstName,
      lastName,
      shirtNumber,
      position,
    });

    await player.save();

    req.flash('success', `${firstName} ${lastName} added to the squad!`);
    res.redirect('/admin/players/new');
  } catch (err) {
    console.error('❌ Failed to add player:', err);
    req.flash('error', 'Something went wrong adding the player.');
    res.redirect('/admin/players/new');
  }
  console.log('📥 Add player route hit');
  console.log('Request body:', req.body);
});

// SUBMIT PARENTS VOTES FOR MOTM WINNER
app.post('/admin/submit-parent-motm', async (req, res) => {
  try {
    const voters = await User.find({ hasVoted: true, votedFor: { $ne: null } });

    if (!voters.length) {
      req.flash('error', 'No parent votes have been submitted.');
      return res.redirect('/admin');
    }

    // Tally votes
    const voteCounts = {};
    for (const voter of voters) {
      const id = voter.votedFor.toString();
      voteCounts[id] = (voteCounts[id] || 0) + 1;
    }

    // Find the player(s) with most votes (handle ties)
    const maxVotes = Math.max(...Object.values(voteCounts));
    const winners = Object.keys(voteCounts).filter(
      (id) => voteCounts[id] === maxVotes
    );

    const winnerPlayers = await Player.find({ _id: { $in: winners } });

    // Update match with winners
    const latestMatch = await Match.findOne().sort({ date: -1 });
    if (!latestMatch) {
      req.flash('error', 'No match found to update.');
      return res.redirect('/admin');
    }

    // Save full name string instead of just ID
    const winnerNames = winnerPlayers.map(
      (p) => `${p.firstName} ${p.lastName}`
    );
    latestMatch.parentMotm =
      winnerNames.length === 1
        ? winnerNames[0]
        : winnerNames.join(', ') + ' (Joint Winners)';
    await latestMatch.save();

    // Increment stats
    for (const player of winnerPlayers) {
      player.parentMotmWins = (player.parentMotmWins || 0) + 1;
      await player.save();
    }

    // Reset voters
    await User.updateMany(
      { hasVoted: true },
      { $set: { hasVoted: false, votedFor: null } }
    );

    // Show new animated page (winner.ejs)
    const displayNames =
      winnerPlayers.length === 1
        ? `${winnerPlayers[0].firstName} ${winnerPlayers[0].lastName}`
        : winnerPlayers.map((p) => `${p.firstName} ${p.lastName}`).join(', ') +
          ' (Joint Winners)';

    res.render('winner', { winners: displayNames });
  } catch (err) {
    console.error('❌ Error submitting MOTM:', err);
    req.flash('error', 'Something went wrong submitting the winner.');
    res.redirect('/admin');
  }
});

// Reset parent votes
app.post(
  '/admin/reset-parent-votes',
  requireLogin,
  requireAdmin,
  async (req, res) => {
    try {
      await Player.updateMany({}, { $set: { motmVotes: 0 } });
      await User.updateMany({ isParent: true }, { $set: { hasVoted: false } });

      req.flash('success', '✅ All parent votes have been reset.');
    } catch (err) {
      console.error('❌ Failed to reset parent votes:', err);
      req.flash('error', 'Something went wrong resetting parent votes.');
    }

    res.redirect('/admin');
  }
);

app.get('/admin/users', requireLogin, requireAdmin, async (req, res) => {
  try {
    const parents = await User.find({ isParent: true })
      .populate('linkedPlayer')
      .sort({ lastName: 1 });

    const players = await User.find({ isPlayer: true })
      .populate('linkedPlayer')
      .sort({ lastName: 1 });

    res.render('adminUsers', { parents, players, messages: req.flash() });
  } catch (err) {
    console.error('❌ Failed to load users:', err);
    req.flash('error', 'Failed to load registered users.');
    res.redirect('/admin');
  }
});

// 🔐 Admin Dashboard Route
app.get('/admin/dashboard', async (req, res) => {
  // Optional: protect this route with an isAdmin check
  if (!req.session.user_id) {
    req.flash('error', 'You must be logged in to view this page.');
    return res.redirect('/');
  }

  const user = await User.findById(req.session.user_id);
  if (!user || !user.isAdmin) {
    req.flash('error', 'Access denied. Admins only.');
    return res.redirect('/');
  }

  res.render('admin/dashboard', { user });
});

// ✅ Main Admin Setup Route
app.post('/become-main-admin', async (req, res) => {
  const { adminPassword } = req.body;

  if (adminPassword !== process.env.MAIN_ADMIN_PASSWORD) {
    req.flash('error', 'Incorrect admin password');
    return res.redirect('/');
  }

  const existing = await User.findOne({ isMainAdmin: true });
  if (existing) {
    req.flash('error', 'Main admin already set up.');
    return res.redirect('/');
  }

  // Fetch current user
  const user = await User.findById(req.session.user_id);
  if (!user) {
    req.flash('error', 'You must be logged in to become admin.');
    return res.redirect('/');
  }

  user.isAdmin = true;
  user.isMainAdmin = true;
  await user.save();

  req.flash('success', 'You are now the main admin!');
  res.redirect('/'); // 👈 Redirects to homepage instead of /admin/dashboard
});

app.post('/admin/promote/:id', requireLogin, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      user.isAdmin = true;
      await user.save();
      req.flash('success', `${user.firstName} is now an admin.`);
    }
    res.redirect('/admin/users');
  } catch (err) {
    console.error('❌ Promotion error:', err);
    req.flash('error', 'Failed to promote user.');
    res.redirect('/admin/users');
  }
});

app.post('/admin/demote/:id', requireLogin, requireAdmin, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    const currentUser = await User.findById(req.session.user_id);

    if (!targetUser) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    // Prevent demoting main admin
    if (targetUser.isMainAdmin) {
      req.flash('error', '❌ You cannot demote the main admin.');
      return res.redirect('/admin/users');
    }

    targetUser.isAdmin = false;
    await targetUser.save();
    req.flash('success', `${targetUser.firstName} has been demoted.`);
    res.redirect('/admin/users');
  } catch (err) {
    console.error('❌ Demotion error:', err);
    req.flash('error', 'Something went wrong while demoting the user.');
    res.redirect('/admin/users');
  }
});

// Start server
app.listen(3000, () => {
  console.log('SERVING YOUR APP ON PORT 3000');
});
