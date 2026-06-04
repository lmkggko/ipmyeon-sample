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
    // 입점 권유 메일 탭(메일 내용 + 약국DB 시트) 불러오기
    loadMailTab();
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

  /* ---------------- 설정값 불러오기 ----------------
   * 관리자 인증 호출(adminLogin)로 현재 저장된 '구매 링크 + 알림 메일'을
   * 항상 불러와 칸에 채운다. (새로고침/재접속 시에도 빈칸이 되지 않도록)
   */
  function loadSettings() {
    Api.jsonp("adminLogin", { id: auth.id, pw: auth.pw })
      .then(function (res) {
        if (res && res.ok) {
          if (res.homepageUrl) document.getElementById("homepageUrl").value = res.homepageUrl;
          if (res.notifyEmail) document.getElementById("notifyEmail").value = res.notifyEmail;
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

  /* ======================================================================
   * 입점 권유 메일 탭
   * ==================================================================== */

  // 메일 내용 + 약국DB 시트 위치 + 예약상태 불러오기
  function loadMailTab() {
    Api.jsonp("getMailSettings", { id: auth.id, pw: auth.pw })
      .then(function (res) {
        if (res && res.ok) {
          document.getElementById("mailSubject").value = res.subject || "";
          document.getElementById("mailSubjectB").value = res.subjectB || "";
          document.getElementById("mailBody").value = res.body || "";
          document.getElementById("mailSenderName").value = res.senderName || "";
          document.getElementById("mailSenderInfo").value = res.senderInfo || "";
          document.getElementById("deliveryMode").checked = (res.deliveryMode === true);
          document.getElementById("dailyLimit").value = res.dailyLimit || 90;
          document.getElementById("pharmApiKey").value = res.pharmApiKey || "";
          renderScheduleStatus(res.schedule);

          // ★ 백엔드가 실제로 데이터를 쓰는 시트(ssId)로 화면을 맞춘다 (config.SHEET_ID와 달라도 자동 보정)
          var sid = res.ssId || CONFIG.SHEET_ID;
          var base = "https://docs.google.com/spreadsheets/d/" + sid;
          var gidPart = res.dbGid ? ("&gid=" + res.dbGid + "#gid=" + res.dbGid) : "";
          document.getElementById("mailSheetFrame").src =
            base + "/edit?rm=embedded&widget=true&headers=false" + gidPart;
          document.getElementById("openMailSheetBtn").href =
            base + "/edit" + (res.dbGid ? "#gid=" + res.dbGid : "");
          // 신청 데이터 탭 시트도 같은(백엔드) 시트로 맞춘다
          var sf = document.getElementById("sheetFrame");
          if (sf) sf.src = base + "/edit?rm=embedded&widget=true&headers=false";
          var osb = document.getElementById("openSheetBtn");
          if (osb) osb.href = base + "/edit";
        }
      })
      .catch(function () {});
  }

  // 예약/자동 발송 상태 표시 + '자동발송 켜기/끄기' 버튼 글자 갱신
  function renderScheduleStatus(s) {
    var box = document.getElementById("scheduleStatus");
    var autoBtnText = document.getElementById("autoDailyText");
    s = s || {};
    if (s.autoDailyHour) {
      box.textContent = "🔁 매일 약 " + s.autoDailyHour + "시에 '하루 분할 자동발송'이 켜져 있습니다.";
      autoBtnText.textContent = "🔁 하루 분할 자동발송 끄기";
    } else if (s.scheduledAt) {
      box.textContent = "📅 예약됨: " + s.scheduledAt.replace("T", " ") + " 에 1회 자동 발송 예정";
      autoBtnText.textContent = "🔁 하루 분할 자동발송 켜기";
    } else {
      box.textContent = "현재 예약/자동 발송 없음";
      autoBtnText.textContent = "🔁 하루 분할 자동발송 켜기";
    }
  }

  // 메일 탭을 처음 누를 때 '테스트 받을 메일'을 알림 메일로 미리 채움
  var mailTabChip = document.querySelector('.admin-tab[data-tab="mail"]');
  if (mailTabChip) {
    mailTabChip.addEventListener("click", function () {
      var te = document.getElementById("testEmail");
      if (te && !te.value) te.value = (document.getElementById("notifyEmail").value || "").split(",")[0].trim();
    });
  }

  /* ---------------- ① 메일 내용 저장 ---------------- */
  document.getElementById("saveMailBtn").addEventListener("click", function () {
    var subject = document.getElementById("mailSubject").value.trim();
    var subjectB = document.getElementById("mailSubjectB").value.trim();
    var body = document.getElementById("mailBody").value;
    var senderName = document.getElementById("mailSenderName").value.trim();
    var senderInfo = document.getElementById("mailSenderInfo").value;
    var msg = document.getElementById("mailMsg");
    msg.classList.add("hidden");
    if (!subject || !body.trim()) { showInline(msg, "msg-error", "메일 제목(A안)과 본문을 입력해주세요."); return; }

    var dailyLimit = parseInt(document.getElementById("dailyLimit").value, 10) || 90;
    var deliveryMode = document.getElementById("deliveryMode").checked;
    toggleSpin("saveMail", true);
    // 본문이 길 수 있어 POST 방식으로 전송
    Api.post("saveMailSettings", { id: auth.id, pw: auth.pw, subject: subject, subjectB: subjectB, body: body, senderName: senderName, senderInfo: senderInfo, deliveryMode: deliveryMode, dailyLimit: dailyLimit })
      .then(function (res) {
        toggleSpin("saveMail", false);
        if (res && res.ok) showInline(msg, "msg-success", "저장되었습니다. ✅");
        else showInline(msg, "msg-error", (res && res.error) ? res.error : "저장에 실패했습니다.");
      })
      .catch(function (err) { toggleSpin("saveMail", false); showInline(msg, "msg-error", err.message || "저장 중 오류"); });
  });

  /* ---------------- ② 엑셀 양식 내려받기 ---------------- */
  document.getElementById("downloadTemplateBtn").addEventListener("click", function () {
    var header = "약국명,약사/대표자명,이메일,연락처,주소,메모\n";
    var example = "○○약국,홍길동,test@example.com,010-0000-0000,서울시 ...,예시 메모\n";
    var csv = "﻿" + header + example; // ﻿ = UTF-8 BOM (엑셀에서 한글 깨짐 방지)
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "약국명단_양식.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  /* ---------------- ② 붙여넣기로 명단 추가 ---------------- */
  document.getElementById("pasteAddBtn").addEventListener("click", function () {
    var text = document.getElementById("pasteBox").value;
    var msg = document.getElementById("addMsg");
    msg.classList.add("hidden");
    if (!text.trim()) { showInline(msg, "msg-error", "붙여넣은 내용이 없습니다."); return; }
    var rows = stripHeaderRow(parsePasteText(text));
    if (!rows.length) { showInline(msg, "msg-error", "추가할 줄이 없습니다."); return; }
    submitRows(rows, "pasteAdd", msg, function () { document.getElementById("pasteBox").value = ""; });
  });

  /* ---------------- ② CSV 파일로 명단 추가 ---------------- */
  document.getElementById("csvAddBtn").addEventListener("click", function () {
    var fileInput = document.getElementById("csvFile");
    var msg = document.getElementById("addMsg");
    msg.classList.add("hidden");
    var file = fileInput.files[0];
    if (!file) { showInline(msg, "msg-error", "CSV 파일을 먼저 선택해주세요."); return; }

    readFileSmart(file, function (text) {
      var rows = parseCsvText(text);
      if (rows.length && rows[0].length) rows[0][0] = String(rows[0][0]).replace(/^﻿/, ""); // BOM 제거
      rows = stripHeaderRow(rows);
      if (!rows.length) { showInline(msg, "msg-error", "CSV에 추가할 줄이 없습니다."); return; }
      submitRows(rows, "csvAdd", msg, function () { fileInput.value = ""; });
    }, function () { showInline(msg, "msg-error", "파일을 읽지 못했습니다."); });
  });

  // 서버로 명단 전송 (붙여넣기/CSV 공통)
  function submitRows(rows, prefix, msg, onDone) {
    toggleSpin(prefix, true);
    Api.post("addPharmacies", { id: auth.id, pw: auth.pw, rows: rows })
      .then(function (res) {
        toggleSpin(prefix, false);
        if (res && res.ok) {
          showInline(msg, "msg-success", res.added + "곳을 추가했습니다. (현재 명단 " + res.total + "곳) ✅");
          if (onDone) onDone();
          refreshMailSheet();
        } else {
          showInline(msg, "msg-error", (res && res.error) ? res.error : "추가에 실패했습니다.");
        }
      })
      .catch(function (err) { toggleSpin(prefix, false); showInline(msg, "msg-error", err.message || "추가 중 오류"); });
  }

  /* ---------------- ③ 나에게 테스트 발송 ---------------- */
  document.getElementById("testSendBtn").addEventListener("click", function () {
    var to = document.getElementById("testEmail").value.trim();
    var msg = document.getElementById("sendMsg");
    msg.classList.add("hidden");
    if (!to || to.indexOf("@") === -1) { showInline(msg, "msg-error", "테스트 받을 메일 주소를 정확히 입력해주세요."); return; }

    toggleSpin("testSend", true);
    Api.jsonp("testSend", { id: auth.id, pw: auth.pw, testEmail: to })
      .then(function (res) {
        toggleSpin("testSend", false);
        if (res && res.ok) showInline(msg, "msg-success", to + " 로 테스트 메일을 보냈습니다. ✅ 메일함을 확인해보세요.");
        else showInline(msg, "msg-error", (res && res.error) ? res.error : "테스트 발송에 실패했습니다.");
      })
      .catch(function (err) { toggleSpin("testSend", false); showInline(msg, "msg-error", err.message || "테스트 발송 중 오류"); });
  });

  /* ---------------- ③ 선택한 약국에 발송 ---------------- */
  document.getElementById("sendBtn").addEventListener("click", function () {
    var msg = document.getElementById("sendMsg");
    msg.classList.add("hidden");
    var ab = document.getElementById("abCheck").checked;
    var limit = parseInt(document.getElementById("dailyLimit").value, 10) || 90;
    var q = ab
      ? "체크한 약국들에게 A/B 테스트(제목 A·B)로 발송합니다. 진행할까요?"
      : "체크한 약국들에게 입점 권유 메일을 발송합니다. 진행할까요?";
    if (!confirm(q + "\n( 먼저 '테스트 발송'으로 확인하셨나요? )")) return;

    toggleSpin("send", true);
    // 발송은 시간이 걸릴 수 있어 POST 방식(시간제한 없음)으로 전송
    Api.post("sendCampaign", { id: auth.id, pw: auth.pw, ab: ab, limit: limit })
      .then(function (res) {
        toggleSpin("send", false);
        if (res && res.ok) {
          var t = "발송 완료 — 성공 " + res.sent + " · 건너뜀 " + res.skipped + " · 실패 " + res.failed;
          if (res.remaining > 0) {
            t += "\n아직 안 보낸 체크가 " + res.remaining + "곳 남았습니다. [발송] 버튼을 다시 누르면 이어서 보냅니다.";
            t += " (오늘 남은 발송 한도 약 " + res.quotaLeft + "통)";
          }
          if (res.failed > 0 && res.errors && res.errors.length) t += "\n실패 예: " + res.errors.join(" / ");
          showInline(msg, (res.failed > 0 ? "msg-info" : "msg-success"), t);
          refreshMailSheet();
        } else {
          showInline(msg, "msg-error", (res && res.error) ? res.error : "발송에 실패했습니다.");
        }
      })
      .catch(function (err) { toggleSpin("send", false); showInline(msg, "msg-error", err.message || "발송 중 오류"); });
  });

  /* ---------------- ②-2 전국/시도 약국 자동 수집 (페이지 나눠받기 + 진행률) ---------------- */
  document.getElementById("collectBtn").addEventListener("click", function () {
    var msg = document.getElementById("collectMsg");
    msg.classList.add("hidden");
    var apiKey = document.getElementById("pharmApiKey").value.trim();
    var sido = document.getElementById("pharmSido").value;          // '전국' 또는 시도명
    var sigungu = document.getElementById("pharmSigungu").value.trim();
    var clearFirst = document.getElementById("collectClear").checked;
    if (!apiKey) { showInline(msg, "msg-error", "공공데이터 인증키를 먼저 입력해주세요. (사용설명서 참고)"); return; }

    var nationwide = (!sido || sido === "전국");
    var label = nationwide ? "전국" : (sido + (sigungu ? " " + sigungu : ""));
    if (clearFirst && !confirm("기존 약국DB 명단을 모두 지우고 '" + label + "' 약국으로 새로 채웁니다.\n진행할까요?")) return;

    toggleSpin("collect", true);
    showInline(msg, "msg-info", label + " 약국 수집 시작...");
    var totalAdded = 0;

    // 한 번 호출에 5,000곳씩 받고, 다 못 받으면 다음 페이지로 이어서 호출(끝까지)
    function step(page, doClear) {
      Api.post("collectPharmacies", {
        id: auth.id, pw: auth.pw, apiKey: apiKey,
        sido: sido, sigungu: sigungu, startPage: page, clearFirst: doClear
      })
        .then(function (res) {
          if (!res || !res.ok) {
            toggleSpin("collect", false);
            showInline(msg, "msg-error", (res && res.error) ? res.error : "수집에 실패했습니다.");
            refreshMailSheet();
            return;
          }
          totalAdded += (res.added || 0);
          var rt = res.regionTotal || 0;
          if (res.done || !res.nextPage) {
            toggleSpin("collect", false);
            showInline(msg, "msg-success",
              label + " 약국 수집 완료 — 총 " + totalAdded + "곳 추가" + (rt ? " (전체 약 " + rt + "곳)" : "") +
              " ✅\n현재 명단 " + res.total + "곳. ※ 이메일은 없으니 전화·우편 영업용으로 활용하세요.");
            refreshMailSheet();
          } else {
            showInline(msg, "msg-info",
              label + " 수집 중... " + totalAdded + (rt ? " / 약 " + rt : "") + "곳 받음 (계속 진행 중, 닫지 마세요)");
            step(res.nextPage, false);   // 비우기는 첫 호출에서만, 이후엔 이어붙이기
          }
        })
        .catch(function (err) { toggleSpin("collect", false); showInline(msg, "msg-error", err.message || "수집 중 오류"); });
    }
    step(1, clearFirst);
  });

  /* ---------------- ③ 예약 발송 ---------------- */
  document.getElementById("scheduleBtn").addEventListener("click", function () {
    var msg = document.getElementById("scheduleMsg");
    msg.classList.add("hidden");
    var at = document.getElementById("scheduleAt").value;
    if (!at) { showInline(msg, "msg-error", "예약할 시각을 먼저 선택해주세요."); return; }
    if (!confirm("지금 체크된 약국들을 " + at.replace("T", " ") + " 에 자동 발송하도록 예약합니다.\n(그때까지 체크 상태가 유지되어야 합니다.) 진행할까요?")) return;

    var dl = parseInt(document.getElementById("dailyLimit").value, 10) || 90;
    toggleSpin("schedule", true);
    Api.jsonp("scheduleCampaign", { id: auth.id, pw: auth.pw, scheduleAt: at, dailyLimit: dl })
      .then(function (res) {
        toggleSpin("schedule", false);
        if (res && res.ok) { showInline(msg, "msg-success", "예약되었습니다. ✅ " + at.replace("T", " ")); refreshSchedule(); }
        else showInline(msg, "msg-error", (res && res.error) ? res.error : "예약에 실패했습니다.");
      })
      .catch(function (err) { toggleSpin("schedule", false); showInline(msg, "msg-error", err.message || "예약 중 오류"); });
  });

  /* ---------------- ③ 하루 분할 자동발송 켜기/끄기 ---------------- */
  document.getElementById("autoDailyBtn").addEventListener("click", function () {
    var msg = document.getElementById("scheduleMsg");
    msg.classList.add("hidden");
    // 현재 켜져 있으면 끄기, 아니면 켜기 (버튼 글자로 판단)
    var isOn = document.getElementById("autoDailyText").textContent.indexOf("끄기") !== -1;
    var enable = !isOn;
    var hour = 10;
    if (enable) {
      var ans = prompt("매일 몇 시에 자동 발송할까요? (0~23 시, 기본 10)", "10");
      if (ans === null) return;
      var h = parseInt(ans, 10);
      if (!isNaN(h) && h >= 0 && h <= 23) hour = h;
    }
    var dl2 = parseInt(document.getElementById("dailyLimit").value, 10) || 90;
    toggleSpin("autoDaily", true);
    Api.jsonp("setAutoDaily", { id: auth.id, pw: auth.pw, enable: enable, hour: hour, dailyLimit: dl2 })
      .then(function (res) {
        toggleSpin("autoDaily", false);
        if (res && res.ok) {
          showInline(msg, "msg-success", enable ? ("매일 약 " + hour + "시 자동 분할 발송을 켰습니다. ✅") : "자동 분할 발송을 껐습니다.");
          refreshSchedule();
        } else showInline(msg, "msg-error", (res && res.error) ? res.error : "설정에 실패했습니다.");
      })
      .catch(function (err) { toggleSpin("autoDaily", false); showInline(msg, "msg-error", err.message || "설정 중 오류"); });
  });

  /* ---------------- ③ 예약·자동 모두 취소 ---------------- */
  document.getElementById("cancelScheduleBtn").addEventListener("click", function () {
    var msg = document.getElementById("scheduleMsg");
    msg.classList.add("hidden");
    if (!confirm("예약 발송과 자동 분할 발송을 모두 취소할까요?")) return;
    Api.jsonp("cancelSchedules", { id: auth.id, pw: auth.pw })
      .then(function (res) {
        if (res && res.ok) { showInline(msg, "msg-success", "예약·자동 발송을 모두 취소했습니다."); refreshSchedule(); }
        else showInline(msg, "msg-error", (res && res.error) ? res.error : "취소에 실패했습니다.");
      })
      .catch(function (err) { showInline(msg, "msg-error", err.message || "취소 중 오류"); });
  });

  // 예약 상태만 다시 불러와 표시
  function refreshSchedule() {
    Api.jsonp("getMailSettings", { id: auth.id, pw: auth.pw })
      .then(function (res) { if (res && res.ok) renderScheduleStatus(res.schedule); })
      .catch(function () {});
  }

  /* ---------------- 답장(회신) 지금 확인 ---------------- */
  document.getElementById("replyBtn").addEventListener("click", function () {
    var msg = document.getElementById("toolsMsg");
    msg.classList.add("hidden");
    toggleSpin("reply", true);
    Api.post("collectReplies", { id: auth.id, pw: auth.pw })
      .then(function (res) {
        toggleSpin("reply", false);
        if (res && res.ok) { showInline(msg, "msg-success", "답장 확인 완료 — '회신'으로 새로 표시한 곳: " + res.marked + "곳. ✅"); refreshMailSheet(); }
        else showInline(msg, "msg-error", (res && res.error) ? res.error : "답장 확인에 실패했습니다.");
      })
      .catch(function (err) { toggleSpin("reply", false); showInline(msg, "msg-error", err.message || "답장 확인 중 오류"); });
  });

  /* ---------------- A/B 읽음률 보기 ---------------- */
  document.getElementById("abStatsBtn").addEventListener("click", function () {
    var msg = document.getElementById("toolsMsg");
    msg.classList.add("hidden");
    toggleSpin("abStats", true);
    Api.jsonp("getAbStats", { id: auth.id, pw: auth.pw })
      .then(function (res) {
        toggleSpin("abStats", false);
        if (res && res.ok) {
          var a = res.stats.A, b = res.stats.B;
          if (!a.sent && !b.sent) { showInline(msg, "msg-info", "아직 A/B 테스트로 보낸 메일이 없습니다."); return; }
          var t = "📊 A/B 읽음률\n" +
            "A안: 발송 " + a.sent + " · 읽음 " + a.read + " · 읽음률 " + a.rate + "%\n" +
            "B안: 발송 " + b.sent + " · 읽음 " + b.read + " · 읽음률 " + b.rate + "%\n" +
            "→ " + (a.rate === b.rate ? "두 제목이 비슷합니다." : (a.rate > b.rate ? "A안 제목이 더 좋아 보입니다." : "B안 제목이 더 좋아 보입니다.")) + " (참고용)";
          showInline(msg, "msg-info", t);
        } else showInline(msg, "msg-error", (res && res.error) ? res.error : "결과를 불러오지 못했습니다.");
      })
      .catch(function (err) { toggleSpin("abStats", false); showInline(msg, "msg-error", err.message || "조회 중 오류"); });
  });

  // 약국DB 시트 화면 새로고침
  function refreshMailSheet() {
    var f = document.getElementById("mailSheetFrame");
    if (f && f.src) { var s = f.src; f.src = s; }
  }

  /* ---------------- ④ 약국DB 시트 전체화면 ---------------- */
  var mailFsBtn = document.getElementById("mailFullscreenBtn");
  var mailBox = document.getElementById("mailSheetBox");
  if (mailFsBtn && mailBox) {
    mailFsBtn.addEventListener("click", function () {
      var on = mailBox.classList.toggle("fullscreen");
      mailFsBtn.textContent = on ? "✕ 전체화면 닫기" : "🔳 시트 전체화면";
      document.body.style.overflow = on ? "hidden" : "";
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && mailBox.classList.contains("fullscreen")) {
        mailBox.classList.remove("fullscreen");
        mailFsBtn.textContent = "🔳 시트 전체화면";
        document.body.style.overflow = "";
      }
    });
  }

  /* ---------- 명단 텍스트 분석 도우미 (붙여넣기 / CSV) ---------- */

  // 엑셀에서 복사한 텍스트(탭 구분)를 줄·칸 배열로
  function parsePasteText(text) {
    var lines = String(text).replace(/\r/g, "").split("\n");
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var cells = lines[i].split("\t");
      if (cells.length === 1) cells = parseCsvText(lines[i])[0] || [lines[i]]; // 탭이 없으면 콤마로
      rows.push(cells);
    }
    return rows;
  }

  // CSV 텍스트 분석 (따옴표·콤마 처리)
  function parseCsvText(text) {
    text = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var rows = [], cur = [], field = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { cur.push(field); field = ""; }
        else if (ch === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
        else field += ch;
      }
    }
    if (field.length || cur.length) { cur.push(field); rows.push(cur); }
    // 완전히 빈 줄 제거
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); });
  }

  // 맨 윗줄이 제목 줄(약국명/이메일 포함)이면 제거
  function stripHeaderRow(rows) {
    if (!rows.length) return rows;
    var first = rows[0].join(" ");
    if (first.indexOf("약국명") !== -1 || first.indexOf("이메일") !== -1) return rows.slice(1);
    return rows;
  }

  // 파일을 UTF-8로 읽되, 한글이 깨지면 euc-kr(한국 엑셀 기본)로 재시도
  function readFileSmart(file, onText, onErr) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var buf = reader.result;
        var txt = new TextDecoder("utf-8").decode(buf);
        if (txt.indexOf("�") !== -1) {
          try { txt = new TextDecoder("euc-kr").decode(buf); } catch (e) {}
        }
        onText(txt);
      } catch (e) { if (onErr) onErr(e); }
    };
    reader.onerror = function () { if (onErr) onErr(); };
    reader.readAsArrayBuffer(file);
  }

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
