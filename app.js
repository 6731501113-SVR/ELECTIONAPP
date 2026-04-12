const express = require("express");
const path = require("path")
const app = express();
const db = require("./db.js")
const argon2 = require('argon2');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);

// Serve only public static assets needed by the frontend (CSS / JS)
app.use('/CSS', express.static(path.join(__dirname, 'public', 'CSS')));
app.use('/JS', express.static(path.join(__dirname, 'public', 'JS')));

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Session Configuration 
app.use(session({
    secret: 'my-secret-key',
    resave: false,
    saveUninitialized: false, // เปลี่ยนเป็น false เพื่อไม่ให้จองที่ว่างถ้าไม่จำเป็น
    cookie: {
        secure: false, // ถ้าไม่ได้ใช้ https ให้เป็น false
        httpOnly: true,
        sameSite: 'lax', // สำคัญมาก: ช่วยให้ Cookie ส่งข้ามระหว่าง Port 5500 และ 3000 ได้
        maxAge: 24 * 60 * 60 * 1000 // ให้ session อยู่ได้ 1 วัน
    },
    store: new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 }) // ล้าง session ที่หมดอายุทุก 24 ชั่วโมง
}));
// middleware ล้าง cache หน้าเพจไม่ให้กลับไปดูได้หลัง Logout
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});
// check database connection
db.getConnection((err, connection) => {
    if (err) console.log("❌ DB Connect Fail:", err.message);
    else console.log("✅ Database Connected (JSON Mode)");
    connection.release(); // Release the connection back to the pool
});

// ======================================== LOGIN & REGISTER ========================================

