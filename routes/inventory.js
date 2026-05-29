const express = require('express');
const router = express.Router();
const pool = require('../db');
const { isAuthenticated, isAdmin, isNotCustomer } = require('../middleware/auth');

router.use(isAuthenticated, isNotCustomer);

// GET /admin/inventory - List supplies and movements log
router.get('/', async (req, res) => {
    try {
        const suppliesResult = await pool.query('SELECT * FROM supplies ORDER BY name ASC');
        const movementsResult = await pool.query(`
            SELECT m.*, s.name as supply_name, u.username
            FROM supply_movements m
            JOIN supplies s ON m.supply_id = s.id
            LEFT JOIN users u ON m.user_id = u.id
            ORDER BY m.created_at DESC
            LIMIT 30
        `);
        res.render('admin/inventory', {
            supplies: suppliesResult.rows,
            movements: movementsResult.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /admin/inventory - Create supply (Admin only)
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
            'INSERT INTO supply_movements (supply_id, user_id, type, quantity, concept) VALUES ($1, $2, $3, $4, $5)',
            [supplyId, req.session.user.id, 'entrada', parseFloat(quantity) || 0, 'Inventario inicial']
        );
        await pool.query('COMMIT');
        res.redirect('/admin/inventory');
    } catch (err) {
        await pool.query('ROLLBACK');
        if (err.code === '23505') {
            return res.status(400).send('Error: El suministro ya existe.');
        }
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// GET /admin/inventory/:id/edit - Edit supply metadata (Admin only)
router.get('/:id/edit', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM supplies WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).send('Supply not found');
        res.render('admin/inventory_edit', { supply: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /admin/inventory/:id/edit - Save supply metadata (Admin only)
router.post('/:id/edit', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, unit_of_measure } = req.body;
    try {
        await pool.query(
            'UPDATE supplies SET name = $1, unit_of_measure = $2 WHERE id = $3',
            [name, unit_of_measure, id]
        );
        res.redirect('/admin/inventory');
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).send('Error: Ya existe otro suministro con ese nombre.');
        }
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /admin/inventory/:id/delete - Delete supply (Admin only)
router.post('/:id/delete', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM supplies WHERE id = $1', [id]);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) return res.json({ success: true });
        res.redirect('/admin/inventory');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});

// POST /admin/inventory/:id/adjust - Adjust stock (Admin & Operator)
router.post('/:id/adjust', async (req, res) => {
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
            'INSERT INTO supply_movements (supply_id, user_id, type, quantity, concept) VALUES ($1, $2, $3, $4, $5)',
            [id, req.session.user.id, type, qtyAmount, concept || (type === 'entrada' ? 'Ajuste de entrada' : 'Ajuste de salida')]
        );
        
        await pool.query('COMMIT');
        res.redirect('/admin/inventory');
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
