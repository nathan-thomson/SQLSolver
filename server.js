import "dotenv/config";
import express from "express"; //allows node.js to be used easier with backend server
import cors from "cors";       //allows for cross-origin requests, backend on 3000, frontend on 5137
import bcrypt from "bcrypt";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const app = express();                          //https://www.w3schools.com/nodejs/nodejs_path.asp, https://www.w3schools.com/nodejs/nodejs_url.asp
const _filename = fileURLToPath(import.meta.url); //https://nodejs.org/api/url.html#urlfileurltopathurl, https://nodejs.org/api/esm.html#importmetaurl
const _dirname = path.dirname(_filename);
app.use(express.json());
app.use(cors()); // dev only
app.use(express.static(path.join(_dirname, "src")));
app.use("/assets", express.static(path.join(_dirname, "assets")));

app.get("/", (req, res) => {
    res.sendFile(path.join(_dirname, "src", "index.html"));
})

//https://www.w3schools.com/nodejs/nodejs_express.asp
//https://devweb2025.cis.strath.ac.uk/nfb22130-nodejs/
//ssh -L 5433:devweb2025.cis.strath.ac.uk:5432 nfb22130@cafe.cis.strath.ac.uk use this for local tunneling tests
//ssh nfb22130@cafe.cis.strath.ac.uk
//https://winscp.net/eng/docs/after_installation?ver=6.5.6&lang=en&utm_source=winscp&utm_medium=setup&utm_campaign=6.5.6&prevver=6.5.5&automatic=0
//https://vispero.com/lp/color-contrast-checker/
//https://randomwordgenerator.com/name.php

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

pool.on("connect", (client) => {
    client.query("SET search_path TO nfb22130"); //allow for direct SQL instead of nfb22130....
});

// Simple password rule: 8+ chars
function passwordOk(pw) {
    return typeof pw === "string" && pw.length >= 8 && pw.length <= 72;
}

