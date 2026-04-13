module.exports = function(app, db, argon2) {

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

};