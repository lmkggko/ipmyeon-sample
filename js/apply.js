/* =========================================================================
 * apply.js — 신청 사이트(메인)의 동작
 * - 상단 '홈페이지 보기' 버튼 링크 설정
 * - 사업자번호 / 연락처 자동 하이픈
 * - 다음(카카오) 우편번호 검색
 * - 입력값 검증
 * - 신청 제출 → 구글 시트에 저장
 * ========================================================================= */

document.addEventListener("DOMContentLoaded", function () {

  /* ----- 0. 브랜드 이름 적용 ----- */
  if (CONFIG.BRAND_NAME) document.getElementById("brandName").textContent = CONFIG.BRAND_NAME;
  if (CONFIG.BRAND_SUB) document.getElementById("brandSub").textContent = CONFIG.BRAND_SUB;

  /* ----- 1. 상단 '홈페이지 보기' 버튼 링크 ----- */
  var homeBtn = document.getElementById("btnHomepage");
  homeBtn.href = CONFIG.DEFAULT_PURCHASE_URL || "#";
  // 관리자가 설정한 최신 링크가 있으면 그것으로 교체
  if (Api.isConfigured()) {
    Api.jsonp("getSettings")
      .then(function (res) {
        if (res && res.homepageUrl) homeBtn.href = res.homepageUrl;
      })
      .catch(function () { /* 못 불러와도 기본 링크 사용 */ });
  }

  /* ----- 2. 입력 자동 서식 ----- */
  var bizEl = document.getElementById("f_biz");
  bizEl.addEventListener("input", function () {
    var v = bizEl.value.replace(/[^0-9]/g, "").slice(0, 10);
    var out = v;
    if (v.length > 5) out = v.slice(0, 3) + "-" + v.slice(3, 5) + "-" + v.slice(5);
    else if (v.length > 3) out = v.slice(0, 3) + "-" + v.slice(3);
    bizEl.value = out;
  });

  var phoneEl = document.getElementById("f_phone");
  phoneEl.addEventListener("input", function () {
    var v = phoneEl.value.replace(/[^0-9]/g, "").slice(0, 11);
    var out = v;
    if (v.length > 7) out = v.slice(0, 3) + "-" + v.slice(3, 7) + "-" + v.slice(7);
    else if (v.length > 3) out = v.slice(0, 3) + "-" + v.slice(3);
    phoneEl.value = out;
  });

  /* ----- 3. '대표자와 동일' 체크 → 신청인 자동 입력 ----- */
  var ownerEl = document.getElementById("f_owner");
  var applicantEl = document.getElementById("f_applicant");
  var sameOwner = document.getElementById("sameAsOwner");
  function syncApplicant() {
    if (sameOwner.checked) {
      applicantEl.value = ownerEl.value;
      applicantEl.setAttribute("readonly", "readonly");
    } else {
      applicantEl.removeAttribute("readonly");
    }
  }
  sameOwner.addEventListener("change", syncApplicant);
  ownerEl.addEventListener("input", function () { if (sameOwner.checked) applicantEl.value = ownerEl.value; });

  /* ----- 4. 우편번호 검색 ----- */
  // 사업장 소재지 검색 결과를 저장해두었다가 '동일' 체크 시 재사용
  var bizAddrData = { zip: "", addr: "" };

  document.getElementById("btnBizAddr").addEventListener("click", function () {
    openPostcode(function (data) {
      bizAddrData.zip = data.zonecode;
      bizAddrData.addr = data.address;
      document.getElementById("f_bizaddr").value = "(" + data.zonecode + ") " + data.address;
      document.getElementById("f_bizaddr_detail").focus();
      // 이미 '동일'이 체크돼 있으면 샘플주소도 같이 갱신
      if (document.getElementById("sameAsBizAddr").checked) copyBizToSample();
    });
  });

  document.getElementById("btnSampleAddr").addEventListener("click", function () {
    // '동일' 체크 상태면 풀고 직접 검색
    document.getElementById("sameAsBizAddr").checked = false;
    setSampleAddrReadonly(true);
    openPostcode(function (data) {
      document.getElementById("f_zip").value = data.zonecode;
      document.getElementById("f_addr").value = data.address;
      document.getElementById("f_addr_detail").focus();
    });
  });

  function openPostcode(onComplete) {
    if (typeof daum === "undefined" || !daum.Postcode) {
      alert("주소 검색 기능을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.");
      return;
    }
    new daum.Postcode({
      oncomplete: function (data) {
        var addr = data.roadAddress || data.jibunAddress || data.address;
        onComplete({ zonecode: data.zonecode, address: addr });
      },
    }).open();
  }

  /* ----- 5. '샘플 주소 = 사업장과 동일' 체크 ----- */
  var sameBizAddr = document.getElementById("sameAsBizAddr");
  sameBizAddr.addEventListener("change", function () {
    if (sameBizAddr.checked) {
      if (!bizAddrData.addr) {
        alert("먼저 위에서 '사업장 소재지'를 주소 검색으로 입력해주세요.");
        sameBizAddr.checked = false;
        return;
      }
      copyBizToSample();
    } else {
      document.getElementById("f_zip").value = "";
      document.getElementById("f_addr").value = "";
    }
  });
  function copyBizToSample() {
    document.getElementById("f_zip").value = bizAddrData.zip;
    document.getElementById("f_addr").value = bizAddrData.addr;
  }
  function setSampleAddrReadonly(ro) {
    // 주소/우편번호는 항상 읽기전용(검색으로만 입력), 상세주소는 직접 입력
  }

  /* ----- 6. 제출 ----- */
  var form = document.getElementById("applyForm");
  var msgEl = document.getElementById("formMsg");
  var submitBtn = document.getElementById("submitBtn");
  var submitText = document.getElementById("submitText");
  var submitSpin = document.getElementById("submitSpin");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    hideMsg();

    var payload = collectPayload();
    var error = validate(payload);
    if (error) { showMsg(error); return; }

    setLoading(true);
    Api.jsonp("apply", { payload: JSON.stringify(payload) })
      .then(function (res) {
        setLoading(false);
        if (res && res.ok) {
          showDone(res.duplicate);
        } else {
          showMsg((res && res.error) ? res.error : "신청 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
        }
      })
      .catch(function (err) {
        setLoading(false);
        showMsg(err.message || "신청 전송에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.");
      });
  });

  function collectPayload() {
    var val = function (id) { return (document.getElementById(id).value || "").trim(); };
    return {
      "약국 상호 명": val("f_pharmacy"),
      "사업자 번호": val("f_biz"),
      "사업장 소재지": joinAddr(val("f_bizaddr"), val("f_bizaddr_detail")),
      "약사 면허번호": val("f_license"),
      "대표자 성함": val("f_owner"),
      "신청인": val("f_applicant"),
      "연락처": val("f_phone"),
      "이메일": val("f_email"),
      "샘플 받을 우편번호": val("f_zip"),
      "샘플 받을 주소": val("f_addr"),
      "샘플 받을 상세주소": val("f_addr_detail"),
    };
  }
  function joinAddr(base, detail) {
    return detail ? (base + " " + detail) : base;
  }

  function validate(p) {
    if (!p["약국 상호 명"]) return "약국 상호명을 입력해주세요.";
    var biz = p["사업자 번호"].replace(/[^0-9]/g, "");
    if (biz.length !== 10) return "사업자 번호를 정확히 입력해주세요. (숫자 10자리)";
    if (!document.getElementById("f_bizaddr").value.trim()) return "사업장 소재지를 주소 검색으로 입력해주세요.";
    if (!p["약사 면허번호"]) return "약사 면허번호를 입력해주세요.";
    if (!p["대표자 성함"]) return "대표자 성함을 입력해주세요.";
    if (!p["신청인"]) return "신청인을 입력해주세요.";
    var phone = p["연락처"].replace(/[^0-9]/g, "");
    if (phone.length < 9) return "연락처를 정확히 입력해주세요.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p["이메일"])) return "이메일 주소를 정확히 입력해주세요.";
    if (!p["샘플 받을 우편번호"] || !p["샘플 받을 주소"]) return "샘플 받을 주소를 주소 검색으로 입력해주세요.";
    if (!document.getElementById("f_agree").checked) return "개인정보 수집·이용에 동의해주세요.";
    return null;
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitText.textContent = on ? "신청 중..." : "샘플 신청하기";
    submitSpin.classList.toggle("hidden", !on);
  }
  function showMsg(text) {
    msgEl.textContent = text;
    msgEl.classList.remove("hidden");
    msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function hideMsg() { msgEl.classList.add("hidden"); }

  function showDone(isDuplicate) {
    form.classList.add("hidden");
    document.querySelector(".top-buttons").style.display = "none";
    var done = document.getElementById("doneScreen");
    if (isDuplicate) {
      document.getElementById("doneMsg").innerHTML =
        "소중한 신청 감사합니다.<br />이미 같은 사업자번호로 신청 내역이 있어 함께 확인 후 보내드리겠습니다. 🌙";
    }
    done.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.getElementById("againBtn").addEventListener("click", function () {
    form.reset();
    document.getElementById("f_bizaddr").value = "";
    document.getElementById("f_zip").value = "";
    document.getElementById("f_addr").value = "";
    bizAddrData = { zip: "", addr: "" };
    document.getElementById("doneScreen").classList.add("hidden");
    form.classList.remove("hidden");
    document.querySelector(".top-buttons").style.display = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

});
