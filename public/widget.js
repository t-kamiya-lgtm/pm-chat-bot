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

  var button = document.createElement("button");
  button.textContent = "チャットで相談する";
  button.setAttribute("aria-label", "チャットボットを開く");
  Object.assign(button.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "2147483000",
    padding: "12px 20px",
    borderRadius: "999px",
    border: "none",
    background: "#171717",
    color: "#fff",
    fontSize: "14px",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
  });

  var container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    right: "20px",
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
  });

  var iframe = document.createElement("iframe");
  iframe.src = origin + (scenarioSlug ? "/widget/" + encodeURIComponent(scenarioSlug) : "/widget");
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
    button.textContent = isOpen ? "閉じる" : "チャットで相談する";
  }

  button.addEventListener("click", function () {
    setOpen(!isOpen);
  });
  closeButton.addEventListener("click", function () {
    setOpen(false);
  });

  document.body.appendChild(container);
  document.body.appendChild(button);
})();
