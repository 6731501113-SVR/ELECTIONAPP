module.exports = function(app, db, argon2) {

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

};
