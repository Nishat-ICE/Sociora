const API = "/api";


let currentUser = null;


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        loadTheme();

        await checkLogin();

        setupEvents();

        loadPosts();

        loadNotificationCount();

        setInterval(
            loadNotificationCount,
            10000
        );

    }
);


/* =========================================================
   LOGIN CHECK
========================================================= */

async function checkLogin() {

    try {

        const response =
            await fetch(
                `${API}/auth/me`,
                {
                    credentials: "include"
                }
            );


        if (!response.ok) {

            currentUser = null;

            return;

        }


        const data =
            await response.json();


        currentUser =
            data.user;


        updateUserUI();

    } catch (error) {

        console.log(
            "Login check failed."
        );

    }

}


/* =========================================================
   USER UI
========================================================= */

function updateUserUI() {

    if (!currentUser) return;


    const username =
        currentUser.username ||
        "User";


    const letter =
        username
            .charAt(0)
            .toUpperCase();


    const elements = [

        "navProfileLetter",
        "sidebarAvatar",
        "createPostAvatar"

    ];


    elements.forEach(
        function (id) {

            const element =
                document.getElementById(id);

            if (element) {

                element.textContent =
                    letter;

            }

        }
    );


    const sidebarUsername =
        document.getElementById(
            "sidebarUsername"
        );


    if (sidebarUsername) {

        sidebarUsername.textContent =
            username;

    }

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

    const postButton =
        document.getElementById(
            "postButton"
        );


    if (postButton) {

        postButton.addEventListener(
            "click",
            createPost
        );

    }


    const searchInput =
        document.getElementById(
            "navSearch"
        );


    if (searchInput) {

        searchInput.addEventListener(
            "keydown",
            function (event) {

                if (
                    event.key === "Enter"
                ) {

                    const query =
                        searchInput.value.trim();


                    if (!query) return;


                    window.location.href =
                        `pages/explore.html?q=${encodeURIComponent(query)}`;

                }

            }
        );

    }

}


/* =========================================================
   CREATE POST
========================================================= */

