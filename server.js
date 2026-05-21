const express = require('express');
const session = require('express-session');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'))); // Serve uploads

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Make user available in all templates
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Import Routes
const authRoutes = require('./routes/auth');
const ordersRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

// Use Routes
app.use('/auth', authRoutes);
app.use('/', ordersRoutes); // Handles /dashboard and /orders
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// Root redirect
app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/auth/login');
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
