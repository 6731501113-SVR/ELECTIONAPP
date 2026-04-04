const express = require("express");
const path = require("path")
const app = express();
const db = require("./db.js")
const argon2 = require('argon2');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);

// Serve static files from the public directory at root
app.use(express.static(path.join(__dirname, "public")));
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
// check database connection
db.getConnection((err, connection) => {
    if (err) console.log("❌ DB Connect Fail:", err.message);
    else console.log("✅ Database Connected (JSON Mode)");
    connection.release(); // Release the connection back to the pool
});

// ======================================== LOGIN & REGISTER ========================================

// --- ส่วนของ Voter Login ---
app.post('/Voter/Login', (req, res) => {
    const { citizen_id, laser_id } = req.body;
    const sql = "SELECT citizen_id, laser_id, is_active FROM voters WHERE citizen_id = ? AND laser_id = ?";
    db.query(sql, [citizen_id, laser_id], (err, results) => {
        if (err) return res.status(500).json({ status: 'error', msg: 'DB Error' });

        if (results.length === 0) {
            return res.status(401).json({ status: 'fail', msg: 'ข้อมูลไม่ถูกต้อง' });
        }

        const voter = results[0];
        if (voter.is_active === 0) {
            return res.status(403).json({ status: 'fail', msg: 'บัญชีถูกปิดใช้งาน' });
        }
        req.session.citizen_id = citizen_id;
        req.session.role = 'voter';
        req.session.isLoggedIn = true;
        res.status(200).json({
            status: 'success',
            redirect: 'voter-dashboard.html',
            msg: 'เข้าสู่ระบบสำเร็จ',
        });
    });
});


