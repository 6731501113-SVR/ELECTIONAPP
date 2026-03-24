const mysql = require("mysql2");
const con = mysql.createConnection({
    host: '192.168.1.190', // check the port!
    user: 'test', // in reality, never use root!
    password: '1234', // check the password!
    database: 'election'
});
module.exports = con;