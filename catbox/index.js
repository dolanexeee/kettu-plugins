(function (s, n, t, i, u, d, f) {
/* Kettu plugin (Vendetta format): Catbox Upload — v1.0.0
 *
 * Upload a file to Catbox anonymously and get a permanent public link.
 * Two ways to use it:
 *   1. Long-press a message that has an attachment -> "Upload to Catbox".
 *      The link is copied to the clipboard and shown in an alert.
 *   2. Slash command: /catbox <url> — uploads the file at a public URL and
 *      posts the Catbox link in chat.
 *
 * Catbox API (verified from Catbox docs / community API references):
 *   POST https://catbox.moe/user/api.php
 *   multipart form: reqtype=fileupload, fileToUpload=<file>, userhash optional
 *   (empty/omitted = anonymous). Response is the plain-text file URL:
 *   https://files.catbox.moe/<id>.<ext>. Limit 200 MB, permanent.
 *
 * Plugin format (verified from Kettu source + the working c10udburst
 * delete-embeds plugin): this file evaluates to an object with
 * { onLoad, onUnload }. The message-sheet row is added by patching
 * ActionSheet openLazy for "MessageLongPressActionSheet" and pushing a
 * FormRow into the ButtonRow group — the exact pattern delete-embeds uses.
 *
 * Honest limits: this plugin cannot pick files from the device — the
 * Vendetta/Kettu API exposes no file picker. It uploads files that are
 * already reachable: message attachments, or a public URL you paste. */
    "use strict";

    var CATBOX_API = "https://catbox.moe/user/api.php";
    var MAX_BYTES = 200 * 1024 * 1024; // Catbox anonymous limit: 200 MB

    var patches = [];
    var unregisterCommand = null;

    function toast(msg) {
        try { t.toasts.open({ content: String(msg) }); } catch (e) {}
    }

    function copyText(text) {
        try { t.clipboard.setString(text); } catch (e) {}
    }

    function filenameFromUrl(url) {
        try {
            var path = url.split("?")[0].split("#")[0];
            var name = path.substring(path.lastIndexOf("/") + 1);
            if (name) return decodeURIComponent(name);
        } catch (e) {}
        return "file";
    }

    // POST a Blob to Catbox. Resolves with the files.catbox.moe URL.
    function uploadBlob(blob, filename) {
        var form = new FormData();
        form.append("reqtype", "fileupload");
        form.append("fileToUpload", blob, filename);
        return fetch(CATBOX_API, { method: "POST", body: form })
            .then(function (r) { return r.text(); })
            .then(function (text) {
                text = (text || "").trim();
                if (text.indexOf("https://files.catbox.moe/") !== 0) {
                    throw new Error(text || "Catbox rejected the upload");
                }
                return text;
            });
    }

    // Download a public URL, then upload its bytes to Catbox.
    function uploadFromUrl(url) {
        toast("Uploading to Catbox…");
        return fetch(url).then(function (r) {
            if (!r.ok) throw new Error("Could not download file (HTTP " + r.status + ")");
            return r.blob();
        }).then(function (blob) {
            if (blob.size > MAX_BYTES) throw new Error("File is over the 200 MB Catbox limit");
            if (!blob.size) throw new Error("Downloaded file is empty");
            return uploadBlob(blob, filenameFromUrl(url));
        });
    }

    function showLinks(links) {
        var text = links.join("\n");
        copyText(text);
        try {
            vendetta.ui.alerts.showConfirmationAlert({
                title: "Catbox upload",
                content: "Link copied to clipboard:\n" + text,
                confirmText: "Copy again",
                onConfirm: function () { copyText(text); },
                cancelText: "Close"
            });
        } catch (e) {
            toast("Catbox link copied: " + text);
        }
    }

    function uploadAttachments(message) {
        var atts = (message.attachments || []).filter(function (a) { return a && a.url; });
        if (!atts.length) { toast("No attachment to upload"); return; }
        toast("Uploading " + atts.length + " file(s) to Catbox…");
        var jobs = atts.map(function (a) { return uploadFromUrl(a.url); });
        Promise.all(jobs).then(function (links) {
            showLinks(links);
        }).catch(function (err) {
            toast("Catbox upload failed: " + (err && err.message ? err.message : "unknown error"));
        });
    }

    function patchMessageSheet() {
        var ActionSheet = n.findByProps("openLazy", "hideActionSheet");
        if (!ActionSheet) return;
        var Forms = u.Forms;
        if (!Forms || !Forms.FormRow) return;

        patches.push(i.before("openLazy", ActionSheet, function (args) {
            var lazyComp = args[0];
            var sheetName = args[1];
            var props = args[2];
            var message = props && props.message;
            if (sheetName !== "MessageLongPressActionSheet" || !message) return;
            if (!message.attachments || !message.attachments.length) return;

            lazyComp.then(function (comp) {
                var unpatch = i.after("default", comp, function (a, res) {
                    t.React.useEffect(function () {
                        return function () { unpatch(); };
                    }, []);
                    var rows = f.findInReactTree(res, function (x) {
                        return x && x[0] && x[0].type && x[0].type.name === "ButtonRow";
                    });
                    if (!rows) return;
                    rows.push(t.React.createElement(Forms.FormRow, {
                        label: "Upload to Catbox",
                        onPress: function () {
                            ActionSheet.hideActionSheet();
                            uploadAttachments(message);
                        }
                    }));
                });
            });
        }));
    }

    function registerCommand() {
        try {
            // ApplicationCommandOptionType (Kettu src/lib/api/commands/types.ts):
            // SUB_COMMAND=1, SUB_COMMAND_GROUP=2, STRING=3, INTEGER=4,
            // BOOLEAN=5, USER=6, CHANNEL=7, ROLE=8, MENTIONABLE=9, NUMBER=10
            unregisterCommand = vendetta.commands.registerCommand({
                name: "catbox",
                description: "Upload a file from a public URL to Catbox (anonymous, permanent link)",
                options: [{
                    name: "url",
                    description: "Public URL of the file to upload",
                    type: 3, // STRING
                    required: true
                }],
                execute: function (args) {
                    var arg = null;
                    for (var k = 0; k < args.length; k++) {
                        if (args[k].name === "url") arg = args[k].value;
                    }
                    if (!arg || !/^https?:\/\//i.test(arg)) {
                        toast("Give a public http(s) URL to upload");
                        return;
                    }
                    return uploadFromUrl(arg).then(function (link) {
                        return { content: link };
                    }).catch(function (err) {
                        toast("Catbox upload failed: " + (err && err.message ? err.message : "unknown error"));
                    });
                }
            });
        } catch (e) {}
    }

    var P = {
        onLoad: function () {
            patchMessageSheet();
            registerCommand();
        },
        onUnload: function () {
            for (var k = 0; k < patches.length; k++) {
                try { patches[k](); } catch (e) {}
            }
            patches = [];
            if (unregisterCommand) {
                try { unregisterCommand(); } catch (e) {}
                unregisterCommand = null;
            }
        }
    };

    return s.default = P, Object.defineProperty(s, "__esModule", { value: true }), s;
})({}, vendetta.metro, vendetta.metro.common, vendetta.patcher, vendetta.ui.components, vendetta.ui.assets, vendetta.utils);