// --- ส่วนของ Candidate Register ---
app.post('/Candidate/Register', (req, res) => {
    const { candidate_id, password } = req.body;

    const sql = `
        UPDATE candidates 
        SET password = ? 
        WHERE can_id = ? AND password IS NULL
    `;
    passwordHash = argon2.hash(password);
    db.query(sql, [passwordHash, candidate_id], (err, result) => {
        if (err) {
            return res.status(500).json({
                status: 'error',
                msg: 'เกิดข้อผิดพลาด'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(401).json({
                status: 'error',
                msg: 'ผู้สมัครนี้ได้ลงทะเบียนแล้วหรือไม่มีไอดีนี้ในระบบ'
            });
        }

        res.status(200).json({
            status: 'success',
            msg: 'ลงทะเบียนสำเร็จ'
        });
    });
});


// --- ส่วนของ Candidate Login ---
app.post('/Candidate/Login', async (req, res) => {
    const { candidate_id, password } = req.body;

    try {
        // 1. ใช้ await แทนการเขียน callback (err, results) => { ... }
        // หมายเหตุ: [rows] คือการดึงผลลัพธ์ array ออกมาตัวเดียว (Destructuring)
        const [rows] = await db.query(
            "SELECT password, is_active FROM candidates WHERE can_id = ?",
            [candidate_id]
        );
        // 2. ตรวจสอบว่าพบผู้ใช้ไหม
        if (rows.length === 0) {
            return res.status(401).json({ status: 'fail', msg: 'ไม่พบผู้ใช้งาน' });
        }
        const user = rows[0];
        // 3. ตรวจสอบสถานะบัญชี
        if (user.is_active === 0) {
            return res.status(403).json({ status: 'fail', msg: 'บัญชีถูกปิดใช้งาน' });
        }
        // 4. ตรวจสอบรหัสผ่านด้วย Argon2
        const isMatch = await argon2.verify(user.password, password);

        if (isMatch) {
            // ✅ SESSION - ใช้ key 'can_id' ให้ตรงกันทั้งโปรเจกต์
            req.session.can_id = candidate_id;
            req.session.role = 'candidate';
            req.session.isLoggedIn = true;


            // บันทึก Session และตอบกลับ
            req.session.save((err) => {
                if (err) throw err;
                return res.status(200).json({
                    status: 'success',
                    redirect: 'candidate-dashboard.html',
                    msg: 'เข้าสู่ระบบสำเร็จ'
                });
            });
        } else {
            return res.status(401).json({ status: 'fail', msg: 'รหัสผ่านไม่ถูกต้อง' });
        }


    } catch (error) {
        // จัดการ Error ทั้งหมดในที่เดียว (DB Error, Verification Error)
        console.error("Login Error:", error);
        return res.status(500).json({ status: 'error', msg: 'Server Error หรือ DB Error' });
    }
});


// --- ส่วนของ Admin Login ---
app.post('/Admin/Login', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM admin WHERE username = ? AND password = ?";
    db.query(sql, [username, password], (err, results) => {
        if (err) return res.status(500).json({ status: 'error', msg: 'DB Error' });
        if (results.length > 0) {
            req.session.role = 'admin';
            req.session.isLoggedIn = true;
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
app.get('/Voter/candidates', (req, res) => {
    const sql = "SELECT can_id, name, policy FROM candidates";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).send('Server error');
        res.status(200).json(results);
    });
});

// 2. บันทึกโหวต 
app.post('/Voter/vote', (req, res) => {
    const { citizen_id, can_id } = req.body;

    if (!can_id || !citizen_id) {
        return res.status(401).send('Candidate ID and Citizen ID are required');
    }

    // 1) ตรวจ voter ทะเบียนอยู่, ยังไม่โหวต, active
    const checkVoterSql = "SELECT has_voted, is_active FROM voters WHERE citizen_id = ?";
    db.query(checkVoterSql, [citizen_id], (err, voterResult) => {
        if (err) return res.status(500).send('Server error');
        if (voterResult.length === 0) return res.status(404).send('Voter not found');
        const voter = voterResult[0];
        if (voter.is_active === 0) return res.status(403).send('บัญชีผู้ใช้ถูกปิดใช้งาน');
        if (voter.has_voted === 1) return res.status(402).send('ผู้ใช้ได้โหวตแล้ว');

        // 2) ตรวจ candidate active
        const checkCandidateSql = "SELECT is_active FROM candidates WHERE can_id = ?";
        db.query(checkCandidateSql, [can_id], (err, candidateResult) => {
            if (err) return res.status(500).send('Server error');
            if (candidateResult.length === 0) return res.status(404).send('Candidate not found');
            if (candidateResult[0].is_active === 0) return res.status(403).send('ผู้สมัครถูกปิดใช้งาน');

            // 3) เช็คระบบเปิดโหวต
            const checkSystemSql = "SELECT is_open FROM admin LIMIT 1";
            db.query(checkSystemSql, (err, adminResult) => {
                if (err) return res.status(500).send('Server error');
                if (adminResult.length === 0 || adminResult[0].is_open === 0) {
                    return res.status(403).send('ระบบปิดโหวตแล้ว (Voting is closed)');
                }

                // 4) บันทึกโหวต
                const insertVoteSql = "INSERT INTO votes (citizen_id, can_id) VALUES (?, ?)";
                db.query(insertVoteSql, [citizen_id, can_id], (err, result) => {
                    if (err) return res.status(400).send('Already voted or Server error');

                    const updateScoreSql = "UPDATE candidates SET vote_score = vote_score + 1 WHERE can_id = ?";
                    db.query(updateScoreSql, [can_id], (err, updateResult) => {
                        if (err) return res.status(500).send('Server error');

                        // Update voter has_voted
                        const updateVoterSql = "UPDATE voters SET has_voted = 1 WHERE citizen_id = ?";
                        db.query(updateVoterSql, [citizen_id], (err, updateVoterResult) => {
                            if (err) return res.status(500).send('Server error');
                            console.log(`✅ Vote saved! Citizen ${citizen_id} voted for ${can_id}`);
                            res.status(200).send('Vote submitted successfully');
                        });
                    });
                });
            });
        });
    });
});

// 3. ดูประวัติการโหวต
app.get('/Voter/history/:citizen_id', (req, res) => {
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
            res.status(200).json({ hasVoted: true, data: results });
        } else {
            res.status(200).json({ hasVoted: false, data: [] });
        }
    });
});

