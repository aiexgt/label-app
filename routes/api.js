const express = require('express');
const router = express.Router();
const pool = require('../db');
const { isAuthenticated, isNotCustomer } = require('../middleware/auth');

router.use(isAuthenticated, isNotCustomer);

const checkOrderBranch = async (req, res, next) => {
    if (req.session.user.is_admin) return next();
    
    const { id } = req.params;
    if (!id) return next();
    
    try {
        const orderRes = await pool.query('SELECT branch_id FROM orders WHERE id = $1', [id]);
        if (orderRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        }
        if (orderRes.rows[0].branch_id !== req.session.user.branch_id) {
            return res.status(403).json({ success: false, error: 'Acceso denegado: Este pedido pertenece a otra sucursal' });
        }
        next();
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// API endpoint to update order status (called by SortableJS)
router.post('/orders/:id/status', checkOrderBranch, async (req, res) => {
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
router.post('/orders/:id/observations', checkOrderBranch, async (req, res) => {
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
router.post('/orders/:id/quantity', checkOrderBranch, async (req, res) => {
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
        // If not admin, verify that all ordered IDs belong to the user's branch
        if (!req.session.user.is_admin) {
            const userBranch = req.session.user.branch_id;
            const checkRes = await pool.query(
                'SELECT COUNT(*) FROM orders WHERE id = ANY($1) AND branch_id != $2',
                [ids, userBranch]
            );
            if (parseInt(checkRes.rows[0].count, 10) > 0) {
                return res.status(403).json({ success: false, error: 'Acceso denegado: Uno o más pedidos pertenecen a otra sucursal' });
            }
        }

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
