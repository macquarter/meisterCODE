/* 작품 상세 + 컨시어지 예약 (에어비앤비 스타일) */
(function () {
  "use strict";

  var API_URL = (window.MEISTER_CONFIG || {}).API_URL || "";
  var pass = {};
  try { pass = JSON.parse(sessionStorage.getItem("meister_salon_pass")) || {}; } catch (e) {}

  /* ── 상품 로드 ───────────────────────────── */
  var id = new URLSearchParams(location.search).get("id");
  var p = MEISTER_PRODUCTS.find(function (x) { return x.id === id; }) || MEISTER_PRODUCTS[0];

  document.title = p.name + " | MAISON MEISTER";
  document.getElementById("pName").textContent = p.name;
  document.getElementById("pRating").textContent = p.rating.toFixed(2);
  document.getElementById("pReviewCount").textContent = "후기 " + p.reviewsCount + "개";
  document.getElementById("pCat").textContent = p.cat;
  document.getElementById("pDesc").textContent = p.desc;
  document.getElementById("bPrice").innerHTML =
    meisterWon(p.price) + "<small>작품가</small>";
  document.getElementById("bRating").textContent =
    p.rating.toFixed(2) + " · 후기 " + p.reviewsCount + "개";
  document.getElementById("bTotal").textContent = meisterWon(p.price);
  document.getElementById("reviewsTitle").textContent =
    "★ " + p.rating.toFixed(2) + " · 후기 " + p.reviewsCount + "개";

  var gallery = document.getElementById("pGallery");
  p.images.forEach(function (src, i) {
    var fig = document.createElement("figure");
    fig.innerHTML = '<img alt="' + p.name + ' 이미지 ' + (i + 1) +
      '" src="' + src + '" data-fallback="' + p.name + '">';
    gallery.appendChild(fig);
  });

  var specs = document.getElementById("pSpecs");
  p.specs.forEach(function (s) {
    var li = document.createElement("li");
    li.innerHTML = "<strong>" + s[0] + "</strong>" + s[1];
    specs.appendChild(li);
  });

  var reviews = document.getElementById("pReviews");
  p.reviews.forEach(function (r) {
    var div = document.createElement("div");
    div.className = "review";
    var stars = "★★★★★".slice(0, Math.round(r.stars)) ;
    div.innerHTML =
      '<div class="review__head">' +
      '<div class="review__avatar">' + r.name.charAt(0) + "</div>" +
      "<div><strong>" + r.name + "</strong><em>" + r.date + "</em></div>" +
      "</div>" +
      '<div class="review__stars">' + stars + "</div>" +
      "<p>" + r.text + "</p>";
    reviews.appendChild(div);
  });

  /* 이미지 폴백 */
  document.querySelectorAll("img[data-fallback]").forEach(function (img) {
    img.addEventListener("error", function handler() {
      img.removeEventListener("error", handler);
      var ph = document.createElement("div");
      ph.className = "img-fallback";
      ph.textContent = "◆ " + img.getAttribute("data-fallback");
      img.replaceWith(ph);
    });
  });

  /* ── 캘린더 ─────────────────────────────── */
  var calEl = document.getElementById("calendar");
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth();
  var selectedDate = null;

  var DOW = ["일", "월", "화", "수", "목", "금", "토"];

  function renderCal() {
    var first = new Date(viewYear, viewMonth, 1);
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var isCurrentMonth =
      viewYear === today.getFullYear() && viewMonth === today.getMonth();

    var html =
      '<div class="cal__head">' +
      '<button type="button" id="calPrev" ' + (isCurrentMonth ? "disabled" : "") + ">‹</button>" +
      "<strong>" + viewYear + "년 " + (viewMonth + 1) + "월</strong>" +
      '<button type="button" id="calNext">›</button>' +
      "</div>" +
      '<div class="cal__grid">';
    DOW.forEach(function (d) { html += '<span class="cal__dow">' + d + "</span>"; });
    for (var i = 0; i < first.getDay(); i++) html += "<span></span>";
    for (var d = 1; d <= daysInMonth; d++) {
      var date = new Date(viewYear, viewMonth, d);
      var past = date < today;
      var iso = viewYear + "-" + String(viewMonth + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var sel = selectedDate === iso ? " cal__day--selected" : "";
      html +=
        '<button type="button" class="cal__day' + sel + '" data-date="' + iso + '" ' +
        (past ? "disabled" : "") + ">" + d + "</button>";
    }
    html += "</div>";
    calEl.innerHTML = html;

    calEl.querySelector("#calPrev").addEventListener("click", function () {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCal();
    });
    calEl.querySelector("#calNext").addEventListener("click", function () {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCal();
    });
    calEl.querySelectorAll(".cal__day:not(:disabled)").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedDate = btn.getAttribute("data-date");
        renderCal();
      });
    });
  }
  renderCal();

  /* ── 시간 슬롯 ───────────────────────────── */
  var slotsEl = document.getElementById("slots");
  var SLOTS = ["11:00", "13:00", "15:00", "17:00", "19:00"];
  var selectedSlot = null;
  SLOTS.forEach(function (t) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "slot";
    b.textContent = t;
    b.addEventListener("click", function () {
      selectedSlot = t;
      slotsEl.querySelectorAll(".slot").forEach(function (s) {
        s.classList.toggle("slot--selected", s === b);
      });
    });
    slotsEl.appendChild(b);
  });

  /* ── 예약 제출 ───────────────────────────── */
  var SERVICE_LABEL = {
    boutique: "프라이빗 뷰잉 — 청담 부티크",
    home: "자택 프라이빗 뷰잉",
    bespoke: "맞춤 제작 · 비스포크 상담"
  };

  document.getElementById("bookingForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!selectedDate) { alert("날짜를 선택해 주세요."); return; }
    if (!selectedSlot) { alert("시간을 선택해 주세요."); return; }
    var phone = document.getElementById("bPhone").value.trim();
    if (!phone) { alert("연락처를 입력해 주세요."); return; }

    var service = document.getElementById("bService").value;
    var booking = {
      action: "booking",
      product: p.name,
      service: service,
      serviceLabel: SERVICE_LABEL[service],
      date: selectedDate,
      time: selectedSlot,
      guests: document.getElementById("bGuests").value,
      phone: phone,
      memo: document.getElementById("bMemo").value.trim(),
      name: pass.name || "",
      code: pass.code || "",
      createdAt: new Date().toISOString()
    };
    try {
      var list = JSON.parse(localStorage.getItem("meister_bookings") || "[]");
      list.push(booking);
      localStorage.setItem("meister_bookings", JSON.stringify(list));
    } catch (err) {}

    /* 백엔드 연결 시: 구글 시트에 저장 + 운영자 이메일 발송 후 확정 화면 */
    if (API_URL) {
      var cta = document.querySelector(".booking__cta");
      cta.disabled = true;
      cta.textContent = "접수 중…";
      fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(booking)
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok) showConfirm(booking);
          else {
            alert(res.error || "예약 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
            cta.disabled = false;
            cta.textContent = "컨시어지 예약하기";
          }
        })
        .catch(function () {
          alert("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
          cta.disabled = false;
          cta.textContent = "컨시어지 예약하기";
        });
      return;
    }

    /* 데모 모드: 브라우저 저장만 하고 확정 화면 */
    showConfirm(booking);
  });

  function showConfirm(booking) {
    var card = document.getElementById("bookingCard");
    card.innerHTML =
      '<div class="booking__confirm">' +
      '<div class="gem">◆</div>' +
      "<h4>예약이 접수되었습니다</h4>" +
      '<div class="detail">' +
      p.name + "<br>" +
      SERVICE_LABEL[booking.service] + "<br>" +
      booking.date + " · " + booking.time + " · " + booking.guests + "명" +
      "</div>" +
      "<p>전담 컨시어지가 24시간 이내에 연락드려<br>세부 일정을 확정해 드립니다.</p>" +
      '<a class="btn btn--gold booking__cta" href="salon.html" style="margin-top:1.4rem">살롱으로 돌아가기</a>' +
      "</div>";
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
})();
