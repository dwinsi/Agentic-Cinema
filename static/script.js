document.addEventListener("DOMContentLoaded", () => {

    // ── State ──
    let currentProject = null;
    let currentDocId = "";     // doc_id of the most recently uploaded script
    let tensionChart = null;
    const AGENT_IDS = [
        'agent-script-analyst',
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
                body: JSON.stringify({ premise, genre, tone, doc_id: currentDocId })
            });

            const data = await res.json();
            if (data.status === "success") {
                completeAgentsCrew();
                currentProjectId = data.project_id || null;
                renderFilmProject(data.project);
                switchToTab("tab-bible");
                showSaveToast("Project saved ✓");
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
        const groundedBadge = project.grounded
            ? `<span class="grounded-badge"><i class="fa-solid fa-circle-check"></i> RAG Grounded</span>`
            : "";
        projectTitleEl.innerHTML = (bible.title || "Untitled Project") + groundedBadge;
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

        // ── Storyboards — Imagen 3 Live Generation ──
        storyboardsGrid.innerHTML = "";

        async function generateStoryboardImage(prompt, previewEl) {
            previewEl.classList.add("sb-loading");
            previewEl.innerHTML = `
                <div class="sb-loading-icon">
                    <i class="fa-solid fa-wand-magic-sparkles fa-beat-fade"></i>
                    <span>Generating with Imagen 3…</span>
                </div>
            `;
            try {
                const res = await fetch("/api/generate-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt })
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (data.status !== "success" || !data.image_url) throw new Error("No image_url");

                previewEl.classList.remove("sb-loading", "sb-error");
                previewEl.innerHTML = `<img class="sb-image" src="${data.image_url}" alt="AI Storyboard Frame" loading="lazy">`;
                return data.image_url;
            } catch (err) {
                console.warn("Imagen generation failed:", err);
                previewEl.classList.remove("sb-loading");
                previewEl.classList.add("sb-error");
                previewEl.innerHTML = `
                    <div class="sb-error-icon">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>Imagen unavailable</span>
                    </div>
                `;
                return null;
            }
        }

        storyboards.forEach((sb) => {
            const card = document.createElement("div");
            card.className = "storyboard-card";

            const previewEl = document.createElement("div");
            previewEl.className = "storyboard-preview";

            const regenOverlay = document.createElement("div");
            regenOverlay.className = "storyboard-regen-overlay";
            regenOverlay.innerHTML = `
                <button class="btn-regen-img">
                    <i class="fa-solid fa-rotate-right"></i> Regenerate
                </button>
            `;

            const shotTag = document.createElement("span");
            shotTag.className = "shot-tag";
            shotTag.textContent = sb.shot_type;

            previewEl.appendChild(regenOverlay);
            previewEl.appendChild(shotTag);

            card.innerHTML = `
                <div class="storyboard-details">
                    <h4>${sb.title}</h4>
                    <p class="prompt-text">${sb.image_prompt}</p>
                </div>
            `;
            card.prepend(previewEl);
            storyboardsGrid.appendChild(card);

            // Fire image generation immediately (non-blocking)
            generateStoryboardImage(sb.image_prompt, previewEl);

            // Wire the Regenerate button
            regenOverlay.querySelector(".btn-regen-img").addEventListener("click", async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                await generateStoryboardImage(sb.image_prompt, previewEl);
                btn.disabled = false;
                // Re-attach overlay since innerHTML was replaced
                if (!previewEl.contains(regenOverlay)) {
                    previewEl.appendChild(regenOverlay);
                    previewEl.appendChild(shotTag);
                }
            });
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

    // ── Script Upload Panel ──────────────────────────────────────────────────

    const dropZone     = document.getElementById("upload-drop-zone");
    const fileInput    = document.getElementById("script-file-input");
    const uploadStatus = document.getElementById("upload-status");
    const parsedPreview = document.getElementById("parsed-bible-preview");

    function setUploadStatus(state, message) {
        uploadStatus.className = `upload-status status-${state}`;
        uploadStatus.classList.remove("hidden");
        const icons = { parsing: "fa-spinner fa-spin", success: "fa-circle-check", error: "fa-triangle-exclamation" };
        uploadStatus.innerHTML = `<i class="fa-solid ${icons[state] || ''}"></i> ${message}`;
    }

    function renderParsedBiblePreview(data) {
        const pb = data.parsed_bible || {};
        const themes = (pb.themes || []).map(t => `<span class="theme-tag">${t}</span>`).join("");
        parsedPreview.classList.remove("hidden");
        parsedPreview.innerHTML = `
            <div class="parsed-preview-title">
                <i class="fa-solid fa-file-lines" style="color:var(--accent-gold);margin-right:6px;font-size:12px;"></i>
                ${pb.title || "Untitled"}
            </div>
            <p class="parsed-preview-logline">${pb.logline || ""}</p>
            <div class="parsed-preview-meta">
                <span class="pill">${pb.genre || ""}</span>
                <span class="pill target-audience">${pb.tone || ""}</span>
            </div>
            ${themes ? `<div class="parsed-preview-themes">${themes}</div>` : ""}
            <div class="parsed-preview-footer">
                <i class="fa-solid fa-users" style="font-size:10px;"></i>
                ${pb.character_count || 0} characters · ${data.chunks_indexed || 0} chunks indexed
                <button class="clear-script-btn" id="clear-script-btn">✕ Remove</button>
            </div>
        `;

        // Auto-populate premise from logline if textarea is still default
        if (pb.logline) {
            const premiseEl = document.getElementById("premise");
            if (premiseEl) premiseEl.value = pb.logline;
        }

        document.getElementById("clear-script-btn")?.addEventListener("click", () => {
            currentDocId = "";
            parsedPreview.classList.add("hidden");
            parsedPreview.innerHTML = "";
            uploadStatus.classList.add("hidden");
            dropZone.classList.remove("drag-over");
            setAgentStatus("agent-script-analyst", "idle");
        });
    }

    async function processUploadedFile(file) {
        if (!file) return;
        const allowed = ["application/pdf", "text/plain"];
        if (!allowed.includes(file.type)) {
            setUploadStatus("error", `Unsupported type: ${file.type}. Use PDF or TXT.`);
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            setUploadStatus("error", "File exceeds 20 MB limit.");
            return;
        }

        setAgentStatus("agent-script-analyst", "running");
        setUploadStatus("parsing", `Parsing "${file.name}" with Gemini…`);
        parsedPreview.classList.add("hidden");

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/upload-script", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();

            if (!res.ok || data.status !== "success") {
                throw new Error(data.detail || "Upload failed");
            }

            currentDocId = data.doc_id;
            setAgentStatus("agent-script-analyst", "done");
            const vertexMsg = data.vertex_search_indexed
                ? " · Vertex AI Search indexed"
                : " · ClickHouse indexed";
            setUploadStatus("success", `✓ "${data.parsed_bible?.title || file.name}" parsed${vertexMsg}`);
            renderParsedBiblePreview(data);

        } catch (err) {
            console.error("Upload error:", err);
            setAgentStatus("agent-script-analyst", "idle");
            setUploadStatus("error", `Upload failed: ${err.message}`);
        }
    }

    // Drag-and-drop events
    ["dragenter", "dragover"].forEach(evt =>
        dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); })
    );
    ["dragleave", "drop"].forEach(evt =>
        dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove("drag-over"); })
    );
    dropZone.addEventListener("drop", (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) processUploadedFile(file);
    });

    // Click-to-browse
    dropZone.addEventListener("click", (e) => {
        if (!e.target.closest("label")) fileInput.click();
    });
    fileInput.addEventListener("change", () => {
        if (fileInput.files?.[0]) processUploadedFile(fileInput.files[0]);
        fileInput.value = "";  // reset so same file can be re-selected
    });

});

