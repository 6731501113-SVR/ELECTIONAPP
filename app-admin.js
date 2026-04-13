module.exports = function(app, db, argon2) {

// ======================================== ADMIN ========================================

// GET /admin/voters - List all voters
app.get('/admin/voters', async (req, res) => {
    try {
        const sql = "SELECT citizen_id, laser_id, name, has_voted, is_active FROM voters";
        const [results] = await db.query(sql);
        return res.status(200).json({ success: true, data: results });
    } catch (error) {
        console.error('Admin Get Voters Error:', error.message);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
});

// POST /admin/voters - Add new voter
app.post('/admin/voters', async (req, res) => {
    try {
        const { citizen_id, laser_id, name } = req.body;
        const hashed_laser_id = await argon2.hash(laser_id);
        const insertSql = "INSERT INTO voters (citizen_id, laser_id, name, has_voted, is_active) VALUES (?, ?, ?, ?, ?)";
        await db.query(insertSql, [citizen_id, hashed_laser_id, name, 0, 1]);
        return res.status(200).json({ success: true, message: 'Voter added successfully' });
    } catch (error) {
        console.error('Admin Add Voter Error:', error.message);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
});

// GET /admin/candidates - List all candidates
app.get('/admin/candidates', async (req, res) => {
    try {
        const sql = "SELECT can_id, name, personal_info, policy, vote_score, is_active FROM candidates";
        const [results] = await db.query(sql);
        return res.status(200).json({ success: true, data: results });
    } catch (error) {
        console.error('Admin Get Candidates Error:', error.message);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
});

// POST /admin/candidates - Add new candidate
app.post('/admin/candidates', async (req, res) => {
    try {
        const sqlLast = "SELECT can_id FROM candidates ORDER BY can_id DESC LIMIT 1";
        const [result] = await db.query(sqlLast);

        let nextId = "C001";
        if (result.length > 0) {
            const lastId = result[0].can_id;
            const num = parseInt(lastId.substring(1)) + 1;
            nextId = "C" + num.toString().padStart(3, "0");
        }

        const insertSql = "INSERT INTO candidates (can_id) VALUES (?)";
        await db.query(insertSql, [nextId]);

        res.status(200).json({ can_id: nextId });
    } catch (error) {
        console.error('Admin Add Candidate Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

// GET next candidate ID
app.get("/admin/candidates/next-id", async (req, res) => {
    try {
        const sql = "SELECT can_id FROM candidates ORDER BY can_id DESC LIMIT 1";
        const [result] = await db.query(sql);

        let nextId = "C001";
        if (result.length > 0) {
            const lastId = result[0].can_id;
            const num = parseInt(lastId.substring(1)) + 1;
            nextId = "C" + num.toString().padStart(3, "0");
        }
        res.status(200).json({ can_id: nextId });
    } catch (error) {
        console.error('Get Next ID Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

// PUT /admin/candidates/:can_id - Enable/disable candidate
app.put('/admin/candidates/:can_id', async (req, res) => {
    try {
        const can_id = req.params.can_id;
        const { is_active } = req.body;

        if (is_active === undefined) {
            return res.status(401).json({ error: 'Bad Request', message: 'is_active is required' });
        }

        const sql = "UPDATE candidates SET is_active = ? WHERE can_id = ?";
        const [result] = await db.query(sql, [is_active, can_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Not Found', message: 'Candidate not found' });
        }
        return res.status(200).json({ success: true, message: 'Candidate enabled/disabled successfully' });
    } catch (error) {
        console.error('Update Candidate Status Error:', error.message);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
});

// PUT /admin/voters/:citizen_id - Enable/disable voter
app.put('/admin/voters/:citizen_id', async (req, res) => {
    try {
        const citizen_id = req.params.citizen_id;
        const { is_active } = req.body;

        if (is_active === undefined) {
            return res.status(401).json({ error: 'Bad Request', message: 'is_active is required' });
        }

        const sql = "UPDATE voters SET is_active = ? WHERE citizen_id = ?";
        const [result] = await db.query(sql, [is_active, citizen_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Not Found', message: 'Voter not found' });
        }
        return res.status(200).json({ success: true, message: 'Voter enabled/disabled successfully' });
    } catch (error) {
        console.error('Update Voter Status Error:', error.message);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
});

// GET /admin/control - Get voting status
app.get('/admin/control', async (req, res) => {
    try {
        const sql = "SELECT is_open FROM admin LIMIT 1";
        const [results] = await db.query(sql);
        const is_open = results.length > 0 ? results[0].is_open : 0;
        return res.status(200).json({ success: true, is_open: is_open });
    } catch (error) {
        console.error('Get Control Status Error:', error.message);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
});

// PUT /admin/control - Set voting status
app.put('/admin/control', async (req, res) => {
    try {
        const { is_open } = req.body;
        if (is_open === undefined) {
            return res.status(401).json({ error: 'Bad Request', message: 'is_open is required' });
        }
        const sql = "UPDATE admin SET is_open = ?";
        await db.query(sql, [is_open]);
        return res.status(200).json({ success: true, message: 'Voting status updated successfully' });
    } catch (error) {
        console.error('Update Control Status Error:', error.message);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
});
};