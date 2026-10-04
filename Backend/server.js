const express = require("express");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const multer = require("multer");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 5000;


/* =========================================================
   DATABASE
========================================================= */

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true"
        ? { minVersion: "TLSv1.2", rejectUnauthorized: true }
        : undefined,
    waitForConnections: true,
    connectionLimit: 10
});


/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "sociora_secret",

        resave: false,

        saveUninitialized: false,

        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 7,

            httpOnly: true,

            sameSite: "lax"
        }
    })
);


/* =========================================================
   STATIC FILES
========================================================= */

const frontendPath =
    path.join(__dirname, "../Frontend");

const uploadsPath =
    path.join(__dirname, "uploads");


app.use(
    express.static(frontendPath)
);


app.use(
    "/uploads",
    express.static(uploadsPath)
);


/* =========================================================
   MULTER - PROFILE IMAGE
========================================================= */

const storage =
    multer.diskStorage({

        destination: function (
            req,
            file,
            cb
        ) {

            cb(null, uploadsPath);

        },


        filename: function (
            req,
            file,
            cb
        ) {

            const extension =
                path.extname(file.originalname);

            const filename =
                "avatar-" +
                Date.now() +
                "-" +
                Math.round(
                    Math.random() * 100000
                ) +
                extension;

            cb(null, filename);

        }

    });


const upload =
    multer({

        storage: storage,

        limits: {
            fileSize: 5 * 1024 * 1024
        },

        fileFilter:
            function (
                req,
                file,
                cb
            ) {

                const allowed =
                    /jpg|jpeg|png|gif|webp/i;

                const valid =
                    allowed.test(
                        path.extname(
                            file.originalname
                        )
                    );

                if (valid) {

                    cb(null, true);

                } else {

                    cb(
                        new Error(
                            "Only image files are allowed."
                        )
                    );

                }

            }

    });


/* =========================================================
   HELPERS
========================================================= */

function requireLogin(
    req,
    res,
    next
) {

    if (!req.session.user) {

        return res.status(401).json({
            message: "Please login first."
        });

    }

    next();
}


async function createNotification(
    userId,
    senderId,
    type,
    message,
    referenceId = null
) {

    if (
        !userId ||
        !senderId ||
        userId === senderId
    ) {

        return;

    }

    await db.query(
        `INSERT INTO notifications
        (
            user_id,
            sender_id,
            type,
            message,
            reference_id
        )
        VALUES (?, ?, ?, ?, ?)`,
        [
            userId,
            senderId,
            type,
            message,
            referenceId
        ]
    );
}


/* =========================================================
   TEST
========================================================= */

app.get(
    "/api/test",
    async (req, res) => {

        res.json({
            success: true,
            message: "Sociora API is working!"
        });

    }
);


/* =========================================================
   HOME
========================================================= */

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                frontendPath,
                "index.html"
            )
        );

    }
);


/* =========================================================
   AUTH - REGISTER
========================================================= */

app.post(
    "/api/auth/register",
    async (req, res) => {

        try {

            const {
                username,
                email,
                password
            } = req.body;


            if (
                !username ||
                !email ||
                !password
            ) {

                return res.status(400).json({
                    message:
                        "All fields are required."
                });

            }


            if (password.length < 6) {

                return res.status(400).json({
                    message:
                        "Password must be at least 6 characters."
                });

            }


            const [
                existing
            ] = await db.query(
                `SELECT id
                 FROM users
                 WHERE email = ?
                 OR username = ?
                 LIMIT 1`,
                [
                    email,
                    username
                ]
            );


            if (existing.length) {

                return res.status(400).json({
                    message:
                        "Username or email already exists."
                });

            }


            const hashedPassword =
                await bcrypt.hash(
                    password,
                    10
                );


            const [
                result
            ] = await db.query(
                `INSERT INTO users
                (
                    username,
                    email,
                    password
                )
                VALUES (?, ?, ?)`,
                [
                    username,
                    email,
                    hashedPassword
                ]
            );


            await db.query(
                `INSERT INTO profiles
                (
                    user_id,
                    bio,
                    location,
                    website
                )
                VALUES (?, '', '', '')`,
                [result.insertId]
            );


            res.status(201).json({
                success: true,
                message:
                    "Registration successful."
            });

        } catch (error) {

            console.error(
                "Register error:",
                error
            );

            res.status(500).json({
                message:
                    "Registration failed."
            });

        }

    }
);


