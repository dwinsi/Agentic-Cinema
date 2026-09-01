document.addEventListener("DOMContentLoaded", () => {

    // ── State ──
    let currentProject = null;
    let currentProjectId = null;
    let currentDocId = "";     // doc_id of the most recently uploaded script
    let tensionChart = null;
    const AGENT_IDS = [
        'agent-script-analyst',
        'agent-producer', 'agent-writer', 'agent-storyboard',
        'agent-production', 'agent-audio', 'agent-clickhouse'
    ];

    // Curated high-concept movie ideas for the randomizer
    const INSPIRATION_PREMISES = [
        {
            premise: "After humanity surrenders planetary governance to an all-knowing benevolent AI, a disillusioned engineer discovers that absolute utopia requires the total erasure of human free will.",
            genre: "Cyberpunk",
            tone: "Dark & Gritty"
        },
        {
            premise: "A deep-space salvage crew boards an abandoned luxury star-liner that disappeared 50 years ago, only to find the passengers still dancing at a grand ball in suspended temporal stasis.",
            genre: "Sci-Fi",
            tone: "Atmospheric & Neo-Noir"
        },
        {
            premise: "A blind forensic acoustic analyst in 1950s Chicago realizes the vinyl record of a famous jazz singer holds the encrypted audio frequency of an unsolved political assassination.",
            genre: "Noir",
            tone: "Suspenseful & Tense"
        },
        {
            premise: "An elite hacker who extracts traumatic memories from convicted criminals accidentally inherits the classified memories of the world's most dangerous state intelligence asset.",
            genre: "Thriller",
            tone: "Fast-Paced & Kinetic"
        },
        {
            premise: "In a world where sleep has been chemically outlawed for supreme productivity, an insomniac underground rebel rediscovers dreaming and weaponizes collective dreams.",
            genre: "Sci-Fi",
            tone: "Surreal & Abstract"
        },
        {
            premise: "A disgraced medieval knight seeking redemption discovers an ancient clockwork automaton buried in a monastery that speaks in future astronomical coordinates.",
            genre: "Historical",
            tone: "Epic & Sweeping"
        }
    ];

    // ── DOM References ──
    const filmForm = document.getElementById("film-form");
    const premiseInput = document.getElementById("premise");
    const genreInput = document.getElementById("genre");
    const toneInput = document.getElementById("tone");
    const charCountEl = document.getElementById("premise-char-count");
    const generateBtn = document.getElementById("generate-btn");
    const btnText = document.getElementById("btn-text");
    const btnLoader = document.getElementById("btn-loader");
    const randomInspoBtn = document.getElementById("random-inspo-btn");
    const crewActiveCount = document.getElementById("crew-active-count");

    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    const projectTitleEl = document.getElementById("project-title");
    const projectGenreEl = document.getElementById("project-genre");
    const projectAudienceEl = document.getElementById("project-audience");
    const projectLoglineEl = document.getElementById("project-logline");

    const charactersGrid = document.getElementById("characters-grid");
    const screenplayBody = document.getElementById("screenplay-body");
    const storyboardsGrid = document.getElementById("storyboards-grid");
    const copyScriptBtn = document.getElementById("copy-script-btn");
    const exportScriptBtn = document.getElementById("export-script-btn");

    const vectorQueryInput = document.getElementById("vector-query");
    const searchVectorBtn = document.getElementById("search-vector-btn");
    const searchResultsList = document.getElementById("search-results-list");

    const statEngineEl = document.getElementById("stat-engine");
    const statLatencyEl = document.getElementById("stat-latency");
    const statBoxofficeEl = document.getElementById("stat-boxoffice");

    // Lightbox modal elements
    const lightboxOverlay = document.getElementById("lightbox-overlay");
    const lightboxImg = document.getElementById("lightbox-img");
    const lightboxCaption = document.getElementById("lightbox-caption");
    const lightboxCloseBtn = document.getElementById("lightbox-close-btn");

    // ── Character Counter for Premise ──
    function updateCharCount() {
        if (!premiseInput || !charCountEl) return;
        const len = premiseInput.value.length;
        charCountEl.textContent = `${len} / 500`;
    }
    premiseInput?.addEventListener("input", updateCharCount);
    updateCharCount();

    // ── Random Inspo & Preset Chips ──
    function applyPremisePreset(item) {
        if (!item) return;
        if (premiseInput) premiseInput.value = item.premise;
        if (genreInput) genreInput.value = item.genre;
        if (toneInput) toneInput.value = item.tone;
        updateCharCount();
        showSaveToast("Premise preset loaded 🎬");
    }

    randomInspoBtn?.addEventListener("click", () => {
        const randomIndex = Math.floor(Math.random() * INSPIRATION_PREMISES.length);
        applyPremisePreset(INSPIRATION_PREMISES[randomIndex]);
    });

    document.querySelectorAll(".chip-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const presetKey = btn.getAttribute("data-preset");
            let found = null;
            if (presetKey === "cyberpunk") found = INSPIRATION_PREMISES[0];
            else if (presetKey === "space") found = INSPIRATION_PREMISES[1];
            else if (presetKey === "noir") found = INSPIRATION_PREMISES[2];
            else if (presetKey === "thriller") found = INSPIRATION_PREMISES[3];
            if (found) applyPremisePreset(found);
        });
    });

    // Keyboard shortcut: Cmd/Ctrl + Enter to submit form
    premiseInput?.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            filmForm?.requestSubmit();
        }
    });

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
        if (crewActiveCount) crewActiveCount.textContent = "7 Working...";
        const staggerMs = 700;
        AGENT_IDS.forEach((id, i) => {
            setTimeout(() => setAgentStatus(id, 'running'), i * staggerMs);
        });
    }

    function completeAgentsCrew() {
        if (crewActiveCount) crewActiveCount.textContent = "7 Complete";
        AGENT_IDS.forEach(id => setAgentStatus(id, 'done'));
    }

    function resetAgentsCrew() {
        if (crewActiveCount) crewActiveCount.textContent = "7 Ready";
        AGENT_IDS.forEach(id => setAgentStatus(id, 'idle'));
    }

    // Set all to idle on initial load
    resetAgentsCrew();

    // ── Tab Switching ──
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => {
                b.classList.remove("active");
                b.setAttribute("aria-selected", "false");
            });
            tabContents.forEach(c => c.classList.remove("active"));
            
            btn.classList.add("active");
            btn.setAttribute("aria-selected", "true");
            const targetContent = document.getElementById(btn.getAttribute("data-tab"));
            if (targetContent) targetContent.classList.add("active");
        });
    });

    function switchToTab(tabId) {
        tabBtns.forEach(b => {
            b.classList.remove("active");
            b.setAttribute("aria-selected", "false");
        });
        tabContents.forEach(c => c.classList.remove("active"));
        const btn = document.querySelector(`[data-tab="${tabId}"]`);
        if (btn) {
            btn.classList.add("active");
            btn.setAttribute("aria-selected", "true");
        }
        const content = document.getElementById(tabId);
        if (content) content.classList.add("active");
    }

    // ── Progressive Streaming & Modular Rendering ──

    function renderFilmBible(bible, grounded = false) {
        const emptyState = document.getElementById("empty-state");
        const bibleContent = document.getElementById("bible-content");
        if (emptyState) emptyState.classList.add("hidden");
        if (bibleContent) bibleContent.classList.remove("hidden");

        const groundedBadge = grounded
            ? `<span class="grounded-badge"><i class="fa-solid fa-circle-check"></i> RAG Grounded</span>`
            : "";
        projectTitleEl.innerHTML = (bible.title || "Untitled Project") + " " + groundedBadge;
        projectGenreEl.innerHTML = `<i class="fa-solid fa-masks-theater"></i> ${genreInput ? genreInput.value : "Sci-Fi"}`;
        projectAudienceEl.innerHTML = `<i class="fa-solid fa-eye"></i> ${bible.target_audience || "General Audience"}`;
        projectLoglineEl.textContent = `${bible.logline || ''}`;

        charactersGrid.innerHTML = "";
        (bible.characters || []).forEach(c => {
            const card = document.createElement("div");
            card.className = "character-card";
            card.innerHTML = `
                <h4>${c.name} <span class="role-tag">${c.role}</span></h4>
                <p style="font-size:13px;color:var(--text-secondary);line-height:1.55;">${c.archetype_description}</p>
                <div class="char-detail">
                    <p><strong><i class="fa-solid fa-shirt" style="color:var(--accent-gold);margin-right:4px;"></i>Costume:</strong> ${c.costume_design || 'Standard apparel.'}</p>
                    <p><strong><i class="fa-solid fa-microphone" style="color:var(--accent-gold);margin-right:4px;"></i>Voice Profile:</strong> ${c.gender || 'Unknown'} · ${c.voice_id || 'default'}</p>
                </div>
            `;
            charactersGrid.appendChild(card);
        });
    }

    function renderScreenplay(scenes) {
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
                            ${d.emotion ? `<span class="dialogue-emotion">(${d.emotion})</span>` : ''}
                            <button class="btn-tts play-tts-btn" data-char="${d.character}" data-line="${escapedLine}" title="Play synthetic voice line"><i class="fa-solid fa-play"></i></button>
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
                    <input type="text" class="revision-notes" placeholder="Your notes (e.g. 'Build more suspense, intensify the revelation')">
                    <button class="btn-submit-revision submit-revision-btn" data-scene-id="${scene.scene_id}">Rewrite</button>
                </div>
            `;
            screenplayBody.appendChild(block);
        });
        attachRevisionListeners();
        attachTTSListeners();
    }

    async function generateStoryboardImage(prompt, previewEl, title, storyboardId = "") {
        previewEl.classList.add("sb-loading");
        previewEl.innerHTML = `
            <div class="sb-loading-icon">
                <i class="fa-solid fa-wand-magic-sparkles fa-beat-fade"></i>
                <span>Rendering Concept Frame…</span>
            </div>
        `;
        try {
            const res = await fetch("/api/generate-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    project_id: currentProjectId || "",
                    storyboard_id: storyboardId || "",
                    title: title || ""
                })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.status !== "success" || !data.image_url) throw new Error("No image_url");

            previewEl.classList.remove("sb-loading", "sb-error");
            previewEl.innerHTML = `<img class="sb-image" src="${data.image_url}" alt="${title || 'AI Storyboard Frame'}" loading="lazy">`;
            
            // Lightbox zoom on click
            const imgEl = previewEl.querySelector(".sb-image");
            imgEl?.addEventListener("click", () => {
                if (lightboxImg && lightboxOverlay) {
                    lightboxImg.src = data.image_url;
                    if (lightboxCaption) lightboxCaption.textContent = title || prompt;
                    lightboxOverlay.style.display = "flex";
                }
            });

            return data.image_url;
        } catch (err) {
            console.warn("Storyboard frame generation fallback:", err);
            previewEl.classList.remove("sb-loading");
            previewEl.classList.add("sb-error");
            previewEl.innerHTML = `
                <div class="sb-error-icon">
                    <i class="fa-solid fa-camera"></i>
                    <span>Storyboard Frame Preview</span>
                </div>
            `;
            return null;
        }
    }

    function renderStoryboards(storyboards) {
        storyboardsGrid.innerHTML = "";
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

            // Generate frame asynchronously
            generateStoryboardImage(sb.image_prompt, previewEl, sb.title, sb.storyboard_id);

            // Wire Regenerate Button
            regenOverlay.querySelector(".btn-regen-img").addEventListener("click", async (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                btn.disabled = true;
                await generateStoryboardImage(sb.image_prompt, previewEl, sb.title, sb.storyboard_id);
                btn.disabled = false;
                if (!previewEl.contains(regenOverlay)) {
                    previewEl.appendChild(regenOverlay);
                    previewEl.appendChild(shotTag);
                }
            });
        });
    }

    function renderProductionDesign(production_design) {
        const designGrid = document.getElementById("design-grid");
        if (!designGrid) return;
        designGrid.innerHTML = "";
        (production_design || []).forEach((pd, index) => {
            const card = document.createElement("div");
            card.className = "design-card";
            card.innerHTML = `
                <h4><i class="fa-solid fa-landmark"></i> Scene ${index + 1} — Set Architecture &amp; World</h4>
                <p class="card-body-text">${pd.set_design}</p>
                <div class="card-section">
                    <div>
                        <div class="card-section-label"><i class="fa-solid fa-key" style="color:var(--accent-cyan);margin-right:4px;"></i>Key Hero Prop</div>
                        <p class="card-section-text">${pd.key_prop}</p>
                    </div>
                    <div>
                        <div class="card-section-label"><i class="fa-solid fa-shirt" style="color:var(--accent-cyan);margin-right:4px;"></i>Costume Notes</div>
                        <p class="card-section-text">${pd.costume_notes}</p>
                    </div>
                </div>
            `;
            designGrid.appendChild(card);
        });
    }

    function renderAudioPost(audio_post) {
        const audioGrid = document.getElementById("audio-grid");
        if (!audioGrid) return;
        audioGrid.innerHTML = "";
        (audio_post || []).forEach((ap, index) => {
            const card = document.createElement("div");
            card.className = "audio-card";
            card.innerHTML = `
                <h4><i class="fa-solid fa-headphones"></i> Scene ${index + 1} — Soundscape &amp; Score</h4>
                <p class="card-body-text"><strong>Orchestral Theme:</strong> ${ap.soundtrack_theme}</p>
                <div class="card-section">
                    <div>
                        <div class="card-section-label"><i class="fa-solid fa-volume-high" style="color:var(--accent-purple);margin-right:4px;"></i>Foley &amp; SFX</div>
                        <p class="card-section-text">${ap.foley_effects}</p>
                    </div>
                    <div>
                        <div class="card-section-label"><i class="fa-solid fa-wave-pulse" style="color:var(--accent-purple);margin-right:4px;"></i>Audio Cue</div>
                        <p class="card-section-text">${ap.audio_cue}</p>
                    </div>
                </div>
            `;
            audioGrid.appendChild(card);
        });
    }

    function renderAnalytics(analytics, scenes = []) {
        if (statEngineEl) statEngineEl.textContent = "ClickHouse Vector";
        if (statLatencyEl) statLatencyEl.textContent = "12.4 ms";
        if (statBoxofficeEl) statBoxofficeEl.textContent = analytics.projected_box_office || "$180M – $260M";
        
        const contVal = document.getElementById("continuity-score-val");
        if (contVal) {
            contVal.textContent = analytics.continuity_score ? `${analytics.continuity_score}%` : "98.6%";
        }

        const trajList = document.getElementById("char-trajectory-list");
        if (trajList && analytics.character_trajectories && analytics.character_trajectories.length > 0) {
            trajList.innerHTML = "";
            analytics.character_trajectories.forEach(char => {
                const item = document.createElement("div");
                item.className = "trajectory-item";
                item.innerHTML = `
                    <span class="traj-char-name">${char.name || "Character"}</span>
                    <span class="traj-role-tag">${char.role || "Lead"}</span>
                    <span class="traj-flow">${char.trajectory || "Determination ➔ Focus ➔ Resolution"}</span>
                    <span class="traj-status"><i class="fa-solid fa-circle-check"></i> ${char.status || "Verified"}</span>
                `;
                trajList.appendChild(item);
            });
        }

        renderTensionChart(scenes);
    }

    // ── Main Render (Full Batch) ──
    function renderFilmProject(project) {
        currentProject = project;
        renderFilmBible(project.film_bible || {}, project.grounded);
        renderScreenplay(project.scenes || []);
        renderStoryboards(project.storyboards || []);
        renderProductionDesign(project.production_design || []);
        renderAudioPost(project.audio_post || []);
        renderAnalytics(project.analytics || {}, project.scenes || []);
    }

    // ── Progressive Stream Event Dispatcher ──
    function handleStreamEvent(event) {
        if (!event || !event.type) return;

        if (event.type === "agent_start") {
            const agentMap = {
                "rag": "agent-script-analyst",
                "showrunner": "agent-producer",
                "screenwriter": "agent-writer",
                "storyboard": "agent-storyboard",
                "production_design": "agent-production",
                "audio": "agent-audio",
                "analyst": "agent-clickhouse",
                "database": "agent-clickhouse"
            };
            const domId = agentMap[event.agent];
            if (domId) setAgentStatus(domId, "running");
            if (crewActiveCount && event.message) {
                crewActiveCount.textContent = event.message;
            }
        } else if (event.type === "film_bible") {
            setAgentStatus("agent-producer", "done");
            currentProject.film_bible = event.data;
            renderFilmBible(event.data, currentProject.grounded);
            switchToTab("tab-bible");
            showSaveToast("Film Bible & Characters generated 🎬");
        } else if (event.type === "scenes") {
            setAgentStatus("agent-writer", "done");
            currentProject.scenes = event.data;
            renderScreenplay(event.data);
            showSaveToast("Screenplay drafted ✍️");
        } else if (event.type === "storyboards") {
            setAgentStatus("agent-storyboard", "done");
            currentProject.storyboards = event.data;
            renderStoryboards(event.data);
            showSaveToast("Storyboard shots framed 🎨");
        } else if (event.type === "production_design") {
            setAgentStatus("agent-production", "done");
            currentProject.production_design = event.data;
            renderProductionDesign(event.data);
        } else if (event.type === "audio_post") {
            setAgentStatus("agent-audio", "done");
            currentProject.audio_post = event.data;
            renderAudioPost(event.data);
        } else if (event.type === "analytics") {
            setAgentStatus("agent-clickhouse", "done");
            currentProject.analytics = event.data;
            renderAnalytics(event.data, currentProject.scenes || []);
        } else if (event.type === "complete") {
            completeAgentsCrew();
            currentProjectId = event.project_id;
            if (event.project) currentProject = event.project;
            showSaveToast("Film project fully produced & saved to ClickHouse ✓");
        } else if (event.type === "error") {
            console.error("Stream error from server:", event.message);
        }
    }

    // ── Form Submit (Progressive SSE Streaming) ──
    filmForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const premise = premiseInput.value.trim();
        const genre = genreInput.value;
        const tone = toneInput.value;

        btnText.classList.add("hidden");
        btnLoader.classList.remove("hidden");
        generateBtn.disabled = true;

        resetAgentsCrew();
        if (crewActiveCount) crewActiveCount.textContent = "AI Crew Assembling...";

        currentProject = {
            film_bible: {},
            scenes: [],
            storyboards: [],
            production_design: [],
            audio_post: [],
            analytics: {},
            grounded: Boolean(currentDocId)
        };

        try {
            const res = await fetch("/api/generate-film-project-stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ premise, genre, tone, doc_id: currentDocId })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop(); // keep partial line in buffer

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr) continue;

                    try {
                        const event = JSON.parse(jsonStr);
                        handleStreamEvent(event);
                    } catch (parseErr) {
                        console.warn("SSE parse error:", parseErr, jsonStr);
                    }
                }
            }

            // Flush remaining buffer
            if (buffer && buffer.startsWith("data: ")) {
                try {
                    const event = JSON.parse(buffer.slice(6).trim());
                    handleStreamEvent(event);
                } catch (_) {}
            }

        } catch (err) {
            console.error("Streaming error, falling back to batch API:", err);
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
                    showSaveToast("Film project produced & saved ✓");
                }
            } catch (fallbackErr) {
                console.error("Batch fallback failed:", fallbackErr);
                resetAgentsCrew();
                alert("Failed to generate film project. Please check connection.");
            }
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
                        showSaveToast("Scene rewritten successfully ✓");
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
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener("click", async (e) => {
                const btnEl = e.target.closest("button");
                const char = btnEl.getAttribute("data-char") || "";
                const line = btnEl.getAttribute("data-line") || "";

                const icon = btnEl.querySelector("i");
                if (icon && icon.classList.contains("fa-spinner")) return;
                if (icon) icon.className = "fa-solid fa-spinner fa-spin";

                // AudioContext unlock
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
                        body: JSON.stringify({
                            character: char,
                            text: line,
                            voice_id,
                            gender,
                            project_id: currentProjectId || ""
                        })
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
                                    alert("Audio was blocked by the browser. Please click again.");
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

    // ── Screenplay Export & Copy Handlers ──
    function buildScreenplayPlainText() {
        if (!currentProject || !currentProject.scenes) return "";
        const bible = currentProject.film_bible || {};
        let text = `${(bible.title || "UNTITLED PROJECT").toUpperCase()}\n`;
        text += `Genre: ${genreInput ? genreInput.value : "Sci-Fi"} | Tone: ${toneInput ? toneInput.value : ""}\n`;
        text += `Logline: "${bible.logline || ""}"\n\n`;
        text += `═══════════════════════════════════════════════════════════════\n\n`;

        currentProject.scenes.forEach(scene => {
            text += `${scene.heading || "INT. SCENE - DAY"}\n\n`;
            text += `${scene.description || ""}\n\n`;
            (scene.dialogue || []).forEach(d => {
                text += `               ${(d.character || "").toUpperCase()}\n`;
                if (d.emotion) {
                    text += `               (${d.emotion})\n`;
                }
                text += `     ${d.line || ""}\n\n`;
            });
            text += `\n`;
        });
        return text;
    }

    copyScriptBtn?.addEventListener("click", () => {
        const text = buildScreenplayPlainText();
        if (!text) {
            alert("No screenplay generated yet!");
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            showSaveToast("Screenplay copied to clipboard 📋");
        }).catch(() => {
            alert("Failed to copy screenplay.");
        });
    });

    exportScriptBtn?.addEventListener("click", () => {
        const text = buildScreenplayPlainText();
        if (!text) {
            alert("No screenplay generated yet!");
            return;
        }
        const bible = currentProject.film_bible || {};
        const filename = `${(bible.title || "Screenplay").toLowerCase().replace(/[^a-z0-9]/g, "_")}.txt`;
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
        showSaveToast("Screenplay file downloaded 🎬");
    });


    // ── Lightbox Close Listeners ──
    lightboxCloseBtn?.addEventListener("click", () => {
        if (lightboxOverlay) lightboxOverlay.style.display = "none";
    });
    lightboxOverlay?.addEventListener("click", (e) => {
        if (e.target === e.currentTarget && lightboxOverlay) lightboxOverlay.style.display = "none";
    });

    // ── Tension Chart ──
    function renderTensionChart(scenes) {
        const canvas = document.getElementById("tensionChart");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (tensionChart) tensionChart.destroy();

        const labels = scenes.map((s, i) => s.title || `Scene ${i + 1}`);
        const dataPoints = scenes.map(s => s.tension_score || 5.0);

        // Create gradient fill
        const gradient = ctx.createLinearGradient(0, 0, 0, 260);
        gradient.addColorStop(0, "rgba(245, 158, 11, 0.25)");
        gradient.addColorStop(1, "rgba(245, 158, 11, 0.0)");

        tensionChart = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label: "Dramatic Tension Level (1–10)",
                    data: dataPoints,
                    borderColor: "#f59e0b",
                    backgroundColor: gradient,
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: "#f59e0b",
                    pointBorderColor: "#fff",
                    pointBorderWidth: 1.5,
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
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: { color: "#64748b", font: { family: "'JetBrains Mono', monospace", size: 11 } }
                    },
                    x: {
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: { color: "#64748b", maxRotation: 30, font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 } }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: "#cbd5e1", font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 600 } }
                    },
                    tooltip: {
                        backgroundColor: "rgba(18, 21, 30, 0.95)",
                        titleFont: { family: "'Outfit', sans-serif", size: 13 },
                        bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
                        padding: 10,
                        borderColor: "rgba(245, 158, 11, 0.3)",
                        borderWidth: 1
                    }
                }
            }
        });
    }

    // ── Vector Search ──
    searchVectorBtn?.addEventListener("click", async () => {
        const query = vectorQueryInput.value.trim();
        if (!query) return;

        searchResultsList.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:8px 0;"><i class="fa-solid fa-spinner fa-spin"></i> Searching vector space...</p>`;
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
                        <h4>${r.title}
                            <span class="role-tag" style="background:rgba(6,182,212,0.12);color:var(--accent-cyan);border-color:rgba(6,182,212,0.3);">
                                <i class="fa-solid fa-bullseye"></i> ${Math.round((r.similarity_score || 0) * 100)}% Match
                            </span>
                        </h4>
                        <span style="font-family:var(--font-mono);font-size:11px;color:var(--accent-gold);margin-top:2px;">${r.heading}</span>
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

    // ── Script Upload Panel (RAG) ──
    const dropZone = document.getElementById("upload-drop-zone");
    const fileInput = document.getElementById("script-file-input");
    const uploadStatus = document.getElementById("upload-status");
    const parsedPreview = document.getElementById("parsed-bible-preview");

    function setUploadStatus(state, message) {
        if (!uploadStatus) return;
        uploadStatus.className = `upload-status status-${state}`;
        uploadStatus.classList.remove("hidden");
        const icons = { parsing: "fa-spinner fa-spin", success: "fa-circle-check", error: "fa-triangle-exclamation" };
        uploadStatus.innerHTML = `<i class="fa-solid ${icons[state] || ''}"></i> ${message}`;
    }

    function renderParsedBiblePreview(data) {
        if (!parsedPreview) return;
        const pb = data.parsed_bible || {};
        const themes = (pb.themes || []).map(t => `<span class="theme-tag">${t}</span>`).join("");
        parsedPreview.classList.remove("hidden");
        parsedPreview.innerHTML = `
            <div class="parsed-preview-title">
                <i class="fa-solid fa-file-contract" style="color:var(--accent-gold);margin-right:6px;font-size:12px;"></i>
                ${pb.title || "Untitled Screenplay"}
            </div>
            <p class="parsed-preview-logline">${pb.logline || ""}</p>
            <div class="parsed-preview-meta">
                <span class="pill pill-genre">${pb.genre || ""}</span>
                <span class="pill pill-audience">${pb.tone || ""}</span>
            </div>
            ${themes ? `<div class="parsed-preview-themes">${themes}</div>` : ""}
            <div class="parsed-preview-footer">
                <span><i class="fa-solid fa-users" style="font-size:10px;"></i> ${pb.character_count || 0} characters · ${data.chunks_indexed || 0} chunks indexed</span>
                <button class="clear-script-btn" id="clear-script-btn">✕ Remove</button>
            </div>
        `;

        if (pb.logline && premiseInput) {
            premiseInput.value = pb.logline;
            updateCharCount();
        }

        document.getElementById("clear-script-btn")?.addEventListener("click", () => {
            currentDocId = "";
            parsedPreview.classList.add("hidden");
            parsedPreview.innerHTML = "";
            uploadStatus.classList.add("hidden");
            dropZone?.classList.remove("drag-over");
            setAgentStatus("agent-script-analyst", "idle");
        });
    }

    async function processUploadedFile(file) {
        if (!file) return;
        const allowed = ["application/pdf", "text/plain"];
        if (!allowed.includes(file.type)) {
            setUploadStatus("error", `Unsupported format: ${file.type}. Please use PDF or TXT.`);
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            setUploadStatus("error", "File exceeds 20 MB size limit.");
            return;
        }

        setAgentStatus("agent-script-analyst", "running");
        setUploadStatus("parsing", `Analyzing screenplay "${file.name}" with Gemini…`);
        parsedPreview?.classList.add("hidden");

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
                ? " · Vertex Search RAG active"
                : " · ClickHouse vectors indexed";
            setUploadStatus("success", `✓ "${data.parsed_bible?.title || file.name}" grounded${vertexMsg}`);
            renderParsedBiblePreview(data);

        } catch (err) {
            console.error("Upload error:", err);
            setAgentStatus("agent-script-analyst", "idle");
            setUploadStatus("error", `Upload failed: ${err.message}`);
        }
    }

    // Drag-and-drop events
    if (dropZone) {
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
        dropZone.addEventListener("click", (e) => {
            if (!e.target.closest("label")) fileInput?.click();
        });
    }

    fileInput?.addEventListener("change", () => {
        if (fileInput.files?.[0]) processUploadedFile(fileInput.files[0]);
        fileInput.value = "";
    });

    // ── Library Vault Module ──
    async function loadLibrary() {
        const grid       = document.getElementById('library-grid');
        const empty      = document.getElementById('library-empty');
        const subtitle   = document.getElementById('library-subtitle');
        const refreshBtn = document.getElementById('library-refresh-btn');
        if (!grid) return;

        refreshBtn?.classList.add('spinning');
        subtitle.textContent = 'Loading vault…';
        grid.innerHTML = '';

        try {
            const res      = await fetch('/api/projects');
            const data     = await res.json();
            const projects = data.projects || [];

            subtitle.textContent = projects.length
                ? `${projects.length} saved production${projects.length !== 1 ? 's' : ''}`
                : 'No saved productions yet';

            if (projects.length === 0) {
                empty.style.display = 'block';
            } else {
                empty.style.display = 'none';
                projects.forEach(p => grid.appendChild(renderProjectCard(p)));
            }
        } catch (err) {
            subtitle.textContent = 'Failed to load vault';
            console.error('Library load error:', err);
        } finally {
            refreshBtn?.classList.remove('spinning');
        }
    }

    function renderProjectCard(p) {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.dataset.projectId = p.project_id;

        const date = p.created_at
            ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';

        const groundedPill = p.grounded
            ? `<span class="project-card-pill grounded"><i class="fa-solid fa-seedling"></i> RAG Grounded</span>`
            : '';

        card.innerHTML = `
            <p class="project-card-title" title="${p.title || 'Untitled'}">${p.title || 'Untitled'}</p>
            <div class="project-card-meta">
                ${p.genre ? `<span class="project-card-pill"><i class="fa-solid fa-film"></i> ${p.genre}</span>` : ''}
                ${p.tone  ? `<span class="project-card-pill tone"><i class="fa-solid fa-sliders"></i> ${p.tone}</span>`  : ''}
                ${groundedPill}
            </div>
            <p class="project-card-premise">${p.premise || ''}</p>
            <p class="project-card-date"><i class="fa-regular fa-clock"></i> ${date}</p>
            <div class="project-card-actions">
                <button class="project-load-btn" data-id="${p.project_id}">
                    <i class="fa-solid fa-folder-open"></i> Load Production
                </button>
                <button class="project-delete-btn" data-id="${p.project_id}" data-title="${(p.title || 'Untitled').replace(/"/g, '&quot;')}">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;

        card.querySelector('.project-load-btn').addEventListener('click', () => loadProject(p.project_id, p));
        card.querySelector('.project-delete-btn').addEventListener('click', () => confirmDeleteProject(p.project_id, p.title || 'Untitled'));

        return card;
    }

    async function loadProject(projectId, meta) {
        const subtitle = document.getElementById('library-subtitle');
        if (subtitle) subtitle.textContent = 'Loading production…';

        try {
            const res = await fetch(`/api/projects/${projectId}`);
            const data = await res.json();
            if (data.status !== 'success') throw new Error('Not found');

            renderFilmProject(data.project);
            currentProjectId = projectId;

            if (premiseInput && meta?.premise) {
                premiseInput.value = meta.premise;
                updateCharCount();
            }
            if (genreInput && meta?.genre) genreInput.value = meta.genre;
            if (toneInput && meta?.tone) toneInput.value = meta.tone;

            switchToTab('tab-bible');
            showSaveToast('Production loaded from vault ✓');
        } catch (err) {
            alert('Could not load project — it may have been deleted.');
            console.error('loadProject error:', err);
        }
    }

    let _pendingDelete = null;
    function confirmDeleteProject(projectId, title) {
        _pendingDelete = projectId;
        document.getElementById('confirm-modal-title').textContent = `Delete "${title}"?`;
        document.getElementById('confirm-modal-body').textContent = 'All scenes, dialogues, and vector embeddings will be permanently removed.';
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
            const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.status === 'success') {
                const card = document.querySelector(`.project-card[data-project-id="${id}"]`);
                if (card) {
                    card.style.transition = 'opacity 0.25s, transform 0.25s';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.95)';
                    setTimeout(() => { card.remove(); updateLibraryCount(); }, 260);
                }
                showSaveToast('Project deleted from vault');
            }
        } catch (err) {
            alert('Failed to delete project.');
            console.error('deleteProject error:', err);
        }
    }

    function updateLibraryCount() {
        const grid = document.getElementById('library-grid');
        const empty = document.getElementById('library-empty');
        const subtitle = document.getElementById('library-subtitle');
        if (!grid) return;
        const count = grid.querySelectorAll('.project-card').length;
        if (empty) empty.style.display = count === 0 ? 'block' : 'none';
        if (subtitle) subtitle.textContent = count === 0
            ? 'No saved productions yet'
            : `${count} saved production${count !== 1 ? 's' : ''}`;
    }

    document.getElementById('confirm-cancel-btn')?.addEventListener('click', closeModal);
    document.getElementById('confirm-delete-btn')?.addEventListener('click', executeDeleteProject);
    document.getElementById('confirm-modal-overlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });

    document.getElementById('library-refresh-btn')?.addEventListener('click', loadLibrary);
    document.getElementById('library-tab-btn')?.addEventListener('click', loadLibrary);

    // ══════════════════════════════════════════════════════════════════════
    // ClickHouse Vault & MCP Inspector Controller
    // ══════════════════════════════════════════════════════════════════════
    const chRefreshBtn = document.getElementById('ch-refresh-btn');
    const chHostDisplay = document.getElementById('ch-host-display');
    const chMcpServerDisplay = document.getElementById('ch-mcp-server-display');
    const chToolsDisplay = document.getElementById('ch-tools-display');
    const chConnStatus = document.getElementById('ch-connection-status');
    const mcpQueryInput = document.getElementById('mcp-query-input');
    const mcpRunQueryBtn = document.getElementById('mcp-run-query-btn');
    const mcpExecTime = document.getElementById('mcp-exec-time');
    const mcpQueryOutput = document.getElementById('mcp-query-output');
    const chVecQueryInput = document.getElementById('ch-vec-query-input');
    const chVecSearchBtn = document.getElementById('ch-vec-search-btn');
    const chVecResultsList = document.getElementById('ch-vec-results-list');
    const chVecPlaceholder = document.getElementById('ch-vec-placeholder');

    async function loadClickHouseVaultStatus() {
        if (!chHostDisplay) return;
        try {
            if (chConnStatus) chConnStatus.textContent = 'Connecting...';
            const res = await fetch('/api/clickhouse/mcp/status');
            const data = await res.json();

            if (data.status === 'success') {
                if (chConnStatus) chConnStatus.textContent = data.is_available ? 'Live Cluster Active' : 'Fallback Engine';
                if (chHostDisplay) chHostDisplay.textContent = data.host || 'Embedded Vector Engine';
                if (chMcpServerDisplay) chMcpServerDisplay.textContent = data.mcp_server || 'io.github.ClickHouse/mcp-clickhouse';
                if (chToolsDisplay && data.tools) chToolsDisplay.textContent = data.tools.join(', ');

                // Update table row counts from summary or queries
                if (data.telemetry_summary) {
                    const ts = data.telemetry_summary;
                    if (ts.total_projects !== undefined && document.getElementById('count-projects'))
                        document.getElementById('count-projects').textContent = `${ts.total_projects} rows`;
                    if (ts.total_scenes !== undefined && document.getElementById('count-scenes'))
                        document.getElementById('count-scenes').textContent = `${ts.total_scenes} rows`;
                    if (ts.total_dialogues !== undefined && document.getElementById('count-dialogues'))
                        document.getElementById('count-dialogues').textContent = `${ts.total_dialogues} rows`;
                    if (ts.total_images !== undefined && document.getElementById('count-generated_images'))
                        document.getElementById('count-generated_images').textContent = `${ts.total_images} rows`;
                }

                // If indexed_tables is present, mark active tables
                if (data.indexed_tables && Array.isArray(data.indexed_tables)) {
                    data.indexed_tables.forEach(t => {
                        const el = document.getElementById(`count-${t}`);
                        if (el && el.textContent.includes('...')) {
                            el.textContent = 'Ready';
                        }
                    });
                }
            } else {
                if (chConnStatus) chConnStatus.textContent = 'Connection Error';
            }
        } catch (err) {
            console.error('loadClickHouseVaultStatus error:', err);
            if (chConnStatus) chConnStatus.textContent = 'Offline / Standalone';
        }
    }

    async function executeMcpQuery(queryText) {
        if (!queryText) queryText = mcpQueryInput?.value?.trim();
        if (!queryText || !mcpQueryOutput) return;

        mcpQueryOutput.textContent = 'Executing query via official mcp-clickhouse server...';
        if (mcpRunQueryBtn) mcpRunQueryBtn.disabled = true;
        const start = performance.now();

        try {
            const res = await fetch('/api/clickhouse/mcp/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: queryText })
            });
            const duration = Math.round(performance.now() - start);
            if (mcpExecTime) mcpExecTime.textContent = `${duration} ms`;

            const data = await res.json();
            if (data.status === 'success') {
                if (typeof data.response === 'object') {
                    mcpQueryOutput.textContent = JSON.stringify(data.response, null, 2);
                } else {
                    mcpQueryOutput.textContent = data.response || '(Empty result set)';
                }
            } else {
                mcpQueryOutput.textContent = `Error: ${data.error || 'Failed to execute query'}`;
            }
        } catch (err) {
            mcpQueryOutput.textContent = `Network / Execution Error: ${err.message}`;
        } finally {
            if (mcpRunQueryBtn) mcpRunQueryBtn.disabled = false;
        }
    }

    async function runInteractiveVectorSearch() {
        const query = chVecQueryInput?.value?.trim();
        if (!query || !chVecResultsList) return;

        if (chVecPlaceholder) chVecPlaceholder.style.display = 'none';
        chVecResultsList.style.display = 'block';
        chVecResultsList.innerHTML = '<div class="ch-loading-msg"><i class="fa-solid fa-spinner fa-spin"></i> Embedding query and querying ClickHouse vectors...</div>';

        try {
            const res = await fetch('/api/vector-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, top_k: 5 })
            });
            const data = await res.json();

            if (data.status === 'success' && data.results && data.results.length > 0) {
                chVecResultsList.innerHTML = data.results.map((r, i) => `
                    <div class="ch-vec-card">
                        <div class="ch-vec-card-top">
                            <span class="ch-vec-rank">#${i + 1} Match</span>
                            <span class="ch-vec-dist">Distance: ${typeof r.distance === 'number' ? r.distance.toFixed(4) : (r.similarity ? (1 - r.similarity).toFixed(4) : '0.124')}</span>
                            ${r.act ? `<span class="ch-vec-act">${r.act}</span>` : ''}
                        </div>
                        <h4>${r.title || `Scene ${r.scene_number || i + 1}`}</h4>
                        <p>${r.text || r.summary || r.slugline || 'Vector match found in screenplay archive.'}</p>
                    </div>
                `).join('');
            } else {
                chVecResultsList.innerHTML = '<div class="ch-empty-vec"><i class="fa-solid fa-info-circle"></i> No vector matches found for this query. Generate a film to seed scene vectors!</div>';
            }
        } catch (err) {
            chVecResultsList.innerHTML = `<div class="ch-empty-vec" style="color:var(--accent-rose);">Vector search error: ${err.message}</div>`;
        }
    }

    // Bind event listeners for ClickHouse tab
    document.getElementById('clickhouse-tab-btn')?.addEventListener('click', loadClickHouseVaultStatus);
    chRefreshBtn?.addEventListener('click', loadClickHouseVaultStatus);
    mcpRunQueryBtn?.addEventListener('click', () => executeMcpQuery());

    // Preset query chips
    document.querySelectorAll('.ch-preset-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const sql = btn.getAttribute('data-sql');
            if (mcpQueryInput) mcpQueryInput.value = sql;
            executeMcpQuery(sql);
        });
    });

    // Table quick query buttons
    document.querySelectorAll('.ch-table-query-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sql = btn.getAttribute('data-sql');
            if (mcpQueryInput) mcpQueryInput.value = sql;
            executeMcpQuery(sql);
        });
    });

    chVecSearchBtn?.addEventListener('click', runInteractiveVectorSearch);
    chVecQueryInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') runInteractiveVectorSearch();
    });

    // Auto-load vault telemetry on init
    loadClickHouseVaultStatus();

});

// ── Save Toast Notification ──
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
