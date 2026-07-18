const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db');

// Show login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login', { error: req.query.error });
});

// Process login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const match = await bcrypt.compare(password, user.password_hash);
            if (match) {
                req.session.user = {
                    id: user.id,
                    username: user.username,
                    is_admin: user.is_admin,
                    is_customer: user.is_customer,
                    branch_id: user.branch_id
                };
                return res.redirect('/dashboard');
            }
        }
        res.redirect('/auth/login?error=Usuario o contraseña incorrectos');
    } catch (err) {
        console.error(err);
        res.redirect('/auth/login?error=Error del servidor');
    }
});

// Process logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

module.exports = router;
