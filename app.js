const express = require("express");
const path = require("path")
const app = express();
const db = require("./db.js")

// Serve static files from the public directory at root
app.use(express.static(path.join(__dirname, "public")));

// 1. ดึงรายชื่อผู้สมัคร
app.get('/candidates', (req, res) => {
    const sql = "SELECT can_id, name, policy FROM candidates";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).send('Server error');
        res.status(200).json(results);
    });
});

// 2. บันทึกโหวต 
app.post('/vote', (req, res) => {
    const { citizen_id, can_id } = req.body;

    if (!can_id || !citizen_id) {
        return res.status(400).send('Candidate ID and Citizen ID are required');
    }

    // --- เช็คว่า Admin เปิดระบบไหม ---
    const checkSystemSql = "SELECT is_open FROM admin LIMIT 1";
    db.query(checkSystemSql, (err, adminResult) => {
        if (err) return res.status(500).send('Server error');

        // ถ้าระบบปิด (is_open = 0) เด้งออก
        if (adminResult.length === 0 || adminResult[0].is_open === 0) {
            return res.status(403).send('ระบบปิดโหวตแล้ว (Voting is closed)');
        }

        // ถ้าระบบเปิด (is_open = 1) ให้บันทึกโหวต
        const insertVoteSql = "INSERT INTO votes (citizen_id, can_id) VALUES (?, ?)";
        db.query(insertVoteSql, [citizen_id, can_id], (err, result) => {
            if (err) return res.status(400).send('Already voted or Server error');

            const updateScoreSql = "UPDATE candidates SET vote_score = vote_score + 1 WHERE can_id = ?";
            db.query(updateScoreSql, [can_id], (err, updateResult) => {
                if (err) return res.status(500).send('Server error');
                console.log(`✅ Vote saved! Citizen ${citizen_id} voted for ${can_id}`);
                res.status(200).send('Vote submitted successfully');
            });
        });
    });
});

// 3. ดูประวัติการโหวต
app.get('/history/:citizen_id', (req, res) => {
    const citizenId = req.params.citizen_id;
    const sql = `
        SELECT v.vote_timestamp, c.name AS candidate_name, c.can_id
        FROM votes v
        JOIN candidates c ON v.can_id = c.can_id
        WHERE v.citizen_id = ?
    `;
    db.query(sql, [citizenId], (err, results) => {
        if (err) return res.status(500).send('Server error');
        if (results.length > 0) {
            res.status(200).json({ hasVoted: true, data: results[0] });
        } else {
            res.status(200).json({ hasVoted: false });
        }
    });
});














//root
app.get("/", function (_req, res) {
    res.sendFile(path.join(__dirname, "public/HTML/index.html"));
});

// start server at the specified port, if there is error, try another port number
const port = 3000;
app.listen(port, function () {
    console.log("Server is ready at " + port);
});