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

// Middleware to check if user is NOT a customer (i.e. admin or operator)
const isNotCustomer = (req, res, next) => {
    if (req.session && req.session.user && !req.session.user.is_customer) {
        return next();
    }
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(403).json({ success: false, error: 'Acceso denegado: Clientes no pueden realizar esta acción' });
    }
    res.status(403).send('Forbidden: Customers do not have access to this page');
};

module.exports = {
    isAuthenticated,
    isAdmin,
    isNotCustomer
};