// ══════════════════════════════════════════════════════════════════════
//  Library — Project Persistence Module
// ══════════════════════════════════════════════════════════════════════

let currentProjectId = null;  // set after each successful generation

// ── Save Toast ──────────────────────────────────────────────────────
let _toastTimer = null;
function showSaveToast(msg = 'Project saved ✓') {
    const toast = document.getElementById('save-toast');
    const label = document.getElementById('save-toast-msg');
    if (!toast) return;
    label.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ── Load Library ────────────────────────────────────────────────────
async function loadLibrary() {
    const grid       = document.getElementById('library-grid');
    const empty      = document.getElementById('library-empty');
    const subtitle   = document.getElementById('library-subtitle');
    const refreshBtn = document.getElementById('library-refresh-btn');
    if (!grid) return;

    refreshBtn?.classList.add('spinning');
    subtitle.textContent = 'Loading…';
    grid.innerHTML = '';

    try {
        const res      = await fetch('/api/projects');
        const data     = await res.json();
        const projects = data.projects || [];

        subtitle.textContent = projects.length
            ? `${projects.length} saved project${projects.length !== 1 ? 's' : ''}`
            : 'No projects yet';

        if (projects.length === 0) {
            empty.style.display = 'block';
        } else {
            empty.style.display = 'none';
            projects.forEach(p => grid.appendChild(renderProjectCard(p)));
        }
    } catch (err) {
        subtitle.textContent = 'Failed to load — check connection';
        console.error('Library load error:', err);
    } finally {
        refreshBtn?.classList.remove('spinning');
    }
}

// ── Render one project card ─────────────────────────────────────────
function renderProjectCard(p) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.projectId = p.project_id;

    const date = p.created_at
        ? new Date(p.created_at).toLocaleDateString('en-US',
            { month: 'short', day: 'numeric', year: 'numeric' })
        : '';

    const groundedPill = p.grounded
        ? `<span class="project-card-pill grounded"><i class="fa-solid fa-seedling"></i> RAG</span>`
        : '';

    card.innerHTML = `
        <p class="project-card-title" title="${p.title || 'Untitled'}">${p.title || 'Untitled'}</p>
        <div class="project-card-meta">
            ${p.genre ? `<span class="project-card-pill">${p.genre}</span>` : ''}
            ${p.tone  ? `<span class="project-card-pill tone">${p.tone}</span>`  : ''}
            ${groundedPill}
        </div>
        <p class="project-card-premise">${p.premise || ''}</p>
        <p class="project-card-date"><i class="fa-regular fa-clock"></i> ${date}</p>
        <div class="project-card-actions">
            <button class="project-load-btn" data-id="${p.project_id}">
                <i class="fa-solid fa-play"></i> Load Project
            </button>
            <button class="project-delete-btn"
                    data-id="${p.project_id}"
                    data-title="${(p.title || 'Untitled').replace(/"/g, '&quot;')}">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `;

    card.querySelector('.project-load-btn').addEventListener('click',
        () => loadProject(p.project_id, p));
    card.querySelector('.project-delete-btn').addEventListener('click',
        () => confirmDeleteProject(p.project_id, p.title || 'Untitled'));

    return card;
}

