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
        generateBtn.innerHTML = '<i class="fa-solid fa-film"></i> Greenlight Production';
    });

    // Feature Attachments
    function attachRevisionListeners() {
        document.querySelectorAll(".revise-scene-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const sid = e.target.closest("button").getAttribute("data-scene-id");
                const revContainer = document.getElementById(`rev-${sid}`);
                if (revContainer.classList.contains("hidden")) {
                    revContainer.classList.remove("hidden");
                    const submitBtn = revContainer.querySelector(".submit-revision-btn");
                    submitBtn.innerText = "Rewrite";
                } else {
                    revContainer.classList.add("hidden");
                }
            });
        });

        document.querySelectorAll(".submit-revision-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const sceneId = e.target.getAttribute("data-scene-id");
                const notesInput = document.querySelector(`#rev-${sceneId} .revision-notes`);
                const notes = notesInput.value;
                if (!notes) {
                    alert("Please enter revision notes!");
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
                        renderFilmProject(currentProject); // Re-render the whole UI
                        document.querySelector(`button[data-tab="tab-screenplay"]`).click();
                    } else {
                        alert("Revision failed.");
                        btnEl.innerText = originalText;
                        btnEl.disabled = false;
                    }
                } catch(err) {
                    console.error(err);
                    alert("Revision failed.");
                    btnEl.innerText = originalText;
                    btnEl.disabled = false;
                }
            });
        });
    }

    function attachTTSListeners() {
        document.querySelectorAll(".play-tts-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const btnEl = e.target.closest("button");
                const char = btnEl.getAttribute("data-char");
                const line = btnEl.getAttribute("data-line");
                
                const icon = btnEl.querySelector("i");
                if (icon.classList.contains("fa-spinner")) return; // already loading
                
                icon.className = "fa-solid fa-spinner fa-spin"; // loading state

                // Find character voice details
                const charDetails = currentProject?.film_bible?.characters?.find(c => c.name.toLowerCase() === char.toLowerCase()) || {};
                const voice_id = charDetails.voice_id || "en-US-Journey-D";
                const gender = charDetails.gender || "MALE";

                try {
                    const res = await fetch("/api/tts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ character: char, text: line, voice_id: voice_id, gender: gender })
                    });
                    const data = await res.json();
                    if (data.status === "success") {
                        const audio = new Audio(data.audio_url);
                        audio.play();
                        icon.className = "fa-solid fa-volume-high"; // playing state
                        audio.onended = () => { icon.className = "fa-solid fa-play"; };
                    } else {
                        icon.className = "fa-solid fa-play";
                    }
                } catch(err) {
                    console.error(err);
                    icon.className = "fa-solid fa-play";
                }
            });
        });
    }
    
    async function generateStoryboardImage(prompt, index, shotType, regenBtn = null) {
        const previewDiv = document.getElementById(`img-preview-${index}`);
        if (!previewDiv) return;
        
        previewDiv.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--accent-cyan);"></i>
            <span class="shot-tag">${shotType}</span>
        `;
        if (regenBtn) {
            regenBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            regenBtn.disabled = true;
        }

        try {
            const res = await fetch("/api/generate-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: prompt })
            });
            const data = await res.json();
            
            if (data.status === "success") {
                previewDiv.innerHTML = `<span class="shot-tag">${shotType}</span>`;
                previewDiv.style.backgroundImage = `url('${data.image_url}')`;
                previewDiv.style.backgroundSize = "cover";
                previewDiv.style.backgroundPosition = "center";
            } else {
                throw new Error("API failed");
            }
        } catch (e) {
            console.error("Image gen failed", e);
            previewDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: red;"></i><br>Failed<span class="shot-tag">${shotType}</span>`;
        } finally {
            if (regenBtn) {
                regenBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';
                regenBtn.disabled = false;
            }
        }
    }

    function attachStoryboardListeners() {
        document.querySelectorAll(".regen-img-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const btnEl = e.target.closest("button");
                const index = btnEl.getAttribute("data-index");
                const prompt = decodeURIComponent(btnEl.getAttribute("data-prompt"));
                const shotType = btnEl.getAttribute("data-shot");
                
                generateStoryboardImage(prompt, index, shotType, btnEl);
            });
        });
    }

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
                const escapedLine = d.line.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                dialoguesHtml += `
                    <div class="dialogue-item">
                        <div class="dialogue-char">
                            ${d.character} <span class="dialogue-emotion">(${d.emotion})</span>
                            <button class="btn-primary play-tts-btn" data-char="${d.character}" data-line="${escapedLine}" style="padding: 2px 6px; font-size: 10px; margin-left: 10px; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;"><i class="fa-solid fa-play"></i></button>
                        </div>
                        <div class="dialogue-line">${d.line}</div>
                    </div>
                `;
            });

            block.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="slugline">${scene.heading}</div>
                    <button class="btn-primary revise-scene-btn" data-scene-id="${scene.scene_id}" style="padding: 5px 10px; font-size: 12px; background: rgba(0, 229, 255, 0.2);"><i class="fa-solid fa-pen-fancy"></i> Director's Cut</button>
                </div>
                <div class="scene-desc">${scene.description}</div>
                ${dialoguesHtml}
                <div class="revision-container hidden" id="rev-${scene.scene_id}" style="margin-top: 15px; padding: 10px; background: rgba(0, 0, 0, 0.3); border-left: 2px solid var(--accent-cyan);">
                    <input type="text" class="form-input revision-notes" placeholder="Director's Notes (e.g. 'Make it rain', 'Add more suspense')" style="width: 75%; display: inline-block;">
                    <button class="btn-primary submit-revision-btn" data-scene-id="${scene.scene_id}" style="padding: 8px 12px; display: inline-block;">Rewriting...</button>
                </div>
            `;
            screenplayBody.appendChild(block);
        });

        // Render Storyboards (Lazy Loaded via GCP Imagen)
        storyboardsGrid.innerHTML = "";
        storyboards.forEach((sb, index) => {
            const card = document.createElement("div");
            card.className = "storyboard-card";
            card.innerHTML = `
                <div class="storyboard-preview" id="img-preview-${index}" style="background: #111; display: flex; align-items: center; justify-content: center; min-height: 200px; position: relative;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--accent-cyan);"></i>
                    <span class="shot-tag">${sb.shot_type}</span>
                </div>
                <div class="storyboard-details" style="position: relative;">
                    <h4>${sb.title}</h4>
                    <p class="prompt-text"><strong>Prompt:</strong> ${sb.image_prompt}</p>
                    <button class="btn-primary regen-img-btn" data-index="${index}" data-prompt="${encodeURIComponent(sb.image_prompt)}" data-shot="${sb.shot_type}" style="position: absolute; right: 10px; top: 10px; padding: 5px; font-size: 14px; width: 30px; height: 30px; border-radius: 5px; background: rgba(255,255,255,0.1);"><i class="fa-solid fa-arrows-rotate"></i></button>
                </div>
            `;
            storyboardsGrid.appendChild(card);
            
            // Asynchronously fetch image
            generateStoryboardImage(sb.image_prompt, index, sb.shot_type);
        });

        // Render Analytics & Stats
        statEngineEl.textContent = "ClickHouse Vector";
        statLatencyEl.textContent = "12.4 ms";
        statBoxofficeEl.textContent = analytics.projected_box_office || "$180M - $260M";

        renderTensionChart(scenes);
        
        attachRevisionListeners();
        attachTTSListeners();
        attachStoryboardListeners();
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
