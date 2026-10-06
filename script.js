const SUPABASE_URL = "https://zsqczxusrbpkqgbaxkfc.supabase.co";
const SUPABASE_KEY = "sb_publishable_lYlYbU-TqBNt7MBlDN4lLw_tEh6IOi6";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const videoGrid = document.querySelector("#video-grid");
const loadError = document.querySelector("#load-error");
const addDialog = document.querySelector("#add-dialog");
const collectionDialog = document.querySelector("#collection-dialog");
const membershipDialog = document.querySelector("#membership-dialog");
const playerDialog = document.querySelector("#player-dialog");
const uploadForm = document.querySelector("#upload-form");
const uploadButton = document.querySelector("#upload-button");
const uploadFileInput = document.querySelector("#upload-file");
const uploadTitleInput = document.querySelector("#upload-title-input");
const uploadProgress = document.querySelector("#upload-progress");
const uploadProgressText = document.querySelector("#upload-progress-text");
const uploadStatus = document.querySelector("#upload-status");
const uploadError = document.querySelector("#upload-error");
const uploadResult = document.querySelector("#upload-result");
const uploadResultLink = document.querySelector("#upload-result-link");

const addForm = document.querySelector("#add-form");
const formError = document.querySelector("#form-error");

const collectionForm = document.querySelector("#collection-form");
const collectionError = document.querySelector("#collection-error");

const membershipForm = document.querySelector("#membership-form");
const membershipError = document.querySelector("#membership-error");

const contextMenu = document.querySelector("#video-context-menu");
const collectionContextMenu = document.querySelector("#collection-context-menu");
const playerAddCollectionButton = document.querySelector("#player-add-collection");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#site-search");
const searchClear = document.querySelector("#search-clear");
const mobileSearchButton = document.querySelector("#mobile-search-button");
const siteHeader = document.querySelector(".site-header");
const sortStatus = document.createElement("span");

let videos = [];
let collections = [];
let searchQuery = "";
const videoThumbnailCache = new Map();
let activeHlsPlayer = null;

const thumbnailObserver =
    "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;

                    thumbnailObserver.unobserve(entry.target);
                    loadVideoThumbnail(
                        entry.target,
                        entry.target.dataset.thumbnailType,
                        entry.target.dataset.thumbnailUrl
                    );
                });
            },
            { rootMargin: "160px" }
        )
        : null;

let activeVideoId = null;
let activeCollectionId = null;
let activeContextCollectionId = null;
let editingVideoId = null;
let editingCollectionId = null;
let membershipVideoId = null;
let activePlayerVideo = null;
let resumeMembershipAfterCollection = false;

let currentView =
    location.hash === "#collections"
        ? "collections"
        : location.hash === "#about"
        ? "about"
        : location.hash === "#upload"
        ? "upload"
        : "home";


/* =========================================================
   SUPABASE
========================================================= */

async function loadData() {
    try {
        const [
            { data: videoData, error: videoError },
            { data: collectionData, error: collectionQueryError }
        ] = await Promise.all([
            supabaseClient
                .from("videos")
                .select("*"),

            supabaseClient
                .from("collections")
                .select("*")
        ]);

        if (videoError) {
            console.error("Gagal mengambil video:", videoError);
            loadError.textContent =
                "Gagal mengambil data video dari server.";
            loadError.hidden = false;
            return;
        }

        if (collectionQueryError) {
            console.error("Gagal mengambil koleksi:", collectionQueryError);
            loadError.textContent =
                "Gagal mengambil data koleksi dari server.";
            loadError.hidden = false;
            return;
        }

        videos = (videoData || []).map((video) => ({
            id: video.id,
            title: video.title,
            url: video.url,
            plays: Number(video.plays) || 0,
            collectionIds: Array.isArray(video.collection_ids)
                ? video.collection_ids
                : []
        }));

        collections = (collectionData || []).map((collection) => ({
            id: collection.id,
            title: collection.title
        }));

        renderVideos();
    } catch (error) {
        console.error("Kesalahan saat memuat data:", error);
        loadError.textContent =
            "Gagal memuat data dari server. Periksa koneksi lalu muat ulang halaman.";
        loadError.hidden = false;
    }
}


/* =========================================================
   VIDEO DATABASE
========================================================= */

async function insertVideo(video) {
    const { error } = await supabaseClient
        .from("videos")
        .insert({
            id: video.id,
            title: video.title,
            url: video.url,
            plays: video.plays,
            collection_ids: video.collectionIds
        });

    if (error) {
        console.error("Gagal menambahkan video:", error);
        throw error;
    }
}


async function updateVideo(video) {
    const { error } = await supabaseClient
        .from("videos")
        .update({
            title: video.title,
            url: video.url,
            plays: video.plays,
            collection_ids: video.collectionIds
        })
        .eq("id", video.id);

    if (error) {
        console.error("Gagal memperbarui video:", error);
        throw error;
    }
}


async function deleteVideo(videoId) {
    const { error } = await supabaseClient
        .from("videos")
        .delete()
        .eq("id", videoId);

    if (error) {
        console.error("Gagal menghapus video:", error);
        throw error;
    }
}


/* =========================================================
   COLLECTION DATABASE
========================================================= */

async function insertCollection(collection) {
    const { error } = await supabaseClient
        .from("collections")
        .insert({
            id: collection.id,
            title: collection.title
        });

    if (error) {
        console.error("Gagal menambahkan koleksi:", error);
        throw error;
    }
}


async function updateCollection(collection) {
    const { error } = await supabaseClient
        .from("collections")
        .update({ title: collection.title })
        .eq("id", collection.id);

    if (error) {
        console.error("Gagal memperbarui koleksi:", error);
        throw error;
    }
}


async function updateVideoCollections(videoId, collectionIds) {
    const { error } = await supabaseClient
        .from("videos")
        .update({ collection_ids: collectionIds })
        .eq("id", videoId);

    if (error) {
        console.error("Gagal memperbarui koleksi video:", error);
        throw error;
    }
}


