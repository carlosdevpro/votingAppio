// sms.js
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function sendVoteReminder(phone, playerName) {
  return client.messages.create({
    body: `👋 Hey! Don’t forget to vote for Man of the Match for ${playerName}'s game!`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone,
  });
}

function sendFinalReminder(phone, playerName) {
  return client.messages.create({
    body: `📢 Final reminder: Please don’t forget to vote for ${playerName} as Man of the Match today!`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone,
  });
}

module.exports = { sendVoteReminder, sendFinalReminder };