/* =========================================================
   AUTH - LOGIN
========================================================= */

app.post(
    "/api/auth/login",
    async (req, res) => {

        try {

            const {
                email,
                password
            } = req.body;


            const [
                users
            ] = await db.query(
                `SELECT
                    id,
                    username,
                    email,
                    password
                 FROM users
                 WHERE email = ?
                 LIMIT 1`,
                [email]
            );


            if (!users.length) {

                return res.status(401).json({
                    message:
                        "Invalid email or password."
                });

            }


            const user =
                users[0];


            const valid =
                await bcrypt.compare(
                    password,
                    user.password
                );


            if (!valid) {

                return res.status(401).json({
                    message:
                        "Invalid email or password."
                });

            }


            req.session.user = {
                id: user.id,
                username: user.username,
                email: user.email
            };


            res.json({
                success: true,
                user: req.session.user
            });

        } catch (error) {

            console.error(
                "Login error:",
                error
            );

            res.status(500).json({
                message:
                    "Login failed."
            });

        }

    }
);


/* =========================================================
   AUTH - CURRENT USER
========================================================= */

app.get(
    "/api/auth/me",
    (req, res) => {

        if (!req.session.user) {

            return res.status(401).json({
                message:
                    "Not logged in."
            });

        }


        res.json({
            user: req.session.user
        });

    }
);


/* =========================================================
   AUTH - LOGOUT
========================================================= */

app.post(
    "/api/auth/logout",
    (req, res) => {

        req.session.destroy(
            function () {

                res.json({
                    success: true
                });

            }
        );

    }
);


/* =========================================================
   FORGOT PASSWORD
========================================================= */

app.post(
    "/api/auth/forgot-password",
    async (req, res) => {

        try {

            const {
                email
            } = req.body;


            if (!email) {

                return res.status(400).json({
                    message:
                        "Email is required."
                });

            }


            const [
                users
            ] = await db.query(
                `SELECT id, username, email
                 FROM users
                 WHERE email = ?
                 LIMIT 1`,
                [email]
            );


            /*
             * Always return a generic message.
             * This prevents exposing whether
             * an email exists.
             */

            if (!users.length) {

                return res.json({
                    success: true,
                    message:
                        "If this email exists, a reset link has been generated."
                });

            }


            const user =
                users[0];


            await db.query(
                `DELETE FROM password_reset_tokens
                 WHERE user_id = ?`,
                [user.id]
            );


            const token =
                crypto.randomBytes(32)
                .toString("hex");


            const expires =
                new Date(
                    Date.now() +
                    15 * 60 * 1000
                );


            await db.query(
                `INSERT INTO password_reset_tokens
                (
                    user_id,
                    token,
                    expires_at
                )
                VALUES (?, ?, ?)`,
                [
                    user.id,
                    token,
                    expires
                ]
            );


            const resetUrl =
                `http://localhost:${PORT}/pages/reset-password.html?token=${token}`;


            /*
             * Email configuration
             */

            if (
                process.env.SMTP_USER &&
                process.env.SMTP_PASS
            ) {

                const transporter =
                    nodemailer.createTransport({

                        host:
                            process.env.SMTP_HOST,

                        port:
                            Number(
                                process.env.SMTP_PORT ||
                                587
                            ),

                        secure: false,

                        auth: {
                            user:
                                process.env.SMTP_USER,

                            pass:
                                process.env.SMTP_PASS
                        }

                    });


                await transporter.sendMail({

                    from:
                        process.env.SMTP_FROM ||
                        "Sociora",

                    to: user.email,

                    subject:
                        "Sociora Password Reset",

                    html: `
                        <div style="
                            font-family:Arial;
                            max-width:600px;
                            margin:auto;
                            padding:30px;
                        ">

                            <h2>
                                Sociora Password Reset
                            </h2>

                            <p>
                                Hello ${user.username},
                            </p>

                            <p>
                                Click the button below
                                to reset your password.
                            </p>

                            <a
                                href="${resetUrl}"
                                style="
                                    display:inline-block;
                                    padding:12px 20px;
                                    background:#4f46e5;
                                    color:white;
                                    text-decoration:none;
                                    border-radius:8px;
                                "
                            >
                                Reset Password
                            </a>

                            <p>
                                This link expires in
                                15 minutes.
                            </p>

                        </div>
                    `

                });

            } else {

                /*
                 * Local development mode.
                 * The link appears in terminal.
                 */

                console.log(
                    "\n================================="
                );

                console.log(
                    "SOCIORA PASSWORD RESET LINK:"
                );

                console.log(resetUrl);

                console.log(
                    "=================================\n"
                );

            }


            res.json({
                success: true,
                message:
                    "If this email exists, a password reset link has been generated."
            });

        } catch (error) {

            console.error(
                "Forgot password error:",
                error
            );

            res.status(500).json({
                message:
                    "Could not process password reset."
            });

        }

    }
);