async function deleteCollectionRecord(collectionId) {
    const { error } = await supabaseClient
        .from("collections")
        .delete()
        .eq("id", collectionId);

    if (error) {
        console.error("Gagal menghapus koleksi:", error);
        throw error;
    }
}


/* =========================================================
   VIDEO INFO
========================================================= */

function getVideoInfo(rawUrl) {
    const url = new URL(rawUrl);

    const host = url.hostname
        .replace(/^www\./, "")
        .toLowerCase();

    let embedUrl = url.href;
    let kind = "embed";
    let thumbnail = "";
    let thumbnailType = "";

    if (
        host === "youtu.be" ||
        host.endsWith("youtube.com")
    ) {
        const id =
            host === "youtu.be"
                ? url.pathname.slice(1).split("/")[0]
                : url.searchParams.get("v") ||
                  url.pathname.match(
                      /\/(?:embed|shorts)\/([^/?]+)/
                  )?.[1];

        if (id) {
            kind = "embed";

            embedUrl =
                `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;

            thumbnail =
                `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
        }
    }

    else if (
        host === "vimeo.com" ||
        host.endsWith("vimeo.com")
    ) {
        const id = url.pathname.match(/\/(\d+)/)?.[1];

        if (id) {
            embedUrl =
                `https://player.vimeo.com/video/${id}`;
            thumbnailType = "vimeo";
        }
    }

    else if (
        /\.m3u8$/i.test(url.pathname)
    ) {
        kind = "hls";
        thumbnailType = "hls";
    }

    else if (
        /\.(mp4|webm|ogg|mov|m4v)$/i.test(
            url.pathname
        )
    ) {
        kind = "file";
        thumbnailType = "file";
    }

    return {
        url: url.href,
        embedUrl,
        kind,
        thumbnail,
        thumbnailType,
        host
    };
}


async function generateHlsThumbnail(url) {
    const video = document.createElement("video");

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.style.cssText =
        "position:fixed;left:-10000px;top:0;width:320px;height:180px;opacity:0;pointer-events:none";

    document.body.append(video);

    let hls = null;

    try {
        const frameReady = new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => finish(reject, new Error("HLS frame timed out")),
                12000
            );

            const finish = (callback, value) => {
                clearTimeout(timeout);
                video.removeEventListener("loadeddata", onLoaded);
                video.removeEventListener("error", onError);
                callback(value);
            };

            const onLoaded = () => {
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => finish(resolve))
                );
            };

            const onError = () =>
                finish(reject, new Error("HLS frame could not load"));

            video.addEventListener("loadeddata", onLoaded, { once: true });
            video.addEventListener("error", onError, { once: true });
        });

        if (window.Hls?.isSupported()) {
            hls = new window.Hls({ maxBufferLength: 8 });
            hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });
            hls.loadSource(url);
            hls.attachMedia(video);
        } else if (
            video.canPlayType("application/vnd.apple.mpegurl")
        ) {
            video.src = url;
            video.play().catch(() => {});
        } else {
            return null;
        }

        await frameReady;

        const width = 480;
        const aspectRatio =
            video.videoWidth && video.videoHeight
                ? video.videoWidth / video.videoHeight
                : 16 / 9;
        const canvas = document.createElement("canvas");

        canvas.width = width;
        canvas.height = Math.round(width / aspectRatio);
        canvas
            .getContext("2d")
            .drawImage(video, 0, 0, canvas.width, canvas.height);

        return canvas.toDataURL("image/jpeg", 0.78);
    } catch (error) {
        console.warn("Tidak dapat membuat thumbnail HLS:", error);
        return null;
    } finally {
        hls?.destroy();
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
    }
}


async function generateVideoFileThumbnail(url) {
    const video = document.createElement("video");

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.style.cssText =
        "position:fixed;left:-10000px;top:0;width:320px;height:180px;opacity:0;pointer-events:none";

    document.body.append(video);

    try {
        const metadataReady = new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => finish(reject, new Error("Video metadata timed out")),
                12000
            );

            const finish = (callback, value) => {
                clearTimeout(timeout);
                video.removeEventListener("loadedmetadata", onLoaded);
                video.removeEventListener("error", onError);
                callback(value);
            };

            const onLoaded = () => finish(resolve);
            const onError = () =>
                finish(reject, new Error("Video metadata could not load"));

            video.addEventListener("loadedmetadata", onLoaded, { once: true });
            video.addEventListener("error", onError, { once: true });
        });

        video.src = url;
        video.load();
        await metadataReady;

        const targetTime =
            Number.isFinite(video.duration) && video.duration > 1
                ? 1
                : 0;

        if (targetTime > 0) {
            const frameReady = new Promise((resolve, reject) => {
                const timeout = setTimeout(
                    () => finish(reject, new Error("Video frame timed out")),
                    12000
                );

                const finish = (callback, value) => {
                    clearTimeout(timeout);
                    video.removeEventListener("seeked", onLoaded);
                    video.removeEventListener("error", onError);
                    callback(value);
                };

                const onLoaded = () => finish(resolve);
                const onError = () =>
                    finish(reject, new Error("Video frame could not load"));

                video.addEventListener("seeked", onLoaded, { once: true });
                video.addEventListener("error", onError, { once: true });
            });

            video.currentTime = targetTime;
            await frameReady;
        } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(
                    () => finish(reject, new Error("Video frame timed out")),
                    12000
                );

                const finish = (callback, value) => {
                    clearTimeout(timeout);
                    video.removeEventListener("loadeddata", onLoaded);
                    video.removeEventListener("error", onError);
                    callback(value);
                };

                const onLoaded = () => finish(resolve);
                const onError = () =>
                    finish(reject, new Error("Video frame could not load"));

                video.addEventListener("loadeddata", onLoaded, { once: true });
                video.addEventListener("error", onError, { once: true });
            });
        }

        return createVideoThumbnail(video);
    } catch (error) {
        console.warn("Tidak dapat membuat thumbnail video:", error);
        return null;
    } finally {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
    }
}


