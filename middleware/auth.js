// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/auth/login');
};

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.is_admin) {
        return next();
    }
    res.status(403).send('Forbidden: Admins only');
};

module.exports = {
    isAuthenticated,
    isAdmin
};
