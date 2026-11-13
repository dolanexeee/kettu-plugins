(function (s, n, t, i, u, d, f) {
/* Kettu plugin (Vendetta format): Member Details — v1.0.0
 *
 * Slash command: /userinfo <user>
 *   Replies with: account creation date (from the user ID snowflake — the
 *   same math Discord uses), account age, server join date, and roles.
 *   Dates use Discord's native timestamp markup (<t:epoch:D>), so the
 *   client renders them in the reader's own timezone.
 *
 * Data sources (ported from the Discord Plus v1.1 memberDetails.js
 * plugin): UserStore.getUser, GuildMemberStore.getMember(guildId, userId)
 * (.joinedAt, .roles), RoleStore.getRoles(guildId) for role names.
 * Store lookup is done lazily inside the command (never at load time).
 * Nothing is invented: a field the client has not loaded is shown as
 * "unknown" instead of guessed.
 *
 * Honest limits: there is no DOM on mobile, so details are not injected
 * into the profile popout the way the web plugin did it — the command
 * reply is the mobile-native equivalent. */
    "use strict";

    var unregisterCommand = null;

    function toast(msg) {
        try { t.toasts.open({ content: String(msg) }); } catch (e) {}
    }

    function getUserStore() {
        try { return n.findByProps("getCurrentUser", "getUser"); } catch (e) { return null; }
    }

    function getGuildMemberStore() {
        try { return n.findByProps("getMember", "getMemberCount"); } catch (e) { return null; }
    }

    function getRoleStore() {
        try { return n.findByProps("getRoles", "getRole"); } catch (e) { return null; }
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

    // Discord snowflake -> creation date (ported from DP loader.js
    // snowflakeDate). BigInt path first; Number fallback is safe here
    // because id / 2^22 is below 2^53, so only sub-millisecond bits are lost.
    function snowflakeDate(id) {
        try {
            var n = BigInt(id);
            return new Date(Number((n >> 22n) + 1420070400000n));
        } catch (e) {
            try {
                return new Date(Math.floor(Number(id) / 4194304) + 1420070400000);
            } catch (e2) { return null; }
        }
    }

    function accountAgeText(created) {
        var days = Math.floor((Date.now() - created.getTime()) / 86400000);
        if (days < 1) return "less than a day";
        if (days < 30) return days + " day" + (days === 1 ? "" : "s");
        if (days < 365) {
            var m = Math.floor(days / 30);
            return m + " month" + (m === 1 ? "" : "s");
        }
        var y = Math.floor(days / 365);
        var rem = Math.floor((days % 365) / 30);
        return y + " year" + (y === 1 ? "" : "s") + (rem ? " " + rem + " mo" : "");
    }

    function displayName(user, userId) {
        if (user) return user.globalName || user.username || userId;
        return userId;
    }

    function registerCommand() {
        try {
            // ApplicationCommandOptionType (Kettu src/lib/api/commands/types.ts):
            // SUB_COMMAND=1, SUB_COMMAND_GROUP=2, STRING=3, INTEGER=4,
            // BOOLEAN=5, USER=6, CHANNEL=7, ROLE=8, MENTIONABLE=9, NUMBER=10
            unregisterCommand = vendetta.commands.registerCommand({
                name: "userinfo",
                description: "Show account creation date, join date and roles for a member",
                options: [{
                    name: "user",
                    description: "The member to look up",
                    type: 6, // USER
                    required: true
                }],
                execute: function (args, ctx) {
                    var userId = null;
                    for (var k = 0; k < args.length; k++) {
                        if (args[k].name === "user") userId = args[k].value;
                    }
                    if (!userId) { toast("Pick a user first"); return; }
                    userId = String(userId);

                    var guildId = getGuildId(ctx);
                    var user = null;
                    try {
                        var userStore = getUserStore();
                        if (userStore && typeof userStore.getUser === "function") {
                            user = userStore.getUser(userId);
                        }
                    } catch (e) {}

                    var created = snowflakeDate(userId);
                    var joinedAt = null;
                    var roles = [];
                    if (guildId) {
                        try {
                            var memberStore = getGuildMemberStore();
                            var member = memberStore && typeof memberStore.getMember === "function"
                                ? memberStore.getMember(guildId, userId) : null;
                            if (member) {
                                if (!user && member.user) user = member.user;
                                if (member.joinedAt) joinedAt = new Date(member.joinedAt);
                                if (member.roles && member.roles.length) {
                                    var roleMap = null;
                                    try {
                                        var roleStore = getRoleStore();
                                        if (roleStore && typeof roleStore.getRoles === "function") {
                                            roleMap = roleStore.getRoles(guildId);
                                        }
                                    } catch (e) {}
                                    member.roles.forEach(function (rid) {
                                        if (String(rid) === guildId) return; // @everyone
                                        var role = null;
                                        if (roleMap) role = roleMap[rid] || roleMap[String(rid)] || null;
                                        if (Array.isArray(roleMap)) {
                                            for (var q = 0; q < roleMap.length; q++) {
                                                if (String(roleMap[q].id) === String(rid)) role = roleMap[q];
                                            }
                                        }
                                        roles.push(role && role.name ? role.name : String(rid));
                                    });
                                }
                            }
                        } catch (e) {}
                    }

                    var lines = ["**" + displayName(user, userId) + "** (<@" + userId + ">) — `" + userId + "`"];
                    if (created && !isNaN(created.getTime())) {
                        var epoch = Math.floor(created.getTime() / 1000);
                        lines.push("Account created: <t:" + epoch + ":D> (" + accountAgeText(created) + " old)");
                    } else {
                        lines.push("Account created: unknown");
                    }
                    if (joinedAt && !isNaN(joinedAt.getTime())) {
                        lines.push("Joined server: <t:" + Math.floor(joinedAt.getTime() / 1000) + ":D>");
                    } else if (guildId) {
                        lines.push("Joined server: unknown");
                    }
                    if (roles.length) {
                        lines.push("Roles (" + roles.length + "): " + roles.join(", "));
                    } else if (guildId) {
                        lines.push("Roles: none");
                    }
                    return { content: lines.join("\n") };
                }
            });
        } catch (e) {}
    }

    var P = {
        onLoad: function () {
            registerCommand();
        },
        onUnload: function () {
            if (unregisterCommand) {
                try { unregisterCommand(); } catch (e) {}
                unregisterCommand = null;
            }
        }
    };

    return s.default = P, Object.defineProperty(s, "__esModule", { value: true }), s;
})({}, vendetta.metro, vendetta.metro.common, vendetta.patcher, vendetta.ui.components, vendetta.ui.assets, vendetta.utils);