function createVideoThumbnail(video) {
    const width = 480;
    const aspectRatio =
        video.videoWidth && video.videoHeight
            ? video.videoWidth / video.videoHeight
            : 16 / 9;
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = Math.round(width / aspectRatio);

    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Canvas context is unavailable");
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
}


async function generateVimeoThumbnail(url) {
    try {
        const response = await fetch(
            `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`
        );

        if (!response.ok) {
            throw new Error(`Vimeo oEmbed returned ${response.status}`);
        }

        const data = await response.json();
        return data.thumbnail_url || null;
    } catch (error) {
        console.warn("Tidak dapat memuat thumbnail Vimeo:", error);
        return null;
    }
}


function loadVideoThumbnail(poster, type, url) {
    if (!url) return;

    const cacheKey = `${type}:${url}`;
    if (!videoThumbnailCache.has(cacheKey)) {
        const generator =
            type === "hls"
                ? generateHlsThumbnail
                : type === "vimeo"
                ? generateVimeoThumbnail
                : generateVideoFileThumbnail;

        videoThumbnailCache.set(cacheKey, generator(url));
    }

    videoThumbnailCache.get(cacheKey).then((thumbnail) => {
        if (!thumbnail || !poster.isConnected) return;

        const image = document.createElement("img");
        image.src = thumbnail;
        image.alt = "";
        image.loading = "lazy";
        image.onerror = () => {
            image.remove();
            poster.classList.remove("has-thumbnail");
        };
        poster.classList.add("has-thumbnail");
        poster.prepend(image);
    });
}


/* =========================================================
   VIDEO CARD
========================================================= */

function createPoster(video, index, label, onClick) {
    const info = getVideoInfo(video.url);

    const poster = document.createElement("button");

    poster.className =
        `video-poster poster-${index % 5}`;

    poster.type = "button";

    poster.setAttribute(
        "aria-label",
        label
    );

    if (info.thumbnail) {
        const image = document.createElement("img");

        image.src = info.thumbnail;
        image.alt = "";
        image.loading = "lazy";

        image.onerror = () => {
            image.remove();
            poster.classList.remove("has-thumbnail");
        };

        poster.classList.add("has-thumbnail");
        poster.append(image);
    }

    if (info.thumbnailType) {
        poster.dataset.thumbnailType = info.thumbnailType;
        poster.dataset.thumbnailUrl = info.url;

        if (thumbnailObserver) {
            thumbnailObserver.observe(poster);
        } else {
            loadVideoThumbnail(poster, info.thumbnailType, info.url);
        }
    }

    const play = document.createElement("span");

    play.className = "play-button";
    play.setAttribute("aria-hidden", "true");
    play.textContent = "▶";

    poster.append(play);

    poster.addEventListener(
        "click",
        onClick
    );

    return poster;
}


function makeCard(video, index) {
    const card = document.createElement("article");

    card.className = "video-card";

    card.append(
        createPoster(
            video,
            index,
            `Putar ${video.title}`,
            () => openPlayer(video)
        )
    );

    const title = document.createElement("h3");

    title.className = "video-title";
    title.textContent = video.title;

    const menuButton = document.createElement("button");

    menuButton.className =
        "card-menu-button";

    menuButton.type = "button";

    menuButton.setAttribute(
        "aria-label",
        `Pilihan untuk ${video.title}`
    );

    menuButton.setAttribute(
        "aria-haspopup",
        "menu"
    );

    menuButton.textContent = "···";

    menuButton.addEventListener(
        "click",
        (event) => {
            event.stopPropagation();

            showContextMenu(
                video,
                event.clientX ||
                    menuButton.getBoundingClientRect().right,
                event.clientY ||
                    menuButton.getBoundingClientRect().bottom
            );
        }
    );

    card.addEventListener(
        "contextmenu",
        (event) => {
            event.preventDefault();

            showContextMenu(
                video,
                event.clientX,
                event.clientY
            );
        }
    );

    card.append(
        title,
        menuButton
    );

    return card;
}


function sortVideoList(list) {
    return [...list].sort((first, second) =>
        first.title.localeCompare(second.title, "id", {
            sensitivity: "base",
            numeric: true
        })
    );
}


function sortCollectionList(list) {
    return [...list].sort((first, second) =>
        first.title.localeCompare(second.title, "id", {
            sensitivity: "base",
            numeric: true
        })
    );
}


/* =========================================================
   RENDER VIDEO
========================================================= */

function renderVideos() {
    const matchingVideos = videos.filter((video) =>
        `${video.title} ${video.url}`
            .toLocaleLowerCase()
            .includes(searchQuery)
    );

    videoGrid.replaceChildren(
        ...sortVideoList(matchingVideos).map(makeCard)
    );

    if (searchQuery && matchingVideos.length === 0) {
        videoGrid.append(
            createSearchEmptyState("video")
        );
    }

    if (
        currentView ===
        "collection-detail"
    ) {
        renderCollectionDetail();
    }

    renderCollections();
}


function createSearchEmptyState(type) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.setAttribute("role", "status");

    const title = document.createElement("strong");
    title.textContent = "Belum ada hasil";

    const description = document.createElement("p");
    description.textContent =
        type === "collection"
            ? `Tidak ada koleksi yang cocok dengan “${searchInput.value.trim()}”.`
            : `Tidak ada video yang cocok dengan “${searchInput.value.trim()}”.`;

    empty.append(title, description);
    return empty;
}


/* =========================================================
   RENDER COLLECTIONS
========================================================= */