// REGISTER
app.post("/register", async (req, res) => {
    const username = (req.body.username || "").trim();
    const password = req.body.password;

    if (!username) return res.status(400).json({ error: "Username required" });
    if (!passwordOk(password)) return res.status(400).json({ error: "Password must be 8+ chars" });

    try {
        // check username not taken
        const existing = await pool.query(
            "SELECT id FROM users WHERE username = $1",
            [username]
        );
        if (existing.rowCount > 0) return res.status(409).json({ error: "Username taken" });

        // hash password and store
        const password_hash = await bcrypt.hash(password, 10);
        //https://www.geeksforgeeks.org/node-js/npm-bcrypt/
        const inserted = await pool.query(
            `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username`,
            [username, password_hash]
        );

        res.status(201).json({ user: inserted.rows[0] });
    } catch (e) {
        console.error("Register Error: ", e.message);
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// LOGIN
app.post("/login", async (req, res) => {
    const username = (req.body.username || "").trim();
    const password = req.body.password;

    if (!username || typeof password !== "string") {
        return res.status(400).json({ error: "Username and password required" });
    }

    if(username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD){
        return res.json({admin: true}); //if admin credentials match store admin true
    }
    try {
        const result = await pool.query(
            "SELECT id, username, password_hash FROM users WHERE username = $1",
            [username]
        );

        if (result.rowCount === 0) return res.status(401).json({ error: "Invalid credentials" });

        const user = result.rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);

        if (!ok) return res.status(401).json({ error: "Invalid credentials" });

        // success (no sessions/JWT yet)
        res.json({ user: { id: user.id, username: user.username } });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});




//  CHALLENGES DATA , ALSO USED TO DISPLAY INDICATOR OF COMPLETED CHALLENGE
//IF CHALLENGE COMPLETED ADD TRUE MARKER
app.get("/challenges", async (req, res) => {
    try {                  //loads all levels, to become available on menu
        const userId = req.query.userId;
        const q = await pool.query(
            `
            SELECT c.id, c.title, c.level_num, c.stage_num,
                CASE
                    WHEN ucc.challenge_id IS NOT NULL THEN TRUE 
                    ELSE FALSE
                END AS completed
            FROM challenges c
            LEFT JOIN user_completed_challenges ucc 
                ON c.id = ucc.challenge_id
                AND ucc.user_id = $1
            WHERE c.is_active = TRUE
            ORDER BY c.level_num, c.stage_num, c.id
            `,
            [userId]
        ); //left join allows all ucc table data to stay present, normal join would only display when completed is true

        res.json({ challenges: q.rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});

//CHALLENGE DETAILS WHEN SELECTED
app.get("/challenges/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
         //loads level specifics when selected
    try {
        const q = await pool.query(
            "SELECT id, title, prompt, schema_info, hint FROM challenges WHERE id = $1 AND is_active = TRUE",
            [id]
        );
        if (q.rowCount === 0) return res.status(404).json({ error: "Not found" });
        res.json({ challenge: q.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});

//PULLS EXPECTED FROM DB, COMPARES AGAINST INPUT
app.post("/challenges/:id/submit", async (req, res) => {
    const id = Number(req.params.id);
    const { sql, userId } = req.body;

    if (!Number.isInteger(userId)) {
        return res.status(400).json({ error: "Missing userId"});
    }

    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
    //if (!isSafeSelectOnly(sql)) return res.status(400).json({ error: "Only single SELECT queries allowed." });

    try {
        // load expected sql from DB
        const challengeResult = await pool.query(
            "SELECT expected_sql, challenge_type, stage_num, requires_order FROM challenges WHERE id = $1 AND is_active = TRUE",
            [id]
        );
        if (challengeResult.rowCount === 0) return res.status(404).json({ error: "Challenge not found" });

        //const expectedSql = q.rows[0].expected_sql;
        const challenge = challengeResult.rows[0];
        let ok = false;
        let message = "";
        let userRows = null;
        let resultColumns = []; //user rows is query results and column names for easier formatting

        if(challenge.challenge_type === "normalisation") {
            ok = checkNormalisationAnswer(sql, challenge.expected_sql, challenge.stage_num);
            message = ok ? "Correct!" : "Incorrect, Try again!";
        }else{
                if (!isSafeSelectOnly(sql)){
                    return res.status(400).json({ error: "Only single SELECT queries allowed"});
                }
                //let userRows;
                try{
                    const userResult = await pool.query(sql);
                    userRows = userResult.rows;

                    if (userRows.length > 0) { //blocks potential error on 0 rows return
                        resultColumns = Object.keys(userRows[0]);
                    } //blocks error on 0 row return
                } catch (e){
                    return res.json({
                        ok: false,
                        message: "SQL error: " + e.message,
                        results: [],
                        columns: []
                    });
                }

                const expectedRows = (await pool.query(challenge.expected_sql)).rows;

                const a = normaliseRows(userRows, !challenge.requires_order); //a = normalisedUserRows if challenge dosnt need ORDER BY
                const b = normaliseRows(expectedRows, !challenge.requires_order); //b = normalisedExpectedRows

                ok = a.length === b.length && a.every((v, i) => v === b[i]);
                message = ok ? "Correct! Well Done!" : `Incorrect, your query did not match the expected output. You returned ${userRows.length} rows. expected ${expectedRows.length}.`;
            }

        //run user query
        //run expected query
        await pool.query(
            `INSERT INTO user_stats (user_id, xp, attempts) 
             VALUES ($1, 0, 1)
             ON CONFLICT (user_id)
             DO UPDATE SET attempts = user_stats.attempts + 1`,
             [userId]
        );

        //user attemps solution, increment attempt count, if solution correct:
        //record completed and award XP if FIRST completion
        //XP stored once per challenge, attempts still incremented


        //marks challenge as complete
        if (ok) {

            const inserted = await pool.query(
                `INSERT INTO user_completed_challenges (user_id, challenge_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING user_id`,
                [userId, id]
            );

            // only award XP first time
            if (inserted.rowCount > 0) {
                const xpAward = 10;

                await pool.query(
                    `UPDATE user_stats
             SET xp = xp + $1
             WHERE user_id = $2`,
                    [xpAward, userId]
                );
            }
        }

        const newlyEarned = await awardAchievements(userId);

        res.json({
            ok,
            newlyEarned,
            message,
            results: userRows,
            columns: resultColumns
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});


//Endpoint for progress
//returns: No of active challenges, No of challenges completed by user
//Total XP achieved, No of challenge attempts
//seperates progress from challenge logic (modular)

app.get("/users/:userId/progress", async (req, res) => {

    const userId = Number(req.params.userId);

    if (!Number.isInteger(userId)) {
        return res.status(400).json({ error: "Bad userId" });
    }

    const totalChallenges = await pool.query(
        "SELECT COUNT(*)::int AS total FROM challenges WHERE is_active = TRUE"
    ); //count No of challenges that exist ::int ensures integer instead of ("10")

    const completed = await pool.query(
        "SELECT COUNT(*)::int AS done FROM user_completed_challenges WHERE user_id = $1",
        [userId]
    ); //count No of rows of completed challenge, see how many are done

    const stats = await pool.query(
        "SELECT xp, attempts FROM user_stats WHERE user_id = $1",
        [userId]
    ); //get users XP and total attempts

    const xp = stats.rowCount ? stats.rows[0].xp : 0;
    const attempts = stats.rowCount ? stats.rows[0].attempts : 0;
    //if stats.rowCount true(>0) use stats.rows[0] else 0

    await awardAchievements(userId);
    const ach = await pool.query(
        `SELECT
     a.id, a.code, a.name, a.description, a.sort_order,
     (ua.user_id IS NOT NULL) AS earned,
     ua.earned_at
   FROM achievements a
   LEFT JOIN user_achievements ua
     ON ua.achievement_id = a.id AND ua.user_id = $1  
   ORDER BY a.sort_order`,
        [userId]
    ); //a = achievements, ua = user_achievements

    res.json({
        totalChallenges: totalChallenges.rows[0].total,
        completedChallenges: completed.rows[0].done,
        xp,
        attempts,
        achievements: ach.rows
    });
});

//create endpoint for retrieving username and date for profile page
app.get("/users/:userId", async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: "Bad userId" });

    try {
        const q = await pool.query(
            "SELECT id, username, created_at FROM users WHERE id = $1",
            [userId]
        );

        if (q.rowCount === 0) return res.status(404).json({ error: "User not found" });

        res.json(q.rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});


//ENSURES ONLY SELECT AVAILABLE
function isSafeSelectOnly(sql){
    if (typeof sql !== "string") return false;
    const s = sql.trim().toLowerCase();
    if (!s.startsWith("select")) return false; //avoids delete/drop etc
    if (s.includes(";")) return false; //one statement only
    const banned = ["insert", "update", "delete", "drop", "alter", "create", "truncate", "grant", "revoke",]
    if (banned.some(k => s.includes(k))) return false; //check if string contains one or more of banned words
    return true;
}

//function normaliseRows(rows){
//    return rows.map(r => JSON.stringify(r)).sort(); //ignore row order, take each row, change to string, sort
//}
//https://www.w3schools.com/jsref/jsref_object_keys.asp
//https://www.w3schools.com/jsref/jsref_map.asp
//
function normaliseRows(rows, sortRows = true){
    const normalised = rows.map(row => {
        const columnNames = Object.keys(row).sort();
        const normalisedRow = {};

        columnNames.forEach(col => normalisedRow[col] = row[col]); //ignore column order, make key pairs and compare, optionally sorts rows when challenge dosnt need

        return JSON.stringify(normalisedRow);
    });
    return sortRows ? normalised.sort() : normalised; //sortRow = true then sorted alphabetically
}

//CHECKS NORMALISATION QUESTION ANSWERS
function checkNormalisationAnswer(userInput, expectedSql, stageNum) {
    if (typeof userInput !== "string") return false;
    if (typeof expectedSql !== "string") return false;  //ensure string input, else end to avoid crash

    const stage = Number(stageNum); //convert stage number to number, ensures no '2' string

    const answer = userInput
        .toLowerCase()
        .replace(/\s+/g, "") //remove spaces and line breaks
        .replace(/[^a-z0-9_(),|]/g, ""); //removes unneeded characters

    //https://www.geeksforgeeks.org/javascript/string-strip-in-javascript/

    // Stage 1 and 2: keyword checking
    if (stage === 1 || stage === 2) {
        const keywords = expectedSql
            .toLowerCase()
            .split(",") //splits, creates array
            .map(k => k.trim().replace(/\s+/g, "")) //run through each element of array, trim space
            .filter(Boolean);

        return keywords.every(keyword => answer.includes(keyword)); //every keyword must appear somewhere in answer
    }

    // Stage 3: stricter pattern checking
    if (stage === 3) {
        const patterns = expectedSql
            .toLowerCase()
            .split("|")
            .map(p => p.trim().replace(/\s+/g, ""))
            .filter(Boolean);

        return patterns.every(pattern => answer.includes(pattern)); //answer must contain all patterns from expected sql
    }

    return false;
}


//get current users totals (xp/attemps/challenges completed)
async function getUserTotals(userId) {
    const completedQ = await pool.query(
        "SELECT COUNT(*)::int AS done FROM user_completed_challenges WHERE user_id = $1",
        [userId]
    );

    const statsQ = await pool.query(
        "SELECT xp, attempts FROM user_stats WHERE user_id = $1",
        [userId]
    );

    const completed = completedQ.rows[0].done;
    const xp = statsQ.rowCount ? statsQ.rows[0].xp : 0;
    const attempts = statsQ.rowCount ? statsQ.rows[0].attempts : 0;

    return { completed, xp, attempts };
}

//award any newly earned achievements
async function awardAchievements(userId) {
    const totals = await getUserTotals(userId);

    // get achievements the user qualifies for
    const eligible = await pool.query(
        `SELECT id, code, name, description
     FROM achievements
     WHERE (metric = 'completed' AND $1 >= threshold)
        OR (metric = 'attempts'  AND $2 >= threshold)
        OR (metric = 'xp'        AND $3 >= threshold)`,
        [totals.completed, totals.attempts, totals.xp]
    );

    const newlyEarned = [];

    // insert them; duplicates ignored by PK (user_id, achievement_id)
    for (const row of eligible.rows) {
        const result = await pool.query(
            `INSERT INTO user_achievements (user_id, achievement_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
            [userId, row.id]
        );

        if (result.rowCount > 0){
            newlyEarned.push(row) //only push if newly earned
        }
    }
    return newlyEarned;
}

// RESET progress (keeps the user account)
app.post("/users/:userId/reset", async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: "Bad userId" });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // wipe progress tables
        await client.query("DELETE FROM user_completed_challenges WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM user_achievements WHERE user_id = $1", [userId]);

        // reset stats
        await client.query(
            `INSERT INTO user_stats (user_id, xp, attempts)
       VALUES ($1, 0, 0)
       ON CONFLICT (user_id) DO UPDATE SET xp = 0, attempts = 0`,
            [userId]
        );

        await client.query("COMMIT");
        res.json({ ok: true });
    } catch (e) {
        await client.query("ROLLBACK");
        console.error(e);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});

// DELETE account
app.delete("/users/:userId", async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: "Bad userId" });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // delete child rows first (unless you have ON DELETE CASCADE)
        await client.query("DELETE FROM user_completed_challenges WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM user_achievements WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM user_stats WHERE user_id = $1", [userId]);

        // then the user
        await client.query("DELETE FROM users WHERE id = $1", [userId]);

        await client.query("COMMIT");
        res.json({ ok: true });
    } catch (e) {
        await client.query("ROLLBACK");
        console.error(e);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});



//ADMIN PAGE

app.get("/admin/stats", async (req, res) => {
    const users = await pool.query("SELECT COUNT(*) FROM users");
    const attempts = await pool.query("SELECT SUM(attempts) FROM user_stats");
    const completions = await pool.query("SELECT COUNT(*) FROM user_completed_challenges");

    res.json({
        totalUsers: users.rows[0].count,
        totalAttempts: attempts.rows[0].sum,
        totalCompletions: completions.rows[0].count
    });
});

//pull user details to display in admin page table
app.get("/admin/users", async (req, res) => {
    try{
        const result = await pool.query(`
        SELECT id, username, created_at
        FROM users
        ORDER BY created_at DESC
        `);
        res.json({users: result.rows })
    } catch(e){
        console.error(e);
        res.status(500).json({error: "Server error"});
    }
});


//LEADERBOARD

app.get("/leaderboard", async (req, res) => {
    try{
        const result = await pool.query(`
        SELECT u.username, s.xp 
        FROM user_stats s
        JOIN users u ON u.id = s.user_id
        ORDER BY s.xp DESC, u.username ASC
        LIMIT 10
        `);
        res.json({leaderboard: result.rows});
    } catch(e){
        console.error(e);
        res.status(500).json({error: "Server error"});
    }
});

app.listen(3000, "0.0.0.0",  () => console.log("Backend running on port 3000"));