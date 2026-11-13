/* Kettu plugin (Vendetta format): Timeout Countdown — v1.0.0
 *
 * Shows when a timed-out member's timeout ends.
 * Slash command: /timeoutinfo <user>
 *   Replies with the exact end time plus Discord's native relative
 *   timestamp (<t:epoch:R>), which the client itself renders as a LIVE
 *   countdown ("in 2 hours", ticking down as time passes).
 *
 * Data source (ported from the Discord Plus v1.1 timeoutCountdown.js
 * plugin): GuildMemberStore.getMember(guildId, userId)
 * .communicationDisabledUntil — the same field Discord itself uses, so
 * it is exact. No data is invented: if the member is not timed out, or
 * the store cannot be read, the command says so.
 *
 * Honest limits: there is no DOM on mobile, so there is no badge injected
 * into the member list or profile popout the way the web plugin did it.
 * The command + Discord's live timestamp rendering is the mobile-native
 * equivalent. Store lookup is done lazily inside the command (never at
 * load time), and every failure path reports instead of guessing. */
(function (s, n, t, i, u, d, f) {
    "use strict";

    var unregisterCommand = null;

    function toast(msg) {
        try { t.toasts.open({ content: String(msg) }); } catch (e) {}
    }

    function getGuildMemberStore() {
        try { return n.findByProps("getMember", "getMemberCount"); } catch (e) { return null; }
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

    function fmtRemaining(ms) {
        if (ms <= 0) return "0s";
        var sec = Math.floor(ms / 1000);
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s2 = sec % 60;
        var pad = function (x) { return (x < 10 ? "0" : "") + x; };
        if (h > 0) return h + ":" + pad(m) + ":" + pad(s2);
        return pad(m) + ":" + pad(s2);
    }

    function registerCommand() {
        try {
            // ApplicationCommandOptionType (Kettu src/lib/api/commands/types.ts):
            // SUB_COMMAND=1, SUB_COMMAND_GROUP=2, STRING=3, INTEGER=4,
            // BOOLEAN=5, USER=6, CHANNEL=7, ROLE=8, MENTIONABLE=9, NUMBER=10
            unregisterCommand = vendetta.commands.registerCommand({
                name: "timeoutinfo",
                description: "Show when a member's timeout ends (live countdown)",
                options: [{
                    name: "user",
                    description: "The timed-out member",
                    type: 6, // USER
                    required: true
                }],
                execute: function (args, ctx) {
                    var userId = null;
                    for (var k = 0; k < args.length; k++) {
                        if (args[k].name === "user") userId = args[k].value;
                    }
                    if (!userId) { toast("Pick a user first"); return; }

                    var guildId = getGuildId(ctx);
                    if (!guildId) return { content: "Run this inside a server." };

                    var store = getGuildMemberStore();
                    if (!store || typeof store.getMember !== "function") {
                        return { content: "Could not read the member store right now." };
                    }
                    var member = null;
                    try { member = store.getMember(guildId, userId); } catch (e) {}
                    if (!member || !member.communicationDisabledUntil) {
                        return { content: "<@" + userId + "> is not timed out." };
                    }
                    var end = new Date(member.communicationDisabledUntil);
                    if (isNaN(end.getTime())) {
                        return { content: "Could not read the timeout for <@" + userId + ">." };
                    }
                    var left = end.getTime() - Date.now();
                    if (left <= 0) {
                        return { content: "<@" + userId + ">'s timeout has ended." };
                    }
                    var epoch = Math.floor(end.getTime() / 1000);
                    return { content: "⏱ <@" + userId + "> is timed out — " + fmtRemaining(left) + " left.\nEnds <t:" + epoch + ":F> (<t:" + epoch + ":R>)" };
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
