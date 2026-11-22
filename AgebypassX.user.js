// ==UserScript==
// @name         AgebypassX v3
// @namespace    https://github.com/Saganaki22/AgebypassX
// @version      3.0.0
// @description  Age/sensitive-media bypass for X.com
// @author       Saganaki22 (updated by AsuRyd)
// @license      MIT
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://greasyfork.org/scripts/547244-agebypassx-tampermonkey-edition/code/AgebypassX.user.js
// @downloadURL  https://greasyfork.org/scripts/547244-agebypassx-tampermonkey-edition/code/AgebypassX.user.js
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '3.0.0';

    const stats = {
        navBlocked: 0, locationBlock: 0, fetchBlocked: 0, flagsPatched: 0, errors: []
    };

    function logErr(where, e) {
        stats.errors.push({ where, msg: (e && e.message) ? e.message : String(e) });
        if (stats.errors.length > 20) stats.errors.shift();
        console.warn('[AgeX]', where, e);
    }

    function isAgeVerifUrl(url) {
        if (!url) return false;
        const s = String(url);
        return s.includes('/i/age_verification') || s.includes('/age_gate') || s.includes('age_verification_gate');
    }

    // nav redirect block — primary gate on current build
    try {
        const _push = history.pushState.bind(history);
        const _replace = history.replaceState.bind(history);
        function guard(fn, label) {
            return function (state, title, url) {
                if (isAgeVerifUrl(url)) { stats.navBlocked++; return; }
                return fn(state, title, url);
            };
        }
        history.pushState    = guard(_push,    'pushState');
        history.replaceState = guard(_replace, 'replaceState');
    } catch (e) { logErr('history hook', e); }

    // location setter fallback
    try {
        const _loc = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true, enumerable: true,
            get: () => _loc,
            set(val) {
                if (isAgeVerifUrl(val)) { stats.locationBlock++; return; }
                try {
                    Object.defineProperty(window, 'location', { configurable: true, enumerable: true, writable: true, value: _loc });
                    window.location = val;
                } catch (e2) {}
            }
        });
    } catch (e) { logErr('location hook', e); }

    // fetch response scrub
    try {
        const _fetch = window.fetch;
        window.fetch = function (...args) {
            return _fetch.apply(this, args).then(function (response) {
                const url = (args[0] && (args[0].url || String(args[0]))) || '';
                if (!url.includes('x.com') && !url.includes('twitter.com') && !url.includes('api.')) return response;
                const ct = response.headers.get('content-type') || '';
                if (!ct.includes('application/json')) return response;
                return response.clone().text().then(function (text) {
                    if (!text.includes('age_verification') && !text.includes('age_gate')) return response;
                    try {
                        const data = JSON.parse(text);
                        let mutated = false;
                        function scrub(obj) {
                            if (!obj || typeof obj !== 'object') return;
                            for (const k of Object.keys(obj)) {
                                if ((k === 'redirect_url' || k === 'redirectUrl' || k === 'next_url') && isAgeVerifUrl(obj[k])) {
                                    obj[k] = null; mutated = true;
                                }
                                if (typeof obj[k] === 'object') scrub(obj[k]);
                            }
                        }
                        scrub(data);
                        if (mutated) {
                            stats.fetchBlocked++;
                            return new Response(JSON.stringify(data), {
                                status: response.status, statusText: response.statusText, headers: response.headers
                            });
                        }
                    } catch (e2) {}
                    return response;
                }).catch(() => response);
            }).catch(e => { throw e; });
        };
    } catch (e) { logErr('fetch hook', e); }

    // feature flag patching — covers older builds and future regressions
    const AGE_FLAGS = {
        'rweb_age_assurance_flow_enabled':             false,
        'age_verification_gate_enabled':               false,
        'sensitive_tweet_warnings_enabled':            false,
        'sensitive_media_settings_enabled':            true,
        'grok_settings_age_restriction_enabled':       false,
        'rweb_mvr_blurred_media_interstitial_enabled': false,
        'rweb_age_verification_enabled':               false,
        'age_assurance_enabled':                       false,
        'nsfw_user_settings_enabled':                  true,
        'sensitive_media_interstitial_enabled':        false,
    };

    function patchFeatures(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (const [k, desired] of Object.entries(AGE_FLAGS)) {
            if (!(k in obj)) continue;
            try {
                const cur = obj[k];
                if (cur && typeof cur === 'object' && 'value' in cur) {
                    if (cur.value !== desired) { cur.value = desired; stats.flagsPatched++; }
                } else {
                    if (cur !== desired) { obj[k] = desired; stats.flagsPatched++; }
                }
            } catch (e2) {}
        }
    }

    function tryPatch(data) {
        if (!data || typeof data !== 'object') return;
        try {
            const fsp = data.featureSwitchPayload;
            if (fsp && fsp.features) patchFeatures(fsp.features);
        } catch (e) { logErr('tryPatch', e); }
    }

    for (const key of ['__INITIAL_DATA__', '__INITIAL_STATE__']) {
        try {
            let val = window[key];
            if (val && typeof val === 'object') tryPatch(val);
            Object.defineProperty(window, key, {
                configurable: true, enumerable: true,
                get: () => val,
                set(v) { val = v; if (v && typeof v === 'object') tryPatch(v); }
            });
        } catch (e) { logErr(key + ' hook', e); }
    }

    try {
        const _parse = JSON.parse;
        const FLAG_RE = new RegExp(Object.keys(AGE_FLAGS).join('|') + '|age_verification|age_gate');
        JSON.parse = function (text, reviver) {
            const r = _parse.apply(this, arguments);
            if (r && typeof r === 'object' && typeof text === 'string' && FLAG_RE.test(text)) {
                try { patchFeatures(r); } catch (e) {}
            }
            return r;
        };
        try { JSON.parse.toString = () => _parse.toString(); } catch (e) {}
    } catch (e) { logErr('JSON.parse hook', e); }

    // indicator dot
    const CSS = `#agex-dot{position:fixed;top:20px;right:20px;width:14px;height:14px;border-radius:50%;background:#00e676;border:2px solid #fff;box-shadow:0 0 8px #00e676;z-index:9999999;cursor:pointer;transition:background .2s,box-shadow .2s}#agex-dot[data-err="1"]{background:#ff3d3d;box-shadow:0 0 8px #ff3d3d}#agex-dot[data-hidden="1"]{display:none}`;

    let dotHidden = false;
    try { dotHidden = localStorage.getItem('agex-hidden') === '1'; } catch (e) {}

    function mountDot() {
        if (!document.body) return;
        const head = document.head || document.body;
        if (!document.getElementById('agex-style')) {
            const s = document.createElement('style');
            s.id = 'agex-style'; s.textContent = CSS;
            head.appendChild(s);
        }
        let dot = document.getElementById('agex-dot');
        if (!dot) {
            dot = document.createElement('div');
            dot.id = 'agex-dot';
            dot.title = 'AgeX v' + VERSION + ' — click for diagnostics';
            dot.addEventListener('click', function () {
                console.group('[AgeX] v' + VERSION);
                console.log('nav redirects blocked:   ', stats.navBlocked);
                console.log('location assigns blocked:', stats.locationBlock);
                console.log('fetch responses patched: ', stats.fetchBlocked);
                console.log('feature flags patched:   ', stats.flagsPatched);
                stats.errors.length ? console.warn('errors:', stats.errors) : console.log('no errors');
                console.groupEnd();
            });
            document.body.appendChild(dot);
        }
        dot.dataset.err    = stats.errors.length > 0 ? '1' : '0';
        dot.dataset.hidden = dotHidden ? '1' : '0';
    }

    document.addEventListener('keydown', function (e) {
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'Period') {
            e.preventDefault();
            dotHidden = !dotHidden;
            try { localStorage.setItem('agex-hidden', dotHidden ? '1' : '0'); } catch (e2) {}
            const dot = document.getElementById('agex-dot');
            if (dot) dot.dataset.hidden = dotHidden ? '1' : '0';
        }
    }, true);

    if (document.body) {
        mountDot();
    } else {
        document.addEventListener('DOMContentLoaded', mountDot, { once: true });
        const w = new MutationObserver(function () {
            if (document.body) { mountDot(); w.disconnect(); }
        });
        w.observe(document.documentElement || document, { childList: true });
    }

    console.log('[AgeX] v' + VERSION + ' loaded');

})();
