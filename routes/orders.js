const express = require('express');
const router = express.Router();
const pool = require('../db');
const { isAuthenticated, isAdmin, isNotCustomer } = require('../middleware/auth');

router.use(isAuthenticated);

// Dashboard Kanban View
router.get('/dashboard', async (req, res) => {
    try {
        const isAdmin = req.session.user.is_admin;
        const query = `
            SELECT o.*, 
                   l.product_id, l.qty_per_sheet, l.image_path, l.pdf_path, l.word_path, l.height, l.width, l.tags, l.paper_type,
                   p.name as product_name, u.username as operator_username, q.name as quality_name
            FROM orders o
            JOIN labels l ON o.label_id = l.id
            JOIN products p ON l.product_id = p.id
            LEFT JOIN users u ON o.operator_id = u.id
            LEFT JOIN qualities q ON l.quality_id = q.id
            WHERE (o.status != 'entregado' OR $1 = TRUE OR DATE(o.updated_at) = CURRENT_DATE)
            ORDER BY o.position ASC, o.id ASC
        `;
        const result = await pool.query(query, [isAdmin]);
        const orders = result.rows;

        // Group by status (for customers, terminados is filtered to last 48 hours)
        const board = {
            'pendiente': orders.filter(o => o.status === 'pendiente'),
            'imprimiendo': orders.filter(o => o.status === 'imprimiendo'),
            'impreso': orders.filter(o => o.status === 'impreso'),
            'cortando': orders.filter(o => o.status === 'cortando'),
            'terminado': orders.filter(o => o.status === 'terminado' && (!req.session.user.is_customer || (Date.now() - new Date(o.updated_at).getTime()) <= 48 * 60 * 60 * 1000)),
            'entregado': orders.filter(o => o.status === 'entregado')
        };

        res.render('dashboard', { board, isFluid: true });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// New Order Form
router.get('/orders/new', isNotCustomer, async (req, res) => {
    try {
        // Fetch labels to select from
        const labelsResult = await pool.query(`
            SELECT l.id, p.name as product_name, l.height, l.width, l.qty_per_sheet, l.paper_type, l.tags
            FROM labels l
            JOIN products p ON l.product_id = p.id
        `);
        res.render('orders/new', { labels: labelsResult.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Process New Order
router.post('/orders', isNotCustomer, async (req, res) => {
    const { label_id, quantity, observations } = req.body;
    
    try {
        // Calculate totals based on label info
        const labelQuery = await pool.query('SELECT * FROM labels WHERE id = $1', [label_id]);
        if (labelQuery.rows.length === 0) return res.status(400).send('Label not found');
        
        const label = labelQuery.rows[0];
        const qty_per_sheet = label.qty_per_sheet || 1;
        const total_sheets = Math.ceil(quantity / qty_per_sheet);

        // Fetch max position to place new order at the bottom
        const posQuery = await pool.query("SELECT COALESCE(MAX(position), 0) as max_pos FROM orders WHERE status = 'pendiente'");
        const nextPosition = posQuery.rows[0].max_pos + 1;

        const insertQuery = `
            INSERT INTO orders (label_id, quantity, total_sheets, observations, position)
            VALUES ($1, $2, $3, $4, $5)
        `;
        
        await pool.query(insertQuery, [label_id, quantity, total_sheets, observations, nextPosition]);
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Delete Order
router.post('/orders/:id/delete', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM orders WHERE id = $1', [id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.json({ success: true });
        }
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Delivered Orders History View
router.get('/history', async (req, res) => {
    try {
        const { date, hour, product_id } = req.query;
        
        let query = `
            SELECT o.*, 
                   l.product_id, l.qty_per_sheet, l.image_path, l.pdf_path, l.word_path, l.height, l.width, l.tags, l.paper_type,
                   p.name as product_name, u.username as operator_username, q.name as quality_name
            FROM orders o
            JOIN labels l ON o.label_id = l.id
            JOIN products p ON l.product_id = p.id
            LEFT JOIN users u ON o.operator_id = u.id
            LEFT JOIN qualities q ON l.quality_id = q.id
            WHERE o.status = 'entregado'
        `;
        
        const params = [];
        let paramIndex = 1;
        
        if (date) {
            query += ` AND DATE(o.updated_at) = $${paramIndex++}`;
            params.push(date);
        }
        
        if (hour) {
            query += ` AND TO_CHAR(o.updated_at, 'HH24:MI') LIKE $${paramIndex++}`;
            params.push(`${hour}%`);
        }
        
        if (product_id) {
            query += ` AND l.product_id = $${paramIndex++}`;
            params.push(product_id);
        }
        
        query += ` ORDER BY o.updated_at DESC`;
        
        const result = await pool.query(query, params);
        
        // Fetch all products for the filter dropdown
        const productsResult = await pool.query('SELECT * FROM products ORDER BY name');
        
        res.render('history', { 
            orders: result.rows, 
            products: productsResult.rows,
            filters: { date, hour, product_id }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