/* =========================================================
   RESET PASSWORD
========================================================= */

app.post(
    "/api/auth/reset-password",
    async (req, res) => {

        try {

            const {
                token,
                password
            } = req.body;


            if (
                !token ||
                !password
            ) {

                return res.status(400).json({
                    message:
                        "Token and password are required."
                });

            }


            if (password.length < 6) {

                return res.status(400).json({
                    message:
                        "Password must be at least 6 characters."
                });

            }


            const [
                rows
            ] = await db.query(
                `SELECT
                    id,
                    user_id
                 FROM password_reset_tokens
                 WHERE token = ?
                 AND expires_at > NOW()
                 LIMIT 1`,
                [token]
            );


            if (!rows.length) {

                return res.status(400).json({
                    message:
                        "Reset link is invalid or expired."
                });

            }


            const reset =
                rows[0];


            const hashedPassword =
                await bcrypt.hash(
                    password,
                    10
                );


            await db.query(
                `UPDATE users
                 SET password = ?
                 WHERE id = ?`,
                [
                    hashedPassword,
                    reset.user_id
                ]
            );


            await db.query(
                `DELETE FROM password_reset_tokens
                 WHERE id = ?`,
                [reset.id]
            );


            res.json({
                success: true,
                message:
                    "Password reset successful."
            });

        } catch (error) {

            console.error(
                "Reset password error:",
                error
            );

            res.status(500).json({
                message:
                    "Password reset failed."
            });

        }

    }
);


/* =========================================================
   POSTS - GET
========================================================= */

app.get(
    "/api/posts",
    async (req, res) => {

        try {

            const currentUserId =
                req.session.user
                    ? req.session.user.id
                    : 0;


            const [
                posts
            ] = await db.query(
                `SELECT
                    p.id,
                    p.user_id,
                    p.content,
                    p.created_at,

                    u.username,

                    pr.avatar,

                    (
                        SELECT COUNT(*)
                        FROM likes l
                        WHERE l.post_id = p.id
                    ) AS like_count,

                    (
                        SELECT COUNT(*)
                        FROM comments c
                        WHERE c.post_id = p.id
                    ) AS comment_count,

                    EXISTS(
                        SELECT 1
                        FROM likes ul
                        WHERE ul.post_id = p.id
                        AND ul.user_id = ?
                    ) AS is_liked

                 FROM posts p

                 JOIN users u
                    ON p.user_id = u.id

                 LEFT JOIN profiles pr
                    ON u.id = pr.user_id

                 ORDER BY
                    p.created_at DESC`,
                [currentUserId]
            );


            res.json(posts);

        } catch (error) {

            console.error(
                "Get posts error:",
                error
            );

            res.status(500).json({
                message:
                    "Could not load posts."
            });

        }

    }
);


/* =========================================================
   POSTS - CREATE
========================================================= */

app.post(
    "/api/posts",
    requireLogin,
    async (req, res) => {

        try {

            const {
                content
            } = req.body;


            if (
                !content ||
                !content.trim()
            ) {

                return res.status(400).json({
                    message:
                        "Post cannot be empty."
                });

            }


            const [
                result
            ] = await db.query(
                `INSERT INTO posts
                (
                    user_id,
                    content
                )
                VALUES (?, ?)`,
                [
                    req.session.user.id,
                    content.trim()
                ]
            );


            res.status(201).json({
                success: true,
                postId:
                    result.insertId
            });

        } catch (error) {

            console.error(
                "Create post error:",
                error
            );

            res.status(500).json({
                message:
                    "Could not create post."
            });

        }

    }
);


/* =========================================================
   POSTS - EDIT
========================================================= */