async function createPost() {

    const textarea =
        document.getElementById(
            "postContent"
        );


    if (!textarea) return;


    const content =
        textarea.value.trim();


    if (!content) {

        showToast(
            "Write something first."
        );

        return;

    }


    try {

        const response =
            await fetch(
                `${API}/posts`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    credentials: "include",

                    body: JSON.stringify({
                        content
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            showToast(
                data.message ||
                "Could not create post."
            );

            return;

        }


        textarea.value = "";

        showToast(
            "Post published!"
        );


        loadPosts();

    } catch (error) {

        showToast(
            "Server error."
        );

    }

}


/* =========================================================
   LOAD POSTS
========================================================= */

async function loadPosts() {

    const container =
        document.getElementById(
            "postsContainer"
        );


    if (!container) return;


    try {

        const response =
            await fetch(
                `${API}/posts`,
                {
                    credentials: "include"
                }
            );


        const posts =
            await response.json();


        if (!response.ok) {

            container.innerHTML =
                `<div class="empty-state">
                    Could not load posts.
                </div>`;

            return;

        }


        renderPosts(
            posts,
            container
        );

    } catch (error) {

        console.error(error);

        container.innerHTML =
            `<div class="empty-state">
                Unable to load posts.
            </div>`;

    }

}


/* =========================================================
   RENDER POSTS
========================================================= */

function renderPosts(
    posts,
    container
) {

    if (!posts.length) {

        container.innerHTML =
            `<div class="empty-state">

                <strong>
                    No posts yet
                </strong>

                <p>
                    Be the first person to
                    share something.
                </p>

            </div>`;

        return;

    }


    container.innerHTML =
        posts
            .map(
                createPostHTML
            )
            .join("");

}


/* =========================================================
   POST HTML
========================================================= */

function createPostHTML(post) {

    const username =
        post.username ||
        "User";


    const letter =
        username
            .charAt(0)
            .toUpperCase();


    const avatar =
        post.avatar
            ? `<img
                    src="${post.avatar}"
                    class="post-user-image"
                    alt="Profile"
               >`
            : letter;


    const liked =
        Number(post.is_liked)
            ? "liked"
            : "";


    const likeIcon =
        Number(post.is_liked)
            ? "♥"
            : "♡";


    const ownPost =
        currentUser &&
        Number(currentUser.id) ===
        Number(post.user_id);


    return `
        <article
            class="post-card"
            id="post-${post.id}"
        >

            <div class="post-header">

                <div class="post-user-avatar">
                    ${avatar}
                </div>


                <div class="post-user-info">

                    <div class="post-username">
                        ${escapeHTML(username)}
                    </div>

                    <div class="post-date">
                        ${formatDate(post.created_at)}
                    </div>

                </div>


                ${
                    ownPost
                        ? `
                            <button
                                class="post-menu-btn"
                                onclick="togglePostMenu(${post.id})"
                            >
                                ⋯
                            </button>

                            <div
                                class="post-menu"
                                id="post-menu-${post.id}"
                                style="display:none;"
                            >

                                <button
                                    onclick="editPost(${post.id})"
                                >
                                    Edit
                                </button>

                                <button
                                    onclick="deletePost(${post.id})"
                                >
                                    Delete
                                </button>

                            </div>
                        `
                        : ""
                }

            </div>


            <div class="post-content">
                ${escapeHTML(post.content)}
            </div>


            <div class="post-actions">

                <button
                    class="post-action ${liked}"
                    onclick="toggleLike(
                        ${post.id},
                        ${Number(post.is_liked)}
                    )"
                >
                    ${likeIcon}
                    ${post.like_count || 0}
                </button>


                <button
                    class="post-action"
                    onclick="focusComment(${post.id})"
                >
                    💬
                    ${post.comment_count || 0}
                </button>

            </div>


            <div
                class="comments-section"
                id="comments-${post.id}"
                style="display:none;"
            >

                <div
                    class="comment-list"
                    id="comment-list-${post.id}"
                ></div>


                <div class="comment-input-row">

                    <input
                        type="text"
                        class="comment-input"
                        id="comment-input-${post.id}"
                        placeholder="Write a comment..."
                        onkeydown="handleCommentKey(event, ${post.id})"
                    >


                    <button
                        class="comment-submit"
                        onclick="addComment(${post.id})"
                    >
                        Send
                    </button>

                </div>

            </div>

        </article>
    `;

}


/* =========================================================
   LIKE
========================================================= */

async function toggleLike(
    postId,
    isLiked
) {

    try {

        const response =
            await fetch(
                `${API}/posts/${postId}/like`,
                {
                    method:
                        isLiked
                            ? "DELETE"
                            : "POST",

                    credentials: "include"
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            showToast(
                data.message ||
                "Could not update like."
            );

            return;

        }


        loadPosts();

    } catch (error) {

        showToast(
            "Server error."
        );

    }

}


/* =========================================================
   COMMENTS
========================================================= */

async function focusComment(
    postId
) {

    const section =
        document.getElementById(
            `comments-${postId}`
        );


    if (!section) return;


    const visible =
        section.style.display !== "none";


    section.style.display =
        visible
            ? "none"
            : "block";


    if (!visible) {

        await loadComments(
            postId
        );


        setTimeout(
            function () {

                const input =
                    document.getElementById(
                        `comment-input-${postId}`
                    );


                if (input) {

                    input.focus();

                }

            },
            100
        );

    }

}


async function loadComments(
    postId
) {

    const list =
        document.getElementById(
            `comment-list-${postId}`
        );


    if (!list) return;


    try {

        const response =
            await fetch(
                `${API}/posts/${postId}/comments`
            );


        const comments =
            await response.json();


        if (!comments.length) {

            list.innerHTML =
                `<div class="comment-empty">
                    No comments yet.
                </div>`;

            return;

        }


        list.innerHTML =
            comments
                .map(
                    createCommentHTML
                )
                .join("");

    } catch (error) {

        list.innerHTML =
            `<div>
                Could not load comments.
            </div>`;

    }

}


function createCommentHTML(
    comment
) {

    const username =
        comment.username ||
        "User";


    const letter =
        username
            .charAt(0)
            .toUpperCase();


    const own =
        currentUser &&
        Number(currentUser.id) ===
        Number(comment.user_id);


    return `
        <div class="comment">

            <div class="comment-avatar">
                ${
                    comment.avatar
                        ? `<img
                            src="${comment.avatar}"
                            class="comment-image"
                           >`
                        : letter
                }
            </div>


            <div class="comment-body">

                <div class="comment-username">
                    ${escapeHTML(username)}
                </div>


                <div class="comment-text">
                    ${escapeHTML(comment.comment)}
                </div>


                ${
                    own
                        ? `
                            <button
                                class="comment-delete"
                                onclick="deleteComment(${comment.id})"
                            >
                                Delete
                            </button>
                        `
                        : ""
                }

            </div>

        </div>
    `;

}


async function addComment(
    postId
) {

    const input =
        document.getElementById(
            `comment-input-${postId}`
        );


    if (!input) return;


    const comment =
        input.value.trim();


    if (!comment) return;


    try {

        const response =
            await fetch(
                `${API}/posts/${postId}/comments`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    credentials: "include",

                    body: JSON.stringify({
                        comment
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            showToast(
                data.message ||
                "Could not add comment."
            );

            return;

        }


        input.value = "";

        await loadComments(
            postId
        );

        loadPosts();

    } catch (error) {

        showToast(
            "Server error."
        );

    }

}


function handleCommentKey(
    event,
    postId
) {

    if (
        event.key === "Enter"
    ) {

        event.preventDefault();

        addComment(postId);

    }

}


async function deleteComment(
    commentId
) {

    if (
        !confirm(
            "Delete this comment?"
        )
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                `${API}/comments/${commentId}`,
                {
                    method: "DELETE",

                    credentials: "include"
                }
            );


        if (response.ok) {

            loadPosts();

        }

    } catch (error) {

        showToast(
            "Could not delete comment."
        );

    }

}


/* =========================================================
   EDIT POST
========================================================= */

async function editPost(
    postId
) {

    const article =
        document.getElementById(
            `post-${postId}`
        );


    const contentElement =
        article.querySelector(
            ".post-content"
        );


    const current =
        contentElement.textContent.trim();


    const updated =
        prompt(
            "Edit your post:",
            current
        );


    if (
        updated === null ||
        !updated.trim()
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                `${API}/posts/${postId}`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    credentials: "include",

                    body: JSON.stringify({
                        content:
                            updated.trim()
                    })
                }
            );


        if (response.ok) {

            showToast(
                "Post updated."
            );

            loadPosts();

        }

    } catch (error) {

        showToast(
            "Could not update post."
        );

    }

}


/* =========================================================
   DELETE POST
========================================================= */

async function deletePost(
    postId
) {

    if (
        !confirm(
            "Delete this post?"
        )
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                `${API}/posts/${postId}`,
                {
                    method: "DELETE",

                    credentials: "include"
                }
            );


        if (response.ok) {

            showToast(
                "Post deleted."
            );

            loadPosts();

        }

    } catch (error) {

        showToast(
            "Could not delete post."
        );

    }

}


/* =========================================================
   POST MENU
========================================================= */

function togglePostMenu(
    postId
) {

    const menu =
        document.getElementById(
            `post-menu-${postId}`
        );


    if (!menu) return;


    menu.style.display =
        menu.style.display === "none"
            ? "block"
            : "none";

}


/* =========================================================
   NOTIFICATIONS
========================================================= */

async function loadNotificationCount() {

    try {

        const response =
            await fetch(
                `${API}/notifications/count`,
                {
                    credentials: "include"
                }
            );


        if (!response.ok) return;


        const data =
            await response.json();


        const count =
            Number(data.count || 0);


        const badges = [

            document.getElementById(
                "notificationBadge"
            ),

            document.getElementById(
                "sidebarNotificationBadge"
            )

        ];


        badges.forEach(
            function (badge) {

                if (!badge) return;


                badge.textContent =
                    count > 99
                        ? "99+"
                        : count;


                badge.style.display =
                    count > 0
                        ? "flex"
                        : "none";

            }
        );

    } catch (error) {

        // ignore

    }

}


/* =========================================================
   LOGOUT
========================================================= */

async function logout() {

    try {

        await fetch(
            `${API}/auth/logout`,
            {
                method: "POST",
                credentials: "include"
            }
        );


        window.location.href =
            "pages/login.html";

    } catch (error) {

        window.location.href =
            "pages/login.html";

    }

}


/* =========================================================
   SEARCH
========================================================= */

function searchFromNavbar() {

    const input =
        document.getElementById(
            "navSearch"
        );


    if (!input) return;


    const query =
        input.value.trim();


    if (!query) return;


    window.location.href =
        `pages/explore.html?q=${encodeURIComponent(query)}`;

}


/* =========================================================
   TOAST
========================================================= */

function showToast(
    message
) {

    const toast =
        document.getElementById(
            "toast"
        );


    if (!toast) return;


    toast.textContent =
        message;


    toast.classList.add(
        "show"
    );


    setTimeout(
        function () {

            toast.classList.remove(
                "show"
            );

        },
        2500
    );

}


/* =========================================================
   HELPERS
========================================================= */

function formatDate(
    date
) {

    if (!date) return "";


    return new Date(
        date
    ).toLocaleString(
        "en-US",
        {
            dateStyle: "medium",
            timeStyle: "short"
        }
    );

}


function escapeHTML(
    value
) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        value ?? "";


    return div.innerHTML;

}


/* =========================================================
   GLOBAL
========================================================= */

window.toggleLike =
    toggleLike;

window.focusComment =
    focusComment;

window.addComment =
    addComment;

window.handleCommentKey =
    handleCommentKey;

window.deleteComment =
    deleteComment;

window.editPost =
    editPost;

window.deletePost =
    deletePost;

window.togglePostMenu =
    togglePostMenu;

window.logout =
    logout;

window.toggleTheme =
    toggleTheme;

window.loadTheme =
    loadTheme;

window.searchFromNavbar =
    searchFromNavbar;