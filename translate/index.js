(function (s, n, t, i, u, d, f) {
/* Kettu plugin (Vendetta format): Translate Messages — v1.0.0
 *
 * Translate a message in place — Arabic to English or English to Arabic.
 * Two ways to use it:
 *   1. Long-press a message -> "Translate". The translation appears in an
 *      alert with a Copy button (tap again to re-translate / dismiss).
 *   2. Slash command: /translate <text> — posts the translation in chat.
 * Direction is automatic: text with Arabic letters goes to English,
 * everything else goes to Arabic.
 *
 * Translation endpoints (ported from the Discord Plus v1.1
 * translateMessages.js plugin, same free no-key endpoints):
 *   1. Google Translate free gtx endpoint (primary)
 *   2. MyMemory (fallback)
 * Only the message text is sent to the translation service — nothing else.
 *
 * Plugin format (verified from Kettu source + the working c10udburst
 * delete-embeds plugin): this file evaluates to an object with
 * { onLoad, onUnload }. The message-sheet row is added by patching
 * ActionSheet openLazy for "MessageLongPressActionSheet" and pushing a
 * FormRow into the ButtonRow group — the exact pattern delete-embeds uses. */
    "use strict";

    var patches = [];
    var unregisterCommand = null;

    function toast(msg) {
        try { t.toasts.open({ content: String(msg) }); } catch (e) {}
    }

    function copyText(text) {
        try { t.clipboard.setString(text); } catch (e) {}
    }

    function hasArabic(text) {
        return /[\u0600-\u06FF]/.test(text);
    }

    function googleTranslate(text, target) {
        var url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
            target + "&dt=t&q=" + encodeURIComponent(text);
        return fetch(url).then(function (r) { return r.json(); }).then(function (data) {
            if (!data || !data[0]) throw new Error("bad response");
            var out = data[0].map(function (part) { return part[0] || ""; }).join("");
            if (!out) throw new Error("empty translation");
            return out;
        });
    }

    function myMemoryTranslate(text, source, target) {
        var url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) +
            "&langpair=" + source + "|" + target;
        return fetch(url).then(function (r) { return r.json(); }).then(function (data) {
            var translated = data && data.responseData && data.responseData.translatedText;
            if (!translated || translated === "QUERY LENGTH LIMIT EXCEEDED") throw new Error("bad response");
            return translated;
        });
    }

    // Auto direction: Arabic -> English, anything else -> Arabic.
    function translate(text) {
        var toAr = !hasArabic(text);
        var target = toAr ? "ar" : "en";
        var source = toAr ? "en" : "ar";
        return googleTranslate(text, target).catch(function () {
            return myMemoryTranslate(text, source, target);
        });
    }

    function showTranslation(original, translated) {
        try {
            vendetta.ui.alerts.showConfirmationAlert({
                title: "Translation — ترجمة",
                content: translated,
                confirmText: "Copy / نسخ",
                onConfirm: function () { copyText(translated); },
                cancelText: "Close / إغلاق"
            });
        } catch (e) {
            toast(translated);
        }
    }

    function translateMessage(message) {
        var text = message && message.content;
        if (!text) { toast("No text to translate"); return; }
        toast("Translating… / جارٍ الترجمة…");
        translate(text).then(function (out) {
            showTranslation(text, out);
        }).catch(function () {
            toast("Translation failed — check connection");
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
            if (!message.content) return;

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
                        label: "Translate / ترجمة",
                        onPress: function () {
                            ActionSheet.hideActionSheet();
                            translateMessage(message);
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
                name: "translate",
                description: "Translate text — Arabic to English, or English to Arabic (auto)",
                options: [{
                    name: "text",
                    description: "Text to translate",
                    type: 3, // STRING
                    required: true
                }],
                execute: function (args) {
                    var text = null;
                    for (var k = 0; k < args.length; k++) {
                        if (args[k].name === "text") text = args[k].value;
                    }
                    if (!text) { toast("No text to translate"); return; }
                    return translate(text).then(function (out) {
                        return { content: out };
                    }).catch(function () {
                        toast("Translation failed — check connection");
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