app.put(
    "/api/posts/:id",
    requireLogin,
    async (req, res) => {

        try {

            const postId =
                Number(req.params.id);


            const {
                content
            } = req.body;


            const [
                result
            ] = await db.query(
                `UPDATE posts
                 SET content = ?
                 WHERE id = ?
                 AND user_id = ?`,
                [
                    content,
                    postId,
                    req.session.user.id
                ]
            );


            if (!result.affectedRows) {

                return res.status(404).json({
                    message:
                        "Post not found."
                });

            }


            res.json({
                success: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not edit post."
            });

        }

    }
);


/* =========================================================
   POSTS - DELETE
========================================================= */

app.delete(
    "/api/posts/:id",
    requireLogin,
    async (req, res) => {

        try {

            const [
                result
            ] = await db.query(
                `DELETE FROM posts
                 WHERE id = ?
                 AND user_id = ?`,
                [
                    req.params.id,
                    req.session.user.id
                ]
            );


            if (!result.affectedRows) {

                return res.status(404).json({
                    message:
                        "Post not found."
                });

            }


            res.json({
                success: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not delete post."
            });

        }

    }
);


/* =========================================================
   LIKE
========================================================= */

app.post(
    "/api/posts/:id/like",
    requireLogin,
    async (req, res) => {

        try {

            const postId =
                Number(req.params.id);


            const [
                posts
            ] = await db.query(
                `SELECT user_id
                 FROM posts
                 WHERE id = ?
                 LIMIT 1`,
                [postId]
            );


            if (!posts.length) {

                return res.status(404).json({
                    message:
                        "Post not found."
                });

            }


            const [
                existing
            ] = await db.query(
                `SELECT id
                 FROM likes
                 WHERE post_id = ?
                 AND user_id = ?
                 LIMIT 1`,
                [
                    postId,
                    req.session.user.id
                ]
            );


            if (existing.length) {

                return res.json({
                    success: true,
                    liked: true
                });

            }


            await db.query(
                `INSERT INTO likes
                (
                    post_id,
                    user_id
                )
                VALUES (?, ?)`,
                [
                    postId,
                    req.session.user.id
                ]
            );


            await createNotification(
                posts[0].user_id,
                req.session.user.id,
                "like",
                `${req.session.user.username} liked your post.`,
                postId
            );


            res.json({
                success: true,
                liked: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not like post."
            });

        }

    }
);


app.delete(
    "/api/posts/:id/like",
    requireLogin,
    async (req, res) => {

        try {

            await db.query(
                `DELETE FROM likes
                 WHERE post_id = ?
                 AND user_id = ?`,
                [
                    req.params.id,
                    req.session.user.id
                ]
            );


            res.json({
                success: true,
                liked: false
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not unlike post."
            });

        }

    }
);


/* =========================================================
   COMMENTS
========================================================= */

app.get(
    "/api/posts/:id/comments",
    async (req, res) => {

        try {

            const [
                comments
            ] = await db.query(
                `SELECT
                    c.id,
                    c.post_id,
                    c.user_id,
                    c.comment,
                    c.created_at,
                    u.username,
                    p.avatar

                 FROM comments c

                 JOIN users u
                    ON c.user_id = u.id

                 LEFT JOIN profiles p
                    ON u.id = p.user_id

                 WHERE c.post_id = ?

                 ORDER BY
                    c.created_at ASC`,
                [req.params.id]
            );


            res.json(comments);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load comments."
            });

        }

    }
);


app.post(
    "/api/posts/:id/comments",
    requireLogin,
    async (req, res) => {

        try {

            const {
                comment
            } = req.body;


            if (
                !comment ||
                !comment.trim()
            ) {

                return res.status(400).json({
                    message:
                        "Comment cannot be empty."
                });

            }


            const [
                posts
            ] = await db.query(
                `SELECT user_id
                 FROM posts
                 WHERE id = ?
                 LIMIT 1`,
                [req.params.id]
            );


            if (!posts.length) {

                return res.status(404).json({
                    message:
                        "Post not found."
                });

            }


            const [
                result
            ] = await db.query(
                `INSERT INTO comments
                (
                    post_id,
                    user_id,
                    comment
                )
                VALUES (?, ?, ?)`,
                [
                    req.params.id,
                    req.session.user.id,
                    comment.trim()
                ]
            );


            await createNotification(
                posts[0].user_id,
                req.session.user.id,
                "comment",
                `${req.session.user.username} commented on your post.`,
                Number(req.params.id)
            );


            res.status(201).json({
                success: true,
                commentId:
                    result.insertId
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not add comment."
            });

        }

    }
);