function renderCollections() {
    const grid =
        document.querySelector(
            "#collection-grid"
        );

    if (!grid) return;

    const matchingCollections = collections.filter((collection) =>
        collection.title
            .toLocaleLowerCase()
            .includes(searchQuery)
    );

    grid.replaceChildren(
        ...sortCollectionList(matchingCollections).map(
            (collection, index) => {

                const members =
                    videos.filter(
                        (video) =>
                            video.collectionIds.includes(
                                collection.id
                            )
                    );

                const cover =
                    members.reduce(
                        (best, video) =>
                            !best ||
                            video.plays >
                                best.plays
                                ? video
                                : best,
                        null
                    );

                const card =
                    document.createElement(
                        "article"
                    );

                card.className =
                    "collection-card";

                const open = () =>
                    showCollection(
                        collection.id
                    );

                if (cover) {
                    card.append(
                        createPoster(
                            cover,
                            index,
                            `Buka koleksi ${collection.title}`,
                            open
                        )
                    );
                }

                else {
                    const artwork =
                        document.createElement(
                            "button"
                        );

                    artwork.className =
                        `collection-art poster-${index % 5}`;

                    artwork.type = "button";

                    artwork.setAttribute(
                        "aria-label",
                        `Buka koleksi ${collection.title}`
                    );

                    const symbol =
                        document.createElement(
                            "span"
                        );

                    symbol.setAttribute(
                        "aria-hidden",
                        "true"
                    );

                    symbol.textContent = "✳";

                    artwork.append(symbol);

                    artwork.addEventListener(
                        "click",
                        open
                    );

                    card.append(artwork);
                }

                const details =
                    document.createElement(
                        "div"
                    );

                details.className =
                    "collection-info";

                const title =
                    document.createElement(
                        "button"
                    );

                title.className =
                    "collection-card-title";

                title.type = "button";

                title.textContent =
                    collection.title;

                title.addEventListener(
                    "click",
                    open
                );

                const count =
                    document.createElement(
                        "span"
                    );

                count.className =
                    "collection-card-count";

                count.textContent =
                    `${members.length} video`;

                const menuButton =
                    document.createElement(
                        "button"
                    );

                menuButton.className = "card-menu-button";
                menuButton.type = "button";
                menuButton.textContent = "···";
                menuButton.setAttribute(
                    "aria-label",
                    `Pilihan untuk koleksi ${collection.title}`
                );
                menuButton.setAttribute("aria-haspopup", "menu");
                menuButton.addEventListener(
                    "click",
                    (event) => {
                        event.stopPropagation();
                        const bounds = menuButton.getBoundingClientRect();
                        showCollectionContextMenu(
                            collection,
                            event.clientX || bounds.right,
                            event.clientY || bounds.bottom
                        );
                    }
                );

                card.addEventListener(
                    "contextmenu",
                    (event) => {
                        event.preventDefault();
                        showCollectionContextMenu(
                            collection,
                            event.clientX,
                            event.clientY
                        );
                    }
                );

                details.append(
                    title,
                    count
                );

                card.append(
                    menuButton,
                    details
                );

                return card;
            }
        )
    );

    if (searchQuery && matchingCollections.length === 0) {
        grid.append(
            createSearchEmptyState("collection")
        );
    }
}


/* =========================================================
   COLLECTION DETAIL
========================================================= */

function renderCollectionDetail() {
    const collection =
        collections.find(
            (item) =>
                item.id ===
                activeCollectionId
        );

    if (!collection) {
        showView("collections");
        return;
    }

    const members =
        videos.filter(
            (video) =>
                video.collectionIds.includes(
                    collection.id
                )
        );
    const matchingMembers = members.filter((video) =>
        `${video.title} ${video.url}`
            .toLocaleLowerCase()
            .includes(searchQuery)
    );

    const title =
        document.querySelector(
            "#collection-detail-title"
        );

    const count =
        document.querySelector(
            "#collection-detail-count"
        );

    const grid =
        document.querySelector(
            "#collection-video-grid"
        );

    if (title) {
        title.textContent =
            collection.title;
    }

    if (count) {
        count.textContent = searchQuery
            ? `${matchingMembers.length} dari ${members.length} video`
            : `${members.length} video`;
    }

    if (grid) {
        grid.replaceChildren(
            ...sortVideoList(matchingMembers).map(makeCard)
        );

        if (searchQuery && matchingMembers.length === 0) {
            grid.append(
                createSearchEmptyState("video")
            );
        }
    }
}


/* =========================================================
   VIEW
========================================================= */

