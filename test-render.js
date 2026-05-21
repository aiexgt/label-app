const ejs = require('ejs');
const path = require('path');
ejs.renderFile(path.join(__dirname, 'views', 'admin', 'finances.ejs'), {
    orders: [],
    totalToPay: 0,
    totalPaid: 0,
    totalLabor: 0,
    users: [],
    start: '',
    end: '',
    user: { username: 'admin', is_admin: true }
}, (err, str) => {
    if (err) console.error(err);
    else console.log("Render successful!");
});
