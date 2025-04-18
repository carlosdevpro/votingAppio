// middleware.js

function isLoggedIn(req, res, next) {
  if (!req.session.user_id) {
    req.flash('error', 'You must be logged in to access this page.');
    return res.redirect('/login');
  }
  next();
}

module.exports = { isLoggedIn };