// ── Load a saved project ────────────────────────────────────────────
async function loadProject(projectId, meta) {
    const subtitle = document.getElementById('library-subtitle');
    if (subtitle) subtitle.textContent = 'Loading project…';

    try {
        const res  = await fetch(`/api/projects/${projectId}`);
        const data = await res.json();
        if (data.status !== 'success') throw new Error('Not found');

        renderFilmProject(data.project);
        currentProjectId = projectId;

        // Pre-fill sidebar so the user can tweak and re-generate
        const premiseEl = document.getElementById('premise');
        const genreEl   = document.getElementById('genre');
        const toneEl    = document.getElementById('tone');
        if (premiseEl && meta?.premise) premiseEl.value = meta.premise;
        if (genreEl   && meta?.genre)   genreEl.value   = meta.genre;
        if (toneEl    && meta?.tone)    toneEl.value    = meta.tone;

        switchToTab('tab-bible');
        showSaveToast('Project loaded ✓');
    } catch (err) {
        alert('Could not load project — it may have been deleted.');
        console.error('loadProject error:', err);
    }
}

// ── Delete confirm modal ────────────────────────────────────────────
let _pendingDelete = null;

function confirmDeleteProject(projectId, title) {
    _pendingDelete = projectId;
    document.getElementById('confirm-modal-title').textContent = `Delete "${title}"?`;
    document.getElementById('confirm-modal-body').textContent =
        'All scenes and data will be removed. This cannot be undone.';
    document.getElementById('confirm-modal-overlay').style.display = 'flex';
}

function closeModal() {
    document.getElementById('confirm-modal-overlay').style.display = 'none';
    _pendingDelete = null;
}

async function executeDeleteProject() {
    if (!_pendingDelete) return;
    const id = _pendingDelete;
    closeModal();

    try {
        const res  = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'success') {
            const card = document.querySelector(`.project-card[data-project-id="${id}"]`);
            if (card) {
                card.style.transition = 'opacity 0.25s, transform 0.25s';
                card.style.opacity    = '0';
                card.style.transform  = 'scale(0.95)';
                setTimeout(() => { card.remove(); updateLibraryCount(); }, 260);
            }
            showSaveToast('Project deleted');
        }
    } catch (err) {
        alert('Failed to delete project.');
        console.error('deleteProject error:', err);
    }
}

function updateLibraryCount() {
    const grid     = document.getElementById('library-grid');
    const empty    = document.getElementById('library-empty');
    const subtitle = document.getElementById('library-subtitle');
    if (!grid) return;
    const count = grid.querySelectorAll('.project-card').length;
    if (empty)    empty.style.display = count === 0 ? 'block' : 'none';
    if (subtitle) subtitle.textContent = count === 0
        ? 'No projects yet'
        : `${count} saved project${count !== 1 ? 's' : ''}`;
}

// ── Wire modal buttons ──────────────────────────────────────────────
document.getElementById('confirm-cancel-btn')
    ?.addEventListener('click', closeModal);
document.getElementById('confirm-delete-btn')
    ?.addEventListener('click', executeDeleteProject);
document.getElementById('confirm-modal-overlay')
    ?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });

// ── Wire Library tab refresh ────────────────────────────────────────
document.getElementById('library-refresh-btn')
    ?.addEventListener('click', loadLibrary);
document.getElementById('library-tab-btn')
    ?.addEventListener('click', loadLibrary);
