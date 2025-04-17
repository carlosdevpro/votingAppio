const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  hasVoted: {
    type: Boolean,
    default: false,
  },
  linkedPlayer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  isPlayer: {
    type: Boolean,
    default: false,
  },
  isParent: {
    type: Boolean,
    default: false,
  },
  mobileNumber: {
    type: String,
    required: function () {
      // Only require mobile number when creating a NEW document
      return !this.isPlayer && this.isNew;
    },
  },
  lastActive: {
    type: Date,
    default: Date.now,
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  lastActive: {
    type: Date,
  },
  votedFor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
  },
});

// Login helper
userSchema.statics.findAndValidate = async function (email, password) {
  const foundUser = await this.findOne({ email });
  if (!foundUser) return false;
  const isValid = await bcrypt.compare(password, foundUser.password);
  return isValid ? foundUser : false;
};

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

module.exports = mongoose.model('User', userSchema);
