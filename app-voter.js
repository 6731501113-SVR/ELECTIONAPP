module.exports = function(app, db, argon2) {

// ======================================== VOTER ========================================

// 1. ดึงรายชื่อผู้สมัคร
// ดึงข้อมูล Candidate ทั้งหมดส่งให้หน้าเว็บ
app.get('/voter/candidates', async (req, res) => {
    try {
        const [candidates] = await db.query(
            "SELECT can_id AS Candidate_ID, name AS Name, policy AS Policy FROM candidates"
        );
        res.status(200).json(candidates);
    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ error: "Failed to fetch candidates" });
    }
});

//1.5 เช็คว่าโหวตรึยัง
app.get('/voter/has_voted', async (req, res) => {
    try {
        const citizen_id = req.session.citizen_id;
        const sql = "SELECT has_voted FROM voters WHERE citizen_id = ?";
        const [results] = await db.query(sql, [citizen_id]);
        res.status(200).json({ has_voted: results[0].has_voted === 1 });
    } catch (error) {
        console.error('Has Voted Error:', error.message);
        res.status(500).json({ error: 'Server error', message: error.message });
    }
});

// 2. บันทึกโหวต 
app.post('/voter/vote', async (req, res) => {
    try {
        const citizen_id = req.session.citizen_id;
        const { can_id } = req.body;

        if (!can_id || !citizen_id) {
            return res.status(401).send('Candidate ID and Citizen ID are required');
        }

        // 1) ตรวจ voter ทะเบียนอยู่, ยังไม่โหวต, active
        const checkVoterSql = "SELECT has_voted, is_active FROM voters WHERE citizen_id = ?";
        const [voterResult] = await db.query(checkVoterSql, [citizen_id]);
        const voter = voterResult[0];
        if (voter.is_active === 0) return res.status(403).send('บัญชีผู้ใช้ถูกปิดใช้งาน');
        if (voter.has_voted === 1) return res.status(402).send('ผู้ใช้ได้โหวตแล้ว');

        // 2) ตรวจ candidate active
        const checkCandidateSql = "SELECT is_active FROM candidates WHERE can_id = ?";
        const [candidateResult] = await db.query(checkCandidateSql, [can_id]);
        if (candidateResult.length === 0) return res.status(404).send('Candidate not found');
        if (candidateResult[0].is_active === 0) return res.status(403).send('ผู้สมัครถูกปิดใช้งาน');

        // 3) เช็คระบบเปิดโหวต
        const checkSystemSql = "SELECT is_open FROM admin LIMIT 1";
        const [adminResult] = await db.query(checkSystemSql);
        if (adminResult.length === 0 || adminResult[0].is_open === 0) {
            return res.status(403).send('ระบบปิดโหวตแล้ว (Voting is closed)');
        }

        // 4) บันทึกโหวต
        const insertVoteSql = "INSERT INTO votes (citizen_id, can_id) VALUES (?, ?)";
        await db.query(insertVoteSql, [citizen_id, can_id]);

        // 5) อัพเดต score
        const updateScoreSql = "UPDATE candidates SET vote_score = vote_score + 1 WHERE can_id = ?";
        await db.query(updateScoreSql, [can_id]);

        // 6) อัพเดต voter has_voted
        const updateVoterSql = "UPDATE voters SET has_voted = 1 WHERE citizen_id = ?";
        await db.query(updateVoterSql, [citizen_id]);

        res.status(200).send('Vote submitted successfully');
    } catch (error) {
        console.error('Voter Vote Error:', error.message);
        res.status(500).send('Server error: ' + error.message);
    }
});

// 3. ดูประวัติการโหวต
app.get('/voter/history', async (req, res) => {
    try {
        // ตรวจว่า login แล้วหรือยัง
        if (!req.session.isLoggedIn || req.session.role !== 'voter') {
            return res.status(401).json({ status: 'fail', msg: 'กรุณาเข้าสู่ระบบก่อน' });
        }
        const citizen_id = req.session.citizen_id;
        // ดึงประวัติการโหวต join กับตาราง candidates เพื่อได้ชื่อ candidate
        const sql = `
      SELECT v.vote_timestamp, c.name AS candidate_name, c.can_id
      FROM votes v
      JOIN candidates c ON v.can_id = c.can_id
      WHERE v.citizen_id = ?
    `;
        const [results] = await db.query(sql, [citizen_id]);
        if (results.length > 0) {
            // มีประวัติการโหวต
            res.status(200).json({
                hasVoted: true,
                data: results[0] // ส่งแค่ record แรก เพราะ voter โหวตได้ครั้งเดียว
            });
        } else {
            // ยังไม่เคยโหวต
            res.status(200).json({
                hasVoted: false,
                data: null
            });
        }
    } catch (error) {        console.error('Voter History Error:', error.message);
        res.status(500).json({ status: 'error', msg: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์: ' + error.message });
    }
});

};