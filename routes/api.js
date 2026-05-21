const express = require('express');
const router = express.Router();
const pool = require('../db');
const { isAuthenticated } = require('../middleware/auth');

router.use(isAuthenticated);

// API endpoint to update order status (called by SortableJS)
router.post('/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    // Allowed statuses
    const allowed = ['pendiente', 'imprimiendo', 'cortando', 'terminado', 'entregado', 'pagado'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    // Role check for delivered/paid (Operators might not be allowed)
    // Operators can mark as entregado, but only admins as pagado
    if (!req.session.user.is_admin && status === 'pagado') {
        return res.status(403).json({ success: false, error: 'Not authorized for this status' });
    }

    try {
        await pool.query(
            `UPDATE orders 
             SET status = $1::status_enum, 
                 operator_id = CASE WHEN operator_id IS NULL AND $1::text != 'pendiente' THEN $2 ELSE operator_id END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`, 
            [status, req.session.user.id, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Handle partial payments (abonos)
router.post('/orders/:id/abono', async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    
    if (!req.session.user.is_admin) {
        return res.status(403).json({ success: false, error: 'Solo administradores pueden registrar pagos' });
    }

    try {
        const orderQuery = await pool.query('SELECT total_payment, amount_paid, status FROM orders WHERE id = $1', [id]);
        if (orderQuery.rows.length === 0) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        
        const order = orderQuery.rows[0];
        const newAmountPaid = parseFloat(order.amount_paid) + parseFloat(amount);
        let newStatus = order.status;
        
        if (newAmountPaid >= parseFloat(order.total_payment) && order.status !== 'pagado') {
            newStatus = 'pagado';
        }

        await pool.query('UPDATE orders SET amount_paid = $1, status = $2 WHERE id = $3', [newAmountPaid, newStatus, id]);
        res.json({ success: true, amount_paid: newAmountPaid, newStatus });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

module.exports = router;
