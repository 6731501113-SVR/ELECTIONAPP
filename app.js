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
app.use('/img', express.static(path.join(__dirname, 'public', 'img')));

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

// ======================================== IMPORT ROUTE MODULES ========================================
const setupAuthentication = require('./app-authentication.js');
const setupAdmin = require('./app-admin.js');
const setupCandidate = require('./app-candidate.js');
const setupVoter = require('./app-voter.js');

// Initialize all route modules
setupAuthentication(app, db, argon2);
setupAdmin(app, db, argon2);
setupCandidate(app, db, argon2);
setupVoter(app, db, argon2);

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

// start server at the specified port, if there is error, try another port number
const port = 3000;
app.listen(port, function () {
    console.log("Server is ready at " + port);
});