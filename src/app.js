document.addEventListener("DOMContentLoaded", () => {
    const current = (location.pathname.split("/").pop() || "").toLowerCase();

    document.querySelectorAll(".navbtn").forEach(a => {
        if ((a.getAttribute("href") || "").toLowerCase() === current) {
            a.classList.add("active");
        }
    });

    document.querySelectorAll("[data-go]").forEach(el => {
        el.addEventListener("click", () => location.href = el.getAttribute("data-go"));
    });

    document.querySelectorAll("[data-back]").forEach(el => {
        el.addEventListener("click", () => history.back());
    });
});

const fadePopup = document.getElementById("fade-popup");

function achievementsPopupsEnabled(){
    return localStorage.getItem("showAchievementPopups") !== 'false';
} //default is on, off is user saves

function showFadePopup(message, popupType = "normal") { //normal type normal popup, achievement type displays confetti
    fadePopup.textContent = message;
    fadePopup.classList.remove("hidden");

    requestAnimationFrame(() => {
        fadePopup.classList.add("show");
    });

    if(popupType === "achievement" && achievementsPopupsEnabled()){
        launchConfetti();
    }

    setTimeout(() => {
        fadePopup.classList.remove("show");
        setTimeout(() => {
            fadePopup.classList.add("hidden");
        }, 400);
    }, 4000);
}

function launchConfetti(){
    confetti({
        particleCount: 60,
        spread: 60,
        origin: { x: 0.2, y: 0.6}
    });

    confetti({
        particleCount: 60,
        spread: 60,
        origin: { x: 0.8, y: 0.6}
    });
}


const API = "";
let currentId = null;

//  https://www.geeksforgeeks.org/javascript/how-to-use-the-javascript-fetch-api-to-get-data/

//load challenges from db to created level cards
async function loadList() { //loadlist function fetches challenge data and creates challenge select
    const userId = localStorage.getItem("userId");
    const res = await fetch(API + `/challenges?userId=${userId}`); //fetch challenges from backend
    const data = await res.json();                                 //convert JSON into JS

    const list = document.getElementById("challengeList");
    list.innerHTML = "";            //empty challenges list before rebuilding them

    // group stages by level
    const byLevel = new Map();
    for (const c of data.challenges) {       //c - challenges
        const level = Number(c.level_num);
        if (!byLevel.has(level)) byLevel.set(level, []);    //if level dosnt exist yet, empty array, then add challenge
        byLevel.get(level).push(c);
    }

    //5 seperate boxes
    const levelStruc = {     //styling
        1: { title: "Office Basics", desc: "Learn SELECT, WHERE and ORDER BY.", img: "assets/challenges/office.png" },
        2: { title: "Music Analytics", desc: "Use streaming data queries to try ordering amd multi-select.", img: "assets/challenges/music.png" },
        3: { title: "Space Force", desc: "Assist in running a smooth space operation using functions and JOINS.", img: "assets/challenges/SpaceForce.png" },
        4: { title: "Museum Heist", desc: "Help to identify and catch high value museum thieves.", img: "assets/challenges/museum.png" },
        5: { title: "Database Normalisation Challenge", desc: "Help normalise this table.", img: "assets/challenges/normalisation.png" },
        6: { title: "Challenge Coming Soon", desc: "New Scenario In the Works", img: "assets/challenges/comingSoon.png"}
    };

    for (let level = 1; level <= 6; level++) {
        const stages = (byLevel.get(level) || []) //ensures 6 boxes and if level exists - get stages, else empty array
            .slice()
            .sort((stageA, stageB) => (Number(stageA.stage_num) || 0) - (Number(stageB.stage_num) || 0)); //order

        const card = document.createElement("div");
        card.className = "level-card";

        const levelInfo = levelStruc[level] || { title: "", desc: "", img: "" };

        // image
        const img = document.createElement("img");
        img.className = "level-img";
        img.alt = `Level ${level}`;
        img.src = levelInfo.img || "../assets/placeholder.png";
        card.appendChild(img);

        // header text
        const header = document.createElement("div");
        header.className = "level-header";
        header.innerHTML = `
      <div class="level-kicker">LEVEL ${level}</div>
      <div class="level-title">${levelInfo.title || "Level"}</div>
      <div class="level-desc">${levelInfo.desc || ""}</div>
    `;
        card.appendChild(header);

        // stages area
        const stageWrap = document.createElement("div");
        stageWrap.className = "level-stages";  //text in level box

        stages.forEach(stage => {
            const btn = document.createElement("button");
            btn.className = "btn level-stage-btn";
            btn.type = "button";
            btn.textContent = stage.title;

            if(stage.completed){
                btn.classList.add("completed-stage")
            }
            btn.onclick = () => selectChallenge(stage.id);
            stageWrap.appendChild(btn);     //make button labelled with stage title, on press load that stage
        });

        card.appendChild(stageWrap);
        list.appendChild(card);
    }
}

