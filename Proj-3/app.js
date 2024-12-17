const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const session = require('express-session');

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

// Serve static files
app.use(express.static('public'));

app.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
});

// Login page
app.get('/', (req, res) => {
    res.render('index'); // Render the login page
});

// Login route
app.post('/login', async (req, res) => {
    const { host, database, username, password } = req.body;

    try {
        // Save database credentials in session
        req.session.dbConfig = { host, database, username, password };

        // Create and test the pool to ensure credentials are correct
        const pool = mysql.createPool({
            host,
            user: username,
            password,
            database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        await pool.query('SELECT 1'); // Test the connection
        console.log(`Connected to database: ${database}`);

        res.redirect('/main'); // Redirect to the main menu
    } catch (err) {
        console.error("Error connecting to the database:", err.message);
        res.send("Invalid login credentials or database not found. Please try again.");
    }
});

// Main menu
app.get('/main', (req, res) => {
    if (!req.session.dbConfig) {
        return res.redirect('/'); // Redirect to login if session is not initialized
    }
    res.render('main'); // Render the main menu
});

// Helper function to create a pool dynamically
const getConnectionPool = (dbConfig) => {
    return mysql.createPool({
        host: dbConfig.host,
        user: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
};

// Display digital displays
app.get('/display', async (req, res) => {
    try {
        const dbConfig = req.session.dbConfig;
        if (!dbConfig) {
            return res.redirect('/');
        }

        const pool = getConnectionPool(dbConfig);
        const [displays] = await pool.query('SELECT * FROM DigitalDisplay');
        res.render('display', { displays });
    } catch (err) {
        console.error("Error fetching digital displays:", err.message);
        res.send("Error fetching digital displays.");
    }
});

// Model details
app.get('/model/:modelNo', async (req, res) => {
    const modelNo = req.params.modelNo;

    try {
        const dbConfig = req.session.dbConfig;
        if (!dbConfig) {
            return res.redirect('/');
        }

        const pool = getConnectionPool(dbConfig);
        const [modelDetails] = await pool.query('SELECT * FROM Model WHERE modelNo = ?', [modelNo]);
        if (modelDetails.length === 0) {
            res.send("No details found for this model number.");
        } else {
            res.render('model', { model: modelDetails[0] });
        }
    } catch (err) {
        console.error("Error fetching model details:", err.message);
        res.send("Error fetching model details.");
    }
});

// Search by scheduler
app.get('/search', (req, res) => {
    res.render('search'); // Render the search form
});

app.post('/search/results', async (req, res) => {
    const { schedulerSystem } = req.body;

    try {
        const dbConfig = req.session.dbConfig;
        if (!dbConfig) {
            return res.redirect('/');
        }

        const pool = getConnectionPool(dbConfig);
        const [results] = await pool.query(
            'SELECT * FROM DigitalDisplay WHERE schedulerSystem = ?',
            [schedulerSystem]
        );
        res.render('searchResults', { results, schedulerSystem });
    } catch (err) {
        console.error("Error searching digital displays:", err.message);
        res.send("Error searching digital displays.");
    }
});

// Delete a digital display
app.post('/display/:id/delete', async (req, res) => {
    const serialNo = req.params.id;

    try {
        const dbConfig = req.session.dbConfig;
        if (!dbConfig) {
            return res.redirect('/');
        }

        const pool = getConnectionPool(dbConfig);

        const [results] = await pool.query('SELECT modelNo FROM DigitalDisplay WHERE serialNo = ?', [serialNo]);
        if (results.length === 0) {
            return res.status(404).send('Digital display not found.');
        }

        const modelNo = results[0].modelNo;

        await pool.query('DELETE FROM DigitalDisplay WHERE serialNo = ?', [serialNo]);

        const [modelResults] = await pool.query('SELECT COUNT(*) AS count FROM DigitalDisplay WHERE modelNo = ?', [modelNo]);
        if (modelResults[0].count === 0) {
            await pool.query('DELETE FROM Model WHERE modelNo = ?', [modelNo]);
        }

        res.redirect('/display');
    } catch (err) {
        console.error("Error deleting digital display:", err.message);
        res.send("Error deleting digital display.");
    }
});

// Add model and digital display routes
app.get('/addModel', (req, res) => {
    const { modelNo, serialNo, schedulerSystem } = req.query;
    res.render('addModel', { modelNo, serialNo, schedulerSystem });
});

app.post('/addModel', async (req, res) => {
    const { modelNo, width, height, weight, depth, screenSize, serialNo, schedulerSystem } = req.body;

    try {
        const dbConfig = req.session.dbConfig;
        if (!dbConfig) {
            return res.redirect('/');
        }

        const pool = getConnectionPool(dbConfig);

        await pool.query(
            'INSERT INTO Model (modelNo, width, height, weight, depth, screenSize) VALUES (?, ?, ?, ?, ?, ?)',
            [modelNo, width, height, weight, depth, screenSize]
        );
        await pool.query(
            'INSERT INTO DigitalDisplay (serialNo, schedulerSystem, modelNo) VALUES (?, ?, ?)',
            [serialNo, schedulerSystem, modelNo]
        );
        res.redirect('/display');
    } catch (err) {
        console.error("Error adding model and inserting digital display:", err.message);
        res.send("Error adding model and inserting digital display.");
    }
});

// Insert digital display page
app.get('/insert', (req, res) => {
    res.render('insert'); // Render the insert form
});

// Insert digital display route
app.post('/insert', async (req, res) => {
    const { serialNo, schedulerSystem, modelNo } = req.body;
    console.log("Form Data Received:", req.body); // Log received data

    try {
        const dbConfig = req.session.dbConfig;
        if (!dbConfig) {
            return res.redirect('/');
        }

        const pool = getConnectionPool(dbConfig);

        const [modelExists] = await pool.query('SELECT * FROM Model WHERE modelNo = ?', [modelNo]);
        console.log("Model Check:", modelExists);

        if (modelExists.length === 0) {
            return res.redirect(`/addModel?modelNo=${modelNo}&serialNo=${serialNo}&schedulerSystem=${schedulerSystem}`);
        }

        await pool.query(
            'INSERT INTO DigitalDisplay (serialNo, schedulerSystem, modelNo) VALUES (?, ?, ?)',
            [serialNo, schedulerSystem, modelNo]
        );
        console.log(`Digital display ${serialNo} inserted successfully.`);
        res.redirect('/display');
    } catch (err) {
        console.error("Error inserting digital display:", err.message);
        res.send("Error inserting digital display.");
    }
});

// Add model page
app.get('/addModel', (req, res) => {
    const { modelNo, serialNo, schedulerSystem } = req.query; // Extract query parameters
    res.render('addModel', { modelNo, serialNo, schedulerSystem }); // Render the add model form
});
// add model
app.post('/addModel', async (req, res) => {
    const { modelNo, width, height, weight, depth, screenSize, serialNo, schedulerSystem } = req.body;
    console.log("Add Model Form Data:", req.body); // Log form data

    try {
        const dbConfig = req.session.dbConfig;
        if (!dbConfig) {
            console.log("No DB Config in session");
            return res.redirect('/');
        }

        const pool = getConnectionPool(dbConfig);

        await pool.query(
            'INSERT INTO Model (modelNo, width, height, weight, depth, screenSize) VALUES (?, ?, ?, ?, ?, ?)',
            [modelNo, width, height, weight, depth, screenSize]
        );

        await pool.query(
            'INSERT INTO DigitalDisplay (serialNo, schedulerSystem, modelNo) VALUES (?, ?, ?)',
            [serialNo, schedulerSystem, modelNo]
        );
        console.log(`Model ${modelNo} and digital display ${serialNo} inserted successfully.`);
        res.redirect('/display');
    } catch (err) {
        console.error("Error adding model and inserting digital display:", err.message);
        res.send("Error adding model and inserting digital display.");
    }
});

app.get('/update/:serialNo', async (req, res) => {
    const serialNo = req.params.serialNo; // Extract the serial number from the URL

    try {
        const dbConfig = req.session.dbConfig;
        if (!dbConfig) {
            console.log("No DB Config in session");
            return res.redirect('/');
        }

        const pool = getConnectionPool(dbConfig);

        // Fetch the details of the digital display
        const [result] = await pool.query('SELECT * FROM DigitalDisplay WHERE serialNo = ?', [serialNo]);

        if (result.length === 0) {
            console.log(`Digital display with Serial No ${serialNo} not found.`);
            res.status(404).send("Digital display not found.");
        } else {
            console.log(`Fetched digital display:`, result[0]);
            res.render('update', { display: result[0] }); // Render the update page with the display data
        }
    } catch (err) {
        console.error("Error fetching digital display:", err.message);
        res.send("Error fetching digital display.");
    }
});

app.post('/update/:serialNo', async (req, res) => {
    const oldSerialNo = req.params.serialNo; // Serial No from the URL
    const { serialNo, schedulerSystem, modelNo } = req.body; // Extract updated fields from the form

    console.log("Update Form Data:", req.body);

    try {
        const dbConfig = req.session.dbConfig;
        if (!dbConfig) {
            console.log("No DB Config in session");
            return res.redirect('/');
        }

        const pool = getConnectionPool(dbConfig);

        // Validate the modelNo exists in the Model table
        const [modelValidation] = await pool.query('SELECT modelNo FROM Model WHERE modelNo = ?', [modelNo]);
        if (modelValidation.length === 0) {
            console.log(`Model No "${modelNo}" does not exist.`);
            return res.send(`Error: Model No "${modelNo}" does not exist. Please provide a valid model.`);
        }

        // Update the digital display
        const [updateResult] = await pool.query(
            'UPDATE DigitalDisplay SET serialNo = ?, schedulerSystem = ?, modelNo = ? WHERE serialNo = ?',
            [serialNo, schedulerSystem, modelNo, oldSerialNo]
        );

        console.log(`Updated digital display ${oldSerialNo} successfully.`);
        res.redirect('/display'); // Redirect back to display page
    } catch (err) {
        console.error("Error updating digital display:", err.message);
        res.send("Error updating digital display.");
    }
});