function showView(view) {
    currentView = view;
    searchInput.value = "";
    searchQuery = "";
    searchClear.hidden = true;
    searchForm.hidden = view === "about" || view === "upload";
    mobileSearchButton.hidden = view === "about" || view === "upload";
    siteHeader.classList.remove("search-open");
    mobileSearchButton.setAttribute("aria-expanded", "false");

    document.querySelector(
        "#library"
    ).hidden = view !== "home";

    document.querySelector(
        "#collections-view"
    ).hidden = view !== "collections";

    document.querySelector(
        "#about-view"
    ).hidden = view !== "about";

    document.querySelector(
        "#collection-detail"
    ).hidden =
        view !== "collection-detail";

    document.querySelector(
        "#upload-view"
    ).hidden = view !== "upload";

    const activeView =
        view === "collection-detail"
            ? "collections"
            : view;

    document
        .querySelectorAll(
            ".nav-link, .mobile-nav nav a[href^='#']"
        )
        .forEach((link) => {
            link.classList.toggle(
                "active",
                link.hash === `#${activeView}`
            );
        });

    if (view === "collections") {
        renderCollections();
    }

    if (view === "home") {
        renderVideos();
    }

    if (
        view ===
        "collection-detail"
    ) {
        renderCollectionDetail();
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function showCollection(id) {
    activeCollectionId = id;

    showView(
        "collection-detail"
    );
}


/* =========================================================
   CONTEXT MENU
========================================================= */

function positionContextMenu(menu, x, y, focusSelector) {
    menu.hidden = false;

    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;

    menu.style.left =
        `${Math.max(
            8,
            Math.min(
                x,
                innerWidth -
                    menuWidth -
                    8
            )
        )}px`;

    menu.style.top =
        `${Math.max(
            8,
            Math.min(
                y,
                innerHeight -
                    menuHeight -
                    8
            )
        )}px`;

    menu
        .querySelector(
            focusSelector
        )
        ?.focus();
}


function showContextMenu(video, x, y) {
    activeVideoId = video.id;
    collectionContextMenu.hidden = true;
    positionContextMenu(
        contextMenu,
        x,
        y,
        "[data-context-action='collection']"
    );
}


function showCollectionContextMenu(collection, x, y) {
    activeContextCollectionId = collection.id;
    contextMenu.hidden = true;
    positionContextMenu(
        collectionContextMenu,
        x,
        y,
        "[data-collection-action='edit']"
    );
}


function hideContextMenu() {
    contextMenu.hidden = true;
    collectionContextMenu.hidden = true;
}


/* =========================================================
   MEMBERSHIP DIALOG
========================================================= */

function openMembershipDialog(video) {
    membershipVideoId =
        video.id;

    const options =
        document.querySelector(
            "#collection-options"
        );

    options.replaceChildren();

    membershipError.textContent = "";

    if (collections.length === 0) {
        const message =
            document.createElement(
                "p"
            );

        message.className =
            "empty-options";

        message.textContent =
            "Buat koleksi dulu untuk mulai mengatur video.";

        const createButton =
            document.createElement(
                "button"
            );

        createButton.className =
            "text-action";

        createButton.type =
            "button";

        createButton.textContent =
            "Tambah koleksi";

        createButton.addEventListener(
            "click",
            () => {
                resumeMembershipAfterCollection =
                    true;

                membershipDialog.close();

                openCollectionDialog();
            }
        );

        options.append(
            message,
            createButton
        );
    }

    else {
        collections.forEach(
            (collection) => {
                const label =
                    document.createElement(
                        "label"
                    );

                label.className =
                    "collection-option";

                const checkbox =
                    document.createElement(
                        "input"
                    );

                checkbox.type =
                    "checkbox";

                checkbox.value =
                    collection.id;

                checkbox.checked =
                    video.collectionIds.includes(
                        collection.id
                    );

                const name =
                    document.createElement(
                        "span"
                    );

                name.textContent =
                    collection.title;

                label.append(
                    checkbox,
                    name
                );

                options.append(
                    label
                );
            }
        );
    }

    membershipDialog.showModal();
}


/* =========================================================
   COLLECTION DIALOG
========================================================= */

function openCollectionDialog(collection = null) {
    collectionForm.reset();

    editingCollectionId = collection?.id || null;
    collectionError.textContent = "";

    document.querySelector(
        "#collection-dialog-title"
    ).innerHTML = editingCollectionId
        ? 'Edit koleksi<span class="brand-dot">.</span>'
        : 'Tambah koleksi<span class="brand-dot">.</span>';

    document.querySelector(
        "#collection-form .submit-button"
    ).innerHTML = editingCollectionId
        ? 'Simpan perubahan <span aria-hidden="true">↗</span>'
        : 'Buat koleksi <span aria-hidden="true">↗</span>';

    document.querySelector(
        "#collection-form .dialog-description"
    ).textContent = editingCollectionId
        ? "Perbarui nama koleksi ini."
        : "Beri nama koleksi baru. Sampulnya akan mengikuti video yang paling sering diputar.";

    if (collection) {
        document.querySelector(
            "#collection-title-input"
        ).value = collection.title;
    }

    collectionDialog.showModal();

    document
        .querySelector(
            "#collection-title-input"
        )
        ?.focus();
}


/* =========================================================
   EDIT VIDEO
========================================================= */

function openEditDialog(video) {
    editingVideoId =
        video.id;

    document.querySelector(
        "#add-title"
    ).textContent =
        "Edit video.";

    document.querySelector(
        ".dialog-content .section-eyebrow"
    ).textContent =
        "PERBARUI VIDEO";

    document.querySelector(
        ".dialog-description"
    ).textContent =
        "Ubah judul atau tautan video ini.";

    document.querySelector(
        ".submit-button"
    ).innerHTML =
        'Simpan perubahan <span aria-hidden="true">↗</span>';

    document.querySelector(
        "#video-title"
    ).value =
        video.title;

    document.querySelector(
        "#video-url"
    ).value =
        video.url;

    formError.textContent = "";

    addDialog.showModal();

    document.querySelector(
        "#video-title"
    ).focus();
}


/* =========================================================
   ADD VIDEO DIALOG
========================================================= */

function openAddDialog() {
    editingVideoId = null;

    addForm.reset();

    document.querySelector(
        "#add-title"
    ).innerHTML =
        'Tambah video<span class="brand-dot">.</span>';

    document.querySelector(
        ".dialog-content .section-eyebrow"
    ).textContent =
        "SATU TAUTAN LAGI";

    document.querySelector(
        ".dialog-description"
    ).textContent =
        "Tempel tautan video dan beri judul supaya mudah ditemukan.";

    document.querySelector(
        ".submit-button"
    ).innerHTML =
        'Simpan ke koleksi <span aria-hidden="true">↗</span>';

    formError.textContent = "";

    addDialog.showModal();

    document.querySelector(
        "#video-title"
    ).focus();
}


function openUploadView() {
    uploadForm.reset();
    uploadError.textContent = "";
    uploadError.hidden = true;
    uploadProgress.value = 0;
    uploadProgress.hidden = true;
    uploadProgressText.textContent = "0%";
    uploadProgressText.hidden = true;
    uploadStatus.textContent = "Pilih file video untuk memulai.";
    uploadResult.hidden = true;
    uploadButton.disabled = false;

    history.pushState(null, "", "#upload");
    showView("upload");
    uploadTitleInput.focus();
}


async function uploadVideo(file, title) {
    const workerUrl = "https://boundhub-upload.ekasusanto154.workers.dev";
    const chunkSize = 10 * 1024 * 1024;
    const responseData = async (response) => {
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Permintaan upload gagal.");
        }
        return data;
    };

    uploadButton.disabled = true;
    uploadError.hidden = true;
    uploadResult.hidden = true;
    uploadProgress.hidden = false;
    uploadProgressText.hidden = false;
    uploadProgress.value = 0;
    uploadProgressText.textContent = "0%";

    let completedKey = null;

    try {
        uploadStatus.textContent = "Membuat upload...";
        const createData = await responseData(
            await fetch(`${workerUrl}/upload/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: file.name,
                    contentType: file.type || "application/octet-stream"
                })
            })
        );

        if (
            !createData.uploadId ||
            typeof createData.key !== "string" ||
            !createData.key
        ) {
            throw new Error("Server tidak memberikan informasi upload yang lengkap.");
        }

        const parts = [];
        const totalParts = Math.ceil(file.size / chunkSize);

        for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
            const start = (partNumber - 1) * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const percent = Math.round(((partNumber - 1) / totalParts) * 100);

            uploadProgress.value = percent;
            uploadProgressText.textContent = `${percent}%`;
            uploadStatus.textContent =
                `Mengupload bagian ${partNumber} dari ${totalParts}...`;

            const partData = await responseData(
                await fetch(
                    `${workerUrl}/upload/part?uploadId=${encodeURIComponent(createData.uploadId)}&key=${encodeURIComponent(createData.key)}&partNumber=${partNumber}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/octet-stream" },
                        body: file.slice(start, end)
                    }
                )
            );

            if (!partData.etag) {
                throw new Error(`Server tidak memberikan ETag untuk bagian ${partNumber}.`);
            }

            parts.push({ partNumber, etag: partData.etag });
            const currentPercent = Math.round((partNumber / totalParts) * 100);
            uploadProgress.value = currentPercent;
            uploadProgressText.textContent = `${currentPercent}%`;
        }

        uploadStatus.textContent = "Menyelesaikan upload...";
        const completeData = await responseData(
            await fetch(`${workerUrl}/upload/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    uploadId: createData.uploadId,
                    key: createData.key,
                    parts
                })
            })
        );

        completedKey =
            typeof completeData.key === "string" && completeData.key
                ? completeData.key
                : createData.key;
        const publicUrl = `https://pub-c625ddfe95424f11993f508a116beb77.r2.dev/${completedKey
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`;

        const video = {
            id: crypto.randomUUID(),
            title,
            url: publicUrl,
            plays: 0,
            collectionIds: []
        };

        await insertVideo(video);
        videos.unshift(video);
        uploadProgress.value = 100;
        uploadProgressText.textContent = "100%";
        uploadStatus.textContent = "Upload selesai dan video sudah tersimpan di beranda.";
        uploadResultLink.href = publicUrl;
        uploadResult.hidden = false;
        renderVideos();
    } catch (error) {
        console.error("Gagal mengunggah atau menyimpan video:", error);
        uploadError.textContent = completedKey
            ? "File sudah terunggah ke R2, tetapi gagal menambahkan video ke beranda. Periksa koneksi lalu coba tambahkan lagi."
            : `Upload gagal: ${error.message}`;
        uploadError.hidden = false;
        uploadStatus.textContent = completedKey
            ? "Upload R2 berhasil, penyimpanan video di beranda gagal."
            : "Proses upload belum selesai.";
    } finally {
        uploadButton.disabled = false;
    }
}


/* =========================================================
   PLAYER
========================================================= */

async function openPlayer(video) {
    activePlayerVideo = video;
    video.plays += 1;

    try {
        await updateVideo(video);
    } catch (error) {
        console.error(
            "Gagal menyimpan jumlah play:",
            error
        );
    }

    renderVideos();

    const frame =
        document.querySelector(
            "#player-frame"
        );

    const title =
        document.querySelector(
            "#player-title"
        );

    const info =
        getVideoInfo(video.url);

    if (activeHlsPlayer) {
        activeHlsPlayer.destroy();
        activeHlsPlayer = null;
    }

    frame.replaceChildren();

    title.textContent =
        video.title;

    if (info.kind === "file" || info.kind === "hls") {
        const player =
            document.createElement(
                "video"
            );

        player.src =
            info.url;

        player.controls = true;
        player.autoplay = true;
        player.playsInline = true;

        if (info.kind === "hls") {
            if (window.Hls?.isSupported()) {
                activeHlsPlayer = new window.Hls();
                activeHlsPlayer.loadSource(info.url);
                activeHlsPlayer.attachMedia(player);
            } else if (
                player.canPlayType("application/vnd.apple.mpegurl")
            ) {
                player.src = info.url;
            } else {
                const message = document.createElement("p");
                message.textContent =
                    "Browser ini tidak mendukung pemutaran HLS.";
                frame.append(message);
                playerDialog.showModal();
                return;
            }
        } else {
            player.src = info.url;
        }

        frame.append(player);
    }

    else {
        const player =
            document.createElement(
                "iframe"
            );

        player.src =
            info.embedUrl;

        player.title =
            video.title;

        player.allow =
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

        player.allowFullscreen =
            true;

        frame.append(player);
    }

    playerDialog.showModal();
}


playerAddCollectionButton.addEventListener("click", () => {
    if (activePlayerVideo) {
        openMembershipDialog(activePlayerVideo);
    }
});


/* =========================================================
   BUTTON EVENTS
========================================================= */

document
    .querySelectorAll("[data-open-add]")
    .forEach((button) =>
        button.addEventListener(
            "click",
            () => {
                openUploadView();
                const mobileNav = document.querySelector(".mobile-nav");
                if (mobileNav) mobileNav.open = false;
            }
        )
    );

document
    .querySelector("[data-back-upload]")
    .addEventListener("click", () => {
        history.pushState(null, "", "#home");
        showView("home");
    });

document
    .querySelector("#upload-done")
    .addEventListener("click", () => {
        history.pushState(null, "", "#home");
        showView("home");
    });

uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = uploadFileInput.files[0];
    const title = uploadTitleInput.value.trim();

    if (!file || !title) {
        uploadError.textContent = "Masukkan judul dan pilih file video terlebih dahulu.";
        uploadError.hidden = false;
        return;
    }

    if (file.size === 0) {
        uploadError.textContent = "File yang dipilih kosong. Pilih file video lain.";
        uploadError.hidden = false;
        return;
    }

    await uploadVideo(file, title);
});


document
    .querySelectorAll("[data-open-collection]")
    .forEach((button) =>
        button.addEventListener(
            "click",
            openCollectionDialog
        )
    );


document
    .querySelectorAll("[data-back-collections]")
    .forEach((button) =>
        button.addEventListener(
            "click",
            () =>
                showView(
                    "collections"
                )
        )
    );


document
    .querySelectorAll("[data-close-dialog]")
    .forEach((button) =>
        button.addEventListener(
            "click",
            () =>
                button
                    .closest("dialog")
                    .close()
        )
    );


/* =========================================================
   DIALOG BACKDROP
========================================================= */

[
    addDialog,
    collectionDialog,
    membershipDialog,
    playerDialog
].forEach((dialog) => {
    dialog.addEventListener(
        "click",
        (event) => {
            if (
                event.target ===
                dialog
            ) {
                dialog.close();
            }
        }
    );
});


playerDialog.addEventListener(
    "close",
    () => {
        if (activeHlsPlayer) {
            activeHlsPlayer.destroy();
            activeHlsPlayer = null;
        }

        document
            .querySelector(
                "#player-frame"
            )
            .replaceChildren();
    }
);


/* =========================================================
   CONTEXT MENU EVENTS
========================================================= */

document.addEventListener(
    "click",
    (event) => {
        const insideVideoMenu =
            !contextMenu.hidden && contextMenu.contains(event.target);
        const insideCollectionMenu =
            !collectionContextMenu.hidden &&
            collectionContextMenu.contains(event.target);

        if (!insideVideoMenu && !insideCollectionMenu) {
            hideContextMenu();
        }
    }
);


document.addEventListener(
    "keydown",
    (event) => {
        if (event.key === "Escape") {
            hideContextMenu();
        }
    }
);


window.addEventListener(
    "resize",
    hideContextMenu
);


searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
});

searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim().toLocaleLowerCase();
    searchClear.hidden = searchInput.value.length === 0;
    renderVideos();
});

searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchQuery = "";
    searchClear.hidden = true;
    renderVideos();
    searchInput.focus();
});

mobileSearchButton.addEventListener("click", () => {
    const isOpen = siteHeader.classList.toggle("search-open");
    mobileSearchButton.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) {
        document.querySelector(".mobile-nav").open = false;
        searchInput.focus();
    }
});

searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !siteHeader.classList.contains("search-open")) {
        return;
    }

    siteHeader.classList.remove("search-open");
    mobileSearchButton.setAttribute("aria-expanded", "false");
    mobileSearchButton.focus();
});

document.addEventListener("click", (event) => {
    if (
        siteHeader.classList.contains("search-open") &&
        !searchForm.contains(event.target) &&
        !mobileSearchButton.contains(event.target)
    ) {
        siteHeader.classList.remove("search-open");
        mobileSearchButton.setAttribute("aria-expanded", "false");
    }
});


/* =========================================================
   NAVIGATION
========================================================= */

window.addEventListener(
    "hashchange",
    () =>
        showView(
            location.hash ===
                "#collections"
                ? "collections"
                : location.hash === "#about"
                ? "about"
                : location.hash === "#upload"
                ? "upload"
                : "home"
        )
);

window.addEventListener("popstate", () => {
    showView(
        location.hash === "#collections"
            ? "collections"
            : location.hash === "#about"
            ? "about"
            : location.hash === "#upload"
            ? "upload"
            : "home"
    );
});


document
    .querySelectorAll(
        ".nav-link, .mobile-nav nav a[href^='#']"
    )
    .forEach((link) => {
        link.addEventListener(
            "click",
            (event) => {
                event.preventDefault();

                const view =
                    link.hash ===
                    "#collections"
                        ? "collections"
                        : link.hash === "#about"
                        ? "about"
                        : link.hash === "#upload"
                        ? "upload"
                        : "home";

                history.replaceState(
                    null,
                    "",
                    link.hash
                );

                showView(view);

                const mobileNav =
                    document.querySelector(
                        ".mobile-nav"
                    );

                if (mobileNav) {
                    mobileNav.open =
                        false;
                }
            }
        );
    });


document.addEventListener(
    "click",
    (event) => {
        const mobileNav =
            document.querySelector(".mobile-nav");

        if (
            mobileNav?.open &&
            !mobileNav.contains(event.target)
        ) {
            mobileNav.open = false;
        }
    }
);


document
    .querySelectorAll(".mobile-about a")
    .forEach((link) => {
        link.addEventListener(
            "click",
            () => {
                const mobileNav =
                    document.querySelector(".mobile-nav");

                if (mobileNav) {
                    mobileNav.open = false;
                }
            }
        );
    });


/* =========================================================
   VIDEO CONTEXT ACTIONS
========================================================= */

contextMenu.addEventListener(
    "click",
    async (event) => {
        const action =
            event.target.closest(
                "[data-context-action]"
            )?.dataset
                .contextAction;

        const video =
            videos.find(
                (item) =>
                    item.id ===
                    activeVideoId
            );

        if (!video || !action) {
            hideContextMenu();
            return;
        }

        hideContextMenu();

        if (
            action ===
            "collection"
        ) {
            openMembershipDialog(
                video
            );
        }

        if (
            action === "edit"
        ) {
            openEditDialog(
                video
            );
        }

        if (
            action === "delete"
        ) {
            if (
                !confirm(
                    `Hapus “${video.title}” dari daftar video?`
                )
            ) {
                return;
            }

            try {
                await deleteVideo(
                    video.id
                );

                videos =
                    videos.filter(
                        (item) =>
                            item.id !==
                            video.id
                    );

                renderVideos();
            } catch {
                alert(
                    "Gagal menghapus video dari server."
                );
            }
        }
    }
);


collectionContextMenu.addEventListener(
    "click",
    (event) => {
        const action = event.target.closest(
            "[data-collection-action]"
        )?.dataset.collectionAction;
        const collection = collections.find(
            (item) => item.id === activeContextCollectionId
        );

        hideContextMenu();

        if (!collection || !action) return;

        if (action === "edit") {
            openCollectionDialog(collection);
        }

        if (action === "delete") {
            deleteCollection(collection);
        }
    }
);


/* =========================================================
   MEMBERSHIP FORM
========================================================= */

membershipForm.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        const video =
            videos.find(
                (item) =>
                    item.id ===
                    membershipVideoId
            );

        if (!video) {
            membershipDialog.close();
            return;
        }

        const selected =
            [
                ...document.querySelectorAll(
                    "#collection-options input:checked"
                )
            ].map(
                (input) =>
                    input.value
            );

        const oldCollectionIds =
            video.collectionIds;

        video.collectionIds =
            selected;

        membershipError.textContent =
            "";

        try {
            await updateVideo(
                video
            );

            renderVideos();

            membershipDialog.close();
        } catch {
            video.collectionIds =
                oldCollectionIds;

            membershipError.textContent =
                "Gagal menyimpan koleksi video.";
        }
    }
);


/* =========================================================
   COLLECTION FORM
========================================================= */

collectionForm.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        const title =
            new FormData(
                collectionForm
            )
                .get("title")
                ?.toString()
                .trim();

        if (!title) return;

        const collection = {
            id: editingCollectionId || crypto.randomUUID(),
            title
        };

        collectionError.textContent =
            "";

        try {
            if (editingCollectionId) {
                await updateCollection(collection);
                collections = collections.map((item) =>
                    item.id === collection.id ? collection : item
                );
            } else {
                await insertCollection(collection);
                collections.unshift(collection);
            }

            renderCollections();
            if (currentView === "collection-detail") {
                renderCollectionDetail();
            }

            collectionDialog.close();
        } catch {
            collectionError.textContent =
                "Gagal menyimpan koleksi ke server.";
        }
    }
);


async function deleteCollection(collection) {
    const confirmed = window.confirm(
        `Hapus koleksi "${collection.title}"? Video di dalamnya tidak akan dihapus.`
    );

    if (!confirmed) return;

    const affectedVideos = videos.filter((video) =>
        video.collectionIds.includes(collection.id)
    );
    const updatedVideos = [];

    try {
        for (const video of affectedVideos) {
            await updateVideoCollections(
                video.id,
                video.collectionIds.filter((id) => id !== collection.id)
            );
            updatedVideos.push(video);
        }

        await deleteCollectionRecord(collection.id);
    } catch {
        await Promise.allSettled(
            updatedVideos.map((video) =>
                updateVideoCollections(video.id, video.collectionIds)
            )
        );
        window.alert("Gagal menghapus koleksi. Silakan coba lagi.");
        return;
    }

    videos = videos.map((video) => ({
        ...video,
        collectionIds: video.collectionIds.filter(
            (id) => id !== collection.id
        )
    }));
    collections = collections.filter(
        (item) => item.id !== collection.id
    );

    if (activeCollectionId === collection.id) {
        activeCollectionId = null;
        showView("collections");
    } else {
        renderVideos();
    }
}


/* =========================================================
   COLLECTION DIALOG CLOSE
========================================================= */

collectionDialog.addEventListener(
    "close",
    () => {
        if (
            resumeMembershipAfterCollection &&
            membershipVideoId &&
            videos.some(
                (video) =>
                    video.id ===
                    membershipVideoId
            )
        ) {
            resumeMembershipAfterCollection =
                false;

            openMembershipDialog(
                videos.find(
                    (video) =>
                        video.id ===
                        membershipVideoId
                )
            );
        }
    }
);


/* =========================================================
   ADD / EDIT VIDEO FORM
========================================================= */

addForm.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        const formData =
            new FormData(
                addForm
            );

        const title =
            formData
                .get("title")
                ?.toString()
                .trim();

        const rawUrl =
            formData
                .get("url")
                ?.toString()
                .trim();

        try {
            const parsed =
                new URL(rawUrl);

            if (
                !/^https?:$/.test(
                    parsed.protocol
                )
            ) {
                throw new Error(
                    "invalid protocol"
                );
            }

            /* EDIT VIDEO */

            if (editingVideoId) {
                const video =
                    videos.find(
                        (item) =>
                            item.id ===
                            editingVideoId
                    );

                if (!video) {
                    throw new Error(
                        "Video tidak ditemukan"
                    );
                }

                const oldTitle =
                    video.title;

                const oldUrl =
                    video.url;

                video.title =
                    title;

                video.url =
                    parsed.href;

                try {
                    await updateVideo(
                        video
                    );
                } catch (
                    error
                ) {
                    video.title =
                        oldTitle;

                    video.url =
                        oldUrl;

                    throw error;
                }
            }

            /* ADD VIDEO */

            else {
                const video = {
                    id:
                        crypto.randomUUID(),

                    title,

                    url:
                        parsed.href,

                    plays: 0,

                    collectionIds: []
                };

                await insertVideo(
                    video
                );

                videos.unshift(
                    video
                );
            }

            renderVideos();

            addDialog.close();

            document
                .querySelector(
                    "#library"
                )
                .scrollIntoView({
                    behavior:
                        "smooth"
                });

        } catch (error) {
            console.error(
                "Gagal menyimpan video:",
                error
            );

            formError.textContent =
                error.message ===
                "invalid protocol"
                    ? "Masukkan tautan video valid yang diawali http:// atau https://."
                    : "Gagal menyimpan video ke server.";
        }
    }
);


/* =========================================================
   START APPLICATION
========================================================= */

showView(currentView);

loadData();
