/* =========================================================================
 * admin.js — 관리자 페이지의 동작
 * - 로그인 (구글 쪽에서 아이디/비번 확인)
 * - 신청 데이터(구글 시트) 임베드
 * - 소개서 이미지 업로드 / 삭제
 * - 구매 링크 변경
 * - 관리자 아이디/비밀번호 변경
 * -------------------------------------------------------------------------
 * 보안 메모: 로그인 성공 시 아이디/비번을 sessionStorage에 잠깐 저장해
 * 이후 작업(저장/업로드/삭제)할 때 함께 보냅니다. 서버(구글)가 매번
 * 다시 확인하므로 화면만 통과해서는 데이터를 바꿀 수 없습니다.
 * ========================================================================= */

document.addEventListener("DOMContentLoaded", function () {

  var auth = { id: "", pw: "" };

  // 새로고침해도 로그인 유지 (브라우저 탭이 열려있는 동안)
  try {
    var saved = JSON.parse(sessionStorage.getItem("admin_auth") || "null");
    if (saved && saved.id) { auth = saved; showDashboard(); }
  } catch (e) {}

  /* ---------------- 로그인 ---------------- */
  var loginBtn = document.getElementById("loginBtn");
  loginBtn.addEventListener("click", doLogin);
  document.getElementById("loginPw").addEventListener("keydown", function (e) {
    if (e.key === "Enter") doLogin();
  });

  function doLogin() {
    var id = document.getElementById("loginId").value.trim();
    var pw = document.getElementById("loginPw").value;
    var msg = document.getElementById("loginMsg");
    msg.classList.add("hidden");

    if (!id || !pw) { showInline(msg, "msg-error", "아이디와 비밀번호를 입력해주세요."); return; }

    toggleSpin("login", true);
    Api.jsonp("adminLogin", { id: id, pw: pw })
      .then(function (res) {
        toggleSpin("login", false);
        if (res && res.ok) {
          auth = { id: id, pw: pw };
          try { sessionStorage.setItem("admin_auth", JSON.stringify(auth)); } catch (e) {}
          // 로그인 응답에 담겨온 현재 설정값 미리 채우기
          if (res.homepageUrl) document.getElementById("homepageUrl").value = res.homepageUrl;
          if (res.notifyEmail) document.getElementById("notifyEmail").value = res.notifyEmail;
          showDashboard();
        } else {
          showInline(msg, "msg-error", "아이디 또는 비밀번호가 올바르지 않습니다.");
        }
      })
      .catch(function (err) {
        toggleSpin("login", false);
        showInline(msg, "msg-error", err.message || "로그인 중 오류가 발생했습니다.");
      });
  }

  function showDashboard() {
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");

    // 구글 시트 임베드
    var frame = document.getElementById("sheetFrame");
    frame.src = "https://docs.google.com/spreadsheets/d/" + CONFIG.SHEET_ID +
      "/edit?rm=embedded&widget=true&headers=false";
    document.getElementById("openSheetBtn").href =
      "https://docs.google.com/spreadsheets/d/" + CONFIG.SHEET_ID + "/edit";

    // 현재 설정값(링크, 소개서) 불러오기
    loadSettings();
  }

  /* ---------------- 탭 전환 ---------------- */
  var tabs = document.querySelectorAll(".admin-tab");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.add("hidden"); });
      document.getElementById("tab-" + tab.dataset.tab).classList.remove("hidden");
    });
  });

  /* ---------------- 시트 전체화면 ---------------- */
  var fsBtn = document.getElementById("fullscreenBtn");
  var dataPanel = document.getElementById("tab-data");
  function exitFullscreen() {
    dataPanel.classList.remove("fullscreen");
    fsBtn.textContent = "🔳 시트 전체화면";
    document.body.style.overflow = "";
  }
  if (fsBtn && dataPanel) {
    fsBtn.addEventListener("click", function () {
      var on = dataPanel.classList.toggle("fullscreen");
      fsBtn.textContent = on ? "✕ 전체화면 닫기" : "🔳 시트 전체화면";
      document.body.style.overflow = on ? "hidden" : "";
    });
    // 키보드 Esc 로도 전체화면 닫기
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dataPanel.classList.contains("fullscreen")) exitFullscreen();
    });
  }

  /* ---------------- 설정값 불러오기 ---------------- */
  function loadSettings() {
    Api.jsonp("getSettings")
      .then(function (res) {
        if (res) {
          if (res.homepageUrl) document.getElementById("homepageUrl").value = res.homepageUrl;
        }
      })
      .catch(function () {});
    loadIntroList();
  }

  /* ---------------- 소개서 이미지 목록 ---------------- */
  function loadIntroList() {
    var listEl = document.getElementById("introList");
    listEl.innerHTML = '<div class="card-desc">불러오는 중...</div>';
    Api.jsonp("getIntro")
      .then(function (res) {
        var images = (res && res.images) ? res.images : [];
        renderIntroList(images);
      })
      .catch(function () { listEl.innerHTML = '<div class="card-desc">목록을 불러오지 못했습니다.</div>'; });
  }

  function renderIntroList(images) {
    var listEl = document.getElementById("introList");
    if (!images.length) {
      listEl.innerHTML = '<div class="card-desc">아직 등록된 이미지가 없습니다.</div>';
      return;
    }
    listEl.innerHTML = "";
    images.forEach(function (img, i) {
      var row = document.createElement("div");
      row.className = "intro-admin-item";
      row.innerHTML =
        '<img src="' + img.url + '" alt="소개서 ' + (i + 1) + '" />' +
        '<div class="name">' + (i + 1) + "번째 · " + escapeHtml(img.name || "이미지") + "</div>";
      var del = document.createElement("button");
      del.className = "btn btn-danger btn-sm";
      del.textContent = "삭제";
      del.addEventListener("click", function () { deleteIntro(img.id, del); });
      row.appendChild(del);
      listEl.appendChild(row);
    });
  }

  /* ---------------- 이미지 업로드 ---------------- */
  document.getElementById("uploadBtn").addEventListener("click", function () {
    var fileInput = document.getElementById("introFile");
    var msg = document.getElementById("uploadMsg");
    msg.classList.add("hidden");

    var file = fileInput.files[0];
    if (!file) { showInline(msg, "msg-error", "올릴 이미지를 먼저 선택해주세요."); return; }
    if (file.size > 10 * 1024 * 1024) { showInline(msg, "msg-error", "이미지가 너무 큽니다. (10MB 이하 권장)"); return; }

    toggleSpin("upload", true);
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = String(reader.result).split(",")[1]; // "data:image/...;base64,XXXX" 에서 뒷부분
      Api.post("uploadIntro", {
        id: auth.id, pw: auth.pw,
        fileName: file.name, mimeType: file.type, base64: base64,
      })
        .then(function (res) {
          toggleSpin("upload", false);
          if (res && res.ok) {
            showInline(msg, "msg-success", "이미지가 등록되었습니다. ✅");
            fileInput.value = "";
            renderIntroList(res.images || []);
          } else {
            showInline(msg, "msg-error", (res && res.error) ? res.error : "업로드에 실패했습니다.");
          }
        })
        .catch(function (err) {
          toggleSpin("upload", false);
          showInline(msg, "msg-error", err.message || "업로드 중 오류가 발생했습니다.");
        });
    };
    reader.onerror = function () { toggleSpin("upload", false); showInline(msg, "msg-error", "파일을 읽지 못했습니다."); };
    reader.readAsDataURL(file);
  });

  /* ---------------- 이미지 삭제 ---------------- */
  function deleteIntro(fileId, btn) {
    if (!confirm("이 소개서 이미지를 삭제할까요?")) return;
    btn.disabled = true; btn.textContent = "삭제 중...";
    Api.jsonp("deleteIntro", { id: auth.id, pw: auth.pw, fileId: fileId })
      .then(function (res) {
        if (res && res.ok) renderIntroList(res.images || []);
        else { alert((res && res.error) ? res.error : "삭제에 실패했습니다."); btn.disabled = false; btn.textContent = "삭제"; }
      })
      .catch(function (err) { alert(err.message || "삭제 중 오류"); btn.disabled = false; btn.textContent = "삭제"; });
  }

  /* ---------------- 구매 링크 저장 ---------------- */
  document.getElementById("saveLinkBtn").addEventListener("click", function () {
    var url = document.getElementById("homepageUrl").value.trim();
    var email = document.getElementById("notifyEmail").value.trim();
    var msg = document.getElementById("linkMsg");
    msg.classList.add("hidden");
    if (!/^https?:\/\//.test(url)) { showInline(msg, "msg-error", "구매 페이지 주소는 http:// 또는 https:// 로 시작해야 합니다."); return; }
    if (!email || email.indexOf("@") === -1) { showInline(msg, "msg-error", "알림 받을 메일 주소를 정확히 입력해주세요."); return; }

    toggleSpin("saveLink", true);
    Api.jsonp("saveSettings", { id: auth.id, pw: auth.pw, homepageUrl: url, notifyEmail: email })
      .then(function (res) {
        toggleSpin("saveLink", false);
        if (res && res.ok) showInline(msg, "msg-success", "저장되었습니다. ✅");
        else showInline(msg, "msg-error", (res && res.error) ? res.error : "저장에 실패했습니다.");
      })
      .catch(function (err) { toggleSpin("saveLink", false); showInline(msg, "msg-error", err.message || "저장 중 오류"); });
  });

  /* ---------------- 비밀번호/아이디 변경 ---------------- */
  document.getElementById("savePwBtn").addEventListener("click", function () {
    var newId = document.getElementById("newId").value.trim();
    var newPw = document.getElementById("newPw").value;
    var msg = document.getElementById("pwMsg");
    msg.classList.add("hidden");
    if (!newId && !newPw) { showInline(msg, "msg-error", "바꿀 아이디 또는 비밀번호를 입력해주세요."); return; }

    toggleSpin("savePw", true);
    Api.jsonp("changePassword", { id: auth.id, pw: auth.pw, newId: newId, newPw: newPw })
      .then(function (res) {
        toggleSpin("savePw", false);
        if (res && res.ok) {
          // 바뀐 정보로 현재 로그인 정보 갱신
          if (newId) auth.id = newId;
          if (newPw) auth.pw = newPw;
          try { sessionStorage.setItem("admin_auth", JSON.stringify(auth)); } catch (e) {}
          document.getElementById("newId").value = "";
          document.getElementById("newPw").value = "";
          showInline(msg, "msg-success", "변경되었습니다. ✅ 다음 로그인부터 적용됩니다.");
        } else {
          showInline(msg, "msg-error", (res && res.error) ? res.error : "변경에 실패했습니다.");
        }
      })
      .catch(function (err) { toggleSpin("savePw", false); showInline(msg, "msg-error", err.message || "변경 중 오류"); });
  });

  /* ---------------- 로그아웃 ---------------- */
  document.getElementById("logoutBtn").addEventListener("click", function () {
    try { sessionStorage.removeItem("admin_auth"); } catch (e) {}
    auth = { id: "", pw: "" };
    location.reload();
  });

  /* ---------------- 보조 함수 ---------------- */
  function toggleSpin(prefix, on) {
    var btn = document.getElementById(prefix + "Btn");
    var spin = document.getElementById(prefix + "Spin");
    if (btn) btn.disabled = on;
    if (spin) spin.classList.toggle("hidden", !on);
  }
  function showInline(el, cls, text) {
    el.className = "msg " + cls;
    el.textContent = text;
    el.classList.remove("hidden");
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

});
