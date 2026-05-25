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
            SELECT o.label_id, l.qty_per_sheet, l.unit_price, l.labor_percentage 
            FROM orders o
            JOIN labels l ON o.label_id = l.id
            WHERE o.id = $1
        `, [id]);
        
        if (orderQuery.rows.length === 0) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        
        const label = orderQuery.rows[0];
        const qty_per_sheet = label.qty_per_sheet || 1;
        const total_sheets = Math.ceil(quantity / qty_per_sheet);
        const total_payment = quantity * label.unit_price;
        const total_labor_payment = total_payment * (label.labor_percentage / 100);

        await pool.query(`
            UPDATE orders 
            SET quantity = $1, total_sheets = $2, total_payment = $3, total_labor_payment = $4
            WHERE id = $5
        `, [quantity, total_sheets, total_payment, total_labor_payment, id]);

        res.json({ success: true, new_quantity: quantity, total_sheets: total_sheets });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});
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
