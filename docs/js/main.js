/* MAISON MEISTER — main interactions */
(function () {
  "use strict";

  var AUTH_KEY = "meister_salon_pass";
  var INVITE_CODE = "MEISTER"; // 데모 초대 코드

  /* ── 네비게이션: 스크롤 시 배경 ─────────── */
  var nav = document.getElementById("nav");
  function onScroll() {
    nav.classList.toggle("nav--solid", window.scrollY > 40);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* 이미 로그인 상태면 네비게이션에 살롱 링크 노출 */
  var salonLink = document.getElementById("navSalonLink");
  if (salonLink && sessionStorage.getItem(AUTH_KEY)) {
    salonLink.hidden = false;
    salonLink.href = "salon.html";
  }

  /* ── 이미지 폴백: 로드 실패 시 우아한 플레이스홀더 ── */
  window.applyImageFallbacks = function (root) {
    (root || document).querySelectorAll("img[data-fallback]").forEach(function (img) {
      img.addEventListener("error", function handler() {
        img.removeEventListener("error", handler);
        var ph = document.createElement("div");
        ph.className = "img-fallback";
        ph.textContent = "◆ " + img.getAttribute("data-fallback");
        img.replaceWith(ph);
      });
      if (img.complete && img.naturalWidth === 0 && img.src) {
        img.dispatchEvent(new Event("error"));
      }
    });
  };
  window.applyImageFallbacks(document);

  /* ── 히어로: 켄번즈 슬라이드쇼 (항상 동작하는 베이스) ── */
  var slidesWrap = document.getElementById("heroSlides");
  if (slidesWrap) {
    var HERO_IMAGES = [
      "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1920&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=1920&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=1920&q=80&auto=format&fit=crop"
    ];
    var slides = HERO_IMAGES.map(function (url) {
      var el = document.createElement("div");
      el.className = "hero__slide";
      el.style.backgroundImage =
        "linear-gradient(160deg, rgba(20,16,10,.35), rgba(10,9,7,.5)), url('" + url + "')";
      slidesWrap.appendChild(el);
      return el;
    });
    var current = 0;
    function showSlide(i) {
      slides.forEach(function (s, idx) {
        s.classList.toggle("hero__slide--active", idx === i);
      });
    }
    showSlide(0);
    setInterval(function () {
      current = (current + 1) % slides.length;
      showSlide(current);
    }, 9000);
  }

  /* ── 히어로: 실제 영상 시도 (성공 시 슬라이드 위로 페이드 인) ── */
  var video = document.getElementById("heroVideo");
  if (video) {
    var VIDEO_CANDIDATES = [
      // 럭셔리/주얼리 계열 무료 스톡 영상 후보 — 순서대로 시도
      "https://videos.pexels.com/video-files/6263243/6263243-hd_1920_1080_25fps.mp4",
      "https://videos.pexels.com/video-files/5462759/5462759-hd_1920_1080_25fps.mp4",
      "https://videos.pexels.com/video-files/7263914/7263914-hd_1920_1080_25fps.mp4",
      "https://assets.mixkit.co/videos/preview/mixkit-woman-modeling-a-short-black-dress-and-jewelry-42904-large.mp4"
    ];
    var vi = 0;
    function tryVideo() {
      if (vi >= VIDEO_CANDIDATES.length) return; // 전부 실패 → 슬라이드쇼 유지
      video.src = VIDEO_CANDIDATES[vi++];
      video.load();
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
    video.addEventListener("error", tryVideo);
    video.addEventListener("playing", function () {
      video.classList.add("hero__video--live");
    });
    tryVideo();
  }

  /* ── 히어로: 다이아몬드 스파클 캔버스 ────── */
  var canvas = document.getElementById("sparkleCanvas");
  if (canvas && window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
    var ctx = canvas.getContext("2d");
    var sparks = [];
    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    window.addEventListener("resize", resize);
    resize();
    function spawn() {
      sparks.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.8,
        r: 0.6 + Math.random() * 1.6,
        life: 0,
        max: 90 + Math.random() * 120
      });
    }
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (sparks.length < 26 && Math.random() < 0.3) spawn();
      sparks = sparks.filter(function (s) { return s.life < s.max; });
      sparks.forEach(function (s) {
        s.life++;
        var t = s.life / s.max;
        var a = Math.sin(t * Math.PI); // fade in-out
        ctx.save();
        ctx.globalAlpha = a * 0.85;
        ctx.translate(s.x, s.y);
        // 십자 광채
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, s.r * 7);
        g.addColorStop(0, "rgba(255,244,214,.95)");
        g.addColorStop(1, "rgba(255,244,214,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, s.r * 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,250,230," + a * 0.9 + ")";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-s.r * 6, 0); ctx.lineTo(s.r * 6, 0);
        ctx.moveTo(0, -s.r * 6); ctx.lineTo(0, s.r * 6);
        ctx.stroke();
        ctx.restore();
      });
      requestAnimationFrame(tick);
    }
    tick();
  }

  /* ── 히든 버튼 → 프라이빗 살롱 로그인 ────── */
  var gem = document.getElementById("hiddenGem");
  var modal = document.getElementById("salonModal");
  if (gem && modal) {
    var form = document.getElementById("salonForm");
    var nameInput = document.getElementById("salonName");
    var codeInput = document.getElementById("salonCode");
    var errEl = document.getElementById("salonError");

    function openModal() {
      // 이미 입장 이력이 있으면 바로 살롱으로
      if (sessionStorage.getItem(AUTH_KEY)) {
        location.href = "salon.html";
        return;
      }
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      nameInput.focus();
    }
    function closeModal() {
      modal.hidden = true;
      document.body.style.overflow = "";
      errEl.hidden = true;
    }

    gem.addEventListener("click", openModal);
    document.getElementById("salonClose").addEventListener("click", closeModal);
    document.getElementById("salonBackdrop").addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) closeModal();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = codeInput.value.trim().toUpperCase();
      if (code === INVITE_CODE) {
        sessionStorage.setItem(AUTH_KEY, JSON.stringify({
          name: nameInput.value.trim() || "게스트",
          at: new Date().toISOString()
        }));
        location.href = "salon.html";
      } else {
        errEl.hidden = false;
        codeInput.value = "";
        codeInput.focus();
        var box = modal.querySelector(".salon-modal__box");
        box.style.animation = "none";
        void box.offsetWidth; // reflow로 애니메이션 재시작
        box.style.animation = "";
      }
    });
  }
})();