app.delete(
    "/api/comments/:id",
    requireLogin,
    async (req, res) => {

        try {

            const [
                result
            ] = await db.query(
                `DELETE FROM comments
                 WHERE id = ?
                 AND user_id = ?`,
                [
                    req.params.id,
                    req.session.user.id
                ]
            );


            if (!result.affectedRows) {

                return res.status(404).json({
                    message:
                        "Comment not found."
                });

            }


            res.json({
                success: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not delete comment."
            });

        }

    }
);


/* =========================================================
   USERS
========================================================= */

app.get(
    "/api/users",
    requireLogin,
    async (req, res) => {

        try {

            const [
                users
            ] = await db.query(
                `SELECT
                    u.id,
                    u.username,
                    u.email,
                    p.avatar

                 FROM users u

                 LEFT JOIN profiles p
                    ON u.id = p.user_id

                 WHERE u.id != ?

                 ORDER BY
                    u.username ASC`,
                [req.session.user.id]
            );


            res.json(users);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load users."
            });

        }

    }
);


/* =========================================================
   MESSAGES
========================================================= */

app.get(
    "/api/messages/:userId",
    requireLogin,
    async (req, res) => {

        try {

            const [
                messages
            ] = await db.query(
                `SELECT
                    id,
                    sender_id,
                    receiver_id,
                    message,
                    created_at,
                    is_read

                 FROM messages

                 WHERE
                    (
                        sender_id = ?
                        AND receiver_id = ?
                    )

                    OR

                    (
                        sender_id = ?
                        AND receiver_id = ?
                    )

                 ORDER BY
                    created_at ASC`,
                [
                    req.session.user.id,
                    req.params.userId,

                    req.params.userId,
                    req.session.user.id
                ]
            );


            await db.query(
                `UPDATE messages
                 SET is_read = TRUE
                 WHERE sender_id = ?
                 AND receiver_id = ?`,
                [
                    req.params.userId,
                    req.session.user.id
                ]
            );


            res.json(messages);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load messages."
            });

        }

    }
);


app.post(
    "/api/messages",
    requireLogin,
    async (req, res) => {

        try {

            const {
                receiver_id,
                message
            } = req.body;


            if (
                !receiver_id ||
                !message ||
                !message.trim()
            ) {

                return res.status(400).json({
                    message:
                        "Receiver and message are required."
                });

            }


            const [
                result
            ] = await db.query(
                `INSERT INTO messages
                (
                    sender_id,
                    receiver_id,
                    message
                )
                VALUES (?, ?, ?)`,
                [
                    req.session.user.id,
                    receiver_id,
                    message.trim()
                ]
            );


            res.status(201).json({
                success: true,
                messageId:
                    result.insertId
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not send message."
            });

        }

    }
);


/* =========================================================
   PROFILE - MY PROFILE
========================================================= */

app.get(
    "/api/profile/me",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                req.session.user.id;


            const [
                rows
            ] = await db.query(
                `SELECT
                    u.id,
                    u.username,
                    u.email,
                    u.created_at,

                    p.bio,
                    p.avatar,
                    p.location,
                    p.website,

                    (
                        SELECT COUNT(*)
                        FROM follows
                        WHERE following_id = u.id
                    ) AS followers_count,

                    (
                        SELECT COUNT(*)
                        FROM follows
                        WHERE follower_id = u.id
                    ) AS following_count,

                    (
                        SELECT COUNT(*)
                        FROM posts
                        WHERE user_id = u.id
                    ) AS posts_count

                 FROM users u

                 LEFT JOIN profiles p
                    ON u.id = p.user_id

                 WHERE u.id = ?
                 LIMIT 1`,
                [userId]
            );


            res.json(rows[0]);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load profile."
            });

        }

    }
);


/* =========================================================
   PROFILE - OTHER USER
========================================================= */

app.get(
    "/api/profile/:userId",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                Number(req.params.userId);


            const [
                rows
            ] = await db.query(
                `SELECT
                    u.id,
                    u.username,
                    u.email,
                    u.created_at,

                    p.bio,
                    p.avatar,
                    p.location,
                    p.website,

                    (
                        SELECT COUNT(*)
                        FROM follows
                        WHERE following_id = u.id
                    ) AS followers_count,

                    (
                        SELECT COUNT(*)
                        FROM follows
                        WHERE follower_id = u.id
                    ) AS following_count,

                    (
                        SELECT COUNT(*)
                        FROM posts
                        WHERE user_id = u.id
                    ) AS posts_count,

                    EXISTS(
                        SELECT 1
                        FROM follows f
                        WHERE f.follower_id = ?
                        AND f.following_id = u.id
                    ) AS is_following

                 FROM users u

                 LEFT JOIN profiles p
                    ON u.id = p.user_id

                 WHERE u.id = ?
                 LIMIT 1`,
                [
                    req.session.user.id,
                    userId
                ]
            );


            if (!rows.length) {

                return res.status(404).json({
                    message:
                        "User not found."
                });

            }


            res.json(rows[0]);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load profile."
            });

        }

    }
);