// ======================================== CANDIDATE ========================================
// ดึงข้อมูลโปรไฟล์ของผู้สมัคร
app.get('/candidate/profile', async (req, res) => {
    // ดึงค่าจาก session ก่อน ถ้าไม่มีให้ไปดูที่ query string (ที่ส่งมาจาก URL)
    const can_id = req.session.can_id || req.query.can_id;

    console.log("Current can_id used:", can_id); // จะโชว์ค่าแทน undefined

    if (!can_id) {
        return res.status(401).json({ message: 'User ID not found' });
    }

    try {
        const sql = "SELECT can_id, name, policy FROM candidates WHERE can_id = ?";
        const [results] = await db.query(sql, [can_id]);
        res.status(200).json(results[0] || {});
    } catch (err) {
        res.status(500).json({ error: 'DB Error', message: err.message });
    }
});

// บันทึกการแก้ไข name, personal_info, policy (ปุ่ม Save Changes)
app.put('/candidate/me', async (req, res) => {
    // รับค่าจาก body
    const { can_id, name, policy } = req.body;

    try {
        // เตรียมคำสั่ง SQL สำหรับการอัปเดตข้อมูล
        const sql = "UPDATE candidates SET name = ?, policy = ? WHERE can_id = ?";

        // รันคำสั่ง SQL ผ่าน Database Pool
        await db.query(sql, [name, policy, can_id]);

        // กรณีสำเร็จ (Case 200): ส่งข้อความแจ้งเตือนกลับไป
        res.status(200).json({
            message: 'Profile updated successfully'
        });

    } catch (err) {
        // กรณีเกิดข้อผิดพลาด (Case 500): เช่น Database หลุด หรือ SQL ผิดพลาด
        console.error('Update Error:', err);
        res.status(500).json({
            error: 'DB Error',
            message: err.message
        });
    }
});

app.get('/Candidate/me', (req, res) => {
    const can_id = req.query.can_id || req.body?.can_id;
    if (!can_id) {
        return res.status(401).json({ error: 'Bad Request', message: 'can_id is required (query or body)' });
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

// // บันทึกการแก้ไข name, personal_info, policy (ปุ่ม Save Changes)
// app.put('/Candidate/me', (req, res) => {
//     const can_id = req.query.can_id || req.body?.can_id;
//     const { name, personal_info, policy } = req.body || {};

//     if (!can_id) {
//         return res.status(401).json({ error: 'Bad Request', message: 'can_id is required (query or body)' });
//     }
//     if (!name && !personal_info && !policy) {
//         return res.status(400).json({ error: 'Validation Error', message: 'Please provide at least one field to update' });
//     }
//     if (name !== undefined && name.trim() === '') {
//         return res.status(400).json({ error: 'Validation Error', message: 'name must not be empty' });
//     }

//     const fields = [];
//     const values = [];

//     if (name !== undefined) {
//         fields.push('name = ?');
//         values.push(name.trim());
//     }
//     if (personal_info !== undefined) {
//         fields.push('personal_info = ?');
//         values.push(personal_info);
//     }
//     if (policy !== undefined) {
//         fields.push('policy = ?');
//         values.push(policy);
//     }

//     values.push(can_id);
//     const sql = `UPDATE candidates SET ${fields.join(', ')} WHERE can_id = ?`;

//     db.query(sql, values, (err) => {
//         if (err) {
//             return res.status(500).json({ error: 'Server error', message: err.message });
//         }

//         db.query('SELECT can_id, name, personal_info, policy FROM candidates WHERE can_id = ?', [can_id], (err2, rows) => {
//             if (err2) {
//                 return res.status(500).json({ error: 'Server error', message: err2.message });
//             }
//             return res.status(200).json({ success: true, message: 'Profile updated successfully', data: rows[0] });
//         });
//     });
// });

// ======================================== ADMIN ========================================

// GET /admin/voters - List all voters
app.get('/admin/voters', (req, res) => {
    const sql = "SELECT citizen_id, laser_id, name, has_voted, is_active FROM voters";
    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Server error', message: err.message });
        }
        return res.status(200).json({ success: true, data: results });
        // .sendFile(path.join(__dirname, "public/HTML/admin-voters.html"))
    });
});

