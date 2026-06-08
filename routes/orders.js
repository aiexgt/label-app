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
                   l.product_id, l.qty_per_sheet, l.image_path, l.pdf_path, l.word_path, l.pdf_individual_path, l.height, l.width, l.tags, l.paper_type,
                   p.name as product_name, u.username as operator_username, q.name as quality_name
            FROM orders o
            JOIN labels l ON o.label_id = l.id
            JOIN products p ON l.product_id = p.id
            LEFT JOIN users u ON o.operator_id = u.id
            LEFT JOIN qualities q ON l.quality_id = q.id
            WHERE (o.status != 'entregado' OR $1 = TRUE OR DATE(o.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guatemala') = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala'))
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
    const { label_id, quantity, observations, labor } = req.body;
    const hasLabor = labor === 'true' || labor === true;
    
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
            INSERT INTO orders (label_id, quantity, total_sheets, observations, position, labor)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        
        await pool.query(insertQuery, [label_id, quantity, total_sheets, observations, nextPosition, hasLabor]);
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
        let { start_date, end_date, product_id, export: exportFormat, group_by } = req.query;
        
        // Default to today's date in Guatemala timezone if undefined
        const todayStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        if (start_date === undefined) start_date = todayStr;
        if (end_date === undefined) end_date = todayStr;
        
        // Persist and fallback to session preference
        let preferredGroupBy = req.session.history_group_by || 'false';
        if (group_by !== undefined) {
            preferredGroupBy = group_by;
            req.session.history_group_by = group_by;
        }
        const isGrouped = preferredGroupBy === 'true';
        
        let query = '';
        let params = [];
        let paramIndex = 1;
        
        if (isGrouped) {
            query = `
                SELECT p.name as product_name, SUM(o.quantity)::integer as total_quantity
                FROM orders o
                JOIN labels l ON o.label_id = l.id
                JOIN products p ON l.product_id = p.id
                WHERE o.status = 'entregado'
            `;
        } else {
            query = `
                SELECT o.*, 
                       l.product_id, l.qty_per_sheet, l.image_path, l.pdf_path, l.word_path, l.pdf_individual_path, l.height, l.width, l.tags, l.paper_type,
                       p.name as product_name, u.username as operator_username, q.name as quality_name
                FROM orders o
                JOIN labels l ON o.label_id = l.id
                JOIN products p ON l.product_id = p.id
                LEFT JOIN users u ON o.operator_id = u.id
                LEFT JOIN qualities q ON l.quality_id = q.id
                WHERE o.status = 'entregado'
            `;
        }
        
        if (start_date) {
            query += ` AND DATE(o.updated_at) >= $${paramIndex++}`;
            params.push(start_date);
        }
        
        if (end_date) {
            query += ` AND DATE(o.updated_at) <= $${paramIndex++}`;
            params.push(end_date);
        }
        
        if (product_id) {
            query += ` AND l.product_id = $${paramIndex++}`;
            params.push(product_id);
        }
        
        if (isGrouped) {
            query += ` GROUP BY p.name ORDER BY total_quantity DESC`;
        } else {
            query += ` ORDER BY o.updated_at DESC`;
        }
        
        const result = await pool.query(query, params);
        
        if (exportFormat === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=historial_entregados.csv');
            res.write('\uFEFF'); // BOM for UTF-8 in Excel
            
            const escapeCsv = (str) => {
                if (str === null || str === undefined) return '';
                const cleanStr = String(str).replace(/"/g, '""');
                return `"${cleanStr}"`;
            };
            
            if (isGrouped) {
                res.write('Etiqueta,Cantidad Total\n');
                result.rows.forEach(row => {
                    res.write([
                        escapeCsv(row.product_name),
                        row.total_quantity
                    ].join(',') + '\n');
                });
            } else {
                res.write('ID,Etiqueta,Tags,Cantidad,Mano de Obra,Fecha Ingreso,Fecha Entrega,Diseño URL\n');
                
                result.rows.forEach(order => {
                    const orderDate = new Date(order.order_date).toLocaleString('es-ES', { timeZone: 'America/Guatemala' });
                    const deliveryDate = new Date(order.updated_at).toLocaleString('es-ES', { timeZone: 'America/Guatemala' });
                    const designUrl = order.image_path ? `${req.protocol}://${req.get('host')}${order.image_path}` : 'N/A';
                    
                    res.write([
                        order.id,
                        escapeCsv(order.product_name),
                        escapeCsv(order.tags),
                        order.quantity,
                        order.labor ? 'Sí' : 'No',
                        escapeCsv(orderDate),
                        escapeCsv(deliveryDate),
                        escapeCsv(designUrl)
                    ].join(',') + '\n');
                });
            }
            return res.end();
        }

        // Calculate summary cards metrics
        let sumQuery = `
            SELECT 
                COALESCE(SUM(o.quantity), 0)::integer as total_general,
                COALESCE(SUM(CASE WHEN o.labor = TRUE THEN o.quantity ELSE 0 END), 0)::integer as total_labor
            FROM orders o
            JOIN labels l ON o.label_id = l.id
            JOIN products p ON l.product_id = p.id
            WHERE o.status = 'entregado'
        `;
        
        let sumParams = [];
        let sumParamIndex = 1;
        
        if (start_date) {
            sumQuery += ` AND DATE(o.updated_at) >= $${sumParamIndex++}`;
            sumParams.push(start_date);
        }
        
        if (end_date) {
            sumQuery += ` AND DATE(o.updated_at) <= $${sumParamIndex++}`;
            sumParams.push(end_date);
        }
        
        if (product_id) {
            sumQuery += ` AND l.product_id = $${sumParamIndex++}`;
            sumParams.push(product_id);
        }
        
        const sumResult = await pool.query(sumQuery, sumParams);
        const totalEtiquetasGeneral = sumResult.rows[0].total_general;
        const totalEtiquetasLabor = sumResult.rows[0].total_labor;

        let mostRequestedProduct = 'Ninguno';
        let mostRequestedQty = 0;

        if (isGrouped) {
            if (result.rows.length > 0) {
                mostRequestedProduct = result.rows[0].product_name;
                mostRequestedQty = result.rows[0].total_quantity;
            }
        } else {
            const productSums = {};
            result.rows.forEach(order => {
                const qty = parseInt(order.quantity) || 0;
                const prodName = order.product_name;
                productSums[prodName] = (productSums[prodName] || 0) + qty;
            });
            
            for (const prodName in productSums) {
                if (productSums[prodName] > mostRequestedQty) {
                    mostRequestedQty = productSums[prodName];
                    mostRequestedProduct = prodName;
                }
            }
        }

        // Fetch all products for the filter dropdown
        const productsResult = await pool.query('SELECT * FROM products ORDER BY name');
        
        const filters = { start_date, end_date, product_id, group_by: preferredGroupBy };
        const queryParams = new URLSearchParams();
        if (start_date) queryParams.set('start_date', start_date);
        if (end_date) queryParams.set('end_date', end_date);
        if (product_id) queryParams.set('product_id', product_id);
        if (isGrouped) queryParams.set('group_by', 'true');
        const queryString = queryParams.toString();

        res.render('history', { 
            orders: result.rows, 
            products: productsResult.rows,
            filters,
            queryString,
            totalEtiquetasGeneral,
            totalEtiquetasLabor,
            mostRequestedProduct,
            mostRequestedQty
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /orders/:id/labor - Toggle labor status (Admin only)
router.post('/orders/:id/labor', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { labor } = req.body;
    try {
        await pool.query('UPDATE orders SET labor = $1 WHERE id = $2', [labor === true || labor === 'true', id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
