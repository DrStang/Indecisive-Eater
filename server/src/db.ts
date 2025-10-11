import mysql from 'mysql2/promise';


export const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionLimit: 10,
    namedPlaceholders: true

});