/* =========================================================
   PROFILE - UPDATE TEXT
========================================================= */

app.put(
    "/api/profile",
    requireLogin,
    async (req, res) => {

        try {

            const {
                bio,
                location,
                website
            } = req.body;


            await db.query(
                `INSERT INTO profiles
                (
                    user_id,
                    bio,
                    location,
                    website
                )
                VALUES (?, ?, ?, ?)

                ON DUPLICATE KEY UPDATE

                    bio = VALUES(bio),
                    location = VALUES(location),
                    website = VALUES(website)`,
                [
                    req.session.user.id,
                    bio || "",
                    location || "",
                    website || ""
                ]
            );


            res.json({
                success: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not update profile."
            });

        }

    }
);


/* =========================================================
   PROFILE - AVATAR UPLOAD
========================================================= */

app.post(
    "/api/profile/avatar",
    requireLogin,
    upload.single("avatar"),

    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    message:
                        "Please select an image."
                });

            }


            const avatarUrl =
                `/uploads/${req.file.filename}`;


            await db.query(
                `INSERT INTO profiles
                (
                    user_id,
                    avatar
                )
                VALUES (?, ?)

                ON DUPLICATE KEY UPDATE
                    avatar = VALUES(avatar)`,
                [
                    req.session.user.id,
                    avatarUrl
                ]
            );


            res.json({
                success: true,
                avatar: avatarUrl
            });

        } catch (error) {

            console.error(
                "Avatar upload error:",
                error
            );

            res.status(500).json({
                message:
                    "Could not upload profile picture."
            });

        }

    }
);


/* =========================================================
   FOLLOW
========================================================= */

app.post(
    "/api/users/:id/follow",
    requireLogin,
    async (req, res) => {

        try {

            const targetId =
                Number(req.params.id);

            const currentId =
                req.session.user.id;


            if (
                targetId === currentId
            ) {

                return res.status(400).json({
                    message:
                        "You cannot follow yourself."
                });

            }


            await db.query(
                `INSERT IGNORE INTO follows
                (
                    follower_id,
                    following_id
                )
                VALUES (?, ?)`,
                [
                    currentId,
                    targetId
                ]
            );


            await createNotification(
                targetId,
                currentId,
                "follow",
                `${req.session.user.username} started following you.`,
                currentId
            );


            res.json({
                success: true,
                following: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not follow user."
            });

        }

    }
);


app.delete(
    "/api/users/:id/follow",
    requireLogin,
    async (req, res) => {

        try {

            await db.query(
                `DELETE FROM follows
                 WHERE follower_id = ?
                 AND following_id = ?`,
                [
                    req.session.user.id,
                    req.params.id
                ]
            );


            res.json({
                success: true,
                following: false
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not unfollow user."
            });

        }

    }
);


/* =========================================================
   FOLLOWERS / FOLLOWING
========================================================= */

app.get(
    "/api/users/:id/followers",
    requireLogin,
    async (req, res) => {

        try {

            const [
                users
            ] = await db.query(
                `SELECT
                    u.id,
                    u.username,
                    p.avatar

                 FROM follows f

                 JOIN users u
                    ON f.follower_id = u.id

                 LEFT JOIN profiles p
                    ON u.id = p.user_id

                 WHERE f.following_id = ?

                 ORDER BY f.created_at DESC`,
                [req.params.id]
            );


            res.json(users);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load followers."
            });

        }

    }
);


app.get(
    "/api/users/:id/following",
    requireLogin,
    async (req, res) => {

        try {

            const [
                users
            ] = await db.query(
                `SELECT
                    u.id,
                    u.username,
                    p.avatar

                 FROM follows f

                 JOIN users u
                    ON f.following_id = u.id

                 LEFT JOIN profiles p
                    ON u.id = p.user_id

                 WHERE f.follower_id = ?

                 ORDER BY f.created_at DESC`,
                [req.params.id]
            );


            res.json(users);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load following."
            });

        }

    }
);