// POST /admin/voters - Add new voter
app.post('/admin/voters', (req, res) => {
    const { citizen_id, laser_id, name, } = req.body;
    // if (!citizen_id || !laser_id || !name) {
    //     return res.status(401).json({ error: 'Bad Request', message: 'citizen_id, laser_id, name are required' });
    // }
    const insertSql = "INSERT INTO voters (citizen_id, laser_id, name, has_voted, is_active) VALUES (?, ?, ?, ?, ?)";
    db.query(insertSql, [citizen_id, laser_id, name, 0, 1], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Server error', message: err.message });
        }
        return res.status(200).json({ success: true, message: 'Voter added successfully' });
    });
});

// GET /admin/candidates - List all candidates
app.get('/admin/candidates', (req, res) => {
    const sql = "SELECT can_id, name, personal_info, policy, vote_score, is_active FROM candidates";
    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Server error', message: err.message });
        }
        return res.status(200).json({ success: true, data: results });
    });
});

// POST /admin/candidates - Add new candidate
app.post('/admin/candidates', (req, res) => {
    const sqlLast = "SELECT can_id FROM candidates ORDER BY can_id DESC LIMIT 1";
    db.query(sqlLast, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        let nextId = "C001";
        if (result.length > 0) {
            const lastId = result[0].can_id;
            const num = parseInt(lastId.substring(1)) + 1;
            nextId = "C" + num.toString().padStart(3, "0");
        }
        const insertSql = "INSERT INTO candidates (can_id) VALUES (?)";
        db.query(insertSql, [nextId], (err2) => {
            if (err2) {
                return res.status(500).json({ error: err2.message });
            }
            res.status(200).json({
                can_id: nextId
            });
        });
    });
});

// GET next candidate ID
app.get("/admin/candidates/next-id", (req, res) => {
    const sql = "SELECT can_id FROM candidates ORDER BY can_id DESC LIMIT 1";
    db.query(sql, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        let nextId = "C001";
        if (result.length > 0) {
            const lastId = result[0].can_id;
            const num = parseInt(lastId.substring(1)) + 1;
            nextId = "C" + num.toString().padStart(3, "0");
        }
        res.status(200).json({ can_id: nextId });
    });
});

// PUT /admin/candidates/:can_id - Enable/disable candidate
app.put('/admin/candidates/:can_id', (req, res) => {
    const can_id = req.params.can_id;
    const { is_active } = req.body;

    if (is_active === undefined) {
        return res.status(401).json({ error: 'Bad Request', message: 'is_active is required' });
    }

    const sql = "UPDATE candidates SET is_active = ? WHERE can_id = ?";
    db.query(sql, [is_active, can_id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Server error', message: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Not Found', message: 'Candidate not found' });
        }
        return res.status(200).json({ success: true, message: 'Candidate enabled/disabled successfully' });
    });
});

// PUT /admin/voters/:citizen_id - Enable/disable voter
app.put('/admin/voters/:citizen_id', (req, res) => {
    const citizen_id = req.params.citizen_id;
    const { is_active } = req.body;

    if (is_active === undefined) {
        return res.status(401).json({ error: 'Bad Request', message: 'is_active is required' });
    }

    const sql = "UPDATE voters SET is_active = ? WHERE citizen_id = ?";
    db.query(sql, [is_active, citizen_id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Server error', message: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Not Found', message: 'Voter not found' });
        }
        return res.status(200).json({ success: true, message: 'Voter enabled/disabled successfully' });
    });
});

// GET /admin/control - Get voting status
app.get('/admin/control', (req, res) => {
    const sql = "SELECT is_open FROM admin LIMIT 1";
    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Server error', message: err.message });
        }
        const is_open = results.length > 0 ? results[0].is_open : 0;
        return res.status(200).json({ success: true, is_open: is_open });
    });
});

// PUT /admin/control - Set voting status
app.put('/admin/control', (req, res) => {
    const { is_open } = req.body;
    if (is_open === undefined) {
        return res.status(401).json({ error: 'Bad Request', message: 'is_open is required' });
    }
    const sql = "UPDATE admin SET is_open = ?";
    db.query(sql, [is_open], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Server error', message: err.message });
        }
        return res.status(200).json({ success: true, message: 'Voting status updated successfully' });
    });
});

// ======================================== ROUTE ========================================

//candidates page
app.get("/pages/admin/candidates", (req, res) => {
    res.sendFile(path.join(__dirname, "public/HTML/admin-candidates.html"));
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