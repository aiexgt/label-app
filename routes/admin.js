const express = require('express');
const router = express.Router();
const pool = require('../db');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads/'))
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

// Protect all admin routes
router.use(isAuthenticated, isAdmin);

// ==========================================
// PRODUCTS
// ==========================================
router.get('/products', async (req, res) => {
    try {
        const productsResult = await pool.query('SELECT * FROM products ORDER BY id DESC');
        const qualitiesResult = await pool.query('SELECT * FROM qualities ORDER BY id DESC');
        res.render('admin/products', { products: productsResult.rows, qualities: qualitiesResult.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/products', async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('INSERT INTO products (name) VALUES ($1)', [name]);
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/products/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM products WHERE id = $1', [id]);
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error (may be linked to existing labels)');
    }
});

// ==========================================
// QUALITIES
// ==========================================
router.get('/qualities', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM qualities ORDER BY id DESC');
        res.render('admin/qualities', { qualities: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/qualities', async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('INSERT INTO qualities (name) VALUES ($1)', [name]);
        res.redirect('/admin/products'); // Redirecting to products where both might be managed for simplicity, or /admin/qualities
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/qualities/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM qualities WHERE id = $1', [id]);
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});

// ==========================================
// PRINTERS
// ==========================================
router.get('/printers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM printers ORDER BY id DESC');
        res.render('admin/printers', { printers: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/printers', async (req, res) => {
    const { name, type } = req.body;
    try {
        await pool.query('INSERT INTO printers (name, type) VALUES ($1, $2)', [name, type]);
        res.redirect('/admin/printers');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/printers/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM printers WHERE id = $1', [id]);
        res.redirect('/admin/printers');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});
// ==========================================
// LABELS
// ==========================================
router.get('/labels', async (req, res) => {
    try {
        const query = `
            SELECT l.*, p.name as product_name, q.name as quality_name, pr.name as printer_name 
            FROM labels l
            LEFT JOIN products p ON l.product_id = p.id
            LEFT JOIN qualities q ON l.quality_id = q.id
            LEFT JOIN printers pr ON l.printer_id = pr.id
            ORDER BY l.id DESC
        `;
        const result = await pool.query(query);
        
        // Fetch lookup data for form
        const products = await pool.query('SELECT * FROM products');
        const qualities = await pool.query('SELECT * FROM qualities');
        const printers = await pool.query('SELECT * FROM printers');

        res.render('admin/labels', { 
            labels: result.rows,
            products: products.rows,
            qualities: qualities.rows,
            printers: printers.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/labels', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'word', maxCount: 1 },
    { name: 'pdf', maxCount: 1 }
]), async (req, res) => {
    const { product_id, height, width, quality_id, unit_price, labor_percentage, qty_per_sheet, printer_id } = req.body;
    
    let image_path = req.files && req.files['image'] ? '/uploads/' + req.files['image'][0].filename : null;
    let word_path = req.files && req.files['word'] ? '/uploads/' + req.files['word'][0].filename : null;
    let pdf_path = req.files && req.files['pdf'] ? '/uploads/' + req.files['pdf'][0].filename : null;

    try {
        const query = `
            INSERT INTO labels (product_id, height, width, image_path, word_path, pdf_path, quality_id, unit_price, labor_percentage, qty_per_sheet, printer_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        await pool.query(query, [
            product_id || null, height, width, image_path, word_path, pdf_path, 
            quality_id || null, unit_price, labor_percentage, qty_per_sheet, printer_id || null
        ]);
        res.redirect('/admin/labels');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/labels/:id/files', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'word', maxCount: 1 },
    { name: 'pdf', maxCount: 1 }
]), async (req, res) => {
    const { id } = req.params;
    let updates = [];
    let values = [];
    let counter = 1;

    if (req.files && req.files['image']) {
        updates.push(`image_path = $${counter++}`);
        values.push('/uploads/' + req.files['image'][0].filename);
    }
    if (req.files && req.files['word']) {
        updates.push(`word_path = $${counter++}`);
        values.push('/uploads/' + req.files['word'][0].filename);
    }
    if (req.files && req.files['pdf']) {
        updates.push(`pdf_path = $${counter++}`);
        values.push('/uploads/' + req.files['pdf'][0].filename);
    }

    if (updates.length > 0) {
        try {
            values.push(id);
            const query = `UPDATE labels SET ${updates.join(', ')} WHERE id = $${counter}`;
            await pool.query(query, values);
        } catch (err) {
            console.error(err);
            return res.status(500).send('Server Error');
        }
    }
    res.redirect('/admin/labels');
});

router.post('/labels/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM labels WHERE id = $1', [id]);
        res.redirect('/admin/labels');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});

// ==========================================
// FINANCES
// ==========================================
router.get('/finances', async (req, res) => {
    const { start, end } = req.query;
    try {
        // 1. Fetch Orders
        let ordersQuery = `
            SELECT o.*, p.name as product_name
            FROM orders o
            JOIN labels l ON o.label_id = l.id
            JOIN products p ON l.product_id = p.id
            WHERE o.status IN ('entregado', 'pagado')
        `;
        
        // 2. Fetch Transactions
        let transQuery = `SELECT * FROM global_payments WHERE 1=1`;
        
        const queryParams = [];
        let dateFilterOrders = "";
        let dateFilterTrans = "";
        
        if (start && end) {
            dateFilterOrders = ` AND o.order_date >= $1 AND o.order_date <= $2::date + interval '1 day'`;
            dateFilterTrans = ` AND created_at >= $1 AND created_at <= $2::date + interval '1 day'`;
            queryParams.push(start, end);
        } else if (start) {
            dateFilterOrders = ` AND o.order_date >= $1`;
            dateFilterTrans = ` AND created_at >= $1`;
            queryParams.push(start);
        } else if (end) {
            dateFilterOrders = ` AND o.order_date <= $1::date + interval '1 day'`;
            dateFilterTrans = ` AND created_at <= $1::date + interval '1 day'`;
            queryParams.push(end);
        }
        
        ordersQuery += dateFilterOrders + ` ORDER BY o.order_date DESC`;
        transQuery += dateFilterTrans + ` ORDER BY created_at DESC`;

        const ordersResult = await pool.query(ordersQuery, queryParams);
        const transResult = await pool.query(transQuery, queryParams);
        
        let totalToPay = 0;
        let totalLabor = 0;
        ordersResult.rows.forEach(o => {
            totalToPay += parseFloat(o.total_payment);
            totalLabor += parseFloat(o.total_labor_payment);
        });

        let totalPaid = 0;
        transResult.rows.forEach(t => {
            totalPaid += parseFloat(t.amount);
        });
        
        // El "Por cobrar" (balance) es el total generado menos el total pagado (de las transacciones globales)
        const balance = totalToPay - totalPaid;

        res.render('admin/finances', {
            orders: ordersResult.rows,
            transactions: transResult.rows,
            totalToPay: balance,
            totalPaid,
            totalLabor,
            start: start || '',
            end: end || ''
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Registrar Transacción Global
router.post('/finances/transaction', async (req, res) => {
    const { amount, description } = req.body;
    try {
        await pool.query('INSERT INTO global_payments (amount, description) VALUES ($1, $2)', [amount, description]);
        res.redirect('/admin/finances');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// USERS
// ==========================================
router.get('/users', async (req, res) => {
    try {
        const usersResult = await pool.query('SELECT id, username, is_admin FROM users ORDER BY id');
        res.render('admin/users', { users: usersResult.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Create User
router.post('/users', async (req, res) => {
    const { username, password, is_admin } = req.body;
    try {
        const bcrypt = require('bcrypt');
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3)',
            [username, hash, is_admin === 'on']
        );
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al crear usuario (puede que el usuario ya exista)');
    }
});

// Update User Role / Delete User
router.post('/users/:id/toggle_admin', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE users SET is_admin = NOT is_admin WHERE id = $1 AND id != $2', [id, req.session.user.id]);
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});

module.exports = router;