// --- ส่วนของ Voter Login ---
app.post('/voter/login', async (req, res) => {
    try {
        const { citizen_id, laser_id } = req.body;

        // 1. ค้นหาผู้ใช้จาก citizen_id เพื่อดึง Hash ออกมาตรวจสอบ
        const sql = "SELECT citizen_id, laser_id, is_active FROM voters WHERE citizen_id = ?";
        const [results] = await db.query(sql, [citizen_id]);

        // 2. ถ้าไม่พบ citizen_id ในระบบ
        if (results.length === 0) {
            return res.status(401).json({ status: 'fail', msg: 'ข้อมูลบัตรประชาชนหรือ Laser ID ไม่ถูกต้อง' });
        }

        const voter = results[0];

        // 3. ตรวจสอบ Laser ID ด้วย Argon2 (เปรียบเทียบรหัสที่รับมา กับ Hash ในฐานข้อมูล)
        const isMatch = await argon2.verify(voter.laser_id, laser_id);
        if (!isMatch) {
            return res.status(401).json({ status: 'fail', msg: 'ข้อมูลบัตรประชาชนหรือ Laser ID ไม่ถูกต้อง' });
        }

        // 4. ตรวจสอบสถานะการใช้งานบัญชี
        if (voter.is_active === 0) {
            return res.status(403).json({ status: 'fail', msg: 'บัญชีนี้ถูกปิดใช้งานชั่วคราว' });
        }

        // 5. เมื่อข้อมูลถูกต้องทั้งหมด ให้สร้างและบันทึก Session
        req.session.citizen_id = voter.citizen_id;
        req.session.role = 'voter';
        req.session.isLoggedIn = true;

        // บังคับให้บันทึก Session ลง Store ทันที
        req.session.save((err) => {
            if (err) {
                console.error("Session Save Error:", err);
                return res.status(500).json({ status: 'error', msg: 'ระบบ Session มีปัญหา' });
            }
           
            // ส่ง Response กลับไปให้ Frontend
            res.status(200).json({
                status: 'success',
                redirect: '/pages/voter/dashboard',
                msg: 'เข้าสู่ระบบสำเร็จ',
            });
        });
    } catch (error) {
        console.error('Voter Login Error:', error.message);
        res.status(500).json({ status: 'error', msg: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
    }
});


// candidate-register
app.post('/candidate/register', async (req, res) => {
    const can_id = String(req.body.can_id || '').trim().toUpperCase();
    const name = String(req.body.name || '').trim();
    const policy = String(req.body.policy || '').trim();
    const password = String(req.body.password || '');

    if (!can_id || !name || !password) {
        return res.status(400).json({ status: 'fail', msg: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    try {
        const checkSql = "SELECT password FROM candidates WHERE can_id = ?";
        const [rows] = await db.query(checkSql, [can_id]);

        if (rows.length === 0) {
            return res.status(400).json({ status: 'fail', msg: 'ไม่พบ Candidate ID นี้ในระบบ กรุณาติดต่อ Admin' });
        }

        if (rows[0].password) {
            return res.status(400).json({ status: 'fail', msg: 'ID นี้ถูกลงทะเบียนไปแล้ว' });
        }

        const hashedPassword = await argon2.hash(password);
        const updateSql = "UPDATE candidates SET name = ?, policy = ?, password = ?, is_active = 0 WHERE can_id = ?";
        const [result] = await db.query(updateSql, [name, policy, hashedPassword, can_id]);

        if (result.affectedRows === 0) {
            return res.status(500).json({ status: 'error', msg: 'ลงทะเบียนไม่สำเร็จ' });
        }

        res.json({ status: 'success', msg: 'ลงทะเบียนสำเร็จ! โปรดรอการตรวจสอบจาก Admin' });
    } catch (error) {
        console.error('Candidate Register Error:', error);
        res.status(500).json({ status: 'error', msg: 'เกิดข้อผิดพลาด: ' + error.message });
    }
});


// --- ส่วนของ Candidate Login ---
app.post('/candidate/login', async (req, res) => {
    const candidate_id = String(req.body.candidate_id || '').trim().toUpperCase();
    const password = String(req.body.password || '').trim();

    try {
        // 1. ตรวจสอบว่ากรอกข้อมูลครบถ้วนหรือไม่
        // if (!candidate_id || !password) {
        //     return res.status(400).json({ status: 'fail', msg: 'กรุณากรอก ID และรหัสผ่าน' });
        // }

        // 2. ดึงข้อมูลจาก Database
        const [rows] = await db.query(
            "SELECT password, is_active FROM candidates WHERE can_id = ?",
            [candidate_id]
        );

        // console.log('Candidate login attempt:', { candidate_id, found: rows.length > 0 }); for debugging

        // 3. กรณีไม่พบผู้ใช้งานในระบบ
        if (rows.length === 0) {
            return res.status(401).json({ status: 'fail', msg: 'ไม่พบหมายเลขผู้สมัครนี้' });
        }
        const user = rows[0];

        // 3.5. ตรวจสอบว่าลงทะเบียนหรือยัง
        if (user.password === null) {
            return res.status(402).json({ status: 'fail', msg: 'หมายเลขผู้สมัครนี้ยังไม่ได้ลงทะเบียน' });
        }

        // 4. ตรวจสอบสถานะบัญชี (is_active)
        if (user.is_active === 0) {
            return res.status(403).json({ status: 'fail', msg: 'บัญชีนี้ถูกปิดใช้งานชั่วคราว' });
        }

        // 5. ตรวจสอบรหัสผ่านด้วย Argon2 (Verify)
        // user.password คือ Hash จาก DB, password คือรหัสที่รับมาจากหน้าเว็บ
        const isMatch = await argon2.verify(user.password, password);
        // console.log('Candidate password verify result:', isMatch); // for debugging

        if (isMatch) {
            // ✅ รหัสถูกต้อง: ทำการเซ็ต SESSION เพื่อยืนยันตัวตน
            req.session.can_id = candidate_id;
            req.session.role = 'candidate';
            req.session.isLoggedIn = true;

            // 6. บันทึก Session ให้เสร็จสิ้นก่อนส่ง Response กลับไป
            req.session.save((err) => {
                if (err) {
                    console.error("Session Save Error:", err);
                    return res.status(500).json({ status: 'error', msg: 'ระบบ Session มีปัญหา' });
                }
                return res.status(200).json({
                    status: 'success',
                    redirect: '/pages/candidate/dashboard',
                    msg: 'เข้าสู่ระบบสำเร็จ'
                });
            });
        } else {
            // ❌ รหัสผ่านไม่ถูกต้อง
            return res.status(401).json({ status: 'fail', msg: 'รหัสผ่านไม่ถูกต้อง' });
        }

    } catch (error) {
        // จัดการ Error กรณีระบบฐานข้อมูลหรือการเข้ารหัสมีปัญหา
        console.error("Candidate Login Error Details:", error);
        return res.status(500).json({ status: 'error', msg: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
    }
});

// --- ส่วนของ Admin Login ---
app.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const sql = "SELECT * FROM admin WHERE username = ? AND password = ?";
        const [results] = await db.query(sql, [username, password]);

        if (results.length > 0) {
            req.session.role = 'admin';
            req.session.isLoggedIn = true;
            req.session.save((err) => {
                if (err) {
                    console.error("Session Save Error:", err);
                    return res.status(500).json({ status: 'error', msg: 'ระบบ Session มีปัญหา' });
                }
                res.status(200).json({ status: 'success', redirect: '/pages/admin/dashboard', msg: 'Admin Login Success' });
            });
        } else {
            res.status(401).json({ status: 'fail', msg: 'Admin Username/Password ผิด' });
        }
    } catch (error) {
        console.error('Admin Login Error:', error.message);
        res.status(500).json({ status: 'error', msg: 'DB Error: ' + error.message });
    }
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
        console.error('Results Error:', error);
        res.status(500).json({ error: 'Server error', message: error.message });
    }

});


// ======================================== VOTER ========================================

// 1. ดึงรายชื่อผู้สมัคร
app.get('/voter/candidates', async (req, res) => {
    try {
        const sql = "SELECT can_id, name, policy FROM candidates";
        const [results] = await db.query(sql);
        res.status(200).json(results);
    } catch (error) {
        console.error('Voter Candidates Error:', error.message);
        res.status(500).send('Server error: ' + error.message);
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

        if (voterResult.length === 0) return res.status(404).send('Voter not found');
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

        console.log(`✅ Vote saved! Citizen ${citizen_id} voted for ${can_id}`);
        res.status(200).send('Vote submitted successfully');
    } catch (error) {
        console.error('Voter Vote Error:', error.message);
        res.status(500).send('Server error: ' + error.message);
    }
});

// 3. ดูประวัติการโหวต
app.get('/voter/history/', async (req, res) => {
    try {
        const citizenId = req.session.citizen_id;
        const sql = `
            SELECT v.vote_timestamp, c.name AS candidate_name, c.can_id
            FROM votes v
            JOIN candidates c ON v.can_id = c.can_id
            WHERE v.citizen_id = ?
        `;
        const [results] = await db.query(sql, [citizenId]);

        if (results.length > 0) {
            res.status(200).json({ hasVoted: true, data: results });
        } else {
            res.status(200).json({ hasVoted: false, data: [] });
        }
    } catch (error) {
        console.error('Voter History Error:', error.message);
        res.status(500).send('Server error: ' + error.message);
    }
});

// ======================================== CANDIDATE ========================================
// ดึงข้อมูลโปรไฟล์ของผู้สมัคร
app.get('/candidate/profile', async (req, res) => {
    // ดึงค่าจาก session ก่อน ถ้าไม่มีให้ไปดูที่ query string (ที่ส่งมาจาก URL)
    const can_id = req.session.can_id || req.query.can_id;

    // console.log("Current can_id used:", can_id); // จะโชว์ค่าแทน undefined

    if (!can_id) {
        return res.status(401).json({ message: 'User ID not found' });
    }

    try {
        const sql = "SELECT can_id, name, personal_info, policy FROM candidates WHERE can_id = ?";
        const [results] = await db.query(sql, [can_id]);
        res.status(200).json(results[0] || {});
    } catch (err) {
        res.status(500).json({ error: 'DB Error', message: err.message });
    }
});

// GET /candidate/info?can_id=C001
// ดึงข้อมูลมาแสดงในฟอร์มหน้า Manage Info
// ใช้ can_id จาก query param (เหมือนที่เพื่อนใช้ใน /candidate/profile)
app.get('/candidate/info', async (req, res) => {
    try {
        const can_id = req.session.can_id || req.query.can_id;


        if (!can_id) {
            return res.status(400).json({ error: 'Validation Error', message: 'can_id is required' });
        }

        const [rows] = await db.query(
            "SELECT can_id, name, personal_info, policy FROM candidates WHERE can_id = ?",
            [can_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Not Found', message: 'Candidate not found' });
        }

        res.json(rows[0]);


    } catch (err) {
        console.error('Get Candidate Info Error:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// PUT /candidate/info
// บันทึกข้อมูลเมื่อกด Save Changes
// Body: { can_id, name, personal_info, policy }
app.put('/candidate/info', async (req, res) => {
    try {
        const { can_id, name, personal_info, policy } = req.body;

        if (!can_id) {
            return res.status(400).json({ error: 'Validation Error', message: 'can_id is required' });
        }

        if (!name && !personal_info && !policy) {
            return res.status(400).json({
                error: 'Validation Error',
                message: 'Please provide at least one field to update'
            });
        }

        if (name !== undefined && name.trim() === '') {
            return res.status(400).json({ error: 'Validation Error', message: 'name must not be empty' });
        }

        // Build query เฉพาะ field ที่ส่งมา
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

        await db.query(
            `UPDATE candidates SET ${fields.join(', ')} WHERE can_id = ?`,
            values
        );

        // ดึงข้อมูลล่าสุดกลับมาส่ง response
        const [updated] = await db.query(
            "SELECT can_id, name, personal_info, policy FROM candidates WHERE can_id = ?",
            [can_id]
        );

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: updated[0]
        });

    } catch (err) {
        console.error('Update Candidate Info Error:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});


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
        const insertSql = "INSERT INTO voters (citizen_id, laser_id, name, has_voted, is_active) VALUES (?, ?, ?, ?, ?)";
        await db.query(insertSql, [citizen_id, laser_id, name, 0, 1]);
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

// ======================================== SESSION MANAGEMENT ========================================

// GET /session/check - ตรวจสอบ session
app.get('/session/check', (req, res) => {
    if (req.session.isLoggedIn) {
        if (req.session.role === 'admin') {
            return res.status(200).json({
                isLoggedIn: true,
                role: req.session.role
            });
        } else if (req.session.role === 'candidate') {
            return res.status(200).json({
                isLoggedIn: true,
                role: req.session.role,
                can_id: req.session.can_id
            });
        } else if (req.session.role === 'voter') {
            return res.status(200).json({
                isLoggedIn: true,
                role: req.session.role,
                citizen_id: req.session.citizen_id,
            });
        }
    } else {
        res.status(401).json({
            isLoggedIn: false,
            message: 'Not logged in'
        });
    }
});

// POST /logout - ล้าง session
app.post('/logout', async (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout Error:', err);
            return res.status(500).json({ status: 'error', msg: 'เกิดข้อผิดพลาดในการ logout' });
        }
        res.clearCookie('connect.sid'); // ล้าง cookie ของ session ด้วย
        res.status(200).json({ status: 'success', msg: 'Logout สำเร็จ' });
    });
});

// ======================================== ROUTE ========================================
// หน้าเพจทั้งหมด
const pageRoutes = {
    admin: ['login', 'candidates', 'voters', 'control', 'dashboard', 'results'],
    candidate: ['login', 'register', 'info', 'manage', 'dashboard', 'results'],
    voter: ['login', 'candidates', 'voting', 'history', 'dashboard', 'results']
};

// สำหรับเชื่อมชื่อไฟล์
function resolvePageFilename(section, page) {
    if (page === 'dashboard') return 'dashboard.html';
    if (page === 'results') return 'results.html';
    return `${section}-${page}.html`;
}
// สำหรับตรวจสอบสิทธิ์การเข้าถึงหน้าเพจ
function requireLogin(req, res, next) {
    if (!req.session.isLoggedIn) {
        return res.redirect('/');
    }
    next();
}
function requireRole(role) {
    return function (req, res, next) {
        if (!req.session.isLoggedIn) {
            return res.redirect('/');
        }

        if (req.session.role !== role) {
            return res.redirect(`/pages/${role}/login`);
        }

        next();
    };
}

// dynamic route นั่นเอง
app.get('/pages/:section/:page', (req, res) => {
    const { section, page } = req.params;
    if (!pageRoutes[section] || !pageRoutes[section].includes(page)) {
        return res.status(404).send('Page not found');
    }

    // login page
    if (page === 'login' || page === 'register') {
        return res.sendFile(
            path.join(__dirname, 'public', 'HTML', resolvePageFilename(section, page))
        );
    } 

    // check isLoggedIn from session
    if (!req.session.isLoggedIn) {
        return res.redirect('/pages/' + section + '/login');
    }

    if (req.session.role !== section) {
        return res.redirect(`/pages/${req.session.role}/dashboard`);
    }

    res.sendFile(
        path.join(__dirname, 'public', 'HTML', resolvePageFilename(section, page))
    );
});

//root
app.get("/", function (_req, res) {
    res.sendFile(path.join(__dirname, "public/HTML/index.html"));
});

// app.get('/password/:raw', async (req, res) => {
//     try {
//         const hash = await argon2.hash(req.params.raw);
//         res.status(200).send(hash);
//     } catch (err) {
//         res.status(500).send('Error hashing password');
//     }
// });

// start server at the specified port, if there is error, try another port number
const port = 3000;
app.listen(port, function () {
    console.log("Server is ready at " + port);
});