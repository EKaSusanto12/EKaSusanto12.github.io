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

const addForm = document.querySelector("#add-form");
const formError = document.querySelector("#form-error");

const collectionForm = document.querySelector("#collection-form");
const collectionError = document.querySelector("#collection-error");

const membershipForm = document.querySelector("#membership-form");
const membershipError = document.querySelector("#membership-error");

const contextMenu = document.querySelector("#video-context-menu");

let videos = [];
let collections = [];

let activeVideoId = null;
let activeCollectionId = null;
let editingVideoId = null;
let membershipVideoId = null;
let resumeMembershipAfterCollection = false;

let currentView =
    location.hash === "#collections"
        ? "collections"
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
        }
    }

    else if (
        /\.(mp4|webm|ogg|mov|m4v)$/i.test(
            url.pathname
        )
    ) {
        kind = "file";
    }

    return {
        url: url.href,
        embedUrl,
        kind,
        thumbnail,
        host
    };
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
        };

        poster.append(image);
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


/* =========================================================
   RENDER VIDEO
========================================================= */

function renderVideos() {
    videoGrid.replaceChildren(
        ...videos.map(makeCard)
    );

    if (
        currentView ===
        "collection-detail"
    ) {
        renderCollectionDetail();
    }

    renderCollections();
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

    grid.replaceChildren(
        ...collections.map(
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

                details.append(
                    title,
                    count
                );

                card.append(details);

                return card;
            }
        )
    );
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
        count.textContent =
            `${members.length} video`;
    }

    if (grid) {
        grid.replaceChildren(
            ...members.map(makeCard)
        );
    }
}


/* =========================================================
   VIEW
========================================================= */

function showView(view) {
    currentView = view;

    document.querySelector(
        "#library"
    ).hidden = view !== "home";

    document.querySelector(
        "#collections-view"
    ).hidden = view !== "collections";

    document.querySelector(
        "#collection-detail"
    ).hidden =
        view !== "collection-detail";

    document
        .querySelectorAll(".nav-link")
        .forEach((link) => {
            link.classList.toggle(
                "active",
                link.hash ===
                    (
                        view === "home"
                            ? "#home"
                            : "#collections"
                    )
            );
        });

    if (view === "collections") {
        renderCollections();
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

function showContextMenu(video, x, y) {
    activeVideoId = video.id;

    contextMenu.hidden = false;

    const menuWidth =
        contextMenu.offsetWidth;

    const menuHeight =
        contextMenu.offsetHeight;

    contextMenu.style.left =
        `${Math.max(
            8,
            Math.min(
                x,
                innerWidth -
                    menuWidth -
                    8
            )
        )}px`;

    contextMenu.style.top =
        `${Math.max(
            8,
            Math.min(
                y,
                innerHeight -
                    menuHeight -
                    8
            )
        )}px`;

    contextMenu
        .querySelector(
            "[data-context-action='collection']"
        )
        ?.focus();
}


function hideContextMenu() {
    contextMenu.hidden = true;
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

function openCollectionDialog() {
    collectionForm.reset();

    collectionError.textContent = "";

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


/* =========================================================
   PLAYER
========================================================= */

async function openPlayer(video) {
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

    frame.replaceChildren();

    title.textContent =
        video.title;

    if (info.kind === "file") {
        const player =
            document.createElement(
                "video"
            );

        player.src =
            info.url;

        player.controls = true;
        player.autoplay = true;
        player.playsInline = true;

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


/* =========================================================
   BUTTON EVENTS
========================================================= */

document
    .querySelectorAll("[data-open-add]")
    .forEach((button) =>
        button.addEventListener(
            "click",
            openAddDialog
        )
    );


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
        if (
            !contextMenu.hidden &&
            !contextMenu.contains(
                event.target
            )
        ) {
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
                : "home"
        )
);


document
    .querySelectorAll(
        ".nav-link, .mobile-nav nav a"
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
            id:
                crypto.randomUUID(),
            title
        };

        collectionError.textContent =
            "";

        try {
            await insertCollection(
                collection
            );

            collections.unshift(
                collection
            );

            renderCollections();

            collectionDialog.close();
        } catch {
            collectionError.textContent =
                "Gagal menyimpan koleksi ke server.";
        }
    }
);


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
