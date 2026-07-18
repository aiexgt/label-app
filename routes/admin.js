const express = require('express');
const router = express.Router();
const pool = require('../db');
const { isAuthenticated, isAdmin, isNotCustomer } = require('../middleware/auth');
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

// Protect all admin routes with authentication
router.use(isAuthenticated);

// PRODUCTS (Catálogo Base - Products & Qualities)
// ==========================================
router.get('/products', isAdmin, async (req, res) => {
    try {
        const productsResult = await pool.query('SELECT * FROM products ORDER BY id DESC');
        const qualitiesResult = await pool.query('SELECT * FROM qualities ORDER BY id DESC');
        const branchesResult = await pool.query('SELECT * FROM branches ORDER BY id DESC');
        res.render('admin/products', { 
            products: productsResult.rows, 
            qualities: qualitiesResult.rows,
            branches: branchesResult.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/products', isAdmin, async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('INSERT INTO products (name) VALUES ($1)', [name]);
        res.redirect('/admin/products');
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).send('Error: El producto ya existe.');
        }
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/products/:id/delete', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM products WHERE id = $1', [id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) return res.json({ success: true });
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error (may be linked to existing labels)');
    }
});

router.post('/products/:id/edit', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        await pool.query('UPDATE products SET name = $1 WHERE id = $2', [name, id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.json({ success: true, name });
        }
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.status(500).json({ error: 'Server Error' });
        }
        res.status(500).send('Server Error');
    }
});

// ==========================================
// QUALITIES
// ==========================================
router.get('/qualities', isAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM qualities ORDER BY id DESC');
        res.render('admin/qualities', { qualities: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/qualities', isAdmin, async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('INSERT INTO qualities (name) VALUES ($1)', [name]);
        res.redirect('/admin/products'); // Redirecting to products where both might be managed for simplicity, or /admin/qualities
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/qualities/:id/delete', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM qualities WHERE id = $1', [id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) return res.json({ success: true });
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});

router.post('/qualities/:id/edit', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        await pool.query('UPDATE qualities SET name = $1 WHERE id = $2', [name, id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.json({ success: true, name });
        }
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.status(500).json({ error: 'Server Error' });
        }
        res.status(500).send('Server Error');
    }
});

// ==========================================
// BRANCHES
// ==========================================
router.post('/branches', isAdmin, async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('INSERT INTO branches (name) VALUES ($1)', [name]);
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/branches/:id/delete', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM branches WHERE id = $1', [id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) return res.json({ success: true });
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});

router.post('/branches/:id/edit', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        await pool.query('UPDATE branches SET name = $1 WHERE id = $2', [name, id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.json({ success: true, name });
        }
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.status(500).json({ error: 'Server Error' });
        }
        res.status(500).send('Server Error');
    }
});


