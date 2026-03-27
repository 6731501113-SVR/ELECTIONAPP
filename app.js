const express = require("express");
const path = require("path")
const app = express();
const db = require("./db.js")

// Serve static files from the public directory at root
app.use(express.static(path.join(__dirname, "public")));
// check database connection
db.connect(err => {
    if (err) console.log("❌ DB Connect Fail:", err.message);
    else console.log("✅ Database Connected (JSON Mode)");
});

// ======================================== LOGIN & REGISTER ========================================

// --- ส่วนของ Voter Login ---
app.post('/Voter/Login', (req, res) => {
    const { citizen_id, laser_id } = req.body;
    const sql = "SELECT * FROM voters WHERE citizen_id = ? AND laser_id = ?";
    db.query(sql, [citizen_id, laser_id], (err, results) => {
        if (err) return res.status(500).json({ status: 'error', msg: 'DB Error' });

        if (results.length > 0) {
            // ส่งเป็น JSON แทนการส่งแค่ Text ชื่อไฟล์
            res.status(200).json({
                status: 'success',
                redirect: 'voter-dashboard.html',
                msg: 'เข้าสู่ระบบสำเร็จ'
            });
        } else {
            res.status(401).json({ status: 'fail', msg: 'ข้อมูลไม่ถูกต้อง' });
        }
    });
});


// --- ส่วนของ Candidate Register ---
app.post('/Candidate/Register', (req, res) => {
    const { candidate_id, password } = req.body;
    const sql = "INSERT INTO candidates (can_id, password) VALUES (?, ?)";
    db.query(sql, [candidate_id, password], (err) => {
        if (err) return res.status(500).json({ status: 'error', msg: 'ลงทะเบียนไม่สำเร็จ' });
        res.status(200).json({ status: 'success', msg: 'ลงทะเบียนผู้สมัครสำเร็จ!' });
    });
});


// --- ส่วนของ Candidate Login ---
app.post('/Candidate/Login', (req, res) => {
    const { candidate_id, password } = req.body;
    const sql = "SELECT * FROM candidates WHERE can_id = ? AND password = ?";
    db.query(sql, [candidate_id, password], (err, results) => {
        if (err) return res.status(500).json({ status: 'error', msg: 'DB Error' });
        if (results.length > 0) {
            res.status(200).json({ status: 'success', redirect: 'candidate-dashboard.html', msg: 'ยินดีต้อนรับ' });
        } else {
            res.status(401).json({ status: 'fail', msg: 'รหัสหรือพาสเวิร์ดผิด' });
        }
    });
});


// --- ส่วนของ Admin Login ---
app.post('/Admin/Login', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM admin WHERE username = ? AND password = ?";
    db.query(sql, [username, password], (err, results) => {
        if (err) return res.status(500).json({ status: 'error', msg: 'DB Error' });
        if (results.length > 0) {
            res.status(200).json({ status: 'success', redirect: 'admin-dashboard.html', msg: 'Admin Login Success' });
        } else {
            res.status(401).json({ status: 'fail', msg: 'Admin Username/Password ผิด' });
        }
    });
});


// ======================================== DASHBOARD & RESULT ========================================

