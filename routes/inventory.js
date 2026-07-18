const express = require('express');
const router = express.Router();
const pool = require('../db');
const { isAuthenticated, isAdmin, isNotCustomer } = require('../middleware/auth');

router.use(isAuthenticated);

// GET /inventory - Screen 1: Unified Supplies Catalog
router.get('/', isNotCustomer, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM supplies ORDER BY name ASC');
        res.render('inventory/index', { supplies: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /inventory - Create supply (Admin only)
router.post('/', isAdmin, async (req, res) => {
    const { name, quantity, unit_of_measure } = req.body;
    try {
        await pool.query('BEGIN');
        const insertRes = await pool.query(
            'INSERT INTO supplies (name, quantity, unit_of_measure) VALUES ($1, $2, $3) RETURNING id',
            [name, parseFloat(quantity) || 0, unit_of_measure]
        );
        const supplyId = insertRes.rows[0].id;
        
        // Record initial inventory movement
        await pool.query(
            'INSERT INTO supply_movements (supply_id, user_id, type, quantity, concept, branch_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [supplyId, req.session.user.id, 'entrada', parseFloat(quantity) || 0, 'Inventario inicial', req.session.user.branch_id || null]
        );
        await pool.query('COMMIT');
        res.redirect('/inventory');
    } catch (err) {
        await pool.query('ROLLBACK');
        if (err.code === '23505') {
            return res.status(400).send('Error: El suministro ya existe.');
        }
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// GET /inventory/:id/edit - Edit supply metadata (Admin only)
router.get('/:id/edit', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM supplies WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).send('Supply not found');
        res.render('inventory/edit', { supply: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /inventory/:id/edit - Save supply metadata (Admin only)
router.post('/:id/edit', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, unit_of_measure } = req.body;
    try {
        await pool.query(
            'UPDATE supplies SET name = $1, unit_of_measure = $2 WHERE id = $3',
            [name, unit_of_measure, id]
        );
        res.redirect('/inventory');
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).send('Error: Ya existe otro suministro con ese nombre.');
        }
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /inventory/:id/delete - Delete supply (Admin only)
router.post('/:id/delete', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM supplies WHERE id = $1', [id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) return res.json({ success: true });
        res.redirect('/inventory');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// GET /inventory/:id/adjust - Screen 2: Adjust Stock Form
// GET /inventory/:id/adjust - Screen 2: Adjust Stock Form
router.get('/:id/adjust', isNotCustomer, async (req, res) => {
    const { id } = req.params;
    const { type } = req.query; // 'entrada' or 'salida'
    if (type !== 'entrada' && type !== 'salida') {
        return res.status(400).send('Tipo de movimiento inválido (debe ser entrada o salida)');
    }
    try {
        const result = await pool.query('SELECT * FROM supplies WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).send('Supply not found');
        res.render('inventory/adjust_form', { supply: result.rows[0], type });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /inventory/:id/adjust - Save stock adjustment (Admin & Operator)
router.post('/:id/adjust', isNotCustomer, async (req, res) => {
    const { id } = req.params;
    const { type, amount, concept } = req.body;
    const qtyAmount = parseFloat(amount);
    
    if (isNaN(qtyAmount) || qtyAmount <= 0) {
        return res.status(400).send('Cantidad inválida');
    }
    if (type !== 'entrada' && type !== 'salida') {
        return res.status(400).send('Tipo de movimiento inválido');
    }

    try {
        await pool.query('BEGIN');
        
        // Fetch current supply to update and validate stock
        const supplyRes = await pool.query('SELECT * FROM supplies WHERE id = $1', [id]);
        if (supplyRes.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).send('Supply not found');
        }
        
        const supply = supplyRes.rows[0];
        let newQty = parseFloat(supply.quantity);
        if (type === 'entrada') {
            newQty += qtyAmount;
        } else {
            newQty -= qtyAmount;
            if (newQty < 0) {
                await pool.query('ROLLBACK');
                return res.status(400).send('Error: La cantidad no puede quedar en negativo.');
            }
        }

        // Update supplies quantity
        await pool.query('UPDATE supplies SET quantity = $1 WHERE id = $2', [newQty, id]);
        
        // Log movement
        await pool.query(
            'INSERT INTO supply_movements (supply_id, user_id, type, quantity, concept, branch_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [id, req.session.user.id, type, qtyAmount, concept || (type === 'entrada' ? 'Ajuste de entrada' : 'Ajuste de salida'), req.session.user.branch_id || null]
        );
        
        await pool.query('COMMIT');
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.json({ success: true, newQuantity: newQty });
        }
        res.redirect('/inventory');
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// GET /inventory/history - Screen 3: Filterable Inventory Movements History Log
router.get('/history', async (req, res) => {
    try {
        const { start_date, end_date, supply_id } = req.query;
        
        let branchFilter = '';
        const params = [];
        let paramIndex = 1;
        
        if (!req.session.user.is_admin) {
            branchFilter = ` AND m.branch_id = $${paramIndex++}`;
            params.push(req.session.user.branch_id);
        }
        
        let query = `
            SELECT m.*, s.name as supply_name, u.username
            FROM supply_movements m
            JOIN supplies s ON m.supply_id = s.id
            LEFT JOIN users u ON m.user_id = u.id
            WHERE 1=1 ${branchFilter}
        `;
        
        if (start_date) {
            query += ` AND DATE(m.created_at) >= $${paramIndex++}`;
            params.push(start_date);
        }
        
        if (end_date) {
            query += ` AND DATE(m.created_at) <= $${paramIndex++}`;
            params.push(end_date);
        }
        
        if (supply_id) {
            query += ` AND m.supply_id = $${paramIndex++}`;
            params.push(supply_id);
        }
        
        query += ` ORDER BY m.created_at DESC LIMIT 100`;
        
        const result = await pool.query(query, params);
        
        // Fetch all supplies for filter select
        const suppliesResult = await pool.query('SELECT * FROM supplies ORDER BY name ASC');
        
        res.render('inventory/history', {
            movements: result.rows,
            supplies: suppliesResult.rows,
            filters: { start_date, end_date, supply_id }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /inventory/history/:id/delete - Delete history entry (Admin only)
router.post('/history/:id/delete', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM supply_movements WHERE id = $1', [id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) return res.json({ success: true });
        res.redirect('/inventory/history');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