// LABELS
// ==========================================
router.get('/labels', isNotCustomer, async (req, res) => {
    try {
        const query = `
            SELECT l.*, p.name as product_name, q.name as quality_name
            FROM labels l
            LEFT JOIN products p ON l.product_id = p.id
            LEFT JOIN qualities q ON l.quality_id = q.id
            ORDER BY l.id DESC
        `;
        const result = await pool.query(query);
        
        // Fetch lookup data for form
        const products = await pool.query('SELECT * FROM products');
        const qualities = await pool.query('SELECT * FROM qualities');

        res.render('admin/labels', { 
            labels: result.rows,
            products: products.rows,
            qualities: qualities.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/labels', isAdmin, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'word', maxCount: 1 },
    { name: 'pdf', maxCount: 1 },
    { name: 'pdf_individual', maxCount: 1 }
]), async (req, res) => {
    const { product_id, height, width, quality_id, qty_per_sheet, paper_type, tags } = req.body;
    
    let image_path = req.files && req.files['image'] ? '/uploads/' + req.files['image'][0].filename : null;
    let word_path = req.files && req.files['word'] ? '/uploads/' + req.files['word'][0].filename : null;
    let pdf_path = req.files && req.files['pdf'] ? '/uploads/' + req.files['pdf'][0].filename : null;
    let pdf_individual_path = req.files && req.files['pdf_individual'] ? '/uploads/' + req.files['pdf_individual'][0].filename : null;

    try {
        const query = `
            INSERT INTO labels (product_id, height, width, image_path, word_path, pdf_path, pdf_individual_path, quality_id, qty_per_sheet, paper_type, tags)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        await pool.query(query, [
            product_id || null, height, width, image_path, word_path, pdf_path, pdf_individual_path,
            quality_id || null, qty_per_sheet, paper_type || 'Matte', tags || null
        ]);
        res.redirect('/admin/labels');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/labels/:id/edit', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const labelQuery = await pool.query('SELECT * FROM labels WHERE id = $1', [id]);
        if (labelQuery.rows.length === 0) return res.status(404).send('Label not found');
        const products = await pool.query('SELECT * FROM products');
        const qualities = await pool.query('SELECT * FROM qualities');
        res.render('admin/labels_edit', { 
            label: labelQuery.rows[0],
            products: products.rows,
            qualities: qualities.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/labels/:id/edit', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { product_id, height, width, quality_id, qty_per_sheet, paper_type, tags } = req.body;
    try {
        const query = `
            UPDATE labels 
            SET product_id=$1, height=$2, width=$3, quality_id=$4, qty_per_sheet=$5, paper_type=$6, tags=$7
            WHERE id = $8
        `;
        await pool.query(query, [
            product_id || null, height, width, quality_id || null, qty_per_sheet, paper_type || 'Matte', tags || null, id
        ]);
        res.redirect('/admin/labels');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/labels/:id/files', isAdmin, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'word', maxCount: 1 },
    { name: 'pdf', maxCount: 1 },
    { name: 'pdf_individual', maxCount: 1 }
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
    if (req.files && req.files['pdf_individual']) {
        updates.push(`pdf_individual_path = $${counter++}`);
        values.push('/uploads/' + req.files['pdf_individual'][0].filename);
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

router.post('/labels/:id/delete', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM labels WHERE id = $1', [id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) return res.json({ success: true });
        res.redirect('/admin/labels');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});

// ==========================================
// USERS
// ==========================================
router.get('/users', isAdmin, async (req, res) => {
    try {
        const usersResult = await pool.query(`
            SELECT u.id, u.username, u.is_admin, u.is_customer, u.is_manager, u.branch_id, b.name as branch_name
            FROM users u
            LEFT JOIN branches b ON u.branch_id = b.id
            ORDER BY u.id
        `);
        const branchesResult = await pool.query('SELECT * FROM branches ORDER BY name');
        res.render('admin/users', { users: usersResult.rows, branches: branchesResult.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Create User
router.post('/users', isAdmin, async (req, res) => {
    const { username, password, role, branch_id } = req.body;
    const finalBranchId = role === 'admin' ? null : (branch_id || null);
    try {
        const bcrypt = require('bcrypt');
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, password_hash, is_admin, is_customer, is_manager, branch_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [username, hash, role === 'admin', role === 'customer', role === 'manager', finalBranchId]
        );
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al crear usuario (puede que el usuario ya exista)');
    }
});

// Update User Role
router.post('/users/:id/role', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    try {
        if (parseInt(id) === req.session.user.id) {
            return res.status(400).send('No puedes cambiar tu propio rol');
        }
        await pool.query(
            'UPDATE users SET is_admin = $1, is_customer = $2, is_manager = $3 WHERE id = $4',
            [role === 'admin', role === 'customer', role === 'manager', id]
        );
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});

// Edit User Page (GET)
router.get('/users/:id/edit', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const userResult = await pool.query('SELECT id, username, is_admin, is_customer, is_manager, branch_id FROM users WHERE id = $1', [id]);
        if (userResult.rows.length === 0) return res.status(404).send('Usuario no encontrado');
        const branchesResult = await pool.query('SELECT * FROM branches ORDER BY name');
        res.render('admin/users_edit', { targetUser: userResult.rows[0], branches: branchesResult.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Edit User Action (POST)
router.post('/users/:id/edit', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { username, password, role, branch_id } = req.body;
    try {
        const bcrypt = require('bcrypt');
        
        let isSelf = (parseInt(id) === req.session.user.id);
        let finalAdmin = isSelf ? true : (role === 'admin');
        let finalCustomer = isSelf ? false : (role === 'customer');
        let finalManager = isSelf ? false : (role === 'manager');
        let finalBranchId = finalAdmin ? null : (branch_id || null);
        
        let query = 'UPDATE users SET username = $1, is_admin = $2, is_customer = $3, is_manager = $4, branch_id = $5';
        const params = [username, finalAdmin, finalCustomer, finalManager, finalBranchId];
        let paramIndex = 6;
        
        if (password && password.trim() !== '') {
            const hash = await bcrypt.hash(password, 10);
            query += `, password_hash = $${paramIndex++}`;
            params.push(hash);
        }
        
        query += ` WHERE id = $${paramIndex}`;
        params.push(id);
        
        await pool.query(query, params);
        
        // If editing self, update session
        if (isSelf) {
            req.session.user.username = username;
            req.session.user.is_admin = finalAdmin;
            req.session.user.is_customer = finalCustomer;
            req.session.user.is_manager = finalManager;
            req.session.user.branch_id = finalBranchId;
        }
        
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al editar usuario (el nombre de usuario ya puede estar en uso)');
    }
});

// Delete User Action (POST)
router.post('/users/:id/delete', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        if (parseInt(id) === req.session.user.id) {
            return res.status(400).send('No puedes eliminar tu propio usuario');
        }
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.json({ success: true });
        }
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});

module.exports = router;
