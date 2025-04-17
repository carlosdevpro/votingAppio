const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'icloud',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

module.exports.sendPasswordReset = async (email, token) => {
  const resetURL = `https://votingapp-9eoi.onrender.com/reset/${token}`;

  const mailOptions = {
    from: `"VotingApp" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <h2>Password Reset</h2>
      <p>You requested a password reset. Click below to reset your password:</p>
      <a href="${resetURL}">${resetURL}</a>
      <p>This link will expire in 1 hour.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
};
