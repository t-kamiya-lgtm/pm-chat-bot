(function () {
  // チャットボット決済システム 埋め込みスニペット
  // スマレジEC・リピートの「デザインPC/デザインSP」等にこのスクリプトタグを1行追加するだけで、
  // ポップアップ型のチャットウィジェットが表示される。
  // 例: <script src="https://<デプロイ先ドメイン>/widget.js" data-widget-origin="https://<デプロイ先ドメイン>"></script>

  var currentScript = document.currentScript;
  var origin =
    (currentScript && currentScript.getAttribute("data-widget-origin")) ||
    new URL(currentScript.src).origin;
  // ブランド・商品専用のシナリオを表示したい場合は、シナリオ管理画面で発行したURLの識別子を指定する
  // 例: <script src="..." data-scenario="brand-a"></script>
  var scenarioSlug = currentScript && currentScript.getAttribute("data-scenario");
  // 管理画面の「PCプレビュー」用: 専用URL(スラッグ)未発行の下書きシナリオも、IDで直接指定して確認できる
  var scenarioId = currentScript && currentScript.getAttribute("data-scenario-id");
  // プレビューモード。決済まで進めても実際の注文・課金・メール送信は発生しない
  // 例: <script src="..." data-preview="1"></script>
  var previewMode = (currentScript && currentScript.getAttribute("data-preview")) === "1";

  // 広告のリンク先URL(このページ自体のURL)に付与されたUTMパラメータを、そのままウィジェットに引き継ぐ。
  // これにより実績ダッシュボードで、どの広告経由のアクセス・購入かを集計できる。
  var hostParams = new URLSearchParams(window.location.search);
  var utmParams = new URLSearchParams();
  var hasUtm = false;
  ["utm_source", "utm_medium", "utm_campaign"].forEach(function (key) {
    var value = hostParams.get(key);
    if (value) {
      utmParams.set(key, value);
      hasUtm = true;
    }
  });

  var iframeSrc = scenarioId
    ? origin + "/widget?scenarioId=" + encodeURIComponent(scenarioId) + "&preview=1"
    : origin + (scenarioSlug ? "/widget/" + encodeURIComponent(scenarioSlug) : "/widget");
  if (!scenarioId && previewMode) {
    iframeSrc += "?preview=1";
  }
  if (hasUtm) {
    iframeSrc += (iframeSrc.indexOf("?") > -1 ? "&" : "?") + utmParams.toString();
  }

  // 購入完了時のコンバージョンタグ(Google広告のコンバージョンタグ等)。
  // iframe内で実行すると広告クリック情報(gclid等)を持つこのページの文脈にならないため、
  // チャットウィジェット(iframe)からのpostMessageを受けて、このページ側で実行する。
  var conversionTag = null;

  // 個別のコンバージョンタグが未設定の場合、このページに元々設置されている広告計測基盤
  // (Google Tag Manager / gtag.js / Metaピクセル)へ、標準の購入イベントを自動で送信する。
  // 個別のコンバージョンID(AW-XXXXX/YYYY等)までは分からないため、各計測基盤が標準で
  // 認識するイベント名(purchase / Purchase)で送るのがもっとも汎用的な引き継ぎ方法となる。
  function fireAutoFallback(amount, orderId) {
    if (window.dataLayer && typeof window.dataLayer.push === "function") {
      window.dataLayer.push({
        event: "purchase",
        ecommerce: { transaction_id: orderId, value: amount, currency: "JPY" },
      });
    }
    if (typeof window.gtag === "function") {
      window.gtag("event", "purchase", { transaction_id: orderId, value: amount, currency: "JPY" });
    }
    if (typeof window.fbq === "function") {
      window.fbq("track", "Purchase", { value: amount, currency: "JPY" });
    }
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    var data = event.data;
    if (!data || data.source !== "pm-chatbot" || data.type !== "conversion") return;

    if (!conversionTag) {
      fireAutoFallback(data.amount, data.orderId);
      return;
    }

    var filled = conversionTag
      .split("{{amount}}").join(String(data.amount))
      .split("{{orderId}}").join(String(data.orderId));
    var container = document.createElement("div");
    container.innerHTML = filled;
    Array.prototype.slice.call(container.childNodes).forEach(function (node) {
      if (node.nodeType === 1 && node.tagName === "SCRIPT") {
        var script = document.createElement("script");
        Array.prototype.slice.call(node.attributes).forEach(function (attr) {
          script.setAttribute(attr.name, attr.value);
        });
        script.textContent = node.textContent;
        document.body.appendChild(script);
      } else {
        document.body.appendChild(node);
      }
    });
  });

  function render(config) {
    config = config || {};
    var side = config.popup_position === "bottom-left" ? "left" : "right";
    var iconUrl = config.popup_icon_url;

    var button = document.createElement("button");
    button.setAttribute("aria-label", "チャットボットを開く");
    var buttonBaseStyle = {
      position: "fixed",
      bottom: "20px",
      zIndex: "2147483000",
      border: "none",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    };
    buttonBaseStyle[side] = "20px";

    if (iconUrl) {
      Object.assign(buttonBaseStyle, {
        width: "60px",
        height: "60px",
        borderRadius: "50%",
        padding: "0",
        overflow: "hidden",
        background: "#fff",
      });
      Object.assign(button.style, buttonBaseStyle);
      var img = document.createElement("img");
      img.src = iconUrl;
      img.alt = "チャットで相談する";
      Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover" });
      button.appendChild(img);
    } else {
      Object.assign(buttonBaseStyle, {
        padding: "12px 20px",
        borderRadius: "999px",
        background: "#171717",
        color: "#fff",
        fontSize: "14px",
      });
      Object.assign(button.style, buttonBaseStyle);
      button.textContent = "チャットで相談する";
    }

    var container = document.createElement("div");
    var containerStyle = {
      position: "fixed",
      bottom: "80px",
      width: "380px",
      maxWidth: "92vw",
      height: "600px",
      maxHeight: "80vh",
      zIndex: "2147483000",
      display: "none",
      borderRadius: "16px",
      overflow: "hidden",
      boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
    };
    containerStyle[side] = "20px";
    Object.assign(container.style, containerStyle);

    var iframe = document.createElement("iframe");
    iframe.src = iframeSrc;
    iframe.setAttribute("allow", "payment");
    Object.assign(iframe.style, { width: "100%", height: "100%", border: "none" });
    container.appendChild(iframe);

    // ポップアップ右上に常時表示する閉じる(×)ボタン
    var closeButton = document.createElement("button");
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "チャットを閉じる");
    Object.assign(closeButton.style, {
      position: "absolute",
      top: "8px",
      right: "8px",
      zIndex: "2147483001",
      width: "28px",
      height: "28px",
      lineHeight: "26px",
      borderRadius: "999px",
      border: "none",
      background: "rgba(23,23,23,0.7)",
      color: "#fff",
      fontSize: "18px",
      cursor: "pointer",
      padding: "0",
    });
    container.appendChild(closeButton);

    var isOpen = false;
    function setOpen(next) {
      isOpen = next;
      container.style.display = isOpen ? "block" : "none";
      if (!iconUrl) button.textContent = isOpen ? "閉じる" : "チャットで相談する";
      button.setAttribute("aria-label", isOpen ? "チャットボットを閉じる" : "チャットボットを開く");
    }

    button.addEventListener("click", function () {
      setOpen(!isOpen);
    });
    closeButton.addEventListener("click", function () {
      setOpen(false);
    });

    document.body.appendChild(container);
    document.body.appendChild(button);

    // LP内の任意の要素(画像・ボタン等)に data-pm-chatbot-open 属性を付けておくと、
    // クリックでこのポップアップを開ける。既存のフローティングボタンに加えて使う想定。
    // 例: <img src="..." data-pm-chatbot-open>
    document.addEventListener("click", function (event) {
      var trigger = event.target.closest && event.target.closest("[data-pm-chatbot-open]");
      if (!trigger) return;
      event.preventDefault();
      setOpen(true);
    });

    // onclick属性やJSから直接開閉したい場合向けの公開API。
    // 例: <img src="..." onclick="window.PMChatbot.open()">
    window.PMChatbot = {
      open: function () {
        setOpen(true);
      },
      close: function () {
        setOpen(false);
      },
      toggle: function () {
        setOpen(!isOpen);
      },
    };
  }

  var configUrl =
    origin +
    "/api/widget/scenario" +
    (scenarioId
      ? "?id=" + encodeURIComponent(scenarioId) + "&preview=1"
      : scenarioSlug
        ? "?slug=" + encodeURIComponent(scenarioSlug)
        : "");
  fetch(configUrl)
    .then(function (res) {
      return res.ok ? res.json() : {};
    })
    .then(function (body) {
      conversionTag = (body && body.scenario && body.scenario.conversion_tag) || null;
      render(body && body.scenario);
    })
    .catch(function () {
      render({});
    });
})();