function displayQueryResults(rows, columns){
    const area = document.getElementById("queryResultsArea");
    const results = document.getElementById("queryResults"); //get results and results section from page

    results.innerHTML = ""; //clear previous query results

    if(!rows || rows.length === 0){ //if query returns no rows
        const msg = document.createElement("div");
        msg.textContent = "No rows returned"; //simple message
        results.appendChild(msg); //add message to results
        area.hidden = false; //show results

        return;
    }

    const table = document.createElement("table");
    table.className = "queryResultsTable"; //create table element to display results

    const headerRow = document.createElement("tr")
    //create header row / column names

    //loop through column names returned from backend
    columns.forEach(col => {
        const tableHeader = document.createElement("th"); //create table header
        tableHeader.textContent = col; //set column name as the header
        headerRow.appendChild(tableHeader); //add header text to header row
    });

    table.appendChild(headerRow);
    rows.forEach(row => { //create table row for each result row
        const tableRow = document.createElement("tr") //new row
        columns.forEach(col => {
            const tableCell = document.createElement("td");

            //insert value from query result, ?? "" prevents undefined values
            tableCell.textContent = row[col] ?? "";
            tableRow.appendChild(tableCell); //add cell to row
        });
        table.appendChild(tableRow);
    })
    results.appendChild(table); //add completed table to results
    area.hidden = false;
}

async function selectChallenge(id) {
    currentId = id;
    document.getElementById("sqlInput").value = ""; //empty input on each challenge select
    document.getElementById("message").textContent = "";
    const results = document.getElementById("queryResults");
    if (results) results.innerHTML = "";
    const area = document.getElementById("queryResultsArea");
    if (area) area.hidden = true; //hide all old feedback and results on new challenge select

    const res = await fetch(`${API}/challenges/${id}`);
    const data = await res.json();
    document.getElementById("challengeTitle").textContent = data.challenge.title;
    document.getElementById("challengePrompt").textContent = data.challenge.prompt;
    document.getElementById("schemaInfo").textContent = data.challenge.schema_info || "";
    document.getElementById("message").textContent = "";

    const hintBox = document.getElementById("hintBox");
    if(hintBox) {
        const showHints = localStorage.getItem("showHints") !== "false"; //default on
        if (showHints && data.challenge.hint) {
            hintBox.textContent = "HINT:\n" + data.challenge.hint;
            hintBox.classList.remove("hidden");
        } else {
            hintBox.textContent = "";
            hintBox.classList.add("hidden");
        }
    }

    window.scrollBy({ top: 1400, behavior: "smooth"});
    //scroll to challenge area on level select

}

const submitBtn = document.getElementById("submitBtn");
if (submitBtn){
    submitBtn.addEventListener("click", async () => {
    if (!currentId) return;

    const sql = document.getElementById("sqlInput").value;
    const userId = Number(localStorage.getItem("userId"))
    const res = await fetch(`${API}/challenges/${currentId}/submit`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ sql, userId})
    });
    const data = await res.json();
    document.getElementById("message").textContent = data.message || data.error || "";
    displayQueryResults(data.results, data.columns);

        if (data.newlyEarned && data.newlyEarned.length) {
            if (localStorage.getItem("showAchievementPopups") === "false") return;

            data.newlyEarned.forEach(a => {
                showFadePopup("\u{1F3C6}" + a.name + "\n" + a.description, "achievement");
            });
        }
   });
}

async function loadProgressPage() {
    // Only run on progress page (these elements only exist there)
    const xpEl = document.getElementById("xpValue");
    if (!xpEl) return;

    const userId = Number(localStorage.getItem("userId"));
    if (!Number.isInteger(userId)) return;

    const res = await fetch(`${API}/users/${userId}/progress`);
    const data = await res.json();

    document.getElementById("xpValue").textContent = data.xp;
    document.getElementById("attemptsValue").textContent = data.attempts;
    document.getElementById("completedValue").textContent = data.completedChallenges;
    document.getElementById("totalValue").textContent = data.totalChallenges;

    // Progress bar fill
    const fill = document.getElementById("progressFill");
    if (fill && data.totalChallenges > 0) {
        const percent = (data.completedChallenges / data.totalChallenges) * 100;
        fill.style.width = percent + "%";
    } else if (fill) {
        fill.style.width = "0%";
    }

    const boxes = document.querySelectorAll(".achievement-box");
    if (boxes.length && Array.isArray(data.achievements)) {

        // Map achievement image path
        const iconMap = {
            complete_1:  "assets/achievements/first_steps.png",
            complete_3:  "assets/achievements/warming_up.png",
            complete_5:  "assets/achievements/making_progress.png",
            complete_10: "assets/achievements/on_a_roll.png",
            attempt_5:   "assets/achievements/hitting_the_mark.png",
            attempt_20:  "assets/achievements/persistant.png",
            xp_10:       "assets/achievements/star_student.png",
            xp_50:       "assets/achievements/sql_pro.png",
            xp_100:      "assets/achievements/sql_master.png",
            xp_200:      "assets/achievements/sql_solver.png",
        };

        boxes.forEach((box, i) => {
            const a = data.achievements[i];
            if (!a) return;

            box.innerHTML = "";
            box.classList.toggle("earned", !!a.earned);

            const img = document.createElement("img");
            img.className = "ach-img";
            img.alt = a.name;
            img.src = iconMap[a.code] || "assets/achievements/placeholder.png";

            const tip = document.createElement("div");
            tip.className = "achievement-tooltip";
            tip.innerHTML = `
      <div class="t-title">${a.name}</div>
      <div class="t-desc">${a.description}</div>
    `;

            box.appendChild(img);
            box.appendChild(tip);
        });
    }
}