// API: /dashboard (ดึงสถิติรวมสำหรับ Dashboard)
app.get('/dashboard', async (req, res) => {
    try {
        const [
            [resVoters],
            [resCandidates],
            [resVoted]
        ] = await Promise.all([
            db.query("SELECT COUNT(*) AS total FROM voters"),
            db.query("SELECT COUNT(*) AS total FROM candidates"),
            db.query("SELECT COUNT(*) AS total FROM voters WHERE has_voted = 1")
        ]);

        const totalVoters = resVoters[0].total;
        const totalCandidates = resCandidates[0].total;
        const votedCount = resVoted[0].total;

        // คำนวณเปอร์เซ็นต์ 
        const participationPercent = totalVoters > 0
            ? parseFloat(((votedCount / totalVoters) * 100).toFixed(2))
            : 0;

        res.json({
            // Query 1: นับจำนวน Voter ทั้งหมด
            total_voters: totalVoters,
            // Query 2: นับจำนวน Candidate ทั้งหมด
            total_candidates: totalCandidates,
            // Query 3: นับจำนวนคนที่โหวตไปแล้ว
            voted_count: votedCount,
            voted_percent: participationPercent
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }

});

// API: /results (ดึงผลคะแนนและการจัดอันดับ)
app.get('/results', async (req, res) => {
    try {
        const searchQuery = req.query.search || '';

        // 1. หาผลรวมคะแนนทั้งหมดก่อน
        const [totalRes] = await db.query("SELECT SUM(vote_score) AS total_votes FROM candidates");
        const totalVotesCast = totalRes[0].total_votes || 0;

        // 2. ดึงรายชื่อ Candidate พร้อมจัดอันดับ
        const qRanking = `
      SELECT can_id, name, vote_score AS votes_received, policy
      FROM candidates 
      WHERE name LIKE ? OR can_id LIKE ?
      ORDER BY vote_score DESC`;

        const [results] = await db.query(qRanking, [`%${searchQuery}%`, `%${searchQuery}%`]);

        // 3. Map ข้อมูลเพื่อคำนวณ % รายบุคคล
        const ranking = results.map(can => ({
            ...can,
            candidate_score_percent: totalVotesCast > 0
                ? ((can.votes_received / totalVotesCast) * 100).toFixed(2)
                : "0.00"
        }));

        res.json({
            total_votes_cast: totalVotesCast,
            ranking: ranking
        });

    } catch (error) {
        console.error('Results Error:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }

});

// ======================================== VOTER ========================================

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

// ======================================== CANDIDATE ========================================

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

app.get('/me', (req, res) => {
    const can_id = req.query.can_id || req.body?.can_id;
    if (!can_id) {
        return res.status(400).json({ error: 'Bad Request', message: 'can_id is required (query or body)' });
    }

    const sql = `SELECT can_id, name, personal_info, policy, vote_score, is_active FROM candidates WHERE can_id = ?`;
    db.query(sql, [can_id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Server error', message: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Not Found', message: 'Candidate not found' });
        }
        const candidate = results[0];
        return res.status(200).json({
            can_id: candidate.can_id,
            name: candidate.name,
            personal_info: candidate.personal_info,
            policy: candidate.policy,
            vote_score: candidate.vote_score,
            is_active: candidate.is_active
        });
    });
});

// บันทึกการแก้ไข name, personal_info, policy (ปุ่ม Save Changes)
app.put('/me', (req, res) => {
    const can_id = req.query.can_id || req.body?.can_id;
    const { name, personal_info, policy } = req.body || {};

    if (!can_id) {
        return res.status(400).json({ error: 'Bad Request', message: 'can_id is required (query or body)' });
    }
    if (!name && !personal_info && !policy) {
        return res.status(400).json({ error: 'Validation Error', message: 'Please provide at least one field to update' });
    }
    if (name !== undefined && name.trim() === '') {
        return res.status(400).json({ error: 'Validation Error', message: 'name must not be empty' });
    }

    const fields = [];
    const values = [];

    if (name !== undefined) {
        fields.push('name = ?');
        values.push(name.trim());
    }
    if (personal_info !== undefined) {
        fields.push('personal_info = ?');
        values.push(personal_info);
    }
    if (policy !== undefined) {
        fields.push('policy = ?');
        values.push(policy);
    }

    values.push(can_id);
    const sql = `UPDATE candidates SET ${fields.join(', ')} WHERE can_id = ?`;

    db.query(sql, values, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Server error', message: err.message });
        }

        db.query('SELECT can_id, name, personal_info, policy FROM candidates WHERE can_id = ?', [can_id], (err2, rows) => {
            if (err2) {
                return res.status(500).json({ error: 'Server error', message: err2.message });
            }
            return res.status(200).json({ success: true, message: 'Profile updated successfully', data: rows[0] });
        });
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