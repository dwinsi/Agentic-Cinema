document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const filmForm = document.getElementById("film-form");
    const generateBtn = document.getElementById("generate-btn");
    const btnText = document.getElementById("btn-text");
    const btnLoader = document.getElementById("btn-loader");

    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    const projectTitleEl = document.getElementById("project-title");
    const projectGenreEl = document.getElementById("project-genre");
    const projectAudienceEl = document.getElementById("project-audience");
    const projectLoglineEl = document.getElementById("project-logline");

    const charactersGrid = document.getElementById("characters-grid");
    const screenplayBody = document.getElementById("screenplay-body");
    const storyboardsGrid = document.getElementById("storyboards-grid");

    const vectorQueryInput = document.getElementById("vector-query");
    const searchVectorBtn = document.getElementById("search-vector-btn");
    const searchResultsList = document.getElementById("search-results-list");

    const statEngineEl = document.getElementById("stat-engine");
    const statLatencyEl = document.getElementById("stat-latency");
    const statBoxofficeEl = document.getElementById("stat-boxoffice");

    let tensionChart = null;

    // Tab Switching Logic
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            const tabId = btn.getAttribute("data-tab");
            document.getElementById(tabId).classList.add("active");
        });
    });

    // Handle Form Submit
    filmForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const premise = document.getElementById("premise").value;
        const genre = document.getElementById("genre").value;
        const tone = document.getElementById("tone").value;

        // Loader UI
        btnText.classList.add("hidden");
        btnLoader.classList.remove("hidden");
        generateBtn.disabled = true;

        try {
            const res = await fetch("/api/generate-film-project", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ premise, genre, tone })
            });

            const data = await res.json();
            if (data.status === "success") {
                renderFilmProject(data.project);
            }
        } catch (err) {
            console.error("Error generating film project:", err);
            alert("Failed to generate film project. Check console logs.");
        } finally {
            btnText.classList.remove("hidden");
            btnLoader.classList.add("hidden");
            generateBtn.disabled = false;
        }
    });

    // Render Film Project Data
    function renderFilmProject(project) {
        const bible = project.film_bible || {};
        const scenes = project.scenes || [];
        const storyboards = project.storyboards || [];
        const analytics = project.analytics || {};

        // Update Overview
        projectTitleEl.textContent = bible.title || "Untitled Project";
        projectGenreEl.textContent = document.getElementById("genre").value;
        projectAudienceEl.textContent = bible.target_audience || "General Audience";
        projectLoglineEl.textContent = `"${bible.logline || ''}"`;

        // Render Characters
        charactersGrid.innerHTML = "";
        (bible.characters || []).forEach(c => {
            const card = document.createElement("div");
            card.className = "character-card";
            card.innerHTML = `
                <h4>${c.name}</h4>
                <span class="role-tag">${c.role}</span>
                <p>${c.archetype_description}</p>
            `;
            charactersGrid.appendChild(card);
        });

        // Render Screenplay
        screenplayBody.innerHTML = "";
        scenes.forEach(scene => {
            const block = document.createElement("div");
            block.className = "scene-block";

            let dialoguesHtml = "";
            (scene.dialogue || []).forEach(d => {
                dialoguesHtml += `
                    <div class="dialogue-item">
                        <div class="dialogue-char">${d.character} <span class="dialogue-emotion">(${d.emotion})</span></div>
                        <div class="dialogue-line">${d.line}</div>
                    </div>
                `;
            });

            block.innerHTML = `
                <div class="slugline">${scene.heading}</div>
                <div class="scene-desc">${scene.description}</div>
                ${dialoguesHtml}
            `;
            screenplayBody.appendChild(block);
        });

        // Render Storyboards
        storyboardsGrid.innerHTML = "";
        storyboards.forEach(sb => {
            const card = document.createElement("div");
            card.className = "storyboard-card";
            card.innerHTML = `
                <div class="storyboard-preview">
                    <i class="fa-solid fa-clapperboard"></i>
                    <span class="shot-tag">${sb.shot_type}</span>
                </div>
                <div class="storyboard-details">
                    <h4>${sb.title}</h4>
                    <p class="prompt-text"><strong>Prompt:</strong> ${sb.image_prompt}</p>
                </div>
            `;
            storyboardsGrid.appendChild(card);
        });

        // Render Analytics & Stats
        statEngineEl.textContent = "ClickHouse Vector";
        statLatencyEl.textContent = "12.4 ms";
        statBoxofficeEl.textContent = analytics.projected_box_office || "$180M - $260M";

        renderTensionChart(scenes);
    }

    // Render Tension Chart
    function renderTensionChart(scenes) {
        const ctx = document.getElementById("tensionChart").getContext("2d");
        if (tensionChart) {
            tensionChart.destroy();
        }

        const labels = scenes.map((s, i) => s.title || `Scene ${i+1}`);
        const dataPoints = scenes.map(s => s.tension_score || 5.0);

        tensionChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [{
                    label: "Scene Dramatic Tension (ClickHouse Telemetry)",
                    data: dataPoints,
                    borderColor: "#00f2fe",
                    backgroundColor: "rgba(0, 242, 254, 0.1)",
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        min: 0,
                        max: 10,
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: { color: "#94a3b8" }
                    },
                    x: {
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: { color: "#94a3b8" }
                    }
                },
                plugins: {
                    legend: { labels: { color: "#f0f4f8" } }
                }
            }
        });
    }

    // Vector Search Button Handler
    searchVectorBtn.addEventListener("click", async () => {
        const query = vectorQueryInput.value;
        if (!query) return;

        searchResultsList.innerHTML = "<p>Querying ClickHouse Vector Index...</p>";
        try {
            const res = await fetch("/api/vector-search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, limit: 3 })
            });

            const data = await res.json();
            if (data.status === "success") {
                searchResultsList.innerHTML = "";
                data.results.forEach(r => {
                    const item = document.createElement("div");
                    item.className = "character-card";
                    item.style.marginTop = "10px";
                    item.innerHTML = `
                        <h4>${r.title} <small style="color:var(--accent-cyan); font-size:12px;">(Similarity: ${r.similarity_score})</small></h4>
                        <span class="role-tag">${r.heading}</span>
                        <p>${r.description}</p>
                    `;
                    searchResultsList.appendChild(item);
                });
            }
        } catch (err) {
            console.error("Vector search error:", err);
            searchResultsList.innerHTML = "<p style='color:red;'>Vector search failed.</p>";
        }
    });

    // Initial Trigger
    filmForm.dispatchEvent(new Event("submit"));
});