if (document.getElementById("challengeList")){
    loadList();
}

loadProgressPage();

// SETTINGS: reset + delete account
document.addEventListener("DOMContentLoaded", () => {
    const resetBtn = document.getElementById("resetBtn");
    const deleteBtn = document.getElementById("deleteBtn");
    const achievementToggle = document.getElementById("achievementToggle");
    const hintToggle = document.getElementById("hintToggle");
    const profileUsername = document.getElementById("profileUsername");
    const profileCreated = document.getElementById("profileCreated");


    if (profileUsername && profileCreated) {
        const userId = Number(localStorage.getItem("userId"));

        if (Number.isInteger(userId)) {
            fetch(`${API}/users/${userId}`)
                .then(res => res.json())
                .then(data => {
                    profileUsername.textContent = data.username;

                    const date = new Date(data.created_at);
                    profileCreated.textContent = date.toLocaleDateString("en-GB", { //https://www.w3schools.com/jsref/jsref_tolocaledatestring.asp
                        day: "numeric",
                        month: "long",
                        year: "numeric"
                    });

                })
                .catch(() => {
                    profileUsername.textContent = "Unknown";
                    profileCreated.textContent = "Unknown";
                });
        }
    }

    // Only runs on settings page (buttons exist only there)
    if (resetBtn) {
        resetBtn.addEventListener("click", async () => {
            const userId = Number(localStorage.getItem("userId"));
            if (!Number.isInteger(userId)) return alert("Not logged in.");

            const ok = confirm("Reset ALL progress? This cannot be undone.");
            if (!ok) return;

            const res = await fetch(`${API}/users/${userId}/reset`, { method: "POST" });
            const data = await res.json();

            if (!res.ok) return alert(data.error || "Reset failed");
            alert("Progress reset!");
            location.href = "progress.html";
        });
    }

    if (deleteBtn) {
        deleteBtn.addEventListener("click", async () => {
            const userId = Number(localStorage.getItem("userId"));
            if (!Number.isInteger(userId)) return alert("Not logged in.");

            const ok = confirm("DELETE your account permanently? This cannot be undone.");
            if (!ok) return;

            const res = await fetch(`${API}/users/${userId}`, { method: "DELETE" });
            const data = await res.json();

            if (!res.ok) return alert(data.error || "Delete failed");

            // log out locally
            localStorage.removeItem("userId");
            alert("Account deleted.");
            location.href = "index.html";
        });
    }

    if (achievementToggle) {
        // Load saved setting (default ON)
        const saved = localStorage.getItem("showAchievementPopups");
        const enabled = (saved !== "false");

        achievementToggle.dataset.checked = enabled ? "true" : "false";

        achievementToggle.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const currentlyChecked = achievementToggle.dataset.checked === "true";
            const newEnabled = !currentlyChecked;

            achievementToggle.dataset.checked = newEnabled ? "true" : "false";
            localStorage.setItem("showAchievementPopups", newEnabled ? "true" : "false");
        });
    }

    if (hintToggle) {
        const saved = localStorage.getItem("showHints");
        const enabled = (saved !== "false");

        hintToggle.dataset.checked = enabled ? "true" : "false";

        hintToggle.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const currentlyChecked = hintToggle.dataset.checked === "true";
            const newEnabled = !currentlyChecked;

            hintToggle.dataset.checked = newEnabled ? "true" : "false";
            localStorage.setItem("showHints", newEnabled ? "true" : "false");
        });
    }



});

async function logout(){
    const confirmLogout = confirm("Are you sure you want to log out?");
    if(!confirmLogout) return;
    await fetch("/logout", {method: "POST"}); //calls method which clears session
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    localStorage.removeItem("isAdmin");
    window.location.href = "index.html";
}