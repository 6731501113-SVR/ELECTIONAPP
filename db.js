const mysql = require("mysql2");
const con = mysql.createPool({
    host: '192.168.1.146', // check the port
    user: 'test', // user = test
    password: '1234', // pass = 1234
    database: 'election',
    waitForConnections: true,
    connectionLimit: 10
}).promise(); // Enable promise-based queries
module.exports = con;