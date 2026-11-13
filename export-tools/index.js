/* Kettu plugin (Vendetta format): Export Tools — v1.0.0
 *
 * Export what the client has loaded, copied to the clipboard:
 *   /exportmessages — the messages loaded in the current channel (JSON).
 *   /exportmembers  — the members loaded in the current server (CSV).
 * Paste the clipboard into Notes/Files to save it as a file.
 *
 * Logic ported from the Discord Plus v1.1 exportTools.js plugin:
 * channel messages from MessageStore, member list from
 * GuildMemberStore.getMembers + UserStore.getUser. Same honesty rule as
 * the web version: ONLY loaded messages/members are exported — scroll up
 * to load more history first. Nothing is invented or fetched from the
 * API; this reads local client state only.
 *
 * Honest limits (mobile vs web): there is no DOM and no file download on
 * iOS React Native, so the web plugin's download button becomes "copy to
 * clipboard" here. MessageStore.getMessages is read defensively — if the
 * store shape differs on this Discord build, the command says so instead
 * of exporting garbage. */
(function (s, n, t, i, u, d, f) {
    "use strict";

    var unregisterCommands = [];

    function toast(msg) {
        try { t.toasts.open({ content: String(msg) }); } catch (e) {}
    }

    function copyText(text) {
        try { t.clipboard.setString(text); } catch (e) {}
    }

    function getMessageStore() {
        try {
            var store = n.findByStoreName("MessageStore");
            if (store) return store;
        } catch (e) {}
        return null;
    }

    function getGuildMemberStore() {
        try { return n.findByProps("getMember", "getMemberCount"); } catch (e) { return null; }
    }

    function getUserStore() {
        try { return n.findByProps("getCurrentUser", "getUser"); } catch (e) { return null; }
    }

    function getGuildId(ctx) {
        if (ctx && ctx.guild && ctx.guild.id) return String(ctx.guild.id);
        try {
            var store = n.findByStoreName("SelectedGuildStore");
            if (store && typeof store.getGuildId === "function") {
                var id = store.getGuildId();
                if (id) return String(id);
            }
        } catch (e) {}
        return null;
    }

    // MessageStore.getMessages(channelId) normally returns an array; be
    // defensive about the shape so a Discord change fails loudly, not
    // silently with wrong data.
    function loadedMessages(channelId) {
        var store = getMessageStore();
        if (!store || typeof store.getMessages !== "function") return null;
        var raw = null;
        try { raw = store.getMessages(channelId); } catch (e) { return null; }
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (Array.isArray(raw._array)) return raw._array;
        if (typeof raw === "object") return Object.keys(raw).map(function (k) { return raw[k]; });
        return null;
    }

    function registerCommands() {
        try {
            unregisterCommands.push(vendetta.commands.registerCommand({
                name: "exportmessages",
                description: "Copy the loaded messages of this channel to the clipboard (JSON)",
                options: [],
                execute: function (args, ctx) {
                    var channelId = ctx && ctx.channel && ctx.channel.id ? String(ctx.channel.id) : null;
                    if (!channelId) { toast("Run this inside a channel"); return; }
                    var msgs = loadedMessages(channelId);
                    if (msgs === null) {
                        toast("Could not read messages — store unavailable on this build");
                        return;
                    }
                    if (!msgs.length) {
                        toast("No messages loaded to export — scroll up first");
                        return;
                    }
                    var out = msgs
                        .filter(function (m) { return m && (m.content || (m.author && m.author.username)); })
                        .map(function (m) {
                            return {
                                id: m.id ? String(m.id) : null,
                                author: m.author ? (m.author.globalName || m.author.username || null) : null,
                                authorId: m.author && m.author.id ? String(m.author.id) : null,
                                content: m.content || "",
                                timestamp: m.timestamp ? String(m.timestamp) : null
                            };
                        })
                        .sort(function (a, b) {
                            var ta = a.timestamp ? Date.parse(a.timestamp) : 0;
                            var tb = b.timestamp ? Date.parse(b.timestamp) : 0;
                            return ta - tb;
                        })
                        .slice(0, 200);
                    if (!out.length) { toast("No messages loaded to export"); return; }
                    copyText(JSON.stringify(out, null, 2));
                    toast("Exported " + out.length + " messages to clipboard (JSON)");
                }
            }));
        } catch (e) {}

        try {
            unregisterCommands.push(vendetta.commands.registerCommand({
                name: "exportmembers",
                description: "Copy the loaded member list of this server to the clipboard (CSV)",
                options: [],
                execute: function (args, ctx) {
                    var guildId = getGuildId(ctx);
                    if (!guildId) { toast("Run this inside a server"); return; }
                    var store = getGuildMemberStore();
                    if (!store || typeof store.getMembers !== "function") {
                        toast("Could not read members — store unavailable on this build");
                        return;
                    }
                    var raw = null;
                    try { raw = store.getMembers(guildId); } catch (e) { raw = null; }
                    if (!raw) { toast("No members loaded to export"); return; }
                    var list = Array.isArray(raw) ? raw : Object.keys(raw).map(function (k) { return raw[k]; });
                    var userStore = getUserStore();
                    var seen = {};
                    var rows = [];
                    list.forEach(function (mem) {
                        if (!mem) return;
                        var uid = String((mem.userId || (mem.user && mem.user.id)) || "");
                        if (!uid || seen[uid]) return;
                        seen[uid] = true;
                        var user = null;
                        try {
                            if (userStore && typeof userStore.getUser === "function") user = userStore.getUser(uid);
                        } catch (e) {}
                        var name = (user && (user.globalName || user.username)) ||
                            (mem.user && (mem.user.globalName || mem.user.username)) || "";
                        rows.push({
                            userId: uid,
                            username: name,
                            joinedAt: mem.joinedAt || "",
                            roles: (mem.roles || []).join(";")
                        });
                    });
                    if (!rows.length) { toast("No members loaded to export"); return; }
                    var q = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
                    var csv = "userId,username,joinedAt,roles\n" + rows.map(function (r) {
                        return [q(r.userId), q(r.username), q(r.joinedAt), q(r.roles)].join(",");
                    }).join("\n");
                    copyText(csv);
                    toast("Exported " + rows.length + " members to clipboard (CSV)");
                }
            }));
        } catch (e) {}
    }

    var P = {
        onLoad: function () {
            registerCommands();
        },
        onUnload: function () {
            for (var k = 0; k < unregisterCommands.length; k++) {
                try { unregisterCommands[k](); } catch (e) {}
            }
            unregisterCommands = [];
        }
    };

    return s.default = P, Object.defineProperty(s, "__esModule", { value: true }), s;
})({}, vendetta.metro, vendetta.metro.common, vendetta.patcher, vendetta.ui.components, vendetta.ui.assets, vendetta.utils);
