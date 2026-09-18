// Browser widget for LiveAvatar live sessions. Served as plain JS from
// GET /v1/liveavatar/widget.js (see routes/liveavatar.js) and included via
// <script src="…/widget.js" data-job-id="…" data-contact-id="…"></script>
// (see routes/hosted.js).
//
// Uses the real, confirmed @heygen/liveavatar-web-sdk@0.0.18 API — pulled
// via `npm pack` and read from the shipped compiled source, since
// docs.liveavatar.com blocks automated fetches. Loaded from esm.sh at
// runtime (browser-only dependency; no reason to bundle it into the
// worker). Pinned to the exact version we verified — bump deliberately.
//
// Defense-in-depth cost cap: even though the mint request asks the server
// for `max_duration_s` (see lib/liveavatar.js — field name unconfirmed),
// this widget ALSO hard-stops the session client-side after that many
// seconds regardless of whether the server honors it.
export function renderWidgetJs(env) {
  const BASE_URL = JSON.stringify(env.BASE_URL || "");
  return `(function () {
  var BASE_URL = ${BASE_URL};
  var SDK_URL = "https://esm.sh/@heygen/liveavatar-web-sdk@0.0.18";
  var scriptEl = document.currentScript;
  var jobId = (scriptEl && scriptEl.dataset.jobId) || null;
  var contactId = (scriptEl && scriptEl.dataset.contactId) || null;

  var session = null;
  var sessionRowId = null;
  var startedAt = null;
  var hardTimeout = null;
  var ended = true; // true until a session is actively starting

  function el(tag, props) {
    var e = document.createElement(tag);
    for (var k in props) e[k] = props[k];
    return e;
  }

  function buildUi() {
    var btn = el("button", {
      id: "la-talk-btn",
      textContent: "\\uD83D\\uDCAC Talk live now",
      style: "position:fixed;bottom:20px;right:20px;z-index:9999;background:#ff6a00;color:#fff;border:0;border-radius:999px;padding:14px 22px;font:600 14px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer;",
    });
    var panel = el("div", {
      id: "la-panel",
      style: "position:fixed;bottom:20px;right:20px;z-index:9999;width:320px;max-width:calc(100vw - 40px);background:#0a0a0a;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.5);display:none;font:14px -apple-system,BlinkMacSystemFont,sans-serif;color:#fff;",
    });
    var video = el("video", { id: "la-video", autoplay: true, playsInline: true, muted: false });
    video.style.cssText = "width:100%;aspect-ratio:9/16;background:#000;display:block;";
    var status = el("div", { id: "la-status", textContent: "Connecting\\u2026" });
    status.style.cssText = "padding:10px 14px;color:#aaa;font-size:12px;";
    var hangup = el("button", { id: "la-hangup", textContent: "End call" });
    hangup.style.cssText = "width:100%;background:#222;color:#fff;border:0;padding:12px;cursor:pointer;font-weight:600;";

    panel.appendChild(video);
    panel.appendChild(status);
    panel.appendChild(hangup);
    document.body.appendChild(btn);
    document.body.appendChild(panel);

    btn.addEventListener("click", function () {
      btn.style.display = "none";
      panel.style.display = "block";
      startSession(video, status);
    });
    hangup.addEventListener("click", function () { endSession("client_hangup"); });
  }

  function startSession(video, status) {
    ended = false;
    fetch(BASE_URL + "/v1/liveavatar/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, contact_id: contactId }),
    })
      .then(function (resp) { return resp.json().then(function (data) { return { resp: resp, data: data }; }); })
      .then(function (r) {
        if (!r.resp.ok || !r.data.ok) {
          status.textContent = (r.data && r.data.message) || "Live chat is unavailable right now.";
          ended = true;
          return null;
        }
        sessionRowId = r.data.session_row_id;
        var maxDurationS = r.data.max_duration_s;
        return import(/* webpackIgnore: true */ SDK_URL).then(function (mod) {
          var LiveAvatarSession = mod.LiveAvatarSession;
          var SessionEvent = mod.SessionEvent;

          session = new LiveAvatarSession(r.data.session_token, { voiceChat: true });
          session.on(SessionEvent.SESSION_STREAM_READY, function () {
            session.attach(video);
            status.textContent = "Live";
            startedAt = Date.now();
          });
          session.on(SessionEvent.SESSION_STATE_CHANGED, function (state) {
            status.textContent = String(state).toLowerCase();
          });
          session.on(SessionEvent.SESSION_DISCONNECTED, function (reason) {
            endSession(reason);
          });

          return session.start().then(function () {
            if (maxDurationS) {
              hardTimeout = setTimeout(function () { endSession("max_duration_reached"); }, maxDurationS * 1000);
            }
          });
        });
      })
      .catch(function (e) {
        status.textContent = "Couldn't connect \\u2014 try again later.";
        ended = true;
        console.error("LiveAvatar widget error:", e);
      });
  }

  function endSession(reason) {
    if (ended) return;
    ended = true;

    if (hardTimeout) { clearTimeout(hardTimeout); hardTimeout = null; }
    var durationSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : null;

    if (session) {
      session.stop().catch(function () {});
      session = null;
    }

    if (sessionRowId) {
      var payload = JSON.stringify({ duration_seconds: durationSeconds, reason: reason });
      var url = BASE_URL + "/v1/liveavatar/session/" + sessionRowId + "/end";
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(function () {});
      }
    }
    sessionRowId = null;
    startedAt = null;

    var panelEl = document.getElementById("la-panel");
    var btnEl = document.getElementById("la-talk-btn");
    if (panelEl) panelEl.style.display = "none";
    if (btnEl) btnEl.style.display = "block";
  }

  function init() {
    buildUi();
    window.addEventListener("beforeunload", function () { if (session) endSession("page_unload"); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
`;
}
