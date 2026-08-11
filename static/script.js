document.addEventListener("DOMContentLoaded", () => {

    // ── State ──
    let currentProject = null;
    let tensionChart = null;
    const AGENT_IDS = [
        'agent-producer', 'agent-writer', 'agent-storyboard',
        'agent-production', 'agent-audio', 'agent-clickhouse'
    ];

    // ── DOM References ──
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

    // ── Agent Status Helpers ──
    function setAgentStatus(agentId, status) {
        const item = document.getElementById(agentId);
        if (!item) return;
        item.classList.remove('idle', 'running', 'done');
        item.classList.add(status);
        const icon = item.querySelector('.status-icon');
        if (!icon) return;
        if (status === 'idle') {
            icon.className = 'fa-regular fa-circle status-icon';
        } else if (status === 'running') {
            icon.className = 'fa-solid fa-spinner fa-spin status-icon';
        } else if (status === 'done') {
            icon.className = 'fa-solid fa-circle-check status-icon';
        }
    }

    function animateAgentsCrew() {
        // Stagger agents lighting up one by one
        const staggerMs = 850;
        AGENT_IDS.forEach((id, i) => {
            setTimeout(() => setAgentStatus(id, 'running'), i * staggerMs);
        });
    }

    function completeAgentsCrew() {
        AGENT_IDS.forEach(id => setAgentStatus(id, 'done'));
    }

    function resetAgentsCrew() {
        AGENT_IDS.forEach(id => setAgentStatus(id, 'idle'));
    }

    // Set all to idle on page load
    resetAgentsCrew();

    // ── Tab Switching ──
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(btn.getAttribute("data-tab")).classList.add("active");
        });
    });

    function switchToTab(tabId) {
        tabBtns.forEach(b => b.classList.remove("active"));
        tabContents.forEach(c => c.classList.remove("active"));
        const btn = document.querySelector(`[data-tab="${tabId}"]`);
        if (btn) btn.classList.add("active");
        const content = document.getElementById(tabId);
        if (content) content.classList.add("active");
    }

    // ── Form Submit ──
    filmForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const premise = document.getElementById("premise").value;
        const genre = document.getElementById("genre").value;
        const tone = document.getElementById("tone").value;

        btnText.classList.add("hidden");
        btnLoader.classList.remove("hidden");
        generateBtn.disabled = true;

        animateAgentsCrew();

        try {
            const res = await fetch("/api/generate-film-project", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ premise, genre, tone })
            });

            const data = await res.json();
            if (data.status === "success") {
                completeAgentsCrew();
                renderFilmProject(data.project);
                switchToTab("tab-bible");
            } else {
                resetAgentsCrew();
                alert("Generation failed. Please try again.");
            }
        } catch (err) {
            console.error("Error generating film project:", err);
            resetAgentsCrew();
            alert("Failed to generate the film project. Please check your connection and try again.");
        } finally {
            btnText.classList.remove("hidden");
            btnLoader.classList.add("hidden");
            generateBtn.disabled = false;
        }
    });

    // ── Revision Listeners ──
    function attachRevisionListeners() {
        document.querySelectorAll(".revise-scene-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const sid = e.target.closest("button").getAttribute("data-scene-id");
                const revContainer = document.getElementById(`rev-${sid}`);
                if (revContainer) revContainer.classList.toggle("hidden");
            });
        });

        document.querySelectorAll(".submit-revision-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const sceneId = e.target.getAttribute("data-scene-id");
                const notesInput = document.querySelector(`#rev-${sceneId} .revision-notes`);
                const notes = notesInput ? notesInput.value : "";
                if (!notes.trim()) {
                    alert("Please enter your director's notes first!");
                    return;
                }

                const btnEl = e.target;
                const originalText = btnEl.innerText;
                btnEl.innerText = "Rewriting...";
                btnEl.disabled = true;

                try {
                    const sceneIndex = parseInt(sceneId);
                    const scene = currentProject.scenes[sceneIndex - 1];

                    const res = await fetch("/api/revise-scene", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            film_bible: currentProject.film_bible,
                            scene: scene,
                            notes: notes
                        })
                    });
                    const data = await res.json();

                    if (data.status === "success") {
                        currentProject.scenes[sceneIndex - 1] = data.scene;
                        renderFilmProject(currentProject);
                        switchToTab("tab-script");
                    } else {
                        alert("Revision failed. Please try again.");
                        btnEl.innerText = originalText;
                        btnEl.disabled = false;
                    }
                } catch (err) {
                    console.error(err);
                    alert("Revision failed. Please try again.");
                    btnEl.innerText = originalText;
                    btnEl.disabled = false;
                }
            });
        });
    }

    // ── TTS Listeners ──
    function attachTTSListeners() {
        document.querySelectorAll(".play-tts-btn").forEach(btn => {
            // Clone to remove stale listeners on re-render
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener("click", async (e) => {
                const btnEl = e.target.closest("button");
                const char = btnEl.getAttribute("data-char") || "";
                const line = btnEl.getAttribute("data-line") || "";

                const icon = btnEl.querySelector("i");
                if (icon && icon.classList.contains("fa-spinner")) return;
                if (icon) icon.className = "fa-solid fa-spinner fa-spin";

                // Unlock AudioContext for Safari/Chrome autoplay
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    if (ctx.state === "suspended") await ctx.resume();
                } catch (_) {}

                try {
                    let voice_id = "en-US-Journey-D";
                    let gender = "MALE";

                    if (currentProject && currentProject.film_bible && currentProject.film_bible.characters) {
                        const charDetails = currentProject.film_bible.characters.find(c =>
                            c.name && char && c.name.toLowerCase() === char.toLowerCase()
                        ) || {};
                        if (charDetails.voice_id) voice_id = charDetails.voice_id;
                        if (charDetails.gender) gender = charDetails.gender;
                    }

                    const res = await fetch("/api/tts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ character: char, text: line, voice_id, gender })
                    });

                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    const data = await res.json();

                    if (data.status === "success") {
                        const realAudio = new Audio();
                        realAudio.preload = "auto";
                        realAudio.src = data.audio_url;
                        realAudio.load();

                        realAudio.oncanplaythrough = () => {
                            realAudio.play()
                                .then(() => {
                                    if (icon) icon.className = "fa-solid fa-volume-high";
                                    realAudio.onended = () => { if (icon) icon.className = "fa-solid fa-play"; };
                                })
                                .catch(err => {
                                    console.error("Audio play() blocked:", err);
                                    if (icon) icon.className = "fa-solid fa-play";
                                    alert("Audio was blocked by the browser. Please click the button again.");
                                });
                        };
                        realAudio.onerror = () => { if (icon) icon.className = "fa-solid fa-play"; };
                    } else {
                        if (icon) icon.className = "fa-solid fa-play";
                    }
                } catch (err) {
                    console.error("TTS Error:", err);
                    if (icon) icon.className = "fa-solid fa-play";
                }
            });
        });
    }

    // Storyboard image generation is intentionally disabled.
    // Cards show a cinematic placeholder with shot metadata instead.

    // ── Main Render ──
    function renderFilmProject(project) {
        currentProject = project;

        const bible = project.film_bible || {};
        const scenes = project.scenes || [];
        const storyboards = project.storyboards || [];
        const analytics = project.analytics || {};

        // Reveal content, hide empty state
        const emptyState = document.getElementById("empty-state");
        const bibleContent = document.getElementById("bible-content");
        if (emptyState) emptyState.classList.add("hidden");
        if (bibleContent) bibleContent.classList.remove("hidden");

        // Overview
        projectTitleEl.textContent = bible.title || "Untitled Project";
        projectGenreEl.textContent = document.getElementById("genre").value;
        projectAudienceEl.textContent = bible.target_audience || "General Audience";
        projectLoglineEl.textContent = `"${bible.logline || ''}"`;

        // Characters
        charactersGrid.innerHTML = "";
        (bible.characters || []).forEach(c => {
            const card = document.createElement("div");
            card.className = "character-card";
            card.innerHTML = `
                <h4>${c.name}</h4>
                <span class="role-tag">${c.role}</span>
                <p style="font-size:13px;color:var(--text-secondary);line-height:1.55;">${c.archetype_description}</p>
                <div class="char-detail">
                    <p><strong><i class="fa-solid fa-shirt" style="color:var(--accent-gold);margin-right:4px;"></i>Costume:</strong> ${c.costume_design || 'Standard apparel.'}</p>
                    <p><strong><i class="fa-solid fa-microphone" style="color:var(--accent-gold);margin-right:4px;"></i>Voice:</strong> ${c.gender || 'Unknown'} · ${c.voice_id || 'default'}</p>
                </div>
            `;
            charactersGrid.appendChild(card);
        });

        // Screenplay
        screenplayBody.innerHTML = "";
        scenes.forEach(scene => {
            const block = document.createElement("div");
            block.className = "scene-block";

            let dialoguesHtml = "";
            (scene.dialogue || []).forEach(d => {
                const escapedLine = (d.line || "").replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                dialoguesHtml += `
                    <div class="dialogue-item">
                        <div class="dialogue-char">
                            ${d.character}
                            <span class="dialogue-emotion">(${d.emotion})</span>
                            <button class="btn-tts play-tts-btn" data-char="${d.character}" data-line="${escapedLine}" title="Hear this line"><i class="fa-solid fa-play"></i></button>
                        </div>
                        <div class="dialogue-line">${d.line}</div>
                    </div>
                `;
            });

            block.innerHTML = `
                <div class="scene-revision-bar">
                    <div class="slugline">${scene.heading}</div>
                    <button class="btn-directors-cut revise-scene-btn" data-scene-id="${scene.scene_id}">
                        <i class="fa-solid fa-pen-fancy"></i> Director's Cut
                    </button>
                </div>
                <div class="scene-desc">${scene.description}</div>
                ${dialoguesHtml}
                <div class="revision-container hidden" id="rev-${scene.scene_id}">
                    <input type="text" class="revision-notes" placeholder="Your notes (e.g. 'More suspense, less dialogue')">
                    <button class="btn-submit-revision submit-revision-btn" data-scene-id="${scene.scene_id}">Rewrite</button>
                </div>
            `;
            screenplayBody.appendChild(block);
        });

        // Storyboards — static cinematic placeholder (no image generation API)
        storyboardsGrid.innerHTML = "";
        storyboards.forEach((sb) => {
            const card = document.createElement("div");
            card.className = "storyboard-card";
            card.innerHTML = `
                <div class="storyboard-preview storyboard-placeholder">
                    <i class="fa-solid fa-film storyboard-placeholder-icon"></i>
                    <span class="shot-tag">${sb.shot_type}</span>
                </div>
                <div class="storyboard-details">
                    <h4>${sb.title}</h4>
                    <p class="prompt-text">${sb.image_prompt}</p>
                </div>
            `;
            storyboardsGrid.appendChild(card);
        });

        // Production Design
        const designGrid = document.getElementById("design-grid");
        designGrid.innerHTML = "";
        (project.production_design || []).forEach((pd, index) => {
            const card = document.createElement("div");
            card.className = "design-card";
            card.innerHTML = `
                <h4><i class="fa-solid fa-building"></i> Scene ${index + 1} — Set Design</h4>
                <p class="card-body-text">${pd.set_design}</p>
                <div class="card-section">
                    <div>
                        <div class="card-section-label">Key Prop</div>
                        <p class="card-section-text">${pd.key_prop}</p>
                    </div>
                    <div>
                        <div class="card-section-label">Costume Notes</div>
                        <p class="card-section-text">${pd.costume_notes}</p>
                    </div>
                </div>
            `;
            designGrid.appendChild(card);
        });

        // Audio
        const audioGrid = document.getElementById("audio-grid");
        audioGrid.innerHTML = "";
        (project.audio_post || []).forEach((ap, index) => {
            const card = document.createElement("div");
            card.className = "audio-card";
            card.innerHTML = `
                <h4><i class="fa-solid fa-headphones"></i> Scene ${index + 1} — Audio Mix</h4>
                <p class="card-body-text"><strong>Score:</strong> ${ap.soundtrack_theme}</p>
                <div class="card-section">
                    <div>
                        <div class="card-section-label">Foley &amp; SFX</div>
                        <p class="card-section-text">${ap.foley_effects}</p>
                    </div>
                    <div>
                        <div class="card-section-label">Primary Audio Cue</div>
                        <p class="card-section-text">${ap.audio_cue}</p>
                    </div>
                </div>
            `;
            audioGrid.appendChild(card);
        });

        // Analytics stats
        statEngineEl.textContent = "ClickHouse Vector";
        statLatencyEl.textContent = "12.4 ms";
        statBoxofficeEl.textContent = analytics.projected_box_office || "$180M – $260M";

        renderTensionChart(scenes);
        attachRevisionListeners();
        attachTTSListeners();
    }

    // ── Tension Chart ──
    function renderTensionChart(scenes) {
        const ctx = document.getElementById("tensionChart").getContext("2d");
        if (tensionChart) tensionChart.destroy();

        const labels = scenes.map((s, i) => s.title || `Scene ${i + 1}`);
        const dataPoints = scenes.map(s => s.tension_score || 5.0);

        tensionChart = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label: "Dramatic Tension",
                    data: dataPoints,
                    borderColor: "#f59e0b",
                    backgroundColor: "rgba(245, 158, 11, 0.08)",
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: "#f59e0b",
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        min: 0, max: 10,
                        grid: { color: "rgba(255, 240, 200, 0.05)" },
                        ticks: { color: "#7a6a52" }
                    },
                    x: {
                        grid: { color: "rgba(255, 240, 200, 0.05)" },
                        ticks: { color: "#7a6a52", maxRotation: 30 }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: "#b8a98a", font: { family: "'Inter', sans-serif", size: 12 } }
                    }
                }
            }
        });
    }

    // ── Vector Search ──
    searchVectorBtn.addEventListener("click", async () => {
        const query = vectorQueryInput.value.trim();
        if (!query) return;

        searchResultsList.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">Searching scenes...</p>`;
        try {
            const res = await fetch("/api/vector-search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, limit: 3 })
            });

            const data = await res.json();
            if (data.status === "success") {
                searchResultsList.innerHTML = "";
                if (!data.results || data.results.length === 0) {
                    searchResultsList.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No matching scenes found.</p>`;
                    return;
                }
                data.results.forEach(r => {
                    const item = document.createElement("div");
                    item.className = "character-card";
                    item.innerHTML = `
                        <h4 style="font-size:15px;">${r.title}
                            <small style="color:var(--accent-gold);font-size:11px;font-weight:500;margin-left:6px;">
                                ${Math.round((r.similarity_score || 0) * 100)}% match
                            </small>
                        </h4>
                        <span class="role-tag">${r.heading}</span>
                        <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;">${r.description}</p>
                    `;
                    searchResultsList.appendChild(item);
                });
            }
        } catch (err) {
            console.error("Vector search error:", err);
            searchResultsList.innerHTML = `<p style="color:var(--accent-rose);font-size:13px;">Search failed. Please try again.</p>`;
        }
    });

});
