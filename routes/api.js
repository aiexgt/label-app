const express = require('express');
const router = express.Router();
const pool = require('../db');
const { isAuthenticated, isNotCustomer } = require('../middleware/auth');

router.use(isAuthenticated, isNotCustomer);

// API endpoint to update order status (called by SortableJS)
router.post('/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    // Allowed statuses
    const allowed = ['backlog', 'pendiente', 'imprimiendo', 'impreso', 'cortando', 'terminado', 'por_entregar', 'entregado'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    try {
        await pool.query(
            `UPDATE orders 
             SET status = $1::status_enum, 
                 operator_id = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`, 
            [status, req.session.user.id, id]
        );
        res.json({ success: true, operator_username: req.session.user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Update order observations
router.post('/orders/:id/observations', async (req, res) => {
    const { id } = req.params;
    const { observations } = req.body;
    try {
        await pool.query('UPDATE orders SET observations = $1 WHERE id = $2', [observations, id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Update order quantity
router.post('/orders/:id/quantity', async (req, res) => {
    const { id } = req.params;
    const quantity = parseInt(req.body.quantity, 10);
    
    if (isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({ success: false, error: 'Cantidad inválida' });
    }

    try {
        const orderQuery = await pool.query(`
            SELECT o.label_id, l.qty_per_sheet 
            FROM orders o
            JOIN labels l ON o.label_id = l.id
            WHERE o.id = $1
        `, [id]);
        
        if (orderQuery.rows.length === 0) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        
        const label = orderQuery.rows[0];
        const qty_per_sheet = label.qty_per_sheet || 1;
        const total_sheets = Math.ceil(quantity / qty_per_sheet);

        await pool.query(`
            UPDATE orders 
            SET quantity = $1, total_sheets = $2
            WHERE id = $3
        `, [quantity, total_sheets, id]);

        res.json({ success: true, new_quantity: quantity, total_sheets: total_sheets });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Reorder API endpoint to persist Kanban board sorting
router.post('/orders/reorder', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
        return res.status(400).json({ success: false, error: 'Invalid ids format' });
    }
    
    try {
        await pool.query('BEGIN');
        for (let i = 0; i < ids.length; i++) {
            await pool.query('UPDATE orders SET position = $1 WHERE id = $2', [i, ids[i]]);
        }
        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

module.exports = router;
