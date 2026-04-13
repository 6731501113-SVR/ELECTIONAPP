app.get('/password/:raw', async (req, res) => {
    try {
        const hash = await argon2.hash(req.params.raw);
        res.status(200).send(hash);
    } catch (err) {
        res.status(500).send('Error hashing password');
    }
});