/* =========================================================
   NOTIFICATIONS
========================================================= */

app.get(
    "/api/notifications",
    requireLogin,
    async (req, res) => {

        try {

            const [
                notifications
            ] = await db.query(
                `SELECT
                    n.id,
                    n.type,
                    n.message,
                    n.reference_id,
                    n.is_read,
                    n.created_at,

                    u.username AS sender_username,
                    p.avatar AS sender_avatar

                 FROM notifications n

                 LEFT JOIN users u
                    ON n.sender_id = u.id

                 LEFT JOIN profiles p
                    ON u.id = p.user_id

                 WHERE n.user_id = ?

                 ORDER BY
                    n.created_at DESC`,
                [req.session.user.id]
            );


            res.json(notifications);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not load notifications."
            });

        }

    }
);


app.get(
    "/api/notifications/count",
    requireLogin,
    async (req, res) => {

        try {

            const [
                rows
            ] = await db.query(
                `SELECT COUNT(*) AS count
                 FROM notifications
                 WHERE user_id = ?
                 AND is_read = FALSE`,
                [req.session.user.id]
            );


            res.json({
                count:
                    Number(rows[0].count)
            });

        } catch (error) {

            res.status(500).json({
                count: 0
            });

        }

    }
);


app.put(
    "/api/notifications/:id/read",
    requireLogin,
    async (req, res) => {

        try {

            await db.query(
                `UPDATE notifications
                 SET is_read = TRUE
                 WHERE id = ?
                 AND user_id = ?`,
                [
                    req.params.id,
                    req.session.user.id
                ]
            );


            res.json({
                success: true
            });

        } catch (error) {

            res.status(500).json({
                message:
                    "Could not update notification."
            });

        }

    }
);


app.put(
    "/api/notifications/read-all",
    requireLogin,
    async (req, res) => {

        try {

            await db.query(
                `UPDATE notifications
                 SET is_read = TRUE
                 WHERE user_id = ?`,
                [req.session.user.id]
            );


            res.json({
                success: true
            });

        } catch (error) {

            res.status(500).json({
                message:
                    "Could not update notifications."
            });

        }

    }
);


/* =========================================================
   SEARCH
========================================================= */

app.get(
    "/api/search",
    async (req, res) => {

        try {

            const query =
                (req.query.q || "").trim();


            if (!query) {

                return res.json({
                    users: [],
                    posts: []
                });

            }


            const search =
                `%${query}%`;


            const [
                users
            ] = await db.query(
                `SELECT
                    u.id,
                    u.username,
                    p.avatar,
                    p.bio

                 FROM users u

                 LEFT JOIN profiles p
                    ON u.id = p.user_id

                 WHERE u.username LIKE ?

                 ORDER BY
                    u.username ASC

                 LIMIT 20`,
                [search]
            );


            const [
                posts
            ] = await db.query(
                `SELECT
                    p.id,
                    p.user_id,
                    p.content,
                    p.created_at,

                    u.username,

                    pr.avatar,

                    (
                        SELECT COUNT(*)
                        FROM likes l
                        WHERE l.post_id = p.id
                    ) AS like_count,

                    (
                        SELECT COUNT(*)
                        FROM comments c
                        WHERE c.post_id = p.id
                    ) AS comment_count

                 FROM posts p

                 JOIN users u
                    ON p.user_id = u.id

                 LEFT JOIN profiles pr
                    ON u.id = pr.user_id

                 WHERE p.content LIKE ?

                 ORDER BY
                    p.created_at DESC

                 LIMIT 30`,
                [search]
            );


            res.json({
                users,
                posts
            });

        } catch (error) {

            console.error(
                "Search error:",
                error
            );

            res.status(500).json({
                message:
                    "Search failed."
            });

        }

    }
);


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    function (
        error,
        req,
        res,
        next
    ) {

        console.error(error);

        res.status(500).json({
            message:
                error.message ||
                "Server error."
        });

    }
);


/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

    try {

        await db.query(
            "SELECT 1"
        );

        console.log(
            "✅ MySQL Database Connected Successfully!"
        );


        app.listen(
            PORT,
            () => {

                console.log(
                    `🚀 Sociora server running at http://localhost:${PORT}`
                );

            }
        );

    } catch (error) {

        console.error(
            "❌ Database connection failed:",
            error
        );

    }

}


startServer();