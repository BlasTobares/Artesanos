const mysql = require('mysql2');

const conexion = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', 
  database: 'artesanos1'
});

conexion.connect((err) => {
  if (err) throw err;
  console.log('Conexión a MySQL exitosa.');
});

module.exports = conexion;